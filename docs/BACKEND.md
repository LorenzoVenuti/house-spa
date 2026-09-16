# Milli e Misfatti backend

This document describes backend contract version 1.1.3. The backend is a family-scoped Supabase/PostgreSQL schema. All money-like operations are ledger transactions; the client never writes balances directly.

## Local development

Install the Supabase CLI using its official package for the developer machine, then run:

```sh
supabase start
supabase db reset
supabase test db
```

The local project uses `supabase/config.toml`, migrations under `supabase/migrations/`, and synthetic data from `supabase/seed.sql`. The seed has no auth identities and no real email addresses. To exercise RPCs, create local auth users and attach their UUIDs to the six demo `members.auth_user_id` values using the local Studio or a service-role SQL session.

## Data and authorization

All domain rows carry `family_id`. RLS allows authenticated family members to read shared household records. Parent-only audit data and notifications are narrower. Mutations involving managed members, tasks, reservations, wallet entries, takeovers, deals, and corrections are exposed as security-definer RPCs with server-side role and family checks.

Important RPCs are `create_managed_member`, `set_member_active`, `complete_task`, `create_takeover`, `resolve_takeover`, `create_deal`, `accept_deal`, `settle_deal`, and `apply_parent_correction`. Transactional task, takeover, deal, and correction RPCs require a UUID idempotency key. A retry with the same operation/key and request returns the stored result; a reused key with different input raises `IDEMPOTENCY_CONFLICT`.

## Managed members

`create_managed_member(p_display_name text, p_role text)` is parent-only. It trims and validates a 2–40 character display name, accepts only `participant`, `referee`, or `parent`, and enforces case-insensitive name uniqueness across active and inactive family members. The new profile is active and receives `unknown` meal-plan rows for the current seven-day window: dinner every day and lunch on Saturday and Sunday. Creation is recorded in `audit_events`.

`set_member_active(p_member_id uuid, p_active boolean)` is parent-only and preserves the member row and all historical relationships. Deactivation rejects the acting parent's own profile and never permits removal of the final active parent. Reactivation uses the same RPC. Every status change is recorded in `audit_events`; inactive members cannot authenticate as the current household member.

## Scheduler

`generate_weekly_tasks(family_id, week_start)` creates the following Monday-Sunday dinner occurrences and weekend lunch occurrences. `open_scheduled_tasks(family_id, at)` opens tasks at their Europe/Rome local time, snapshots the reward, and selects from children marked present in the planned meal calendar. Exactly one available child receives the rounded-up half reward. No available child leaves a task open. `scheduler_config` stores the local schedule and `scheduler_runs` is the idempotent job log.

Production scheduling should call these functions from Supabase Cron or an equivalent trusted worker. The migration does not install a live external cron job.

## Tests and limitations

`supabase/tests/contract_assertions.sql` provides deterministic schema, signature, grant, seed, and constraint checks. `supabase/tests/rpc_invariants.sql` creates transactional synthetic auth fixtures and exercises authorization, idempotency, member management, meal seeding, scheduling, takeover accounting, deal settlement, deactivation history, and inactive-member rejection. Both are intended for `supabase test db` and roll back their behavioral fixtures. No credentials, deployment, external service, real NFC hardware, push notifications, email delivery, or euro payments are configured by this slice.

The parent-correction RPC intentionally supports takeover refusal confirmation and wallet delta corrections first. Unsupported target types fail closed and are recorded only after a future migration adds their mutation contract.
