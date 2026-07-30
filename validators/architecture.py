from pathlib import Path

from .core import ValidationIssue, issue, require_files


class ArchitectureValidator:
    name = "architecture"

    def validate(self, root: Path) -> list[ValidationIssue]:
        required = (
            "architecture/architecture.md", "architecture/domain-model.md",
            "architecture/decisions/ADR-0001-foundation.md",
        )
        findings = require_files(root, required, "ARCH001")
        architecture = root / "architecture/architecture.md"
        if architecture.is_file():
            text = architecture.read_text(encoding="utf-8")
            for section in ("Quality Attributes", "Boundaries", "Dependency Rules", "Extension Points"):
                if section not in text:
                    findings.append(issue("ARCH002", str(architecture), f"missing section: {section}"))
        return findings
