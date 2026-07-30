# Review Skill

- **Purpose:** Independently identify material defects, regressions, risks, and missing evidence.
- **When to use:** Before merge, release, migration, gate acceptance, or consequential decision.
- **When NOT to use:** To silently implement changes or approve outside delegated authority.
- **Inputs:** Diff, chunk, requirements, decisions, risks, tests, docs, memory.
- **Outputs:** Prioritised findings with location, impact, remediation; or scoped no-findings statement.
- **Dependencies:** Reviewer independence and reproducible validation.
- **Example:** Flag a backward-incompatible schema change lacking a major version and migration.
