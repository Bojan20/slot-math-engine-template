"""Mission #8 batch 2 — additional Studio extension emit tests.

Verifies the three batch-2 components (live RTP gauge + vendor
switcher + reel strip visualizer) emit cleanly and the aggregate
`extend_studio` driver covers all 6 components.

Run:
    python -m unittest tools.tests.test_mission8_studio_ext_batch2
"""
from __future__ import annotations
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.studio_ext import (
    EXT_COMPONENTS,
    emit_reel_viz,
    emit_rtp_gauge,
    emit_vendor_switcher,
    extend_studio,
)


class TestEmitRtpGauge(unittest.TestCase):
    def test_emit_writes_two_files(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            h, j = emit_rtp_gauge(target)
            self.assertTrue(h.is_file())
            self.assertTrue(j.is_file())
            self.assertEqual(h.name, "rtp_gauge.html")
            self.assertEqual(j.name, "rtp_gauge.js")

    def test_js_wires_worker_and_sparkline(self):
        with tempfile.TemporaryDirectory() as td:
            _, j = emit_rtp_gauge(Path(td))
            txt = j.read_text()
            for marker in ("new Worker(", "mc_worker.js",
                            "paintSparkline", "btn-start", "btn-stop"):
                self.assertIn(marker, txt)


class TestEmitVendorSwitcher(unittest.TestCase):
    def test_emit_writes_two_files(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            h, j = emit_vendor_switcher(target)
            self.assertTrue(h.is_file())
            self.assertTrue(j.is_file())

    def test_html_has_two_panes(self):
        with tempfile.TemporaryDirectory() as td:
            h, _ = emit_vendor_switcher(Path(td))
            txt = h.read_text()
            self.assertIn("sel-a", txt)
            self.assertIn("sel-b", txt)
            self.assertIn("diff", txt)

    def test_js_has_diff_logic(self):
        with tempfile.TemporaryDirectory() as td:
            _, j = emit_vendor_switcher(Path(td))
            txt = j.read_text()
            for marker in ("discoverManifest", "renderDiff", "summarize",
                            "manifest.json"):
                self.assertIn(marker, txt)


class TestEmitReelViz(unittest.TestCase):
    def test_emit_writes_two_files(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            h, j = emit_reel_viz(target)
            self.assertTrue(h.is_file())
            self.assertTrue(j.is_file())

    def test_js_renders_bar_chart(self):
        with tempfile.TemporaryDirectory() as td:
            _, j = emit_reel_viz(Path(td))
            txt = j.read_text()
            for marker in ("reelHist", "renderReel", "bar-row"):
                self.assertIn(marker, txt)


class TestExtendStudioFull(unittest.TestCase):
    def test_all_six_components_emitted(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            out = extend_studio(target)
            for comp in ("mc", "heatmap", "editor",
                          "gauge", "switcher", "reelviz"):
                self.assertIn(comp, out, f"missing {comp}")
            # Verify all 11 emitted files exist
            for f in (
                "mc_worker.js",
                "paytable_heatmap.html", "heatmap.js",
                "ir_editor.html", "ir_editor.js",
                "rtp_gauge.html", "rtp_gauge.js",
                "vendor_switcher.html", "vendor_switcher.js",
                "reel_viz.html", "reel_viz.js",
            ):
                self.assertTrue((target / f).is_file(), f)

    def test_ext_components_list_has_six(self):
        self.assertEqual(set(EXT_COMPONENTS),
                          {"mc", "heatmap", "editor",
                           "gauge", "switcher", "reelviz"})

    def test_subset_batch2(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            out = extend_studio(target, components=("gauge", "reelviz"))
            self.assertEqual(set(out.keys()), {"gauge", "reelviz"})
            self.assertFalse((target / "ir_editor.html").exists())
            self.assertFalse((target / "vendor_switcher.html").exists())


if __name__ == "__main__":
    unittest.main()
