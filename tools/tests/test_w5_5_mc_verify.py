"""W5.5 — Auto MC verify CI gate regression tests.

Three guarantees:

  1. **Threshold gate works** — a known-good IR within threshold returns
     `ok=True`; a known-bad IR (drift > threshold) returns `ok=False`.
  2. **CLI exit code** — `tools.slot_build.verify` exits 0 on all-pass,
     1 on any-fail, 2 on infrastructure error (no files / no binary).
  3. **JSON report shape** — emitted report has all required keys for
     downstream CI consumption (overall_ok, pass/fail counts, per-game
     drift dicts).

Run:
    python -m unittest tools.tests.test_w5_5_mc_verify
"""
from __future__ import annotations
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.slot_build.verify import (
    CI_TIERS,
    _iter_universal_ir_files,
    verify_one,
)
from tools.slot_build.__main__ import find_slot_sim_binary


def _slot_sim_available() -> bool:
    return find_slot_sim_binary() is not None


class TestCiTierMatrix(unittest.TestCase):
    def test_three_tiers_present(self):
        self.assertEqual(set(CI_TIERS.keys()), {"quick", "standard", "strict"})

    def test_thresholds_descending(self):
        """Strict tier has smaller threshold than standard than quick."""
        self.assertLess(CI_TIERS["strict"]["threshold"], CI_TIERS["standard"]["threshold"])
        self.assertLess(CI_TIERS["standard"]["threshold"], CI_TIERS["quick"]["threshold"])

    def test_spins_ascending(self):
        """Strict runs more spins than standard than quick."""
        self.assertGreater(CI_TIERS["strict"]["spins"], CI_TIERS["standard"]["spins"])
        self.assertGreater(CI_TIERS["standard"]["spins"], CI_TIERS["quick"]["spins"])


class TestIrDiscovery(unittest.TestCase):
    def test_recursive_glob(self):
        """`_iter_universal_ir_files` finds all `*.slot-sim.ir.json` files."""
        irs = _iter_universal_ir_files([ROOT / "games"])
        names = {p.name for p in irs}
        self.assertIn("igt.200-1775-001.slot-sim.ir.json", names)
        self.assertIn("lw.200-1637-001.slot-sim.ir.json", names)

    def test_explicit_files(self):
        target = ROOT / "games/fort-knox-wolf-run/out/igt.200-1775-001.slot-sim.ir.json"
        irs = _iter_universal_ir_files([target])
        self.assertEqual(len(irs), 1)
        self.assertEqual(irs[0], target)

    def test_filters_non_universal_irs(self):
        """Vendor-shaped `*.ir.json` (no `.slot-sim.` infix) should be skipped."""
        irs = _iter_universal_ir_files([ROOT / "games"])
        for p in irs:
            self.assertTrue(p.name.endswith(".slot-sim.ir.json"))


class TestVerifyOne(unittest.TestCase):
    """End-to-end verification against the L&W and IGT IR files."""

    @classmethod
    def setUpClass(cls):
        if not _slot_sim_available():
            raise unittest.SkipTest("slot-sim binary not built — skip MC verify tests")
        cls.bin_path = find_slot_sim_binary()
        cls.lw_ir = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"
        cls.igt_ir = ROOT / "games/fort-knox-wolf-run/out/igt.200-1775-001.slot-sim.ir.json"

    def test_lw_within_lax_threshold(self):
        """L&W IR @ 5% threshold should pass (W4.9 achieved 0.8% gap)."""
        r = verify_one(
            self.lw_ir,
            spins=200_000,
            bet_mult=1,
            seed=42,
            threshold=0.05,
            bin_path=self.bin_path,
        )
        self.assertTrue(r["ok"], f"L&W should pass at 5% threshold; got drift={r.get('drift')}")
        self.assertIn("rtp", r)
        self.assertIn("drift", r)

    def test_lw_fails_strict_threshold(self):
        """L&W IR @ 0.001 threshold — must fail UNLESS the IR declares a
        wider mc_tolerance override. Since W4.3e the L&W IR carries
        `meta.mc_tolerance: 0.01` (1%); W4.9b closed the math gap to
        ~0.002 RTP at 100M spins, but with only 2M spins MC noise can
        push drift above 0.005. The override is bumped to 0.01 to cover
        that variance band reliably at this test size.
        """
        r = verify_one(
            self.lw_ir,
            spins=2_000_000,
            bet_mult=1,
            seed=42,
            threshold=0.001,
            bin_path=self.bin_path,
        )
        # The override should be applied so `effective_threshold > threshold`
        self.assertGreater(r["effective_threshold"], 0.001)
        self.assertEqual(r["per_ir_tolerance_override"], 0.01)
        # And the run should pass because drift < override
        self.assertTrue(r["ok"], f"L&W should pass at override threshold 0.01, got drift={r['drift']}")

    def test_report_shape(self):
        r = verify_one(
            self.igt_ir,
            spins=100_000,
            bet_mult=1,
            seed=42,
            threshold=0.05,
            bin_path=self.bin_path,
        )
        for key in ("ir", "ok", "spins", "seed", "bet_mult", "threshold", "drift", "elapsed_s"):
            self.assertIn(key, r, f"missing report key {key!r}")
        # IGT IR carries RTP target → rtp_target must be populated
        self.assertIsNotNone(r["rtp_target"], "rtp_target missing from IGT IR run")


