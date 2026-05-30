"""W244 wave 33 — showcase game end-to-end MC validation acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.showcase_game import (  # noqa: E402
    _find_clusters,
    _roll_grid,
    acceptance_gate,
    closed_form_total_rtp,
    crimson_tiger_spec,
    monte_carlo_rtp,
)


class TestFindClusters(unittest.TestCase):
    def test_simple_two_clusters(self):
        """4×2 grid: hp1 left half, hp2 right half → 2 clusters of size 4."""
        g = [
            ["hp1", "hp1", "hp2", "hp2"],
            ["hp1", "hp1", "hp2", "hp2"],
        ]
        result = sorted(_find_clusters(g))
        self.assertEqual(result, [("hp1", 4), ("hp2", 4)])

    def test_diagonal_non_adjacent(self):
        """3×3 checkerboard: each cell separate (4-way not 8-way)."""
        g = [
            ["hp1", "lp1", "hp1"],
            ["lp1", "hp1", "lp1"],
            ["hp1", "lp1", "hp1"],
        ]
        clusters = _find_clusters(g)
        # 5 hp1 individual + 4 lp1 individual = 9 total clusters size 1
        self.assertEqual(len(clusters), 9)
        for _, size in clusters:
            self.assertEqual(size, 1)

    def test_skips_non_pay_symbols(self):
        """money / scatter / bonus / filler don't form clusters."""
        g = [
            ["money", "scatter", "bonus"],
            ["filler", "hp1", "filler"],
        ]
        clusters = _find_clusters(g)
        self.assertEqual(clusters, [("hp1", 1)])


class TestRollGrid(unittest.TestCase):
    def test_deterministic_seed(self):
        """Same seed → byte-identical grid."""
        import random
        spec = crimson_tiger_spec()
        rng1 = random.Random(42)
        rng2 = random.Random(42)
        g1 = _roll_grid(rng1, spec)
        g2 = _roll_grid(rng2, spec)
        self.assertEqual(g1, g2)


class TestClosedFormTotalRtp(unittest.TestCase):
    def test_all_components_positive(self):
        spec = crimson_tiger_spec()
        cf = closed_form_total_rtp(spec)
        self.assertGreater(cf["total_rtp"], 0.0)
        for k, v in cf["components"].items():
            self.assertGreaterEqual(v, 0.0, f"component {k} = {v} < 0")

    def test_components_sum_to_total(self):
        spec = crimson_tiger_spec()
        cf = closed_form_total_rtp(spec)
        manual_sum = sum(cf["components"].values())
        self.assertAlmostEqual(cf["total_rtp"], manual_sum, places=10)


class TestMonteCarloRtp(unittest.TestCase):
    def test_deterministic_across_runs(self):
        spec = crimson_tiger_spec()
        mc1 = monte_carlo_rtp(spec, n_spins=2000, seed=42)
        mc2 = monte_carlo_rtp(spec, n_spins=2000, seed=42)
        self.assertEqual(mc1["measured_cluster_pays_rtp"],
                         mc2["measured_cluster_pays_rtp"])
        self.assertEqual(mc1["empirical_cluster_distribution"],
                         mc2["empirical_cluster_distribution"])

    def test_empirical_distribution_covers_pay_symbols(self):
        spec = crimson_tiger_spec()
        mc = monte_carlo_rtp(spec, n_spins=2000, seed=42)
        for sym in {"hp1", "hp2", "lp1", "lp2"}:
            self.assertIn(sym, mc["empirical_cluster_distribution"],
                          f"missing symbol {sym}")


class TestAcceptanceGate(unittest.TestCase):
    def test_round_trip_self_consistency_n10k(self):
        """Kernel calibrated with MC's empirical distribution MUST match
        MC's measured RTP byte-exactly (modulo float epsilon × pay)."""
        spec = crimson_tiger_spec()
        gate = acceptance_gate(spec, n_spins=10_000, tolerance_pp=0.01, seed=42)
        self.assertTrue(gate["gate_pass"],
                        f"gate FAIL with delta {gate['delta_pp']:.6f} pp")
        # Stricter: delta should be effectively zero (float precision only)
        self.assertLess(gate["delta_pp"], 1e-6)

    def test_round_trip_self_consistency_n50k(self):
        spec = crimson_tiger_spec()
        gate = acceptance_gate(spec, n_spins=50_000, tolerance_pp=0.01, seed=42)
        self.assertTrue(gate["gate_pass"])
        self.assertLess(gate["delta_pp"], 1e-6)


if __name__ == "__main__":
    unittest.main()
