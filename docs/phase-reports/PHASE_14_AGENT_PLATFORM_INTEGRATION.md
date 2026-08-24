# Phase 14 — Agent platform integration

Date: 25 August 2026.

## Why this phase

Merged `origin/main` contained complete Phases 1–13. It already had scoped
service credentials, field-minimised customer/bootstrap reads, provider-neutral
agent links and provisioning jobs, an operational queue, and administrator
read views. Phase 14 remained partial because no reviewed external adapter was
wired, the requested subscription-validation and agent-link contracts were
absent, in-progress jobs could not be reclaimed, provider attempts were not
durable, and no commercial/provider reconciliation use case existed.

## Scope completed

- Added a runtime-configured HTTPS agent platform adapter behind
  `AgentProvisioner` for provision, update, suspend, resume and inspection.
- Forwarded durable idempotency keys while keeping the provider access token
  exclusively in runtime configuration. Provider response bodies and secrets
  are never stored, audited or included in errors.
- Classified transient network/HTTP failures for bounded exponential retry and
  treated unsafe client/contract failures as terminal.
- Added two-minute processing leases, expired-lease recovery and immutable
  provider-attempt history with safe categories and provider request references.
- Added reusable link synchronization and commercial/provider reconciliation
  services; controllers remain limited to authentication, validation and use
  case dispatch.
- Expanded bootstrap with necessary contact and onboarding configuration while
  retaining explicit exclusions for internal notes, pricing, discounts, audit
  history and credentials.
- Added subscription-validation, agent-link synchronization, reconciliation and
  configured job-processing REST operations using service bearer scopes only.
- Added provider-attempt observability to the protected administrator agent
  workspace.

## Persistence and API

- Added forward migration `0012_old_morph.sql`.
- Added `processing_started_at` and `lease_expires_at` to
  `agent_provisioning_jobs` plus a ready-lease index and lease-state check.
- Added `agent_provisioning_attempts` with unique job/attempt number, query
  indexes, outcome checks and immutable/terminal triggers.
- Preserved Phase 13 provisioning jobs, including safe lease initialization for
  any in-flight row, and restored the job ownership/version triggers after the
  SQLite table rebuild.
- Added:
  - `GET /api/v1/integrations/agent/customers/{customerId}/subscription-validation`
  - `PATCH /api/v1/integrations/agent/customers/{customerId}/agent-link`
  - `POST /api/v1/integrations/agent/customers/{customerId}/reconciliation`
  - `POST /api/v1/integrations/agent/provisioning-jobs/process`
- Updated OpenAPI 3.1 schemas and scope declarations for all Phase 14 contracts.

## Tests

- HTTPS/configuration, minimal payload, authorization header, provider
  idempotency, error classification, response-size and inspection adapter tests.
- Link synchronization audit, entitlement-led reconciliation, attempt history,
  successful processing and expired-lease recovery tests.
- Phase 13-to-14 upgrade, in-flight-row preservation, clean-chain constraints,
  foreign keys, indexes and immutable attempt-trigger tests.
- OpenAPI scope tests prove the Phase 14 family uses service bearer credentials
  and never the administrator browser session.

## Known limitations and deferred work

- A real provider origin and access token must be approved and configured in the
  hosting environment; live execution is intentionally unavailable otherwise.
- The external platform must implement the documented `/v1/agents` provider
  contract and call/poll the processing operation through controlled scheduling.
- Phase 15 owns outbound Stripe/payment-provider execution.
- Phase 16 owns the system-wide threat, recovery, concurrency, retention,
  scheduler/runbook and migration-rehearsal hardening pass.
