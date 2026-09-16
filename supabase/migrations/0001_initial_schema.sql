-- Milli e Misfatti backend schema and transactional RPCs.
-- The migration is intentionally family-scoped so the pilot can grow beyond one household.

create extension if not exists pgcrypto;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Europe/Rome',
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  role text not null check (role in ('participant', 'referee', 'parent')),
  is_active boolean not null default true,
  is_meal_attendee boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, display_name)
);

create index if not exists members_family_idx on public.members(family_id, is_active);
create index if not exists members_auth_idx on public.members(auth_user_id) where auth_user_id is not null;
create unique index if not exists members_family_display_name_ci_uidx on public.members(family_id, lower(trim(display_name)));

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  email text not null,
  role text not null default 'participant' check (role in ('participant', 'referee', 'parent')),
  token_hash text not null unique,
  invited_by uuid not null references public.members(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invitations_family_idx on public.invitations(family_id, expires_at);

create table if not exists public.activity_catalog (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_-]+$'),
  label text not null,
  base_reward_milli integer not null check (base_reward_milli > 0),
  single_participant_reward_milli integer not null check (single_participant_reward_milli > 0 and single_participant_reward_milli <= base_reward_milli),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (family_id, code)
);

create table if not exists public.planned_meal_attendance (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  meal_date date not null,
  meal_type text not null check (meal_type in ('lunch', 'dinner')),
  status text not null default 'unknown' check (status in ('present', 'absent', 'unknown')),
  updated_by uuid references public.members(id),
  updated_at timestamptz not null default now(),
  unique (member_id, meal_date, meal_type)
);

create index if not exists planned_meal_family_date_idx on public.planned_meal_attendance(family_id, meal_date, meal_type);

create table if not exists public.actual_meal_attendance (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  meal_date date not null,
  meal_type text not null check (meal_type in ('lunch', 'dinner')),
  attended boolean not null,
  confirmed_by uuid references public.members(id),
  confirmed_at timestamptz not null default now(),
  unique (member_id, meal_date, meal_type)
);

create table if not exists public.presence_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  action text not null check (action in ('arrive', 'leave')),
  occurred_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'nfc', 'parent_correction')),
  tag_id uuid,
  recorded_by uuid references public.members(id),
  created_at timestamptz not null default now()
);

create index if not exists presence_events_member_idx on public.presence_events(member_id, occurred_at desc);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  activity_id uuid not null references public.activity_catalog(id),
  occurrence_key text,
  title text not null,
  scheduled_for timestamptz,
  opening_at timestamptz not null,
  due_at timestamptz not null,
  status text not null default 'planned' check (status in ('planned', 'open', 'assigned', 'completed', 'expired', 'cancelled')),
  assigned_member_id uuid references public.members(id),
  reward_milli integer check (reward_milli is null or reward_milli > 0),
  reward_snapshot_at timestamptz,
  assigned_automatically boolean not null default false,
  assignment_protected boolean not null default false,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_at >= opening_at),
  check ((status in ('assigned', 'completed') and assigned_member_id is not null) or status not in ('assigned', 'completed')),
  check ((status in ('assigned', 'completed') and reward_milli is not null) or status not in ('assigned', 'completed')),
  unique (family_id, occurrence_key)
);

create index if not exists tasks_opening_idx on public.tasks(family_id, opening_at, status);
create index if not exists tasks_assignee_idx on public.tasks(assigned_member_id, status, due_at);

create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  task_id uuid not null unique references public.tasks(id) on delete cascade,
  performed_by_member_id uuid not null references public.members(id),
  completed_by_member_id uuid not null references public.members(id),
  completed_at timestamptz not null default now(),
  is_late boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.task_completion_attributions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  completion_id uuid not null references public.task_completions(id) on delete cascade,
  member_id uuid not null references public.members(id),
  attribution_kind text not null check (attribution_kind in ('performer', 'payer')),
  created_at timestamptz not null default now(),
  unique (completion_id, member_id, attribution_kind)
);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id),
  kind text not null check (kind in ('activity_reward', 'takeover_cost', 'deal_transfer', 'penalty', 'correction')),
  amount_milli integer not null check (amount_milli <> 0),
  task_id uuid references public.tasks(id),
  takeover_id uuid,
  deal_id uuid,
  idempotency_key uuid,
  description text not null,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now()
);

create index if not exists wallet_member_idx on public.wallet_ledger(member_id, created_at desc);
create unique index if not exists wallet_idempotency_idx on public.wallet_ledger(member_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists one_takeover_cost_per_takeover on public.wallet_ledger(takeover_id, kind)
  where takeover_id is not null and kind = 'takeover_cost';

create table if not exists public.wallet_reservations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id),
  amount_milli integer not null check (amount_milli > 0),
  source_type text not null check (source_type in ('takeover', 'deal')),
  source_id uuid not null,
  status text not null default 'reserved' check (status in ('reserved', 'released', 'consumed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists wallet_reservations_member_idx on public.wallet_reservations(member_id, status);
create unique index if not exists active_wallet_reservation_idx on public.wallet_reservations(member_id, source_type, source_id) where status = 'reserved';

create table if not exists public.takeovers (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  initiator_member_id uuid not null references public.members(id),
  recipient_member_id uuid not null references public.members(id),
  cost_milli integer not null check (cost_milli > 0),
  status text not null default 'pending' check (status in ('pending', 'completed', 'refused', 'expired', 'cancelled')),
  pending_parent_review boolean not null default false,
  resolution_reason text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (initiator_member_id <> recipient_member_id)
);

create unique index if not exists one_active_takeover_per_task on public.takeovers(task_id) where status = 'pending';
create unique index if not exists one_takeover_pair_per_task on public.takeovers(task_id, initiator_member_id, recipient_member_id);

create table if not exists public.market_deals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  buyer_member_id uuid not null references public.members(id),
  provider_member_id uuid not null references public.members(id),
  description text not null check (length(trim(description)) between 1 and 500),
  price_milli integer not null check (price_milli > 0),
  due_at timestamptz not null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'performed', 'settled', 'rejected', 'cancelled', 'expired', 'disputed')),
  performed_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  check (buyer_member_id <> provider_member_id)
);

