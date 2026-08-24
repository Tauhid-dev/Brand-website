# Phase 10 — Billing adapter and hardening

Completed: 24 August 2026

## Selection evidence

The synchronized `origin/main` contained complete Phases 1–9. Phase 10 was
partial: provider-neutral billing records and a provider port existed, but there
was no configured webhook verifier, durable delivery inbox, event
reconciliation, anonymous endpoint protection, broad browser/security evidence
or launch/rollback runbook. No production payment-provider credentials were
configured, so outbound payment execution remains deliberately disabled.

## Acceptance criteria completed

- Added a configuration-gated Stripe-compatible webhook verifier without adding
  a fake payment implementation.
- Verify the timestamped HMAC signature against the bounded raw request before
  parsing JSON; reject stale, malformed and invalid signatures.
- Deduplicate provider deliveries durably, reject event-ID payload conflicts,
  record processing/retry outcomes, reclaim interrupted processing attempts and
  keep terminal outcomes immutable.
- Normalize supported invoice/subscription events and reconcile them through
  reusable billing and subscription application services with immutable audit.
- Added a forward migration with clean-install and Phase 9-to-10 upgrade tests.
- Added byte-accurate JSON limits, same-origin write protection, hash-only public
  rate limits and restrictive worker response headers without permissive CORS.
- Added production-rendered journey, structural accessibility, security-header
  and asset-budget evidence plus real-browser local journey verification.
- Added launch, monitoring, retention, migration and application rollback
  guidance.
- Updated Next.js and its matching lint configuration from 16.2.6 to 16.3.2
  after the production advisory scan found high-severity issues in the merged
  baseline; the patched production dependency scan reports zero vulnerabilities.

## Implementation boundaries

The route is an adapter only: it reads the raw body, selects configured
infrastructure and maps the result. `BillingWebhookService` owns verification,
inbox claiming, deduplication, retry and audit. `BillingEventReconciliationService`
maps normalized billing facts to existing invoice lifecycle behavior and the new
provider subscription reconciliation service. Repositories own provider-reference
lookups and transactional persistence.

Supported normalized events are subscription activated, renewed, past due and
cancelled, plus invoice payment succeeded and failed. Arbitrary provider fields,
contact details, raw request bodies, signatures and secrets never cross the
domain boundary or enter persistence/audit snapshots.

## Migration and API

Added `site/drizzle/0007_regular_shadowcat.sql` with
`billing_webhook_events` and `api_rate_limits`, associated indexes/constraints,
webhook immutability/transition triggers and a forward replacement of the
subscription update guard for provider period reconciliation.

Added `POST /api/v1/webhooks/billing/{provider}` to OpenAPI. Stripe is the only
configured verifier currently supported and requires `STRIPE_WEBHOOK_SECRET`.
The endpoint returns 202 for a newly processed delivery, 200 for an identical
duplicate and a safe 4xx/5xx error for invalid, conflicting or unavailable
requests.

## Tests and evidence

- Webhook signature ordering/tolerance, PII minimisation, deduplication,
  concurrent/stale claims, payload conflict, invoice reconciliation and
  subscription renewal.
- Phase 9-to-10 preservation, 43-table upgrade, trigger behavior, indexes and
  provider period reconciliation.
- Same-origin rejection, actual-byte payload limit and durable hash-only public
  limits.
- Production critical routes, homepage links, 404 behavior, accessibility
  structure, headers/CORS and launch budgets: HTML under 100 KB, JavaScript
  under 350 KB and CSS under 50 KB.
- Local browser checks for homepage, pricing and growth-audit form feedback;
  no console errors were observed.
- Production dependency advisory scan with `npm audit --omit=dev`: zero known
  vulnerabilities after the patch update.

## Known limitations and deferred operations

- Outbound Stripe payment execution is not configured and was not fabricated.
- The CSP currently permits inline script/style because Vinext emits inline
  hydration/style content; removing that allowance requires a nonce/hash-capable
  framework path.
- Expired rate-window and idempotency cleanup needs an environment scheduler;
  the indexed retention query and operator requirement are documented.
- Provider deliveries that exhaust all attempts require an operator-reviewed
  replay or manual reconciliation through application services.
- Public launch remains blocked by the marketing/legal/domain/form/analytics
  placeholders listed in `docs/ZUNO_PIXEL_SITE.md`.

## Next phase

No additional numbered implementation phase is defined in the agreed plan.
After this branch is merged, the expected work is deployment-specific provider
configuration, staging rehearsal and resolution of documented public-launch
placeholders—not another uncontrolled implementation phase.
