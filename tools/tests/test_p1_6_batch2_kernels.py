"""P1.6 batch 2 — 6 new closed-form solver kernels.

Tests for:
  • MegawaysParams                — variable-reel ways count
  • CascadeChainParams            — cascade reaction chain
  • HoldAndSpinJackpotParams      — H&W with jackpot ladder
  • WildMultiplierStackParams     — multiplier wild product
  • CollectProgressiveParams      — collector aggregator
  • ScatterTotalBetParams         — scatter × total bet

Run:
    python -m unittest tools.tests.test_p1_6_batch2_kernels
"""
from __future__ import annotations
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.solvers.megaways_ways_count import (
    MegawaysParams,
    analytical_rtp as mega_rtp,
    expected_height,
    expected_total_ways,
)
from tools.solvers.cascade_reaction_chain import (
    CascadeChainParams,
    analytical_rtp as cas_rtp,
    mc_simulate as cas_mc,
    expected_chain_length,
)
from tools.solvers.hold_and_spin_jackpot import (
    HoldAndSpinJackpotParams,
    analytical_rtp as hns_rtp,
    mc_simulate as hns_mc,
    expected_total_orbs,
)
from tools.solvers.wild_multiplier_stack import (
    WildMultiplierStackParams,
    analytical_rtp as wm_rtp,
    mc_simulate as wm_mc,
    expected_multiplier,
    expected_pi_T,
)
from tools.solvers.collect_feature_progressive import (
    CollectProgressiveParams,
    analytical_rtp as col_rtp,
    mc_simulate as col_mc,
    expected_value_coins,
)
from tools.solvers.scatter_total_bet_pay import (
    ScatterTotalBetParams,
    analytical_rtp as sct_rtp,
    mc_simulate as sct_mc,
)


# ─── Megaways ───────────────────────────────────────────────────────────────


class TestMegaways(unittest.TestCase):
    REF = MegawaysParams(
        n_reels=6,
        height_dist={2: 0.25, 3: 0.25, 4: 0.25, 5: 0.25},
        symbol_probs={"H1": 0.06, "H2": 0.08},
        symbol_pays={
            "H1": {3: 1.0, 4: 5.0, 5: 25.0, 6: 100.0},
            "H2": {3: 0.5, 4: 2.0, 5: 10.0, 6: 50.0},
        },
        total_bet=1.0,
    )

    def test_expected_height(self):
        # (2+3+4+5)/4 = 3.5
        self.assertAlmostEqual(expected_height(self.REF), 3.5)

    def test_expected_total_ways(self):
        # 3.5^6 ≈ 1838.27
        self.assertAlmostEqual(expected_total_ways(self.REF), 3.5 ** 6,
                                places=4)

    def test_analytical_finite_positive(self):
        r = mega_rtp(self.REF)
        self.assertTrue(math.isfinite(r))
        self.assertGreater(r, 0)

    def test_zero_prob_returns_zero(self):
        p = MegawaysParams(n_reels=6, height_dist={2: 1.0},
                            symbol_probs={"X": 0.0},
                            symbol_pays={"X": {3: 1.0}}, total_bet=1.0)
        self.assertEqual(mega_rtp(p), 0.0)


# ─── Cascade Reaction Chain ─────────────────────────────────────────────────


