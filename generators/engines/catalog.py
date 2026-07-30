"""Built-in engine catalog and ownership declarations."""

from __future__ import annotations

from pathlib import Path

from ..chunks import ChunkPlanningEngine
from ..diagrams import DiagramEngine
from ..engine import DocumentEngine, Engine
from ..io import ArtifactWriter
from ..models import EngineSpec, GenerationContext, stable_json
from ..templates import TemplateRenderer


def _spec(
    engine_id: str,
    title: str,
    responsibilities: tuple[str, ...],
    outputs: tuple[str, ...],
    dependencies: tuple[str, ...] = (),
    extension_points: tuple[str, ...] = ("additional templates", "policy hooks"),
    validation: tuple[str, ...] = ("required sections", "resolved placeholders"),
) -> EngineSpec:
    return EngineSpec(
        engine_id=engine_id,
        title=title,
        responsibilities=responsibilities,
        inputs=("ProjectSpec", "GenerationContext"),
        outputs=outputs,
        dependencies=dependencies,
        extension_points=extension_points,
        validation=validation,
    )


class MemoryEngine(DocumentEngine):
    """Owns both narrative memory and the machine-readable resume cursor."""

    def execute(
        self,
        context: GenerationContext,
        writer: ArtifactWriter,
        renderer: TemplateRenderer,
    ) -> list[Path]:
        artifacts = super().execute(context, writer, renderer)
        state = {
            "schema_version": "1",
            "project_id": context.project.project_id,
            "current_chunk": "C001",
            "next_action": "Execute C001 using chunks/C001.md and record completion evidence.",
            "status": "ready",
            "chunks": {
                "C001": "ready", "C002": "planned", "C003": "planned",
                "C004": "planned", "C005": "planned",
            },
            "last_updated": context.generated_at,
        }
        artifacts.append(writer.write_text("memory/state.json", stable_json(state)))
        return artifacts


