# Security policy

## Supported version

Version **1.1.3** is the only supported version while House S.p.A. remains a public-source pilot project. No production deployment has been performed.

## Reporting a vulnerability

Do not disclose vulnerabilities, family data, credentials, or exploit details in a public issue.

Use GitHub private vulnerability reporting or a draft security advisory when available. Otherwise notify the repository owner through an already established private channel and share only the minimum information needed to coordinate a secure report. No public contact address is published by this project.

Include the affected version, impacted component, reproduction conditions, likely impact, and any safe mitigation. Do not access real family data, test against systems you do not own, or perform destructive validation.

## Secrets and sensitive data

- Never commit `.env.local`, access tokens, SMTP credentials, service-role keys, production exports, or real-family fixtures.
- Only `VITE_` variables intended for browser exposure may enter the frontend bundle. A Supabase service-role key must never use a `VITE_` prefix.
- Treat meal attendance, presence, tasks, balances, audit events, email addresses, and authentication identifiers as sensitive family data.
- Use synthetic profiles and local environments for development and review.
- Keep Row Level Security enabled and route privileged mutations through reviewed database functions with server-side family and role checks.
- Rotate a credential immediately if it is exposed and remove it from both current files and repository history before publication.

## Scope and current limitations

The source includes Demo Mode plus contracts for a future Supabase-backed pilot. Authentication screens, live provider credentials, production scheduling, physical NFC behavior, email delivery, deployment, and incident-response operations have not been configured or exercised. Security claims in this project apply to reviewed source contracts and local verification, not to an unperformed production rollout.
