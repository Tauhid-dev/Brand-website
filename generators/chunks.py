"""Context-independent chunk planning."""

from __future__ import annotations

from pathlib import Path

from .engine import Engine
from .io import ArtifactWriter
from .models import EngineSpec, GenerationContext, stable_json
from .templates import TemplateRenderer


CHUNKS: tuple[dict[str, object], ...] = (
    {
        "id": "C001", "title": "Foundation and discovery baseline", "dependencies": [],
        "purpose": "Confirm outcomes, stakeholders, vocabulary, constraints, and measurable boundaries.",
        "outputs": ["planning/product-vision.md", "planning/requirements.md", "memory/CURRENT_STATE.md"],
    },
    {
        "id": "C002", "title": "Domain and requirements elaboration", "dependencies": ["C001"],
        "purpose": "Refine domain boundaries, requirements, acceptance criteria, and traceability.",
        "outputs": ["architecture/domain-model.md", "planning/acceptance-criteria.md"],
    },
    {
        "id": "C003", "title": "Architecture, security, and research", "dependencies": ["C001"],
        "purpose": "Validate architecture options, threats, privacy obligations, risks, and decisions.",
        "outputs": ["architecture/architecture.md", "security/security.md", "research/research.md"],
    },
    {
        "id": "C004", "title": "Testing and delivery design", "dependencies": ["C002", "C003"],
        "purpose": "Define test evidence, deployment, observability, rollback, and delivery sequencing.",
        "outputs": ["quality/testing.md", "delivery/delivery-plan.md", "planning/roadmap.md"],
    },
    {
        "id": "C005", "title": "Readiness and handoff review", "dependencies": ["C004"],
        "purpose": "Run all quality gates and leave complete evidence and a context-free next action.",
        "outputs": ["quality/completion-evidence.md", "memory/SESSION_HANDOFF.md"],
    },
)


class ChunkPlanningEngine(Engine):
    """Creates a dependency graph and self-contained executable work packets."""

    def __init__(self, spec: EngineSpec) -> None:
        self.spec = spec

    def execute(
        self,
        context: GenerationContext,
        writer: ArtifactWriter,
        renderer: TemplateRenderer,
    ) -> list[Path]:
        artifacts: list[Path] = []
        for chunk in CHUNKS:
            dependencies = chunk["dependencies"]
            values = {
                **context.placeholders,
                "CHUNK_ID": str(chunk["id"]),
                "CHUNK_TITLE": str(chunk["title"]),
                "CHUNK_PURPOSE": str(chunk["purpose"]),
                "CHUNK_DEPENDENCIES": ", ".join(dependencies) if dependencies else "None",
                "CHUNK_OUTPUTS": "\n".join(f"- `{item}`" for item in chunk["outputs"]),
            }
            artifacts.append(
                writer.write_text(
                    f"chunks/{chunk['id']}.md", renderer.render("chunk.md.tmpl", values)
                )
            )
        artifacts.append(
            writer.write_text(
                "chunks/index.json",
                stable_json({"schema_version": "1", "chunks": list(CHUNKS)}),
            )
        )
        return artifacts
