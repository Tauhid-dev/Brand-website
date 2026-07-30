"""Confined, deterministic filesystem operations."""

from __future__ import annotations

from pathlib import Path, PurePosixPath

from .models import GenesisError


class ArtifactWriter:
    """Writes artifacts while preventing traversal outside the output root."""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def resolve(self, relative_path: str) -> Path:
        relative = PurePosixPath(relative_path)
        if relative.is_absolute() or ".." in relative.parts:
            raise GenesisError(f"unsafe artifact path: {relative_path}")
        destination = (self.root / Path(*relative.parts)).resolve()
        if destination != self.root and self.root not in destination.parents:
            raise GenesisError(f"artifact escapes output root: {relative_path}")
        return destination

    def write_text(self, relative_path: str, content: str) -> Path:
        destination = self.resolve(relative_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        normalized = content.replace("\r\n", "\n").replace("\r", "\n")
        if not normalized.endswith("\n"):
            normalized += "\n"
        temporary = destination.with_name(destination.name + ".genesis-tmp")
        temporary.write_text(normalized, encoding="utf-8", newline="\n")
        temporary.replace(destination)
        return destination
