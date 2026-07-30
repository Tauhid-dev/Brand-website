# Repository Map

| Directory | Owned responsibility | Extension rule |
| --- | --- | --- |
| `bootstrap/` | Three-field input contract and universal entry prompt | Keep inputs minimal and backward compatible |
| `templates/` | Strict Markdown templates | Every template contains declared `{{PLACEHOLDER}}` tokens |
| `doctrines/` | Constitution and engineering doctrine | Weaken only through an explicit constitutional change |
| `generators/` | Models, safe I/O, engines, pipeline, diagrams, chunks, CLI | New engines implement the `Engine` contract |
| `validators/` | Read-only composable validation | Stable code, path, severity, actionable message |
| `skills/` | Reusable bounded capability packs | Declare when to use and when not to use |
| `agents/` | Specialist role contracts | No role receives implicit authority |
| `prompts/` | Universal context-independent workflows | State input, output, evidence, and stop conditions |
| `examples/` | Inputs and expected framework behavior | Never contain an example application |
| `versions/` | Version policy, compatibility lines, migrations, changelog | Released artifacts are immutable |
| `schemas/` | JSON Schema 2020-12 contracts | Breaking changes require a new major schema line |
| `scripts/` | Stable automation entry points | Delegate to tested Python modules |
| `docs/` | Architecture, research, guides, reference | Link to authoritative code/schema rather than duplicate it |
| `tests/` | Unit and end-to-end contract tests | Tests are deterministic and dependency-free |
| `memory/` | Framework current state, handoff, decisions, progress | Maintain exactly one next action |
