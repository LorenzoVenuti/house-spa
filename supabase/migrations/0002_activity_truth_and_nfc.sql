-- Preserve completion history, allow staff invalidation, and make NFC scans authoritative actions.

alter table public.task_completions
  drop constraint if exists task_completions_task_id_key;

alter table public.task_completions
  add column if not exists reward_milli integer,
  add column if not exists source text not null default 'app',
  add column if not exists status text not null default 'valid',
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidated_by_member_id uuid references public.members(id),
  add column if not exists invalidation_reason text;

update public.task_completions completion
set reward_milli = task.reward_milli
from public.tasks task
where task.id = completion.task_id and completion.reward_milli is null;

alter table public.task_completions
  alter column reward_milli set not null,
  add constraint task_completions_reward_positive check (reward_milli > 0),
  add constraint task_completions_source_check check (source in ('app', 'nfc', 'staff')),
  add constraint task_completions_status_check check (status in ('valid', 'invalidated')),
  add constraint task_completions_invalidation_check check (
    (status = 'valid' and invalidated_at is null and invalidated_by_member_id is null and invalidation_reason is null)
    or
    (status = 'invalidated' and invalidated_at is not null and invalidated_by_member_id is not null and nullif(trim(invalidation_reason), '') is not null)
  );

create unique index if not exists one_valid_completion_per_task
  on public.task_completions(task_id)
  where status = 'valid';

alter table public.wallet_ledger drop constraint if exists wallet_ledger_kind_check;
alter table public.wallet_ledger
  add constraint wallet_ledger_kind_check check (kind in ('activity_reward', 'activity_reversal', 'takeover_cost', 'deal_transfer', 'penalty', 'correction'));

alter table public.nfc_tags drop constraint if exists nfc_tags_action_check;
update public.nfc_tags set action = 'arrive' where action = 'entry';
alter table public.nfc_tags
  add constraint nfc_tags_action_check check (action in ('arrive', 'leave', 'dishes', 'rubbish', 'parcel'));

