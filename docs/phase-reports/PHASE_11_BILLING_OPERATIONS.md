# Phase 11 — Billing operations and subscription lifecycle

Status: complete on `feature/phase-11-billing-operations`.

## Delivered

- Added explicit grace, suspension/resumption, scheduled/immediate/final
  cancellation and temporary-extension domain operations.
- Kept entitlement revocation/restoration effective-dated and preserved all
  customer, subscription, invoice and entitlement history.
- Added provider-independent billing contacts and immutable internal billing
  notes.
- Added a reusable billing overview service deriving payment and entitlement
  state plus public, negotiated, discount and effective price projections.
- Expanded the customer account and admin customer page with billing state,
  contact, invoice/reminder history, lifecycle controls and notes.
- Added protected, idempotent admin REST commands and included the customer
  billing projection in the customer account API.
- Added dedicated domain, application, migration and OpenAPI contract tests.

## Decisions

Billing-provider execution remains behind the existing port and no card data is
introduced. Payment due/overdue is derived from immutable invoice facts instead
of duplicated status storage. Temporary service extensions do not erase a
suspension: they create bounded entitlements and an explicit deadline. Billing
notes are separate from general customer notes so `BILLING_READ/BILLING_WRITE`
can govern them without exposing them to customer or agent surfaces.

## Migration and API

- Migration: `0008_bouncy_polaris.sql`.
- Tables: `customer_billing_profiles`, `billing_notes`.
- Subscription fields: `grace_period_ends_at`, `service_extended_until`; status
  adds `CANCEL_AT_PERIOD_END`.
- Endpoints: `GET /admin/customers/{customerId}/billing`,
  `POST /admin/customers/{customerId}/billing-profile`,
  `POST /admin/customers/{customerId}/billing-notes`, and
  `POST /admin/subscriptions/{subscriptionId}/operations`.

## Deferred

Phase 12 owns notification delivery orchestration and complete operational queue
projections. Phase 15 owns reviewed outbound Stripe operations. Neither is
started by this branch.
