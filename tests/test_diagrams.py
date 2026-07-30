import unittest

from generators.diagrams import diagram_definitions, render_svg


class DiagramTests(unittest.TestCase):
    def test_all_required_views_render_from_mermaid(self) -> None:
        definitions = diagram_definitions("A Project")
        self.assertEqual(len(definitions), 11)
        for definition in definitions:
            source = definition.mermaid()
            svg = render_svg(source)
            self.assertIn("flowchart", source)
            self.assertIn("mermaid-source-sha256:", svg)
            self.assertIn("<svg", svg)
            self.assertIn("</svg>", svg)


if __name__ == "__main__":
    unittest.main()
