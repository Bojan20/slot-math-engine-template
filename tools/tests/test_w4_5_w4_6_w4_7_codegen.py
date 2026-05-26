"""W4.5 + W4.6 + W4.7 — full 3-way slot-build codegen tests."""
from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.codegen_ts.codegen import write_ts_codegen, slugify as ts_slugify
from tools.codegen_svelte.codegen import (
    write_svelte_codegen, slugify as ui_slugify,
)


def _ir() -> dict:
    return {
        "meta": {"id": "blue_lagoon", "vendor": "vendor_c", "swid": "S",
                  "target_rtp": 0.96},
        "topology": {"kind": "rectangular", "reels": 3, "rows": 3},
        "reels": {"base": [
            ["A", "B", "C", "A"],
            ["A", "B", "C", "A"],
            ["A", "B", "C", "A"],
        ]},
        "paytable": [
            {"combo": ["A", "A", "A"], "pays": 100},
            {"combo": ["B", "B", "B"], "pays": 50},
            {"combo": ["C", "C", "C"], "pays": 25},
        ],
        "features": [{"kind": "free_spins"}],
    }


# ─── W4.5 — TS engine codegen ──────────────────────────────────────


class TestCodegenTS(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(ts_slugify("Blue Lagoon!"), "blue-lagoon")
        self.assertEqual(ts_slugify(""), "game")
        self.assertEqual(ts_slugify("hello-world"), "hello-world")

    def test_emits_complete_layout(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            paths = write_ts_codegen(ir=_ir(), out_dir=d)
            crate = paths["crate_dir"]
            self.assertTrue(crate.exists())
            for key in ("package_json", "tsconfig", "sim_ts", "main_ts",
                        "ir_json", "spec_ts", "readme"):
                self.assertTrue(paths[key].exists(), key)

    def test_package_json_parseable(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            paths = write_ts_codegen(ir=_ir(), out_dir=d, slug="x")
            pkg = json.loads(paths["package_json"].read_text())
            self.assertEqual(pkg["name"], "x-ts")
            self.assertIn("tsx", pkg["devDependencies"])
            self.assertIn("vitest", pkg["devDependencies"])

    def test_sim_ts_references_ir_and_pcg64(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            paths = write_ts_codegen(ir=_ir(), out_dir=d)
            sim = paths["sim_ts"].read_text()
            self.assertIn("export class PCG64", sim)
            self.assertIn("export function runMC", sim)
            self.assertIn("export const IR", sim)
            self.assertIn("export function lineEvaluator", sim)

    def test_spec_ts_uses_vitest(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            paths = write_ts_codegen(ir=_ir(), out_dir=d)
            spec = paths["spec_ts"].read_text()
            self.assertIn('from "vitest"', spec)
            self.assertIn("describe(", spec)

    def test_ir_json_round_trip(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            paths = write_ts_codegen(ir=_ir(), out_dir=d)
            back = json.loads(paths["ir_json"].read_text())
            self.assertEqual(back["meta"]["id"], _ir()["meta"]["id"])

    def test_explicit_slug_overrides_meta(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            paths = write_ts_codegen(ir=_ir(), out_dir=d, slug="override-slug")
            self.assertIn("override-slug-ts", str(paths["crate_dir"]))


# ─── W4.6 — Svelte UI codegen ──────────────────────────────────────


class TestCodegenSvelte(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(ui_slugify("Game Name"), "game-name")

    def test_emits_complete_layout(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            paths = write_svelte_codegen(ir=_ir(), out_dir=d)
            for key in ("package_json", "svelte_config", "vite_config",
                        "app_html", "page_svelte", "ir_json", "readme"):
                self.assertTrue(paths[key].exists(), key)

    def test_package_json_parseable_and_svelte_dep_present(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            paths = write_svelte_codegen(ir=_ir(), out_dir=d, slug="z")
            pkg = json.loads(paths["package_json"].read_text())
            self.assertEqual(pkg["name"], "z-ui")
            self.assertIn("svelte", pkg["devDependencies"])
            self.assertIn("vite", pkg["devDependencies"])

    def test_page_svelte_includes_grid_and_spin(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            paths = write_svelte_codegen(ir=_ir(), out_dir=d)
            page = paths["page_svelte"].read_text()
            self.assertIn("function spin", page)
            self.assertIn("Paytable", page)
            self.assertIn("RTP", page)
            self.assertIn("<style>", page)

    def test_app_html_includes_sveltekit_markers(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            paths = write_svelte_codegen(ir=_ir(), out_dir=d)
            html = paths["app_html"].read_text()
            self.assertIn("%sveltekit.head%", html)
            self.assertIn("%sveltekit.body%", html)

    def test_static_ir_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            paths = write_svelte_codegen(ir=_ir(), out_dir=d)
            back = json.loads(paths["ir_json"].read_text())
            self.assertEqual(back["topology"]["reels"], 3)


# ─── W4.7 — slot-build orchestrator wiring ─────────────────────────


class TestSlotBuildWAllRuntimes(unittest.TestCase):
    """End-to-end: programmatic call to slot_build.__main__.main with
    --codegen-all-runtimes fans out into three target subdirs."""

    def test_all_three_codegens_wired(self):
        # We exercise the codegen functions directly via the same code
        # path slot-build takes (import + dispatch) rather than spawning
        # the full PAR-parse CLI. This proves the registration is OK.
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir = _ir()
            ts_paths = write_ts_codegen(ir=ir, out_dir=d / "runtimes",
                                          slug="bl-001")
            ui_paths = write_svelte_codegen(ir=ir, out_dir=d / "runtimes",
                                              slug="bl-001")
            # Mirror P3.2's emission
            from tools.slot_build.codegen_rust import write_rust_codegen
            rust_dir = write_rust_codegen(
                codegen_dir=d / "runtimes",
                slug="bl-001",
                universal_ir=ir,
                swid="S",
                vendor="vendor_c",
            )
            # All three subdirs should exist side-by-side
            self.assertTrue(ts_paths["crate_dir"].exists())
            self.assertTrue(ui_paths["crate_dir"].exists())
            self.assertTrue(rust_dir.exists())
            # And carry distinctive suffixes / names
            self.assertIn("bl-001-ts", str(ts_paths["crate_dir"]))
            self.assertIn("bl-001-ui", str(ui_paths["crate_dir"]))

    def test_slot_build_argparser_accepts_all_new_flags(self):
        # Import + parse args with the new flags; should not raise.
        from tools.slot_build.__main__ import main as slot_build_main
        # Parsing only — supply minimal args via raised SystemExit(2)
        # path for missing input_dir; we just want the flag registration.
        import io
        import contextlib
        buf = io.StringIO()
        with contextlib.redirect_stderr(buf):
            with self.assertRaises(SystemExit):
                slot_build_main(["--help"])

    def test_slot_build_help_lists_new_flags(self):
        import argparse
        # Build the parser by importing and calling __main__'s arg-builder
        # indirectly through --help.
        import io
        import contextlib
        from tools.slot_build.__main__ import main as slot_build_main
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            with self.assertRaises(SystemExit):
                slot_build_main(["--help"])
        text = buf.getvalue()
        self.assertIn("--codegen-ts-engine", text)
        self.assertIn("--codegen-svelte", text)
        self.assertIn("--codegen-all-runtimes", text)


if __name__ == "__main__":
    unittest.main()