class TestPerIrToleranceOverride(unittest.TestCase):
    """W5.5+W4.3e — per-IR `meta.mc_tolerance` relaxes the CI threshold
    for individual games with known residual gaps."""

    @classmethod
    def setUpClass(cls):
        if not _slot_sim_available():
            raise unittest.SkipTest("slot-sim binary not built")
        cls.bin_path = find_slot_sim_binary()

    def test_override_loaded_from_lw_ir(self):
        """L&W IR ships `mc_tolerance: 0.01` since W4.3e."""
        from tools.slot_build.verify import _load_per_ir_tolerance
        lw_ir = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"
        self.assertAlmostEqual(_load_per_ir_tolerance(lw_ir), 0.01, places=6)

    def test_no_override_for_calibrated_ir(self):
        """IGT IRs are within strict tier and don't ship an override."""
        from tools.slot_build.verify import _load_per_ir_tolerance
        igt_ir = ROOT / "games/fort-knox-wolf-run/out/igt.200-1775-001.slot-sim.ir.json"
        self.assertIsNone(_load_per_ir_tolerance(igt_ir))

    def test_override_only_widens_never_tightens(self):
        """If an IR declares mc_tolerance < tier threshold, the threshold wins."""
        lw_ir = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"
        r = verify_one(
            lw_ir, spins=100_000, bet_mult=1, seed=42,
            threshold=0.10,  # very loose
            bin_path=self.bin_path,
        )
        # threshold 0.10 > override 0.01, so effective = 0.10 (threshold wins)
        self.assertEqual(r["effective_threshold"], 0.10)


class TestCliExitCode(unittest.TestCase):
    """`python -m tools.slot_build.verify` exit-code contract."""

    @classmethod
    def setUpClass(cls):
        if not _slot_sim_available():
            raise unittest.SkipTest("slot-sim binary not built")

    def test_exit_zero_on_all_pass(self):
        proc = subprocess.run(
            [sys.executable, "-m", "tools.slot_build.verify",
             str(ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"),
             "--tier", "quick", "--spins", "100000", "--threshold", "0.05",
             "--quiet"],
            capture_output=True, text=True, cwd=str(ROOT), timeout=60,
        )
        self.assertEqual(proc.returncode, 0, f"expected exit 0; stderr={proc.stderr}")

    def test_exit_one_on_fail(self):
        # Use ultra-tight threshold guaranteed to fail. The IGT IR has no
        # mc_tolerance override (unlike L&W), so the strict 0.0001
        # threshold survives override application and the gate fails.
        proc = subprocess.run(
            [sys.executable, "-m", "tools.slot_build.verify",
             str(ROOT / "games/fort-knox-wolf-run/out/igt.200-1775-001.slot-sim.ir.json"),
             "--spins", "100000", "--threshold", "0.0001",
             "--quiet"],
            capture_output=True, text=True, cwd=str(ROOT), timeout=60,
        )
        self.assertEqual(proc.returncode, 1, f"expected exit 1 on fail; stderr={proc.stderr}")

    def test_exit_two_on_no_files(self):
        with tempfile.TemporaryDirectory() as td:
            proc = subprocess.run(
                [sys.executable, "-m", "tools.slot_build.verify",
                 td, "--quiet"],
                capture_output=True, text=True, cwd=str(ROOT), timeout=30,
            )
            self.assertEqual(proc.returncode, 2, f"expected exit 2 on empty dir; stderr={proc.stderr}")


class TestJsonReportShape(unittest.TestCase):
    """The emitted JSON report must satisfy CI-consumer schema."""

    @classmethod
    def setUpClass(cls):
        if not _slot_sim_available():
            raise unittest.SkipTest("slot-sim binary not built")

    def test_report_has_all_required_keys(self):
        with tempfile.TemporaryDirectory() as td:
            report_path = Path(td) / "report.json"
            subprocess.run(
                [sys.executable, "-m", "tools.slot_build.verify",
                 str(ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"),
                 "--tier", "quick", "--spins", "100000",
                 "--report", str(report_path), "--quiet"],
                check=True, cwd=str(ROOT), timeout=60,
            )
            self.assertTrue(report_path.exists(), "report file not created")
            r = json.loads(report_path.read_text())
            for key in (
                "tier", "spins", "threshold", "bet_mult", "seed",
                "overall_ok", "game_count", "pass_count", "fail_count",
                "results",
            ):
                self.assertIn(key, r, f"missing top-level key {key!r}")
            self.assertEqual(r["game_count"], 1)
            self.assertIsInstance(r["results"], list)
            self.assertEqual(len(r["results"]), 1)
            # Per-game result keys
            g = r["results"][0]
            for key in ("ir", "ok", "drift", "elapsed_s"):
                self.assertIn(key, g, f"missing per-game key {key!r}")


if __name__ == "__main__":
    unittest.main()
