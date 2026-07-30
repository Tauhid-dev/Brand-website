# Engine Catalog

All engines receive `ProjectSpec` and immutable `GenerationContext`. Every template
output is checked for required sections and unresolved placeholders in addition to the
engine-specific validation below.

| Engine | Responsibilities | Outputs | Dependencies | Extension points | Validation |
| --- | --- | --- | --- | --- | --- |
| Planning | Outcomes, requirements, acceptance, roadmap | `planning/` | — | Planning profiles | Planning and requirements validators |
| Architecture | Boundaries, qualities, dependencies, ADRs | `architecture/` | Planning | Styles and views | Architecture/dependency validation |
| Domain Modelling | Language, contexts, invariants | Domain model | Planning | Modelling profiles | Terms, boundaries, invariant traceability |
| Engineering Doctrine | Constitution and doctrine | `governance/` | — | Organisation overlays | Doctrine coverage and precedence |
| Research | Questions, evidence, assumptions | `research/` | Planning | Source connectors | Provenance, confidence, review trigger |
| Security | Threats, privacy, supply chain, risks | `security/`, `risks/` | Planning, Architecture | Compliance profiles | Controls, ownership, abuse cases |
| Documentation | Navigation and audience views | Root README | Planning, Architecture | Publishing adapters | Links and required navigation |
| Diagram | Eleven architecture views and SVG | `architecture/diagrams/` | Architecture, Domain | Definitions and renderers | Syntax, edge integrity, source hash parity |
| Validation | Validation policy | Validation plan | Planning, Architecture | Custom rules and severity profiles | Registry and zero-error gate |
| Chunk Planning | Context-free dependency-ordered work | `chunks/` | Planning, Architecture, Security | Planning strategies | Schema, DAG, sections, evidence |
| Memory | State, decisions, progress, handoff, cursor | `memory/` | Chunk | External stores and retention | Cursor consistency and one next action |
| Prompt Generation | Bootstrap and execution prompts | `prompts/` | Planning, Doctrine | Model adapters | Three inputs, bounded outputs, no chat context |
| Skills | Capability selection and boundaries | `skills/` | Planning, Architecture | Runtime registries | Complete skill contracts |
| Quality | Gates and completion evidence | `quality/` | Validation, Security | Risk-based profiles | Owners, evidence, expiring waivers |
| Testing | Layered, traceable test strategy | Testing plan | Planning, Architecture, Security | Technology adapters | Negative/non-functional evidence |
| Delivery | Promotion, operations, rollback | `delivery/` | Quality, Testing, Chunk | Platform and release strategies | Provenance, observability, recovery |

The machine-readable form is generated at `.genesis/engine-catalog.json` and conforms
to `schemas/engine.schema.json`.
