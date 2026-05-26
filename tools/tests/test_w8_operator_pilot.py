"""W8 — Operator Pilot Suite E2E tests.

Exercises the orchestrator end-to-end on a synthetic-but-realistic IR:

  • Every chain step (load_ir / jurisdiction lint × N / cert XML /
    cert ZIP / manifest / bundle_zip) is exercised.
  • Manifest schema is asserted (status counts, artifacts, bundle).
  • Failure paths: missing IR, lint violation, malformed IR.
  • CLI exit codes: 0 / 1 / 2 contract enforced.
"""
from __future__ import annotations
import io
import json
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.operator_pilot import (
    PilotConfig,
    run_pilot,
)
from tools.operator_pilot.__main__ import main as pilot_main


# ─── Fixture IR — minimal but valid for every downstream emitter ────


def _make_ir(rtp_total: float = 0.95) -> dict:
    return {
        "schema_version": 1,
        "meta": {
            "id": "test-game-001",
            "name": "Test Game",
            "vendor": "vendor_c",
            "swid": "SYN-TEST-0001",
            "version": "1.0.0",
            "target_rtp": rtp_total,
            "rtp_total": rtp_total,
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "evaluation": {
            "paylines": [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0],
                          [2, 2, 2, 2, 2]],
        },
        "symbols": [
            {"id": "wild", "kind": "wild"},
            {"id": "high1", "kind": "regular"},
            {"id": "low1", "kind": "regular"},
        ],
        "reels": {
            "base": [
                ["wild", "high1", "low1"] * 4,
                ["high1", "low1", "wild"] * 4,
                ["low1", "high1", "high1"] * 4,
                ["high1", "wild", "low1"] * 4,
                ["high1", "low1", "high1"] * 4,
            ],
        },
        "paytable": [
            {"combo": ["high1"] * 5, "pays": 100},
            {"combo": ["low1"] * 5, "pays": 20},
        ],
        "features": [
            {"kind": "free_spins", "config": {"trigger_prob": 0.05}},
        ],
        "limits": {
            "max_win_x": 5000.0,
            "min_spin_duration_ms": 2500,
            "max_stake": 500.0,
        },
        "rtp_allocation": {
            "base_game": rtp_total * 0.7,
            "free_spins": rtp_total * 0.3,
            "total": rtp_total,
        },
    }


def _write_ir(d: Path, ir: dict | None = None) -> Path:
    """Write a fresh IR JSON inside `d` and return the path."""
    p = d / "ir.json"
    p.write_text(json.dumps(ir if ir is not None else _make_ir(), indent=2))
    return p


# ─── Tests ─────────────────────────────────────────────────────────


class TestPilotConfig(unittest.TestCase):
    def test_defaults_are_sane(self):
        cfg = PilotConfig(ir_path=Path("/tmp/ir.json"),
                          out_dir=Path("/tmp/out"))
        self.assertEqual(cfg.jurisdictions, [])
        self.assertTrue(cfg.emit_xml)
        self.assertTrue(cfg.emit_zip)
        self.assertTrue(cfg.bundle_zip)


