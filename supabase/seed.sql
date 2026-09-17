-- Synthetic local/demo data only. No auth identities or real email addresses are created.
insert into public.families(id, name, timezone)
values ('00000000-0000-0000-0000-000000000001', 'House S.p.A. Demo', 'Europe/Rome')
on conflict (id) do nothing;

insert into public.scheduler_config(family_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (family_id) do nothing;

insert into public.members(id, family_id, display_name, role, is_meal_attendee)
values
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'Child 1', 'participant', true),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'Child 2', 'participant', true),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'Child 3', 'participant', true),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Mamma', 'parent', true),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Papà', 'parent', true),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Cleaning Lady', 'referee', true)
on conflict (id) do nothing;

insert into public.activity_catalog(family_id, code, label, base_reward_milli, single_participant_reward_milli)
values
  ('00000000-0000-0000-0000-000000000001', 'dishes', 'Piatti', 3, 2),
  ('00000000-0000-0000-0000-000000000001', 'rubbish', 'Spazzatura', 1, 1),
  ('00000000-0000-0000-0000-000000000001', 'parcel', 'Pacco Amazon', 2, 1)
on conflict (family_id, code) do nothing;

insert into public.nfc_tags(family_id, token_hash, label, action)
values
  ('00000000-0000-0000-0000-000000000001', encode(digest('demo-arrive', 'sha256'), 'hex'), 'Arrivo', 'arrive'),
  ('00000000-0000-0000-0000-000000000001', encode(digest('demo-leave', 'sha256'), 'hex'), 'Uscita', 'leave'),
  ('00000000-0000-0000-0000-000000000001', encode(digest('demo-dishes', 'sha256'), 'hex'), 'Piatti', 'dishes'),
  ('00000000-0000-0000-0000-000000000001', encode(digest('demo-rubbish', 'sha256'), 'hex'), 'Spazzatura', 'rubbish'),
  ('00000000-0000-0000-0000-000000000001', encode(digest('demo-parcel', 'sha256'), 'hex'), 'Pacco', 'parcel')
on conflict (token_hash) do nothing;

insert into public.planned_meal_attendance(family_id, member_id, meal_date, meal_type, status)
select '00000000-0000-0000-0000-000000000001', id, current_date + d, mt, 'present'
from public.members cross join generate_series(0, 6) as days(d) cross join (values ('dinner'), ('lunch')) as meals(mt)
where role in ('participant', 'parent') and (mt = 'dinner' or extract(isodow from current_date + d) in (6, 7))
on conflict (member_id, meal_date, meal_type) do nothing;
