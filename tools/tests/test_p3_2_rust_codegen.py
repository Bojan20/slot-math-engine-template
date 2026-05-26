"""P3.2 — IR → Rust engine codegen tests."""
from __future__ import annotations
import json
import re
import tempfile
import unittest
from pathlib import Path

from tools.slot_build.codegen_rust import (
    _slug_to_crate,
    write_rust_codegen,
)


def _ir(slug: str = "demo-game") -> dict:
    return {
        "meta": {
            "id": slug,
            "name": slug,
            "vendor": "vendor_a",
            "swid": "S-TEST-0001",
            "target_rtp": 0.96,
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "evaluation": {"paylines": list(range(20))},
        "limits": {"max_win_x": 5000.0},
        "features": [{"kind": "free_spins"}],
        "reels": {"base": [["A", "B", "C", "D"] * 8 for _ in range(5)]},
        "paytable": [
            {"combo": ["A"] * 5, "pays": 100},
            {"combo": ["A"] * 4, "pays": 50},
        ],
    }


class SlugTest(unittest.TestCase):
    def test_strips_non_alnum(self):
        self.assertEqual(_slug_to_crate("Demo Game!@#"), "demo-game")

    def test_avoids_leading_digit(self):
        self.assertEqual(_slug_to_crate("2024-game"), "g-2024-game")

    def test_handles_empty(self):
        self.assertEqual(_slug_to_crate(""), "game")


class CodegenLayoutTest(unittest.TestCase):
    def test_emits_full_crate_layout(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            crate = write_rust_codegen(
                td, slug="demo-game", universal_ir=_ir(),
                swid="S-TEST", vendor="vendor_a",
            )
            self.assertTrue((crate / "Cargo.toml").exists())
            self.assertTrue((crate / "src" / "main.rs").exists())
            self.assertTrue((crate / "src" / "sim.rs").exists())
            self.assertTrue((crate / "ir" / "demo-game.ir.json").exists())
            self.assertTrue((crate / "README.md").exists())

    def test_cargo_toml_has_correct_package_name(self):
        with tempfile.TemporaryDirectory() as td:
            crate = write_rust_codegen(
                Path(td), slug="demo-game", universal_ir=_ir(),
            )
            cargo = (crate / "Cargo.toml").read_text()
            self.assertIn('name = "demo-game"', cargo)
            self.assertIn('slot-sim = { path = "', cargo)

    def test_main_rs_has_fn_main(self):
        with tempfile.TemporaryDirectory() as td:
            crate = write_rust_codegen(
                Path(td), slug="demo-game", universal_ir=_ir(),
            )
            main_rs = (crate / "src" / "main.rs").read_text()
            self.assertIn("fn main()", main_rs)
            self.assertIn("--spins", main_rs)
            self.assertIn("--seed", main_rs)

    def test_sim_rs_includes_ir_path(self):
        with tempfile.TemporaryDirectory() as td:
            crate = write_rust_codegen(
                Path(td), slug="demo-game", universal_ir=_ir(),
            )
            sim_rs = (crate / "src" / "sim.rs").read_text()
            self.assertIn('include_str!("../ir/demo-game.ir.json")', sim_rs)
            self.assertIn("fn run(", sim_rs)
            self.assertIn("RunStats", sim_rs)

    def test_ir_json_is_valid(self):
        with tempfile.TemporaryDirectory() as td:
            crate = write_rust_codegen(
                Path(td), slug="demo-game", universal_ir=_ir(),
            )
            ir_path = crate / "ir" / "demo-game.ir.json"
            roundtrip = json.loads(ir_path.read_text())
            self.assertEqual(roundtrip["meta"]["id"], "demo-game")


class DeterminismTest(unittest.TestCase):
    def test_codegen_is_deterministic(self):
        ir = _ir()
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            c1 = write_rust_codegen(td / "out1", slug="g", universal_ir=ir)
            c2 = write_rust_codegen(td / "out2", slug="g", universal_ir=ir)
            self.assertEqual(
                (c1 / "src" / "main.rs").read_bytes(),
                (c2 / "src" / "main.rs").read_bytes(),
            )
            self.assertEqual(
                (c1 / "ir" / "g.ir.json").read_bytes(),
                (c2 / "ir" / "g.ir.json").read_bytes(),
            )


class CliWireTest(unittest.TestCase):
    def test_slot_build_source_mentions_codegen_rust_flag(self):
        # The slot_build CLI doesn't expose a build_parser symbol — its
        # argparse is constructed inside main(). We assert source-level
        # wiring instead, which is what every other --codegen-X test
        # in this repo does.
        main_py = Path(__file__).resolve().parents[1] / "slot_build" / "__main__.py"
        src = main_py.read_text()
        self.assertIn('"--codegen-rust"', src)
        self.assertIn("write_rust_codegen", src)


class CargoTomlPathTest(unittest.TestCase):
    def test_relative_path_to_slot_sim(self):
        # In this repo there are `engine/slot-sim` or `rust-sim` siblings;
        # the path-builder should resolve a non-placeholder value.
        with tempfile.TemporaryDirectory() as td:
            crate = write_rust_codegen(
                Path(td), slug="demo", universal_ir=_ir(),
            )
            cargo = (crate / "Cargo.toml").read_text()
            # Path token shows up between `path = "` and `"`.
            m = re.search(r'path = "([^"]+)"', cargo)
            self.assertIsNotNone(m)
            self.assertTrue(m.group(1))


if __name__ == "__main__":
    unittest.main()
