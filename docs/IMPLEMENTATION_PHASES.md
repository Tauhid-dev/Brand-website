# Zuno Pixel implementation phases

Each phase begins from updated `main`, runs on its own feature branch and stops
only when its acceptance criteria, tests, validation, documentation and clean
commit are complete.

## Phase 1 — Audit, target model and rebrand

Status: complete (23 August 2026).

Acceptance criteria: repository audit and baseline evidence recorded; expanded
domain/database target documented; central typed Zuno Pixel configuration;
public content, metadata, structured data, package labels, analytics namespace,
tests and social preview rebranded; old public branding scan clean; no runtime
commercial schema; all baseline gates pass.

## Phase 2 — Customer and catalogue foundation

Status: complete (23 August 2026).

Customer self-registration/admin creation/invitation ports, customer and
business profile aggregates, internal notes, offerings, plans, features,
repository interfaces, D1 migrations and development-only seed data. Shared API
error/request context primitives are established, but no HTTP endpoint was
required to prove this foundation.

## Phase 3 — Pricing and commercial quotes

Status: complete (23 August 2026).

Versioned base prices, negotiated overrides, `Money`/date-range invariants,
single pricing resolver, preview, immutable quote snapshots and public pricing
provider. Concurrency and effective-range conflicts are tested.

## Phase 4 — Discounts and promotion codes

Status: complete (23 August 2026).

Discount definitions, coupon restrictions, direct customer discounts,
transaction-safe redemption and stacking/currency/duration policies.

## Phase 5 — Subscriptions, entitlements and billing records

Subscription state machine, contracted price versions, entitlement generation
and revocation, billing accounts, invoice history, payment reminders and the
provider-neutral billing port. Suspend/resume/cancel preserve customer data.

## Phase 6 — Identity, RBAC and immutable audit

Customer/admin identity decision, secure sessions, invitations, initial roles
and permissions, server guards and commercially complete audit events. No
custom cryptography.

## Phase 7 — Onboarding, integrations and operational queues

Separate onboarding cases/tasks, customer integration health, notification
infrastructure and queues for customer action, internal action, billing
attention and agent provisioning.

## Phase 8 — Customer account and internal admin portal

Customer dashboard plus protected admin dashboard/customer/catalogue/pricing/
discount/subscription/billing/agent/audit views with safe confirmations.

## Phase 9 — Versioned REST and agent boundary

Purpose-specific `/api/v1` public, customer, admin and service APIs; cursor
pagination, idempotency, OpenAPI, scoped service credentials and agent bootstrap
DTOs. No direct agent database access.

## Phase 10 — Billing adapter and hardening

Billing-provider implementation only when configured, verified/deduplicated
webhook boundary, E2E/accessibility/security/migration/upgrade tests,
performance evidence, launch and rollback readiness.
