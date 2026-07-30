from pathlib import Path

from .core import ValidationIssue, issue, read_json, require_files


class MemoryValidator:
    name = "memory"
    REQUIRED = (
        "memory/PROJECT_MEMORY.md", "memory/CURRENT_STATE.md", "memory/SESSION_HANDOFF.md",
        "memory/NEXT_ACTION.md", "memory/DECISION_SUMMARY.md", "memory/PROGRESS_HISTORY.md",
        "memory/state.json", "risks/risk-register.md", "planning/status.md",
    )

    def validate(self, root: Path) -> list[ValidationIssue]:
        findings = require_files(root, self.REQUIRED, "MEM001")
        data, json_findings = read_json(root / "memory/state.json")
        findings.extend(json_findings)
        if isinstance(data, dict):
            for key in ("project_id", "current_chunk", "next_action", "status", "chunks", "last_updated"):
                if not data.get(key):
                    findings.append(issue("MEM002", "memory/state.json", f"missing resume field: {key}"))
        return findings
