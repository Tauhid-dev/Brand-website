"""Read-only structural checks for the framework repository itself."""

from __future__ import annotations

import json
from pathlib import Path
import sys

from generators.engines import build_engine_catalog
from validators.template import TemplateValidator


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_DIRECTORIES = (
    "bootstrap", "templates", "doctrines", "generators", "validators", "skills",
    "agents", "prompts", "examples", "versions", "schemas", "scripts", "docs",
    "tests", "memory",
)
REQUIRED_TEMPLATES = (
    "README", "architecture", "requirements", "acceptance-criteria", "product-vision",
    "roadmap", "adr", "research", "risks", "security", "testing", "chunk", "status",
    "memory", "current-state", "session-handoff", "next-action", "decision-summary",
    "progress-history", "completion-evidence", "project-constitution",
    "engineering-doctrine", "quality-gates",
)


def main() -> int:
    failures: list[str] = []
    for directory in REQUIRED_DIRECTORIES:
        if not (ROOT / directory).is_dir():
            failures.append(f"missing directory: {directory}")
    for template in REQUIRED_TEMPLATES:
        if not (ROOT / "templates" / f"{template}.md.tmpl").is_file():
            failures.append(f"missing template: {template}")
    engines = build_engine_catalog()
    if len(engines) != 16:
        failures.append(f"expected 16 engines, found {len(engines)}")
    for schema in sorted((ROOT / "schemas").glob("*.json")):
        try:
            data = json.loads(schema.read_text(encoding="utf-8"))
            if data.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
                failures.append(f"wrong schema dialect: {schema.name}")
        except json.JSONDecodeError as error:
            failures.append(f"invalid JSON {schema.name}: {error}")
    failures.extend(
        f"{item.code} {item.path}: {item.message}"
        for item in TemplateValidator().validate(ROOT)
    )
    if failures:
        print("Framework validation failed:")
        print("\n".join(f"- {failure}" for failure in failures))
        return 1
    print(
        f"Framework validation passed: {len(engines)} engines, "
        f"{len(REQUIRED_TEMPLATES)} required templates, "
        f"{len(list((ROOT / 'schemas').glob('*.json')))} schemas"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
