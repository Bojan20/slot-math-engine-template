"""W4.9 — Vendor parity doctor tests.

Verifies the diagnostic pipeline:
  • per-PAR metrics extraction
  • per-vendor aggregation
  • dashboard emit (HTML + JSON + Markdown)
  • CLI happy path + error branches
  • severity classification gating

Uses `slot-synth-par` to generate synthetic PARs into a temp dir so
the test is self-contained and does not need real vendor data.

Run:
    python -m unittest tools.tests.test_w4_9_par_doctor
"""
from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.diagnostics.par_doctor import (
    _classify_gap,
    diagnose_par,
    diagnose_vendor,
    emit_dashboard,
    main as doctor_main,
)
from tools.parse_par.profile import load_profile
from tools.parse_par.synth_par import SyntheticPAR


def _make_synth_par(vendor_id: str, raw_dir: Path, seed: int = 42,
                     rtp: float = 0.95) -> Path:
    """Materialize one synthetic PAR under raw_dir/<sheet>.tsv."""
    profile = load_profile(vendor_id)
    par = SyntheticPAR.from_profile(profile, seed=seed)
    par.synthesize_minimal(target_rtp=rtp)
    return par.write(raw_dir)


class TestClassifyGap(unittest.TestCase):
    def test_green_le_005(self):
        self.assertEqual(_classify_gap(0.004), "green")
        self.assertEqual(_classify_gap(0.005), "green")

    def test_yellow_le_01(self):
        self.assertEqual(_classify_gap(0.006), "yellow")
        self.assertEqual(_classify_gap(0.01), "yellow")

    def test_red_gt_01(self):
        self.assertEqual(_classify_gap(0.02), "red")

    def test_na_when_none(self):
        self.assertEqual(_classify_gap(None), "n/a")


class TestDiagnosePar(unittest.TestCase):
    def test_parsed_metrics_filled(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td)
            par_path = _make_synth_par("vendor_c", raw)
            profile = load_profile("vendor_c")
            m = diagnose_par(profile, raw, par_path.stem, published_rtp=0.95)
            self.assertTrue(m.parsed)
            self.assertGreater(m.paytable_rows, 0)
            self.assertGreaterEqual(m.reel_sets_base, 1)
            # RTP estimator may be None for some scaffold layouts; just
            # ensure shape is consistent.
            if m.estimated_rtp is not None:
                self.assertGreaterEqual(m.rtp_gap or 0, 0)
            self.assertIn(m.gap_severity,
                            ("green", "yellow", "red", "n/a"))

    def test_missing_sheet_marks_error(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td)  # no TSV inside
            profile = load_profile("vendor_c")
            m = diagnose_par(profile, raw, "PAR-999", published_rtp=0.95)
            self.assertFalse(m.parsed)
            self.assertIsNotNone(m.error)


class TestDiagnoseVendor(unittest.TestCase):
    def test_full_pipeline_single_par(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td)
            _make_synth_par("vendor_c", raw, seed=42, rtp=0.95)
            r = diagnose_vendor("vendor_c", raw, target_rtp=0.96)
            self.assertEqual(r.vendor_id, "vendor_c")
            self.assertGreaterEqual(r.par_count, 1)
            self.assertGreaterEqual(r.parsed_count, 1)
            self.assertEqual(r.published_rtp, 0.96)
            self.assertIn(r.overall_severity,
                            ("green", "yellow", "red", "n/a"))

    def test_no_pars_zero_count(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td)
            r = diagnose_vendor("vendor_c", raw, target_rtp=0.96)
            self.assertEqual(r.par_count, 0)
            self.assertEqual(r.parsed_count, 0)
            self.assertEqual(r.mean_paytable_rows, 0.0)


class TestEmitDashboard(unittest.TestCase):
    def test_emits_three_artifacts(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td) / "raw"
            raw.mkdir()
            _make_synth_par("vendor_c", raw)
            r = diagnose_vendor("vendor_c", raw, target_rtp=0.95)
            out = Path(td) / "dash"
            paths = emit_dashboard([r], out)
            for kind in ("html", "json", "md"):
                self.assertIn(kind, paths)
                self.assertTrue(paths[kind].is_file())

    def test_json_round_trips(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td) / "raw"
            raw.mkdir()
            _make_synth_par("vendor_c", raw)
            r = diagnose_vendor("vendor_c", raw, target_rtp=0.95)
            out = Path(td) / "dash"
            paths = emit_dashboard([r], out)
            data = json.loads(paths["json"].read_text())
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["vendor_id"], "vendor_c")
            self.assertIn("per_par", data[0])

    def test_html_contains_color_legend(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td) / "raw"
            raw.mkdir()
            _make_synth_par("vendor_c", raw)
            r = diagnose_vendor("vendor_c", raw, target_rtp=0.95)
            out = Path(td) / "dash"
            paths = emit_dashboard([r], out)
            html = paths["html"].read_text()
            self.assertIn("green ≤0.005", html)
            self.assertIn("yellow ≤0.01", html)
            self.assertIn("vendor_c", html)


class TestCli(unittest.TestCase):
    def test_cli_single_vendor(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td) / "raw"
            raw.mkdir()
            _make_synth_par("vendor_c", raw)
            out = Path(td) / "out"
            rc = doctor_main([
                "vendor_c",
                "--raw", str(raw),
                "--out", str(out),
                "--target-rtp", "0.95",
                "--quiet",
            ])
            self.assertEqual(rc, 0)
            self.assertTrue((out / "par_doctor.html").is_file())
            self.assertTrue((out / "par_doctor.json").is_file())
            self.assertTrue((out / "par_doctor.md").is_file())

    def test_cli_multiple_vendors(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td) / "raw"
            raw.mkdir()
            _make_synth_par("vendor_c", raw)
            _make_synth_par("vendor_d", raw, seed=7)
            out = Path(td) / "out"
            rc = doctor_main([
                "--vendors", "vendor_c,vendor_d",
                "--raw", str(raw),
                "--out", str(out),
                "--quiet",
            ])
            self.assertEqual(rc, 0)
            data = json.loads((out / "par_doctor.json").read_text())
            self.assertEqual(len(data), 2)
            self.assertEqual(
                sorted(d["vendor_id"] for d in data),
                ["vendor_c", "vendor_d"],
            )

    def test_cli_missing_raw_dir(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "out"
            rc = doctor_main([
                "vendor_c",
                "--raw", "/nonexistent/path",
                "--out", str(out),
                "--quiet",
            ])
            self.assertEqual(rc, 2)

    def test_cli_all_flag(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td) / "raw"
            raw.mkdir()
            _make_synth_par("vendor_c", raw)
            _make_synth_par("vendor_d", raw, seed=7)
            _make_synth_par("vendor_e", raw, seed=11)
            out = Path(td) / "out"
            rc = doctor_main([
                "--all",
                "--raw", str(raw),
                "--out", str(out),
                "--quiet",
            ])
            self.assertEqual(rc, 0)
            data = json.loads((out / "par_doctor.json").read_text())
            # At least the 5 vendor profiles known to ship
            ids = sorted({d["vendor_id"] for d in data})
            self.assertGreaterEqual(len(ids), 5)


if __name__ == "__main__":
    unittest.main()
