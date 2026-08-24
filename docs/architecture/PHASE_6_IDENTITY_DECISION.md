# Phase 6 identity and authorization decision

## Decision

Use dispatch-owned Sign in with ChatGPT (SIWC) for hosted browser
authentication. Treat the forwarded `oai-authenticated-user-id` as the stable,
Site-scoped external subject and `oai-authenticated-user-email` as display and
contact data. Persist neither passwords nor provider/session tokens.

Customer and administrator authorization remain separate:

- `customer_identities` maps one external provider subject to one customer and
  customer guards also enforce the requested customer ID equals the principal's
  customer ID;
- `admin_users` maps an external subject to an explicitly provisioned admin;
  role/permission joins produce a server-side admin principal; and
- authentication alone never implies customer ownership, admin access or
  workspace membership.

The dispatcher owns HTTP-only secure session cookies, production `Secure` and
SameSite policy, sign-in/out/callback processing, provider-side login rate
limits and provider authentication/MFA capabilities. Zuno Pixel does not
duplicate these controls or implement custom password cryptography.

## Bootstrap and administration

There is no public bootstrap endpoint. A controlled operator composes and runs
`BootstrapFirstAdminService` once with an authenticated external identity. A
partial unique database index allows only one `bootstrap = 1` admin, even under
concurrent attempts. The first admin receives `SUPER_ADMIN`; subsequent users,
status changes and role mappings require `ADMIN_USER_MANAGE` and emit audit
events. Self-suspension and self-revocation of `SUPER_ADMIN` are rejected.

## Initial roles

- `SUPER_ADMIN`: all permissions.
- `ADMIN`: all initial permissions except administrator-user management.
- `SALES`: customer, catalogue read, pricing/discount and subscription sales,
  plus billing read.
- `SUPPORT`: customer support, commercial read access and agent-link operations.
- `READ_ONLY`: read-only commercial views and audit history.

The migration seeds 16 stable permissions. Controllers and pages must ask for
one explicit permission through the reusable guard; no `isAdmin` shortcut is
permitted.

## Invitations

Invitation tokens are 256-bit Web Crypto random values. Only their SHA-256 hash
is persisted. Acceptance requires the authenticated email to match, consumes a
pending unexpired invitation, and inserts the external identity in the same D1
batch. A unique invitation reference on `customer_identities` prevents replay
or two identities consuming the same invitation.

## Audit

Commercial services depend on `AuditRecorder`; HTTP controllers do not build or
persist audit rows. `AuditService` binds actor, request ID, request metadata and
timestamp, recursively redacts secret-bearing keys, truncates oversized values,
and appends through the audit repository. Database triggers reject all update
and delete attempts on `audit_events`.

Provider login failures occur before a request reaches the application and are
owned by the provider. Zuno Pixel records failed application admin access for
unprovisioned, suspended and role-less external identities.
