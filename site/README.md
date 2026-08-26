# Zuno Pixel platform

The public Zuno Pixel site and phased commercial-platform application, running
on [Vinext](https://github.com/cloudflare/vinext) with Cloudflare D1 and Drizzle.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares the `DB` D1 binding (R2 remains disabled)
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` owns the customer and catalogue foundation
- `modules/` keeps domain/application policy independent of HTTP and Drizzle
- `examples/d1/` contains an optional D1 example surface
- `drizzle/` contains forward-only generated migrations
- `db/seeds/development.ts` exports opt-in demo fixtures and never auto-runs

## Versioned API

Phases 9–16 expose and harden purpose-specific JSON contracts under `/api/v1`:

- public plan and promotion validation endpoints;
- signed-in customer account, entitlement and preference endpoints;
- server-authorized administration endpoints for commercial records;
- scoped service-to-service agent integration endpoints; and
- a configuration-gated, signature-verified billing webhook boundary.

Phase 17 adds no new versioned commercial endpoint. It makes the existing
`/api/audit` marketing-lead boundary production-safe: the route validates and
rate-limits input, calls a typed application port, and fails closed unless an
HTTPS `LEAD_DELIVERY_URL` and runtime-only `LEAD_DELIVERY_TOKEN` are configured.
It never reports delivery until the configured destination returns success.

The machine-readable OpenAPI 3.1 contract is available at
`/api/v1/openapi.json`. See `docs/api/REST_API_V1.md` for the endpoint inventory,
authentication, pagination, idempotency and error conventions.

Stripe webhook intake is enabled only when `STRIPE_WEBHOOK_SECRET` is present in
the hosting environment. Outbound Checkout and subscription synchronization use
`STRIPE_SECRET_KEY`. Test keys provide development/test-mode execution; a live
key additionally requires `STRIPE_LIVE_ENABLED=true`, so live payment execution
cannot be activated by supplying a key alone. Keep all values outside source
control. Missing configuration fails closed with 503; there is no fake payment
fallback. Configure the Stripe webhook endpoint for
`/api/v1/webhooks/billing/stripe` with checkout, subscription and invoice events.

Outbound agent provisioning is enabled only when both
`AGENT_PLATFORM_BASE_URL` and `AGENT_PLATFORM_ACCESS_TOKEN` are supplied by the
hosting environment. The URL must use HTTPS outside local development. The
access token is sent only to that configured origin and is never stored in D1,
returned by an API, written to audit history or included in provider errors.
Without both values, processing and reconciliation fail closed with 503; there
is no development success fallback.

## Identity, sessions and authorization

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email` and their stable Site-scoped subject from
`oai-authenticated-user-id`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove customer ownership or admin
permission. `app/server-authorization.ts` resolves the provider subject through
the customer/admin repositories and enforces customer scope or an explicit
permission on the server. The hosted dispatcher owns secure session cookies,
sign-in, sign-out and callback processing; Zuno Pixel stores no passwords,
OAuth tokens or session tokens.

The first administrator is provisioned explicitly through
`BootstrapFirstAdminService`; it is a one-use, database-constrained operation
and grants `SUPER_ADMIN`. There is deliberately no public bootstrap route.
Subsequent administrators and role changes go through
`ManageAdminAccessService` and immutable audit events.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: production build plus domain, application, migration, repository
  and rendered-page tests
- `node --experimental-transform-types --test tests/phase-17-architecture.test.ts`:
  run the inward-dependency, cycle, persistence-boundary and release-placeholder gate
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Database workflow

Migrations `drizzle/0000_uneven_violations.sql` through
`drizzle/0014_parallel_spacker_dave.sql` establish customer/catalogue, versioned
pricing/quotes, discounts/promotions, subscription/entitlement/billing,
identity/RBAC/audit, onboarding/operations/notifications, API security and the
billing-webhook/public-rate-limit hardening records, Phase 11 billing
operations, Phase 12 notification delivery history/recovery, Phase 13 API
cursor-query indexes, Phase 14 agent job leases and immutable provider attempt
history, Phase 15 provider price/checkout references and initial
subscription-provider linking, and Phase 16 immutable maintenance/recovery
evidence, in order. Apply them through the Sites/Cloudflare environment for the target
stage. Do not edit an applied migration; change `db/schema.ts` and generate the
next forward-only migration.

The complete environment inventory is in `.env.example`. Empty values are
intentional; secrets must be supplied through the hosting secret store and must
never be committed.

Development fixtures include clearly fictional catalogue/customer examples and
the four initial AUD price sets. They are exported separately from production
paths and require an explicit caller, preventing accidental production seeding.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
