# Phase 5 database schema — subscriptions, entitlements and billing records

Migration: `site/drizzle/0003_strange_absorbing_man.sql`, applied after Phase
4's `0002_windy_sprite.sql`. It preserves all existing records and adds a real
subscription foreign key to `customer_discounts`.

## Tables

| Table | Purpose | Important safeguards |
| --- | --- | --- |
| `subscriptions` | Current commercial agreement, lifecycle, period and optional external references | one current subscription per customer; optimistic version; transition, currency, period, trial and cancellation checks; immutable history |
| `subscription_prices` | Effective-dated contracted terms plus full pricing snapshot | overlap prevention; immutable financial terms; effective lookup index; no deletion |
| `subscription_entitlements` | Effective-dated capability and usage-limit snapshots | stable offering code; overlap and limit checks; terms immutable; ranges close rather than delete |
| `billing_accounts` | Customer-to-provider billing identity | unique customer/provider and provider/reference pairs; explicit lifecycle and currency |
| `invoices` | Provider-neutral invoice header and controlled payment state | immutable commercial terms; controlled transitions; totals/date checks; customer/subscription/status indexes |
| `invoice_lines` | Immutable invoice composition | arithmetic checks; draft-only insertion; no update/delete |
| `payment_reminders` | Scheduled and completed reminder history | unique idempotency key and invoice/stage; controlled outcomes; immutable terms/history |

`customer_discounts.subscription_id` now references `subscriptions`. Database
triggers reject cross-customer assignments and redemption records whose
subscription does not match the customer and plan.

## State and concurrency policy

Subscription transitions are:

`PENDING → TRIAL/ACTIVE/CANCELLED/EXPIRED`

`TRIAL → ACTIVE/PAST_DUE/SUSPENDED/CANCELLED/EXPIRED`

`ACTIVE ↔ PAST_DUE`, with either able to suspend, cancel or expire;
`SUSPENDED → ACTIVE/CANCELLED/EXPIRED`; cancelled and expired are terminal.

Every mutation increments an optimistic version. A stale concurrent write is
rejected by a trigger even if both callers read the same prior state. A partial
unique index prevents two current subscriptions for one customer.

Suspension, cancellation and expiry close open entitlement ranges in the same
D1 batch as the state change. Resumption inserts new ranges from the latest
contracted entitlement definitions. Customer, subscription, price and
entitlement history is never deleted.

Invoice transitions are `DRAFT → OPEN/VOID` and
`OPEN → PAID/VOID/UNCOLLECTIBLE`. Opening verifies stored line totals equal the
header. Paid/void invoices have zero amount due. Reminder records move once from
scheduled to sent, failed or cancelled.

## Application boundaries

- `CreateSubscriptionService` resolves pricing through the canonical pricing
  port and entitlement definitions through the catalogue port.
- `SubscriptionLifecycleService`, `ScheduleSubscriptionPriceService` and
  `EntitlementService` own lifecycle, explicit repricing and service validation.
- Billing account, invoice lifecycle and payment-reminder services depend on a
  billing repository port.
- `BillingProvider` defines future payment-provider operations without importing
  Stripe or another provider into the domain.

## Migration validation and rollback

Upgrade tests apply migrations 0000–0002, seed representative Phase 4 data, and
then apply 0003. They verify all 22 tables, the new foreign key column, unique
current subscriptions, optimistic concurrency, lifecycle triggers, immutable
contract/invoice history, scoped discounts and query-plan index selection.

There is no destructive down migration. A correction must be another
forward-only migration so customer and financial history remain intact.

## Deferred work

Payment execution and verified webhooks remain Phase 10. Notification delivery
for reminders remains Phase 7. Authentication/audit, REST and UI remain Phases
6, 9 and 8 respectively.