create index if not exists market_deals_parties_idx on public.market_deals(buyer_member_id, provider_member_id, status);

create table if not exists public.nfc_tags (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  token_hash text not null unique,
  label text not null,
  action text not null check (action in ('entry', 'dishes', 'rubbish', 'parcel')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid references public.members(id),
  operation text not null,
  request_key uuid not null,
  request_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  unique (family_id, operation, request_key)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  actor_member_id uuid references public.members(id),
  event_type text not null,
  target_type text,
  target_id uuid,
  reason text,
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.scheduler_config (
  family_id uuid primary key references public.families(id) on delete cascade,
  timezone text not null default 'Europe/Rome',
  weekly_generation_local_time time not null default '22:00',
  dinner_open_local_time time not null default '20:30',
  dinner_due_local_time time not null default '23:00',
  lunch_open_local_time time not null default '13:00',
  lunch_due_local_time time not null default '15:00',
  on_demand_default_hours integer not null default 4 check (on_demand_default_hours between 1 and 72),
  updated_at timestamptz not null default now()
);

create table if not exists public.scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  job_name text not null,
  run_key text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  details jsonb not null default '{}'::jsonb,
  error_message text,
  unique (family_id, job_name, run_key)
);

alter table public.presence_events
  drop constraint if exists presence_events_tag_fk;
alter table public.presence_events
  add constraint presence_events_tag_fk foreign key (tag_id) references public.nfc_tags(id) on delete set null;

alter table public.wallet_ledger
  drop constraint if exists wallet_takeover_fk;
alter table public.wallet_ledger
  add constraint wallet_takeover_fk foreign key (takeover_id) references public.takeovers(id) on delete set null;
alter table public.wallet_ledger
  drop constraint if exists wallet_deal_fk;
alter table public.wallet_ledger
  add constraint wallet_deal_fk foreign key (deal_id) references public.market_deals(id) on delete set null;

create or replace function public.current_member_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.members where auth_user_id = auth.uid() and is_active limit 1
$$;

create or replace function public.current_member_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.members where id = public.current_member_id()
$$;

create or replace function public.current_family_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select family_id from public.members where id = public.current_member_id()
$$;

create or replace function public.is_family_member(p_family_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.members where id = public.current_member_id() and family_id = p_family_id and is_active)
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.current_member_role() in ('parent', 'referee')
$$;

drop view if exists public.member_balances;
-- security_invoker prevents a view owner from bypassing family RLS for client reads.
create view public.member_balances with (security_invoker = true) as
select
  m.family_id,
  m.id as member_id,
  m.display_name,
  coalesce(sum(w.amount_milli), 0)::integer as balance_milli,
  coalesce((select sum(r.amount_milli) from public.wallet_reservations r where r.member_id = m.id and r.status = 'reserved'), 0)::integer as reserved_milli,
  (coalesce(sum(w.amount_milli), 0) - coalesce((select sum(r.amount_milli) from public.wallet_reservations r where r.member_id = m.id and r.status = 'reserved'), 0))::integer as spendable_milli,
  coalesce(sum(w.amount_milli) filter (where w.kind = 'activity_reward'), 0)::integer as earned_milli
from public.members m
left join public.wallet_ledger w on w.member_id = m.id
group by m.family_id, m.id, m.display_name;

drop view if exists public.current_home_presence;
create view public.current_home_presence with (security_invoker = true) as
select distinct on (member_id)
  family_id, member_id, action, occurred_at, (action = 'arrive') as is_home
from public.presence_events
order by member_id, occurred_at desc, id desc;

create or replace function public.assert_member_family(p_member_id uuid, p_family_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.members where id = p_member_id and family_id = p_family_id and is_active) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end
$$;

create or replace function public.create_invitation(p_email text, p_role text default 'participant', p_expires_at timestamptz default now() + interval '7 days')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.current_member_id(); v_family uuid := public.current_family_id(); v_token text := encode(gen_random_bytes(24), 'hex'); v_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if public.current_member_role() <> 'parent' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_role not in ('participant', 'referee', 'parent') or p_expires_at <= now() or position('@' in p_email) < 2 then raise exception 'INVALID_STATE'; end if;
  insert into public.invitations(family_id, email, role, token_hash, invited_by, expires_at)
  values(v_family, lower(trim(p_email)), p_role, encode(digest(v_token, 'sha256'), 'hex'), v_actor, p_expires_at)
  returning id into v_id;
  return jsonb_build_object('invitationId', v_id, 'email', lower(trim(p_email)), 'role', p_role, 'token', v_token, 'expiresAt', p_expires_at);
end
$$;

create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_auth uuid := auth.uid(); v_inv public.invitations%rowtype; v_member uuid;
begin
  if v_auth is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_inv from public.invitations where token_hash = encode(digest(p_token, 'sha256'), 'hex') and accepted_at is null and expires_at > now() for update;
  if not found then raise exception 'INVALID_STATE'; end if;
  if exists (select 1 from public.members where auth_user_id = v_auth) then raise exception 'INVALID_STATE'; end if;
  insert into public.members(family_id, auth_user_id, display_name, role)
  values(v_inv.family_id, v_auth, split_part(v_inv.email, '@', 1), v_inv.role)
  returning id into v_member;
  update public.invitations set accepted_at = now() where id = v_inv.id;
  return jsonb_build_object('memberId', v_member, 'familyId', v_inv.family_id, 'role', v_inv.role);
end
$$;

create or replace function public.confirm_meal_attendance(p_member_id uuid, p_meal_date date, p_meal_type text, p_attended boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.current_member_id(); v_family uuid := public.current_family_id();
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_meal_type not in ('lunch', 'dinner') then raise exception 'INVALID_STATE'; end if;
  if p_member_id <> v_actor and public.current_member_role() <> 'parent' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform public.assert_member_family(p_member_id, v_family);
  insert into public.actual_meal_attendance(family_id, member_id, meal_date, meal_type, attended, confirmed_by)
  values(v_family, p_member_id, p_meal_date, p_meal_type, p_attended, v_actor)
  on conflict (member_id, meal_date, meal_type) do update set attended = excluded.attended, confirmed_by = excluded.confirmed_by, confirmed_at = now();
  return jsonb_build_object('memberId', p_member_id, 'mealDate', p_meal_date, 'mealType', p_meal_type, 'attended', p_attended);
end
$$;

create or replace function public.set_member_role(p_member_id uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.current_member_id(); v_family uuid := public.current_family_id(); v_old text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if public.current_member_role() <> 'parent' or p_role not in ('participant', 'referee', 'parent') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select role into v_old from public.members where id = p_member_id and family_id = v_family and is_active for update;
  if not found then raise exception 'INVALID_STATE'; end if;
  if v_old = 'parent' and p_role <> 'parent' and (select count(*) from public.members where family_id = v_family and role = 'parent' and is_active) <= 1 then raise exception 'INVALID_STATE'; end if;
  update public.members set role = p_role, updated_at = now() where id = p_member_id;
  insert into public.audit_events(family_id, actor_member_id, event_type, target_type, target_id, reason, previous_values, new_values)
  values(v_family, v_actor, 'role_changed', 'member', p_member_id, 'Parent role update', jsonb_build_object('role', v_old), jsonb_build_object('role', p_role));
  return jsonb_build_object('memberId', p_member_id, 'role', p_role);
end
$$;

create or replace function public.create_managed_member(p_display_name text, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := public.current_member_id();
  v_family uuid := public.current_family_id();
  v_display_name text := trim(p_display_name);
  v_member uuid;
  v_timezone text;
  v_base_date date;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if public.current_member_role() <> 'parent' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(length(v_display_name), 0) not between 2 and 40 or p_role is null or p_role not in ('participant', 'referee', 'parent') then
    raise exception 'INVALID_STATE';
  end if;
  if exists (
    select 1 from public.members
    where family_id = v_family and lower(trim(display_name)) = lower(v_display_name)
  ) then
    raise exception 'INVALID_STATE';
  end if;

  select timezone into v_timezone from public.families where id = v_family;
  v_base_date := (now() at time zone coalesce(v_timezone, 'Europe/Rome'))::date;

  insert into public.members(family_id, display_name, role, is_active)
  values(v_family, v_display_name, p_role, true)
  returning id into v_member;

  insert into public.planned_meal_attendance(family_id, member_id, meal_date, meal_type, status, updated_by)
  select v_family, v_member, v_base_date + days.day_offset, meals.meal_type, 'unknown', v_actor
  from generate_series(0, 6) as days(day_offset)
  cross join (values ('dinner'), ('lunch')) as meals(meal_type)
  where meals.meal_type = 'dinner' or extract(isodow from v_base_date + days.day_offset) in (6, 7);

  insert into public.audit_events(family_id, actor_member_id, event_type, target_type, target_id, reason, new_values)
  values(
    v_family,
    v_actor,
    'managed_member_created',
    'member',
    v_member,
    'Parent created managed member',
    jsonb_build_object('displayName', v_display_name, 'role', p_role, 'isActive', true)
  );

  return jsonb_build_object('memberId', v_member, 'displayName', v_display_name, 'role', p_role, 'isActive', true);
end
$$;

create or replace function public.set_member_active(p_member_id uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.current_member_id(); v_family uuid := public.current_family_id(); v_old boolean; v_role text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if public.current_member_role() <> 'parent' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform 1 from public.families where id = v_family for update;
  select is_active, role into v_old, v_role from public.members where id = p_member_id and family_id = v_family for update;
  if not found then raise exception 'INVALID_STATE'; end if;
  if p_active is null then raise exception 'INVALID_STATE'; end if;
  if not p_active and p_member_id = v_actor then raise exception 'INVALID_STATE'; end if;
  if not p_active and v_old and v_role = 'parent' and (select count(*) from public.members where family_id = v_family and role = 'parent' and is_active) <= 1 then raise exception 'INVALID_STATE'; end if;
  update public.members set is_active = p_active, updated_at = now() where id = p_member_id;
  insert into public.audit_events(family_id, actor_member_id, event_type, target_type, target_id, reason, previous_values, new_values)
  values(v_family, v_actor, 'member_status_changed', 'member', p_member_id, 'Parent account status update', jsonb_build_object('isActive', v_old), jsonb_build_object('isActive', p_active));
  return jsonb_build_object('memberId', p_member_id, 'isActive', p_active);
end
$$;

create or replace function public.record_presence(p_action text, p_occurred_at timestamptz default now(), p_tag_token text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := public.current_member_id(); v_family uuid := public.current_family_id(); v_tag uuid;
begin
  if v_member is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_action not in ('arrive', 'leave') then raise exception 'INVALID_STATE'; end if;
  if p_tag_token is not null then
    select id into v_tag from public.nfc_tags where family_id = v_family and token_hash = encode(digest(p_tag_token, 'sha256'), 'hex') and is_active;
    if v_tag is null then raise exception 'INVALID_STATE'; end if;
  end if;
  insert into public.presence_events(family_id, member_id, action, occurred_at, source, tag_id, recorded_by)
  values(v_family, v_member, p_action, p_occurred_at, case when v_tag is null then 'manual' else 'nfc' end, v_tag, v_member);
  return jsonb_build_object('memberId', v_member, 'action', p_action, 'occurredAt', p_occurred_at);
end
$$;

create or replace function public.set_meal_plan(p_meal_date date, p_meal_type text, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := public.current_member_id(); v_family uuid := public.current_family_id(); v_tz text; v_local_time time;
begin
  if v_member is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_meal_type not in ('lunch', 'dinner') or p_status not in ('present', 'absent', 'unknown') then raise exception 'INVALID_STATE'; end if;
  select timezone into v_tz from public.families where id = v_family;
  v_local_time := (now() at time zone v_tz)::time;
  if p_meal_date = (now() at time zone v_tz)::date and p_meal_type = 'dinner' and p_status = 'present' and v_local_time > time '21:30' then
    raise exception 'INVALID_STATE';
  end if;
  if p_meal_date = (now() at time zone v_tz)::date and p_meal_type = 'dinner' and p_status = 'absent' and v_local_time >= time '20:30' then
    raise exception 'INVALID_STATE';
  end if;
  insert into public.planned_meal_attendance(family_id, member_id, meal_date, meal_type, status, updated_by)
  values(v_family, v_member, p_meal_date, p_meal_type, p_status, v_member)
  on conflict (member_id, meal_date, meal_type) do update set status = excluded.status, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('mealDate', p_meal_date, 'mealType', p_meal_type, 'status', p_status);
end
$$;

create or replace function public.create_on_demand_task(p_activity_code text, p_title text, p_opening_at timestamptz default now(), p_due_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := public.current_family_id(); v_actor uuid := public.current_member_id(); v_activity public.activity_catalog%rowtype; v_task public.tasks%rowtype; v_due timestamptz;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_activity from public.activity_catalog where family_id = v_family and code = p_activity_code and is_active;
  if not found then raise exception 'INVALID_STATE'; end if;
  v_due := coalesce(p_due_at, p_opening_at + make_interval(hours => (select on_demand_default_hours from public.scheduler_config where family_id = v_family)));
  insert into public.tasks(family_id, activity_id, title, opening_at, due_at, status, created_by)
  values(v_family, v_activity.id, coalesce(nullif(trim(p_title), ''), v_activity.label), p_opening_at, v_due, 'open', v_actor)
  returning * into v_task;
  return jsonb_build_object('taskId', v_task.id, 'status', v_task.status);
end
$$;

create or replace function public._idempotency_result(p_family uuid, p_member uuid, p_operation text, p_key uuid, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_hash text := encode(digest(p_request::text, 'sha256'), 'hex'); v_existing public.idempotency_keys%rowtype;
begin
  insert into public.idempotency_keys(family_id, member_id, operation, request_key, request_hash)
  values(p_family, p_member, p_operation, p_key, v_hash)
  on conflict (family_id, operation, request_key) do nothing;
  if not found then
    select * into v_existing from public.idempotency_keys where family_id = p_family and operation = p_operation and request_key = p_key for update;
    if v_existing.request_hash <> v_hash then raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '40001'; end if;
    return coalesce(v_existing.result, '{}'::jsonb);
  end if;
  return null;
end
$$;

create or replace function public._save_idempotency(p_family uuid, p_operation text, p_key uuid, p_result jsonb)
returns void language sql security definer set search_path = public as $$
  update public.idempotency_keys set result = p_result where family_id = p_family and operation = p_operation and request_key = p_key
$$;

create or replace function public.complete_task(p_task_id uuid, p_idempotency_key uuid, p_performed_by_member_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := public.current_member_id(); v_family uuid := public.current_family_id(); v_performer uuid; v_task public.tasks%rowtype; v_completion public.task_completions%rowtype; v_reward integer; v_balance integer; v_result jsonb; v_existing jsonb;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_existing := public._idempotency_result(v_family, v_actor, 'complete_task', p_idempotency_key, jsonb_build_object('taskId', p_task_id, 'performedByMemberId', p_performed_by_member_id));
  if v_existing is not null then return v_existing; end if;
  select * into v_task from public.tasks where id = p_task_id and family_id = v_family for update;
  if not found or v_task.status in ('cancelled', 'expired') then raise exception 'INVALID_STATE'; end if;
  if v_task.reward_milli is null then raise exception 'INVALID_STATE'; end if;
  v_performer := coalesce(p_performed_by_member_id, v_actor);
  if v_performer <> v_actor and not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform public.assert_member_family(v_performer, v_family);
  if not exists (select 1 from public.members where id = v_performer and role = 'participant') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_task.assigned_member_id is not null and v_task.assigned_member_id <> v_performer and not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_completion from public.task_completions where task_id = v_task.id for update;
  if found then
    select balance_milli into v_balance from public.member_balances where member_id = v_performer;
    v_result := jsonb_build_object('completionId', v_completion.id, 'rewardMilli', v_task.reward_milli, 'walletBalance', coalesce(v_balance, 0), 'alreadyCompleted', true);
    perform public._save_idempotency(v_family, 'complete_task', p_idempotency_key, v_result); return v_result;
  end if;
  insert into public.task_completions(family_id, task_id, performed_by_member_id, completed_by_member_id, is_late)
  values(v_family, v_task.id, v_performer, v_actor, now() > v_task.due_at) returning * into v_completion;
  insert into public.task_completion_attributions(family_id, completion_id, member_id, attribution_kind)
  values(v_family, v_completion.id, v_performer, 'performer');
  insert into public.wallet_ledger(family_id, member_id, kind, amount_milli, task_id, idempotency_key, description, created_by)
  values(v_family, v_performer, 'activity_reward', v_task.reward_milli, v_task.id, p_idempotency_key, 'Task reward', v_actor);
  update public.tasks set status = 'completed', updated_at = now() where id = v_task.id;
  select balance_milli into v_balance from public.member_balances where member_id = v_performer;
  v_result := jsonb_build_object('completionId', v_completion.id, 'rewardMilli', v_task.reward_milli, 'walletBalance', coalesce(v_balance, 0), 'alreadyCompleted', false);
  perform public._save_idempotency(v_family, 'complete_task', p_idempotency_key, v_result); return v_result;
end
$$;

create or replace function public.create_takeover(p_task_id uuid, p_recipient_member_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := public.current_member_id(); v_family uuid := public.current_family_id(); v_task public.tasks%rowtype; v_activity public.activity_catalog%rowtype; v_cost integer; v_spendable integer; v_result jsonb; v_existing jsonb; v_home boolean; v_takeover_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_existing := public._idempotency_result(v_family, v_actor, 'create_takeover', p_idempotency_key, jsonb_build_object('taskId', p_task_id, 'recipientMemberId', p_recipient_member_id));
  if v_existing is not null then return v_existing; end if;
  if public.current_member_role() <> 'participant' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_task from public.tasks where id = p_task_id and family_id = v_family for update;
  if not found or v_task.status not in ('open', 'assigned') or v_task.assigned_member_id <> v_actor or now() > v_task.due_at then raise exception 'INVALID_STATE'; end if;
  perform public.assert_member_family(p_recipient_member_id, v_family);
  if not exists (select 1 from public.members where id = p_recipient_member_id and role = 'participant') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select is_home into v_home from public.current_home_presence where member_id = p_recipient_member_id;
  if coalesce(v_home, false) is not true then raise exception 'MEMBER_NOT_HOME'; end if;
  if exists (select 1 from public.takeovers where task_id = v_task.id and status = 'pending') then raise exception 'INVALID_STATE'; end if;
  if exists (select 1 from public.takeovers where task_id = v_task.id and initiator_member_id = v_actor and recipient_member_id = p_recipient_member_id) then raise exception 'INVALID_STATE'; end if;
  select base_reward_milli into v_cost from public.activity_catalog where id = v_task.activity_id;
  v_cost := v_cost * 3;
  -- Serialize all reservations for one payer before checking spendable milli.
  perform 1 from public.members where id = v_actor for update;
  select spendable_milli into v_spendable from public.member_balances where member_id = v_actor;
  if coalesce(v_spendable, 0) < greatest(15, v_cost) then raise exception 'INSUFFICIENT_MILLI'; end if;
  insert into public.takeovers(family_id, task_id, initiator_member_id, recipient_member_id, cost_milli)
  values(v_family, v_task.id, v_actor, p_recipient_member_id, v_cost)
  returning id into v_takeover_id;
  insert into public.wallet_reservations(family_id, member_id, amount_milli, source_type, source_id)
  values(v_family, v_actor, v_cost, 'takeover', v_takeover_id);
  update public.tasks set assigned_member_id = p_recipient_member_id, status = 'assigned', updated_at = now() where id = p_task_id;
  v_result := jsonb_build_object('takeoverId', v_takeover_id, 'costMilli', v_cost, 'reservedMilli', v_cost);
  perform public._save_idempotency(v_family, 'create_takeover', p_idempotency_key, v_result); return v_result;
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
    select * into v_completion from public.task_completions where task_id = v_take.task_id;
    if not found or v_completion.performed_by_member_id <> v_take.recipient_member_id then raise exception 'INVALID_STATE'; end if;
    insert into public.wallet_ledger(family_id, member_id, kind, amount_milli, takeover_id, idempotency_key, description, created_by)
    values(v_family, v_take.initiator_member_id, 'takeover_cost', -v_take.cost_milli, v_take.id, p_idempotency_key, 'Completed takeover cost', v_actor);
    update public.takeovers set status = 'completed', pending_parent_review = false, resolved_at = now(), resolution_reason = 'Completed' where id = v_take.id;
    update public.wallet_reservations set status = 'consumed', updated_at = now() where id = v_res.id;
    insert into public.task_completion_attributions(family_id, completion_id, member_id, attribution_kind)
    values(v_family, v_completion.id, v_take.initiator_member_id, 'payer') on conflict do nothing;
  end if;
  v_result := jsonb_build_object('status', case when p_resolution = 'refused' then 'refused' else 'completed' end, 'pendingParentReview', p_resolution = 'refused');
  perform public._save_idempotency(v_family, 'resolve_takeover', p_idempotency_key, v_result); return v_result;
end
$$;

create or replace function public.create_deal(p_provider_member_id uuid, p_description text, p_price_milli integer, p_due_at timestamptz, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.current_member_id(); v_family uuid := public.current_family_id(); v_deal public.market_deals%rowtype; v_result jsonb; v_existing jsonb;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_existing := public._idempotency_result(v_family, v_actor, 'create_deal', p_idempotency_key, jsonb_build_object('providerMemberId', p_provider_member_id, 'description', p_description, 'priceMilli', p_price_milli, 'dueAt', p_due_at));
  if v_existing is not null then return v_existing; end if;
  if public.current_member_role() <> 'participant' or p_price_milli <= 0 or p_due_at <= now() then raise exception 'INVALID_STATE'; end if;
  perform public.assert_member_family(p_provider_member_id, v_family);
  if p_provider_member_id = v_actor or not exists (select 1 from public.members where id = p_provider_member_id and role = 'participant') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  insert into public.market_deals(family_id, buyer_member_id, provider_member_id, description, price_milli, due_at)
  values(v_family, v_actor, p_provider_member_id, trim(p_description), p_price_milli, p_due_at) returning * into v_deal;
  v_result := jsonb_build_object('dealId', v_deal.id, 'status', 'proposed');
  perform public._save_idempotency(v_family, 'create_deal', p_idempotency_key, v_result); return v_result;
end
$$;

create or replace function public.accept_deal(p_deal_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.current_member_id(); v_family uuid := public.current_family_id(); v_deal public.market_deals%rowtype; v_spendable integer; v_result jsonb; v_existing jsonb;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_existing := public._idempotency_result(v_family, v_actor, 'accept_deal', p_idempotency_key, jsonb_build_object('dealId', p_deal_id));
  if v_existing is not null then return v_existing; end if;
  select * into v_deal from public.market_deals where id = p_deal_id and family_id = v_family for update;
  if not found or v_deal.status <> 'proposed' or v_deal.provider_member_id <> v_actor then raise exception 'INVALID_STATE'; end if;
  -- Serialize reservations for the buyer so concurrent deals cannot oversubscribe the wallet.
  perform 1 from public.members where id = v_deal.buyer_member_id for update;
  select spendable_milli into v_spendable from public.member_balances where member_id = v_deal.buyer_member_id;
  if coalesce(v_spendable, 0) < v_deal.price_milli then raise exception 'INSUFFICIENT_MILLI'; end if;
  insert into public.wallet_reservations(family_id, member_id, amount_milli, source_type, source_id)
  values(v_family, v_deal.buyer_member_id, v_deal.price_milli, 'deal', v_deal.id);
  update public.market_deals set status = 'accepted' where id = v_deal.id;
  v_result := jsonb_build_object('status', 'accepted', 'reservedMilli', v_deal.price_milli);
  perform public._save_idempotency(v_family, 'accept_deal', p_idempotency_key, v_result); return v_result;
end
$$;

create or replace function public.settle_deal(p_deal_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.current_member_id(); v_family uuid := public.current_family_id(); v_deal public.market_deals%rowtype; v_res public.wallet_reservations%rowtype; v_buyer integer; v_provider integer; v_result jsonb; v_existing jsonb;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_existing := public._idempotency_result(v_family, v_actor, 'settle_deal', p_idempotency_key, jsonb_build_object('dealId', p_deal_id));
  if v_existing is not null then return v_existing; end if;
  select * into v_deal from public.market_deals where id = p_deal_id and family_id = v_family for update;
  if not found or v_deal.status <> 'accepted' or (v_actor <> v_deal.provider_member_id and v_actor <> v_deal.buyer_member_id and public.current_member_role() <> 'parent') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_res from public.wallet_reservations where source_type = 'deal' and source_id = v_deal.id and status = 'reserved' for update;
  if not found then raise exception 'INVALID_STATE'; end if;
  insert into public.wallet_ledger(family_id, member_id, kind, amount_milli, deal_id, description, created_by)
  values(v_family, v_deal.buyer_member_id, 'deal_transfer', -v_deal.price_milli, v_deal.id, 'Market deal payment', v_actor),
        (v_family, v_deal.provider_member_id, 'deal_transfer', v_deal.price_milli, v_deal.id, 'Market deal receipt', v_actor);
  update public.wallet_reservations set status = 'consumed', updated_at = now() where id = v_res.id;
  update public.market_deals set status = 'settled', performed_at = now(), settled_at = now() where id = v_deal.id;
  select balance_milli into v_buyer from public.member_balances where member_id = v_deal.buyer_member_id;
  select balance_milli into v_provider from public.member_balances where member_id = v_deal.provider_member_id;
  v_result := jsonb_build_object('status', 'settled', 'buyerBalance', v_buyer, 'providerBalance', v_provider);
  perform public._save_idempotency(v_family, 'settle_deal', p_idempotency_key, v_result); return v_result;
end
$$;

create or replace function public.apply_parent_correction(p_target_type text, p_target_id uuid, p_reason text, p_changes jsonb, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.current_member_id(); v_family uuid := public.current_family_id(); v_take public.takeovers%rowtype; v_result jsonb; v_existing jsonb; v_member uuid; v_delta integer; v_before jsonb; v_after jsonb; v_audit uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if public.current_member_role() <> 'parent' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'INVALID_STATE'; end if;
  v_existing := public._idempotency_result(v_family, v_actor, 'apply_parent_correction', p_idempotency_key, jsonb_build_object('targetType', p_target_type, 'targetId', p_target_id, 'reason', p_reason, 'changes', p_changes));
  if v_existing is not null then return v_existing; end if;
  if p_target_type = 'takeover' and coalesce((p_changes->>'confirmPenalty')::boolean, false) then
    select * into v_take from public.takeovers where id = p_target_id and family_id = v_family for update;
    if not found or v_take.status <> 'refused' or not v_take.pending_parent_review then raise exception 'INVALID_STATE'; end if;
    insert into public.wallet_ledger(family_id, member_id, kind, amount_milli, takeover_id, description, created_by)
    values(v_family, v_take.recipient_member_id, 'penalty', -v_take.cost_milli, v_take.id, 'Confirmed takeover refusal', v_actor);
    update public.takeovers set pending_parent_review = false where id = v_take.id;
    v_before := jsonb_build_object('pendingParentReview', true);
    v_after := jsonb_build_object('pendingParentReview', false, 'penaltyMilli', v_take.cost_milli);
  elsif p_target_type = 'wallet' then
    v_member := (p_changes->>'memberId')::uuid; v_delta := (p_changes->>'deltaMilli')::integer;
    if v_member is null or v_delta is null or v_delta = 0 then raise exception 'INVALID_STATE'; end if;
    perform public.assert_member_family(v_member, v_family);
    insert into public.wallet_ledger(family_id, member_id, kind, amount_milli, description, created_by)
    values(v_family, v_member, 'correction', v_delta, 'Parent correction: ' || p_reason, v_actor);
    v_before := '{}'::jsonb; v_after := jsonb_build_object('memberId', v_member, 'deltaMilli', v_delta);
  elsif p_target_type = 'task' then
    declare
      v_task public.tasks%rowtype;
      v_assignee uuid;
      v_status text;
      v_reward integer;
      v_due timestamptz;
    begin
      if p_changes = '{}'::jsonb or exists (select 1 from jsonb_object_keys(p_changes) as keys(key) where key not in ('assignedMemberId', 'status', 'rewardMilli', 'dueAt')) then
        raise exception 'INVALID_STATE';
      end if;
      select * into v_task from public.tasks where id = p_target_id and family_id = v_family for update;
      if not found then raise exception 'INVALID_STATE'; end if;
      v_assignee := v_task.assigned_member_id;
      v_status := v_task.status;
      v_reward := v_task.reward_milli;
      v_due := v_task.due_at;
      if p_changes ? 'assignedMemberId' then
        if jsonb_typeof(p_changes->'assignedMemberId') = 'null' then v_assignee := null;
        else v_assignee := (p_changes->>'assignedMemberId')::uuid;
        end if;
        if v_assignee is not null then
          perform public.assert_member_family(v_assignee, v_family);
          if not exists (select 1 from public.members where id = v_assignee and role = 'participant' and is_active) then raise exception 'INVALID_STATE'; end if;
        end if;
      end if;
      if p_changes ? 'status' then v_status := p_changes->>'status'; end if;
      if v_status not in ('planned', 'open', 'assigned', 'completed', 'expired', 'cancelled') then raise exception 'INVALID_STATE'; end if;
      if p_changes ? 'rewardMilli' then
        if jsonb_typeof(p_changes->'rewardMilli') = 'null' then v_reward := null; else v_reward := (p_changes->>'rewardMilli')::integer; end if;
        if v_reward is not null and v_reward <= 0 then raise exception 'INVALID_STATE'; end if;
      end if;
      if p_changes ? 'dueAt' then v_due := (p_changes->>'dueAt')::timestamptz; end if;
      if v_due < v_task.opening_at then raise exception 'INVALID_STATE'; end if;
      if v_task.status = 'completed' and (v_status <> 'completed' or v_reward is distinct from v_task.reward_milli or v_assignee is distinct from v_task.assigned_member_id) then raise exception 'INVALID_STATE'; end if;
      if v_status in ('assigned', 'completed') and (v_assignee is null or v_reward is null) then raise exception 'INVALID_STATE'; end if;
      if v_status = 'completed' and not exists (select 1 from public.task_completions tc where tc.task_id = v_task.id) then raise exception 'INVALID_STATE'; end if;
      if v_assignee is not distinct from v_task.assigned_member_id and v_status = v_task.status and v_reward is not distinct from v_task.reward_milli and v_due = v_task.due_at then raise exception 'INVALID_STATE'; end if;
      update public.tasks
      set assigned_member_id = v_assignee,
          status = v_status,
          reward_milli = v_reward,
          due_at = v_due,
          assignment_protected = case when p_changes ? 'assignedMemberId' then true else assignment_protected end,
          updated_at = now()
      where id = v_task.id;
      v_before := jsonb_build_object('assignedMemberId', v_task.assigned_member_id, 'status', v_task.status, 'rewardMilli', v_task.reward_milli, 'dueAt', v_task.due_at, 'assignmentProtected', v_task.assignment_protected);
      v_after := jsonb_build_object('assignedMemberId', v_assignee, 'status', v_status, 'rewardMilli', v_reward, 'dueAt', v_due, 'assignmentProtected', case when p_changes ? 'assignedMemberId' then true else v_task.assignment_protected end);
    end;
  else
    -- The audit trail is deliberately available for future correction targets; unsupported mutations fail closed.
    raise exception 'INVALID_STATE';
  end if;
  insert into public.audit_events(family_id, actor_member_id, event_type, target_type, target_id, reason, previous_values, new_values)
  values(v_family, v_actor, 'parent_correction', p_target_type, p_target_id, p_reason, v_before, v_after) returning id into v_audit;
  v_result := jsonb_build_object('auditEventId', v_audit);
  perform public._save_idempotency(v_family, 'apply_parent_correction', p_idempotency_key, v_result); return v_result;
end
$$;

create or replace function public.generate_weekly_tasks(p_family_id uuid, p_week_start date default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_week date := coalesce(p_week_start, (current_date - (extract(isodow from current_date)::integer - 1))::date); v_day date; v_cfg public.scheduler_config%rowtype; v_activity public.activity_catalog%rowtype; v_count integer := 0; v_open timestamptz; v_due timestamptz; v_candidate uuid; v_meal_type text;
begin
  select * into v_cfg from public.scheduler_config where family_id = p_family_id;
  if not found then raise exception 'INVALID_STATE'; end if;
  select * into v_activity from public.activity_catalog where family_id = p_family_id and code = 'dishes' and is_active;
  if not found then return 0; end if;
  for v_day in select generate_series(v_week, v_week + 6, interval '1 day')::date loop
    v_open := ((v_day + v_cfg.dinner_open_local_time) at time zone v_cfg.timezone);
    v_due := ((v_day + v_cfg.dinner_due_local_time) at time zone v_cfg.timezone);
    insert into public.tasks(family_id, activity_id, occurrence_key, title, scheduled_for, opening_at, due_at)
    values(p_family_id, v_activity.id, 'dishes:dinner:' || v_day, 'Piatti - cena', v_open, v_open, v_due) on conflict do nothing;
    v_meal_type := 'dinner';
    select m.id into v_candidate
    from public.members m
    join public.planned_meal_attendance p on p.member_id = m.id and p.meal_date = v_day and p.meal_type = v_meal_type and p.status = 'present'
    where m.family_id = p_family_id and m.role = 'participant' and m.is_active
    order by
      (select coalesce(sum(coalesce(t2.reward_milli, ac2.base_reward_milli)), 0)
       from public.tasks t2 join public.activity_catalog ac2 on ac2.id = t2.activity_id
       where t2.family_id = p_family_id and t2.assigned_member_id = m.id and t2.status in ('planned', 'open', 'assigned'))::numeric /
      greatest((select count(*) from public.planned_meal_attendance pp where pp.member_id = m.id and pp.meal_date between v_week and v_week + 6 and pp.status = 'present'), 1), m.id
    limit 1;
    update public.tasks set assigned_member_id = v_candidate, assigned_automatically = true, updated_at = now()
    where family_id = p_family_id and occurrence_key = 'dishes:dinner:' || v_day and status = 'planned' and not assignment_protected;
    if extract(isodow from v_day) in (6, 7) then
      v_open := ((v_day + v_cfg.lunch_open_local_time) at time zone v_cfg.timezone); v_due := ((v_day + v_cfg.lunch_due_local_time) at time zone v_cfg.timezone);
      insert into public.tasks(family_id, activity_id, occurrence_key, title, scheduled_for, opening_at, due_at)
      values(p_family_id, v_activity.id, 'dishes:lunch:' || v_day, 'Piatti - pranzo', v_open, v_open, v_due) on conflict do nothing;
      v_meal_type := 'lunch';
      select m.id into v_candidate
      from public.members m
      join public.planned_meal_attendance p on p.member_id = m.id and p.meal_date = v_day and p.meal_type = v_meal_type and p.status = 'present'
      where m.family_id = p_family_id and m.role = 'participant' and m.is_active
      order by
        (select coalesce(sum(coalesce(t2.reward_milli, ac2.base_reward_milli)), 0)
         from public.tasks t2 join public.activity_catalog ac2 on ac2.id = t2.activity_id
         where t2.family_id = p_family_id and t2.assigned_member_id = m.id and t2.status in ('planned', 'open', 'assigned'))::numeric /
        greatest((select count(*) from public.planned_meal_attendance pp where pp.member_id = m.id and pp.meal_date between v_week and v_week + 6 and pp.status = 'present'), 1), m.id
      limit 1;
      update public.tasks set assigned_member_id = v_candidate, assigned_automatically = true, updated_at = now()
      where family_id = p_family_id and occurrence_key = 'dishes:lunch:' || v_day and status = 'planned' and not assignment_protected;
    end if;
  end loop;
  select count(*) into v_count from public.tasks where family_id = p_family_id and scheduled_for >= (v_week::timestamp at time zone v_cfg.timezone) and scheduled_for < ((v_week + 7)::timestamp at time zone v_cfg.timezone) and occurrence_key like 'dishes:%';
  return v_count;
end
$$;

create or replace function public.open_scheduled_tasks(p_family_id uuid, p_at timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare v_task public.tasks%rowtype; v_candidates uuid[]; v_candidate uuid; v_reward integer; v_count integer := 0; v_base integer; v_preserve boolean;
begin
  for v_task in select t.* from public.tasks t where t.family_id = p_family_id and t.status = 'planned' and t.opening_at <= p_at for update loop
    select array_agg(m.id order by m.id) into v_candidates
    from public.members m
    join public.planned_meal_attendance p on p.member_id = m.id and p.meal_date = (v_task.scheduled_for at time zone (select timezone from public.families where id = p_family_id))::date and p.meal_type = case when v_task.title ilike '%pranzo%' then 'lunch' else 'dinner' end and p.status = 'present'
    where m.family_id = p_family_id and m.role = 'participant' and m.is_active;
    select base_reward_milli into v_base from public.activity_catalog where id = v_task.activity_id;
    if coalesce(array_length(v_candidates, 1), 0) = 0 then
      if v_task.assignment_protected and v_task.assigned_member_id is not null then
        update public.tasks set status = 'assigned', reward_milli = v_base, reward_snapshot_at = p_at, updated_at = now() where id = v_task.id;
      else
        update public.tasks set status = 'open', assigned_member_id = null, reward_milli = v_base, reward_snapshot_at = p_at, updated_at = now() where id = v_task.id;
      end if;
    else
      v_preserve := v_task.assignment_protected or v_task.assigned_member_id = any(v_candidates);
      if not v_preserve then
        -- Stable, proportional first release: choose the present child with the smallest base-reward load per planned day.
        select c into v_candidate from unnest(v_candidates) c order by (select coalesce(sum(coalesce(t2.reward_milli, ac2.base_reward_milli)), 0) from public.tasks t2 join public.activity_catalog ac2 on ac2.id = t2.activity_id where t2.assigned_member_id = c and t2.family_id = p_family_id and t2.status in ('planned', 'open', 'assigned'))::numeric / greatest((select count(*) from public.planned_meal_attendance pp where pp.member_id = c and pp.status = 'present'), 1), c limit 1;
      else
        v_candidate := v_task.assigned_member_id;
      end if;
      v_reward := case when array_length(v_candidates, 1) = 1 then ceil(v_base / 2.0)::integer else v_base end;
      update public.tasks set status = 'assigned', assigned_member_id = v_candidate, reward_milli = v_reward, reward_snapshot_at = p_at, assigned_automatically = true, updated_at = now() where id = v_task.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

create or replace function public.reassign_future_tasks(p_family_id uuid, p_member_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.tasks set assigned_member_id = null, status = case when reward_milli is null then 'planned' else 'open' end, updated_at = now()
  where family_id = p_family_id and assigned_member_id = p_member_id and opening_at > now() and not assignment_protected and status in ('planned', 'open', 'assigned');
  get diagnostics v_count = row_count; return v_count;
end
$$;

-- RLS: authenticated users read only their family. Mutations of balances/tasks/deals happen through RPCs.
do $$ declare t text; begin
  foreach t in array array['families','members','invitations','activity_catalog','planned_meal_attendance','actual_meal_attendance','presence_events','tasks','task_completions','task_completion_attributions','wallet_ledger','wallet_reservations','takeovers','market_deals','nfc_tags','idempotency_keys','audit_events','notifications','scheduler_config','scheduler_runs'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy families_select on public.families for select using (public.is_family_member(id));
create policy members_select on public.members for select using (public.is_family_member(family_id));
create policy family_read_activity on public.activity_catalog for select using (public.is_family_member(family_id));
create policy family_read_meals on public.planned_meal_attendance for select using (public.is_family_member(family_id));
create policy family_read_actual_meals on public.actual_meal_attendance for select using (public.is_family_member(family_id));
create policy family_read_presence on public.presence_events for select using (public.is_family_member(family_id));
create policy family_read_tasks on public.tasks for select using (public.is_family_member(family_id));
create policy family_read_completions on public.task_completions for select using (public.is_family_member(family_id));
create policy family_read_attributions on public.task_completion_attributions for select using (public.is_family_member(family_id));
create policy family_read_wallet on public.wallet_ledger for select using (public.is_family_member(family_id));
create policy family_read_reservations on public.wallet_reservations for select using (public.is_family_member(family_id));
create policy family_read_takeovers on public.takeovers for select using (public.is_family_member(family_id));
create policy family_read_deals on public.market_deals for select using (public.is_family_member(family_id));
create policy family_read_tags on public.nfc_tags for select using (public.is_family_member(family_id));
create policy family_read_audit on public.audit_events for select using (public.is_family_member(family_id) and (public.current_member_role() = 'parent' or actor_member_id = public.current_member_id()));
create policy family_read_notifications on public.notifications for select using (member_id = public.current_member_id());
create policy family_update_notifications on public.notifications for update using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());
create policy family_read_scheduler on public.scheduler_runs for select using (public.is_family_member(family_id) and public.current_member_role() = 'parent');

revoke all on all functions in schema public from public;
grant select on public.families, public.members, public.activity_catalog, public.planned_meal_attendance,
  public.actual_meal_attendance, public.presence_events, public.tasks, public.task_completions,
  public.task_completion_attributions, public.wallet_ledger, public.wallet_reservations,
  public.takeovers, public.market_deals, public.nfc_tags, public.notifications,
  public.audit_events, public.scheduler_runs, public.member_balances, public.current_home_presence
  to authenticated;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.current_member_role() to authenticated;
grant execute on function public.current_family_id() to authenticated;
grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.create_invitation(text, text, timestamptz) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.record_presence(text, timestamptz, text) to authenticated;
grant execute on function public.set_meal_plan(date, text, text) to authenticated;
grant execute on function public.confirm_meal_attendance(uuid, date, text, boolean) to authenticated;
grant execute on function public.set_member_role(uuid, text) to authenticated;
grant execute on function public.create_managed_member(text, text) to authenticated;
grant execute on function public.set_member_active(uuid, boolean) to authenticated;
grant execute on function public.create_on_demand_task(text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.complete_task(uuid, uuid, uuid) to authenticated;
grant execute on function public.create_takeover(uuid, uuid, uuid) to authenticated;
grant execute on function public.resolve_takeover(uuid, text, uuid) to authenticated;
grant execute on function public.create_deal(uuid, text, integer, timestamptz, uuid) to authenticated;
grant execute on function public.accept_deal(uuid, uuid) to authenticated;
grant execute on function public.settle_deal(uuid, uuid) to authenticated;
grant execute on function public.apply_parent_correction(text, uuid, text, jsonb, uuid) to authenticated;
