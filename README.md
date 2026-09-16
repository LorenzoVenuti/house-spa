# Milli e Misfatti

**Milli e Misfatti** is an installable, iPhone-oriented family PWA for coordinating chores, meal attendance, presence at home, and a playful internal currency called **milli**. Version **1.1.3** runs in Demo Mode. Provider setup and deployment have not been performed.

## Features

- Italian responsive interface with installable PWA metadata and branded assets
- Today view, meal planning, weekly calendar, task completion, and milli ledger
- Role-aware navigation and server-side authorization contracts
- Hostile takeovers with reserved funds and parent-reviewed refusal penalties
- Voluntary black-market deals that transfer existing milli
- NFC entry points with explicit confirmation for presence and ordinary activities
- Parent corrections with audit requirements
- Parent-only family management for adding, deactivating, and reactivating profiles
- Sunday scheduling, reduced single-participant rewards, and family-scoped data

Reverse auctions, euro fines, debt collection, Reserve payouts, and final monthly ranking are deferred. The authoritative product rules and open decisions are recorded in [DECISIONS.md](./DECISIONS.md).

## Roles and demo profiles

| Demo profile | Role | Main permissions |
| --- | --- | --- |
| Child 1, Child 2, Child 3 | Participant | Manage own attendance and presence, complete eligible tasks, use takeovers and deals, and view milli activity |
| Mamma, Papà | Parent | Manage family profiles, create tasks, record performers, apply corrections, and review penalties; participant-only deals, takeovers, and activity rewards are excluded |
| Cleaning Lady | Referee | Create ordinary tasks and record performers; cannot issue prizes or fines |

The fixed display names are anonymized. Internal fixture identifiers are stable implementation details and are not user-facing names.

In **Gestisci famiglia** at `/admin`, a parent can create a profile, deactivate it, or reactivate it. Deactivation preserves historical tasks, meals, wallet entries, takeovers, deals, and audit relationships while excluding the profile from future activity and the global profile selector. The current profile cannot deactivate itself, and the final active parent cannot be deactivated.

## Run locally

Requirements: Node.js 24 and npm.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. The development server uses port `5174` with strict port selection. Demo data persists in local browser storage; use browser site-data controls to reset it.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The SQL contract suite requires a local Supabase environment:

```bash
supabase start
supabase db reset
supabase test db
```

See [docs/BACKEND.md](./docs/BACKEND.md) for the database and authorization model.

## NFC routes

| Route | Purpose |
| --- | --- |
| `/t/entrance` | Confirm arrival or departure |
| `/t/dishes` | Confirm an open dishes task |
| `/t/rubbish` | Confirm an open rubbish task |
| `/t/parcel` | Confirm an open parcel task |

Opening an NFC URL never records an action by itself. The selected active profile must explicitly confirm the action. Physical tags and iPhone scan behavior have not yet been tested.

## Architecture and data modes

```text
React + Vite PWA
  -> application adapter contract
     -> DemoAdapter + localStorage (current visible mode)
     -> Supabase RPC boundary (connected pilot target)

Supabase Auth
  -> PostgreSQL + Row Level Security
     -> security-definer RPCs
        -> append-only wallet ledger + reservations + audit events

Cloudflare Pages configuration
  -> static build output + SPA fallback
```

Demo Mode is the currently wired user experience. The project also contains a reviewed Supabase schema, Row Level Security policies, transactional RPCs, seed data, and scheduler functions for a future connected family pilot. Login screens, provider credentials, and remote connectivity are not wired into the running frontend.

The browser must never own authoritative balance mutations in connected mode. Rewards, transfers, reservations, penalties, and corrections go through database RPCs. A Supabase service-role key must never be exposed to the frontend.

## Repository structure

- `src/app/`: routes, layout, and application context
- `src/lib/`: domain types, permissions, demo data, and adapter contract
- `src/styles/` and `src/ui/`: design system and reusable primitives
- `supabase/migrations/`: schema, RLS, RPCs, and scheduler functions
- `supabase/tests/`: SQL contract and transactional invariant tests
- `public/`: PWA manifest, icons, an unregistered static offline page, and SPA redirect
- `.github/workflows/ci.yml`: non-deploying verification workflow
- `docs/DEPLOYMENT.md`: procedural managed-service setup and rollback guidance
- `docs/RELEASE.md`: release gates and private-publication preparation

## Current limitations

- The visible app runs only in Demo Mode; real authentication and connected Supabase data are not enabled.
- No service worker or offline routing is registered; `public/offline.html` is a static branded asset, not an active fallback.
- No GitHub release, live Supabase project, Cloudflare site, production scheduler, SMTP sender, or deployment has been created by this project work.
- NFC routes are implemented, but physical tags and iPhone behavior are unverified.
- Database contract tests require the Supabase CLI or a compatible PostgreSQL test environment.
- Deferred financial and ranking rules remain unavailable, as documented in [DECISIONS.md](./DECISIONS.md).

## Security and project documents

Keep secrets out of source control and browser bundles. Family data is sensitive; use synthetic data for development and review Row Level Security and RPC role checks before any connected pilot. See [SECURITY.md](./SECURITY.md) for supported versions and vulnerability reporting.

- [Product decisions](./DECISIONS.md)
- [Changelog](./CHANGELOG.md)
- [Security policy](./SECURITY.md)
- [Deployment procedure](./docs/DEPLOYMENT.md)
- [Release procedure](./docs/RELEASE.md)
- [Backend contract](./docs/BACKEND.md)

This private repository is all rights reserved; see [LICENSE](./LICENSE).
