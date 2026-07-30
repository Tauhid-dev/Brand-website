import tempfile
import unittest
from pathlib import Path

from generators.models import GenesisError
from generators.templates import TemplateRenderer


class TemplateRendererTests(unittest.TestCase):
    def test_strict_resolution(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "sample.tmpl").write_text("Hello {{NAME}}\n", encoding="utf-8")
            renderer = TemplateRenderer(root)
            self.assertEqual(renderer.render("sample.tmpl", {"NAME": "world"}), "Hello world\n")
            with self.assertRaises(GenesisError):
                renderer.render("sample.tmpl", {})

    def test_rejects_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            renderer = TemplateRenderer(Path(directory))
            with self.assertRaises(GenesisError):
                renderer.render("../outside.tmpl", {})


if __name__ == "__main__":
    unittest.main()
