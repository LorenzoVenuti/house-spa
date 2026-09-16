-- Transactional RPC smoke tests. Intended for the Supabase local database where
-- auth.uid() reads request.jwt.claim.sub. The whole fixture rolls back.
begin;

-- Exercise a family RLS policy as the authenticated database role, not as the owner.
insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'child-1@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
update public.members
set auth_user_id = '10000000-0000-0000-0000-000000000001'::uuid
where id = '00000000-0000-0000-0001-000000000001'::uuid;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.families where id = '00000000-0000-0000-0000-000000000001'::uuid) <> 1 then
    raise exception 'authenticated-role family read did not pass RLS';
  end if;
end $$;
reset role;

do $$
declare
  family uuid := '00000000-0000-0000-0000-000000000001';
  child_one uuid := '00000000-0000-0000-0001-000000000001';
  child_two uuid := '00000000-0000-0000-0001-000000000002';
  child_three uuid := '00000000-0000-0000-0001-000000000003';
  parent_one uuid := '00000000-0000-0000-0000-000000000002';
  parent_two uuid := '00000000-0000-0000-0000-000000000003';
  other_family uuid := '20000000-0000-0000-0000-000000000001';
  other_member uuid := '20000000-0000-0000-0000-000000000002';
  dishes uuid;
  task_id uuid := gen_random_uuid();
  task_two uuid := gen_random_uuid();
  key_one uuid := gen_random_uuid();
  key_two uuid := gen_random_uuid();
  key_three uuid := gen_random_uuid();
  resolve_key uuid := gen_random_uuid();
  first jsonb;
  second jsonb;
  takeover jsonb;
  v_takeover_id uuid;
  deal jsonb;
  deal_id uuid;
  correction jsonb;
  managed_member jsonb;
  managed_member_id uuid;
  wallet_rows integer;
  generated_week date := (current_date - (extract(isodow from current_date)::integer - 1))::date + 14;
  generated_task uuid;
  generated_assignee uuid;
  generated_reward integer;
  balance integer;
  caught boolean;
  expected_base_date date;
  original_timezone text := current_setting('TimeZone');
