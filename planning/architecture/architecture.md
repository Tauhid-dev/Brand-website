# Architecture — Zuno Pixel

## Purpose

Provide a technology-neutral architecture baseline for: A production-quality Australian local-business growth platform with a public marketing site, commercial backend, customer account experience, internal administration and future agent-platform integration.

## Quality Attributes

Security, reliability, maintainability, operability, accessibility, privacy, and
performance are requirements with measurable scenarios—not aspirations.

## Boundaries

- Delivery channels translate external protocols into application requests.
- Application services coordinate use cases and transaction boundaries.
- Domain modules own business language, invariants, policies, and events.
- Ports express needs owned by inner layers.
- Adapters implement ports for databases, networks, queues, files, and vendors.

## Dependency Rules

Dependencies point inward. Domain code does not import delivery, persistence,
framework, or vendor code. Cross-boundary interaction uses versioned contracts.
Cycles are prohibited. Shared code requires stable semantics and named ownership.

## Data and consistency

Aggregates define atomic consistency boundaries. Cross-boundary workflows use
idempotency, explicit failure states, and reconciliation. Data classification,
retention, deletion, residency, lineage, and audit needs are documented before
technology selection.

## Security and privacy

Trust boundaries appear in diagrams. Authenticate subjects, authorise actions,
validate untrusted input, minimise data, protect secrets, log safely, and design
for vulnerability response.

## Extension Points

- delivery and persistence adapters;
- domain-specific bounded contexts;
- asynchronous integration strategies;
- deployment topology and observability providers;
- organisation-specific security and compliance profiles.

## Views

Mermaid sources under `architecture/diagrams/` are authoritative. SVG siblings are
generated derivatives whose embedded hashes must match their source.

## Open decisions

Technology, deployment, data, and integration decisions remain ADRs until evidence
from requirements and research justifies them.
