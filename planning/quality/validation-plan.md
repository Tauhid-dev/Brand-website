# Validation Plan — AI-Magnet

## Validators

Planning, architecture, requirements, chunk, memory, diagram, dependency, template,
quality, and resume validators run as one suite. Errors block completion; warnings
require review and an explicit disposition.

## Contract hierarchy

1. Project constitution and declared project constraints.
2. Versioned JSON schemas and framework public contracts.
3. Requirements, architecture decisions, and quality gates.
4. Templates, generated artifacts, diagrams, chunks, and memory projections.

## Execution points

Run validation after bootstrap, before a chunk, after relevant changes, before commit,
before release, after migration, and during resume. Store evidence with the exact
revision and tool version.

## Failure behavior

Report stable codes, severity, artifact, and actionable message. Do not mutate the
target during validation. Never suppress an error without an expiring waiver.

Project ID: `b2e195c00813e779`.
