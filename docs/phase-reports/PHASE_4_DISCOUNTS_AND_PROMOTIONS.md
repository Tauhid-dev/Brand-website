# Phase 4 completion — discounts and promotion codes

Completed: 23 August 2026. Branch:
`feature/phase-04-discounts-promotions`.

## Selection evidence

The synchronized `origin/main` at `e5af3ea` contained complete Phase 1 branding
and audit evidence, Phase 2 customer/catalogue foundations, and Phase 3 pricing/
quote persistence and services. It contained no discount schema, domain model,
promotion validation, redemption service or discount-aware resolver. Phase 4
was therefore the earliest incomplete phase. No earlier partial phase required
repair.

Repository inspection classified Phases 1–3 as `COMPLETE`, Phase 4 as
`NOT_STARTED`, and Phases 5–10 as `NOT_STARTED` before this branch began.

## Acceptance results

| Criterion | Result |
| --- | --- |
| Forward-only migration | Passed; additive `0002` preserves Phases 2–3 and existing data |
| Discount invariants | Passed; percentage/fixed values, currency, validity, claim limits and three duration policies |
| Promotion eligibility | Passed; normalised generic codes plus customer, plan, date, first-purchase, active and limit restrictions |
| Direct assignment | Passed; admin, sales, system and migration sources use one application service and effective-range policy |
| Atomic redemption | Passed; assignment/claim D1 batch, unique replay key and transaction-time trigger guards |
| Pricing integration | Passed; canonical resolver now applies deterministic discount policy before GST with a transparent breakdown |
| One-use consumption | Passed; charge-application events remove `ONCE` assignments from future resolution and reject duplicate use |
| Architecture boundary | Passed; domain/application services do not depend on HTTP, authentication, billing controllers or subscription controllers |
| Scope control | Passed; no Phase 5 subscription/billing implementation and no Phase 8/9 UI or REST surface |

## Changed surfaces

- Added discount, promotion-code, customer-assignment and redemption domain
  models, including the calculator and duration policy.
- Added creation, validation, redemption, direct-assignment,
  charge-application-recording and pricing-adapter application services behind
  repository/reference/history/clock/ID ports.
- Added the D1 discount repository and four tables with database concurrency,
  linkage, idempotency and immutability guards.
- Replaced Phase 3's zero-discount placeholder with the discount-resolution port
  while retaining a no-discount default for existing/public callers.
- Added domain, application, repository integration, upgrade migration,
  transaction-limit, query-plan and immutable-history tests.

## Validation evidence

```text
npm run db:generate
npm run lint
npx tsc --noEmit
npm test
./scripts/validate-framework
python3 -m unittest discover -s tests -v
./scripts/validate-planning planning
```

Final results: Drizzle reports fifteen tables and no schema drift; ESLint and
strict TypeScript pass; all 47 site tests and all 12 Genesis tests pass;
planning validation reports zero errors/warnings; the Vinext production build
succeeds.

## Known limitations and deferred work

- `customer_discounts.subscription_id` awaits the Phase 5 subscription table so
  it can be introduced as a real foreign key.
- `PurchaseHistoryPort` provides first-purchase policy without coupling to
  billing; its billing-backed adapter and cross-boundary transaction policy are
  Phase 5 work.
- Authentication/RBAC and append-only commercial audit events remain Phase 6.
- REST and UI surfaces remain Phases 8–9.
- There is no destructive down migration; additive commercial history is
  retained.

## Next phase

After this branch is reviewed and merged, Phase 5 adds subscriptions,
entitlements and billing records. Do not implement those concerns on this
branch.
