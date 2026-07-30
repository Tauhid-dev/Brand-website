from pathlib import Path

from .core import ValidationIssue, issue, read_json


class ChunkValidator:
    name = "chunk"
    SECTIONS = (
        "Purpose", "Scope", "Dependencies", "Required Reading", "Relevant Skills",
        "Inputs", "Outputs", "Implementation Plan", "Tests", "Acceptance Criteria",
        "Documentation Updates", "Git Requirements", "Rollback", "Risks",
        "Completion Evidence",
    )

    def validate(self, root: Path) -> list[ValidationIssue]:
        data, findings = read_json(root / "chunks/index.json")
        if not isinstance(data, dict) or not isinstance(data.get("chunks"), list):
            return findings + [issue("CHUNK001", "chunks/index.json", "chunks array is required")]
        identifiers: set[str] = set()
        for chunk in data["chunks"]:
            if not isinstance(chunk, dict) or not all(key in chunk for key in ("id", "title", "dependencies", "purpose", "outputs")):
                findings.append(issue("CHUNK002", "chunks/index.json", "chunk contract is incomplete"))
                continue
            chunk_id = str(chunk["id"])
            if chunk_id in identifiers:
                findings.append(issue("CHUNK003", "chunks/index.json", f"duplicate chunk: {chunk_id}"))
            identifiers.add(chunk_id)
            path = root / "chunks" / f"{chunk_id}.md"
            if not path.is_file():
                findings.append(issue("CHUNK004", str(path), "chunk document is missing"))
                continue
            text = path.read_text(encoding="utf-8")
            for section in self.SECTIONS:
                if f"## {section}" not in text:
                    findings.append(issue("CHUNK005", str(path), f"missing section: {section}"))
            if "conversation" in text.lower() and "does not depend" not in text.lower():
                findings.append(issue("CHUNK006", str(path), "chunk appears to depend on conversation context"))
        return findings
