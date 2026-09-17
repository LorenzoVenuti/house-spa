# Changelog

All notable changes to House S.p.A. are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) in a simplified form.

## [Unreleased]

### Added

- Automatic NFC declarations with separate arrival and departure tags.
- Audited completion invalidation for parents and referees, including reward reversal and task reopening.
- Monthly cumulative activity chart with one colored line per participant.

### Changed

- App and NFC completion declarations are now considered true immediately; no second confirmation is required.
- Reworked the interface as a responsive Apple-inspired application, with a floating desktop sidebar, adaptive iPhone tab bar, restrained glass navigation, opaque content surfaces, local vector icons, and a unified design-token system.
- Renamed the product to **House S.p.A.** across the application, PWA metadata, assets, package metadata, and documentation.
- Kept fixed demo profiles anonymized for public distribution.

## [1.1.3] - 2026-09-16

### Added

- Parent-only **Gestisci famiglia** controls for creating, deactivating, and reactivating profiles while preserving history.
- Active-profile state across the demo and Supabase member contracts.
- Anonymized fixed demo display names: Child 1, Child 2, Child 3, Mamma, Papà, and Cleaning Lady.

### Changed

- Finalized the product identity as **Milli e Misfatti** across the application shell, PWA metadata, offline page, icons, and release documentation.
- Displayed `v1.1.3` in the application header.
- Limited the global demo profile selector and future-facing profile lists to active members.

### Security

- Preserved historical references when a profile is deactivated and prevented inactive profiles from acting through stale local selection state.
- Kept family-management operations parent-only and protected the current actor and final active parent from deactivation.
