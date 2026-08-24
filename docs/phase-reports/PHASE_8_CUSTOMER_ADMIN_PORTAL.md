# Phase 8 — Customer account and internal admin portal

Completed: 24 August 2026
Branch: `feature/phase-08-customer-admin-portal`

## Acceptance criteria delivered

- Dispatch-owned Sign in with ChatGPT protects all account and admin pages.
- Customer identity mapping limits `/account` to its linked customer ID.
- Server-side RBAC checks protect every admin section with its purpose-specific
  permission.
- The customer account presents customer lifecycle, onboarding tasks,
  integrations, subscription and entitlements, invoices and reminders, agent
  status, and notification preferences.
- The customer read model cannot return internal notes. Repository contract
  tests enforce this boundary.
- The admin workspace presents metrics and operational queues, searchable
  customers and complete customer detail, catalogue, pricing and quotes,
  discounts and promotions, subscriptions, billing, agent provisioning, audit
  history and administrator roles.
- Internal notes, subscription lifecycle changes and customer notification
  preferences execute through existing reusable application services.
- Every exposed mutation requires a submitted confirmation and repeats its
  authorization/customer-scope check on the server.
- Protected pages are force-dynamic and unauthorized identities are directed to
  a safe access-restricted page without identity data in the URL.

## Architecture decisions

`D1PortalReadRepository` is a presentation read model: it owns read-only joins
needed by portal screens while write paths remain in their existing bounded
context application services. The server composition module constructs D1
repositories, SIWC authentication, authorization and actor-aware audit services.
This keeps billing, notification, subscription and customer logic out of page
and form controllers.

The admin route uses a section registry to keep navigation, permission mapping
and read models explicit without duplicating a page implementation for each
read-only module. Customer and admin DTOs are distinct; internal notes exist
only on `AdminCustomerView`.

## Database and API impact

- Migrations: none. The Phase 2–7 schema already contains all required durable
  data.
- Tables/columns: none added or changed.
- REST endpoints: none. The versioned `/api/v1` surface remains deferred to
  Phase 9.
- Existing public `/api/audit` remains unchanged.

## UI and application changes

- Customer: `/account` and `/access-denied`.
- Admin: `/admin`, `/admin/customers`, `/admin/customers/[customerId]` and
  `/admin/[section]` for catalogue, pricing, discounts, subscriptions, billing,
  agents, audit and settings.
- Shared responsive portal shell, metrics, status indicators, tables, fields and
  confirmation controls.
- New customer portal query service and D1 portal read repository.
- Server action adapters for internal notes, subscription transitions and
  notification preferences, using existing domain/application services.

## Tests and validation

Added repository contract tests for customer note isolation, admin note access,
customer search and dashboard projections. Added security architecture tests
for dynamic rendering, server authorization, permission mapping, confirmation
gates and the absence of the deferred REST surface.

Validation completed with ESLint, TypeScript no-emit checking, focused portal
tests, the complete unit/integration/migration suite and the production build.

## Known limitations and deferred work

- Phase 8 intentionally provides no public/customer/admin/service REST API,
  OpenAPI document, cursor pagination, service credentials or agent bootstrap
  DTO. These belong to Phase 9.
- Billing-provider execution, webhooks and broader E2E/accessibility/performance
  launch evidence remain Phase 10.
- Catalogue, pricing and discount creation workflows remain service-backed
  read views in this phase; their external command boundary is part of Phase 9.
