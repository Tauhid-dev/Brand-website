# Phase 14 agent platform schema

Migration: `site/drizzle/0012_old_morph.sql`.

## Changes

| Record | Change | Enforcement |
| --- | --- | --- |
| `agent_provisioning_jobs` | Adds processing start and lease expiry | in-progress rows require both lease fields; other states forbid them; `(status, lease_expires_at)` supports recovery scans |
| `agent_provisioning_attempts` | Adds one durable row per provider attempt | unique `(job_id, attempt_number)`; constrained processing/success/failure outcomes; identity and terminal history cannot be edited or deleted |

The migration preserves existing provisioning rows. Existing in-progress work is
given a bounded lease derived from its prior start/update timestamp so it becomes
recoverable after upgrade. Rebuilding the SQLite job table also recreates its
customer/link ownership and optimistic-version triggers. Provider credentials,
request/response bodies and bootstrap payloads are not stored in either table.

The common ready-work and attempt-history queries have explicit indexes. Phase
14 migration tests cover upgrade and clean installation, foreign keys, preserved
in-flight work, version triggers, immutable history and the lease index.
