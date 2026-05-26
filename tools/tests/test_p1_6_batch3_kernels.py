"""P1.6 batch 3 — 6 new closed-form solver kernels.

Tests for:
  • DiagonalPaylineParams         — diagonal/V/zigzag paylines
  • AvalancheConsecutiveParams    — consecutive-win multiplier ladder
  • JackpotShareLadderParams      — fixed jackpot tier share
  • ReelMutateWildParams          — reel transforms to all wilds
  • MorphingSymbolMarkovParams    — symbol upgrade Markov chain
  • MultiplierGridParams          — fixed-grid multiplier matrix

Run:
    python -m unittest tools.tests.test_p1_6_batch3_kernels
"""
from __future__ import annotations
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.solvers.diagonal_payline_pattern import (
    DiagonalPaylineParams,
    analytical_rtp as diag_rtp,
    per_line_rtp,
)
from tools.solvers.avalanche_consecutive import (
    AvalancheConsecutiveParams,
    analytical_rtp as av_rtp,
    mc_simulate as av_mc,
    expected_chain_payout,
)
from tools.solvers.jackpot_share_ladder import (
    JackpotShareLadderParams,
    analytical_rtp as jp_rtp,
    mc_simulate as jp_mc,
    normalized_probs,
    expected_pay_per_trigger,
)
from tools.solvers.reel_mutate_wild import (
    ReelMutateWildParams,
    analytical_rtp as rmw_rtp,
    effective_prob,
)
from tools.solvers.morphing_symbol_markov import (
    MorphingSymbolMarkovParams,
    analytical_rtp as morph_rtp,
    mc_simulate as morph_mc,
    level_distribution,
)
from tools.solvers.multiplier_grid_matrix import (
    MultiplierGridParams,
    analytical_rtp as mg_rtp,
    mc_simulate as mg_mc,
    expected_cell_multiplier,
    expected_total_multiplier,
)


# ─── Diagonal payline ───────────────────────────────────────────────────────


class TestDiagonalPayline(unittest.TestCase):
    REF = DiagonalPaylineParams(
        n_reels=5,
        n_lines=20,
        symbol_probs={"H1": 0.10},
        symbol_pays={"H1": {3: 5.0, 4: 25.0, 5: 200.0}},
        line_bet=1.0,
    )

    def test_per_line_finite_positive(self):
        self.assertTrue(math.isfinite(per_line_rtp(self.REF)))
        self.assertGreater(per_line_rtp(self.REF), 0)

    def test_zero_prob_zero_rtp(self):
        p = DiagonalPaylineParams(n_reels=5, n_lines=20,
                                    symbol_probs={"X": 0},
                                    symbol_pays={"X": {3: 5}},
                                    line_bet=1)
        self.assertEqual(diag_rtp(p), 0.0)

    def test_zero_lines_zero_rtp(self):
        p = DiagonalPaylineParams(n_reels=5, n_lines=0,
                                    symbol_probs={"X": 0.1},
                                    symbol_pays={"X": {3: 5}},
                                    line_bet=1)
        self.assertEqual(diag_rtp(p), 0.0)


# ─── Avalanche Consecutive ──────────────────────────────────────────────────


