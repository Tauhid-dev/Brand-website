# ADR-0001: Use a dependency-free Python core

- Status: Accepted
- Date: 2026-07-20

## Context

Genesis must bootstrap diverse projects reliably, including offline and controlled
environments. Its core work is file generation, validation, graph ordering, hashing,
and command-line orchestration.

## Decision

Target Python 3.10+ and use the standard library for runtime behavior. Publish JSON
Schema contracts for interoperable external validation. Keep external Mermaid tooling
optional by providing a deterministic SVG renderer for the controlled generated subset.

## Consequences

The framework has a small supply-chain and installation surface. Internal validators
cover the supported contract subset; users may add full JSON Schema and Mermaid tools
through extension points.
