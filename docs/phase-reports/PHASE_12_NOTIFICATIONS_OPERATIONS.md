# Phase 12 — Notifications and operational work queues

Date: 24 August 2026.

## Why this phase

Merged `origin/main` contained complete Phases 1–11. Phase 7 already supplied
templates, preferences, delivery records and four queue primitives, but delivery
claims could not recover abandoned processing, attempts had no durable history,
commercial source records did not feed one complete notification workflow and
the admin queue was read-only. Phase 12 was therefore the earliest incomplete
phase.

## Scope completed

- Added the approved semantic notification vocabulary: welcome, customer
  action, onboarding reminder, payment reminder/overdue, subscription
  activation/suspension/resumption/cancellation, expiring discount, agent ready
  and integration action.
- Added email, SMS, WhatsApp and in-app channel abstractions. The channel router
  persists in-app delivery and rejects unconfigured external channels; no
  development fallback sends a real message.
- Added a reusable commercial-notification reconciliation service and D1 source
  adapter. Requests are preference-aware, required-notice-aware and idempotent.
- Added five-minute delivery leases, stale-claim recovery, bounded exponential
  retry and immutable provider-attempt history. A reclaimed attempt closes with
  `LEASE_EXPIRED` evidence.
- Added customer-scoped in-app delivery history and an audited mark-read
  operation.
- Added reusable operational queue reconciliation for new registrations,
  onboarding progress, customer/internal tasks, billing attention, overdue
  invoices, agent provisioning, integration problems and launch-ready
  customers. It creates missing, refreshes changed and closes stale projection
  rows without mutating a source aggregate; truncated scans defer closure.
- Added an administration operations page with attention-today/overdue metrics,
  queue claim/complete/dismiss commands, recovery controls, delivery status and
  active template history.

## Persistence

- `0009_numerous_meltdown.sql` safely rebuilds the three notification tables,
  preserves existing data, requeues pre-upgrade `PROCESSING` deliveries, adds
  lease/cancellation/read fields, adds WhatsApp constraints, creates immutable
  `notification_delivery_attempts` and seeds fourteen version-one commercial
  templates. It also seeds dedicated `OPERATIONS_READ`/`OPERATIONS_WRITE`
  permissions and controlled role grants for the protected workspace.
- `0010_stale_kang.sql` adds the composite recovery index for
  `(status, lease_expires_at)`.
- Existing Phase 7 tables, source aggregates and applied migrations were not
  rewritten.

## UI and API

- Added `/admin/operations` and enhanced the admin dashboard's “What requires
  attention today?” view.
- Enhanced `/account#notifications` with in-app message/read history and
  WhatsApp preference readiness.
- No `/api/v1` route was added or changed. Phase 13 owns REST production
  hardening; Phase 12 server actions only parse/authorize/confirm and invoke
  application services.

## Tests

- Phase 11-to-12 upgrade, retained processing-delivery recovery, table/column/
  trigger/check/index and foreign-key coverage.
- Queue create/refresh/resolve behavior, claimed-item preservation and
  source-lifecycle independence.
- Expired notification lease recovery and immutable two-attempt history.
- Consent, required notices, semantic orchestration and duplicate-request
  idempotency.
- Real D1 source-projection coverage for registration, onboarding,
  customer-action and integration attention.

## Known limitations and deferred work

- External email, SMS and WhatsApp adapters require reviewed provider
  configuration. This phase deliberately ships no credentials and never sends
  through an implicit development provider.
- Scheduling/worker invocation is composition-owned. Administrators can invoke
  safe reconciliation, while production cron/queue wiring and provider
  observability receive their system-wide review in Phase 16.
- The current REST contract is unchanged; notification and queue pagination/
  filtering belong to Phase 13.
- The external agent provider remains Phase 14 and outbound Stripe operations
  remain Phase 15.
