# Engineering Doctrine — Zuno Pixel

## Design principles

- **SOLID:** keep responsibilities cohesive; extend through stable contracts; preserve
  substitutability; expose focused interfaces; depend on abstractions owned by policy.
- **DRY:** remove duplicated knowledge, not merely similar syntax. Prefer a single
  canonical rule with intentional projections.
- **KISS:** choose the least complex design that satisfies known quality attributes.
- **YAGNI:** do not build speculative capabilities; preserve extension seams instead.
- **Composition:** assemble focused behavior; use inheritance only for a genuine stable
  substitutable relationship.

## Domain-driven design

Use a ubiquitous language, bounded contexts, explicit context maps, aggregates for
consistency, value objects for concepts, domain services only for policy that fits no
entity, and events for completed facts. Keep an anemic model only when the domain is
truly data-centric and document that decision.

## Patterns and their boundaries

- **Repository:** a domain-oriented collection port; it does not leak query technology.
- **Factory:** centralises valid object creation when construction carries policy.
- **Builder:** assembles complex optional configuration without telescoping constructors.
- **Strategy:** selects interchangeable policy at runtime or composition time.
- **Adapter:** translates an external contract to an owned port.
- **Facade:** exposes a cohesive, simpler boundary over coordinated subsystems.
- **Mediator:** decouples peer interaction when central coordination is a genuine concept.
- **CQRS:** separate read and write models only when asymmetric needs justify the
  consistency, operational, and cognitive cost; it does not imply event sourcing.

Patterns are vocabulary, never quotas. Every use must reduce a named source of change
or risk.

## Ports, adapters, and dependency inversion

Policy owns interfaces; infrastructure implements them. Composition roots wire the
system. Domain modules must not import frameworks, databases, transports, or vendors.
Cross-context contracts are versioned and translated at boundaries.

## Architecture rules

- No dependency cycles, hidden globals, framework-owned domain objects, or bypasses
  around application authorization and transaction policy.
- One source of truth owns each invariant and schema.
- Public behavior and compatibility are explicit.
- Distributed operations define idempotency, timeout, retry, ordering, duplicate,
  partial-failure, reconciliation, and observability semantics.

## Reuse and naming

Reuse stable domain meaning, not incidental implementation. Duplication is preferable
to a false abstraction. Names use domain language, reveal units and side effects,
avoid unexplained acronyms, and remain consistent across code, contracts, tests, logs,
and diagrams.

## Performance

Measure before optimisation. Define budgets from user and operational outcomes, use
representative workloads, bound resource consumption, prevent unbounded fan-out and
queries, and retain before/after evidence. Correctness and security constraints remain.

## Error handling

Classify validation, domain, authorization, conflict, dependency, and internal faults.
Fail safely; preserve causality; expose stable, non-sensitive errors; retry only
transient idempotent work with bounds and jitter; make recovery and compensation clear.

## Testing

Tests must be deterministic, isolated at the appropriate boundary, readable as
contracts, and rich in negative and boundary cases. Verify architecture rules,
security, migrations, compatibility, observability, recovery, accessibility, and
performance according to risk.

## Documentation

Update requirements, ADRs, diagrams, runbooks, contracts, examples, risks, and memory
in the same change. Comments explain why constraints exist, not what readable code does.

## AI code generation

Provide the smallest sufficient context, constraints, owned files, acceptance criteria,
and validation commands. Treat generated code and citations as untrusted. Inspect diffs,
licensing, data exposure, dependency additions, error paths, and tests. Never place
secrets or unnecessary personal data in prompts.

## Review checklist

- Does the change satisfy a traceable requirement without speculative scope?
- Are boundaries, dependencies, ownership, and contracts clearer?
- Are security, privacy, failure, performance, and operations addressed?
- Are tests meaningful and evidence reproducible?
- Are migrations and rollback safe?
- Are docs, diagrams, decisions, risks, and memory current?
- Is reuse genuine, naming precise, and complexity justified?

Project constraints:

- WCAG 2.2 AA and strong Core Web Vitals
- Australian English, AUD pricing plus GST, and ethical review practices
- Central configuration must support a future rebrand
- Forms must be honest, privacy-preserving, validated, and adapter-based
- Use a modular monolith with explicit domain and application service boundaries
- Customer, onboarding, billing, notification and agent-provisioning lifecycles remain separate and auditable
