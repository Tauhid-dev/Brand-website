# Phase 18 OCI portability decision

## Audit result

The merged Phase 1–17 implementation remains present on `origin/main` at
`277f94c`: 15 forward-only D1 migrations, 50 final tables, all versioned REST
families, customer/admin portals, RBAC, audit, billing, onboarding,
notifications, operations and agent integration are covered by the existing
176-test baseline.

Every commercial persistence adapter depends on the shared `AppDatabase` type
from `db/index.ts`. The adapters use Drizzle's SQLite query builder and D1
execution features. The audit found 51 D1-specific batch/result uses, primarily
atomic `batch()` calls and `meta.changes` optimistic-concurrency checks. It found
no application-layer SQLite functions or direct controller database access.
Replacing every repository with separately maintained SQL would duplicate
commercial behaviour and create a larger consistency risk.

Identity was concentrated in `chatgpt-auth.ts`, `server-authorization.ts` and
`api-runtime.ts`. SIWC established identity through trusted hosting-injected
headers; `AdminAuthenticationService`, `AdminAuthorizationGuard` and
`CustomerAuthenticationService` already separated identity from authorization.
The disposable wrapper had isolated but unwired PostgreSQL and Redis services.

## Minimum safe design

Database selection is explicit through `DATABASE_RUNTIME=d1|postgres`. D1
continues to use the `cloudflare:workers` binding and unchanged SQLite schema.
PostgreSQL is exposed beneath the existing Drizzle/D1 execution contract by a
transactional adapter that converts bound placeholders, preserves result-row
mapping and implements atomic batches. All repositories and domain/application
services remain single-sourced and provider-unaware. The `pg` TCP driver is
loaded only after PostgreSQL is explicitly selected, so it is absent from the
executed Cloudflare path.

PostgreSQL owns `postgres/migrations/`. Its baseline is generated from the final
Drizzle snapshot, not manually transcribed. The generator creates all 50
tables, 139 indexes, 66 foreign keys and 181 checks; copies only the canonical
RBAC/template seed statements; and appends reviewed PostgreSQL trigger
equivalents for versioning, immutable evidence and effective-range exclusion.
The migration runner uses an advisory lock, per-file SHA-256 ledger and one
transaction per migration. Applied files cannot be rewritten unnoticed.

Identity selection is explicit through `IDENTITY_RUNTIME=siwc|oidc`. SIWC uses
the existing header adapter unchanged. Standalone mode uses certified
`openid-client` Authorization Code flow with PKCE, state and nonce. The app
stores only encrypted, authenticated, expiring identity claims in `Secure`,
HTTP-only, `SameSite=Lax`, `__Host-` cookies. Logout is POST-only, checks the
configured origin and a session-bound CSRF token. OIDC headers supplied by a
proxy are never treated as identity. Existing customer/admin authentication and
authorization services remain authoritative after either provider establishes
an external identity.

The one-time CLI bootstrap calls `BootstrapFirstAdminService`, relies on both
the zero-admin domain check and the database's single-bootstrap constraint, and
records immutable audit evidence. It accepts explicit identity values through
environment variables and emits no secrets.

## Dialect decisions

- UUID identifiers remain application-generated text, matching D1 exactly.
- Dates remain epoch-millisecond `bigint` values, allowing the existing Drizzle
  timestamp mapper and comparison semantics to remain identical.
- Boolean and JSON values remain integer/text encoded at the adapter boundary,
  avoiding divergent repository models.
- Money remains integer minor units (`bigint`) with the existing non-negative,
  currency and arithmetic checks.
- PostgreSQL PL/pgSQL triggers replace SQLite `RAISE(ABORT, ...)` triggers.
  Stable conflict strings are retained so existing repository error mapping
  continues to work.
- D1 migration files are unchanged. PostgreSQL starts with its independent
  Phase 18 baseline and advances only through its own ledger.

## Boundaries and limitations

The compatibility adapter is intentionally infrastructure-only. A future move
to PostgreSQL-native Drizzle table declarations may be considered if query
features diverge, but must retain the repository contracts and parity tests.
The standalone integration test runs against PostgreSQL 17 in CI; local
environments without PostgreSQL execute the same baseline with PGlite and skip
only the external-driver test.
