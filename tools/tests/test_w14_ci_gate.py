"""W14 — CI Gate Aggregator tests.

Asserts the orchestrator's exit-code contract, gate roster integrity,
gate-skip semantics, and the consolidated report shape on:

  • a clean fresh games dir with no IRs (everything SKIPs cleanly)
  • a small games dir with 1 IR (every gate runs end-to-end)
  • a games dir whose IR drifts from baseline (drift_sentinel WARN/FAIL)
  • a games dir with a malformed IR (gates surface ERRORs/FAILs)
  • CLI exit codes 0 / 1 / 2 enforced
"""
from __future__ import annotations
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.ci_gate import (
    CiGateConfig,
    GateStatus,
    run_ci_gate,
)
from tools.ci_gate.__main__ import main as ci_main


def _universal_ir(pay_high: int = 100) -> dict:
    return {
        "schema_version": 1,
        "meta": {
            "id": "ci-gate-test",
            "vendor": "vendor_c",
            "swid": "CI-001",
            "target_rtp": 0.95,
            "rtp_total": 0.95,
            "name": "CI Gate Test",
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "evaluation": {"paylines": [[1, 1, 1, 1, 1]]},
        "reels": {
            "base": [
                ["high1", "low1", "wild"] * 4,
                ["high1", "low1", "low2"] * 4,
                ["high1", "low2", "wild"] * 4,
                ["high1", "low1", "low2"] * 4,
                ["high1", "low2", "wild"] * 4,
            ],
        },
        "paytable": [
            {"combo": ["high1"] * 5, "pays": pay_high},
            {"combo": ["low1"] * 5, "pays": 20},
        ],
        "features": [{"kind": "free_spins", "config": {}}],
        "limits": {"max_win_x": 5000.0, "min_spin_duration_ms": 2500},
    }


def _write_ir(root: Path, rel: str, ir: dict | None = None) -> Path:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(ir if ir is not None else _universal_ir(),
                            indent=2))
    return p


# ─── ROSTER + SKIPS ────────────────────────────────────────────────


class TestGateRoster(unittest.TestCase):
    def test_default_roster_has_four_gates(self):
        with tempfile.TemporaryDirectory() as d:
            cfg = CiGateConfig(games_root=Path(d))
            report = run_ci_gate(cfg)
            names = [r.name for r in report.results]
            self.assertEqual(
                names,
                ["drift_sentinel", "cert_xml_sanity",
                 "jurisdiction", "cert_matrix"],
            )

    def test_all_flags_off_yields_all_skips(self):
        with tempfile.TemporaryDirectory() as d:
            cfg = CiGateConfig(
                games_root=Path(d),
                run_drift=False, run_cert_xml=False,
                run_jurisdiction=False, run_matrix=False,
            )
            report = run_ci_gate(cfg)
            self.assertTrue(all(r.status == GateStatus.SKIP
                                 for r in report.results))
            self.assertTrue(report.passed)


# ─── EMPTY GAMES ROOT ──────────────────────────────────────────────


class TestEmptyRoot(unittest.TestCase):
    def test_empty_root_passes_cleanly(self):
        """No IRs → cert_xml + jurisdiction SKIP; drift PASS; matrix
        SKIP (no binary or flag off). Overall PASS."""
        with tempfile.TemporaryDirectory() as d:
            cfg = CiGateConfig(games_root=Path(d))
            report = run_ci_gate(cfg)
            self.assertTrue(report.passed,
                            f"results: {[r.to_dict() for r in report.results]}")
            # Reports written
            out_dir = Path(d) / ".ci-gate"
            self.assertTrue((out_dir / "ci-gate.json").exists())
            self.assertTrue((out_dir / "ci-gate.md").exists())


# ─── SINGLE IR — HAPPY PATH ────────────────────────────────────────


