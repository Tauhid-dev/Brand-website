# Phase 13 — REST API production hardening

Date: 24 August 2026.

## Why this phase

Merged `origin/main` contained complete Phases 1–12. Phase 9 supplied the
versioned API, service credentials, request audit, idempotency and initial
cursor reads, while Phase 10 added public limits and HTTP/webhook hardening.
The production contract still used generic OpenAPI objects, lacked paginated
invoice and notification resources, exposed several repository/domain-shaped
records, accepted ambiguous route shapes and had no complete permission matrix.
Phase 13 was therefore the earliest incomplete phase.

## Scope completed

- Added exact method/path-to-permission matching for every administration route;
  malformed suffixes cannot fall through to a different write operation.
- Added strict JSON content type, bounded input, unknown body/query rejection,
  controlled enum filters and `createdAt`/`-createdAt` cursor sorting.
- Bound cursors to sort direction while retaining v1 descending-cursor decode
  compatibility.
- Added field-minimised, explicitly selected DTO projections for customers,
  subscriptions, invoices, discounts, promotion codes, notification deliveries
  and audit events. Provider references, recipients, idempotency keys and
  template variables do not leak through list endpoints.
- Added actor-scoped durable idempotency for administrator, customer preference
  and agent provisioning writes. One-time service credential responses and
  non-mutating price preview remain deliberately outside response replay.
- Added durable hashed customer/admin rate limits alongside existing public,
  service-credential and billing-webhook controls.
- Replaced generic OpenAPI responses with named request, response, page, error
  and integration schemas, and documented the v1 compatibility policy.

## Persistence and API

- Added `0011_yummy_vin_gonzales.sql`; no tables or columns changed.
- Added indexes for production cursor/filter query shapes.
- Added `GET /api/v1/admin/invoices` (`BILLING_READ`).
- Added `GET /api/v1/admin/notifications` (`OPERATIONS_READ`).
- Hardened all existing public, customer, admin and agent API families without
  moving policy into controllers.

## Tests

- Exact administration authorization matrix and OpenAPI security-family tests.
- Cursor compatibility, sort binding, invalid sort/query/body/media tests.
- Ascending and multi-page customer repository tests.
- Invoice/notification field-minimisation tests.
- Phase 12-to-13 upgrade, clean-chain, foreign-key and query-plan index tests.
- Existing idempotency, service scope/rate-limit and standard error tests remain
  part of the complete suite.

## Known limitations and deferred work

- Phase 14 owns the reviewed external agent provider adapter and additional
  agent-link synchronization operations.
- Phase 15 owns outbound Stripe/payment-provider execution.
- Phase 16 owns the system-wide threat, recovery, observability, retention and
  migration-rehearsal pass. No provider secrets or live execution were added.
