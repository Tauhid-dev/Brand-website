# Zuno Pixel commercial platform domain and database design

Status: target design implemented and release-audited through Phase 17. Phases 2–9 implement the
commercial domain, operational portal and versioned integration boundary;
Phase 10 adds the configured billing-webhook adapter and launch hardening, and
Phase 11 completes provider-neutral billing operations and lifecycle controls.
Phase 12 completes semantic notification orchestration, recoverable delivery
processing and full operational projection reconciliation. Phase 13 hardens the
REST boundary with explicit field-minimised projections, exact route/permission
contracts, bounded and validated input, actor-scoped idempotency and indexed
cursor collection reads. Phase 14 provides a configuration-gated HTTPS agent
provider adapter, service-authenticated link synchronization and reconciliation,
recoverable provisioning leases and immutable attempt history. No HTTP
controller owns commercial or provider workflow policy. Phase 15 adds the
reviewed Stripe adapter without changing internal commercial authority; Phase
16 adds production recovery, retention and immutable maintenance evidence; and
Phase 17 verifies inward-only, acyclic module dependencies in automation. The
marketing lead endpoint likewise delegates delivery through an application port
and configuration-gated infrastructure adapter.

## Architecture decision

Use one deployable modular monolith with inward dependencies:

`HTTP/UI adapters → application services → domain modules ← repository/provider ports`

Drizzle/D1 implementations remain infrastructure adapters. Controllers parse
and authorise requests, invoke application services and map DTOs; they do not
own pricing, subscription, onboarding, notification or provisioning policy.

## Bounded contexts

| Context | Owns | Does not own |
| --- | --- | --- |
| Identity & Access | identities, invitations, sessions, roles, permissions | customer commercial state |
| Customer Management | customer aggregate, contacts, business profile, internal notes | onboarding progress, agent internals |
| Onboarding | onboarding cases, tasks, dependencies, completion and blockers | customer lifecycle, subscription state |
| Catalogue | offerings, plans, plan features and display ordering | customer agreements |
| Pricing & Promotions | versioned prices, overrides, discounts, coupons, quotes | payment execution |
| Subscriptions & Entitlements | subscription transitions, commercial snapshots, capability grants | catalogue price mutation |
| Billing | billing account link, invoices, payment status, reminders, provider port | plan/entitlement policy |
| Integrations | per-customer integration connections and health | third-party secrets in domain objects |
| Agent Provisioning | agent link and provisioning job lifecycle | conversational agent implementation |
| Notifications | templates, deliveries, preferences and retry state | business workflow policy |
| Operations | derived work queue items and assignments | source-of-truth lifecycle state |
| Audit | append-only commercially important facts | editable operational notes |

## Lifecycles and invariants

### Customer lifecycle

`PROSPECT → ACTIVE ↔ SUSPENDED → CANCELLED → ARCHIVED`

- self-registration and admin creation both create immutable UUID customer IDs;
- email is searchable identity/contact data, never the primary key;
- cancellation never deletes commercial history;
- archival is a retention-controlled terminal visibility state, not hard delete.

### Onboarding lifecycle

`NOT_STARTED → IN_PROGRESS ↔ BLOCKED → READY → COMPLETED` with `CANCELLED`

Onboarding belongs to an `onboarding_case`, not the customer status column.
Tasks carry owner type (`CUSTOMER` or `INTERNAL`), due date, status and dependency
metadata. A customer can be active while onboarding remains incomplete, or
suspended without losing onboarding evidence.

### Subscription and service access

`PENDING → TRIAL → ACTIVE → PAST_DUE → SUSPENDED → ACTIVE`

`ACTIVE → CANCEL_AT_PERIOD_END → CANCELLED`

Only the subscription application service performs transitions. Suspension,
cancellation or expiry closes/disables effective entitlements. It never deletes
the customer, subscription, invoice, onboarding or agent-link record. Resumption
creates/restores effective entitlements from the contracted snapshot through an
audited transition. Phase 11 adds explicit grace deadlines and temporary
extensions; extensions are effective-dated entitlement grants and expire
without changing or deleting the underlying commercial history.

### Billing lifecycle

Billing status is not customer status. Invoices use `DRAFT`, `OPEN`, `PAID`,
`VOID`, `UNCOLLECTIBLE`; payment attention and reminders derive from invoice and
subscription facts. Provider webhooks enter through a signature-authenticated,
idempotent inbox. The adapter stores only a minimised normalized event and its
payload hash, then invokes reusable invoice/subscription reconciliation services.
The customer billing profile stores a billing contact independently from any
provider account. Internal billing notes are append-only and administrator-only.

