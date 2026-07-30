from pathlib import Path

from .core import ValidationIssue, issue, read_json


def _cycles(graph: dict[str, set[str]]) -> bool:
    temporary: set[str] = set()
    permanent: set[str] = set()

    def visit(node: str) -> bool:
        if node in permanent:
            return False
        if node in temporary:
            return True
        temporary.add(node)
        if any(visit(dependency) for dependency in graph.get(node, set())):
            return True
        temporary.remove(node)
        permanent.add(node)
        return False

    return any(visit(node) for node in graph)


class DependencyValidator:
    name = "dependency"

    def validate(self, root: Path) -> list[ValidationIssue]:
        findings: list[ValidationIssue] = []
        for relative, collection_key, id_key in (
            (".genesis/engine-catalog.json", "engines", "engine_id"),
            ("chunks/index.json", "chunks", "id"),
        ):
            data, errors = read_json(root / relative)
            findings.extend(errors)
            if not isinstance(data, dict) or not isinstance(data.get(collection_key), list):
                continue
            entries = data[collection_key]
            ids = {str(entry.get(id_key)) for entry in entries if isinstance(entry, dict)}
            graph = {
                str(entry.get(id_key)): set(map(str, entry.get("dependencies", [])))
                for entry in entries if isinstance(entry, dict)
            }
            unknown = sorted({dependency for dependencies in graph.values() for dependency in dependencies if dependency not in ids})
            if unknown:
                findings.append(issue("DEP001", relative, f"unknown dependencies: {', '.join(unknown)}"))
            if _cycles(graph):
                findings.append(issue("DEP002", relative, "dependency cycle detected"))
        return findings
