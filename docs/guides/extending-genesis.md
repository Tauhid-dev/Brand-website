# Extending Genesis

## Add an engine

1. Define an `EngineSpec` with responsibilities, inputs, outputs, dependencies,
   extension points, and validation.
2. Implement `Engine.execute` using immutable context, `ArtifactWriter`, and strict
   templates. Own a non-overlapping output boundary.
3. Register it in the catalog. Dependency ordering must remain acyclic.
4. Add schemas, validators, docs, examples, tests, and version/migration impact.

## Add a template

Use uppercase `{{PLACEHOLDER}}` tokens. The renderer rejects missing values and generated
artifacts with unresolved tokens. Avoid hidden dates, randomness, environment state, and
volatile tool output.

## Add a validator

Validators are deterministic and read-only. Return stable code, severity, exact path,
and actionable message. Do not auto-fix during validation. Add positive and negative
fixtures and register the rule in `ValidationSuite`.

## Add a profile

Organisation, domain, technology, and compliance profiles are overlays. They may add or
strengthen content but cannot silently weaken the constitution or invalidate the
three-field bootstrap contract. Record compatibility and provenance.

## Public contract changes

Assess CLI, input, schema, engine, template, output layout, validator, and resume impact.
Apply SemVer and write the migration before merging a breaking change.