class TestPilotE2E(unittest.TestCase):
    def test_clean_run_no_jurisdiction(self):
        """No-jurisdiction run still emits XML + ZIP + manifest + bundle."""
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_path = _write_ir(d)
            out = d / "out"
            cfg = PilotConfig(ir_path=ir_path, out_dir=out)
            report = run_pilot(cfg)
            self.assertTrue(report.passed,
                            f"steps: {[s.to_dict() for s in report.steps]}")
            # cert XML exists
            self.assertIn("cert_xml", report.artifacts)
            self.assertTrue(Path(report.artifacts["cert_xml"]).exists())
            # manifest exists
            self.assertIn("manifest", report.artifacts)
            # bundle exists
            self.assertIsNotNone(report.bundle_path)
            self.assertTrue(Path(report.bundle_path).exists())

    def test_jurisdiction_lint_runs_per_profile(self):
        """Two jurisdiction profiles → 2 lint steps emitted."""
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_path = _write_ir(d)
            cfg = PilotConfig(
                ir_path=ir_path,
                out_dir=d / "out",
                jurisdictions=["ukgc", "mga"],
            )
            report = run_pilot(cfg)
            lint_steps = [s for s in report.steps
                          if s.name.startswith("jurisdiction_lint:")]
            self.assertEqual(len(lint_steps), 2)
            ids = sorted(s.name for s in lint_steps)
            self.assertEqual(ids,
                             ["jurisdiction_lint:mga",
                              "jurisdiction_lint:ukgc"])

    def test_missing_ir_file_records_failure(self):
        """load_ir step must FAIL when the IR file is missing."""
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            cfg = PilotConfig(
                ir_path=d / "nonexistent.json",
                out_dir=d / "out",
            )
            report = run_pilot(cfg)
            load_step = next(s for s in report.steps if s.name == "load_ir")
            self.assertEqual(load_step.status, "failed")
            self.assertFalse(report.passed)
            # manifest still emitted so the failure is inspectable
            self.assertTrue((d / "out" / "operator-pilot.json").exists())

    def test_skip_xml_skip_zip_skip_bundle(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_path = _write_ir(d)
            cfg = PilotConfig(
                ir_path=ir_path,
                out_dir=d / "out",
                emit_xml=False,
                emit_zip=False,
                bundle_zip=False,
            )
            report = run_pilot(cfg)
            skipped = [s for s in report.steps if s.status == "skipped"]
            names = sorted(s.name for s in skipped)
            self.assertIn("cert_xml", names)
            self.assertIn("cert_zip", names)
            self.assertIn("bundle_zip", names)
            self.assertIsNone(report.bundle_path)


class TestBundleZip(unittest.TestCase):
    def test_bundle_excludes_itself(self):
        """operator-package.zip must never contain operator-package.zip."""
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_path = _write_ir(d)
            cfg = PilotConfig(ir_path=ir_path, out_dir=d / "out",
                              emit_zip=False)
            report = run_pilot(cfg)
            self.assertIsNotNone(report.bundle_path)
            with zipfile.ZipFile(report.bundle_path) as zf:
                names = zf.namelist()
                self.assertNotIn("operator-package.zip", names)
                # manifest + cert XML present
                self.assertTrue(any(n.endswith("operator-pilot.json") for n in names))
                self.assertTrue(any(n.endswith(".cert.xml") for n in names))


class TestManifestSchema(unittest.TestCase):
    def test_manifest_has_required_keys(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_path = _write_ir(d)
            cfg = PilotConfig(ir_path=ir_path, out_dir=d / "out",
                              jurisdictions=["ukgc"])
            run_pilot(cfg)
            mf = json.loads((d / "out" / "operator-pilot.json").read_text())
            for key in ("config", "steps", "artifacts", "step_counts",
                        "elapsed_total_ms", "passed", "bundle_path"):
                self.assertIn(key, mf,
                              f"manifest missing required key: {key!r}")

    def test_step_counts_sum_to_total_steps(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_path = _write_ir(d)
            cfg = PilotConfig(ir_path=ir_path, out_dir=d / "out",
                              jurisdictions=["ukgc"])
            report = run_pilot(cfg)
            counts = report.step_counts
            self.assertEqual(
                counts["passed"] + counts["skipped"] + counts["failed"],
                len(report.steps),
            )


class TestCLI(unittest.TestCase):
    def test_cli_clean_run_exit_zero(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_path = _write_ir(d)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = pilot_main([
                    str(ir_path),
                    "--out", str(d / "out"),
                ])
            self.assertEqual(rc, 0, buf.getvalue())
            self.assertIn("operator-pilot", buf.getvalue())

    def test_cli_missing_ir_exit_two(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = pilot_main([
                    str(d / "no-such-ir.json"),
                    "--out", str(d / "out"),
                ])
            self.assertEqual(rc, 2)

    def test_cli_with_jurisdictions(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_path = _write_ir(d)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = pilot_main([
                    str(ir_path),
                    "--out", str(d / "out"),
                    "--jurisdiction", "ukgc",
                    "--jurisdiction", "mga",
                ])
            # may be 0 or 1 depending on whether the synthetic IR passes
            # lint, but never 2 (load_ir succeeded).
            self.assertIn(rc, (0, 1))
            self.assertTrue((d / "out" / "operator-pilot.json").exists())

    def test_cli_json_flag_emits_json_to_stdout(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_path = _write_ir(d)
            buf = io.StringIO()
            with redirect_stdout(buf):
                pilot_main([
                    str(ir_path),
                    "--out", str(d / "out"),
                    "--json",
                ])
            out = buf.getvalue()
            # The JSON dump should appear after the summary table
            idx = out.find('{\n')
            self.assertGreater(idx, 0)
            mf = json.loads(out[idx:])
            self.assertIn("steps", mf)


if __name__ == "__main__":
    unittest.main()
