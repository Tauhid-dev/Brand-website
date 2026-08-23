# Risk Register — Zuno Pixel

Scoring: likelihood (1–5) × impact (1–5). Owners accept, mitigate, transfer, or
avoid risk; overdue treatment is a quality-gate failure.

| ID | Risk | L | I | Score | Treatment | Owner | Trigger | Residual target |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | ---: |
| RISK-001 | The brief does not yet capture validated user needs | 3 | 4 | 12 | Discovery and measurable outcomes in C001 | Product owner | Conflicting stakeholder goals | 6 |
| RISK-002 | Hidden security, privacy, or legal obligations alter architecture | 3 | 5 | 15 | Obligation and threat analysis before material decisions | Security owner | Sensitive data or regulated workflow identified | 5 |
| RISK-003 | External dependency behavior is assumed rather than verified | 3 | 4 | 12 | Contract research, adapters, timeouts, and failure tests | Architect | Vendor or protocol selected | 6 |
| RISK-004 | Work becomes non-resumable after a long pause | 2 | 4 | 8 | Enforce memory, chunk, and resume validators each session | Engineering lead | Handoff lacks one next action | 2 |

## Technical debt

Track deliberate compromises with owner, principal/interest, expiry, remediation,
and consequences. Undocumented debt is a defect.

## Constraints

- WCAG 2.2 AA and strong Core Web Vitals
- Australian English, AUD pricing plus GST, and ethical review practices
- Central configuration must support a future rebrand
- Forms must be honest, privacy-preserving, validated, and adapter-based
- Use a modular monolith with explicit domain and application service boundaries
- Customer, onboarding, billing, notification and agent-provisioning lifecycles remain separate and auditable
