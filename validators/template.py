from pathlib import Path
import re

from .core import ValidationIssue, issue


class TemplateValidator:
    name = "template"
    PATTERN = re.compile(r"\{\{[A-Z][A-Z0-9_]*\}\}")

    def validate(self, root: Path) -> list[ValidationIssue]:
        findings: list[ValidationIssue] = []
        if (root / "templates").is_dir():
            templates = sorted((root / "templates").glob("*.tmpl"))
            for path in templates:
                if not self.PATTERN.search(path.read_text(encoding="utf-8")):
                    findings.append(issue("TMPL001", str(path), "template contains no placeholders"))
            return findings
        for path in sorted(root.rglob("*")):
            if path.is_file() and path.suffix in {".md", ".json", ".mmd"}:
                if self.PATTERN.search(path.read_text(encoding="utf-8")):
                    findings.append(issue("TMPL002", str(path), "generated artifact has unresolved placeholders"))
        return findings
