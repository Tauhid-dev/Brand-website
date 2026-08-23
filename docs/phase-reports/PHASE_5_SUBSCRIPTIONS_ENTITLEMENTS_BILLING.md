# Phase 5 completion — subscriptions, entitlements and billing records

Completed: 24 August 2026. Branch:
`feature/phase-05-subscriptions-billing`.

## Selection evidence

The synchronized `origin/main` at `2eb7dd4` contained complete Phases 1–4,
including the merged Phase 4 migration and discount-aware pricing resolver. It
contained no subscription, entitlement, billing-account, invoice or reminder
tables, modules or tests. Phase 5 was therefore the earliest incomplete phase.
No earlier partial phase required repair.

Repository inspection classified Phases 1–4 as `COMPLETE`, Phase 5 as
`NOT_STARTED`, Phase 6 as `PARTIAL` only through identity/invitation foundations,
Phases 7–8 as `NOT_STARTED`, Phase 9 as `PARTIAL` only through shared API
primitives, and Phase 10 as `NOT_STARTED`.

## Acceptance results

| Criterion | Result |
| --- | --- |
| Forward-only upgrade | Passed; additive 0003 preserves prior data and reaches 22 tables |
| Subscription lifecycle | Passed; domain and database transition matrices, terminal states and optimistic concurrency |
| Duplicate prevention | Passed; database partial uniqueness plus stable application conflict |
| Contract pricing | Passed; immutable effective versions and complete resolver snapshots; updates are explicit only |
| Entitlements | Passed; generated from plan features, queryable by customer, closed on suspension/cancellation and restored on resumption |
| Data preservation | Passed; lifecycle changes close ranges and never delete customer, subscription or entitlement history |
| Subscription discounts | Passed; subscription/customer/plan scope is enforced and cannot leak into unscoped pricing |
| Billing records | Passed; billing accounts, immutable invoice/line history and controlled invoice transitions |
| Payment reminders | Passed; unique replay keys, unique invoice/stage and controlled immutable outcomes |
| Provider boundary | Passed; provider-neutral port only; no fake payment or webhook implementation |
| Scope control | Passed; no Phase 6 authentication/audit, Phase 7 delivery queue, Phase 8 UI, or Phase 9 REST endpoints |

## Changed surfaces

- Added subscription and billing domain modules, application services, ports and
  D1 repositories.
- Added seven tables and extended customer discounts with a subscription FK.
- Extended catalogue and pricing ports narrowly for entitlement definitions and
  subscription-scoped discount resolution.
- Added database transition, concurrency, effective-range, relationship and
  immutability triggers.
- Added domain, application, D1 integration, upgrade, query-plan, concurrency,
  lifecycle and financial-history tests.

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

Final results: Drizzle reports 22 tables and no schema drift; ESLint and strict
TypeScript pass; all 59 site tests and all 12 Genesis tests pass; planning
validation reports zero errors/warnings; the Vinext production build succeeds.

## Known limitations and deferred work

- The provider port has no Stripe or other payment implementation by design.
- Payment-reminder delivery waits for Phase 7 notification infrastructure.
- Verified, deduplicated billing webhooks and provider synchronization remain
  Phase 10.
- Actual invoice charging must record discount charge applications through the
  existing discount service when a provider adapter is introduced; no fake
  charge occurs in this phase.
- Authentication/RBAC/audit, UI and versioned REST remain Phases 6, 8 and 9.

## Next phase

After this branch is reviewed and merged, Phase 6 implements identity, RBAC and
immutable audit. Do not implement those concerns on this branch.
