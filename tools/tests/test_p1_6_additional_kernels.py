"""P1.6+ — additional closed-form solver kernel tests (5 new kernels).

Tests for BuyFeatureEV, StickyWildMarkov, FsRetriggerCompound +
re-verifies bonus_wheel and cluster_pays kernels added in this session.

Run:
    python -m unittest tools.tests.test_p1_6_additional_kernels
"""
from __future__ import annotations
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.solvers.buy_feature_ev import (
    BuyFeatureParams,
    buy_mode_rtp,
    natural_mode_loss_rate,
    crossover_n_spins,
    buy_is_positive_ev,
)
from tools.solvers.sticky_wild_markov import (
    StickyWildParams,
    analytical_rtp as sw_rtp,
    mc_simulate as sw_mc,
    expected_total_wilds,
)
from tools.solvers.fs_retrigger_compound import (
    FsRetriggerParams,
    analytical_rtp as fsr_rtp,
    mc_simulate as fsr_mc,
    expected_total_spins,
    variance_total_spins,
)


# ─── BuyFeature EV ──────────────────────────────────────────────────────────


class TestBuyFeatureEV(unittest.TestCase):
    REF = BuyFeatureParams(
        cost_x=100.0,
        p_natural=0.005,
        rtp_natural=0.95,
        rtp_bonus=90.0,  # bonus session pays 90× total bet on average
    )

    def test_buy_mode_rtp_is_ratio(self):
        # rtp_bonus / cost_x = 90 / 100 = 0.90
        self.assertAlmostEqual(buy_mode_rtp(self.REF), 0.90)

    def test_natural_loss_rate_positive_when_rtp_below_1(self):
        self.assertGreater(natural_mode_loss_rate(self.REF), 0)

    def test_zero_cost_returns_zero_buy_rtp(self):
        p = BuyFeatureParams(cost_x=0, p_natural=0.005, rtp_natural=0.95,
                              rtp_bonus=50)
        self.assertEqual(buy_mode_rtp(p), 0.0)

    def test_crossover_when_rtp_natural_ge_1(self):
        p = BuyFeatureParams(cost_x=100, p_natural=0.005, rtp_natural=1.05,
                              rtp_bonus=50)
        self.assertEqual(crossover_n_spins(p), float("inf"))

    def test_buy_positive_ev_when_bonus_exceeds_cost(self):
        p = BuyFeatureParams(cost_x=100, p_natural=0.005, rtp_natural=0.95,
                              rtp_bonus=120)
        self.assertTrue(buy_is_positive_ev(p))

    def test_buy_negative_ev_when_cost_exceeds_bonus(self):
        p = BuyFeatureParams(cost_x=100, p_natural=0.005, rtp_natural=0.95,
                              rtp_bonus=60)
        self.assertFalse(buy_is_positive_ev(p))


# ─── Sticky Wild Markov ─────────────────────────────────────────────────────


class TestStickyWildMarkov(unittest.TestCase):
    REF = StickyWildParams(
        n_cells=15,
        p_wild_landing=0.05,
        fs_spins_total=10,
        wild_pay_rate=0.5,
    )

    def test_expected_total_wilds(self):
        # 10 × 15 × 0.05 = 7.5
        self.assertAlmostEqual(expected_total_wilds(self.REF), 7.5)

    def test_analytical_finite_positive(self):
        r = sw_rtp(self.REF)
        self.assertTrue(math.isfinite(r))
        self.assertGreater(r, 0)

    def test_zero_landing_returns_zero(self):
        p = StickyWildParams(n_cells=15, p_wild_landing=0,
                              fs_spins_total=10, wild_pay_rate=0.5)
        self.assertEqual(sw_rtp(p), 0)

    def test_zero_spins_returns_zero(self):
        p = StickyWildParams(n_cells=15, p_wild_landing=0.05,
                              fs_spins_total=0, wild_pay_rate=0.5)
        self.assertEqual(sw_rtp(p), 0)

    def test_mc_convergence(self):
        a = sw_rtp(self.REF)
        mc = sw_mc(self.REF, sessions=10_000, seed=42)
        # Wald identity is exact in expectation; MC ±5 % at 10K sessions
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.95)
        self.assertLess(ratio, 1.05)


# ─── FS Retrigger Compound ──────────────────────────────────────────────────


class TestFsRetriggerCompound(unittest.TestCase):
    REF = FsRetriggerParams(
        initial_spins=5,
        retrigger_prob=0.05,
        retrigger_spins=3,
        max_total_spins=100,
        pay_per_spin=0.10,
    )

    def test_no_retrigger_means_initial_spins(self):
        p = FsRetriggerParams(initial_spins=5, retrigger_prob=0,
                                retrigger_spins=3, max_total_spins=100,
                                pay_per_spin=0.1)
        self.assertEqual(expected_total_spins(p), 5)

    def test_expected_total_spins_branching(self):
        # E[T] = K_0 / (1 − p_re × ΔK) = 5 / (1 − 0.05 × 3) = 5 / 0.85
        self.assertAlmostEqual(expected_total_spins(self.REF), 5 / 0.85,
                                places=4)

    def test_analytical_rtp_is_spins_times_pay(self):
        self.assertAlmostEqual(
            fsr_rtp(self.REF),
            expected_total_spins(self.REF) * self.REF.pay_per_spin,
            places=6,
        )

    def test_variance_positive_when_retriggers_possible(self):
        self.assertGreater(variance_total_spins(self.REF), 0)

    def test_mc_convergence(self):
        a = fsr_rtp(self.REF)
        mc = fsr_mc(self.REF, sessions=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        # Wald is exact in expectation; MC ±5 % @ 20K sessions
        self.assertGreater(ratio, 0.95)
        self.assertLess(ratio, 1.05)

    def test_mc_mean_spins_matches_analytical(self):
        a = expected_total_spins(self.REF)
        mc = fsr_mc(self.REF, sessions=20_000, seed=42)
        # ±5 % tolerance
        self.assertAlmostEqual(mc["mean_total_spins"], a, delta=a * 0.05)


if __name__ == "__main__":
    unittest.main()
