"""End-to-end deterministic project foundation pipeline."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from .engine import Engine, order_engines
from .engines import build_engine_catalog
from .io import ArtifactWriter
from .models import GenerationContext, GenesisError, ProjectSpec, sha256_file, stable_json
from .templates import TemplateRenderer


class GenesisPipeline:
    """Coordinates engines without embedding engine-specific behavior."""

    def __init__(self, framework_root: Path, engines: list[Engine] | None = None) -> None:
        self.framework_root = framework_root.resolve()
        self.engines = order_engines(engines or build_engine_catalog())

    def generate(
        self,
        project: ProjectSpec,
        output_root: Path,
        generated_at: str = "1970-01-01T00:00:00Z",
        allow_nonempty: bool = False,
    ) -> Path:
        output_root = output_root.resolve()
        if output_root.exists() and any(output_root.iterdir()):
            owned = (output_root / ".genesis" / "manifest.json").is_file()
            if not owned and not allow_nonempty:
                raise GenesisError(
                    f"output directory is not empty and is not Genesis-owned: {output_root}"
                )
        context = GenerationContext(
            project=project,
            output_root=output_root,
            framework_root=self.framework_root,
            generated_at=generated_at,
        )
        writer = ArtifactWriter(output_root)
        renderer = TemplateRenderer(self.framework_root / "templates")
        writer.write_text(".genesis/project.json", stable_json(project.to_dict()))

        ownership: dict[str, str] = {".genesis/project.json": "pipeline"}
        engine_contracts: list[dict[str, object]] = []
        for engine in self.engines:
            engine_contracts.append(asdict(engine.spec))
            for artifact in engine.execute(context, writer, renderer):
                relative = artifact.relative_to(output_root).as_posix()
                if relative in ownership:
                    raise GenesisError(
                        f"artifact ownership collision for {relative}: "
                        f"{ownership[relative]} and {engine.spec.engine_id}"
                    )
                ownership[relative] = engine.spec.engine_id

        writer.write_text(
            ".genesis/engine-catalog.json",
            stable_json({"schema_version": "1", "engines": engine_contracts}),
        )
        ownership[".genesis/engine-catalog.json"] = "pipeline"
        artifacts = [
            {
                "path": path,
                "owner": ownership[path],
                "sha256": sha256_file(output_root / path),
            }
            for path in sorted(ownership)
        ]
        manifest = {
            "schema_version": "1",
            "framework": {"name": "Project Genesis Framework", "version": "1.0.0"},
            "project": {**project.to_dict(), "id": project.project_id, "slug": project.slug},
            "generation": {"generated_at": generated_at, "deterministic": True},
            "engine_order": [engine.spec.engine_id for engine in self.engines],
            "artifacts": artifacts,
        }
        return writer.write_text(".genesis/manifest.json", stable_json(manifest))
