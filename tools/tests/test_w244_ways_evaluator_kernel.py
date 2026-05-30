"""W244 wave 25 — ways_evaluator closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.ways_evaluator import (  # noqa: E402
    WaysEvaluatorParams,
    expected_rows_per_reel,
    expected_ways_count,
    ways_evaluator_rtp,
)


class TestExpectedRowsPerReel(unittest.TestCase):
    def test_fixed_3_rows(self):
        """3-row deterministic distribution → E = 3.0."""
        params = WaysEvaluatorParams(
            row_distribution_per_reel=tuple({3: 1.0} for _ in range(5)),
            per_way_rtp_x_bet=0.001,
        )
        e_rows = expected_rows_per_reel(params)
        self.assertEqual(e_rows, (3.0, 3.0, 3.0, 3.0, 3.0))

    def test_megaways_variable(self):
        """Megaways-style: rows 2-7 uniform → E = 4.5."""
        uniform_2_to_7 = {r: 1.0 / 6 for r in range(2, 8)}
        params = WaysEvaluatorParams(
            row_distribution_per_reel=tuple([uniform_2_to_7] * 6),
            per_way_rtp_x_bet=0.0001,
        )
        e_rows = expected_rows_per_reel(params)
        for e in e_rows:
            self.assertAlmostEqual(e, 4.5)


class TestExpectedWaysCount(unittest.TestCase):
    def test_fixed_1024_ways(self):
        """5 reels × 4 rows = 1024 ways exactly."""
        params = WaysEvaluatorParams(
            row_distribution_per_reel=tuple({4: 1.0} for _ in range(5)),
            per_way_rtp_x_bet=0.001,
        )
        self.assertAlmostEqual(expected_ways_count(params), 1024.0)

    def test_megaways_117649(self):
        """6 reels × 7 rows each = 117649 ways (Megaways max)."""
        params = WaysEvaluatorParams(
            row_distribution_per_reel=tuple({7: 1.0} for _ in range(6)),
            per_way_rtp_x_bet=0.00001,
        )
        self.assertAlmostEqual(expected_ways_count(params), 117649.0)

    def test_megaways_variable_expected(self):
        """6 reels × E[rows] = 4.5 each → E[ways] = 4.5^6 ≈ 8303.77."""
        uniform_2_to_7 = {r: 1.0 / 6 for r in range(2, 8)}
        params = WaysEvaluatorParams(
            row_distribution_per_reel=tuple([uniform_2_to_7] * 6),
            per_way_rtp_x_bet=0.0001,
        )
        # E[ways] = 4.5^6 = 8303.7656
        self.assertAlmostEqual(expected_ways_count(params), 4.5 ** 6)


class TestWaysEvaluatorRtp(unittest.TestCase):
    def test_classic_243_ways(self):
        """243 ways at per-way RTP 0.96/243 → total RTP ≈ 0.96."""
        params = WaysEvaluatorParams(
            row_distribution_per_reel=tuple({3: 1.0} for _ in range(5)),
            per_way_rtp_x_bet=0.96 / 243,
        )
        r = ways_evaluator_rtp(params)
        self.assertAlmostEqual(r["rtp_contribution"], 0.96)
        self.assertEqual(r["n_reels"], 5)
        self.assertAlmostEqual(r["expected_ways_count"], 243.0)

    def test_megaways_audit_dict(self):
        uniform_2_to_7 = {r: 1.0 / 6 for r in range(2, 8)}
        params = WaysEvaluatorParams(
            row_distribution_per_reel=tuple([uniform_2_to_7] * 6),
            per_way_rtp_x_bet=0.000115,  # ≈ 0.96 / 8303
        )
        r = ways_evaluator_rtp(params)
        self.assertEqual(r["n_reels"], 6)
        self.assertEqual(len(r["per_reel_breakdown"]), 6)
        # Each reel has E[rows] = 4.5
        for entry in r["per_reel_breakdown"]:
            self.assertAlmostEqual(entry["expected_rows"], 4.5)


class TestValidation(unittest.TestCase):
    def test_rejects_empty_reels(self):
        with self.assertRaises(ValueError):
            WaysEvaluatorParams(row_distribution_per_reel=(), per_way_rtp_x_bet=0.01)

    def test_rejects_negative_rtp(self):
        with self.assertRaises(ValueError):
            WaysEvaluatorParams(
                row_distribution_per_reel=({3: 1.0},), per_way_rtp_x_bet=-0.01,
            )

    def test_rejects_zero_row_count(self):
        with self.assertRaises(ValueError):
            WaysEvaluatorParams(
                row_distribution_per_reel=({0: 1.0},), per_way_rtp_x_bet=0.01,
            )

    def test_rejects_distribution_not_summing_to_one(self):
        with self.assertRaises(ValueError):
            WaysEvaluatorParams(
                row_distribution_per_reel=({3: 0.5, 4: 0.4},),
                per_way_rtp_x_bet=0.01,
            )

    def test_rejects_negative_probability(self):
        with self.assertRaises(ValueError):
            WaysEvaluatorParams(
                row_distribution_per_reel=({3: 1.5, 4: -0.5},),
                per_way_rtp_x_bet=0.01,
            )

    def test_rejects_empty_distribution(self):
        with self.assertRaises(ValueError):
            WaysEvaluatorParams(
                row_distribution_per_reel=({},),
                per_way_rtp_x_bet=0.01,
            )


if __name__ == "__main__":
    unittest.main()
