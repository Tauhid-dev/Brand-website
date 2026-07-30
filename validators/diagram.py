from hashlib import sha256
from pathlib import Path
import re

from .core import ValidationIssue, issue


class DiagramValidator:
    name = "diagram"
    REQUIRED = (
        "context", "container", "module", "dependency", "domain", "class", "erd",
        "workflow", "deployment", "chunk-dependency", "status",
    )

    def validate(self, root: Path) -> list[ValidationIssue]:
        findings: list[ValidationIssue] = []
        directory = root / "architecture/diagrams"
        for name in self.REQUIRED:
            source_path = directory / f"{name}.mmd"
            svg_path = directory / f"{name}.svg"
            if not source_path.is_file():
                findings.append(issue("DIAG001", str(source_path), "Mermaid source is missing"))
                continue
            source = source_path.read_text(encoding="utf-8")
            if not re.search(r"^flowchart\s+(LR|RL|TD|TB|BT)$", source, re.MULTILINE):
                findings.append(issue("DIAG002", str(source_path), "unsupported or missing flowchart declaration"))
            if not svg_path.is_file():
                findings.append(issue("DIAG003", str(svg_path), "SVG derivative is missing"))
                continue
            expected = sha256(source.encode("utf-8")).hexdigest()
            svg = svg_path.read_text(encoding="utf-8")
            if f"mermaid-source-sha256:{expected}" not in svg:
                findings.append(issue("DIAG004", str(svg_path), "SVG is stale relative to Mermaid source"))
            if "<svg" not in svg or "</svg>" not in svg:
                findings.append(issue("DIAG005", str(svg_path), "SVG derivative is malformed"))
        return findings
