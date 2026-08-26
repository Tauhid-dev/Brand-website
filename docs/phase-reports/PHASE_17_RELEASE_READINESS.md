# Phase 17 — Final architecture and release readiness audit

Date: 26 August 2026.

## Selection and scope

The latest merged `origin/main` contained Phases 1–16 and all fifteen forward
migrations through `0014_parallel_spacker_dave.sql`. Phase 17 was therefore the
earliest incomplete phase. No earlier partial phase required repair.

This phase reviewed the merged modular monolith from first principles and fixed
release defects within its established architecture. It adds no commercial
product feature and no database migration.

## Release decision

**Code and architecture: GO.** The repository is production-ready from a code,
architecture, migration and automated-validation perspective.

**Production deployment: CONDITIONAL / NO-GO until external launch controls are
completed.** Legal approval, verified business/contact facts, production D1 and
provider configuration, access policy, backup/restore proof, monitoring and
deployed-stage verification cannot be truthfully manufactured in source. They
are listed below and in `docs/operations/LAUNCH_AND_ROLLBACK.md`.

## Architecture assessment

- The deployable remains one modular monolith with the dependency direction
  `HTTP/UI → application → domain ← infrastructure ports`.
- Pricing, discounts, subscription transitions, entitlements, billing,
  onboarding, notifications, queues and agent provisioning remain in reusable
  domain/application services. HTTP routes compose adapters and services but do
  not issue raw Drizzle queries or import `db/schema.ts`.
- Domain code has no application, infrastructure, presentation, React, Next or
  Drizzle dependency. Application code has no infrastructure, presentation,
  schema, React, Next or Drizzle dependency.
- The production module graph is acyclic. A permanent test now fails on a cycle,
  outward layer dependency or UI/controller persistence bypass.
- The shared request actor type and Web Crypto helpers were moved to their
  correct inward layer, removing the two boundary exceptions found in the audit.
- No second entitlement policy was found: customer, billing and agent views use
  the subscription application boundary and persisted entitlement snapshots.
- No second runtime pricing resolver was found. Static public package copy is
  owned by the public brand configuration; contracted/customer pricing is D1
  history resolved by the pricing application service. Development seed amounts
  are opt-in fixtures and are not a production price source.
- Lint, type-check, dependency-graph analysis and release scans found no circular
  dependency, production TODO stub, stale branding path or secret-bearing source.

## Security assessment

- Public, customer, administrator, service and provider boundaries retain their
  exact authentication model, scope/permission checks, customer ownership,
  same-origin writes, bounded bodies, rate limits and safe error mapping.
- Service credentials remain hashed, scoped, expiring, rotatable and revocable;
  Stripe/agent/lead tokens remain runtime-only.
- The marketing lead endpoint no longer returns a false-success development
  response. It validates and minimises fields, records consent time, sends only
  to a configured HTTPS endpoint with runtime bearer authorization, disables
  redirects, uses the request ID for downstream idempotency and fails closed on
  missing configuration, timeout, network failure or non-success response.
- Fake legal/contact values were removed from public configuration, footer,
  contact page and structured data. Optional facts are omitted until verified.
- The Vinext, Cloudflare, Vite, Wrangler, React server and related toolchain was
  upgraded to security-fixed compatible versions. A constrained override removes
  the old Drizzle CLI loader's vulnerable esbuild without changing migration
  lineage. Full and production-only npm audits report zero vulnerabilities.
- Automated scans reject retired AI-Magnet branding, known fake launch values,
  development form responses and embedded Stripe/webhook secret shapes in
  production source.

## Database assessment

- Migration history contains fifteen immutable forward migrations, 0000–0014;
  Phase 17 changes no table, column, index or migration.
- Clean installation, Phase 10 upgrade and Phase 15 upgrade rehearsals pass with
  foreign-key checks and preservation of commercial records.
- Existing tests prove unique/check constraints, optimistic version protection,
  append-only audit/attempt/history records, immutable maintenance evidence and
  query-plan use for pricing, API cursors, rate-limit cleanup, operational queues
  and provider recovery.
- No applied migration was edited. The packaged Sites build contains the full
  migration journal and all fifteen SQL files.

## API assessment

- `/api/v1` remains the stable commercial major contract; no v1 endpoint or
  response schema changed in Phase 17.
- OpenAPI still inventories every executable public/customer/admin/service and
  Stripe route family with explicit schemas and security declarations.