## Aggregate roots and application services

- `Customer`: profile linkage, lifecycle changes, invitation association.
- `OnboardingCase`: task progress, blocking state and completion readiness.
- `Plan`: feature composition; price versions are immutable commercial records.
- `Discount`: definition and eligibility; promotion code owns redemption policy.
- `Subscription`: transition policy and contracted price/entitlement snapshots.
- `Invoice`: immutable line totals plus controlled payment-state transitions.
- `NotificationDelivery`: delivery/retry state; workflow modules request messages
  through a `NotificationService` port.
- `ProvisioningJob`: requested agent operation, recoverable processing lease,
  bounded attempts and terminal outcome; each provider attempt is durable and
  immutable after completion.

Planned services include `RegisterCustomer`, `InviteCustomer`, `CreateCustomer`,
`AdvanceOnboarding`, `ResolveEffectivePrice`, `ChangeSubscription`,
`SuspendSubscription`, `ResumeSubscription`, `CancelSubscription`,
`RevokeEntitlements`, `IssuePaymentReminder`, `BuildAgentBootstrapProfile`,
`QueueAgentProvisioning`, and `RecordAuditEvent`.

Phase 2 implements `CreateCustomerService`, `RegisterCustomerService` and
`InviteCustomerService` behind repository, identity, token and delivery ports.
Token issuance/delivery implementations and authentication/session policy stay
in Phase 6; the application layer stores only invitation hashes.

Phase 3 implements version publication, negotiated overrides, one effective
price resolver, preview/public providers and immutable quote snapshots. These
services depend on pricing/reference repository ports; HTTP and UI do not own
commercial calculations.

Phase 4 implements reusable discount creation, promotion validation/redemption,
direct assignment, charge-application recording and pricing-resolution services.
Application services depend on repository, purchase-history, reference, clock
and ID ports. Atomic redemption limits and immutable history are enforced again
at the D1 boundary rather than being delegated to HTTP controllers.

Phase 5 implements subscription creation/lifecycle transitions, explicit future
contract-price versions, entitlement snapshots and provider-neutral billing
records. Subscription creation atomically stores the subscription, its resolved
commercial terms and plan-feature entitlements. Suspension/cancellation close
entitlement ranges; resumption creates new ranges from the contracted snapshot.
Billing-provider execution remains behind a port.

Phase 6 adopts dispatch-owned Sign in with ChatGPT as the external browser
identity/session provider for the hosted application. Zuno Pixel stores the
stable Site-scoped provider subject and never stores a password, OAuth token or
session cookie. Customer identities map to customer accounts; separately
provisioned admin identities resolve database roles and permissions through
server-side guards. Invitation tokens use Web Crypto randomness and SHA-256
hashes, and acceptance atomically consumes one invitation while linking one
provider identity. Commercial application services depend on the reusable
audit-recorder port rather than HTTP controllers.

## Target table groups

### Identity and customers

Phase 2 introduced all five tables in this group. Phase 6 completes the
provider-backed authentication boundary, invitation acceptance and one-use
invitation-to-identity linkage. Dispatch owns secure browser session cookies;
no application session or password table is required.

| Table | Purpose and important constraints/indexes |
| --- | --- |
| `customer_identities` | Login-provider subject mapped to customer; unique `(provider, external_subject)` |
| `customer_invitations` | Admin invitations with hashed token, expiry, status and inviter; token never stored plaintext |
| `customers` | UUID, unique external reference, business/contact summary and lifecycle status; indexes on normalised email/business name |
| `customer_business_profiles` | One-to-one commercial business profile; unique `customer_id` |
| `customer_notes` | Internal append-oriented notes with author and visibility; never exposed to agent/public APIs |

### Onboarding and integrations

Phase 7 implements this separate lifecycle and its operational projections.

| Table | Purpose and important constraints/indexes |
| --- | --- |
| `onboarding_cases` | Separate onboarding aggregate and lifecycle; indexed by customer/status |
| `onboarding_tasks` | Customer/internal tasks, status, due date and ordering; indexed by case/owner/status |
| `onboarding_task_dependencies` | Same-case dependency graph with self/cycle protection |
| `customer_integrations` | Provider/category/status/last check; unique active `(customer_id, integration_code)` |

### Catalogue and pricing

Phase 2 implements `offerings`, `plans` and `plan_features`. Phase 3 implements
`plan_prices`, `customer_price_overrides` and `price_quotes`. Phase 4 implements
`discounts`, `promotion_codes`, `customer_discounts` and
`discount_redemptions`.

