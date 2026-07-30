# Project Genesis Framework

> **Project implementation:** This repository now also contains the AI-Magnet
> public marketing site in [`site/`](site/) and its generated, validated
> Genesis planning foundation in [`planning/`](planning/). See
> [`docs/AI_MAGNET_SITE.md`](docs/AI_MAGNET_SITE.md) for brand configuration,
> development, integration, SEO, deployment and launch guidance.

Project Genesis is a reusable, deterministic foundation generator for serious
software projects. Given only a project name, a brief description, and optional
constraints, it creates a versioned planning repository with requirements,
architecture, security, testing, delivery, diagrams, executable chunks, memory,
quality gates, and resume instructions.

It builds planning and engineering foundations—not applications.

## Quick start

Requirements: Python 3.10 or newer. The core has no third-party runtime
dependencies.

```bash
./scripts/genesis init \
  --name "Example Project" \
  --description "A concise description of the problem and intended outcomes." \
  --constraint "Must operate in a regulated environment" \
  --output /tmp/example-project-planning

./scripts/genesis validate /tmp/example-project-planning
./scripts/genesis next /tmp/example-project-planning
```

The same input produces byte-identical output. Use `--generated-at` only when a
meaningful timestamp is required; otherwise Genesis uses the reproducible-build
epoch.

## Core workflow

1. Capture `Project Name`, `Project Description`, and optional constraints.
2. Run the engine pipeline in dependency order.
3. Validate structure, requirements, architecture, diagrams, chunks, memory,
   dependencies, quality gates, templates, and resume readiness.
4. Read `memory/NEXT_ACTION.md` and execute the indicated self-contained chunk.
5. Update completion evidence and memory before ending every session.

See [Getting Started](docs/guides/getting-started.md), the
[Framework Architecture](docs/architecture/framework-architecture.md), and the
[Repository Map](docs/reference/repository-map.md).

## Repository contract

| Directory | Purpose |
| --- | --- |
| `bootstrap/` | Minimal input contract and universal bootstrap entry point. |
| `templates/` | Strict placeholder-based planning artifact templates. |
| `doctrines/` | Non-negotiable constitution and engineering doctrine. |
| `generators/` | Engine pipeline, renderers, models, and CLI. |
| `validators/` | Composable validation rules and reports. |
| `skills/` | Reusable AI skill packs with explicit use boundaries. |
| `agents/` | Role contracts for reusable specialist agents. |
| `prompts/` | Context-independent orchestration and execution prompts. |
| `examples/` | Framework examples and fixtures, never example applications. |
| `versions/` | SemVer policy, compatibility lines, migrations, changelog. |
| `schemas/` | JSON Schema 2020-12 machine-readable contracts. |
| `scripts/` | Stable shell entry points for generation and validation. |
| `docs/` | Architecture, research, guides, and reference documentation. |
| `tests/` | Unit and end-to-end contract tests. |
| `memory/` | The framework's own resumable state and handoff record. |

## Guarantees

- deterministic output and stable ordering;
- no unresolved template placeholders in generated artifacts;
- all Mermaid sources have validated SVG derivatives;
- every chunk is independently executable without chat history;
- dependency cycles and missing artifact references fail validation;
- memory identifies exactly one next action;
- public contracts and migrations follow SemVer.

## Development

```bash
python3 -m unittest discover -s tests -v
./scripts/validate-framework
```

Contributions must satisfy [CONTRIBUTING.md](CONTRIBUTING.md), the
[Project Constitution](doctrines/project-constitution.md), and all quality
gates. Current framework version: **1.0.0**.
