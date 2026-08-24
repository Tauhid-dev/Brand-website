# Phase 7 completion — Onboarding, integrations and operational queues

Date: 24 August 2026.

## Scope completed

- Added onboarding cases, customer/internal tasks and a validated dependency
  graph without coupling onboarding status to customer lifecycle.
- Added durable customer-action and internal-action projections that are
  transactionally updated with onboarding and integration source records.
- Added customer integration health with metadata credential rejection and
  automatic internal attention for degraded/error states.
- Added provider-neutral agent links, idempotent provisioning jobs, worker port
  and agent-provisioning queue projection.
- Added billing-attention reconciliation and claim/complete/dismiss queue
  services; queue completion never mutates its source aggregate.
- Added versioned notification templates, customer preferences, required service
  notices, idempotent delivery requests, provider worker port, retry scheduling
  and provider delivery references.
- Routed commercially important Phase 7 service changes through the existing
  audit boundary.

## Migration

`0005_spotty_iron_fist.sql` adds ten tables: `onboarding_cases`,
`onboarding_tasks`, `onboarding_task_dependencies`, `customer_integrations`,
`agent_links`, `agent_provisioning_jobs`, `operational_queue_items`,
`notification_templates`, `notification_preferences` and
`notification_deliveries`. It adds lifecycle, scope, history and optimistic
concurrency triggers plus indexes for the four operational queues and delivery
retry work.

## Application boundaries

The onboarding, integration, operations, agent and notification modules each
have domain, application-port/service and D1 infrastructure layers. No HTTP
controller sends notifications, provisions an agent, owns billing policy or
writes another module's tables. The operations adapter owns reusable D1 queue
statements so source repositories can transactionally compose projections
without duplicating queue persistence. Phase 7 adds no customer/admin UI and no
`/api/v1` routes.

## Tests added

- clean Phase 6-to-7 migration and retained-customer coverage;
- lifecycle, dependency, uniqueness, concurrency and query-index checks;
- onboarding/source-queue transaction and independent lifecycle coverage;
- integration metadata security and internal-action reconciliation;
- notification consent, required notice, idempotency, rendering and dispatch;
- provider-neutral agent provisioning and operational queue history;
- billing-attention idempotency and queue-only resolution.

## Known limitations and deferred work

- Real notification and agent providers are intentionally adapters supplied at
  composition time; no provider credentials or network implementation is added.
- Queue projectors are application-invoked; Phase 10 hardening should add
  scheduled reconciliation for operational recovery.
- As documented in Phase 6, audit calls propagate failures but a shared
  cross-module unit-of-work/outbox is deferred to hardening.
- Customer/admin presentation remains Phase 8. Versioned REST, service
  credentials and agent bootstrap DTOs remain Phase 9. Billing webhooks,
  production adapters and launch hardening remain Phase 10.
