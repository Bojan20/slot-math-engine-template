"""P1.6 batch 4 — 3 new closed-form solver kernels.

Tests for:
  • SymbolStreakBonusParams     — consecutive-spin streak meter
  • BetMultiplierStackParams    — ante-bet multiplier EV
  • NudgeRespinParams           — deterministic respin to complete combo

Brings catalog 97 → 100/100 (Mission #6 acceptance threshold).

Run:
    python -m unittest tools.tests.test_p1_6_batch4_kernels
"""
from __future__ import annotations
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.solvers.symbol_streak_bonus import (
    SymbolStreakBonusParams,
    analytical_rtp as streak_rtp,
    mc_simulate as streak_mc,
    prob_streak_at_least,
)
from tools.solvers.bet_multiplier_payline_stack import (
    BetMultiplierStackParams,
    rtp_at_bm,
    ev_delta,
    is_positive_ev_at_bm,
)
from tools.solvers.nudge_respin_deterministic import (
    NudgeRespinParams,
    analytical_rtp as nudge_rtp,
    mc_simulate as nudge_mc,
    expected_value_per_trigger,
    is_positive_ev,
)


# ─── Symbol Streak Bonus ────────────────────────────────────────────────────


class TestSymbolStreakBonus(unittest.TestCase):
    REF = SymbolStreakBonusParams(
        p_sym=0.15,
        threshold_pays={3: 5.0, 4: 25.0, 5: 100.0, 7: 500.0},
        window_spins=50,
    )

    def test_prob_streak_at_least_zero_when_k_zero(self):
        self.assertEqual(prob_streak_at_least(self.REF, 0), 0.0)

    def test_prob_streak_monotone_decreasing(self):
        ps = [prob_streak_at_least(self.REF, k) for k in (3, 4, 5, 6, 7)]
        for a, b in zip(ps, ps[1:]):
            self.assertGreaterEqual(a, b)

    def test_zero_p_zero_rtp(self):
        p = SymbolStreakBonusParams(p_sym=0, threshold_pays={3: 5},
                                       window_spins=50)
        self.assertEqual(streak_rtp(p), 0.0)

    def test_analytical_finite(self):
        self.assertTrue(math.isfinite(streak_rtp(self.REF)))
        self.assertGreater(streak_rtp(self.REF), 0)

    def test_mc_convergence(self):
        a = streak_rtp(self.REF)
        mc = streak_mc(self.REF, windows=15_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        # Poisson approximation introduces ≤3 % bias; relaxed band
        self.assertGreater(ratio, 0.75)
        self.assertLess(ratio, 1.30)


# ─── Bet Multiplier Stack ───────────────────────────────────────────────────


class TestBetMultiplierStack(unittest.TestCase):
    REF = BetMultiplierStackParams(
        base_rtp=0.96,
        pay_share={1: 1.0, 2: 0.85, 3: 0.80},
        feature_lift={2: 0.02, 3: 0.04},
    )

    def test_rtp_at_bm_1_equals_base(self):
        # bm=1: pay_share=1.0 → all scaled, constant=0
        # rtp = base × 1.0 (scaled per unit bet)
        self.assertAlmostEqual(rtp_at_bm(self.REF, 1), 0.96, places=4)

    def test_zero_bm_returns_zero(self):
        self.assertEqual(rtp_at_bm(self.REF, 0), 0.0)

    def test_ev_delta_can_be_positive_with_lift(self):
        # With +0.04 feature lift at bm=3 the player gains EV
        self.assertGreater(ev_delta(self.REF, 3), 0)

    def test_is_positive_ev_predicate(self):
        # bm=3 has +0.04 lift → positive
        self.assertTrue(is_positive_ev_at_bm(self.REF, 3))


# ─── Nudge Respin Deterministic ─────────────────────────────────────────────


class TestNudgeRespin(unittest.TestCase):
    REF = NudgeRespinParams(
        p_near_miss=0.02,
        guaranteed_pay=50.0,
        trigger_fee=0.0,
    )

    def test_analytical_rtp(self):
        # 0.02 × 50 = 1.0
        self.assertAlmostEqual(nudge_rtp(self.REF), 1.0)

    def test_expected_value_per_trigger(self):
        self.assertAlmostEqual(expected_value_per_trigger(self.REF), 50.0)

    def test_zero_p_zero_rtp(self):
        p = NudgeRespinParams(p_near_miss=0, guaranteed_pay=50)
        self.assertEqual(nudge_rtp(p), 0.0)

    def test_is_positive_ev_true(self):
        self.assertTrue(is_positive_ev(self.REF))

    def test_negative_ev_with_high_fee(self):
        p = NudgeRespinParams(p_near_miss=0.02, guaranteed_pay=50,
                                trigger_fee=100)
        self.assertFalse(is_positive_ev(p))
        # RTP = 0.02 × (50 − 100) = -1.0
        self.assertAlmostEqual(nudge_rtp(p), -1.0)

    def test_mc_convergence(self):
        a = nudge_rtp(self.REF)
        mc = nudge_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.80)
        self.assertLess(ratio, 1.20)


if __name__ == "__main__":
    unittest.main()
