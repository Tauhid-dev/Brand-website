# Phase 10 billing hardening schema

Migration: `site/drizzle/0007_regular_shadowcat.sql`, applied after Phase 9's
`0006_broken_centennial.sql`.

## Additions

| Table | Purpose | Important protections |
| --- | --- | --- |
| `billing_webhook_events` | Durable provider-neutral webhook inbox and processing evidence | unique provider/event identity; payload hash; bounded attempts; constrained state; retry/query indexes; immutable identity and terminal triggers |
| `api_rate_limits` | Durable fixed-window anonymous/public limits | composite scope/subject/window key; 64-character SHA-256 subject hash; positive counter; expiry-window index |

The webhook row stores only normalized event facts needed for reconciliation.
Raw bodies, provider signatures, webhook secrets, customer contact details and
arbitrary provider metadata are not persisted. `PROCESSED` and `IGNORED` rows
are terminal. Retryable failures retain a safe failure category and next-attempt
time without retaining an exception or response body.

Concurrent deliveries of an event already in `PROCESSING` are rejected for
later retry. A processing claim older than five minutes can be atomically
reclaimed with an incremented bounded attempt count, allowing recovery from an
interrupted worker without acknowledging unfinished commercial work.

## Subscription reconciliation guard

Migration 0007 replaces the existing `subscriptions_validate_update` trigger
with a forward-compatible version. It keeps customer, plan, billing terms and
provider references immutable and keeps optimistic version enforcement. A
provider-linked subscription may additionally reconcile its current period
without inventing a lifecycle transition. All previously allowed lifecycle
transitions remain explicit.

## Upgrade and rollback

Automated migration tests first apply migrations 0000–0006 with representative
Phase 9 records, then apply 0007 and verify 43 tables, preserved data, indexes,
deduplication, transition guards and provider-period reconciliation. Clean
install coverage applies the complete lineage through the shared D1-compatible
SQLite harness.

The migration is forward-only and does not rewrite any applied migration.
Application rollback keeps these additive tables in place. Do not drop webhook
evidence during an application rollback: disable provider delivery, deploy the
previous known-good build, and preserve the inbox for replay or manual
reconciliation after the fix.
