"""Validation primitives shared by all validators."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Iterable, Protocol


@dataclass(frozen=True, order=True)
class ValidationIssue:
    severity: str
    code: str
    path: str
    message: str


class Validator(Protocol):
    name: str

    def validate(self, root: Path) -> list[ValidationIssue]: ...


@dataclass(frozen=True)
class ValidationReport:
    target: Path
    issues: tuple[ValidationIssue, ...]
    validators_run: tuple[str, ...]

    @property
    def ok(self) -> bool:
        return not any(issue.severity == "error" for issue in self.issues)

    def summary(self) -> str:
        errors = sum(issue.severity == "error" for issue in self.issues)
        warnings = sum(issue.severity == "warning" for issue in self.issues)
        return f"Validation {'passed' if self.ok else 'failed'}: {errors} error(s), {warnings} warning(s)"

    def format_text(self) -> str:
        lines = [self.summary(), f"Target: {self.target}"]
        lines.extend(
            f"{item.severity.upper()} {item.code} {item.path}: {item.message}"
            for item in self.issues
        )
        return "\n".join(lines)

    def to_json(self) -> str:
        return json.dumps(
            {
                "ok": self.ok,
                "target": str(self.target),
                "validators_run": list(self.validators_run),
                "issues": [issue.__dict__ for issue in self.issues],
            },
            indent=2,
            sort_keys=True,
        )


def issue(code: str, path: str, message: str, severity: str = "error") -> ValidationIssue:
    return ValidationIssue(severity, code, path, message)


def require_files(root: Path, paths: Iterable[str], code: str) -> list[ValidationIssue]:
    return [
        issue(code, path, "required artifact is missing or empty")
        for path in paths
        if not (root / path).is_file() or (root / path).stat().st_size == 0
    ]


def read_json(path: Path) -> tuple[object | None, list[ValidationIssue]]:
    try:
        return json.loads(path.read_text(encoding="utf-8")), []
    except OSError as error:
        return None, [issue("JSON001", str(path), f"cannot read JSON: {error}")]
    except json.JSONDecodeError as error:
        return None, [issue("JSON002", str(path), f"invalid JSON: {error}")]
