# Phase 9 API security schema

Migration: `site/drizzle/0006_broken_centennial.sql`

Phase 9 adds three tables without modifying any applied migration or existing
commercial table.

## `service_credentials`

Stores a separate non-human service identity. Important columns are the UUID
credential ID, display name, SHA-256 secret hash, JSON scope list, status,
expiry, optional rotation predecessor, creator, last-use timestamp and terminal
revocation attribution. The bearer token is `<credential-id>.<raw-secret>`;
only its hash is stored and the raw value is returned once when issued or
rotated.

Indexes support active/expiry lookup and rotation history. Database checks
enforce expiry, status and revocation consistency. Triggers prevent changes to
the hash, scopes and creator and prevent a revoked credential from returning to
service.

## `idempotency_keys`

Stores a UUID, purpose-specific scope, client key, canonical request hash,
`PROCESSING`/`COMPLETED` state, HTTP outcome, expiry and timestamps. Unique
`(scope, key)` prevents the same commercial operation from running twice while
allowing the same client key in another operation. Completed results are
immutable. Expired keys can be claimed again safely.

The response store is not used for credential issuance or rotation so raw
service tokens are never copied into durable idempotency data.

## `service_rate_limits`

Stores one atomic request counter per credential and minute window. Its
composite primary key is `(credential_id, window_started_at)`, and the window
index supports expiry maintenance. Deleting a credential cascades only its
rate-window counters; commercial and audit history remains separate.

## Migration verification

Upgrade tests apply migrations 0000–0006 to existing Phase 8 data, validate all
constraints and immutability triggers, and confirm query plans use the expiry
and rate-window indexes. The migration finishes with `PRAGMA optimize`.
