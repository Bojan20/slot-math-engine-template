"""W244 wave 21 — cluster_pays closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.cluster_pays import (  # noqa: E402
    ClusterPaysParams,
    cluster_pays_rtp,
    expected_pay_per_spin,
)


class TestExpectedPayPerSpin(unittest.TestCase):
    def test_single_symbol_single_size(self):
        """One symbol, one size: RTP = count × pay."""
        params = ClusterPaysParams(
            cluster_count_distribution={"A": {5: 0.1}},
            pay_table={"A": {5: 2.0}},
            min_cluster_size=5,
        )
        # 0.1 × 2.0 = 0.2
        self.assertAlmostEqual(expected_pay_per_spin(params), 0.2)

    def test_below_min_zero(self):
        """Clusters below min_cluster_size contribute 0."""
        params = ClusterPaysParams(
            cluster_count_distribution={"A": {3: 0.5, 5: 0.1}},
            pay_table={"A": {3: 10.0, 5: 2.0}},
            min_cluster_size=5,
        )
        # Only size 5 counts: 0.1 × 2.0 = 0.2
        self.assertAlmostEqual(expected_pay_per_spin(params), 0.2)

    def test_missing_pay_contributes_zero(self):
        """Cluster size without matching pay entry contributes 0."""
        params = ClusterPaysParams(
            cluster_count_distribution={"A": {5: 0.1, 10: 0.05}},
            pay_table={"A": {5: 2.0}},
            min_cluster_size=5,
        )
        # Size 5 pays, size 10 has no pay → 0.1 × 2.0 + 0 = 0.2
        self.assertAlmostEqual(expected_pay_per_spin(params), 0.2)

    def test_multi_symbol_aggregation(self):
        """Multiple symbols sum independently."""
        params = ClusterPaysParams(
            cluster_count_distribution={
                "A": {5: 0.1, 6: 0.05},
                "B": {5: 0.2},
            },
            pay_table={
                "A": {5: 2.0, 6: 5.0},
                "B": {5: 1.0},
            },
            min_cluster_size=5,
        )
        # A: 0.1×2 + 0.05×5 = 0.45; B: 0.2×1 = 0.2; Total: 0.65
        self.assertAlmostEqual(expected_pay_per_spin(params), 0.65)


class TestClusterPaysRtp(unittest.TestCase):
    def test_audit_dict_shape(self):
        params = ClusterPaysParams(
            cluster_count_distribution={"A": {5: 0.1}},
            pay_table={"A": {5: 2.0}},
        )
        r = cluster_pays_rtp(params)
        self.assertIn("rtp_contribution", r)
        self.assertIn("grid", r)
        self.assertIn("adjacency", r)
        self.assertIn("per_symbol", r)
        self.assertEqual(len(r["per_symbol"]), 1)
        self.assertEqual(r["per_symbol"][0]["symbol"], "A")

    def test_sweet_bonanza_proxy(self):
        """7×7 grid, multi-symbol distribution."""
        params = ClusterPaysParams(
            cluster_count_distribution={
                "hp1": {5: 0.05, 6: 0.025, 7: 0.012},
                "hp2": {5: 0.06, 6: 0.030, 7: 0.015},
                "lp1": {5: 0.20, 6: 0.10, 7: 0.05},
            },
            pay_table={
                "hp1": {5: 5.0, 6: 10.0, 7: 25.0},
                "hp2": {5: 3.0, 6: 6.0, 7: 15.0},
                "lp1": {5: 0.5, 6: 1.0, 7: 2.5},
            },
            min_cluster_size=5,
            grid_rows=7, grid_cols=7,
        )
        r = cluster_pays_rtp(params)
        self.assertGreater(r["rtp_contribution"], 0.0)
        self.assertEqual(r["grid"], "7×7")
        self.assertEqual(len(r["per_symbol"]), 3)


class TestValidation(unittest.TestCase):
    def test_rejects_empty_distribution(self):
        with self.assertRaises(ValueError):
            ClusterPaysParams(
                cluster_count_distribution={},
                pay_table={"A": {5: 1.0}},
            )

    def test_rejects_empty_pay_table(self):
        with self.assertRaises(ValueError):
            ClusterPaysParams(
                cluster_count_distribution={"A": {5: 0.1}},
                pay_table={},
            )

    def test_rejects_zero_min_cluster(self):
        with self.assertRaises(ValueError):
            ClusterPaysParams(
                cluster_count_distribution={"A": {5: 0.1}},
                pay_table={"A": {5: 1.0}},
                min_cluster_size=0,
            )

    def test_rejects_negative_count(self):
        with self.assertRaises(ValueError):
            ClusterPaysParams(
                cluster_count_distribution={"A": {5: -0.1}},
                pay_table={"A": {5: 1.0}},
            )

    def test_rejects_negative_pay(self):
        with self.assertRaises(ValueError):
            ClusterPaysParams(
                cluster_count_distribution={"A": {5: 0.1}},
                pay_table={"A": {5: -1.0}},
            )

    def test_rejects_invalid_adjacency(self):
        with self.assertRaises(ValueError):
            ClusterPaysParams(
                cluster_count_distribution={"A": {5: 0.1}},
                pay_table={"A": {5: 1.0}},
                adjacency="diagonal-only",
            )

    def test_rejects_zero_cluster_size_key(self):
        with self.assertRaises(ValueError):
            ClusterPaysParams(
                cluster_count_distribution={"A": {0: 0.1}},
                pay_table={"A": {5: 1.0}},
            )


if __name__ == "__main__":
    unittest.main()
