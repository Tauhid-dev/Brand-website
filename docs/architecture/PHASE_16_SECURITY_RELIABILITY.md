# Phase 16 security and reliability decisions

## Threat and control matrix

| Threat / boundary | Control in this repository | Operational owner / deferred control |
| --- | --- | --- |
| Customer or administrator session theft | Dispatch-owned Sign in with ChatGPT session; server-side identity lookup on every request; customer ownership checks; exact administrator permissions; same-origin writes; logout redirects to the dispatcher | Session expiry, global logout, token protection, MFA policy, suspicious-login and brute-force controls are owned by the ChatGPT dispatcher. Production owners must enable and monitor those controls; the application stores no session token or password. |
| Administrator privilege escalation | Active-user lookup, role/permission join, exact route and object authorization, immutable success/failure audit, no client-authoritative roles | Security owner reviews role grants and login failures. |
| Service credential theft | Random secret returned once, only a digest stored, constant-time comparison, explicit scopes, expiry, revocation, rotation, durable per-credential limits | Rotate immediately, revoke the predecessor and review service audit history. |
| Cross-customer data access | Customer ID comes from the authenticated principal; minimized DTOs omit internal notes and provider secrets; repository queries retain customer scope | Authorization tests cover public/customer/admin/service families and route-shape confusion. |
| Duplicate or forged commercial commands | Signed raw Stripe events, durable provider-event uniqueness and payload hash, actor-scoped idempotency, database uniqueness and optimistic transitions | Provider endpoint secret rotation remains an environment-owner action. |
| Provider outage or partial processing | Provider-neutral adapters fail closed; retry categories and bounded backoff; recoverable leases; immutable attempts; durable webhook inbox can now be reclaimed without provider redelivery | Operations monitors readiness and runs/schedules bounded maintenance. Terminal items require investigation and controlled remediation. |
| Sensitive data in logs or audit | No card data, secrets or raw webhooks are persisted; audit snapshots redact secret-like fields; API errors hide internals; readiness contains aggregate counts only | Network metadata is redacted after 30 days while the commercial audit event remains immutable. Provider logs need equivalent production policy. |
| Concurrent commercial changes | Foreign keys, unique/check constraints, immutable contracted terms, partial unique active records, transactions, version checks and claim compare-and-swap | D1 is the single transactional system of record; no cross-module direct writes were added. |

## Data retention

The application deliberately preserves customers, subscriptions, entitlements,
invoices, notes and commercially important audit history. A bounded maintenance
run performs only these technical-data operations:

- expire open checkout sessions after their recorded expiry;
- delete expired idempotency keys;
- delete API and service rate-limit windows older than two days;
- clear audit IP address and user-agent metadata after 30 days, while every
  semantic audit field remains protected from update or deletion;
- reclaim at most 25 ready failed billing events per run.

Every run has an immutable D1 outcome, policy snapshot, safe aggregate summary,
requesting administrator and timestamps. Only one run may be active. No customer
or commercial history is deleted.

## Authorization review

Public endpoints remain unauthenticated and rate limited. Customer endpoints
require a dispatcher identity mapped to exactly one active customer. Admin
endpoints require an active admin and the function-specific permission.
Integration endpoints accept only scoped service credentials and never admin
sessions. Billing webhooks accept only a verified provider signature. The new
readiness endpoint requires `OPERATIONS_READ`; maintenance requires
`OPERATIONS_WRITE`, same-origin JSON and an actor-scoped idempotency key.
