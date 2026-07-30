# Project Genesis Engineering Doctrine

## Core rules

- Apply SOLID to isolate reasons for change and direct dependencies toward policy.
- Apply DRY to knowledge, KISS to solutions, and YAGNI to speculative scope.
- Prefer composition and focused interfaces; use inheritance only for stable
  substitutability.
- Use domain-driven design where domain complexity warrants it: ubiquitous language,
  bounded contexts, aggregates, value objects, policies, and domain events.
- Keep ports owned by application/domain policy and adapters owned by infrastructure.

## Pattern guidance

Repositories expose domain collections, not storage queries. Factories enforce valid
creation. Builders assemble genuinely complex optional structures. Strategies exchange
policy. Adapters translate foreign contracts. Facades simplify cohesive subsystems.
Mediators coordinate peers only where coordination is a real concept. CQRS is justified
only by asymmetric read/write needs; it does not require event sourcing.

## Architecture and reuse

No cycles, framework-dependent domain objects, hidden global state, or bypasses around
authorization and transaction policy. Cross-boundary contracts are versioned. Reuse
stable meaning, not incidental syntax; accept duplication before a false abstraction.

## Naming and errors

Use precise domain language and explicit units. Errors distinguish validation, domain,
authorization, conflict, dependency, and internal faults. Preserve causality, expose no
secrets, retry only bounded transient idempotent work, and make recovery explicit.

## Performance and operations

Set budgets from outcomes, measure representative workloads, bound resources, observe
critical paths, and keep before/after evidence. Define SLOs, ownership, diagnostics,
capacity, cost, deployment, rollback, recovery, and incident response before release.

## Testing and documentation

Test contracts and risks at the lowest useful boundary, then integrations and system
qualities. Keep tests deterministic. Update requirements, ADRs, diagrams, schemas,
runbooks, risks, completion evidence, and memory in the same change.

## AI generation and review

Provide exact scope, inputs, outputs, required reading, constraints, tests, and stop
conditions. Inspect every generated diff and citation. Review dependencies, licensing,
security, privacy, failure paths, migrations, rollback, docs, and memory. An agent may
propose but may not silently expand authority or declare unsupported completion.
