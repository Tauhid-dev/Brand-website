# Testing Strategy — Zuno Pixel

## Principles

Test observable contracts and risks. Prefer fast deterministic tests at the lowest
useful boundary, then add integration, contract, system, exploratory, recovery,
security, accessibility, and performance tests where they provide distinct evidence.

## Layers

| Layer | Purpose | Typical evidence |
| --- | --- | --- |
| Static | Prevent invalid structure, dependencies, types, secrets, and known flaws | Repeatable tool report |
| Unit/property | Verify domain rules, edge cases, and invariants | Deterministic isolated results |
| Integration/contract | Verify adapters and provider/consumer compatibility | Versioned contract results |
| System/journey | Verify critical outcomes across deployed boundaries | Environment and build-linked run |
| Non-functional | Verify security, resilience, recovery, accessibility, and performance | Risk-based specialist evidence |

## Coverage model

Requirements REQ-001 through REQ-008 require traceable scenarios. Coverage metrics
are diagnostic; they never replace meaningful assertions, negative paths, mutation
resistance, or reviewer judgment.

## Test data

Use synthetic or approved minimised data. Make seeds, clocks, identities, and external
responses controllable. Never copy production secrets into test artifacts.

## Completion

A result records source revision, artifact identity, environment, configuration,
tool version, execution time, outcome, retained evidence, and waiver if applicable.

Project: A production-quality Australian local-business growth platform with a public marketing site, commercial backend, customer account experience, internal administration and future agent-platform integration.
