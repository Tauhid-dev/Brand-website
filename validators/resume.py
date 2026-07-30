from pathlib import Path

from .core import ValidationIssue, issue, read_json


class ResumeValidator:
    name = "resume"

    def validate(self, root: Path) -> list[ValidationIssue]:
        data, findings = read_json(root / "memory/state.json")
        if not isinstance(data, dict):
            return findings
        current = data.get("current_chunk")
        chunks = data.get("chunks")
        if not isinstance(current, str) or not (root / "chunks" / f"{current}.md").is_file():
            findings.append(issue("RESUME001", "memory/state.json", "current chunk is not executable"))
        if not isinstance(chunks, dict) or current not in chunks:
            findings.append(issue("RESUME002", "memory/state.json", "chunk status does not include current chunk"))
        if not isinstance(data.get("next_action"), str) or len(data["next_action"].strip()) < 20:
            findings.append(issue("RESUME003", "memory/state.json", "next action is not explicit"))
        for required in ("memory/CURRENT_STATE.md", "memory/SESSION_HANDOFF.md", "memory/NEXT_ACTION.md"):
            if not (root / required).is_file():
                findings.append(issue("RESUME004", required, "required resume document is missing"))
        return findings
