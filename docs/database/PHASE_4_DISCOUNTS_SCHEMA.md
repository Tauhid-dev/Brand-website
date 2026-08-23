# Phase 4 database schema — discounts and promotion codes

Migration: `site/drizzle/0002_windy_sprite.sql`, applied after Phase 3's
`0001_last_rafael_vega.sql`. It is additive and preserves all customer,
catalogue, pricing and quote records.

## Tables

| Table | Required shape | Constraints and indexes |
| --- | --- | --- |
| `discounts` | Stable code, percentage basis points or fixed minor-unit amount, duration, validity, global claim limit, active/stacking flags and actor/timestamps | unique lowercase code; mutually exclusive value checks; currency, duration, range, limit and timestamp checks; effective lookup index |
| `promotion_codes` | Discount FK, uppercase redeemable code, optional customer/plan restrictions, validity, redemption limit/count and first-purchase flag | unique code; range/count/timestamp checks; discount and effective indexes; restricted FK deletion |
| `customer_discounts` | Customer/discount FKs, optional promotion FK, source, half-open effective range, status and application evidence | overlap trigger for effective assignments; source/status/range checks; customer/effective, discount and promotion indexes |
| `discount_redemptions` | Append-only claim or charge-application event, assignment/customer/plan references, idempotency key, amount/currency and timestamp | unique idempotency key; assignment/restriction/limit/once-use triggers; immutable update/delete triggers; promotion, discount and customer history indexes |

`customer_discounts.subscription_id` is intentionally deferred. Phase 5 owns
the subscription table and will add a real foreign key in its forward migration;
Phase 4 does not persist an unchecked placeholder identifier.

## Transaction and concurrency policy

Promotion assignment and its zero-value claim event are written in one D1
batch. Before-insert triggers re-check active flags, effective dates, customer
and plan restrictions, promotion and definition limits, and assignment linkage
inside the write transaction. The claim then increments `redemption_count` in
the same transaction. A globally unique idempotency key makes replay outcomes
stable, while a customer/discount range trigger closes concurrent assignment
races.

Charge applications are separate append-only events. The database verifies
their assignment/customer/discount/promotion/plan relationship and rejects a
second charge application for an `ONCE` assignment. Redemptions cannot be
updated or deleted.

## Discount resolution rules

- Effective ranges are half-open: `[effective_from, effective_to)`.
- Percentage values use basis points; fixed values use integer minor units and
  must share the charge currency.
- Stackable percentages apply before stackable fixed amounts in stable code
  order. The complete stackable result competes with the best non-stackable
  discount, and the larger reduction wins.
- A reduction is capped at the current charge, so pricing never becomes
  negative. GST is calculated after discounts.
- `REPEATING` assignments receive a calendar-month end date;
  `FOREVER` remains open; `ONCE` remains eligible until its first recorded charge
  application.

## Migration validation and rollback

Tests apply Phases 2 and 3 with representative data before applying Phase 4,
then verify all prior data survives. They exercise normalisation, overlap and
redemption-limit races, idempotency, linkage, immutable history, one-use
consumption and the customer/effective query index. There is no destructive down
migration; corrections must be another forward-only migration.

## Deferred surfaces

No REST endpoint, admin page or customer page is introduced in this phase.
Phase 8 owns UI surfaces and Phase 9 owns versioned HTTP APIs. Authentication,
RBAC and commercial audit-event infrastructure remain Phase 6. First-purchase
validation is expressed behind `PurchaseHistoryPort`; its billing-backed adapter
arrives with the Phase 5 billing/subscription model.
