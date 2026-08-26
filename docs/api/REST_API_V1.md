# Zuno Pixel REST API v1

Base namespace: `/api/v1`

Format: JSON

OpenAPI: `/api/v1/openapi.json`

Every response includes `x-request-id`. Errors never expose raw stack traces:

```json
{
  "error": {
    "code": "PRICE_OVERRIDE_CONFLICT",
    "message": "An active price override already exists for this period.",
    "requestId": "6bc5d7ba-..."
  }
}
```

Validation uses 400, missing authentication 401, missing permission/scope 403,
missing resources 404, domain/idempotency conflicts 409, oversized requests
413, rate limits 429, unavailable configured integrations 503 and unexpected
errors 500.

## Endpoint catalogue

| Method and route | Authentication | Permission or scope |
| --- | --- | --- |
| `GET /public/plans` | Public | Current public terms only |
| `GET /public/plans/{planCode}` | Public | Current public terms only |
| `POST /public/promotion-codes/validate` | Public | Non-mutating eligibility |
| `GET /customer/account` | ChatGPT SIWC customer | Own customer only |
| `POST /customer/billing/checkout` | ChatGPT SIWC customer | Own current subscription only |
| `GET /customer/entitlements` | ChatGPT SIWC customer | Own customer only |
| `PATCH /customer/notification-preferences` | ChatGPT SIWC customer | Own customer only |
| `GET/POST /admin/customers` | ChatGPT SIWC admin | `CUSTOMER_READ` / `CUSTOMER_WRITE` |
| `GET /admin/customers/{customerId}` | ChatGPT SIWC admin | `CUSTOMER_READ` |
| `GET /admin/customers/{customerId}/pricing` | ChatGPT SIWC admin | `PRICE_READ` |
| `GET /admin/customers/{customerId}/billing` | ChatGPT SIWC admin | `BILLING_READ` |
| `POST /admin/customers/{customerId}/billing-profile` | ChatGPT SIWC admin | `BILLING_WRITE` |
| `POST /admin/customers/{customerId}/billing-notes` | ChatGPT SIWC admin | `BILLING_WRITE` |
| `POST /admin/customers/{customerId}/pricing/preview` | ChatGPT SIWC admin | `PRICE_READ`; never persists |
| `POST /admin/customers/{customerId}/price-overrides` | ChatGPT SIWC admin | `PRICE_WRITE` |
| `POST /admin/customers/{customerId}/discounts` | ChatGPT SIWC admin | `DISCOUNT_WRITE` |
| `GET/POST /admin/plans` | ChatGPT SIWC admin | `CATALOG_READ` / `CATALOG_WRITE` |
| `GET/POST /admin/offerings` | ChatGPT SIWC admin | `CATALOG_READ` / `CATALOG_WRITE` |
| `GET/POST /admin/prices` | ChatGPT SIWC admin | `PRICE_READ` / `PRICE_WRITE` |
| `GET/POST /admin/discounts` | ChatGPT SIWC admin | `DISCOUNT_READ` / `DISCOUNT_WRITE` |
| `GET/POST /admin/promotion-codes` | ChatGPT SIWC admin | `DISCOUNT_READ` / `DISCOUNT_WRITE` |
| `GET/POST /admin/subscriptions` | ChatGPT SIWC admin | `SUBSCRIPTION_READ` / `SUBSCRIPTION_WRITE` |
| `GET/PATCH /admin/subscriptions/{subscriptionId}` | ChatGPT SIWC admin | `SUBSCRIPTION_READ` / `SUBSCRIPTION_WRITE` |
| `POST /admin/subscriptions/{subscriptionId}/operations` | ChatGPT SIWC admin | `SUBSCRIPTION_WRITE` |
| `POST /admin/subscriptions/{subscriptionId}/provider-sync` | ChatGPT SIWC admin | `BILLING_WRITE` |
| `GET /admin/invoices` | ChatGPT SIWC admin | `BILLING_READ` |
| `GET /admin/notifications` | ChatGPT SIWC admin | `OPERATIONS_READ` |
| `GET /admin/audit-events` | ChatGPT SIWC admin | `AUDIT_READ` |
| `GET /admin/system/readiness` | ChatGPT SIWC admin | `OPERATIONS_READ` |
| `POST /admin/system/maintenance` | ChatGPT SIWC admin + idempotency key | `OPERATIONS_WRITE` |
| `POST /admin/service-credentials` | ChatGPT SIWC admin | `ADMIN_USER_MANAGE` |
| `POST /admin/service-credentials/{id}/rotate` | ChatGPT SIWC admin | `ADMIN_USER_MANAGE` |
| `DELETE /admin/service-credentials/{id}` | ChatGPT SIWC admin | `ADMIN_USER_MANAGE` |
| `GET /integrations/agent/customers/{customerId}` | Service bearer | `customer:read` |
| `GET /integrations/agent/customers/{customerId}/entitlements` | Service bearer | `subscription:validate`, `entitlement:read` |
| `GET /integrations/agent/customers/{customerId}/subscription-validation` | Service bearer | `subscription:validate`, `entitlement:read` |
| `GET /integrations/agent/customers/{customerId}/bootstrap` | Service bearer | `customer:read`, `subscription:validate`, `entitlement:read` |
| `PATCH /integrations/agent/customers/{customerId}/agent-link` | Service bearer | `agent-link:write` |
| `POST /integrations/agent/customers/{customerId}/provisioning-jobs` | Service bearer | `agent-link:write` |
| `POST /integrations/agent/customers/{customerId}/reconciliation` | Service bearer | `agent-link:write` |
| `POST /integrations/agent/provisioning-jobs/process` | Service bearer | `agent-link:write` |
| `POST /webhooks/billing/{provider}` | Provider signature | Configured provider only; Stripe uses `Stripe-Signature` |

