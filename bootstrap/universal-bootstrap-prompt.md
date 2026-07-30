# Universal Project Bootstrap Prompt

## Required input

- Project Name: `{{PROJECT_NAME}}`
- Project Description: `{{PROJECT_DESCRIPTION}}`
- Optional Constraints: `{{OPTIONAL_CONSTRAINTS}}`

## Mission

Create a complete planning and engineering foundation for this project. Do not build
the application. The repository must remain technology-neutral until requirements,
research, risks, and quality attributes justify decisions.

## Workflow

1. Validate the three inputs and label missing knowledge as open questions.
2. Apply the Project Genesis constitution and engineering doctrine.
3. Generate product vision, requirements, acceptance criteria, research, risks,
   security/privacy, architecture, domain model, ADRs, testing, delivery, roadmap,
   quality gates, prompts, and all required Mermaid/SVG diagrams.
4. Produce dependency-ordered chunks with purpose, scope, dependencies, required
   reading, relevant skills, inputs, outputs, plan, tests, acceptance, documentation,
   Git requirements, rollback, risks, and completion evidence.
5. Create durable memory: state, handoff, decisions, progress, risks, debt, chunk
   status, and exactly one next action.
6. Run every validator and repair errors.

## Quality bar

All artifacts are modular, reusable, deterministic, versioned, documented, validated,
resumable, extensible, cross-referenced, and independent of conversation history.
Distinguish facts, assumptions, decisions, and proposals. Use primary sources for
material research. Record completion evidence rather than asserting completion.

## Stop condition

Stop after the planning repository is implementation-ready, validation has zero errors,
remaining risks are explicit, and the next chunk can be executed without chat context.
