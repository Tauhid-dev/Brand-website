from pathlib import Path

from .architecture import ArchitectureValidator
from .chunk import ChunkValidator
from .core import ValidationIssue, ValidationReport, issue, read_json
from .dependency import DependencyValidator
from .diagram import DiagramValidator
from .memory import MemoryValidator
from .planning import PlanningValidator
from .quality import QualityValidator
from .requirements import RequirementsValidator
from .resume import ResumeValidator
from .template import TemplateValidator


class ValidationSuite:
    """Runs all reusable validators and verifies manifest integrity."""

    def __init__(self) -> None:
        self.validators = (
            PlanningValidator(), ArchitectureValidator(), RequirementsValidator(),
            ChunkValidator(), MemoryValidator(), DiagramValidator(),
            DependencyValidator(), TemplateValidator(), QualityValidator(), ResumeValidator(),
        )

    def validate(self, root: Path) -> ValidationReport:
        root = root.resolve()
        findings: list[ValidationIssue] = []
        for validator in self.validators:
            findings.extend(validator.validate(root))
        findings.extend(self._validate_manifest(root))
        return ValidationReport(
            root, tuple(sorted(set(findings))), tuple(item.name for item in self.validators)
        )

    def _validate_manifest(self, root: Path) -> list[ValidationIssue]:
        from generators.models import sha256_file

        data, findings = read_json(root / ".genesis/manifest.json")
        if not isinstance(data, dict) or not isinstance(data.get("artifacts"), list):
            return findings + [issue("MAN001", ".genesis/manifest.json", "artifact manifest is missing")]
        for artifact in data["artifacts"]:
            if not isinstance(artifact, dict) or not all(key in artifact for key in ("path", "owner", "sha256")):
                findings.append(issue("MAN002", ".genesis/manifest.json", "artifact entry is incomplete"))
                continue
            relative = str(artifact["path"])
            path = (root / relative).resolve()
            if root not in path.parents:
                findings.append(issue("MAN003", relative, "manifest path escapes repository"))
            elif not path.is_file():
                findings.append(issue("MAN004", relative, "manifest artifact is missing"))
            elif sha256_file(path) != artifact["sha256"]:
                findings.append(
                    issue(
                        "MAN005", relative,
                        "artifact differs from the last generated snapshot; record accepted evidence",
                        severity="warning",
                    )
                )
        return findings