class TestAvalancheConsecutive(unittest.TestCase):
    REF = AvalancheConsecutiveParams(
        p_win=0.25,
        e_pay=1.0,
        mult_ladder={1: 1, 2: 2, 3: 4, 4: 8, 5: 16},
        max_chain=10,
    )

    def test_expected_chain_payout(self):
        # Σ 0.25^(n-1) × m_n for n=1..5 then m=16 for n=6..10
        # n=1: 1×1=1; n=2: 0.25×2=0.5; n=3: 0.0625×4=0.25;
        # n=4: 0.015625×8=0.125; n=5: 0.00390625×16=0.0625
        # cap (n=5..10): 16 each at 0.25^(n-1)
        expected = 1.0 + 0.5 + 0.25 + 0.125 + 0.0625
        # n=6..10: 16 × Σ 0.25^(n-1) for n=6..10
        for n in range(6, 11):
            expected += 0.25 ** (n - 1) * 16
        self.assertAlmostEqual(expected_chain_payout(self.REF),
                                expected, places=6)

    def test_zero_p_win_zero_rtp(self):
        p = AvalancheConsecutiveParams(p_win=0, e_pay=1,
                                         mult_ladder={1: 1},
                                         max_chain=10)
        self.assertEqual(av_rtp(p), 0.0)

    def test_mc_convergence(self):
        a = av_rtp(self.REF)
        mc = av_mc(self.REF, spins=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


# ─── Jackpot Share Ladder ───────────────────────────────────────────────────


class TestJackpotShareLadder(unittest.TestCase):
    REF = JackpotShareLadderParams(
        p_trigger=0.001,
        tier_mass={"mini": 70, "minor": 20, "major": 8, "grand": 2},
        tier_pay={"mini": 50, "minor": 500, "major": 5000, "grand": 100000},
    )

    def test_normalized_probs_sum_to_one(self):
        qs = normalized_probs(self.REF)
        self.assertAlmostEqual(sum(qs.values()), 1.0)

    def test_expected_pay_per_trigger(self):
        # 0.7×50 + 0.2×500 + 0.08×5000 + 0.02×100000
        # = 35 + 100 + 400 + 2000 = 2535
        self.assertAlmostEqual(expected_pay_per_trigger(self.REF),
                                2535.0, places=2)

    def test_analytical_rtp(self):
        # 0.001 × 2535 = 2.535
        self.assertAlmostEqual(jp_rtp(self.REF), 2.535, places=3)

    def test_zero_trigger_zero_rtp(self):
        p = JackpotShareLadderParams(p_trigger=0,
                                       tier_mass={"a": 1},
                                       tier_pay={"a": 100})
        self.assertEqual(jp_rtp(p), 0.0)

    def test_mc_convergence(self):
        a = jp_rtp(self.REF)
        mc = jp_mc(self.REF, spins=200_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        # Rare grand tier dominates variance; relax band
        self.assertGreater(ratio, 0.40)
        self.assertLess(ratio, 2.5)


# ─── Reel Mutate Wild ───────────────────────────────────────────────────────


class TestReelMutateWild(unittest.TestCase):
    REF = ReelMutateWildParams(
        n_reels=5,
        p_mutate_per_reel=0.02,
        symbol_probs={"H1": 0.10},
        symbol_pays={"H1": {3: 5.0, 4: 25.0, 5: 200.0}},
        num_lines=20,
        line_bet=1.0,
    )

    def test_effective_prob(self):
        # 0.02 + 0.98 × 0.10 = 0.118
        self.assertAlmostEqual(effective_prob(self.REF, 0.10), 0.118,
                                places=6)

    def test_no_mutate_equals_normal_payline(self):
        p = ReelMutateWildParams(n_reels=5, p_mutate_per_reel=0,
                                   symbol_probs={"H1": 0.10},
                                   symbol_pays={"H1": {3: 5, 4: 25, 5: 200}},
                                   num_lines=20, line_bet=1.0)
        # No mutate ⇒ effective = p_sym = 0.10
        # per-line = 0.10³×0.9×5 + 0.10⁴×0.9×25 + 0.10⁵×200
        #         = 0.0045 + 0.000225 + 0.000002 = 0.004727
        expected = 0.001 * 0.9 * 5 + 0.0001 * 0.9 * 25 + 0.00001 * 200
        self.assertAlmostEqual(rmw_rtp(p), expected, places=5)

    def test_full_mutate_full_pay(self):
        # If all reels always mutate, every line always pays max
        p = ReelMutateWildParams(n_reels=3, p_mutate_per_reel=1.0,
                                   symbol_probs={"H1": 0.1},
                                   symbol_pays={"H1": {3: 5.0}},
                                   num_lines=1, line_bet=1.0)
        # effective = 1, run = 3 ⇒ pay = 5.0
        self.assertAlmostEqual(rmw_rtp(p), 5.0)


# ─── Morphing Symbol Markov ─────────────────────────────────────────────────


class TestMorphingSymbolMarkov(unittest.TestCase):
    REF = MorphingSymbolMarkovParams(
        p_trigger=0.1,
        p_up=0.5,
        level_pays=[10.0, 25.0, 50.0, 100.0, 250.0],
        initial_level=0,
    )

    def test_level_distribution_sums_to_one(self):
        dist = level_distribution(self.REF)
        self.assertAlmostEqual(sum(dist), 1.0, places=6)

    def test_initial_level_when_p_up_zero(self):
        p = MorphingSymbolMarkovParams(p_trigger=1, p_up=0,
                                          level_pays=[1, 2, 3],
                                          initial_level=0)
        dist = level_distribution(p)
        self.assertEqual(dist, [1.0, 0.0, 0.0])

    def test_max_level_when_p_up_one(self):
        p = MorphingSymbolMarkovParams(p_trigger=1, p_up=1,
                                          level_pays=[1, 2, 3, 4],
                                          initial_level=0)
        dist = level_distribution(p)
        self.assertEqual(dist[-1], 1.0)

    def test_analytical_rtp(self):
        # dist for p_up=0.5: [0.5, 0.25, 0.125, 0.0625, 0.0625(cap)]
        # E[pay|trigger] = 0.5×10 + 0.25×25 + 0.125×50 + 0.0625×100 + 0.0625×250
        # = 5 + 6.25 + 6.25 + 6.25 + 15.625 = 39.375
        # RTP = 0.1 × 39.375 = 3.9375
        self.assertAlmostEqual(morph_rtp(self.REF), 3.9375, places=4)

    def test_mc_convergence(self):
        a = morph_rtp(self.REF)
        mc = morph_mc(self.REF, spins=30_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


# ─── Multiplier Grid Matrix ─────────────────────────────────────────────────


class TestMultiplierGridMatrix(unittest.TestCase):
    REF = MultiplierGridParams(
        n_cells=15,
        cell_mult_dist={1.0: 0.7, 2.0: 0.2, 5.0: 0.08, 10.0: 0.02},
        trigger_p=0.05,
        base_pay=2.0,
        combine_mode="sum",
    )

    def test_expected_cell_multiplier(self):
        # 1×0.7 + 2×0.2 + 5×0.08 + 10×0.02 = 0.7 + 0.4 + 0.4 + 0.2 = 1.7
        self.assertAlmostEqual(expected_cell_multiplier(self.REF), 1.7)

    def test_sum_mode_total_mult(self):
        # 15 × 1.7 = 25.5
        self.assertAlmostEqual(expected_total_multiplier(self.REF), 25.5)

    def test_product_mode_total_mult(self):
        p = MultiplierGridParams(n_cells=3,
                                    cell_mult_dist={1.0: 0.5, 2.0: 0.5},
                                    trigger_p=1, base_pay=1,
                                    combine_mode="product")
        # E[M] = 1.5, E[M]³ = 3.375
        self.assertAlmostEqual(expected_total_multiplier(p), 1.5 ** 3)

    def test_analytical_rtp(self):
        # 0.05 × 2 × 25.5 = 2.55
        self.assertAlmostEqual(mg_rtp(self.REF), 2.55)

    def test_mc_convergence(self):
        a = mg_rtp(self.REF)
        mc = mg_mc(self.REF, spins=30_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


if __name__ == "__main__":
    unittest.main()
