# Phase 16 — Production security, reliability and migration hardening

Date: 26 August 2026.

## Scope completed

- Recorded the threat, authentication/session/MFA ownership, authorization,
  credential, PII, outage and concurrency control matrix.
- Added reusable readiness and maintenance application services rather than
  controller-owned business logic.
- Added aggregate, PII-minimised readiness for billing webhook, notification,
  agent and operational backlogs.
- Added bounded retention for expired technical state and one-way audit network
  metadata redaction without deleting commercial audit history.
- Added durable, immutable maintenance-run evidence and concurrency protection.
- Added scheduled reclaim of ready failed billing webhooks from the normalized
  durable inbox, independent of provider redelivery.
- Added protected admin REST endpoints and operations UI controls.
- Added clean-install, representative Phase 10/15 upgrade, FK, constraint,
  immutability, concurrency, retention, authorization and recovery tests.
- Added backup/restore, RPO/RTO, rehearsal and forward-repair guidance.
- Production dependency audit reports zero vulnerabilities. The non-breaking
  audit update reduced development-tool advisories; 14 transitive advisories
  remain because npm's proposed resolutions require breaking vinext, Vite,
  Wrangler/Cloudflare plugin or drizzle-kit changes. Those upgrades are not
  forced into this hardening phase and must be reviewed as toolchain work.

## Persistence and API

- Migration: `site/drizzle/0014_parallel_spacker_dave.sql`.
- New table: `system_maintenance_runs`.
- New endpoints: `GET /api/v1/admin/system/readiness` and
  `POST /api/v1/admin/system/maintenance`.
- Permissions: `OPERATIONS_READ` and `OPERATIONS_WRITE`, respectively.

## Known limitations and deferred work

- Scheduling, alert delivery, D1 backup configuration and dispatcher MFA/session
  policy are environment/control-plane responsibilities and are documented but
  not fabricated in application code.
- Live provider execution and deployment remain disabled in this branch.
- Phase 17 owns the final architecture review, documentation reconciliation and
  go/no-go release assessment.
