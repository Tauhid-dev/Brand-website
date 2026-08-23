# Repository audit — Zuno Pixel

## Baseline

Audit date: 23 August 2026. Baseline branch: `main` at `2ad18d9`.

The unchanged baseline passed:

- Project Genesis structural validation (16 engines, 23 templates, 7 schemas);
- 12 Python unit/end-to-end framework tests;
- generated planning validation with zero errors and warnings;
- `npm ci`, ESLint, strict TypeScript checking, Vinext production build; and
- 3 rendered-HTML tests covering the homepage, critical routes, 404 and
  central brand/pricing/analytics configuration.

Vinext printed one informational warning: its static analyser could not classify
the root route. The build completed successfully. No functional pre-existing
failure was found.

## Discovered implementation

| Concern | Current implementation |
| --- | --- |
| Frontend | React 19.2.6, Next 16.2.6 API surface, Vinext 0.0.50 |
| Rendering | React Server Components; static-first marketing pages with bounded client components |
| Routing | App Router conventions; root page, catch-all marketing template, route handlers |
| Styling | Tailwind 4 pipeline plus one CSS token/component stylesheet; no second styling system |
| Deployment | Cloudflare Worker-compatible ESM through Sites/Vite |
| Persistence | Drizzle ORM 0.45.2 and D1 adapter available, but D1 is disabled and schema is empty |
| Migrations | Empty Drizzle journal; no applied product migrations |
| Authentication | No application/admin/customer auth in use; optional Sites/ChatGPT identity helper exists |
| Validation | Hand-written validation in the growth-audit client and route; no general validation library |
| API | One unversioned development-only `/api/audit` route; no REST conventions yet |
| Architecture | Genesis inner-layer doctrine exists; runtime app has configuration/components/routes but no commercial domain layer |
| Logging/errors | No central structured logger or API error mapper |
| Analytics | Provider-neutral client event dispatcher with sensitive-property filtering |
| Tests | Node test runner for rendered output; Python unittest for Genesis |
| CI/CD | No repository CI workflow; Sites manifest exists with a project ID |
| Environment | Optional public GA4 variable; no committed secrets or production endpoints |

## Conflicts and decisions

1. The current site is a marketing application, not a commercial backend. The
   requested platform is an expansion, not a refactor of an equivalent system.
2. D1/SQLite supports the modular-monolith target. Transactional coupon and
   mutually-exclusive price operations will require carefully designed unique
   or partial indexes plus transaction-aware repositories; they must not be
   simulated in controllers.
3. The optional ChatGPT identity helper is insufficient for public customer
   registration and is not, by itself, an administrator RBAC system. Identity
   provider selection is an explicit Phase 6 decision.
4. Customer lifecycle and onboarding lifecycle are separate. Cancelling or
   suspending a subscription revokes service entitlements but does not delete
   the customer, onboarding history, invoices, notes or audit records.
5. Billing execution remains behind a provider port. Stripe and fake webhook
   processing are out of scope until credentials and a billing phase exist.
6. Phase 1 changes brand/configuration and architecture documents only. It does
   not activate D1 or create speculative commercial migrations.

## Existing abstractions preserved

- central configuration and content-driven public pages;
- shared service/industry/page components;
- provider-neutral analytics filtering;
- Sites/Vinext deployment architecture;
- Drizzle/D1 adapter boundary; and
- Genesis planning, validation and memory conventions.
