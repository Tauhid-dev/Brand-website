# Phase 12 notification operations schema

Migrations: `site/drizzle/0009_numerous_meltdown.sql` and
`site/drizzle/0010_stale_kang.sql`, applied after Phase 11.

## Changes

| Table | Change | Enforcement |
| --- | --- | --- |
| `notification_templates` | Rebuilt to allow `WHATSAPP` beside email, SMS and in-app; fourteen commercial templates seeded | immutable published content; unique version and one active code/channel |
| `notification_preferences` | Rebuilt to allow WhatsApp preferences | unique customer/code/channel; opt-in/out only |
| `notification_deliveries` | Added `processing_started_at`, `lease_expires_at`, `cancelled_at` and `read_at` | processing requires both lease fields; cancellation/read outcome checks; optimistic version trigger |
| `notification_delivery_attempts` | New immutable provider-neutral attempt history | unique delivery/attempt number; terminal outcome checks; update of identity fields and all deletes rejected |
| `permissions` / `role_permissions` | Added `OPERATIONS_READ` and `OPERATIONS_WRITE` | explicit admin/workforce role grants; read-only receives no write access |

## Upgrade behavior

Existing template, preference and delivery identifiers/history are copied
forward. Existing `PROCESSING` deliveries cannot have Phase 12 leases, so the
migration safely changes them to `PENDING`, schedules them from their last
update time and increments their version. Existing cancelled deliveries receive
their prior update time as cancellation evidence. The migration recreates the
notification optimistic-concurrency and template-immutability triggers after
the SQLite table rebuild and runs `foreign_key_check`.

## Query support

- `notification_deliveries_retry_idx` supports pending retry/schedule work.
- `notification_deliveries_lease_idx` supports stale processing recovery.
- `notification_delivery_attempts_delivery_created_idx` supports delivery
  history.
- `notification_delivery_attempts_status_created_idx` supports operational
  outcome review.

Migration tests cover both representative upgrade data and the clean full
migration chain. They also verify query plans, checks, triggers, foreign keys and
WhatsApp readiness.