Agent DTOs contain only business profile, subscription validation,
entitlements and link/provisioning fields. They exclude notes, negotiated
pricing, discounts, audit history and identity secrets.

## Agent provider operations

Agent link writes, reconciliation and job processing use service credentials,
never administrator browser sessions. Provision, update, suspend and resume
commands pass through the `AgentProvisioner` application port. The configured
HTTP adapter sends a minimal customer/platform reference and the durable job
idempotency key; the external application pulls its field-minimised bootstrap
profile through the service-authenticated read contract.

Provider execution is disabled unless `AGENT_PLATFORM_BASE_URL` and
`AGENT_PLATFORM_ACCESS_TOKEN` are supplied at runtime. The token is never stored
or audited. Transient network, 408, 425, 429 and 5xx failures receive bounded
exponential retries. Other 4xx and invalid-response failures are terminal.
Processing leases allow abandoned work to be reclaimed, and
`agent_provisioning_attempts` keeps provider references and safe error
categories without response bodies or credentials. Reconciliation compares
subscription validity, internal link state and the external provider state,
then synchronizes evidence or queues the required provision/suspend/resume
operation through the same application service.

## Billing operations

The signed-in customer account includes its own billing contact, effective
recurring terms, invoice history, derived payment state, renewal/cancellation
date and effective entitlement state. Administrator billing detail additionally
includes negotiated pricing and internal billing notes. Billing notes are never
returned by customer, public or agent endpoints.

The explicit subscription operation endpoint accepts `MARK_PAST_DUE`,
`SUSPEND`, `RESUME`, `SCHEDULE_CANCELLATION`, `CANCEL_IMMEDIATELY`,
`FINALIZE_CANCELLATION` and `EXTEND_SERVICE`. Relevant operations require
`gracePeriodEndsAt`, `serviceExtendedUntil` or `reason`. Every command uses the
subscription application service, optimistic version guard, idempotent REST
boundary and immutable audit recorder; controllers do not implement lifecycle
policy.

## Cursor pagination

Customers, subscriptions, invoices, discounts, promotion codes, notifications
and audit events accept `limit` from 1–100, an opaque `cursor` and controlled
`sort`. The only sort values are `-createdAt` (default) and `createdAt`.
Ordering is stable by creation time and UUID; a cursor is bound to its sort
direction. Clients must treat cursors as opaque:

```json
{
  "data": [],
  "pagination": {
    "nextCursor": "eyJ2IjoxLC4uLn0",
    "hasMore": true
  }
}
```

Supported controlled filters include customer/subscription status, customer
search, subscription customer/plan, invoice status/customer/subscription,
active discount/promotion state, notification status/channel/customer/code and
audit action/entity type. Unknown filters and sort fields are rejected.

