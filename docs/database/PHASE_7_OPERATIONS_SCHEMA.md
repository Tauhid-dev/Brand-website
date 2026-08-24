# Phase 7 onboarding and operations schema

Migration: `site/drizzle/0005_spotty_iron_fist.sql`.

## Added tables

| Table | Purpose | Important enforcement |
| --- | --- | --- |
| `onboarding_cases` | Onboarding lifecycle independent of customer status | one current case per customer; lifecycle timestamps; optimistic versions and transition trigger |
| `onboarding_tasks` | Ordered customer/internal work | unique case/code; owner/status/completion checks; terminal-state and version triggers |
| `onboarding_task_dependencies` | Task prerequisite graph | composite key; same-case, no-self and no-cycle enforcement |
| `customer_integrations` | Integration health without credentials | unique customer/code; explicit health/error state; optimistic version trigger |
| `agent_links` | Provider-neutral external agent association | unique customer/platform and external reference; explicit provisioning status |
| `agent_provisioning_jobs` | Idempotent asynchronous agent work | unique idempotency key; retry counters; link/customer scope and version triggers |
| `operational_queue_items` | Durable materialised work projections | four queue types; one active item per source/type; claim/resolution and optimistic version checks |
| `notification_templates` | Versioned message definitions | one active code/channel; immutable published content |
| `notification_preferences` | Customer consent by semantic message/channel | unique customer/code/channel; required notices remain a separate template policy |
| `notification_deliveries` | Provider-neutral delivery/retry history | unique idempotency key; attempt/outcome checks; optimistic version trigger |

## Transaction and history policy

Onboarding task, integration-health and agent-job mutations batch their source
record and queue projection in one D1 transaction. Billing attention is an
idempotent, reconcilable projection of existing billing truth. Resolving a queue
item changes only the projection. Notification delivery persists semantic
template variables, attempt state and provider references; credentials and
rendered message bodies are not stored.

## Migration evidence

Automated tests apply Phases 2–6, retain an active customer, then apply Phase 7.
They verify all ten tables, independent customer/onboarding status, foreign keys,
unique current cases and work projections, optimistic concurrency triggers,
immutable templates, dependency controls and query-plan index use.
