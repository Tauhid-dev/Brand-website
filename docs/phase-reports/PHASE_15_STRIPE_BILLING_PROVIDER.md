# Phase 15 — Stripe and billing-provider integration

Date: 25 August 2026.

## Why this phase

The synchronized `origin/main` contained complete Phases 1–14. Phase 15 was
partial: provider-neutral billing and subscription models, a `BillingProvider`
port, signed Stripe webhook verification, a durable event inbox and basic
invoice/subscription reconciliation existed. Outbound customer/price/checkout
execution, subscription synchronization, checkout references and import of
provider-created recurring invoices were absent.

## Scope completed

- Implemented `StripeBillingProvider` behind the provider-neutral application
  port using bounded Stripe REST requests, provider idempotency and safe error
  categories. Controllers contain no provider business logic.
- Added idempotent billing-customer creation, Stripe product/recurring-price
  creation from Zuno Pixel's effective contracted price, and subscription-mode
  Checkout initiation. Internally resolved overrides and discounts remain the
  pricing source of truth.
- Added explicit provider update, pause, resume and cancellation synchronization
  without allowing provider state to decide service entitlement directly.
- Added checkout and provider subscription-link reconciliation plus recurring
  invoice import/payment/failure/void/uncollectible mapping through the existing
  signed, deduplicated and recoverable webhook inbox.
- Added customer checkout and protected administrator provider controls.
- Kept secret keys, signatures, raw webhook bodies, checkout URLs and payment
  method/card data out of D1 and audit history.
- Added fail-closed runtime configuration. Test keys can be configured for
  development; `sk_live_` execution additionally requires
  `STRIPE_LIVE_ENABLED=true`.

## Persistence and API

- Added forward migration `site/drizzle/0013_wooden_siren.sql`.
- Added `billing_provider_price_references`, uniquely mapping an internal
  subscription-price snapshot to provider product/price IDs.
- Added `billing_checkout_sessions` with customer/subscription ownership,
  provider session ID, scoped idempotency key, status and completion/expiry
  evidence. The redirect URL is not persisted in this table.
- Replaced the subscription update trigger forward-only so a single initial
  null-to-complete provider reference link is allowed while later provider
  reference changes remain immutable.
- Added `POST /api/v1/customer/billing/checkout` and
  `POST /api/v1/admin/subscriptions/{subscriptionId}/provider-sync`.
- Expanded Stripe webhook normalization for checkout completion, provider
  subscription metadata and recurring invoice state.
- Updated OpenAPI 3.1 and the protected customer/admin portals.

## Tests

- Stripe request shape, secret isolation, provider idempotency, dynamic recurring
  price and subscription-update tests using fetch fixtures only.
- Checkout orchestration tests prove the effective contracted price is used and
  only non-secret provider references are persisted.
- Checkout/subscription linking, recurring invoice import, payment lifecycle,
  signature, deduplication and retry tests.
- Phase 14-to-15 upgrade, clean-chain, uniqueness, check-constraint, foreign-key
  and initial-link immutability migration tests.
- OpenAPI authorization and contract coverage for both new routes.

## Known limitations and deferred work

- No Stripe credentials are committed and this branch does not activate or
  deploy live payments. Runtime configuration and Stripe-side webhook endpoint
  registration remain an environment-owner operation.
- Out-of-order verified events remain recoverable through the existing webhook
  retry inbox.
- Phase 16 owns system-wide concurrency drills, operational recovery scheduling,
  observability/alerting, retention and production migration rehearsal.
- Phase 17 owns final architecture/release evidence and go/no-go assessment.
