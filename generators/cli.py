"""Command-line interface for Project Genesis."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from .models import GenesisError, ProjectSpec
from .pipeline import GenesisPipeline
from validators import ValidationSuite


FRAMEWORK_ROOT = Path(__file__).resolve().parents[1]


def _load_spec(path: Path) -> ProjectSpec:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise GenesisError(f"cannot read project input {path}: {error}") from error
    if not isinstance(data, dict):
        raise GenesisError("project input must be a JSON object")
    return ProjectSpec.from_dict(data)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="genesis", description="Generate and validate project planning foundations."
    )
    parser.add_argument("--version", action="version", version="Project Genesis 1.0.0")
    commands = parser.add_subparsers(dest="command", required=True)

    init = commands.add_parser("init", help="create a complete planning repository")
    source = init.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", type=Path, help="project input JSON")
    source.add_argument("--name", help="project name")
    init.add_argument("--description", help="brief project description")
    init.add_argument("--constraint", action="append", default=[], help="optional constraint; repeatable")
    init.add_argument("--output", required=True, type=Path, help="output directory")
    init.add_argument("--generated-at", default="1970-01-01T00:00:00Z")
    init.add_argument("--allow-nonempty", action="store_true")

    validate = commands.add_parser("validate", help="validate a generated planning repository")
    validate.add_argument("target", type=Path)
    validate.add_argument("--json", action="store_true", dest="as_json")

    next_chunk = commands.add_parser("next", help="show the context-free next action")
    next_chunk.add_argument("target", type=Path)

    regenerate = commands.add_parser(
        "regenerate", help="refresh all coherent artifacts from the saved project input"
    )
    regenerate.add_argument("target", type=Path)
    return parser


def _run(args: argparse.Namespace) -> int:
    if args.command == "init":
        if args.input:
            project = _load_spec(args.input)
        else:
            if not args.description:
                raise GenesisError("--description is required when --name is used")
            project = ProjectSpec(args.name, args.description, tuple(args.constraint))
        manifest = GenesisPipeline(FRAMEWORK_ROOT).generate(
            project, args.output, args.generated_at, args.allow_nonempty
        )
        report = ValidationSuite().validate(args.output)
        print(f"Generated {manifest.parent.parent}")
        print(report.summary())
        return 0 if report.ok else 1
    if args.command == "validate":
        report = ValidationSuite().validate(args.target)
        print(report.to_json() if args.as_json else report.format_text())
        return 0 if report.ok else 1
    if args.command == "next":
        state_path = args.target / "memory" / "state.json"
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
            print(f"{state['current_chunk']}: {state['next_action']}")
        except (OSError, json.JSONDecodeError, KeyError) as error:
            raise GenesisError(f"cannot resume from {state_path}: {error}") from error
        return 0
    if args.command == "regenerate":
        project = _load_spec(args.target / ".genesis" / "project.json")
        manifest_path = args.target / ".genesis" / "manifest.json"
        generated_at = "1970-01-01T00:00:00Z"
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            generated_at = manifest["generation"]["generated_at"]
        except (OSError, json.JSONDecodeError, KeyError, TypeError):
            pass
        GenesisPipeline(FRAMEWORK_ROOT).generate(project, args.target, generated_at)
        report = ValidationSuite().validate(args.target)
        print(report.format_text())
        return 0 if report.ok else 1
    raise GenesisError(f"unsupported command: {args.command}")


def main(argv: list[str] | None = None) -> int:
    try:
        return _run(_parser().parse_args(argv))
    except GenesisError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
