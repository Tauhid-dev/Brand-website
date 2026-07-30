# Project Constitution — AI-Magnet

This constitution has precedence over convenience, local convention, generated
suggestions, and transient instructions. An explicit, documented, authorised
amendment is required to weaken a rule.

## Engineering philosophy

Build the smallest coherent system that satisfies validated outcomes. Prefer clear
contracts, cohesion, composition, reversibility, and evidence over novelty or volume.

## Architecture philosophy

Architecture communicates boundaries, ownership, dependencies, quality attributes,
and irreversible trade-offs. Dependencies point toward stable policy. Decisions are
recorded, testable where possible, and revisited when evidence changes.

## Documentation philosophy

Documentation is a versioned operational interface. It names its audience, authority,
owner, state, and review trigger. Code, schemas, diagrams, tests, and narrative must
not contradict one another.

## Security and privacy philosophy

Assume inputs and dependencies can be hostile. Minimise privilege and data, make
trust boundaries explicit, protect the delivery chain, design safe failure and
recovery, and retain evidence without retaining secrets.

## Testing philosophy

Tests are risk-focused executable evidence. Verify contracts, invariants, negative
paths, failure, recovery, and material quality attributes. Flaky or unverifiable
evidence does not satisfy a gate.

## AI philosophy

AI output is untrusted contribution. Provide bounded context and explicit contracts;
require review, tests, source verification, security checks, attribution where needed,
and repository memory. Never rely on a model's hidden context or unsupported claim.

## Review philosophy

Review the change's behavior, risk, architecture, operability, maintainability,
accessibility, privacy, migration, rollback, and evidence. Authors own correctness;
reviewers provide independent challenge.

## Change management philosophy

Make focused, traceable, reversible changes. Version public contracts semantically.
Record migrations before breaking changes and update all affected memory atomically.

## Enforcement

Quality gates may be waived only by an identified authority with rationale, risk,
expiry, and compensating controls. Unknown or expired waivers fail validation.

Constraints in force:

- WCAG 2.2 AA and strong Core Web Vitals
- Australian English, AUD pricing plus GST, and ethical review practices
- Central configuration must support a future rebrand
- Forms must be honest, privacy-preserving, validated, and adapter-based
