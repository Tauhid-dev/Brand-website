"""Strict, dependency-free placeholder rendering."""

from __future__ import annotations

from pathlib import Path
import re
from typing import Mapping

from .models import GenesisError


PLACEHOLDER = re.compile(r"\{\{([A-Z][A-Z0-9_]*)\}\}")


class TemplateRenderer:
    """Renders known placeholders and rejects incomplete output."""

    def __init__(self, template_root: Path) -> None:
        self.template_root = template_root.resolve()

    def render(self, template_name: str, values: Mapping[str, str]) -> str:
        path = (self.template_root / template_name).resolve()
        if self.template_root not in path.parents or not path.is_file():
            raise GenesisError(f"unknown template: {template_name}")
        source = path.read_text(encoding="utf-8")
        required = set(PLACEHOLDER.findall(source))
        missing = sorted(required.difference(values))
        if missing:
            raise GenesisError(
                f"template {template_name} lacks values for: {', '.join(missing)}"
            )
        rendered = PLACEHOLDER.sub(lambda match: values[match.group(1)], source)
        unresolved = PLACEHOLDER.findall(rendered)
        if unresolved:
            raise GenesisError(
                f"template {template_name} left unresolved placeholders: {unresolved}"
            )
        return rendered
