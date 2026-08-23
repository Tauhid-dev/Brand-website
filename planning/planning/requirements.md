# Requirements — Zuno Pixel

## Input summary

A production-quality Australian local-business growth platform with a public marketing site, commercial backend, customer account experience, internal administration and future agent-platform integration.

- WCAG 2.2 AA and strong Core Web Vitals
- Australian English, AUD pricing plus GST, and ethical review practices
- Central configuration must support a future rebrand
- Forms must be honest, privacy-preserving, validated, and adapter-based
- Use a modular monolith with explicit domain and application service boundaries
- Customer, onboarding, billing, notification and agent-provisioning lifecycles remain separate and auditable

## Functional requirements

| ID | Requirement | Priority | Source | Verification |
| --- | --- | --- | --- | --- |
| REQ-001 | The solution shall support the primary outcome described above through an explicitly documented workflow. | Must | Project brief | Acceptance scenario AC-001 |
| REQ-002 | The solution shall enforce defined authorization and data-handling policies at every trust boundary. | Must | Constitution | Security tests and review |
| REQ-003 | The solution shall expose sufficient status and diagnostic information for safe operation. | Must | Operations | Operational acceptance tests |

## Non-functional requirements

| ID | Attribute | Requirement | Measurement |
| --- | --- | --- | --- |
| REQ-004 | Reliability | Failure modes, recovery objectives, and degraded behavior shall be explicit. | Approved SLO/RTO/RPO and recovery exercise |
| REQ-005 | Maintainability | Domain policy shall remain independent of delivery and infrastructure frameworks. | Dependency validation and architecture review |
| REQ-006 | Security | Threats, abuse cases, secrets, dependencies, and vulnerabilities shall be managed throughout delivery. | Security gate evidence |
| REQ-007 | Accessibility | User-facing channels shall define and verify applicable accessibility targets. | Automated and manual evidence |
| REQ-008 | Performance | Critical journeys shall have budgets derived from user and operational needs. | Repeatable performance results |

## Traceability rules

Every requirement must have an owner, source, acceptance evidence, and lifecycle
state. Changes require impact analysis across architecture, risks, tests, chunks,
and delivery.
