"""Immutable domain models used by all Genesis engines."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from hashlib import sha256
import json
import re
from pathlib import Path
from typing import Iterable, Mapping


class GenesisError(ValueError):
    """Raised when an input or generation contract is violated."""


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    if not slug:
        raise GenesisError("project name must contain at least one letter or number")
    return slug[:80]


RESERVED_PLACEHOLDER = re.compile(r"\{\{[A-Z][A-Z0-9_]*\}\}")


@dataclass(frozen=True)
class ProjectSpec:
    """The complete user input contract for bootstrapping a project."""

    name: str
    description: str
    constraints: tuple[str, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        name = self.name.strip()
        description = self.description.strip()
        constraints = tuple(
            dict.fromkeys(item.strip() for item in self.constraints if item.strip())
        )
        if not name:
            raise GenesisError("project name is required")
        if any(character in name for character in ("\n", "\r", "\x00")):
            raise GenesisError("project name must be a single text line")
        if len(name) > 120:
            raise GenesisError("project name must be 120 characters or fewer")
        if len(description) < 10:
            raise GenesisError("project description must be at least 10 characters")
        if len(description) > 5000:
            raise GenesisError("project description must be 5000 characters or fewer")
        if any(len(item) > 500 for item in constraints):
            raise GenesisError("each constraint must be 500 characters or fewer")
        if any("\n" in item or "\r" in item or "\x00" in item for item in constraints):
            raise GenesisError("each constraint must be a single text line")
        if "\x00" in description or any(
            RESERVED_PLACEHOLDER.search(value)
            for value in (name, description, *constraints)
        ):
            raise GenesisError("project input contains a null or reserved {{PLACEHOLDER}} value")
        object.__setattr__(self, "name", name)
        object.__setattr__(self, "description", description)
        object.__setattr__(self, "constraints", constraints)

    @property
    def slug(self) -> str:
        return _slugify(self.name)

    @property
    def project_id(self) -> str:
        canonical = json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"))
        return sha256(canonical.encode("utf-8")).hexdigest()[:16]

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "description": self.description,
            "constraints": list(self.constraints),
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> "ProjectSpec":
        unknown = sorted(set(data).difference({"$schema", "name", "description", "constraints"}))
        if unknown:
            raise GenesisError(f"unknown project input fields: {', '.join(unknown)}")
        constraints = data.get("constraints", [])
        if isinstance(constraints, str):
            constraints = [constraints]
        if not isinstance(constraints, list) or not all(
            isinstance(item, str) for item in constraints
        ):
            raise GenesisError("constraints must be an array of strings")
        name = data.get("name")
        description = data.get("description")
        if not isinstance(name, str) or not isinstance(description, str):
            raise GenesisError("name and description must be strings")
        return cls(name=name, description=description, constraints=tuple(constraints))


@dataclass(frozen=True)
class EngineSpec:
    """Machine-readable contract for an independent generation engine."""

    engine_id: str
    title: str
    responsibilities: tuple[str, ...]
    inputs: tuple[str, ...]
    outputs: tuple[str, ...]
    dependencies: tuple[str, ...]
    extension_points: tuple[str, ...]
    validation: tuple[str, ...]


@dataclass(frozen=True)
class GenerationContext:
    """Shared immutable context passed to every engine."""

    project: ProjectSpec
    output_root: Path
    framework_root: Path
    generated_at: str = "1970-01-01T00:00:00Z"
    framework_version: str = "1.0.0"

    def __post_init__(self) -> None:
        try:
            parsed = datetime.fromisoformat(self.generated_at.replace("Z", "+00:00"))
        except ValueError as error:
            raise GenesisError("generated_at must be an ISO-8601 timestamp") from error
        if parsed.tzinfo is None:
            raise GenesisError("generated_at must include a timezone")

    @property
    def placeholders(self) -> dict[str, str]:
        constraint_lines = (
            "\n".join(f"- {item}" for item in self.project.constraints)
            if self.project.constraints
            else "- No additional constraints were supplied."
        )
        return {
            "PROJECT_NAME": self.project.name,
            "PROJECT_SLUG": self.project.slug,
            "PROJECT_ID": self.project.project_id,
            "PROJECT_DESCRIPTION": self.project.description,
            "OPTIONAL_CONSTRAINTS": constraint_lines,
            "GENERATED_AT": self.generated_at,
            "FRAMEWORK_VERSION": self.framework_version,
        }


def stable_json(data: object) -> str:
    """Serialize public machine artifacts in a deterministic representation."""

    return json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def sha256_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def unique(values: Iterable[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))
