"""P1.6 — Closed-form solver kernel regression tests.

Three guarantees per kernel:

  1. **Formula sanity** — analytical_rtp returns finite, non-negative,
     bounded values for reasonable inputs (and 0 / sane on edge cases).
  2. **Bounds + validation** — invalid inputs raise ValueError.
  3. **Analytical ↔ MC convergence** — within published acceptance
     band on the kernel's reference fixture.

Run:
    python -m unittest tools.tests.test_p1_6_solver_kernels
"""
from __future__ import annotations
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.solvers.stacked_wild_random_reel import (
    StackedWildRandomReelParams,
    analytical_rtp as sw_rtp,
    mc_simulate as sw_mc,
    ACCEPTANCE_TOLERANCE_MC as SW_TOL_MC,
    ACCEPTANCE_TOLERANCE_INDEPENDENCE as SW_TOL_IND,
)
from tools.solvers.symbol_upgrade_random import (
    SymbolUpgradeParams,
    analytical_rtp as su_rtp,
    mc_simulate as su_mc,
    ACCEPTANCE_TOLERANCE_MC as SU_TOL_MC,
)
from tools.solvers.mystery_reveal_aggregator import (
    MysteryRevealParams,
    analytical_rtp as mr_rtp,
    mc_simulate as mr_mc,
    ACCEPTANCE_TOLERANCE_MC as MR_TOL_MC,
)


# ─── Stacked Wild ───────────────────────────────────────────────────────────


class TestStackedWild(unittest.TestCase):
    REF = StackedWildRandomReelParams(
        p_trigger=0.05, n_reels=5, n_lines=20,
        symbol_probs={"Red7": 0.05, "Blue7": 0.06, "Bell": 0.08,
                       "Cherry": 0.15},
        symbol_pays_5oak={"Red7": 200, "Blue7": 100, "Bell": 50,
                           "Cherry": 20},
        wild_prob=0.02,
    )

    def test_analytical_finite_and_positive(self):
        r = sw_rtp(self.REF)
        self.assertTrue(math.isfinite(r))
        self.assertGreater(r, 0)

    def test_zero_trigger_zero_rtp(self):
        p = StackedWildRandomReelParams(
            p_trigger=0.0, n_reels=5, n_lines=20,
            symbol_probs={"X": 0.1}, symbol_pays_5oak={"X": 100},
        )
        self.assertEqual(sw_rtp(p), 0.0)

    def test_invalid_p_trigger_raises(self):
        with self.assertRaises(ValueError):
            sw_rtp(StackedWildRandomReelParams(
                p_trigger=1.5, n_reels=5, n_lines=20,
                symbol_probs={"X": 0.1}, symbol_pays_5oak={"X": 100},
            ))

    def test_invalid_n_lines_raises(self):
        with self.assertRaises(ValueError):
            sw_rtp(StackedWildRandomReelParams(
                p_trigger=0.05, n_reels=5, n_lines=0,
                symbol_probs={"X": 0.1}, symbol_pays_5oak={"X": 100},
            ))

    def test_mc_returns_dict_with_keys(self):
        out = sw_mc(self.REF, spins=10_000, seed=42)
        for key in ("rtp_mc", "trigger_count", "trigger_rate",
                    "mean_pay_per_trigger"):
            self.assertIn(key, out)

    def test_mc_trigger_rate_close_to_p_trigger(self):
        out = sw_mc(self.REF, spins=50_000, seed=42)
        # Binomial CLT 50K × 0.05 → σ ≈ √(50K·0.05·0.95) / 50K = 0.001
        # 5σ band = 0.005 tolerance
        self.assertAlmostEqual(out["trigger_rate"], self.REF.p_trigger,
                                delta=0.005)

    def test_analytical_mc_ratio_within_band(self):
        a = sw_rtp(self.REF)
        out = sw_mc(self.REF, spins=200_000, seed=42)
        mc = out["rtp_mc"]
        # MC absolute tolerance (CLT noise)
        self.assertLess(abs(mc - a), SW_TOL_MC + 0.5 * a,
                         f"|MC - analytical| {abs(mc-a):.6f} too large")
        # Ratio band (independence approximation)
        ratio = mc / max(a, 1e-9)
        self.assertGreater(ratio, 1.0 - SW_TOL_IND,
                            f"ratio {ratio:.3f} below 1-{SW_TOL_IND}")
        self.assertLess(ratio, 1.0 + SW_TOL_IND,
                         f"ratio {ratio:.3f} above 1+{SW_TOL_IND}")