begin
  -- Attach synthetic auth identities only inside this transaction.
  insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values
    ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'child-1@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb),
    ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'child-2@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb),
    ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'child-3@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb),
    ('10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'parent-1@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb)
  on conflict (id) do nothing;
  update public.members set auth_user_id =
    case id when child_one then '10000000-0000-0000-0000-000000000001'::uuid
            when child_two then '10000000-0000-0000-0000-000000000002'::uuid
            when child_three then '10000000-0000-0000-0000-000000000003'::uuid
            when parent_one then '10000000-0000-0000-0000-000000000004'::uuid end
  where id in (child_one, child_two, child_three, parent_one);
  select id into dishes from public.activity_catalog where family_id = family and code = 'dishes';
  insert into public.wallet_ledger(family_id, member_id, kind, amount_milli, description)
  values(family, child_one, 'correction', 30, 'test funding'), (family, child_two, 'correction', 10, 'test funding');
  insert into public.presence_events(family_id, member_id, action, occurred_at) values(family, child_three, 'arrive', now());
  insert into public.tasks(id, family_id, activity_id, title, opening_at, due_at, status, assigned_member_id, reward_milli, reward_snapshot_at)
  values(task_id, family, dishes, 'Test dishes', now() - interval '1 minute', now() + interval '1 hour', 'assigned', child_one, 3, now() - interval '1 minute');
  insert into public.families(id, name, timezone) values(other_family, 'Other synthetic family', 'Europe/Rome');
  insert into public.members(id, family_id, display_name, role) values(other_member, other_family, 'Other Family Child', 'participant');

  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
  first := public.complete_task(task_id, key_one, null);
  second := public.complete_task(task_id, key_one, null);
  if first <> second or (first->>'completionId') <> (second->>'completionId') then
    raise exception 'same-key completion retry did not return the stored result';
  end if;
  second := public.complete_task(task_id, key_three, null);
  if coalesce((second->>'alreadyCompleted')::boolean, false) is not true then
    raise exception 'new-key completion retry did not report alreadyCompleted';
  end if;
  select balance_milli into balance from public.member_balances where member_id = child_one;
  if balance <> 33 then raise exception 'completion reward was duplicated or missing: %', balance; end if;

  -- Participant cannot apply a parent correction.
  caught := false;
  begin
    perform public.apply_parent_correction('wallet', gen_random_uuid(), 'nope', jsonb_build_object('memberId', child_one, 'deltaMilli', 1), gen_random_uuid());
  exception when others then
    caught := SQLERRM = 'FORBIDDEN';
  end;
  if not caught then raise exception 'participant was allowed to correct a wallet'; end if;

  caught := false;
  begin
    perform public.create_managed_member('Not allowed', 'participant');
  exception when others then
    caught := SQLERRM = 'FORBIDDEN';
  end;
  if not caught then raise exception 'participant was allowed to create a managed member'; end if;

  caught := false;
  begin
    perform public.set_member_active(child_two, false);
  exception when others then
    caught := SQLERRM = 'FORBIDDEN';
  end;
  if not caught then raise exception 'participant was allowed to deactivate a member'; end if;

  -- Parent task corrections are constrained and audited.
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
  caught := false;
  begin
    perform public.set_member_active(other_member, false);
  exception when others then
    caught := SQLERRM = 'INVALID_STATE';
  end;
  if not caught then raise exception 'parent was allowed to change a cross-family member'; end if;

  expected_base_date := (now() at time zone 'Europe/Rome')::date;
  perform set_config(
    'TimeZone',
    case when extract(hour from now() at time zone 'Europe/Rome') >= 12 then 'Pacific/Kiritimati' else 'Pacific/Honolulu' end,
    true
  );
  managed_member := public.create_managed_member('  Guest Child  ', 'participant');
  managed_member_id := (managed_member->>'memberId')::uuid;
  if managed_member->>'displayName' <> 'Guest Child' or managed_member->>'role' <> 'participant' or (managed_member->>'isActive')::boolean is not true then
    raise exception 'managed member result was not normalized';
  end if;
  if (select count(*) from public.planned_meal_attendance where member_id = managed_member_id and meal_type = 'dinner' and status = 'unknown') <> 7 then
    raise exception 'managed member did not receive seven unknown dinners';
  end if;
  if (select count(*) from public.planned_meal_attendance where member_id = managed_member_id and meal_type = 'lunch' and status = 'unknown') <> 2 then
    raise exception 'managed member did not receive two unknown weekend lunches';
  end if;
  if (select min(meal_date) from public.planned_meal_attendance where member_id = managed_member_id) <> expected_base_date
     or (select max(meal_date) from public.planned_meal_attendance where member_id = managed_member_id) <> expected_base_date + 6 then
    raise exception 'managed member meal dates did not use the Europe/Rome seven-day window';
  end if;
  if exists (
    select 1 from public.planned_meal_attendance
    where member_id = managed_member_id and meal_type = 'lunch' and extract(isodow from meal_date) not in (6, 7)
  ) then raise exception 'managed member received a weekday lunch'; end if;
  perform set_config('TimeZone', original_timezone, true);
  if not exists (select 1 from public.audit_events where target_id = managed_member_id and event_type = 'managed_member_created') then
    raise exception 'managed member creation was not audited';
  end if;
  caught := false;
  begin
    perform public.create_managed_member('guest child', 'referee');
  exception when others then
    caught := SQLERRM = 'INVALID_STATE';
  end;
  if not caught then raise exception 'case-insensitive duplicate managed member name was allowed'; end if;

  -- A parent cannot deactivate themselves, and one active parent remains after another is deactivated.
  caught := false;
  begin
    perform public.set_member_active(parent_one, false);
  exception when others then
    caught := SQLERRM = 'INVALID_STATE';
  end;
  if not caught then raise exception 'parent self-deactivation was allowed'; end if;
  perform public.set_member_active(parent_two, false);
  if (select count(*) from public.members where family_id = family and role = 'parent' and is_active) <> 1 then
    raise exception 'parent deactivation did not preserve exactly one active parent';
  end if;
  perform public.set_member_active(parent_two, true);

  correction := public.apply_parent_correction('task', task_id, 'Fix due time', jsonb_build_object('dueAt', (now() + interval '2 hours')::text, 'assignedMemberId', child_one), gen_random_uuid());
  if correction->>'auditEventId' is null then raise exception 'task correction did not create an audit event'; end if;
  if not (select assignment_protected from public.tasks where id = task_id) then raise exception 'parent assignment correction was not protected'; end if;

  -- Weekly generation preassigns from planned attendance; opening preserves a still-valid assignee.
  insert into public.planned_meal_attendance(family_id, member_id, meal_date, meal_type, status)
  values(family, child_one, generated_week, 'dinner', 'present')
  on conflict (member_id, meal_date, meal_type) do update set status = 'present';
  perform public.generate_weekly_tasks(family, generated_week);
  select id, assigned_member_id into generated_task, generated_assignee from public.tasks where family_id = family and occurrence_key = 'dishes:dinner:' || generated_week;
  if generated_assignee is distinct from child_one then raise exception 'weekly generation did not preassign the sole planned participant'; end if;
  perform public.open_scheduled_tasks(family, (select opening_at from public.tasks where id = generated_task) + interval '1 minute');
  select reward_milli into generated_reward from public.tasks where id = generated_task;
  if (select assigned_member_id from public.tasks where id = generated_task) is distinct from child_one or generated_reward <> 2 then raise exception 'opening did not preserve assignee or snapshot sole-participant reward'; end if;

  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

  insert into public.tasks(id, family_id, activity_id, title, opening_at, due_at, status, assigned_member_id, reward_milli, reward_snapshot_at)
  values(task_two, family, dishes, 'Test takeover', now() - interval '1 minute', now() + interval '1 hour', 'assigned', child_one, 3, now() - interval '1 minute');
  takeover := public.create_takeover(task_two, child_three, key_two);
  v_takeover_id := (takeover->>'takeoverId')::uuid;
  if (select amount_milli from public.wallet_reservations where source_id = v_takeover_id and status = 'reserved') <> 9 then raise exception 'takeover reservation incorrect'; end if;

  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
  perform public.complete_task(task_two, gen_random_uuid(), child_three);
  perform public.resolve_takeover(v_takeover_id, 'completed', resolve_key);
  perform public.resolve_takeover(v_takeover_id, 'completed', resolve_key);
  if (select balance_milli from public.member_balances where member_id = child_one) <> 24 then raise exception 'takeover payer was not debited exactly once'; end if;
  if (select count(*) from public.wallet_ledger wl where wl.takeover_id = v_takeover_id and wl.kind = 'takeover_cost') <> 1 then raise exception 'takeover cost was duplicated or missing'; end if;
  if not exists (
    select 1
    from public.task_completion_attributions tca
    where tca.completion_id = (
      select tc.id from public.task_completions tc where tc.task_id = task_two
    )
      and tca.member_id = child_one
      and tca.attribution_kind = 'payer'
  ) then
    raise exception 'successful takeover missing payer attribution';
  end if;

  -- Deal funding is reserved on acceptance and transferred exactly once on settlement.
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
  deal := public.create_deal(child_two, 'Test ride', 4, now() + interval '1 day', gen_random_uuid());
  deal_id := (deal->>'dealId')::uuid;
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
  perform public.accept_deal(deal_id, gen_random_uuid());
  perform public.settle_deal(deal_id, gen_random_uuid());
  if (select status from public.market_deals where id = deal_id) <> 'settled' then raise exception 'deal did not settle'; end if;
  if (select balance_milli from public.member_balances where member_id = child_two) <> 14 then raise exception 'deal provider was not paid exactly once'; end if;

  -- Deactivation preserves historical ledger rows and reactivation restores access.
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
  select count(*) into wallet_rows from public.wallet_ledger where member_id = child_one;
  perform public.set_member_active(child_one, false);
  if (select count(*) from public.wallet_ledger where member_id = child_one) <> wallet_rows then raise exception 'member deactivation removed wallet history'; end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
  caught := false;
  begin
    perform public.record_presence('arrive', now(), null);
  exception when others then
    caught := SQLERRM = 'AUTH_REQUIRED';
  end;
  if not caught then raise exception 'inactive member was allowed to mutate'; end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
  perform public.set_member_active(child_one, true);
  if not (select is_active from public.members where id = child_one) then raise exception 'member reactivation failed'; end if;
end $$;

rollback;