class TestCascadeChain(unittest.TestCase):
    REF = CascadeChainParams(p_win=0.3, e_pay=0.5, max_chain=100)

    def test_zero_p_win_returns_zero_rtp(self):
        p = CascadeChainParams(p_win=0.0, e_pay=1.0, max_chain=10)
        self.assertEqual(cas_rtp(p), 0.0)

    def test_expected_chain_length_geometric(self):
        # E[N|started] truncated at K=100 ≈ 1/(1-0.3) = 1.4286
        self.assertAlmostEqual(expected_chain_length(self.REF), 1.0 / 0.7,
                                places=4)

    def test_analytical_rtp(self):
        # 0.3 × 1.4286 × 0.5 = 0.2143
        self.assertAlmostEqual(cas_rtp(self.REF),
                               0.3 * (1.0 / 0.7) * 0.5, places=4)

    def test_mc_convergence(self):
        a = cas_rtp(self.REF)
        mc = cas_mc(self.REF, spins=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


# ─── Hold & Spin Jackpot Ladder ─────────────────────────────────────────────


class TestHoldAndSpinJackpot(unittest.TestCase):
    REF = HoldAndSpinJackpotParams(
        n_grid=15,
        k_trigger=6,
        p_orb_per_cell=0.04,
        e_coin_per_orb=2.0,
        jackpot_probs={"mini": 0.10, "major": 0.01},
        jackpot_pays={"mini": 10.0, "major": 500.0},
        grand_pay=10000.0,
        reset_spins=3,
    )

    def test_zero_orb_prob_returns_just_trigger(self):
        p = HoldAndSpinJackpotParams(n_grid=15, k_trigger=6,
                                       p_orb_per_cell=0,
                                       e_coin_per_orb=2.0)
        self.assertAlmostEqual(expected_total_orbs(p), 6)

    def test_analytical_rtp_positive(self):
        self.assertGreater(hns_rtp(self.REF), 0)

    def test_mc_convergence_within_band(self):
        a = hns_rtp(self.REF)
        mc = hns_mc(self.REF, sessions=10_000, seed=42)
        # Markov approx introduces up to 30% bias; MC defines truth.
        # Just assert both are positive and on same order of magnitude.
        self.assertGreater(mc["rtp_mc"], 0)
        self.assertGreater(a, 0)
        self.assertLess(abs(mc["rtp_mc"] - a) / max(a, 1e-9), 0.50,
                         f"MC={mc['rtp_mc']:.3f}, analytic={a:.3f}")


# ─── Wild Multiplier Stack ──────────────────────────────────────────────────


class TestWildMultiplierStack(unittest.TestCase):
    REF = WildMultiplierStackParams(
        n_reels=5,
        p_mult_wild=0.05,
        m_dist={2.0: 0.5, 3.0: 0.3, 5.0: 0.15, 10.0: 0.05},
        base_pay_ev=10.0,
        p_win=0.1,
    )

    def test_expected_multiplier(self):
        # 2×0.5 + 3×0.3 + 5×0.15 + 10×0.05 = 1.0 + 0.9 + 0.75 + 0.5 = 3.15
        self.assertAlmostEqual(expected_multiplier(self.REF), 3.15)

    def test_expected_pi_T(self):
        # (1 - 0.05 + 0.05 × 3.15)^5 = (1.1075)^5 ≈ 1.668
        self.assertAlmostEqual(expected_pi_T(self.REF),
                                (1.0 - 0.05 + 0.05 * 3.15) ** 5,
                                places=4)

    def test_no_wilds_returns_base_pay(self):
        p = WildMultiplierStackParams(n_reels=5, p_mult_wild=0.0,
                                        m_dist={2.0: 1.0},
                                        base_pay_ev=10.0, p_win=1.0)
        # E[Π M] = 1 (no wilds ever) → RTP = base_pay_ev × p_win
        self.assertAlmostEqual(wm_rtp(p), 10.0)

    def test_mc_convergence(self):
        a = wm_rtp(self.REF)
        mc = wm_mc(self.REF, spins=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


# ─── Collect Feature Progressive ────────────────────────────────────────────


class TestCollectProgressive(unittest.TestCase):
    REF = CollectProgressiveParams(
        n_value_reels=4,
        p_value_per_reel=0.10,
        e_value=5.0,
        p_collect=0.02,
        e_mult=1.0,
    )

    def test_expected_value_coins(self):
        self.assertAlmostEqual(expected_value_coins(self.REF), 0.4)

    def test_analytical_rtp(self):
        # 0.02 × 0.4 × 5.0 × 1.0 = 0.04
        self.assertAlmostEqual(col_rtp(self.REF), 0.04)

    def test_zero_collect_returns_zero(self):
        p = CollectProgressiveParams(n_value_reels=4,
                                       p_value_per_reel=0.1, e_value=5,
                                       p_collect=0, e_mult=1)
        self.assertEqual(col_rtp(p), 0.0)

    def test_mc_convergence(self):
        a = col_rtp(self.REF)
        mc = col_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


# ─── Scatter × Total Bet ────────────────────────────────────────────────────


class TestScatterTotalBet(unittest.TestCase):
    REF = ScatterTotalBetParams(
        n_reels=5,
        n_rows=3,
        p_sc_per_cell=0.05,
        scatter_pays={3: 5.0, 4: 25.0, 5: 100.0, 6: 250.0},
    )

    def test_analytical_rtp_positive(self):
        self.assertGreater(sct_rtp(self.REF), 0)

    def test_no_pays_returns_zero(self):
        p = ScatterTotalBetParams(n_reels=5, n_rows=3,
                                    p_sc_per_cell=0.05, scatter_pays={})
        self.assertEqual(sct_rtp(p), 0.0)

    def test_mc_convergence(self):
        a = sct_rtp(self.REF)
        mc = sct_mc(self.REF, spins=200_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        # Scatter tail is rare-event (P(K≥5) ≈ 7e-4); 200K spins still
        # has ±10 % Binomial variance on top-end pays.
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)

    def test_zero_prob_returns_zero(self):
        p = ScatterTotalBetParams(n_reels=5, n_rows=3,
                                    p_sc_per_cell=0,
                                    scatter_pays={3: 5.0})
        self.assertEqual(sct_rtp(p), 0.0)


if __name__ == "__main__":
    unittest.main()
