# Phase 18 — Standalone OCI runtime portability

Status: implemented on `feature/phase-18-standalone-oci-runtime` (26 August
2026); verify merged code rather than this informational status.

Phase 18 adds an explicit D1/PostgreSQL runtime boundary, an independently
generated and checksummed PostgreSQL migration lineage, standards-based OIDC
sessions, CSRF-protected logout, customer self-registration, one-time CLI admin
bootstrap and a migration-gated disposable OCI wrapper. Domain/application
services, D1 support, SIWC identity, RBAC and audit authority are preserved.

Schema: `postgres/migrations/0000_phase_18_baseline.sql` creates the same 50
functional tables plus 139 indexes, 66 foreign keys, 181 checks, system seeds
and PostgreSQL-native history/version/range triggers. No D1 migration changed.

HTTP/UI additions: `/auth/login`, `/auth/callback`, POST `/auth/logout` and
`/register`. Existing admin, customer and REST routes select identity and
database at their shared runtime composition boundaries.

Deployment: staging uses web + one-shot migrate + private PostgreSQL. Redis and
the D1 staging volume were removed because neither is justified in standalone
mode. Web remains bound to `127.0.0.1:3100`; no database host port is exposed.

Testing: runtime/config/session/CSRF tests, generated-schema parity, executable
clean PostgreSQL migration, immutable audit evidence and a PostgreSQL 17 CI
repository/invariant test supplement the unchanged D1 and SIWC suites.

Known limitation: the external PostgreSQL driver integration test requires
`TEST_POSTGRES_URL`; it is mandatory in CI and skipped on developer machines
without PostgreSQL. PGlite still executes the complete PostgreSQL baseline
locally.
