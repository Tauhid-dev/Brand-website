# Validation Guide

The suite runs planning, architecture, requirements, chunk, memory, diagram, dependency,
template, quality, resume, and manifest-integrity checks. It never mutates the target.

```bash
./scripts/genesis validate /absolute/path/to/planning
./scripts/genesis validate /absolute/path/to/planning --json
```

Exit codes: `0` valid, `1` validation errors, `2` input/usage failure.

Framework contributors run:

```bash
./scripts/validate-framework
```

This adds unit/end-to-end tests, directory/template inventory, schema-dialect checks,
and the sixteen-engine count. CI executes the same command.

Manifest drift is intentional after human elaboration only when the project adopts a
workflow that refreshes or supersedes the generated baseline. Until such a project-level
ADR exists, drift is an error because it obscures provenance.
