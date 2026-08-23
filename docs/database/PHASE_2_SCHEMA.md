# Phase 2 database schema — customer and catalogue foundation

Migration: `site/drizzle/0000_uneven_violations.sql` (forward-only initial
migration). Runtime binding: Cloudflare D1 `DB`.

All identifiers are application-generated UUID text values. Domain value
objects validate UUIDs before persistence; email and stable codes are
normalised to lower case before repository calls. Dates use millisecond integer
timestamps. Foreign keys are enabled by D1 and by the migration contract tests.

## Customer tables

| Table | Required shape | Constraints and indexes |
| --- | --- | --- |
| `customers` | UUID ID, external reference, business/contact summary, email, status, creation source, timestamps | unique external reference and email; status/source checks; timestamp ordering; status and created-time indexes |
| `customer_business_profiles` | UUID ID/customer FK, business/trading data, ABN/contact/location, timezone/country, timestamps | unique customer FK (1:1); cascading customer FK; `country = AU`; timestamp ordering |
| `customer_notes` | UUID ID/customer FK, body, admin/system author, timestamp | cascading customer FK; author-type check; customer/time index |
| `customer_identities` | UUID ID/customer FK, provider, external subject, email, timestamp | unique provider/subject; customer and email indexes; cascading customer FK |
| `customer_invitations` | UUID ID, optional customer FK, email, token hash, status, inviter, expiry/acceptance timestamps | unique token hash; status, expiry and accepted-at checks; email/status and customer indexes; no plaintext token column |

`customers.creation_source` distinguishes `SELF_REGISTRATION`, `ADMIN`,
`INVITATION` and `MIGRATION`. Customer state is limited to `PROSPECT`, `ACTIVE`,
`SUSPENDED`, `CANCELLED` and `ARCHIVED`. Lifecycle transition policy remains in
the customer aggregate rather than an HTTP controller.

## Catalogue tables

| Table | Required shape | Constraints and indexes |
| --- | --- | --- |
| `offerings` | UUID ID, stable code, editable name/description/category, active flag, display order, timestamps | unique code; non-negative display order; timestamp ordering; active/order index |
| `plans` | UUID ID, stable code, editable name/description, active/featured/custom flags, display order, timestamps | unique code; non-negative display order; timestamp ordering; active/order index |
| `plan_features` | UUID ID, plan/offering FKs, inclusion, optional limit/unit/configuration JSON, timestamps | unique plan/offering pair; cascading FKs; non-negative paired limit/unit; inclusion and timestamp checks; offering index |

The plan-to-offering relationship is many-to-many. Stable codes can be used by
later APIs and entitlements without coupling behaviour to editable display names.

## Migration and seed verification

Automated tests apply the migration statement-by-statement to a new SQLite
database, inspect all eight tables and exercise checks, uniqueness and foreign
keys. Separate repository contract tests run both D1 adapters through Drizzle.
The development seed is idempotent by stable code and contains ten offerings,
four initial plans, seventeen feature relationships and explicitly fictional
customer inputs.

## Intentionally deferred

- Authentication, sessions, invitation acceptance and real token/delivery
  implementations (Phase 6).
- Public/admin REST endpoints and purpose-specific DTOs (Phases 8–9); shared
  request-context and safe error-envelope primitives already exist.
- Versioned prices, discounts, subscriptions, billing and entitlements
  (Phases 3–5).
- Onboarding, integrations, notifications and operational queues (Phase 7).

No pricing, billing, onboarding, admin UI or broad API surface is introduced by
this migration.
