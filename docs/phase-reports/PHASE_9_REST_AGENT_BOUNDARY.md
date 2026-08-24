# Phase 9 — Versioned REST and agent boundary

Completed: 24 August 2026

## Selection evidence

The synchronized `origin/main` contained complete Phases 1–8. Phase 9 had only
shared request/error primitives and reusable commercial application services;
there was no versioned API, general idempotency, service identity, OpenAPI or
agent bootstrap boundary.

## Scope completed

- Added `/api/v1` public, customer, admin and service-to-service JSON surfaces.
- Reused dispatch-owned SIWC for customer/admin authentication and existing RBAC
  permissions for every admin controller.
- Added separately issued hashed service credentials with explicit scopes,
  expiry, rotation, terminal revocation, durable rate limiting and audit logs.
- Added opaque cursor pagination for customers, subscriptions, discounts,
  promotion codes and audit events with bounded page sizes and controlled
  filters.
- Added durable operation-scoped idempotency with canonical request hashes,
  safe replay and concurrent/different-payload conflict handling.
- Added `AgentIntegrationService` and purpose-specific customer, subscription,
  entitlement, bootstrap and provisioning DTOs. Controllers never query agent
  data directly and the future agent platform requires no database access.
- Added OpenAPI 3.1 at `/api/v1/openapi.json`.

## Migration

Added `site/drizzle/0006_broken_centennial.sql` and three tables:
`service_credentials`, `idempotency_keys` and `service_rate_limits`. Existing
migrations were not changed. Database checks, indexes and triggers protect
credential lifecycle and completed idempotency outcomes.

## Application and API boundaries

New API security services own credential issue/rotation/revocation,
authentication, scope checks and idempotency. `D1ApiReadRepository` owns
purpose-specific read DTO queries. Existing customer, catalogue, pricing,
discount, subscription, notification and agent provisioning services remain the
only commercial write boundary; route handlers parse, authenticate, authorize,
invoke and map responses.

Customer API DTOs exclude internal notes. Public plan DTOs exclude negotiated
pricing. Agent DTOs exclude notes, overrides, discounts, audit and credentials.
Raw service tokens are returned once and never stored in credential or
idempotency records.

## Tests added

- Phase 8-to-9 migration, constraints, triggers and query plans.
- Credential hashing, scopes, expiry, rotation, revocation and rate limiting.
- Application and HTTP idempotency replay/conflict behavior.
- Stable cursor pagination and public-field minimisation.
- Agent bootstrap behavior for active/suspended/missing customers.
- REST status/error mapping and stack-trace suppression.
- OpenAPI surface/security inventory.

## Known limitations and deferred work

- Billing-provider execution and webhook verification/deduplication remain
  Phase 10; no fake webhook endpoint was added.
- Broader browser E2E, accessibility, load/performance, upgrade rehearsal,
  launch monitoring and rollback evidence remain Phase 10.
- Service rate-window cleanup is an operational maintenance concern for Phase
  10; current indexed records are bounded by credential traffic and do not
  affect authentication correctness.

## Next phase

Phase 10 — Billing adapter and hardening. It was not started on this branch.
