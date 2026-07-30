import tempfile
import unittest
from pathlib import Path

from generators.io import ArtifactWriter
from generators.models import GenesisError, ProjectSpec


class ProjectSpecTests(unittest.TestCase):
    def test_normalizes_input_and_produces_stable_identity(self) -> None:
        first = ProjectSpec("  Serious Project  ", "  A sufficiently detailed brief.  ", ("  Offline  ", ""))
        second = ProjectSpec("Serious Project", "A sufficiently detailed brief.", ("Offline",))
        self.assertEqual(first, second)
        self.assertEqual(first.slug, "serious-project")
        self.assertEqual(first.project_id, second.project_id)
        self.assertEqual(
            ProjectSpec("Name", "A sufficiently detailed brief.", ("Same", "Same")).constraints,
            ("Same",),
        )

    def test_rejects_invalid_contract(self) -> None:
        with self.assertRaises(GenesisError):
            ProjectSpec("", "A sufficiently detailed brief.")
        with self.assertRaises(GenesisError):
            ProjectSpec("Name", "short")
        with self.assertRaises(GenesisError):
            ProjectSpec("Name\nInjected", "A sufficiently detailed brief.")
        with self.assertRaises(GenesisError):
            ProjectSpec("Name", "A brief containing {{PROJECT_NAME}} syntax.")
        with self.assertRaises(GenesisError):
            ProjectSpec.from_dict({"name": "Name", "description": "A sufficiently detailed brief.", "extra": True})


class ArtifactWriterTests(unittest.TestCase):
    def test_confines_writes_to_root(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            writer = ArtifactWriter(Path(directory))
            with self.assertRaises(GenesisError):
                writer.write_text("../escape.txt", "unsafe")
            written = writer.write_text("safe/artifact.txt", "content")
            self.assertEqual(written.read_text(encoding="utf-8"), "content\n")


if __name__ == "__main__":
    unittest.main()
