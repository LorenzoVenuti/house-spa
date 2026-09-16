# Changelog

All notable changes to Milli e Misfatti are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) in a simplified form.

## [Unreleased]

No changes recorded.

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
