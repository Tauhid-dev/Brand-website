# Production launch and rollback runbook

## Release gate

Release only an exact reviewed commit that passes the root Genesis gates, site
lint and type-check, full production build/test suite, clean and upgrade
migration rehearsals, architecture boundary gate and high-severity dependency
audit. The Phase 17 assessment is code-GO but deployment-CONDITIONAL: every
external item below must be owned, recorded and verified for the target stage.

## Required external configuration

- Configure the production D1 `DB` binding, apply migrations 0000 through 0014
  in order, and record a verified backup/restore point.
- Confirm `NEXT_PUBLIC_SITE_URL`, legal entity, ABN, contact details, approved
  brand assets, GST/pricing disclosures and Australian legal review.
- Configure `LEAD_DELIVERY_URL` and `LEAD_DELIVERY_TOKEN`; prove destination
  idempotency, consent/retention handling and accepted/rejected/timeout paths.
- Configure dispatch/Sites access policy, administrator bootstrap and role
  assignments. Confirm dispatcher session, MFA and suspicious-login controls.
- Configure Stripe webhook and outbound credentials only if billing is enabled.
  A live secret also requires `STRIPE_LIVE_ENABLED=true` after approval.
- Configure the agent endpoint/token and issue the minimum scoped service
  credential only if external provisioning is enabled.
- Configure notification providers, analytics consent, Search Console, DNS,
  social profiles, WhatsApp and operational support destinations as applicable.
- Configure monitoring, alert routing, scheduled maintenance and a D1 backup
  frequency that meets the approved RPO/RTO.

Secrets belong only in the hosting secret store. Never place them in source,
environment examples, build arguments, tickets, logs or audit snapshots.

## Before deployment

1. Save the exact commit as a deployable Sites version and retain the previous
   known-good version identifier.
2. Record the current migration journal and D1 database identifier; create and
   verify a provider-supported backup/export.
3. Rehearse the complete migration chain on an empty database and representative
   restored Phase 10 and Phase 15 snapshots. Run `PRAGMA foreign_key_check` and
   critical record-count comparisons.
4. Apply every unapplied forward migration through 0014 before switching traffic.
5. Run deployed smoke tests for public navigation, SIWC customer/admin ownership,
   exact administrator permissions, service scopes, same-origin writes, security
   headers, lead delivery and each enabled provider.
6. Send a signed Stripe test event when billing intake is enabled and verify one
   normalized inbox row plus its immutable audit event. Never store the raw body.
7. Review `/admin/operations` and `GET /api/v1/admin/system/readiness`; do not
   launch with terminal work or an unexplained degraded state.

## Monitoring and reconciliation

Monitor unexpected 5xx and 429 responses, lead-delivery failures, billing
webhook terminal/retry age, expired notification/agent leases, invoice and
subscription divergence, operational queue age, maintenance failures and the
last successful maintenance time. Correlate incidents with safe request IDs;
do not copy raw provider responses or personal form contents into notes.

Run bounded system maintenance on the approved schedule. It may expire technical
idempotency/rate-limit state, redact old audit network metadata and reclaim ready
billing events; it does not delete customer or commercial history.

## Application rollback

1. Pause risky external writes or provider delivery where practical while
   preserving provider retries and durable inbox evidence.
2. Redeploy the previous known-good application version only after confirming it
   is compatible with the current additive schema.
3. Leave applied migrations and their data in place. Do not run reverse SQL or
   edit an applied migration.
4. If compatibility is uncertain, disable writes and apply a reviewed forward
   repair rather than forcing state directly in D1.
5. Replay/reconcile provider work through application services, verify
   deduplication and readiness, then restore ordinary traffic.

## Migration or data failure

Stop before switching traffic and preserve the affected database. Restore only
from the verified backup into a new D1 database, validate foreign keys and
critical business records, then perform an explicit binding cutover. Record the
decision, incident times, commit, migration level, backup identifier, record
counts and recovery objective result. Never force a subscription, invoice,
entitlement or queue state directly in the database.
