# Phase 16 production-hardening schema

Forward migration `0014_parallel_spacker_dave.sql` adds
`system_maintenance_runs`. It stores one immutable record for each bounded
retention/recovery execution: requesting administrator, non-secret policy
snapshot, status, safe aggregate summary or stable failure code, and timestamps.
A partial unique index permits only one active retention/recovery operation.
Checks enforce legal outcomes; terminal rows cannot be updated or deleted.

The migration narrows the audit immutability trigger to permit only one-way
clearing of `ip_address` and `user_agent`. Identity, actor, action, entity,
before/after snapshot, request ID and creation time remain immutable, and audit
rows still cannot be deleted. Existing commercial records and webhook history
are unchanged.
