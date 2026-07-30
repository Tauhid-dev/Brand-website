from pathlib import Path

from .core import ValidationIssue, issue, require_files


class QualityValidator:
    name = "quality"
    REQUIRED = (
        "quality/quality-gates.md", "quality/testing.md", "quality/validation-plan.md",
        "quality/completion-evidence.md", "security/security.md", "risks/risk-register.md",
        "delivery/delivery-plan.md", "governance/project-constitution.md",
        "governance/engineering-doctrine.md",
    )

    def validate(self, root: Path) -> list[ValidationIssue]:
        findings = require_files(root, self.REQUIRED, "QUAL001")
        gates = root / "quality/quality-gates.md"
        if gates.is_file() and "| Gate |" not in gates.read_text(encoding="utf-8"):
            findings.append(issue("QUAL002", str(gates), "quality gate register is missing"))
        return findings