- Stable request IDs, standard error bodies, media/body validation, controlled
  filters, opaque cursors and actor-scoped idempotency remain consistent.
- Existing `/api/audit` changed from a non-delivering stub to the typed lead
  application boundary described above. A 202 now means the configured delivery
  destination accepted the request; configuration/provider failure returns 503.

## Billing assessment

- Internal contracted price snapshots, discount resolution and entitlements
  remain authoritative; Stripe references do not become commercial policy.
- Subscription state transitions remain explicit and tested, including past-due
  grace, suspension/resumption, scheduled/immediate cancellation, finalisation
  and temporary extension without customer-data deletion.
- Raw card data, provider secrets and raw webhook bodies remain absent from D1.
  Signed webhook intake, deduplication, recovery leases, invoice import and
  reconciliation continue through provider-neutral application services.

## Customer and administrator workflow assessment

- Customer self-registration, invitations, account/billing/invoice/onboarding/
  integration/entitlement views and notification preferences remain customer
  scoped and exclude internal notes.
- Administrator search/detail, commercial management, access, audit and daily
  operations/readiness workflows retain server-side permission checks,
  confirmations, idempotency and immutable audit recording.
- Public contact/footer/SEO output now renders only verified configured business
  facts. There is no fabricated fallback identity, ABN, email or phone number.

## Agent integration assessment

- Agent reads remain field-minimised and service-authenticated; negotiated
  pricing, customer notes, audit history and secrets are excluded.
- Provision/update/suspend/resume and reconciliation remain behind the
  configuration-gated HTTPS provider port with bounded retries, recoverable
  leases, idempotency and immutable attempt evidence.
- No agent route or adapter imports the database schema across the boundary.

## Implementation and tests added

- Added `SubmitWebsiteLeadService`, `WebsiteLeadDelivery` and
  `HttpWebsiteLeadDelivery`, plus a documented runtime environment inventory.
- Added four architecture/release regression tests for inward dependencies,
  cycles, direct persistence access and release-placeholder/secret scans.
- Added three lead application/adapter tests for consent/idempotency, bounded
  HTTPS delivery and fail-closed/redacted failure behavior.
- Updated worker E2E asset serving and transfer budgets for the security-fixed
  Vinext output layout; budgets now measure gzipped deployable assets.
- Added pull-request/main CI for root Genesis validation, site lint, type-check,
  production build/full test suite and high-severity dependency audit.

## Validation evidence

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- focused Phase 17 architecture and lead tests: 7/7 passed.
- `npm test`: production build plus 176/176 unit, integration, migration,
  repository, authorization, security, E2E, accessibility and worker tests passed.
- `npm audit`: zero vulnerabilities.
- `npm audit --omit=dev`: zero vulnerabilities.
- `python3 -m unittest discover -s tests -v`: 12/12 passed.
- `./scripts/validate-framework`: passed; 16 engines, 23 templates, 7 schemas.
- `./scripts/validate-planning planning`: passed with zero errors/warnings.
- Diff whitespace, retired-brand, placeholder and secret scans: passed.

## External deployment blockers / launch configuration

1. Approve and configure legal entity, ABN, contact facts, GST/pricing content,
   privacy/terms/AI-data policies and final brand assets.
2. Configure the production domain/DNS, analytics consent, Search Console,
   social/WhatsApp accounts and run target-environment Lighthouse/device checks.
3. Provision the production D1 binding, apply 0000–0014, prove backup/restore and
   confirm the documented RPO/RTO with alert routing and scheduled maintenance.
4. Configure and verify the HTTPS lead delivery destination/token, retention,
   access controls, operational ownership and end-to-end failure paths.
5. Configure Sites/dispatcher access policy, bootstrap the first administrator,
   review role assignments and confirm dispatcher MFA/session/login monitoring.
6. Configure and verify Stripe, notification and agent providers only when their
   capabilities are enabled; retain all secrets in the hosting control plane.
7. Save and test the exact Sites version, rollback version and deployed-stage
   smoke/reconciliation evidence. Phase 17 deliberately does not deploy.

## Non-blocking future enhancements

- Automate deployed Lighthouse and stage smoke tests once a target URL exists.
- Add provider-specific notification senders and operational alert delivery when
  those vendors are selected.
- Record recurring backup/restore drill evidence in the chosen operations system.

There is no further numbered implementation phase in the agreed roadmap. After
this branch is merged, the next activity is external launch configuration and a
controlled deployment review, not Phase 18 feature work.
