# Phase 11 billing operations schema

Migration: `site/drizzle/0008_bouncy_polaris.sql`, applied after Phase 10's
`0007_regular_shadowcat.sql`.

## Additions

| Change | Purpose | Protection |
| --- | --- | --- |
| `customer_billing_profiles` | Provider-independent customer billing contact | one row per customer; validated contact/timestamps; restrictive customer FK |
| `billing_notes` | Internal billing history with optional subscription/invoice context | append-only update/delete triggers; administrator author FK; indexed customer chronology |
| `subscriptions.grace_period_ends_at` | Explicit past-due grace deadline | future relative to lifecycle update |
| `subscriptions.service_extended_until` | Explicit temporary service deadline | future relative to lifecycle update |
| `CANCEL_AT_PERIOD_END` status | Scheduled cancellation without early service revocation | `cancel_at` must equal the current period end; included in the unique current-subscription scope |

The migration rebuilds `subscriptions` because SQLite cannot alter the existing
status/check constraints in place. It copies every existing row, supplies null
values for new deadlines and recreates indexes plus the subscription,
discount-scope and invoice-scope triggers. Existing migrations are untouched.

The update trigger retains optimistic version checks and immutable commercial
terms. It permits only the documented lifecycle graph, provider period
reconciliation, and a same-state temporary extension for a past-due or suspended
subscription. Billing notes cannot be edited or deleted.

Automated upgrade tests apply migrations 0000–0007, insert a representative
subscription, apply 0008 and verify data preservation, columns, tables,
transitions and history immutability. The shared clean-install harness applies
the complete migration lineage.
