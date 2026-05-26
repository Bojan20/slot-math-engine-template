"""P1.6 batch 7 — 4 new closed-form solver kernels.

Adds: FreeSpinBuyCompound, SymbolCollectionMeter, ProgressiveMultiplier,
ReelLockPersistence.
"""
from __future__ import annotations
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.solvers.free_spin_buy_compound import (
    FsBuyCompoundParams,
    buy_mode_rtp,
    expected_session_spins,
    mc_simulate as fs_buy_mc,
)
from tools.solvers.symbol_collection_meter import (
    CollectionMeterParams,
    analytical_rtp as cm_rtp,
    mc_simulate as cm_mc,
    prob_filled_within_window,
)
from tools.solvers.multiplier_progressive_chain import (
    ProgressiveMultiplierParams,
    analytical_rtp as pm_rtp,
    expected_session_payout,
    mc_simulate as pm_mc,
)
from tools.solvers.reel_lock_persistence import (
    ReelLockParams,
    analytical_rtp as rl_rtp,
    expected_locked_reels,
    expected_session_length,
    mc_simulate as rl_mc,
)


class TestFsBuyCompound(unittest.TestCase):
    REF = FsBuyCompoundParams(
        cost_x=100.0, initial_spins=10, retrigger_prob=0.05,
        retrigger_spins=5, max_total_spins=200, pay_per_spin=2.0,
    )

    def test_session_spins_branching(self):
        # E[T] = 10 / (1 − 0.05 × 5) = 10 / 0.75 ≈ 13.33
        self.assertAlmostEqual(expected_session_spins(self.REF),
                                10 / 0.75, places=4)

    def test_zero_retrigger_returns_initial(self):
        p = FsBuyCompoundParams(cost_x=100, initial_spins=10,
                                  retrigger_prob=0, retrigger_spins=5,
                                  max_total_spins=200, pay_per_spin=2)
        self.assertEqual(expected_session_spins(p), 10)

    def test_buy_rtp(self):
        # ≈ 13.33 × 2 / 100 = 0.2667
        self.assertAlmostEqual(buy_mode_rtp(self.REF),
                                expected_session_spins(self.REF) * 2 / 100,
                                places=6)

    def test_zero_cost_returns_zero(self):
        p = FsBuyCompoundParams(cost_x=0, initial_spins=10,
                                  retrigger_prob=0.05, retrigger_spins=5,
                                  max_total_spins=200, pay_per_spin=2)
        self.assertEqual(buy_mode_rtp(p), 0.0)

    def test_mc_session_spins_converges(self):
        a = expected_session_spins(self.REF)
        mc = fs_buy_mc(self.REF, sessions=30_000, seed=42)
        self.assertAlmostEqual(
            mc["mean_session_spins"], a, delta=a * 0.06,
        )


class TestCollectionMeter(unittest.TestCase):
    REF = CollectionMeterParams(
        p_land=0.10, threshold=3, window_spins=50, pay_on_fill=50.0,
    )

    def test_zero_p_returns_zero(self):
        p = CollectionMeterParams(p_land=0, threshold=3,
                                    window_spins=50, pay_on_fill=50)
        self.assertEqual(cm_rtp(p), 0.0)

    def test_short_window_zero_fill(self):
        p = CollectionMeterParams(p_land=0.5, threshold=10,
                                    window_spins=3, pay_on_fill=50)
        self.assertEqual(prob_filled_within_window(p), 0.0)

    def test_fill_prob_monotone_in_window(self):
        p1 = CollectionMeterParams(p_land=0.1, threshold=3,
                                     window_spins=20, pay_on_fill=50)
        p2 = CollectionMeterParams(p_land=0.1, threshold=3,
                                     window_spins=100, pay_on_fill=50)
        self.assertLess(prob_filled_within_window(p1),
                         prob_filled_within_window(p2))

    def test_analytical_finite_positive(self):
        r = cm_rtp(self.REF)
        self.assertTrue(math.isfinite(r))
        self.assertGreater(r, 0)

    def test_mc_convergence(self):
        a = cm_rtp(self.REF)
        mc = cm_mc(self.REF, sessions=10_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.80)
        self.assertLess(ratio, 1.20)


class TestProgressiveMultiplier(unittest.TestCase):
    REF = ProgressiveMultiplierParams(
        p_win=0.30, e_pay=1.0, m_initial=1.0, m_step=1.0, max_chain=10,
    )

    def test_zero_p_zero_rtp(self):
        p = ProgressiveMultiplierParams(p_win=0, e_pay=1, m_initial=1,
                                          m_step=1, max_chain=10)
        self.assertEqual(pm_rtp(p), 0.0)

    def test_e_pay_zero_zero(self):
        p = ProgressiveMultiplierParams(p_win=0.3, e_pay=0, m_initial=1,
                                          m_step=1, max_chain=10)
        self.assertEqual(expected_session_payout(p), 0.0)

    def test_monotone_in_step(self):
        a = ProgressiveMultiplierParams(p_win=0.3, e_pay=1,
                                          m_initial=1, m_step=0,
                                          max_chain=10)
        b = ProgressiveMultiplierParams(p_win=0.3, e_pay=1,
                                          m_initial=1, m_step=2,
                                          max_chain=10)
        self.assertLess(pm_rtp(a), pm_rtp(b))

    def test_mc_convergence(self):
        a = pm_rtp(self.REF)
        mc = pm_mc(self.REF, spins=30_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestReelLockPersistence(unittest.TestCase):
    REF = ReelLockParams(
        n_reels=5, p_lock_per_reel=0.10, miss_streak=3,
        base_pay_per_spin=0.5, pay_per_locked_reel=2.0,
    )

    def test_zero_lock_zero_session(self):
        p = ReelLockParams(n_reels=5, p_lock_per_reel=0,
                             miss_streak=3, base_pay_per_spin=0.5,
                             pay_per_locked_reel=2.0)
        self.assertEqual(expected_session_length(p), 0.0)

    def test_locked_reels_bounded_by_n(self):
        # Even at high p_lock, locked count cannot exceed n_reels
        p = ReelLockParams(n_reels=5, p_lock_per_reel=0.99,
                             miss_streak=3, base_pay_per_spin=0.5,
                             pay_per_locked_reel=2.0)
        self.assertLessEqual(expected_locked_reels(p), 5)

    def test_analytical_positive(self):
        self.assertGreater(rl_rtp(self.REF), 0)

    def test_mc_locked_count_in_band(self):
        # MC: mean locked reels should not exceed n_reels and
        # should be > 0 with p_lock=0.10
        mc = rl_mc(self.REF, sessions=10_000, seed=42)
        self.assertGreater(mc["mean_locked"], 0)
        self.assertLessEqual(mc["mean_locked"], 5)


if __name__ == "__main__":
    unittest.main()
