# Security and Privacy Plan — AI-Magnet

## Security objectives

Protect confidentiality, integrity, availability, authenticity, accountability,
and privacy in proportion to documented risk. Align delivery practices with the
four SSDF groups: prepare, protect, produce well-secured software, and respond.

## Assets and trust boundaries

Inventory identities, sensitive data, secrets, source, build artifacts, operational
controls, logs, and external dependencies. Every boundary defines authentication,
authorization, validation, encryption, rate limits, failure behavior, and telemetry.

## Threat modelling

For each workflow document attacker goals, abuse cases, spoofing, tampering,
repudiation, disclosure, denial of service, and privilege escalation. Assign
treatment, owner, verification evidence, and residual risk.

## Required controls

- least privilege, deny by default, separation of duties, and short-lived credentials;
- input validation at boundaries and output encoding at sinks;
- secret management outside source and generated artifacts;
- dependency provenance, review, vulnerability scanning, and reproducible builds;
- encryption in transit and at rest based on data classification;
- privacy minimisation, purpose limitation, retention, deletion, and subject rights;
- tamper-evident, privacy-safe audit events with controlled access;
- incident response, vulnerability intake, remediation SLAs, and disclosure process.

## Verification

Use automated analysis, dependency and secret scanning, negative tests, access-control
tests, threat-model review, penetration testing where risk warrants it, and recovery
exercises. Record tool version, configuration, scope, result, and reviewer.

## Project constraints

- WCAG 2.2 AA and strong Core Web Vitals
- Australian English, AUD pricing plus GST, and ethical review practices
- Central configuration must support a future rebrand
- Forms must be honest, privacy-preserving, validated, and adapter-based
