"""W244 wave 26 — pay_anywhere closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.pay_anywhere import (  # noqa: E402
    PayAnywhereParams,
    expected_landings,
    landing_count_distribution,
    pay_anywhere_rtp,
)


class TestLandingCountDistribution(unittest.TestCase):
    def test_p_zero(self):
        params = PayAnywhereParams(
            n_cells=30, p_per_cell=0.0, pay_table={8: 1.0},
        )
        self.assertEqual(landing_count_distribution(params), {0: 1.0})

    def test_p_one(self):
        params = PayAnywhereParams(
            n_cells=30, p_per_cell=1.0, pay_table={8: 1.0},
        )
        self.assertEqual(landing_count_distribution(params), {30: 1.0})

    def test_sums_to_one(self):
        params = PayAnywhereParams(
            n_cells=30, p_per_cell=0.1, pay_table={8: 1.0},
        )
        dist = landing_count_distribution(params)
        self.assertAlmostEqual(sum(dist.values()), 1.0, places=10)


class TestExpectedLandings(unittest.TestCase):
    def test_binomial_mean(self):
        """E[K] = n × p."""
        params = PayAnywhereParams(
            n_cells=30, p_per_cell=0.1, pay_table={8: 1.0},
        )
        self.assertAlmostEqual(expected_landings(params), 3.0)


class TestPayAnywhereRtp(unittest.TestCase):
    def test_below_min_pays_zero(self):
        """K < min_pay_count → no pay even with table entry."""
        params = PayAnywhereParams(
            n_cells=30, p_per_cell=0.1,
            pay_table={5: 1.0, 8: 5.0, 10: 20.0},
            min_pay_count=8,
        )
        r = pay_anywhere_rtp(params)
        # K=5 contribution must be 0
        k5_entry = next(e for e in r["per_k_breakdown"] if e["k_landings"] == 5)
        self.assertEqual(k5_entry["contribution_x_bet"], 0.0)
        self.assertTrue(k5_entry["below_min"])

    def test_above_min_pays(self):
        """K ≥ min_pay_count → pays per table."""
        params = PayAnywhereParams(
            n_cells=30, p_per_cell=0.1,
            pay_table={8: 5.0},
            min_pay_count=8,
        )
        r = pay_anywhere_rtp(params)
        k8_entry = next(e for e in r["per_k_breakdown"] if e["k_landings"] == 8)
        self.assertFalse(k8_entry["below_min"])
        self.assertGreater(k8_entry["contribution_x_bet"], 0.0)

    def test_sweet_bonanza_scatter_proxy(self):
        """30-cell grid (6×5), p=0.07 per cell, scatter pays for 8+."""
        params = PayAnywhereParams(
            n_cells=30,
            p_per_cell=0.07,
            pay_table={8: 5.0, 10: 20.0, 12: 100.0, 14: 500.0},
            min_pay_count=8,
            symbol_name="scatter",
        )
        r = pay_anywhere_rtp(params)
        # RTP should be positive but reasonable
        self.assertGreater(r["rtp_contribution"], 0.0)
        self.assertLess(r["rtp_contribution"], 5.0)
        # E[K] = 30 × 0.07 = 2.1
        self.assertAlmostEqual(r["expected_landings"], 2.1)


class TestValidation(unittest.TestCase):
    def test_rejects_zero_cells(self):
        with self.assertRaises(ValueError):
            PayAnywhereParams(0, 0.1, {8: 1.0})

    def test_rejects_p_above_one(self):
        with self.assertRaises(ValueError):
            PayAnywhereParams(30, 1.5, {8: 1.0})

    def test_rejects_empty_pay_table(self):
        with self.assertRaises(ValueError):
            PayAnywhereParams(30, 0.1, {})

    def test_rejects_negative_min_pay(self):
        with self.assertRaises(ValueError):
            PayAnywhereParams(30, 0.1, {8: 1.0}, min_pay_count=0)

    def test_rejects_negative_pay(self):
        with self.assertRaises(ValueError):
            PayAnywhereParams(30, 0.1, {8: -1.0})


if __name__ == "__main__":
    unittest.main()
