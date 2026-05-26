"""P1.6++++ batch 5 — 4 new closed-form solver kernels.

Tests for:
  • BonusPickGeometric    (Hacksaw Mining Pots / Pragmatic Cash Truck)
  • BigSymbolFrame        (Pragmatic Wolf Gold / BTG Bonanza)
  • WildTrailPersistence  (Hacksaw Wanted Dead / Pragmatic Trail)
  • AnywherePaysBinomial  (NetEnt Aloha / IGT Pixies)
"""
from __future__ import annotations
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.solvers.bonus_pick_geometric import (
    BonusPickParams,
    expected_total_pay,
    variance_total_pay,
    mc_simulate as bp_mc,
)
from tools.solvers.big_symbol_frame import (
    BigSymbolFrameParams,
    analytical_rtp as bf_rtp,
    mc_simulate as bf_mc,
)
from tools.solvers.wild_trail_persistence import (
    WildTrailParams,
    analytical_rtp as wt_rtp,
    mc_simulate as wt_mc,
    expected_session_length,
)
from tools.solvers.anywhere_pays_binomial import (
    AnywherePaysParams,
    analytical_rtp as ap_rtp,
    mc_simulate as ap_mc,
)


# ─── BonusPick (geometric) ─────────────────────────────────────────


class TestBonusPick(unittest.TestCase):
    REF_FIXED = BonusPickParams(
        pick_values=[1, 5, 10, 25, 50],
        pick_weights=[40, 30, 20, 8, 2],
        n_picks=4,
    )

    REF_GEOM = BonusPickParams(
        pick_values=[1, 5, 10, 25, 0],   # last item is "stop" worth 0
        pick_weights=[40, 30, 20, 8, 2],
        p_stop_per_pick=0.10,
    )

    def test_fixed_n_expected_pay(self):
        # E[V] = (40+150+200+200+100) / 100 = 6.9
        # 4 picks × 6.9 = 27.6
        self.assertAlmostEqual(expected_total_pay(self.REF_FIXED), 4 * 6.9,
                                places=6)

    def test_fixed_variance_positive(self):
        self.assertGreater(variance_total_pay(self.REF_FIXED), 0)

    def test_geometric_mode(self):
        # E[picks] = 0.9 / 0.1 = 9.0
        ev = expected_total_pay(self.REF_GEOM)
        self.assertGreater(ev, 0)
        # MC ratio
        mc = bp_mc(self.REF_GEOM, sessions=20_000, seed=42)
        ratio = mc["mean_total_pay"] / max(ev, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)

    def test_p_stop_one_rejected(self):
        bad = BonusPickParams(
            pick_values=[1], pick_weights=[1], p_stop_per_pick=1.0
        )
        with self.assertRaises(ValueError):
            expected_total_pay(bad)


# ─── BigSymbolFrame ────────────────────────────────────────────────


class TestBigSymbolFrame(unittest.TestCase):
    REF = BigSymbolFrameParams(
        p_trigger=0.05,
        reels=5,
        rows=3,
        n_lines=20,
        stack_size=2,
        pay_5oak=100.0,
    )

    def test_analytical_formula(self):
        # 0.05 × 100 × 2 / 5 = 2.0
        self.assertAlmostEqual(bf_rtp(self.REF), 2.0, places=6)

    def test_p_trigger_out_of_range_rejected(self):
        bad = BigSymbolFrameParams(p_trigger=1.5, reels=5, rows=3,
                                    n_lines=20, stack_size=2, pay_5oak=100)
        with self.assertRaises(ValueError):
            bf_rtp(bad)

    def test_stack_too_large_rejected(self):
        bad = BigSymbolFrameParams(p_trigger=0.05, reels=5, rows=3,
                                    n_lines=20, stack_size=4, pay_5oak=100)
        with self.assertRaises(ValueError):
            bf_rtp(bad)

    def test_mc_convergence(self):
        a = bf_rtp(self.REF)
        mc = bf_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.80)
        self.assertLess(ratio, 1.20)


# ─── WildTrailPersistence ──────────────────────────────────────────


class TestWildTrail(unittest.TestCase):
    REF = WildTrailParams(
        trail_capacity=4,
        p_cascade_base=0.30,
        p_cascade_max=0.70,
        base_pay_per_cascade=10.0,
        trail_multiplier_alpha=0.5,
    )

    def test_expected_session_length_positive(self):
        L = expected_session_length(self.REF)
        self.assertGreater(L, 0.5)
        self.assertLess(L, 1e6)

    def test_analytical_rtp_finite(self):
        r = wt_rtp(self.REF)
        self.assertTrue(math.isfinite(r))
        self.assertGreater(r, 0)

    def test_zero_capacity_collapses_to_geometric(self):
        p = WildTrailParams(
            trail_capacity=0,
            p_cascade_base=0.5,
            p_cascade_max=0.5,
            base_pay_per_cascade=10.0,
            trail_multiplier_alpha=0.5,
        )
        # E[chain] = 1/(1-0.5) = 2, E[pay] ≈ 10 × 2 - first level
        L = expected_session_length(p)
        self.assertAlmostEqual(L, 1.0 / (1 - 0.5), places=4)

    def test_mc_within_tolerance(self):
        a = wt_rtp(self.REF)
        mc = wt_mc(self.REF, sessions=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        # Tolerance generous per docstring (Markov heavy tails)
        self.assertGreater(ratio, 0.80)
        self.assertLess(ratio, 1.20)


# ─── AnywherePaysBinomial ──────────────────────────────────────────


class TestAnywherePays(unittest.TestCase):
    REF = AnywherePaysParams(
        reels=5,
        rows=3,
        p_target_per_cell=0.10,
        pay_table={3: 2.0, 4: 5.0, 5: 10.0, 6: 25.0, 7: 50.0,
                   8: 100.0, 9: 250.0, 10: 500.0,
                   11: 1000.0, 12: 2500.0, 13: 5000.0,
                   14: 10000.0, 15: 25000.0},
        min_match=3,
    )

    def test_analytical_positive(self):
        r = ap_rtp(self.REF)
        self.assertGreater(r, 0)

    def test_zero_p_returns_zero(self):
        p = AnywherePaysParams(reels=5, rows=3, p_target_per_cell=0.0,
                                pay_table={3: 2.0}, min_match=3)
        self.assertEqual(ap_rtp(p), 0.0)

    def test_mc_within_tolerance(self):
        a = ap_rtp(self.REF)
        mc = ap_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


if __name__ == "__main__":
    unittest.main()