`offerings`, `plans`, `plan_features`, `plan_prices`,
`customer_price_overrides`, `discounts`, `promotion_codes`,
`customer_discounts`, `discount_redemptions`, and `price_quotes` follow the
mission model. Codes are stable and case-normalised. Money is integer minor
units. Effective ranges use checks (`effective_to > effective_from`) and queries
are supported by plan/customer/date indexes. Historical price rows are never
overwritten.

### Implemented pricing precedence

The single pricing resolver applies:

1. the active base plan-price version for the requested half-open effective
   range;
2. an effective customer-specific override, when present;
3. effective customer discounts, using percentage-before-fixed ordering for a
   stackable set and comparing that set with the best exclusive offer;
4. the central Australian GST policy (`EXCLUSIVE`, `INCLUSIVE` or `EXEMPT`).

Money is always a safe integer in minor units and currencies must match. The
existing public decision remains AUD pricing excluding GST. Quote rows persist
the resolver's complete version/override/tax breakdown as immutable JSON plus
queryable totals.

Promotion codes are uppercase-normalised and may be generic or constrained by
customer, plan, effective dates, first purchase and redemption limits. Discount
definitions use lowercase stable codes, percentage basis points or fixed minor
units, `ONCE`/`REPEATING`/`FOREVER` duration and an explicit stacking flag.
Claims and charge applications are append-only, idempotent redemption events.
The optional subscription scope on customer discounts is now a validated Phase
5 foreign key with database checks that prevent cross-customer assignments.

### Subscription, billing and service access

Phase 5 implements the seven commercial record tables in this group. Phase 10
adds the provider-neutral webhook inbox; none of these records performs payment
execution or sends notifications from an HTTP controller.

| Table | Purpose and important constraints/indexes |
| --- | --- |
| `subscriptions` | Explicit lifecycle, grace/extension deadlines and period-end cancellation; at most one current primary subscription per customer/product scope |
| `subscription_prices` | Immutable contracted commercial terms by effective range |
| `subscription_entitlements` | Capability snapshots consumed by agent APIs; never inferred from plan name |
| `billing_accounts` | Customer-to-provider billing identity; external IDs separate from customer aggregate |
| `invoices` | Provider-neutral invoice header, integer totals and status; unique provider invoice reference |
| `invoice_lines` | Immutable description, quantity and minor-unit totals |
| `payment_reminders` | Scheduled/sent/failed reminder history; unique idempotency scope per invoice/stage |
| `customer_billing_profiles` | One provider-independent billing contact per customer |
| `billing_notes` | Append-only internal billing history linked to optional subscription/invoice context |
| `billing_webhook_events` | Phase 10 provider/event deduplication, payload hash, minimised normalized data, retry state and terminal processing evidence |
| `billing_provider_price_references` | Phase 15 mapping from an immutable contracted price snapshot to non-secret provider product/price IDs |
| `billing_checkout_sessions` | Phase 15 owned checkout/idempotency/completion evidence without redirect URLs, secrets or payment method data |

### Operations, agents and cross-cutting infrastructure

Phase 7 implements the agent, queue and notification foundations in this group;
Phase 12 adds durable delivery-attempt history and recovery controls.

| Table | Purpose and important constraints/indexes |
| --- | --- |
| `agent_links` | Customer to external agent ID and provisioning status |
| `agent_provisioning_jobs` | Idempotent provision/update/suspend jobs with attempts and error category |
| `agent_provisioning_attempts` | Phase 14 immutable provider-attempt history, safe error category and non-secret provider reference |
| `operational_queue_items` | Materialised work items for `CUSTOMER_ACTION`, `INTERNAL_ACTION`, `BILLING_ATTENTION`, `AGENT_PROVISIONING`; source reference is unique while open |
| `notification_templates` | Versioned channel/template definitions |
| `notification_deliveries` | Recipient reference, channel, status, retry schedule and provider reference; sensitive bodies minimised |
| `notification_delivery_attempts` | Immutable provider-neutral processing history with attempt number, outcome and lease-recovery evidence |
| `notification_preferences` | Customer channel consent/preference, separate from required service notices |
| `admin_users`, `roles`, `permissions`, `admin_user_roles`, `role_permissions` | Phase 6 provider identities and server-side RBAC; initial system vocabulary is migration-seeded and no passwords are stored |
| `audit_events` | Phase 6 append-only before/after commercial/security history; database triggers reject update/delete and application snapshots redact secret-bearing keys |
| `idempotency_keys` | Phase 9 scoped request hash and stored non-secret outcome with expiry; unique `(scope, key)` and immutable completed outcomes |
| `service_credentials` | Phase 9 separately issued service identity with SHA-256 secret hash, scopes, expiry, rotation lineage and terminal revocation; raw tokens are never persisted |
| `service_rate_limits` | Phase 9 durable per-credential fixed-window counters for the service boundary |
| `api_rate_limits` | Phase 10 hash-only durable fixed-window counters for anonymous/public endpoints |

