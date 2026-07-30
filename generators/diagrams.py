"""Mermaid-first diagram generation with deterministic SVG derivatives."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from html import escape
from pathlib import Path
import re

from .engine import Engine
from .io import ArtifactWriter
from .models import EngineSpec, GenerationContext, GenesisError
from .templates import TemplateRenderer


@dataclass(frozen=True)
class DiagramDefinition:
    name: str
    title: str
    direction: str
    nodes: tuple[tuple[str, str], ...]
    edges: tuple[tuple[str, str, str], ...]

    def mermaid(self) -> str:
        def safe(value: str) -> str:
            return " ".join(value.replace('"', "'").split())

        lines = [
            "---",
            f'title: "{safe(self.title)}"',
            "---",
            f"flowchart {self.direction}",
        ]
        lines.extend(f'    {node_id}["{safe(label)}"]' for node_id, label in self.nodes)
        lines.extend(
            f'    {source} -->|"{safe(label)}"| {target}'
            for source, label, target in self.edges
        )
        lines.append("    classDef genesis fill:#eef4ff,stroke:#2457a6,color:#10233f")
        lines.append("    class " + ",".join(node_id for node_id, _ in self.nodes) + " genesis")
        return "\n".join(lines) + "\n"


def diagram_definitions(project_name: str) -> tuple[DiagramDefinition, ...]:
    """Return the required architecture views without technology assumptions."""

    return (
        DiagramDefinition(
            "context", f"System Context — {project_name}", "LR",
            (("stakeholder", "Primary stakeholder"), ("system", project_name),
             ("external", "External systems"), ("operator", "Operators")),
            (("stakeholder", "achieves outcomes through", "system"),
             ("system", "exchanges approved data with", "external"),
             ("operator", "operates and observes", "system")),
        ),
        DiagramDefinition(
            "container", f"Container View — {project_name}", "LR",
            (("channel", "Delivery channel"), ("interface", "Application interface"),
             ("core", "Domain core"), ("store", "Data store"),
             ("integration", "Integration adapters")),
            (("channel", "invokes", "interface"), ("interface", "coordinates", "core"),
             ("core", "persists through ports", "store"),
             ("core", "integrates through ports", "integration")),
        ),
        DiagramDefinition(
            "module", f"Module View — {project_name}", "LR",
            (("presentation", "Presentation"), ("application", "Application"),
             ("domain", "Domain"), ("ports", "Ports"),
             ("adapters", "Adapters"), ("platform", "Platform")),
            (("presentation", "calls", "application"),
             ("application", "orchestrates", "domain"),
             ("application", "depends on", "ports"),
             ("adapters", "implements", "ports"),
             ("adapters", "uses", "platform")),
        ),
        DiagramDefinition(
            "dependency", f"Dependency Rules — {project_name}", "TD",
            (("outer", "Delivery and infrastructure"), ("application", "Use cases"),
             ("domain", "Domain model"), ("contracts", "Stable contracts")),
            (("outer", "depends inward", "application"),
             ("application", "depends inward", "domain"),
             ("outer", "implements", "contracts"),
             ("application", "owns", "contracts")),
        ),
        DiagramDefinition(
            "domain", f"Domain View — {project_name}", "LR",
            (("actor", "Actor"), ("capability", "Core capability"),
             ("entity", "Domain entity"), ("policy", "Domain policy"),
             ("event", "Domain event")),
            (("actor", "requests", "capability"),
             ("capability", "acts on", "entity"),
             ("policy", "governs", "capability"),
             ("entity", "emits", "event")),
        ),
        DiagramDefinition(
            "class", f"Class Responsibilities — {project_name}", "TD",
            (("controller", "Interface adapter"), ("service", "Application service"),
             ("aggregate", "Aggregate root"), ("repository", "Repository port"),
             ("implementation", "Repository adapter")),
            (("controller", "invokes", "service"),
             ("service", "coordinates", "aggregate"),
             ("service", "uses", "repository"),
             ("implementation", "implements", "repository")),
        ),
        DiagramDefinition(
            "erd", f"Conceptual Data Model — {project_name}", "LR",
            (("aggregate", "Aggregate"), ("record", "Domain record"),
             ("event", "Audit event"), ("reference", "Reference data")),
            (("aggregate", "owns", "record"), ("aggregate", "produces", "event"),
             ("record", "references", "reference")),
        ),
        DiagramDefinition(
            "workflow", f"Primary Workflow — {project_name}", "LR",
            (("request", "Validated request"), ("authorize", "Policy check"),
             ("execute", "Domain execution"), ("persist", "Atomic persistence"),
             ("observe", "Outcome and telemetry")),
            (("request", "authorize", "authorize"), ("authorize", "allow", "execute"),
             ("execute", "commit", "persist"), ("persist", "report", "observe")),
        ),
        DiagramDefinition(
            "deployment", f"Deployment View — {project_name}", "LR",
            (("edge", "Trusted entry point"), ("runtime", "Application runtime"),
             ("data", "Managed data boundary"), ("observability", "Observability"),
             ("delivery", "Delivery pipeline")),
            (("edge", "routes authenticated traffic", "runtime"),
             ("runtime", "uses least privilege", "data"),
             ("runtime", "emits signals", "observability"),
             ("delivery", "promotes verified artifact", "runtime")),
        ),
        DiagramDefinition(
            "chunk-dependency", f"Chunk Dependency Graph — {project_name}", "TD",
            (("c001", "C001 Foundation"), ("c002", "C002 Domain discovery"),
             ("c003", "C003 Architecture and risk"), ("c004", "C004 Delivery plan"),
             ("c005", "C005 Readiness review")),
            (("c001", "enables", "c002"), ("c001", "enables", "c003"),
             ("c002", "informs", "c004"), ("c003", "constrains", "c004"),
             ("c004", "precedes", "c005")),
        ),
        DiagramDefinition(
            "status", f"Planning Status — {project_name}", "LR",
            (("planned", "Planned"), ("ready", "Ready"), ("active", "In progress"),
             ("blocked", "Blocked"), ("verified", "Verified"), ("done", "Complete")),
            (("planned", "gates pass", "ready"), ("ready", "work starts", "active"),
             ("active", "impediment", "blocked"), ("blocked", "resolved", "ready"),
             ("active", "evidence accepted", "verified"),
             ("verified", "memory updated", "done")),
        ),
    )


NODE_PATTERN = re.compile(r'^\s*([A-Za-z][A-Za-z0-9_-]*)\["([^"]+)"\]\s*$')
EDGE_PATTERN = re.compile(
    r'^\s*([A-Za-z][A-Za-z0-9_-]*)\s+-->\|"([^"]+)"\|\s+'
    r'([A-Za-z][A-Za-z0-9_-]*)\s*$'
)


def render_svg(mermaid_source: str) -> str:
    """Render the controlled Genesis flowchart subset into portable SVG.

    Mermaid remains authoritative: this function parses the serialized `.mmd`
    source, and embeds its SHA-256 in the derivative for drift validation.
    """

    nodes: list[tuple[str, str]] = []
    edges: list[tuple[str, str, str]] = []
    for line in mermaid_source.splitlines():
        node_match = NODE_PATTERN.match(line)
        edge_match = EDGE_PATTERN.match(line)
        if node_match:
            nodes.append((node_match.group(1), node_match.group(2)))
        elif edge_match:
            edges.append(edge_match.groups())
    if not nodes:
        raise GenesisError("Mermaid source contains no renderable nodes")

    columns = min(3, max(1, len(nodes)))
    box_width, box_height = 220, 64
    gap_x, gap_y, margin = 90, 90, 40
    positions: dict[str, tuple[int, int]] = {}
    for index, (node_id, _) in enumerate(nodes):
        column, row = index % columns, index // columns
        positions[node_id] = (
            margin + column * (box_width + gap_x),
            margin + row * (box_height + gap_y),
        )
    rows = (len(nodes) + columns - 1) // columns
    width = margin * 2 + columns * box_width + (columns - 1) * gap_x
    height = margin * 2 + rows * box_height + max(0, rows - 1) * gap_y
    source_hash = sha256(mermaid_source.encode("utf-8")).hexdigest()
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img">',
        f"  <metadata>mermaid-source-sha256:{source_hash}</metadata>",
        "  <defs><marker id=\"arrow\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" "
        "markerWidth=\"7\" markerHeight=\"7\" orient=\"auto-start-reverse\">"
        "<path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#4b6484\"/></marker></defs>",
        "  <rect width=\"100%\" height=\"100%\" fill=\"#ffffff\"/>",
    ]
    for source, label, target in edges:
        if source not in positions or target not in positions:
            raise GenesisError(f"diagram edge references unknown node: {source} -> {target}")
        sx, sy = positions[source]
        tx, ty = positions[target]
        x1, y1 = sx + box_width / 2, sy + box_height / 2
        x2, y2 = tx + box_width / 2, ty + box_height / 2
        svg.append(
            f'  <line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            'stroke="#4b6484" stroke-width="2" marker-end="url(#arrow)"/>'
        )
        svg.append(
            f'  <text x="{(x1 + x2) / 2}" y="{(y1 + y2) / 2 - 7}" '
            f'text-anchor="middle" font-family="sans-serif" font-size="11" '
            f'fill="#334155">{escape(label)}</text>'
        )
    for node_id, label in nodes:
        x, y = positions[node_id]
        svg.append(
            f'  <rect id="{escape(node_id)}" x="{x}" y="{y}" width="{box_width}" '
            f'height="{box_height}" rx="8" fill="#eef4ff" stroke="#2457a6" stroke-width="2"/>'
        )
        svg.append(
            f'  <text x="{x + box_width / 2}" y="{y + box_height / 2 + 4}" '
            f'text-anchor="middle" font-family="sans-serif" font-size="13" '
            f'fill="#10233f">{escape(label)}</text>'
        )
    svg.append("</svg>")
    return "\n".join(svg) + "\n"


class DiagramEngine(Engine):
    """Generates all required Mermaid sources and current SVG derivatives."""

    def __init__(self, spec: EngineSpec) -> None:
        self.spec = spec

    def execute(
        self,
        context: GenerationContext,
        writer: ArtifactWriter,
        renderer: TemplateRenderer,
    ) -> list[Path]:
        artifacts: list[Path] = []
        for definition in diagram_definitions(context.project.name):
            source = definition.mermaid()
            source_path = writer.write_text(f"architecture/diagrams/{definition.name}.mmd", source)
            # Read the authoritative serialized source before creating the derivative.
            serialized = source_path.read_text(encoding="utf-8")
            svg_path = writer.write_text(
                f"architecture/diagrams/{definition.name}.svg", render_svg(serialized)
            )
            artifacts.extend((source_path, svg_path))
        return artifacts
