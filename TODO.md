# Project TODO

This file is the living project backlog. Update it whenever work is added, completed, deferred, or re-scoped.

## Current — Apple-inspired responsive design

- [x] Research current frontend-design skills and Apple Human Interface Guidelines.
- [x] Replace the layered experimental CSS with one coherent token system.
- [x] Build a floating glass sidebar and wide dashboard layout for desktop.
- [x] Build a floating header and adaptive tab bar for iPhone.
- [x] Keep glass in the functional navigation layer and opaque materials in the content layer.
- [x] Verify the primary, calendar, and administration views at desktop and 390 × 844 iPhone sizes.
- [ ] Collect family feedback and refine the selected direction.

## Connected MVP

- [ ] Validate the pending Supabase migration and contract tests against a local or staging Supabase instance.
- [ ] Replace demo identity switching with real authentication and account-to-family-profile assignment.
- [ ] Configure the first private deployment and its environment variables.

## Later — NFC rollout

- [ ] Inventory the NFC tags and confirm their format, memory capacity, rewritability, and iPhone compatibility.
- [ ] Define the physical placement of every tag at the point where its activity is performed.
- [ ] Create a tag registry that maps each NFC tag to one activity and one physical location.
- [ ] Define a revocable, non-guessable URL or token format for every tag.
- [ ] Build the parent/admin flow that creates, activates, replaces, and disables NFC tags.
- [ ] Program, label, and install the tags only after the registry and scan flow are stable.
- [ ] Design privacy-safe phone enrollment. Use an account-bound installation identifier, passkey, or authenticated session instead of assuming that an iPhone hardware ID is available to the web app.
- [ ] Record the authenticated participant, enrolled installation, tag, activity, timestamp, and result for every scan.
- [ ] Make app confirmations and valid NFC scans immediately count as completed activities; parents and the referee can correct them afterward.
- [ ] Handle duplicate scans, offline scans, lost or moved tags, replaced phones, expired sessions, and scans made by the wrong participant.
- [ ] Pilot a small set of tags before installing all 60.

## Later — Product hardening

- [ ] Add audit-history views for parent corrections and NFC scans.
- [ ] Add end-to-end tests for the main role and permission flows.
- [ ] Complete deployment, backup, monitoring, and recovery documentation after the production stack is selected.