## Idempotent writes

Commercial POST/PATCH/DELETE operations require an `Idempotency-Key` of 8–255
characters. The server stores a canonical request hash under an
operation- and actor-specific scope. An identical retry returns the original status/body
with `x-idempotent-replay: true`; a changed payload returns 409, and a concurrent
request returns 409 without executing the use case twice. Outcomes expire after
24 hours.

Credential issuance/rotation deliberately does not use the response store:
the raw token is returned once and never persisted. Price preview is also
non-mutating and bypasses idempotency persistence.

Customer notification-preference writes and agent-provisioning requests use
the same durable boundary. Billing webhook event IDs provide the equivalent
provider-owned deduplication key.

## Service authentication

Agent endpoints use `Authorization: Bearer <credential-id>.<secret>`. Credentials
are separate from administrators, carry explicit scopes and expiry, can be
rotated or terminally revoked, and are limited through durable per-minute
counters. Successful service requests and authentication failures are recorded
in immutable audit history. Never commit or log raw bearer tokens.

## Billing webhooks

`POST /api/v1/webhooks/billing/stripe` is available only when
`STRIPE_WEBHOOK_SECRET` is configured. The route reads at most 256 KiB, verifies
the timestamped HMAC signature against the untouched body before JSON parsing,
and rejects stale or invalid signatures. Unsupported providers and missing
configuration fail closed.

The durable inbox is unique on provider and provider event ID. Identical
delivery retries return success without replaying commercial mutations; a reused
event ID with a changed payload is rejected. Only minimised normalized facts are
stored—never the signature, secret or raw provider payload. Supported normalized
events cover subscription activation/renewal/past-due/cancellation and invoice
payment success/failure. Reconciliation runs through billing and subscription
application services and records immutable audit history.

Verified checkout events link the internal subscription to Stripe exactly once.
Invoice events import provider-created recurring invoice totals/status into the
internal invoice history and then use the existing lifecycle services for later
payment changes. Raw events remain absent from D1.

Outbound payment execution uses `STRIPE_SECRET_KEY` only through the
provider-neutral application service. Customer Checkout creates/reuses the
billing customer and a Stripe recurring price from the current internal
contracted amount, then returns the provider URL without storing it in the
checkout table. Live keys additionally require `STRIPE_LIVE_ENABLED=true`.

## HTTP hardening and public limits

JSON requests require `Content-Type: application/json` and default to a 32 KiB
body limit; unsupported fields are rejected rather than silently ignored. The billing webhook has its own
256 KiB raw-body limit. Write requests that carry an `Origin` header must match
the request origin. Browser responses add a restrictive content security policy,
clickjacking, MIME-sniffing, referrer, permissions and cross-origin-opener
protections; HTTPS responses also add HSTS. Privileged endpoints do not emit a
permissive CORS policy.

Anonymous fixed-window limits are durable and persist only a SHA-256 subject
hash: plan reads use 120 requests/minute, promotion validation 30/minute and the
growth-audit/contact submission 5/minute. Signed-in customer and administrator
API families use hashed actor IDs with limits of 300 and 600 requests/minute;
service endpoints retain their credential-scoped limits described above. Operators should prune expired rate
windows according to the launch runbook.

## Compatibility policy

`/api/v1` is a stable major contract. Additive endpoints, optional fields and
new enum values may be introduced with documentation. Existing required fields,
field meaning, authentication requirements and successful status codes are not
changed incompatibly inside v1. Removing or renaming a field, narrowing accepted
input, changing ownership semantics or changing a route's security model
requires a new major namespace and a documented migration window. Clients must
ignore response fields they do not understand and must not decode cursors.

## Examples

Create a customer:

```http
POST /api/v1/admin/customers
Idempotency-Key: customer-import-2026-0001
Content-Type: application/json

{"externalReference":"ZP-1001","businessName":"Example Plumbing Pty Ltd","contactName":"Casey Example","email":"casey@example.com"}
```

Retrieve an agent bootstrap profile:

```http
GET /api/v1/integrations/agent/customers/7f.../bootstrap
Authorization: Bearer <credential-id>.<secret>
```
