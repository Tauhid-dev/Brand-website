# Phase 3 database schema — versioned pricing and quote snapshots

Migration: `site/drizzle/0001_last_rafael_vega.sql`, applied after Phase 2's
`0000_uneven_violations.sql`. It is forward-only and preserves existing rows.

## Tables

| Table | Required shape | Constraints and indexes |
| --- | --- | --- |
| `plan_prices` | UUID ID/plan FK, currency, billing interval, recurring/setup amounts in minor units, tax behaviour, half-open effective range, active flag and creation actor/time | unique scope/start; range, currency, interval, tax and non-negative amount checks; composite effective lookup index; restricted plan deletion |
| `customer_price_overrides` | UUID ID, customer/plan FKs, currency, billing interval, negotiated recurring/setup amounts, half-open range, reason/status and actor/timestamps | unique scope/start; range, currency, interval, status, timestamp and amount checks; customer/plan/effective lookup indexes; restricted customer/plan deletion |
| `price_quotes` | UUID ID, customer/plan FKs, interval, base/override/discount/subtotal/tax/total minor amounts, currency, full pricing JSON snapshot, validity and creation actor/time | total arithmetic and validity checks; customer/time and plan/time indexes; restricted customer/plan deletion |

The proposed mission model omitted currency from customer overrides and billing
interval from quotes. Both are persisted here deliberately: currency allows
the boundary to reject mismatched negotiated terms before resolution, while
quote interval makes historical commercial records directly queryable without
parsing JSON.

## Conflict and immutability enforcement

SQLite triggers reject intersecting active plan-price ranges with
`PRICE_VERSION_CONFLICT` and intersecting active/scheduled customer overrides
with `PRICE_OVERRIDE_CONFLICT`. This closes the race between an application
overlap check and a concurrent insert. The version-publication adapter closes
the current range and inserts its successor in one D1 batch.

Additional triggers prevent changes to historical price terms, deletion of
price/override history, and any update or deletion of quote snapshots. An
override can later be revoked by status and a price version can be closed or
deactivated without changing its commercial amounts.

## Pricing rules

- Money uses non-negative safe integer minor units; A$649.00 is `64900`.
- Effective ranges are `[effectiveFrom, effectiveTo)`; a null end is open.
- Resolution is base version → customer override → discount placeholder → GST.
- The existing public decision is AUD pricing excluding 10% GST. Inclusive and
  exempt behaviours are supported for explicit future commercial terms.
- Discounts and promotion codes are not inferred or implemented in Phase 3.

## Migration validation and rollback

Tests apply `0000` with representative customer/plan rows, then apply `0001`
and confirm those rows survive. They exercise database range conflicts,
immutability triggers, foreign keys and the effective lookup query plan. A
destructive down migration is intentionally absent because removing commercial
history would violate retention requirements. Application rollback keeps these
additive tables; any schema correction must be another forward migration.

## Deferred surfaces

No REST route or admin/customer page was added. `PublicPricingProvider` and
`PreviewPriceService` are application boundaries for later Phase 8/9 surfaces.
Discounts, coupons and their transactional redemption rules begin in Phase 4.