create or replace function public.record_presence(p_action text, p_occurred_at timestamptz default now(), p_tag_token text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := public.current_member_id();
  v_family uuid := public.current_family_id();
  v_tag uuid;
  v_current_home boolean;
begin
  if v_member is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_action not in ('arrive', 'leave') then raise exception 'INVALID_STATE'; end if;
  if p_tag_token is not null then
    select id into v_tag
    from public.nfc_tags
    where family_id = v_family
      and token_hash = encode(digest(p_tag_token, 'sha256'), 'hex')
      and action = p_action
      and is_active;
    if v_tag is null then raise exception 'INVALID_STATE'; end if;
  end if;
  select is_home into v_current_home from public.current_home_presence where member_id = v_member;
  if coalesce(v_current_home, false) = (p_action = 'arrive') then
    return jsonb_build_object('memberId', v_member, 'action', p_action, 'occurredAt', p_occurred_at, 'alreadyRecorded', true);
  end if;
  insert into public.presence_events(family_id, member_id, action, occurred_at, source, tag_id, recorded_by)
  values(v_family, v_member, p_action, p_occurred_at, case when v_tag is null then 'manual' else 'nfc' end, v_tag, v_member);
  return jsonb_build_object('memberId', v_member, 'action', p_action, 'occurredAt', p_occurred_at, 'alreadyRecorded', false);
end
$$;

drop function if exists public.complete_task(uuid, uuid, uuid);

create function public.complete_task(
  p_task_id uuid,
  p_idempotency_key uuid,
  p_performed_by_member_id uuid default null,
  p_source text default 'app',
  p_tag_token text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := public.current_member_id();
  v_family uuid := public.current_family_id();
  v_performer uuid;
  v_task public.tasks%rowtype;
  v_completion public.task_completions%rowtype;
  v_activity_code text;
  v_tag uuid;
  v_balance integer;
  v_result jsonb;
  v_existing jsonb;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_source not in ('app', 'nfc', 'staff') then raise exception 'INVALID_STATE'; end if;
  select task.* into v_task
  from public.tasks task
  where task.id = p_task_id and task.family_id = v_family
  for update;
  if not found or v_task.status in ('cancelled', 'expired') or v_task.reward_milli is null then raise exception 'INVALID_STATE'; end if;
  select activity.code into v_activity_code
  from public.activity_catalog activity
  where activity.id = v_task.activity_id and activity.family_id = v_family;
  if p_source = 'nfc' then
    if p_tag_token is null then raise exception 'INVALID_STATE'; end if;
    select id into v_tag
    from public.nfc_tags
    where family_id = v_family
      and token_hash = encode(digest(p_tag_token, 'sha256'), 'hex')
      and action = v_activity_code
      and is_active;
    if v_tag is null then raise exception 'INVALID_STATE'; end if;
  elsif p_tag_token is not null then
    raise exception 'INVALID_STATE';
  end if;
  v_existing := public._idempotency_result(v_family, v_actor, 'complete_task', p_idempotency_key, jsonb_build_object('taskId', p_task_id, 'performedByMemberId', p_performed_by_member_id, 'source', p_source, 'tagId', v_tag));
  if v_existing is not null then return v_existing; end if;
  v_performer := coalesce(p_performed_by_member_id, v_actor);
  if v_performer <> v_actor and not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_source = 'staff' and not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_source <> 'staff' and v_performer <> v_actor then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform public.assert_member_family(v_performer, v_family);
  if not exists (select 1 from public.members where id = v_performer and role = 'participant' and is_active) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_task.assigned_member_id is not null and v_task.assigned_member_id <> v_performer and not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_completion from public.task_completions where task_id = v_task.id and status = 'valid' for update;
  if found then
    select balance_milli into v_balance from public.member_balances where member_id = v_completion.performed_by_member_id;
    v_result := jsonb_build_object('completionId', v_completion.id, 'rewardMilli', v_completion.reward_milli, 'walletBalance', coalesce(v_balance, 0), 'alreadyCompleted', true);
    perform public._save_idempotency(v_family, 'complete_task', p_idempotency_key, v_result);
    return v_result;
  end if;
  insert into public.task_completions(family_id, task_id, performed_by_member_id, completed_by_member_id, reward_milli, source, is_late)
  values(v_family, v_task.id, v_performer, v_actor, v_task.reward_milli, p_source, now() > v_task.due_at)
  returning * into v_completion;
  insert into public.task_completion_attributions(family_id, completion_id, member_id, attribution_kind)
  values(v_family, v_completion.id, v_performer, 'performer');
  insert into public.task_completion_attributions(family_id, completion_id, member_id, attribution_kind)
  select v_family, v_completion.id, takeover.initiator_member_id, 'payer'
  from public.takeovers takeover
  where takeover.task_id = v_task.id and takeover.status = 'completed' and takeover.initiator_member_id <> v_performer
  on conflict do nothing;
  insert into public.wallet_ledger(family_id, member_id, kind, amount_milli, task_id, idempotency_key, description, created_by)
  values(v_family, v_performer, 'activity_reward', v_completion.reward_milli, v_task.id, p_idempotency_key, 'Task reward', v_actor);
  update public.tasks set status = 'completed', assigned_member_id = v_performer, updated_at = now() where id = v_task.id;
  select balance_milli into v_balance from public.member_balances where member_id = v_performer;
  v_result := jsonb_build_object('completionId', v_completion.id, 'rewardMilli', v_completion.reward_milli, 'walletBalance', coalesce(v_balance, 0), 'alreadyCompleted', false);
  perform public._save_idempotency(v_family, 'complete_task', p_idempotency_key, v_result);
  return v_result;
end
$$;

create or replace function public.resolve_takeover(p_takeover_id uuid, p_resolution text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := public.current_member_id(); v_family uuid := public.current_family_id(); v_take public.takeovers%rowtype; v_task public.tasks%rowtype; v_completion public.task_completions%rowtype; v_res public.wallet_reservations%rowtype; v_result jsonb; v_existing jsonb;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_existing := public._idempotency_result(v_family, v_actor, 'resolve_takeover', p_idempotency_key, jsonb_build_object('takeoverId', p_takeover_id, 'resolution', p_resolution));
  if v_existing is not null then return v_existing; end if;
  if p_resolution not in ('completed', 'refused') then raise exception 'INVALID_STATE'; end if;
  select * into v_take from public.takeovers where id = p_takeover_id and family_id = v_family for update;
  if not found or v_take.status <> 'pending' then raise exception 'INVALID_STATE'; end if;
  if v_actor <> v_take.recipient_member_id and public.current_member_role() <> 'parent' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_task from public.tasks where id = v_take.task_id for update;
  select * into v_res from public.wallet_reservations where source_type = 'takeover' and source_id = v_take.id for update;
  if p_resolution = 'refused' then
    update public.takeovers set status = 'refused', pending_parent_review = true, resolved_at = now(), resolution_reason = 'Recipient refused' where id = v_take.id;
    update public.wallet_reservations set status = 'released', updated_at = now() where id = v_res.id;
    update public.tasks set assigned_member_id = v_take.initiator_member_id, status = 'assigned', updated_at = now() where id = v_take.task_id and status <> 'completed';
  else
    select * into v_completion from public.task_completions where task_id = v_take.task_id and status = 'valid';
    if not found or v_completion.performed_by_member_id <> v_take.recipient_member_id then raise exception 'INVALID_STATE'; end if;
    insert into public.wallet_ledger(family_id, member_id, kind, amount_milli, takeover_id, idempotency_key, description, created_by)
    values(v_family, v_take.initiator_member_id, 'takeover_cost', -v_take.cost_milli, v_take.id, p_idempotency_key, 'Completed takeover cost', v_actor);
    update public.takeovers set status = 'completed', pending_parent_review = false, resolved_at = now(), resolution_reason = 'Completed' where id = v_take.id;
    update public.wallet_reservations set status = 'consumed', updated_at = now() where id = v_res.id;
    insert into public.task_completion_attributions(family_id, completion_id, member_id, attribution_kind)
    values(v_family, v_completion.id, v_take.initiator_member_id, 'payer') on conflict do nothing;
  end if;
  v_result := jsonb_build_object('status', case when p_resolution = 'refused' then 'refused' else 'completed' end, 'pendingParentReview', p_resolution = 'refused');
  perform public._save_idempotency(v_family, 'resolve_takeover', p_idempotency_key, v_result);
  return v_result;
end
$$;

create or replace function public.invalidate_task_completion(p_completion_id uuid, p_reason text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := public.current_member_id();
  v_family uuid := public.current_family_id();
  v_completion public.task_completions%rowtype;
  v_task public.tasks%rowtype;
  v_result jsonb;
  v_existing jsonb;
  v_audit uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'INVALID_STATE'; end if;
  v_existing := public._idempotency_result(v_family, v_actor, 'invalidate_task_completion', p_idempotency_key, jsonb_build_object('completionId', p_completion_id, 'reason', trim(p_reason)));
  if v_existing is not null then return v_existing; end if;
  select * into v_completion
  from public.task_completions
  where id = p_completion_id and family_id = v_family
  for update;
  if not found or v_completion.status <> 'valid' then raise exception 'INVALID_STATE'; end if;
  select * into v_task from public.tasks where id = v_completion.task_id and family_id = v_family for update;
  if not found then raise exception 'INVALID_STATE'; end if;
  update public.task_completions
  set status = 'invalidated', invalidated_at = now(), invalidated_by_member_id = v_actor, invalidation_reason = trim(p_reason)
  where id = v_completion.id;
  insert into public.wallet_ledger(family_id, member_id, kind, amount_milli, task_id, idempotency_key, description, created_by)
  values(v_family, v_completion.performed_by_member_id, 'activity_reversal', -v_completion.reward_milli, v_task.id, p_idempotency_key, 'Invalidated task completion', v_actor);
  update public.tasks
  set status = case when assigned_member_id is null then 'open' else 'assigned' end, updated_at = now()
  where id = v_task.id;
  insert into public.audit_events(family_id, actor_member_id, event_type, target_type, target_id, reason, previous_values, new_values)
  values(v_family, v_actor, 'activity_invalidated', 'task_completion', v_completion.id, trim(p_reason), jsonb_build_object('status', 'valid', 'rewardMilli', v_completion.reward_milli), jsonb_build_object('status', 'invalidated', 'rewardReversedMilli', v_completion.reward_milli))
  returning id into v_audit;
  v_result := jsonb_build_object('completionId', v_completion.id, 'status', 'invalidated', 'reversedMilli', v_completion.reward_milli, 'auditEventId', v_audit);
  perform public._save_idempotency(v_family, 'invalidate_task_completion', p_idempotency_key, v_result);
  return v_result;
end
$$;

create or replace function public.enforce_valid_task_completion()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'completed' and not exists (
    select 1 from public.task_completions completion where completion.task_id = new.id and completion.status = 'valid'
  ) then
    raise exception 'INVALID_STATE';
  end if;
  return new;
end
$$;

drop trigger if exists tasks_require_valid_completion on public.tasks;
create trigger tasks_require_valid_completion
before insert or update of status on public.tasks
for each row execute function public.enforce_valid_task_completion();

revoke all on function public.complete_task(uuid, uuid, uuid, text, text) from public;
revoke all on function public.invalidate_task_completion(uuid, text, uuid) from public;
revoke all on function public.enforce_valid_task_completion() from public;
revoke all on function public.record_presence(text, timestamptz, text) from public;
grant execute on function public.complete_task(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.invalidate_task_completion(uuid, text, uuid) to authenticated;
grant execute on function public.record_presence(text, timestamptz, text) to authenticated;
