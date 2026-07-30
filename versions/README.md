# Versioning and Compatibility

Project Genesis follows Semantic Versioning 2.0.0. Its public API comprises CLI commands
and arguments, input/output schemas, engine and validator contracts, required generated
layout, placeholders, state transitions, and resume behavior.

- MAJOR: incompatible public contract or generated-layout change.
- MINOR: backward-compatible engine, validator, template, or automation capability.
- PATCH: backward-compatible correction or documentation clarification.

Compatibility lines `v1`, `v2`, and `v3` have permanent namespaces. `v1` is current;
`v2` and `v3` define reserved contracts and migration boundaries so future major lines
can coexist without mutating released v1 artifacts. Consumers pin a major line and
follow sequential migration guides. Released version content is never rewritten.

Each release updates `VERSION`, `CHANGELOG.md`, schemas or profiles, examples, tests,
and relevant migration documents.
