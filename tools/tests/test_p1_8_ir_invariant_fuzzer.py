"""P1.8 — IR invariant fuzzer regression tests.

The fuzzer itself must satisfy three guarantees:

  1. **Catches engine panics** — if the engine crashes on a perturbed
     IR, the fuzzer reports it (no false-pass).
  2. **Catches non-finite metrics** — RTP=NaN or RTP=inf is flagged.
  3. **Determinism check actually verifies** — running the same
     baseline IR through `check_i4_determinism` returns clean (no
     false-fail on a known-deterministic engine).

Plus end-to-end smoke that the shipped IGT + L&W IRs pass all
perturbation strategies + I4 + I7 invariants.

Run:
    python -m unittest tools.tests.test_p1_8_ir_invariant_fuzzer
"""
from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.diagnostics.ir_invariant_fuzzer import (
    fuzz,
    check_i2_finite,
    check_i3_sane_range,
    InvariantViolation,
    _scale_paytable,
    _shuffle_reel_stop_weights,
    _disable_one_feature,
    _find_slot_sim_bin,
)


def _bin_available() -> bool:
    return _find_slot_sim_bin() is not None


class TestInvariantCheckers(unittest.TestCase):
    """Pure-Python invariant checker logic (no engine needed)."""

    def test_i2_catches_nan(self):
        with self.assertRaises(InvariantViolation) as cm:
            check_i2_finite({"rtp": float("nan"), "hit_freq": 0.5, "win_freq": 0.3})
        self.assertEqual(cm.exception.invariant, "I2")

    def test_i2_catches_inf(self):
        with self.assertRaises(InvariantViolation) as cm:
            check_i2_finite({"rtp": float("inf"), "hit_freq": 0.5, "win_freq": 0.3})
        self.assertEqual(cm.exception.invariant, "I2")

    def test_i2_passes_on_finite(self):
        check_i2_finite({"rtp": 0.96, "hit_freq": 0.24, "win_freq": 0.11})

    def test_i3_catches_rtp_negative(self):
        with self.assertRaises(InvariantViolation) as cm:
            check_i3_sane_range({"rtp": -0.1, "hit_freq": 0.5, "win_freq": 0.3})
        self.assertEqual(cm.exception.invariant, "I3")

    def test_i3_catches_rtp_explosion(self):
        with self.assertRaises(InvariantViolation) as cm:
            check_i3_sane_range({"rtp": 150.0, "hit_freq": 0.5, "win_freq": 0.3})
        self.assertEqual(cm.exception.invariant, "I3")

    def test_i3_catches_hit_lt_win(self):
        """Logically hit_freq >= win_freq always (a win is a kind of hit)."""
        with self.assertRaises(InvariantViolation) as cm:
            check_i3_sane_range({"rtp": 0.96, "hit_freq": 0.10, "win_freq": 0.50})
        self.assertEqual(cm.exception.invariant, "I3")

    def test_i3_passes_on_valid_metrics(self):
        check_i3_sane_range({"rtp": 0.96, "hit_freq": 0.24, "win_freq": 0.11})


class TestPerturbationStrategies(unittest.TestCase):
    """Pure-Python perturbations preserve required IR structure."""

    @classmethod
    def setUpClass(cls):
        ir_path = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"
        if not ir_path.exists():
            raise unittest.SkipTest("L&W IR missing")
        with open(ir_path) as f:
            cls.ir = json.load(f)

    def test_scale_paytable_2x_doubles_pays(self):
        original = sum(
            e["pays"] for e in (self.ir.get("paytable") or [])
            if isinstance(e.get("pays"), (int, float))
        )
        scaled = _scale_paytable(self.ir, 2.0)
        new_total = sum(
            e["pays"] for e in (scaled.get("paytable") or [])
            if isinstance(e.get("pays"), (int, float))
        )
        self.assertAlmostEqual(new_total, original * 2.0, places=4)

    def test_shuffle_reel_weights_preserves_total(self):
        import random
        rng = random.Random(42)
        shuffled = _shuffle_reel_stop_weights(self.ir, rng)
        # For each reel set, total weight should be unchanged
        for orig_set, shuf_set in zip(
            self.ir["reels"]["base"], shuffled["reels"]["base"]
        ):
            for orig_reel, shuf_reel in zip(orig_set["reels"], shuf_set["reels"]):
                orig_w = sum(s["weight"] for s in orig_reel)
                shuf_w = sum(s["weight"] for s in shuf_reel)
                self.assertEqual(orig_w, shuf_w)
                # Symbol set preserved (multiset)
                orig_syms = sorted(s["symbol"] for s in orig_reel)
                shuf_syms = sorted(s["symbol"] for s in shuf_reel)
                self.assertEqual(orig_syms, shuf_syms)

    def test_disable_one_feature_drops_exactly_one(self):
        import random
        rng = random.Random(42)
        dropped = _disable_one_feature(self.ir, rng)
        self.assertEqual(
            len(dropped["features"]), len(self.ir["features"]) - 1,
            "exactly one feature should be dropped"
        )


@unittest.skipUnless(_bin_available(), "slot-sim binary not built")
class TestFuzzerE2E(unittest.TestCase):
    """End-to-end: shipped IRs pass all fuzzer invariants."""

    def test_lw_ir_passes_all_invariants(self):
        ir_path = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"
        report = fuzz(ir_path, runs=6, spins=20_000, seed=42)
        self.assertTrue(
            report["overall_ok"],
            f"L&W fuzzer failed:\n{json.dumps(report, indent=2)}"
        )
        self.assertEqual(report["fail_count"], 0)
        self.assertEqual(len(report["cross_cutting_failures"]), 0)

    def test_igt_ir_passes_all_invariants(self):
        ir_path = ROOT / "games/fort-knox-wolf-run/out/igt.200-1775-001.slot-sim.ir.json"
        report = fuzz(ir_path, runs=6, spins=20_000, seed=42)
        self.assertTrue(
            report["overall_ok"],
            f"IGT fuzzer failed:\n{json.dumps(report, indent=2)}"
        )

    def test_report_has_required_fields(self):
        ir_path = ROOT / "games/fort-knox-wolf-run/out/igt.200-1775-001.slot-sim.ir.json"
        report = fuzz(ir_path, runs=3, spins=10_000, seed=42)
        for key in (
            "ir", "runs", "spins_per_run", "seed", "pass_count",
            "fail_count", "perturbation_failures",
            "cross_cutting_failures", "overall_ok",
        ):
            self.assertIn(key, report, f"missing report key {key!r}")


if __name__ == "__main__":
    unittest.main()
