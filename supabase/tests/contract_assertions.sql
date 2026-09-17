-- Deterministic SQL assertions for CI/local validation. Run after `supabase db reset`.
do $$
declare
  required text[] := array[
    'families','members','invitations','activity_catalog','planned_meal_attendance',
    'actual_meal_attendance','presence_events','tasks','task_completions',
    'task_completion_attributions','wallet_ledger','wallet_reservations','takeovers',
    'market_deals','nfc_tags','idempotency_keys','audit_events','notifications',
    'scheduler_config','scheduler_runs'
  ];
  item text;
begin
  foreach item in array required loop
    if to_regclass('public.' || item) is null then raise exception 'missing table %', item; end if;
  end loop;
  if to_regprocedure('public.complete_task(uuid,uuid,uuid,text,text)') is null then raise exception 'missing complete_task'; end if;
  if to_regprocedure('public.record_presence(text,timestamp with time zone,text)') is null then raise exception 'missing record_presence'; end if;
  if to_regprocedure('public.invalidate_task_completion(uuid,text,uuid)') is null then raise exception 'missing invalidate_task_completion'; end if;
  if to_regprocedure('public.create_takeover(uuid,uuid,uuid)') is null then raise exception 'missing create_takeover'; end if;
  if to_regprocedure('public.resolve_takeover(uuid,text,uuid)') is null then raise exception 'missing resolve_takeover'; end if;
  if to_regprocedure('public.create_deal(uuid,text,integer,timestamp with time zone,uuid)') is null then raise exception 'missing create_deal'; end if;
  if to_regprocedure('public.accept_deal(uuid,uuid)') is null then raise exception 'missing accept_deal'; end if;
  if to_regprocedure('public.settle_deal(uuid,uuid)') is null then raise exception 'missing settle_deal'; end if;
  if to_regprocedure('public.apply_parent_correction(text,uuid,text,jsonb,uuid)') is null then raise exception 'missing apply_parent_correction'; end if;
  if to_regprocedure('public.create_managed_member(text,text)') is null then raise exception 'missing create_managed_member'; end if;
  if to_regprocedure('public.set_member_active(uuid,boolean)') is null then raise exception 'missing set_member_active'; end if;
  if not has_function_privilege('authenticated', 'public.is_family_member(uuid)', 'EXECUTE') then raise exception 'authenticated RLS helper grant missing'; end if;
  if not has_function_privilege('authenticated', 'public.create_managed_member(text,text)', 'EXECUTE') then raise exception 'authenticated create_managed_member grant missing'; end if;
  if not has_function_privilege('authenticated', 'public.set_member_active(uuid,boolean)', 'EXECUTE') then raise exception 'authenticated set_member_active grant missing'; end if;
  if not has_function_privilege('authenticated', 'public.invalidate_task_completion(uuid,text,uuid)', 'EXECUTE') then raise exception 'authenticated invalidate_task_completion grant missing'; end if;
  if not has_function_privilege('authenticated', 'public.record_presence(text,timestamp with time zone,text)', 'EXECUTE') then raise exception 'authenticated record_presence grant missing'; end if;
  if has_function_privilege('anon', 'public.create_managed_member(text,text)', 'EXECUTE') then raise exception 'anon create_managed_member grant is too broad'; end if;
  if has_function_privilege('anon', 'public.set_member_active(uuid,boolean)', 'EXECUTE') then raise exception 'anon set_member_active grant is too broad'; end if;
  if has_function_privilege('anon', 'public.is_family_member(uuid)', 'EXECUTE') then raise exception 'anon RLS helper grant is too broad'; end if;
  if (select count(*) from public.activity_catalog) < 3 then raise exception 'seed activity catalog incomplete'; end if;
  if (select count(*) from public.members where family_id = '00000000-0000-0000-0000-000000000001') < 6 then raise exception 'seed members incomplete'; end if;
  if exists (
    select 1 from public.members
    where family_id = '00000000-0000-0000-0000-000000000001'
      and display_name not in ('Child 1', 'Child 2', 'Child 3', 'Mamma', 'Papà', 'Cleaning Lady')
  ) then raise exception 'seed member display names are not anonymized'; end if;
  if exists (
    select 1
    from (values
      ('00000000-0000-0000-0001-000000000001'::uuid, 'Child 1'),
      ('00000000-0000-0000-0001-000000000002'::uuid, 'Child 2'),
      ('00000000-0000-0000-0001-000000000003'::uuid, 'Child 3'),
      ('00000000-0000-0000-0000-000000000002'::uuid, 'Mamma'),
      ('00000000-0000-0000-0000-000000000003'::uuid, 'Papà'),
      ('00000000-0000-0000-0000-000000000004'::uuid, 'Cleaning Lady')
    ) as expected(id, display_name)
    left join public.members member on member.id = expected.id
    where member.id is null
       or member.family_id <> '00000000-0000-0000-0000-000000000001'::uuid
       or member.display_name <> expected.display_name
  ) then raise exception 'seed UUID-to-display-name mapping is incorrect'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'wallet_ledger') = 0 then raise exception 'wallet RLS missing'; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'one_valid_completion_per_task') then raise exception 'valid completion uniqueness missing'; end if;
end $$;

-- Constraint assertions use a savepoint so they are safe to run in a transaction.
do $$
begin
  begin
    insert into public.activity_catalog(family_id, code, label, base_reward_milli, single_participant_reward_milli)
    values ('00000000-0000-0000-0000-000000000001', 'invalid', 'Invalid', 1, 2);
    raise exception 'reward constraint did not reject oversized single reward';
exception when check_violation then null;
  end;
end $$;