def build_engine_catalog() -> list[Engine]:
    """Build all independent engines in an intentionally unordered catalog."""

    planning = DocumentEngine(
        _spec(
            "planning", "Planning Engine",
            ("translate intent into outcomes", "define traceable requirements", "sequence milestones"),
            ("planning/",),
        ),
        {
            "planning/product-vision.md": "product-vision.md.tmpl",
            "planning/requirements.md": "requirements.md.tmpl",
            "planning/acceptance-criteria.md": "acceptance-criteria.md.tmpl",
            "planning/roadmap.md": "roadmap.md.tmpl",
            "planning/status.md": "status.md.tmpl",
        },
    )
    architecture = DocumentEngine(
        _spec(
            "architecture", "Architecture Engine",
            ("define boundaries and quality attributes", "record dependency rules", "own ADRs"),
            ("architecture/architecture.md", "architecture/decisions/"),
            ("planning",),
            ("architecture styles", "technology decision adapters", "additional views"),
            ("architecture validator", "ADR completeness", "dependency direction"),
        ),
        {
            "architecture/architecture.md": "architecture.md.tmpl",
            "architecture/decisions/ADR-0001-foundation.md": "adr.md.tmpl",
        },
    )
    domain = DocumentEngine(
        _spec(
            "domain", "Domain Modelling Engine",
            ("establish ubiquitous language", "identify bounded contexts", "separate policy from plumbing"),
            ("architecture/domain-model.md",), ("planning",),
            ("event storming", "domain-specific modelling profiles"),
            ("term definitions", "ownership boundaries", "invariant traceability"),
        ),
        {"architecture/domain-model.md": "domain-model.md.tmpl"},
    )
    doctrine = DocumentEngine(
        _spec(
            "doctrine", "Engineering Doctrine Engine",
            ("install non-negotiable governance", "tailor doctrine without weakening it"),
            ("governance/",), (), ("organisation overlays", "regulated profiles"),
            ("constitution precedence", "doctrine coverage"),
        ),
        {
            "governance/project-constitution.md": "project-constitution.md.tmpl",
            "governance/engineering-doctrine.md": "engineering-doctrine.md.tmpl",
        },
    )
    research = DocumentEngine(
        _spec(
            "research", "Research Engine",
            ("track questions and evidence", "separate facts, assumptions, and decisions"),
            ("research/research.md",), ("planning",),
            ("source connectors", "domain research profiles"),
            ("source provenance", "confidence and review dates"),
        ),
        {"research/research.md": "research.md.tmpl"},
    )
    security = DocumentEngine(
        _spec(
            "security", "Security Engine",
            ("model threats and trust boundaries", "define privacy and supply-chain controls", "own risk treatment"),
            ("security/", "risks/"), ("planning", "architecture"),
            ("threat modelling methods", "compliance profiles"),
            ("security controls", "risk ownership", "abuse cases"),
        ),
        {"security/security.md": "security.md.tmpl", "risks/risk-register.md": "risks.md.tmpl"},
    )
    documentation = DocumentEngine(
        _spec(
            "documentation", "Documentation Engine",
            ("create navigable project entry points", "maintain cross-references and audience clarity"),
            ("README.md",), ("planning", "architecture"),
            ("publishing adapters", "documentation profiles"),
            ("link integrity", "required navigation"),
        ),
        {"README.md": "README.md.tmpl"},
    )
    diagram = DiagramEngine(
        _spec(
            "diagram", "Diagram Engine",
            ("emit ten required architecture views", "render Mermaid-authoritative SVG derivatives"),
            ("architecture/diagrams/*.mmd", "architecture/diagrams/*.svg"),
            ("architecture", "domain"), ("custom diagram definitions", "external Mermaid renderer"),
            ("Mermaid syntax subset", "source hash parity", "edge integrity"),
        )
    )
    validation = DocumentEngine(
        _spec(
            "validation", "Validation Engine",
            ("define validation scope", "aggregate actionable findings"),
            ("quality/validation-plan.md",), ("planning", "architecture"),
            ("custom validators", "policy severity profiles"),
            ("validator registry", "zero-error release gate"),
        ),
        {"quality/validation-plan.md": "validation-plan.md.tmpl"},
    )
    chunk = ChunkPlanningEngine(
        _spec(
            "chunk", "Chunk Planning Engine",
            ("create bounded context-free work", "order work by explicit dependencies"),
            ("chunks/",), ("planning", "architecture", "security"),
            ("estimation policies", "additional chunk strategies"),
            ("chunk schema", "acyclic graph", "required reading and evidence"),
        )
    )
    memory = MemoryEngine(
        _spec(
            "memory", "Memory Engine",
            ("persist current state and decisions", "provide a single resume cursor", "support long pauses"),
            ("memory/",), ("chunk",), ("external state stores", "retention policies"),
            ("resume validator", "single next action", "chunk-state consistency"),
        ),
        {
            "memory/PROJECT_MEMORY.md": "memory.md.tmpl",
            "memory/CURRENT_STATE.md": "current-state.md.tmpl",
            "memory/SESSION_HANDOFF.md": "session-handoff.md.tmpl",
            "memory/NEXT_ACTION.md": "next-action.md.tmpl",
            "memory/DECISION_SUMMARY.md": "decision-summary.md.tmpl",
            "memory/PROGRESS_HISTORY.md": "progress-history.md.tmpl",
        },
    )
    prompt = DocumentEngine(
        _spec(
            "prompt", "Prompt Generation Engine",
            ("produce context-independent execution prompts", "embed evidence and stop conditions"),
            ("prompts/project-bootstrap.md",), ("planning", "doctrine"),
            ("model-specific adapters", "organisation prompt overlays"),
            ("prompt input contract", "no chat-context dependency"),
        ),
        {"prompts/project-bootstrap.md": "project-bootstrap-prompt.md.tmpl"},
    )
    skills = DocumentEngine(
        _spec(
            "skills", "Skills Engine",
            ("recommend reusable capabilities", "make use and non-use boundaries explicit"),
            ("skills/project-skills.md",), ("planning", "architecture"),
            ("runtime skill registries", "domain skill packs"),
            ("skill contract completeness", "dependency declarations"),
        ),
        {"skills/project-skills.md": "skills-plan.md.tmpl"},
    )
    quality = DocumentEngine(
        _spec(
            "quality", "Quality Engine",
            ("define measurable gates", "require evidence before completion"),
            ("quality/quality-gates.md", "quality/completion-evidence.md"),
            ("validation", "security"), ("quality profiles", "risk-based thresholds"),
            ("gate owner and evidence", "waiver expiry"),
        ),
        {
            "quality/quality-gates.md": "quality-gates.md.tmpl",
            "quality/completion-evidence.md": "completion-evidence.md.tmpl",
        },
    )
    testing = DocumentEngine(
        _spec(
            "testing", "Testing Engine",
            ("design layered tests", "trace requirements to executable evidence"),
            ("quality/testing.md",), ("planning", "architecture", "security"),
            ("technology test adapters", "performance and accessibility profiles"),
            ("test pyramid", "negative paths", "non-functional evidence"),
        ),
        {"quality/testing.md": "testing.md.tmpl"},
    )
    delivery = DocumentEngine(
        _spec(
            "delivery", "Delivery Engine",
            ("plan promotion, operations, rollback, and ownership", "close the feedback loop"),
            ("delivery/delivery-plan.md",), ("quality", "testing", "chunk"),
            ("platform adapters", "release strategies"),
            ("rollback rehearsal", "observability", "release evidence"),
        ),
        {"delivery/delivery-plan.md": "delivery-plan.md.tmpl"},
    )
    return [
        delivery, testing, quality, skills, prompt, memory, chunk, validation,
        diagram, documentation, security, research, doctrine, domain,
        architecture, planning,
    ]
