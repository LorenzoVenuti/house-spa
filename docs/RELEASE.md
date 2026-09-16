# Release procedure

This is the preparation and release checklist for Milli e Misfatti **v1.1.3**. No GitHub release, tag, deployment, live provider project, or production scheduler is part of the current baseline.

Releases are prepared from `main` only after review. Git tracks the application version; the application audit log tracks corrections to family data. A release must not contain credentials, real-family exports, personal contact data, or unreviewed schema changes.

## Version identity

Before preparing a release, confirm that all product metadata reports `1.1.3` and that the visible header reports `v1.1.3`:

```bash
node -p "require('./package.json').version"
rg -n '1\.1\.3|v1\.1\.3' package.json package-lock.json vite.config.ts README.md CHANGELOG.md SECURITY.md DECISIONS.md docs
```

The package/repository slug is `milli-e-misfatti`; the product display name is `Milli e Misfatti`.

## Local verification gates

Run from a clean, reviewed checkout with Node.js 24:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

When a compatible local Supabase environment is available, also run:

```bash
supabase start
supabase db reset
supabase test db
```

Record command output, environment versions, SQL migration filenames, and any skipped check. A successful frontend build does not prove database behavior, provider configuration, NFC hardware, or deployment readiness.

## Private repository preparation

Before publishing a new revision:

1. Review every tracked path and the complete Git history for credentials, local environment files, real-family data, personal contact details, and generated artifacts.
2. Confirm the repository remains private before pushing.
3. Confirm the display name, slug, version, README, changelog, security policy, and all-rights-reserved notice.
4. Verify the pushed commit and repository visibility by reading them back before reporting publication complete.

## Promotion gates

1. The release commit is identifiable and the intended release tree is clean.
2. The non-deploying GitHub Actions `CI` workflow is green after a remote exists.
3. A reviewer checks authentication boundaries, Row Level Security, inactive-member behavior, wallet idempotency, migrations, and rollback impact.
4. Staging migrations and scheduler configuration are verified; a readable backup or export is recorded before production changes.
5. An iPhone Safari smoke test covers login, Today, one presence update, one NFC URL, family management, and failed-network behavior without a real milli transaction.
6. Parent-facing copy and error states are understandable in Italian; keyboard, focus, contrast, and screen-reader labels are checked.
7. Release notes record migrations, environment changes, known limitations, rollback targets, and observed test evidence.

## v1.1.3 checklist

- [ ] `package.json`, `package-lock.json`, documentation, and visible UI all report `1.1.3`.
- [ ] Product metadata, PWA assets, offline page, and accessible labels use `Milli e Misfatti`.
- [ ] Demo profiles use only Child 1, Child 2, Child 3, Mamma, Papà, and Cleaning Lady as fixed display names.
- [ ] Inactive members remain in history and administration but are absent from the global profile selector and future-facing choices.
- [ ] `npm ci` and all frontend CI gates pass.
- [ ] The Supabase SQL suite passes in a compatible local environment.
- [ ] Build output contains `manifest.webmanifest`, branded icons, the offline page, and `v1.1.3` in the application bundle.
- [ ] Parent, referee, participant, inactive-profile, and final-active-parent authorization paths are checked.
- [ ] RPC idempotency and stale-revision behavior are tested.
- [ ] No credential, real-family export, personal contact data, or service-role key is present.
- [ ] No deferred feature is accidentally enabled: euro conversion, reverse auctions, Reserve payout, final monthly ranking, or push notifications.
- [ ] Provider, deployment, and scheduler steps remain unchecked until independently authorized and verified.

## Tagging after authorization

Only after a private remote exists, the release commit is approved, and all applicable gates pass:

```bash
git tag -a v1.1.3 -m "Release v1.1.3"
git push origin v1.1.3
```

These commands are procedural examples. They have not been run, and CI does not create tags, GitHub releases, or deployments.

## Incident handling

Pause writes if a release can duplicate wallet entries, bypass role checks, reactivate inactive profiles, or corrupt task state. Preserve logs and the audit trail, roll back the static frontend if appropriate, and use a reviewed corrective database migration after the cause is understood. Never edit balances directly in SQL without an auditable correction operation.
