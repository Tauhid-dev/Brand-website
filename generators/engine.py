"""Engine abstractions and dependency ordering."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Iterable, Mapping

from .io import ArtifactWriter
from .models import EngineSpec, GenerationContext, GenesisError
from .templates import TemplateRenderer


class Engine(ABC):
    """An independently executable, validated generation unit."""

    spec: EngineSpec

    @abstractmethod
    def execute(
        self,
        context: GenerationContext,
        writer: ArtifactWriter,
        renderer: TemplateRenderer,
    ) -> list[Path]:
        """Generate owned artifacts and return their absolute paths."""


class DocumentEngine(Engine):
    """Renders a declared mapping of templates to output artifacts."""

    def __init__(self, spec: EngineSpec, documents: Mapping[str, str]) -> None:
        self.spec = spec
        self.documents = dict(documents)

    def execute(
        self,
        context: GenerationContext,
        writer: ArtifactWriter,
        renderer: TemplateRenderer,
    ) -> list[Path]:
        return [
            writer.write_text(destination, renderer.render(template, context.placeholders))
            for destination, template in sorted(self.documents.items())
        ]


def order_engines(engines: Iterable[Engine]) -> list[Engine]:
    """Topologically order engines and fail on missing or cyclic dependencies."""

    engine_list = list(engines)
    by_id = {engine.spec.engine_id: engine for engine in engine_list}
    if len(by_id) != len(engine_list):
        raise GenesisError("engine identifiers must be unique")
    unknown = sorted(
        {
            dependency
            for engine in by_id.values()
            for dependency in engine.spec.dependencies
            if dependency not in by_id
        }
    )
    if unknown:
        raise GenesisError(f"unknown engine dependencies: {', '.join(unknown)}")

    ordered: list[Engine] = []
    pending = dict(by_id)
    completed: set[str] = set()
    while pending:
        ready = sorted(
            engine_id
            for engine_id, engine in pending.items()
            if set(engine.spec.dependencies).issubset(completed)
        )
        if not ready:
            cycle = ", ".join(sorted(pending))
            raise GenesisError(f"engine dependency cycle detected among: {cycle}")
        for engine_id in ready:
            ordered.append(pending.pop(engine_id))
            completed.add(engine_id)
    return ordered
