from pathlib import Path
import re

from .core import ValidationIssue, issue


class RequirementsValidator:
    name = "requirements"

    def validate(self, root: Path) -> list[ValidationIssue]:
        findings: list[ValidationIssue] = []
        requirement_path = root / "planning/requirements.md"
        acceptance_path = root / "planning/acceptance-criteria.md"
        if not requirement_path.is_file() or not acceptance_path.is_file():
            return findings
        requirements = set(re.findall(r"\bREQ-\d{3}\b", requirement_path.read_text(encoding="utf-8")))
        acceptance = set(re.findall(r"\bREQ-\d{3}\b", acceptance_path.read_text(encoding="utf-8")))
        if not requirements:
            findings.append(issue("REQ001", str(requirement_path), "no requirement identifiers found"))
        for missing in sorted(requirements - acceptance):
            findings.append(issue("REQ002", str(acceptance_path), f"no acceptance coverage for {missing}"))
        return findings
