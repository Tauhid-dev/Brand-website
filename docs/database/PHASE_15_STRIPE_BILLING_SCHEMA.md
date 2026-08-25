# Phase 15 Stripe billing-provider schema

Migration: `site/drizzle/0013_wooden_siren.sql`, applied after Phase 14.

`billing_provider_price_references` stores provider, internal immutable
subscription-price snapshot ID and the non-secret provider product/price IDs.
Unique `(provider, subscription_price_id)` and `(provider, provider_price_id)`
constraints prevent ambiguous mappings.

`billing_checkout_sessions` stores customer/subscription ownership, provider
session ID, idempotency key, `OPEN`/`COMPLETED`/`EXPIRED` state and bounded
completion/expiry timestamps. It does not store a Checkout redirect URL,
provider response, signature, secret, payment method or card data. Unique
provider session and customer/idempotency constraints make retried operations
safe.

The migration recreates `subscriptions_validate_update` to allow exactly the
initial complete provider link from three null external references to provider,
customer and subscription IDs. Existing non-null references remain immutable,
and version/lifecycle guards remain in force.
