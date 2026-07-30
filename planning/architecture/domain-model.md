# Domain Model — AI-Magnet

## Domain intent

A production-quality Australian local-business growth system marketing and sales website covering services, pricing, industry pages, an interactive AI receptionist demonstration, and validated lead-capture flows.

## Ubiquitous language

| Term | Precise meaning | Owner | Avoid |
| --- | --- | --- | --- |
| Actor | A subject permitted to request an outcome | Domain owner | Assuming actor means human |
| Capability | A cohesive business outcome with explicit policy | Product owner | Technical layer names |
| Aggregate | An atomic consistency and invariant boundary | Domain owner | Treating tables as domain objects |
| Domain event | An immutable statement of a completed domain fact | Domain owner | Commands disguised as events |

## Candidate bounded contexts

Discover contexts from language, ownership, policy, change cadence, and consistency
needs. Record upstream/downstream relationships and anti-corruption boundaries.

## Invariants

- State changes occur only through authorised domain behavior.
- Invalid intermediate state is not externally observable.
- Identifiers, time, money, and other value concepts use explicit value objects.
- External models are translated by adapters and do not leak into domain policy.

## Discovery questions

- Which decisions must be strongly consistent?
- Which facts are immutable and auditable?
- Which policies change independently?
- Which terms mean different things to different stakeholders?
- Which failures require compensation or human intervention?

Constraints to incorporate:

- WCAG 2.2 AA and strong Core Web Vitals
- Australian English, AUD pricing plus GST, and ethical review practices
- Central configuration must support a future rebrand
- Forms must be honest, privacy-preserving, validated, and adapter-based
