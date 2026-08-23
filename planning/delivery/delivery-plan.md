# Delivery Plan — Zuno Pixel

## Artifact lifecycle

Build once from a reviewed revision; assign provenance and integrity metadata; scan;
promote the same immutable artifact through environments; verify configuration and
policy at each boundary.

## Environments and configuration

Separate environment-specific configuration from the artifact. Validate configuration
schemas, protect secrets, use least privilege, prevent drift, and make infrastructure
changes reviewable and recoverable.

## Release strategy

Select rolling, canary, blue/green, or controlled cutover according to state,
compatibility, risk, and recovery objectives. Define entry metrics, abort thresholds,
decision owner, communication, and maximum observation window.

## Database and contract changes

Prefer expand/migrate/contract. Make changes backward compatible across the deployment
window, make migrations restartable and observable, back up when appropriate, and
rehearse recovery with representative scale.

## Observability and operations

Define service-level indicators, objectives, alerts, dashboards, structured events,
traces, ownership, escalation, runbooks, capacity, cost, dependency health, and
privacy-safe retention before release.

## Rollback and recovery

Rollback includes application, configuration, data, external contracts, and queued
work. State the point of no return and forward-recovery path. Rehearse against the
agreed RTO and RPO.

## Approval

Release requires all quality gates, residual-risk acceptance, artifact identity,
change record, communications, rollback evidence, and named decision authority.

Constraints:

- WCAG 2.2 AA and strong Core Web Vitals
- Australian English, AUD pricing plus GST, and ethical review practices
- Central configuration must support a future rebrand
- Forms must be honest, privacy-preserving, validated, and adapter-based
- Use a modular monolith with explicit domain and application service boundaries
- Customer, onboarding, billing, notification and agent-provisioning lifecycles remain separate and auditable
