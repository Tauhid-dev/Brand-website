# Phase 10 launch and rollback runbook

## Release gate

Do not expose the billing webhook until the production build, full automated
suite, migration rehearsal, browser journey check and authorization/security
review pass for the exact commit being released. The production dependency
advisory scan must also report no high-severity finding. Confirm the legal, contact,
domain, CRM delivery and analytics placeholders in `docs/ZUNO_PIXEL_SITE.md` are
separately resolved before a public marketing launch.

## Before deployment

1. Save a deployable version for the exact reviewed commit and retain the
   previous known-good version identifier.
2. Back up the production D1 database and record the migration level and backup
   restore procedure.
3. Apply forward migration `0007_regular_shadowcat.sql` in staging, then
   production, before routing webhook traffic to the new build.
4. Configure `STRIPE_WEBHOOK_SECRET` in the hosting secret store only. Never put
   the value in source, logs, build arguments, tickets or audit snapshots.
5. Configure the provider endpoint as
   `/api/v1/webhooks/billing/stripe`; send a provider test event and verify one
   `billing_webhook_events` row and the matching immutable audit event.
6. Verify SIWC access, administrator permissions, service credential scopes,
   public rate limits, same-origin write rejection and response headers in the
   target environment.

Outbound payment execution is not launchable from this repository until a
separately reviewed provider adapter and credentials are configured. Webhook
intake reconciles existing provider facts and never substitutes a fake charge.

## Monitoring and reconciliation

Monitor webhook HTTP status, `FAILED` inbox rows, retry age, duplicate/conflict
counts, `PROCESSING` rows older than five minutes, invoice/subscription divergence,
public/service 429 rates and unexpected
5xx responses. Alert on a failed row whose `next_attempt_at` is overdue or whose
attempt count reached `max_attempts`. Review the immutable audit event using its
request ID; do not copy raw provider bodies into operational notes.

Schedule index-backed deletion of expired `api_rate_limits`,
`service_rate_limits` and expired `idempotency_keys` according to the approved
retention policy. Do not delete billing webhook events until commercial record
retention and reconciliation requirements are approved.

## Application rollback

1. Pause provider webhook delivery or keep provider retries enabled while the
   endpoint is unavailable; do not acknowledge unprocessed events manually.
2. Redeploy the previous known-good saved application version.
3. Leave migration 0007 and its data in place. It is additive and compatible
   with the previous application; schema rollback is not required.
4. If the previous build must run for an extended period, keep webhook traffic
   paused because that build has no verified inbox handler.
5. After a corrected build is deployed, replay provider deliveries and verify
   deduplication, terminal outcomes and commercial state. Manually reconcile
   rows that reached `max_attempts` before resuming ordinary monitoring.

Never force a subscription or invoice state directly in the database. Repair
commercial state through the reusable application services so entitlements,
queues and audit history remain consistent.

## Migration failure

Stop before switching application traffic. Restore the verified D1 backup only
if the database migration itself caused data loss or corruption. Otherwise fix
forward with a new migration; never edit or rename migration 0007 after it has
been applied. Record the decision, affected environment, timestamps and backup
identifier in the release incident record.