# ─── Symbol Upgrade ─────────────────────────────────────────────────────────


class TestSymbolUpgrade(unittest.TestCase):
    REF = SymbolUpgradeParams(
        p_upgrade=0.10, n_cells=15, n_lines=20,
        lp_probs={"Cherry": 0.15, "Lemon": 0.12, "Plum": 0.10},
        lp_pays_5oak={"Cherry": 20, "Lemon": 15, "Plum": 10},
        ht_id="Red7", ht_pay_5oak=200.0,
    )

    def test_analytical_finite_positive_when_ht_higher(self):
        r = su_rtp(self.REF)
        self.assertTrue(math.isfinite(r))
        # HT pays >> LP pays → delta positive
        self.assertGreater(r, 0)

    def test_negative_delta_when_ht_lower_than_lp(self):
        p = SymbolUpgradeParams(
            p_upgrade=0.10, n_cells=15, n_lines=20,
            lp_probs={"Cherry": 0.15},
            lp_pays_5oak={"Cherry": 200},  # LP pays MORE than HT
            ht_id="Red7", ht_pay_5oak=10.0,
        )
        self.assertLess(su_rtp(p), 0)  # downgrade

    def test_invalid_p_upgrade_raises(self):
        with self.assertRaises(ValueError):
            su_rtp(SymbolUpgradeParams(
                p_upgrade=-0.1, n_cells=15, n_lines=20,
                lp_probs={"X": 0.1}, lp_pays_5oak={"X": 10},
                ht_id="HT", ht_pay_5oak=100,
            ))

    def test_zero_lp_probs_returns_zero(self):
        p = SymbolUpgradeParams(
            p_upgrade=0.10, n_cells=15, n_lines=20,
            lp_probs={}, lp_pays_5oak={},
            ht_id="HT", ht_pay_5oak=100.0,
        )
        self.assertEqual(su_rtp(p), 0.0)

    def test_mc_convergence(self):
        a = su_rtp(self.REF)
        out = su_mc(self.REF, spins=500_000, seed=42)
        mc = out["rtp_mc"]
        # Generous tolerance (relative + absolute) — closed-form is an
        # approximation under independence assumption
        self.assertLess(abs(mc - a), 0.0005,
                         f"|MC - analytical| {abs(mc-a):.6f} too large")


# ─── Mystery Reveal ─────────────────────────────────────────────────────────


class TestMysteryReveal(unittest.TestCase):
    REF = MysteryRevealParams(
        p_mystery=0.05, n_cells=15, n_lines=20, min_match=3,
        reveal_dist={"Red7": 0.1, "Blue7": 0.2, "Cherry": 0.7},
        symbol_probs={"Red7": 0.05, "Blue7": 0.06, "Cherry": 0.15},
        symbol_pays_5oak={"Red7": 200, "Blue7": 100, "Cherry": 20},
    )

    def test_analytical_finite_positive(self):
        r = mr_rtp(self.REF)
        self.assertTrue(math.isfinite(r))
        self.assertGreater(r, 0)

    def test_zero_mystery_returns_zero(self):
        p = MysteryRevealParams(
            p_mystery=0.0, n_cells=15, n_lines=20, min_match=3,
            reveal_dist={"X": 1.0}, symbol_probs={"X": 0.1},
            symbol_pays_5oak={"X": 100},
        )
        self.assertEqual(mr_rtp(p), 0.0)

    def test_empty_reveal_dist_returns_zero(self):
        p = MysteryRevealParams(
            p_mystery=0.05, n_cells=15, n_lines=20, min_match=3,
            reveal_dist={}, symbol_probs={"X": 0.1},
            symbol_pays_5oak={"X": 100},
        )
        self.assertEqual(mr_rtp(p), 0.0)

    def test_mc_convergence_tight(self):
        """MysteryReveal closed form should match MC very tightly because
        per-cell aggregation is the dominant signal."""
        a = mr_rtp(self.REF)
        out = mr_mc(self.REF, spins=200_000, seed=42)
        mc = out["rtp_mc"]
        # MysteryReveal independence is exact for per-cell aggregation
        self.assertAlmostEqual(mc, a, delta=MR_TOL_MC,
                                msg=f"MC {mc:.6f} vs analytical {a:.6f}")

    def test_mc_mystery_count_matches_binomial(self):
        out = mr_mc(self.REF, spins=50_000, seed=42)
        # E[K] = C × p_mystery = 15 × 0.05 = 0.75
        self.assertAlmostEqual(out["mean_mystery_count"], 0.75, delta=0.05)


if __name__ == "__main__":
    unittest.main()