## Relationship summary

- Customer 1—1 business profile; 1—many invitations, identities, notes,
  onboarding cases, integrations, subscriptions, invoices and audit targets.
- Onboarding case 1—many tasks.
- Plan many—many Offering through plan features; Plan 1—many immutable prices.
- Customer and Plan scope overrides/quotes; Customer and optional Subscription
  scope applied discounts. Subscription scope is enforced against customer and
  plan ownership at the database boundary.
- Subscription 1—many price versions and entitlement snapshots.
- Customer 1—1 billing profile and 1—many billing accounts/invoices/billing
  notes; Invoice 1—many lines/reminders and optional billing-note references.
- Provider webhook identity is unique by `(provider, provider_event_id)` and
  references invoices/subscriptions only through repository-owned provider
  references; the webhook table deliberately stores no raw request body.
- Customer 1—many agent links/provisioning jobs and operational queue items.

## Operational queue policy

Queues are views/materialised work projections, not alternate lifecycle truth.
Application services update source state and enqueue/outbox the corresponding
work item in the same transaction. Completing a queue item never independently
changes customer, billing or subscription state.

Phase 12 adds an idempotent recovery projector over registrations, onboarding
cases/tasks, invoices, integrations and agent jobs. It creates missing work,
refreshes changed priority/title/due facts and closes stale projections. A
bounded/truncated scan never closes unseen work.

## Notification policy

Domain/application services request a semantic notification through a port.
Phase 12's reconciliation source covers welcome, customer/onboarding action,
payment, subscription lifecycle, expiring discount, agent-ready and integration
attention messages. A delivery worker chooses templates and provider adapters;
its five-minute lease is recoverable, every attempt is durable and external
channels remain disabled unless explicitly configured. HTTP controllers never
send messages directly. Consent, required service notices, retries, provider
IDs, in-app read state and audit correlation remain explicit.

## Security and privacy boundaries

- purpose-specific DTOs prevent notes, negotiated pricing and credentials from
  reaching public or agent APIs;
- customer/admin/service identities use distinct authentication and scopes;
- invitations and service credentials are hashed or provider-managed;
- every commercial mutation carries actor/request context into append-only audit;
- retention removes or anonymises eligible personal data without destroying
  legally required commercial history.
- webhook signatures are verified against the untouched bounded body before
  JSON parsing; secrets, signatures and raw provider payloads are never stored;
- write requests carrying an `Origin` must be same-origin, public endpoints use
  durable hash-only limits, and worker responses apply restrictive browser
  security headers without permissive credentialed CORS.

## Migration strategy

Phase 2 activates D1 and introduces the first forward-only migration for
customer/catalogue foundations. Phase 3 adds pricing and Phase 4 adds promotion
persistence. Phase 5 adds subscription and billing records and extends customer
discounts with a validated subscription foreign key. Phase 6 adds admin/RBAC/
audit persistence and links a consumed invitation to one customer identity.
Phase 7 adds onboarding, integration, agent provisioning, operational queue and
notification persistence. Phase 9 adds API idempotency, service credential and
service rate-limit persistence. Phase 10 adds the billing webhook inbox and
anonymous API rate limits, plus forward guards for provider reconciliation.
Phase 11 adds billing profiles/notes and rebuilds `subscriptions` forward-only
to add lifecycle deadlines and scheduled cancellation while preserving data and
recreating every cross-table trigger that depends on the subscription table.
Phase 12 rebuilds notification records forward-only to add WhatsApp channel
readiness, processing leases, cancellation/read state and immutable attempt
history; interrupted pre-upgrade processing records are safely requeued.
Phase 15 adds provider price and checkout evidence, and replaces the subscription
update trigger forward-only to permit one initial complete provider link while
preserving immutable references thereafter. Stripe-specific code cannot
recalculate catalogue, discount or entitlement policy.
Applied migrations are never renamed or rewritten. Every migration receives
clean-install and upgrade validation. Phase 1 intentionally has no migration
because the target schema was not yet implemented.
