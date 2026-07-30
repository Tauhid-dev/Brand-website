from pathlib import Path

from .core import ValidationIssue, require_files


class PlanningValidator:
    name = "planning"
    REQUIRED = (
        "README.md", "planning/product-vision.md", "planning/requirements.md",
        "planning/acceptance-criteria.md", "planning/roadmap.md", "planning/status.md",
    )

    def validate(self, root: Path) -> list[ValidationIssue]:
        return require_files(root, self.REQUIRED, "PLAN001")
