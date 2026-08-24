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

Status: complete (24 August 2026).

Subscription state machine, contracted price versions, entitlement generation
and revocation, billing accounts, invoice history, payment reminders and the
provider-neutral billing port. Suspend/resume/cancel preserve customer data.

## Phase 6 — Identity, RBAC and immutable audit

Status: complete (24 August 2026).

Customer/admin identity decision, secure sessions, invitations, initial roles
and permissions, server guards and commercially complete audit events. No
custom cryptography.

## Phase 7 — Onboarding, integrations and operational queues

Status: complete (24 August 2026).

Separate onboarding cases/tasks, customer integration health, notification
infrastructure and queues for customer action, internal action, billing
attention and agent provisioning. Source aggregates and their queue projections
are transactionally persisted where Phase 7 owns both records; queue completion
never mutates source lifecycle state.

## Phase 8 — Customer account and internal admin portal

Status: complete (24 August 2026).

Dispatch-owned Sign in with ChatGPT protects a customer-scoped account and
server-authorized administration workspace. Customer views cover onboarding,
integrations, subscriptions, entitlements, billing, agents and notification
preferences without exposing internal notes. Admin views cover operational
queues, customer search/detail, catalogue, pricing, discounts, subscriptions,
billing, agent provisioning, audit history and access settings. Commercial
mutations use application services, permission checks, explicit confirmation
and immutable audit recording. Phase 8 adds no schema migration and deliberately
does not introduce the Phase 9 `/api/v1` boundary.

## Phase 9 — Versioned REST and agent boundary

Status: complete (24 August 2026).

Purpose-specific `/api/v1` public, customer, admin and service APIs; opaque
cursor pagination; durable scoped idempotency; OpenAPI 3.1; dispatch-owned
customer/admin authentication; rotatable, expiring and revocable hashed service
credentials; durable service rate limits and request audit records; and agent
customer, subscription, entitlement, bootstrap and provisioning DTOs. REST
controllers call reusable application services and the future agent platform has
no direct database dependency.

## Phase 10 — Billing adapter and hardening

Status: complete (24 August 2026).

Billing-provider implementation only when configured, verified/deduplicated
webhook boundary, E2E/accessibility/security/migration/upgrade tests,
performance evidence, launch and rollback readiness. The configured Stripe
webhook verifier authenticates the raw request before parsing and feeds a
provider-neutral inbox/reconciliation service. Outbound payment execution
remains disabled until a reviewed provider configuration is supplied; the
application never substitutes a fake payment path.
