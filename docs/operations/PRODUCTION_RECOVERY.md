# Production recovery, backup and migration rehearsal

## Service objectives

- Target RPO: 15 minutes for D1 commercial data and configuration evidence.
- Target RTO: 4 hours for a regional application or data incident.
- Alert immediately on terminal billing webhooks, expired worker leases, overdue
  operational items, a failed maintenance run or a migration failure.

These are launch targets, not a promise by the code. The environment owner must
confirm the deployed Cloudflare plan, backup/export frequency and alert routing
meet them before go-live.

## Readiness and maintenance

An administrator with operations access reviews `/admin/operations` or
`GET /api/v1/admin/system/readiness`. The projection exposes aggregate backlog
counts only. `POST /api/v1/admin/system/maintenance` requires
`OPERATIONS_WRITE` and an `Idempotency-Key`; the admin UI requires explicit
confirmation. Run it from an authenticated operations session or invoke the API
from an approved operator client. Investigate terminal items rather than
editing durable inbox or attempt tables directly.

## Backup and restore drill

Before a production migration:

1. Record the deployed commit, migration journal and D1 database identifier.
2. Create and verify a provider-supported D1 backup/export in the production
   account. Store it encrypted with access logging and approved retention.
3. Restore the backup into an isolated non-production D1 database.
4. Run `PRAGMA foreign_key_check`, critical record-count comparisons, a sample
   customer billing/history review and the readiness query.
5. Record elapsed backup/restore time and newest recovered record time. Do not
   proceed if RPO/RTO targets are missed.

## Forward migration rehearsal

Run the complete migration chain against an empty database and against restored
representative Phase 10 and Phase 15 snapshots. Run foreign-key, constraint,
authorization, integration and build gates. Applied migrations are never
edited; remediation is a new forward migration.

## Rollback

Application rollback means redeploying the last compatible commit. Database
rollback is restore-to-new-D1 from the verified backup, followed by explicit
binding cutover; never run destructive reverse SQL against production. If a
forward migration succeeds but the application fails, keep writes disabled,
assess backward compatibility, and either redeploy the prior compatible build
or apply a reviewed forward repair. Preserve the affected database and all
maintenance/audit evidence for incident review.
