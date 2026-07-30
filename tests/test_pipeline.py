import json
import tempfile
import unittest
from pathlib import Path

from generators.models import ProjectSpec
from generators.pipeline import GenesisPipeline
from validators import ValidationSuite


ROOT = Path(__file__).resolve().parents[1]


def snapshot(root: Path) -> dict[str, bytes]:
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


class PipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.spec = ProjectSpec(
            "Test Foundation",
            "Prepare a safe and measurable planning foundation for a serious initiative.",
            ("Must be resumable",),
        )

    def test_complete_generation_validates(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "output"
            GenesisPipeline(ROOT).generate(self.spec, target)
            report = ValidationSuite().validate(target)
            self.assertTrue(report.ok, report.format_text())
            manifest = json.loads((target / ".genesis/manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(len(manifest["engine_order"]), 16)
            self.assertEqual(len(list((target / "architecture/diagrams").glob("*.mmd"))), 11)
            self.assertEqual(len(list((target / "architecture/diagrams").glob("*.svg"))), 11)

    def test_generation_is_byte_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first"
            second = Path(directory) / "second"
            pipeline = GenesisPipeline(ROOT)
            pipeline.generate(self.spec, first)
            pipeline.generate(self.spec, second)
            self.assertEqual(snapshot(first), snapshot(second))

    def test_diagram_drift_and_manifest_tamper_are_detected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "output"
            GenesisPipeline(ROOT).generate(self.spec, target)
            source = target / "architecture/diagrams/context.mmd"
            source.write_text(source.read_text(encoding="utf-8") + "\n", encoding="utf-8")
            report = ValidationSuite().validate(target)
            codes = {item.code for item in report.issues}
            self.assertIn("DIAG004", codes)
            self.assertIn("MAN005", codes)

    def test_quotes_in_project_name_are_safe_in_diagrams(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "output"
            quoted = ProjectSpec('A "Quoted" Project', "A sufficiently detailed project description.")
            GenesisPipeline(ROOT).generate(quoted, target)
            self.assertTrue(ValidationSuite().validate(target).ok)


if __name__ == "__main__":
    unittest.main()