class TestSingleIR(unittest.TestCase):
    def test_baselined_ir_passes_drift(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json")
            # First pass: seed baselines
            cfg = CiGateConfig(games_root=root, update_baselines=True)
            r1 = run_ci_gate(cfg)
            drift = next(r for r in r1.results if r.name == "drift_sentinel")
            self.assertEqual(drift.status, GateStatus.PASS)
            # Second pass: no changes
            cfg2 = CiGateConfig(games_root=root)
            r2 = run_ci_gate(cfg2)
            drift2 = next(r for r in r2.results if r.name == "drift_sentinel")
            self.assertEqual(drift2.status, GateStatus.PASS)

    def test_cert_xml_runs_on_discovered_ir(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json")
            cfg = CiGateConfig(games_root=root, update_baselines=True)
            report = run_ci_gate(cfg)
            xml = next(r for r in report.results if r.name == "cert_xml_sanity")
            self.assertEqual(xml.status, GateStatus.PASS)
            self.assertEqual(xml.counts["ok"], 1)
            self.assertEqual(xml.counts["failed"], 0)


# ─── DRIFT DETECTION ───────────────────────────────────────────────


class TestDriftDetection(unittest.TestCase):
    def test_red_drift_fails_aggregator(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json", _universal_ir(pay_high=100))
            run_ci_gate(CiGateConfig(games_root=root,
                                      update_baselines=True))
            # Massive paytable bump → red drift
            _write_ir(root, "g/ir.json", _universal_ir(pay_high=10_000))
            report = run_ci_gate(CiGateConfig(games_root=root))
            drift = next(r for r in report.results
                         if r.name == "drift_sentinel")
            self.assertEqual(drift.status, GateStatus.FAIL)
            self.assertFalse(report.passed)
            self.assertTrue(any("RED drift" in f for f in drift.findings))


# ─── MALFORMED IR ──────────────────────────────────────────────────


class TestMalformedIR(unittest.TestCase):
    def test_malformed_ir_routes_to_error_or_fail(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "bad").mkdir()
            (root / "bad" / "ir.json").write_text("not json")
            report = run_ci_gate(CiGateConfig(games_root=root,
                                                update_baselines=True))
            # Drift sentinel surfaces parse error
            drift = next(r for r in report.results
                         if r.name == "drift_sentinel")
            self.assertEqual(drift.status, GateStatus.ERROR)
            self.assertTrue(report.has_error)


# ─── JURISDICTION LINT ─────────────────────────────────────────────


class TestJurisdictionGate(unittest.TestCase):
    def test_skipped_when_no_profiles_given(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json")
            report = run_ci_gate(CiGateConfig(games_root=root,
                                                update_baselines=True))
            j = next(r for r in report.results if r.name == "jurisdiction")
            self.assertEqual(j.status, GateStatus.SKIP)

    def test_runs_per_profile_per_ir(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json")
            cfg = CiGateConfig(games_root=root, update_baselines=True,
                                jurisdictions=["ukgc", "mga"])
            report = run_ci_gate(cfg)
            j = next(r for r in report.results if r.name == "jurisdiction")
            # 1 IR × 2 profiles → 2 (IR × profile) pairs
            self.assertEqual(j.counts.get("ir_count"), 1)
            self.assertEqual(j.counts.get("profile_count"), 2)
            self.assertIn(j.status,
                           (GateStatus.PASS, GateStatus.WARN, GateStatus.FAIL))


# ─── REPORT SHAPE ──────────────────────────────────────────────────


class TestReportShape(unittest.TestCase):
    def test_manifest_keys(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json")
            run_ci_gate(CiGateConfig(games_root=root,
                                       update_baselines=True))
            mf = json.loads((root / ".ci-gate" / "ci-gate.json").read_text())
            for k in ("config", "results", "counts", "passed",
                      "has_error", "elapsed_total_ms"):
                self.assertIn(k, mf)
            self.assertEqual(len(mf["results"]), 4)

    def test_markdown_contains_summary_and_table(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json")
            run_ci_gate(CiGateConfig(games_root=root,
                                       update_baselines=True))
            md = (root / ".ci-gate" / "ci-gate.md").read_text()
            self.assertIn("# CI Gate Report", md)
            self.assertIn("| gate | status |", md)


# ─── CLI EXIT CODES ────────────────────────────────────────────────


class TestCLI(unittest.TestCase):
    def test_clean_run_exit_zero(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json")
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = ci_main([str(root), "--update-baselines", "--quiet"])
            self.assertEqual(rc, 0)

    def test_red_drift_exit_one(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json", _universal_ir(pay_high=100))
            ci_main([str(root), "--update-baselines", "--quiet"])
            _write_ir(root, "g/ir.json", _universal_ir(pay_high=10_000))
            rc = ci_main([str(root), "--quiet"])
            self.assertEqual(rc, 1)

    def test_malformed_ir_exit_two(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "bad").mkdir()
            (root / "bad" / "ir.json").write_text("nope")
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = ci_main([str(root), "--update-baselines", "--quiet"])
            self.assertEqual(rc, 2)

    def test_default_stdout_table(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json")
            buf = io.StringIO()
            with redirect_stdout(buf):
                ci_main([str(root), "--update-baselines"])
            out = buf.getvalue()
            self.assertIn("[ci-gate]", out)
            self.assertIn("drift_sentinel", out)
            self.assertIn("cert_xml_sanity", out)


if __name__ == "__main__":
    unittest.main()
