import unittest

from generators.engine import Engine, order_engines
from generators.models import EngineSpec, GenesisError


class StubEngine(Engine):
    def __init__(self, engine_id: str, dependencies: tuple[str, ...] = ()) -> None:
        self.spec = EngineSpec(
            engine_id, engine_id, ("test",), ("input",), ("output",), dependencies,
            ("extension",), ("validation",),
        )

    def execute(self, context, writer, renderer):
        return []


class EngineOrderingTests(unittest.TestCase):
    def test_orders_dependencies_deterministically(self) -> None:
        ordered = order_engines([StubEngine("c", ("a", "b")), StubEngine("b", ("a",)), StubEngine("a")])
        self.assertEqual([engine.spec.engine_id for engine in ordered], ["a", "b", "c"])

    def test_rejects_cycle_and_unknown_dependency(self) -> None:
        with self.assertRaises(GenesisError):
            order_engines([StubEngine("a", ("b",)), StubEngine("b", ("a",))])
        with self.assertRaises(GenesisError):
            order_engines([StubEngine("a", ("missing",))])


if __name__ == "__main__":
    unittest.main()
