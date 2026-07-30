# Getting Started

## 1. Supply the three inputs

Use command arguments or copy `bootstrap/project-input.example.json`. Only name and a
brief description are required; constraints are optional and repeatable.

```bash
./scripts/create-project \
  --name "Project Name" \
  --description "Who needs what outcome, and why it matters." \
  --constraint "A material legal, delivery, technology, or operating boundary" \
  --output /absolute/path/to/planning
```

Genesis refuses a nonempty directory it does not own. `--allow-nonempty` is an explicit
opt-in for controlled integration; it never deletes unrelated files.

## 2. Validate

```bash
./scripts/validate-planning /absolute/path/to/planning
```

Fix all errors. Warnings require an explicit disposition. Validation is read-only.

## 3. Resume and execute

```bash
./scripts/genesis next /absolute/path/to/planning
```

Read the named chunk and all required reading. The chunk is complete only after tests,
documentation, review, completion evidence, and every memory projection are updated.

## 4. Regenerate

```bash
./scripts/genesis regenerate /absolute/path/to/planning
```

Regeneration uses `.genesis/project.json` and the original generation timestamp. It is
intended for a pristine/generated baseline; on an evolved project, review the diff and
do not overwrite intentional human elaboration without a migration plan.

## Reproducibility

Default generation time is `1970-01-01T00:00:00Z`, making identical inputs byte-identical.
Pass an ISO-8601 `--generated-at` value when provenance requires a meaningful time; that
value then becomes part of the deterministic input.
