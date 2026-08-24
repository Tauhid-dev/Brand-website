# Phase 6 completion — Identity, RBAC and immutable audit

Date: 24 August 2026.

## Scope completed

- Selected dispatch-owned SIWC as the external browser identity/session
  provider; added stable subject handling and stored no passwords or tokens.
- Added reusable customer-scope and explicit admin-permission server guards.
- Completed one-use customer invitation acceptance with Web Crypto token
  generation/hashing and atomic invitation/identity persistence.
- Added external admin users, one-use first-admin bootstrap, five initial roles,
  16 permissions, role mappings and permission-derived principals.
- Added a reusable audit domain/application/repository boundary with recursive
  secret redaction and database-enforced append-only history.
- Required customer, catalogue, pricing, discount, subscription and billing
  mutation services to emit the appropriate commercial audit action.

## Migration

`0004_bored_red_ghost.sql` adds `admin_users`, `roles`, `permissions`,
`admin_user_roles`, `role_permissions` and `audit_events`, plus
`customer_identities.accepted_invitation_id`. It seeds the initial RBAC matrix
and creates audit update/delete rejection triggers.

## Application boundaries

Identity/access services, audit recording and invitation token policy are
independent of routes and UI. `app/server-authorization.ts` is the thin browser
adapter for future protected customer/admin pages. Phase 6 adds no admin portal
and no `/api/v1` routes.

## Tests added

- audit sanitization, context binding and D1 persistence;
- admin bootstrap/authentication/permission/status/role policy;
- D1 admin repository and seeded permission resolution;
- invitation acceptance, replay protection and platform cryptography;
- Phase 6 clean-upgrade schema, RBAC, foreign-key, index and immutability tests;
- catalogue audit-boundary coverage.

## Known limitations and deferred work

- Provider login failures happen before application execution and remain in
  provider security logs; application audit records unprovisioned, suspended
  and role-less admin access attempts.
- No public first-admin bootstrap route exists by design; deployment operations
  must invoke the one-use bootstrap service through a controlled composition.
- Audit append failures propagate to callers, but transactionally co-committing
  an audit row with every cross-module D1 mutation requires the later
  unit-of-work/outbox hardening boundary.
- Customer/admin dashboards remain Phase 8, versioned REST remains Phase 9 and
  billing/webhook/security hardening remains Phase 10.
