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

## Phase 11 — Billing operations and subscription lifecycle

Status: complete (24 August 2026).

Acceptance criteria: customer and administrator billing overviews expose plan,
public/negotiated/effective price, discounts, invoice/payment state, current
period, renewal/cancellation date, entitlement state and billing contact;
invoices and reminders retain history; `PAST_DUE` grace, suspension, resumption,
period-end cancellation, immediate cancellation, due cancellation finalisation
and temporary service extension are explicit domain/application operations;
entitlements close, restore or expire without deleting customer data; internal
billing notes are append-only; protected UI and REST commands require existing
billing/subscription permissions and explicit confirmation/idempotency; all
commercial actions are audited; no raw card data is stored.

## Phase 12 — Notifications and operational work queues

Status: complete (24 August 2026).

Acceptance criteria: versioned templates cover the approved commercial message
vocabulary; email, SMS, WhatsApp and in-app channels remain provider-neutral and
external delivery is disabled without explicit configuration; semantic message
reconciliation is consent-aware and idempotent; workers claim deliveries with
recoverable leases, immutable attempt history, bounded retries and audited
outcomes; in-app notices are customer-scoped and readable; operational queue
reconciliation creates, refreshes and closes projections for registrations,
onboarding, customer/internal tasks, billing/overdue invoices, integrations,
agent provisioning and launch readiness without changing source lifecycle
state; the protected admin workspace answers what requires attention today and
supports claim/complete/dismiss actions; forward migrations preserve existing
deliveries and all validation gates pass.

## Phase 13 — REST API production hardening

Status: complete (24 August 2026).

Acceptance criteria: public, customer, administrator and integration route
families have exact authentication/authorization contracts; write bodies and
collection queries reject unknown input; JSON media type, bounded bodies,
request IDs and standard errors are consistent; customer and administrator
actors have durable rate limits; commercial writes use actor-scoped
idempotency; customers, subscriptions, invoices, discounts, promotion codes,
notifications and audit events use field-minimised DTOs, controlled filters and
stable opaque cursor sorting; OpenAPI uses explicit schemas; v1 compatibility
rules and production-grade API/migration/authorization tests are complete.

## Phase 14 — Agent platform integration

Status: complete (25 August 2026).

Acceptance criteria: purpose-specific bootstrap, entitlement and subscription
validation responses remain field-minimised and service-authenticated; external
link synchronization and reconciliation use the `agent-link:write` scope;
provision/update/suspend/resume execute through a configuration-gated HTTPS
adapter behind the existing port; credentials remain runtime-only; provider
idempotency, classified bounded retries, recoverable leases, immutable attempt
history, provider references and audit events provide safe execution and
observability; the admin agent workspace exposes jobs and attempts; the Phase
13-to-14 migration preserves in-flight work and all validation gates pass.

## Phase 15 — Stripe and billing-provider integration

Status: complete on the Phase 15 feature branch; verify merged implementation
from code before relying on this informational marker.

Implemented reviewed Stripe customer, dynamic recurring-price, Checkout,
subscription synchronization and provider-created invoice operations behind the
provider-neutral port. Internal contracted pricing and entitlement decisions
remain authoritative; signed events reconcile idempotently and no card data or
secrets are stored. Test-mode configuration is supported, while live execution
requires a separate explicit runtime enablement flag.

## Phase 16 — Production security, reliability and migration hardening

Status: complete on the Phase 16 feature branch; verify merged implementation
from code before relying on this informational marker.

Complete threat-led security controls, operational recovery, observability,
data retention, concurrency and failure testing, migration rehearsal and
production rollback evidence across the commercial platform.

## Phase 17 — Final architecture and release readiness

Status: not started.

Verify bounded-context ownership, eliminate duplication, reconcile all
documentation with implemented code, complete release evidence and publish a
go/no-go readiness assessment without weakening the modular-monolith boundary.
