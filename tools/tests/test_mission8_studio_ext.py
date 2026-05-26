"""Mission #8 — Studio extension emit tests.

Verifies the three extension components (WebWorker MC + paytable
heatmap + IR editor) emit cleanly into a Studio scaffold root and
produce well-formed HTML/JS payloads.

Run:
    python -m unittest tools.tests.test_mission8_studio_ext
"""
from __future__ import annotations
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.studio_ext import (
    emit_ir_editor,
    emit_mc_worker,
    emit_paytable_heatmap,
    extend_studio,
)
from tools.studio_ext.__main__ import main as cli_main


class TestEmitMcWorker(unittest.TestCase):
    def test_emit_writes_file(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            out = emit_mc_worker(target)
            self.assertTrue(out.is_file())
            self.assertEqual(out.name, "mc_worker.js")

    def test_emit_contains_protocol_markers(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            out = emit_mc_worker(target)
            txt = out.read_text()
            for marker in (
                "self.onmessage",
                "self.postMessage",
                "mulberry32",
                "type: \"progress\"",
                "type: \"done\"",
            ):
                self.assertIn(marker, txt, f"marker {marker!r} missing")


class TestEmitPaytableHeatmap(unittest.TestCase):
    def test_emit_writes_two_files(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            h, j = emit_paytable_heatmap(target)
            self.assertTrue(h.is_file())
            self.assertTrue(j.is_file())
            self.assertEqual(h.name, "paytable_heatmap.html")
            self.assertEqual(j.name, "heatmap.js")

    def test_html_links_js_module(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            h, _ = emit_paytable_heatmap(target)
            self.assertIn("heatmap.js", h.read_text())

    def test_js_has_render_loop(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            _, j = emit_paytable_heatmap(target)
            txt = j.read_text()
            for marker in ("buildMatrix", "render", "bernoulliPerCell"):
                self.assertIn(marker, txt)


class TestEmitIrEditor(unittest.TestCase):
    def test_emit_writes_two_files(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            h, j = emit_ir_editor(target)
            self.assertTrue(h.is_file())
            self.assertTrue(j.is_file())
            self.assertEqual(h.name, "ir_editor.html")
            self.assertEqual(j.name, "ir_editor.js")

    def test_js_has_closed_form_solver(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            _, j = emit_ir_editor(target)
            txt = j.read_text()
            for marker in ("closedFormLineRTP", "bernoulli", "summarize"):
                self.assertIn(marker, txt)

    def test_html_has_two_pane_layout(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            h, _ = emit_ir_editor(target)
            txt = h.read_text()
            self.assertIn("ir-input", txt)
            self.assertIn("editor-grid", txt)


class TestExtendStudio(unittest.TestCase):
    def test_all_components_emitted(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            out = extend_studio(target)
            self.assertIn("mc", out)
            self.assertIn("heatmap", out)
            self.assertIn("editor", out)

    def test_subset_components(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            out = extend_studio(target, components=("mc",))
            self.assertEqual(set(out.keys()), {"mc"})
            self.assertFalse((target / "ir_editor.html").exists())
            self.assertFalse((target / "paytable_heatmap.html").exists())

    def test_creates_nonexistent_root(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / "new-studio"
            extend_studio(target)
            self.assertTrue(target.is_dir())


class TestCli(unittest.TestCase):
    def test_cli_emits_all_components(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            (target / "index.html").write_text("<html/>")
            rc = cli_main([str(target), "--quiet"])
            self.assertEqual(rc, 0)
            self.assertTrue((target / "mc_worker.js").is_file())
            self.assertTrue((target / "paytable_heatmap.html").is_file())
            self.assertTrue((target / "ir_editor.html").is_file())

    def test_cli_errors_on_missing_dir(self):
        rc = cli_main(["/nonexistent/path", "--quiet"])
        self.assertEqual(rc, 2)

    def test_cli_unknown_component(self):
        with tempfile.TemporaryDirectory() as td:
            rc = cli_main([td, "--components", "bogus", "--quiet"])
            self.assertEqual(rc, 2)

    def test_cli_subset_components(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            (target / "index.html").write_text("<html/>")
            rc = cli_main([str(target),
                            "--components", "mc,heatmap", "--quiet"])
            self.assertEqual(rc, 0)
            self.assertTrue((target / "mc_worker.js").is_file())
            self.assertFalse((target / "ir_editor.html").is_file())


if __name__ == "__main__":
    unittest.main()
