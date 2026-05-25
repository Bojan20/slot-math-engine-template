"""W7.4 — Pareto solver (NSGA-II) regression tests.

Five guarantees:

  1. **Dominance** — Pareto-dominance is reflexive-free, antisymmetric,
     and transitive.
  2. **Non-dominated sort** — `fast_non_dominated_sort` produces fronts
     in strict dominance order (front 0 dominates ≥1 in front 1, etc.).
  3. **Crowding distance** — boundary genomes get +inf; spread is
     non-negative for inner genomes.
  4. **Volatility class** — string labels map to numeric targets.
  5. **E2E evolution** — engine-driven `evolve_pareto` returns a
     Pareto front of ≥1 genome with populated objectives.

Run:
    python -m unittest tools.tests.test_w7_4_pareto_solver
"""
from __future__ import annotations
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.evolution.genetic_solver import Genome, _find_slot_sim_bin
from tools.evolution.pareto_solver import (
    ParetoGenome,
    dominates,
    fast_non_dominated_sort,
    crowding_distance,
    crowded_compare,
    evolve_pareto,
    VOLATILITY_TARGETS,
)


def _bin_available() -> bool:
    return _find_slot_sim_bin() is not None


def _mk(*objs: float) -> ParetoGenome:
    return ParetoGenome(genome=Genome(), objectives=tuple(objs))


class TestDominance(unittest.TestCase):
    def test_dominates_when_strictly_better(self):
        a = _mk(0.1, 0.2)
        b = _mk(0.2, 0.3)
        self.assertTrue(dominates(a, b))
        self.assertFalse(dominates(b, a))

    def test_does_not_dominate_when_mixed(self):
        a = _mk(0.1, 0.3)
        b = _mk(0.2, 0.2)
        self.assertFalse(dominates(a, b))
        self.assertFalse(dominates(b, a))

    def test_does_not_dominate_equal(self):
        a = _mk(0.1, 0.2)
        b = _mk(0.1, 0.2)
        self.assertFalse(dominates(a, b))
        self.assertFalse(dominates(b, a))

    def test_dominates_when_equal_on_one_strictly_better_on_other(self):
        a = _mk(0.1, 0.2)
        b = _mk(0.1, 0.3)
        self.assertTrue(dominates(a, b))


class TestNonDominatedSort(unittest.TestCase):
    def test_single_genome_is_front_0(self):
        a = _mk(0.5, 0.5)
        fronts = fast_non_dominated_sort([a])
        self.assertEqual(len(fronts), 1)
        self.assertEqual(fronts[0], [a])
        self.assertEqual(a.rank, 0)

    def test_two_non_dominated_share_front_0(self):
        a = _mk(0.1, 0.5)
        b = _mk(0.5, 0.1)
        fronts = fast_non_dominated_sort([a, b])
        self.assertEqual(len(fronts[0]), 2)
        self.assertEqual(a.rank, 0)
        self.assertEqual(b.rank, 0)

    def test_dominated_genome_goes_to_front_1(self):
        a = _mk(0.1, 0.2)  # dominates b
        b = _mk(0.2, 0.3)
        fronts = fast_non_dominated_sort([a, b])
        self.assertEqual(len(fronts), 2)
        self.assertEqual(fronts[0], [a])
        self.assertEqual(fronts[1], [b])
        self.assertEqual(a.rank, 0)
        self.assertEqual(b.rank, 1)

    def test_complex_three_fronts(self):
        # Build a chain: a > b > c (each dominates the next)
        a = _mk(0.1, 0.1)
        b = _mk(0.2, 0.2)
        c = _mk(0.3, 0.3)
        fronts = fast_non_dominated_sort([c, b, a])  # mixed order
        self.assertEqual(len(fronts), 3)
        self.assertIn(a, fronts[0])
        self.assertIn(b, fronts[1])
        self.assertIn(c, fronts[2])


class TestCrowdingDistance(unittest.TestCase):
    def test_boundary_genomes_get_infinity(self):
        front = [_mk(0.1, 0.5), _mk(0.3, 0.3), _mk(0.5, 0.1)]
        crowding_distance(front)
        # After distance assignment, two genomes have +inf (boundary)
        crowdings = sorted(g.crowding for g in front)
        self.assertEqual(crowdings.count(math.inf), 2)

    def test_inner_genome_gets_positive_finite_crowding(self):
        front = [_mk(0.1, 0.5), _mk(0.3, 0.3), _mk(0.5, 0.1)]
        crowding_distance(front)
        # The middle one (after sort by either obj) has finite crowding
        inner = [g for g in front if not math.isinf(g.crowding)]
        self.assertEqual(len(inner), 1)
        self.assertGreaterEqual(inner[0].crowding, 0.0)

    def test_empty_front_is_safe(self):
        crowding_distance([])
        # No assertion — just ensure no exception


class TestCrowdedCompare(unittest.TestCase):
    def test_lower_rank_wins(self):
        a = _mk(0.1, 0.1)
        a.rank = 0
        a.crowding = 1.0
        b = _mk(0.2, 0.2)
        b.rank = 1
        b.crowding = 100.0
        self.assertEqual(crowded_compare(a, b), -1)
        self.assertEqual(crowded_compare(b, a), 1)

    def test_same_rank_higher_crowding_wins(self):
        a = _mk(0.1, 0.1)
        a.rank = 0
        a.crowding = 5.0
        b = _mk(0.2, 0.2)
        b.rank = 0
        b.crowding = 1.0
        self.assertEqual(crowded_compare(a, b), -1)


class TestVolatilityLabels(unittest.TestCase):
    def test_all_four_classes_defined(self):
        for label in ("low", "medium", "high", "ultra"):
            self.assertIn(label, VOLATILITY_TARGETS)
            self.assertGreater(VOLATILITY_TARGETS[label], 0)

    def test_classes_strictly_increasing(self):
        prev = 0
        for label in ("low", "medium", "high", "ultra"):
            v = VOLATILITY_TARGETS[label]
            self.assertGreater(v, prev, f"{label} should be > previous")
            prev = v


@unittest.skipUnless(_bin_available(), "slot-sim binary not built")
class TestEvolveParetoE2E(unittest.TestCase):
    BASELINE = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"

    def test_pareto_front_returned_non_empty(self):
        result = evolve_pareto(
            self.BASELINE,
            target_rtp=0.90,
            target_hit_freq=0.20,
            population=4, generations=2, spins_per_eval=3000,
        )
        front = result["pareto_front"]
        self.assertGreaterEqual(len(front), 1)
        for g in front:
            self.assertGreater(len(g.objectives), 0)
            self.assertEqual(g.rank, 0)

    def test_objectives_match_targets(self):
        result = evolve_pareto(
            self.BASELINE,
            target_rtp=0.85, target_hit_freq=0.20,
            target_volatility="medium",
            population=4, generations=2, spins_per_eval=3000,
        )
        # 3 objectives because we specified rtp + hit + vol
        front = result["pareto_front"]
        for g in front:
            self.assertEqual(len(g.objectives), 3)


if __name__ == "__main__":
    unittest.main()
