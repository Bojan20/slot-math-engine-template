"""W244 wave 24 — stacked_wilds closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.stacked_wilds import (  # noqa: E402
    StackedWildsParams,
    _binomial_reference,
    expected_stacked_count,
    stacked_count_distribution,
    stacked_wilds_rtp,
)


class TestStackedCountDistribution(unittest.TestCase):
    def test_p_zero(self):
        params = StackedWildsParams(
            n_reels=5, p_stacked_per_reel=0.0,
            pay_per_stacked_count={0: 0.0, 5: 100.0},
        )
        dist = stacked_count_distribution(params)
        self.assertEqual(dist, {0: 1.0})

    def test_p_one(self):
        params = StackedWildsParams(
            n_reels=5, p_stacked_per_reel=1.0,
            pay_per_stacked_count={0: 0.0, 5: 100.0},
        )
        dist = stacked_count_distribution(params)
        self.assertEqual(dist, {5: 1.0})

    def test_binomial_matches_reference(self):
        """PMF computation matches math.comb-based reference."""
        params = StackedWildsParams(
            n_reels=7, p_stacked_per_reel=0.05,
            pay_per_stacked_count={0: 0.0},
        )
        dist = stacked_count_distribution(params)
        for k in range(8):
            self.assertAlmostEqual(
                dist[k], _binomial_reference(7, k, 0.05),
                places=12, msg=f"PMF mismatch at k={k}",
            )

    def test_sums_to_one(self):
        params = StackedWildsParams(
            n_reels=7, p_stacked_per_reel=0.1,
            pay_per_stacked_count={0: 0.0},
        )
        dist = stacked_count_distribution(params)
        self.assertAlmostEqual(sum(dist.values()), 1.0, places=10)


class TestExpectedStackedCount(unittest.TestCase):
    def test_linearity(self):
        """E[k] = n × p."""
        params = StackedWildsParams(
            n_reels=5, p_stacked_per_reel=0.08,
            pay_per_stacked_count={0: 0.0},
        )
        self.assertAlmostEqual(expected_stacked_count(params), 0.4)


class TestStackedWildsRtp(unittest.TestCase):
    def test_zero_pay_table_rtp_zero(self):
        params = StackedWildsParams(
            n_reels=5, p_stacked_per_reel=0.05,
            pay_per_stacked_count={k: 0.0 for k in range(6)},
        )
        r = stacked_wilds_rtp(params)
        self.assertEqual(r["rtp_contribution"], 0.0)

    def test_single_jackpot_full_stack(self):
        """P(5/5 stacked) = 0.05^5 ≈ 3.1×10^-7; pay 10000 → RTP ≈ 0.0031."""
        params = StackedWildsParams(
            n_reels=5, p_stacked_per_reel=0.05,
            pay_per_stacked_count={5: 10_000.0},
        )
        r = stacked_wilds_rtp(params)
        expected = 0.05 ** 5 * 10_000.0
        self.assertAlmostEqual(r["rtp_contribution"], expected, places=10)

    def test_breakdown_count_matches_reels(self):
        params = StackedWildsParams(
            n_reels=5, p_stacked_per_reel=0.05,
            pay_per_stacked_count={1: 1.0, 2: 5.0, 3: 50.0, 4: 500.0, 5: 5000.0},
        )
        r = stacked_wilds_rtp(params)
        # Breakdown contains 6 entries (k=0..5)
        self.assertEqual(len(r["per_k_breakdown"]), 6)
        self.assertAlmostEqual(r["binomial_check_sum_prob"], 1.0, places=10)


class TestValidation(unittest.TestCase):
    def test_rejects_zero_reels(self):
        with self.assertRaises(ValueError):
            StackedWildsParams(0, 0.05, {0: 0.0})

    def test_rejects_p_above_one(self):
        with self.assertRaises(ValueError):
            StackedWildsParams(5, 1.5, {0: 0.0})

    def test_rejects_negative_pay(self):
        with self.assertRaises(ValueError):
            StackedWildsParams(5, 0.05, {0: -1.0})

    def test_rejects_negative_key(self):
        with self.assertRaises(ValueError):
            StackedWildsParams(5, 0.05, {-1: 1.0})

    def test_rejects_empty_pay_table(self):
        with self.assertRaises(ValueError):
            StackedWildsParams(5, 0.05, {})


if __name__ == "__main__":
    unittest.main()
