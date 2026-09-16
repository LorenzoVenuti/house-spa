# Deployment procedure

This document is a procedure for a future private Milli e Misfatti pilot. **No live deployment, Supabase project, Cloudflare Pages site, production scheduler, or SMTP integration has been created or configured by this project work.** Version 1.1.3 currently runs locally in Demo Mode.

The intended managed-service shape is a static React frontend on Cloudflare Pages, a Supabase project in an EU region for authentication and PostgreSQL, and Resend SMTP for invitation and recovery email. No payment service is in scope.

## Preconditions

Before provisioning any service:

1. Complete the gates in [RELEASE.md](./RELEASE.md).
2. Create and review a private GitHub repository only through an explicitly authorized publication workflow.
3. Confirm service ownership, billing responsibility, target region, data retention, and administrator access.
4. Confirm the physical NFC tags and supported phones in a local test.
5. Record a rollback owner and a secure incident-reporting channel.

## Proposed service setup

1. Create separate Supabase environments only when the pilot requires them. At minimum, keep local development separate from any live family data.
2. Apply migrations from `supabase/migrations/` in filename order to the intended Supabase project. Do not seed real environments with family or demo identities.
3. Configure private, invitation-only Supabase Auth. Public sign-up remains disabled.
4. Configure a verified sender in Resend and connect it to Supabase only after invitation and password-reset copy has been reviewed.
5. Configure a trusted scheduler, such as Supabase Cron, to call the reviewed weekly-generation and task-opening database functions. The migration does not create an external production schedule.
6. Create a Cloudflare Pages project for the authorized private repository with build command `npm run build`, output directory `dist`, and Node.js 24.
7. Add environment variables separately for preview and production, then test role boundaries before promotion.

## Environment variables

| Variable | Used by | Secret | Notes |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser | No | Project URL for the selected environment |
| `VITE_SUPABASE_ANON_KEY` | Browser | No | Public anonymous key; Row Level Security is mandatory |
| `SUPABASE_ACCESS_TOKEN` | Local/CI administration | Yes | Keep in a secret manager; never commit it |
| `SUPABASE_PROJECT_REF` | Local/CI administration | No | Environment-specific project reference |
| `RESEND_API_KEY` | SMTP setup | Yes | Configure server-side, never in the frontend |
| `CLOUDFLARE_API_TOKEN` | Optional deployment tooling | Yes | Restrict to the intended Pages project |
| `CLOUDFLARE_ACCOUNT_ID` | Optional deployment tooling | No | Cloudflare account identifier |

Local development uses an ignored `.env.local` file:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Never expose a Supabase service-role key in a browser variable or client bundle.

## Database preparation

Run migrations from a clean, reviewed checkout. Link and push only after confirming the target reference:

```bash
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push
```

Before any production migration, create an export or provider backup, verify that it is readable, record the applied migration filenames, and plan a forward corrective migration. The repository contains database functions but no Supabase Edge Functions directory.

## Cloudflare Pages promotion

The checked-in CI workflow verifies the project and never deploys. Configure preview builds only after a private remote exists. Promote production manually after the v1.1.3 release checklist passes and the exact commit, Pages project, environment variables, and target URL are confirmed.

The intended Pages project slug is `milli-e-misfatti`; `wrangler.toml` contains build metadata only. Installing or authenticating deployment tooling and executing a publish command are separate, explicitly authorized actions.

## Post-deployment smoke test

In a non-production environment first, verify:

- invitation-only login and recovery email;
- participant, referee, and parent navigation and denied actions;
- Today and calendar reads;
- one explicit presence update and one NFC confirmation route;
- family-profile creation, deactivation, reactivation, and history preservation;
- idempotent wallet, takeover, deal, and correction operations;
- scheduler timing in `Europe/Rome`, including a daylight-saving boundary;
- offline and failed-network behavior without queued financial writes.

Do not use a real milli transfer as a production smoke test.

## Rollback and recovery

- Frontend: select the previous verified immutable Pages deployment.
- Database: prefer a forward corrective migration. Restore a backup only after writes are paused and the possible loss window is recorded.
- Scheduler: disable the external job before correcting duplicate or mistimed runs, then inspect `scheduler_runs`.
- Auth and SMTP: retain the previous redirect and sender configuration until the new release is verified.

After rollback, verify login, Today, a read-only calendar view, and one NFC route. If wallet or takeover writes were involved, reconcile the audit log before reopening writes.

## Pilot caveats

Free service tiers can sleep, throttle, or impose quotas. Review current provider terms before provisioning. The connected pilot must treat server-confirmed writes as authoritative, must not queue wallet mutations offline, and must expose scheduler and backup health to parent administrators before the family relies on the service.
