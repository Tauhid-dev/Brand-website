# Research Register — Zuno Pixel

## Protocol

Research answers a decision-relevant question. Record the query, date, primary
sources, material findings, contradictions, confidence, expiry/review date, and
affected decisions. Label inferences and never turn an assumption into a fact.

| ID | Question | Decision affected | Status | Owner | Review trigger |
| --- | --- | --- | --- | --- | --- |
| RSH-001 | What user evidence validates the primary problem and outcome? | Scope and success measures | Open | Product | Before C002 |
| RSH-002 | Which legal, regulatory, privacy, accessibility, or data obligations apply? | Security and delivery | Open | Governance | Before C003 |
| RSH-003 | Which quality attribute creates the dominant architecture trade-off? | Architecture style | Open | Architect | Before ADR selection |
| RSH-004 | Which external systems and service guarantees are material? | Integration and resilience | Open | Technical lead | Before C003 |

## Project brief

A production-quality Australian local-business growth platform with a public marketing site, commercial backend, customer account experience, internal administration and future agent-platform integration.

## Constraints to verify

- WCAG 2.2 AA and strong Core Web Vitals
- Australian English, AUD pricing plus GST, and ethical review practices
- Central configuration must support a future rebrand
- Forms must be honest, privacy-preserving, validated, and adapter-based
- Use a modular monolith with explicit domain and application service boundaries
- Customer, onboarding, billing, notification and agent-provisioning lifecycles remain separate and auditable
