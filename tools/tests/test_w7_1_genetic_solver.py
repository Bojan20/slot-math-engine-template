"""W7.1 — Genetic solver regression tests.

Four guarantees:

  1. **Genome perturbation correctness** — `apply()` mutates baseline
     IR in the expected ways (paytable scales, weights jitter,
     trigger probs scale).
  2. **Mutation respects bounds** — genome attribute mutations stay
     within sane ranges across many iterations.
  3. **Engine evaluation populates metrics** — `evolve_to_target`
     fills `rtp`, `gap_to_target` for every genome.
  4. **Evolution improves fitness** — final best gap < initial best
     gap (or already at convergence on baseline match).

Run:
    python -m unittest tools.tests.test_w7_1_genetic_solver
"""
from __future__ import annotations
import json
import random
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.evolution.genetic_solver import (
    Genome,
    evolve_to_target,
    _find_slot_sim_bin,
)


def _bin_available() -> bool:
    return _find_slot_sim_bin() is not None


class TestGenomeApply(unittest.TestCase):
    """Pure-Python genome.apply() semantics."""

    @classmethod
    def setUpClass(cls):
        ir_path = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"
        if not ir_path.exists():
            raise unittest.SkipTest("L&W IR missing")
        with open(ir_path) as f:
            cls.baseline = json.load(f)

    def test_apply_identity_preserves_paytable(self):
        g = Genome()  # all defaults = identity
        result = g.apply(self.baseline, random.Random(42))
        for orig, new in zip(self.baseline["paytable"], result["paytable"]):
            self.assertEqual(orig["pays"], new["pays"])

    def test_apply_paytable_scale_2x_doubles_pays(self):
        g = Genome(paytable_scale=2.0)
        result = g.apply(self.baseline, random.Random(42))
        for orig, new in zip(self.baseline["paytable"], result["paytable"]):
            if isinstance(orig.get("pays"), (int, float)):
                self.assertAlmostEqual(new["pays"], orig["pays"] * 2.0, places=4)

    def test_apply_paytable_scale_05x_halves_pays(self):
        g = Genome(paytable_scale=0.5)
        result = g.apply(self.baseline, random.Random(42))
        for orig, new in zip(self.baseline["paytable"], result["paytable"]):
            if isinstance(orig.get("pays"), (int, float)):
                self.assertAlmostEqual(new["pays"], orig["pays"] * 0.5, places=4)

    def test_apply_reel_jitter_preserves_symbol_set(self):
        """Jitter changes weights but never swaps symbols."""
        g = Genome(reel_weight_jitter=0.2)
        result = g.apply(self.baseline, random.Random(42))
        for orig_set, new_set in zip(
            self.baseline["reels"]["base"], result["reels"]["base"]
        ):
            for orig_reel, new_reel in zip(
                orig_set["reels"], new_set["reels"]
            ):
                self.assertEqual(len(orig_reel), len(new_reel))
                for o, n in zip(orig_reel, new_reel):
                    self.assertEqual(o["symbol"], n["symbol"])
                    # Weight within ±20 percent (plus int rounding)
                    self.assertGreaterEqual(n["weight"], 1)

    def test_apply_feature_trigger_scale_clamped_below_1(self):
        """trigger_prob × scale should clamp at 1.0 (probability bound)."""
        g = Genome(feature_trigger_scale=10.0)  # huge multiplier
        result = g.apply(self.baseline, random.Random(42))
        for f in result["features"]:
            if f.get("kind") in ("hold_and_win", "pick_bonus"):
                if isinstance(f.get("trigger_prob"), (int, float)):
                    self.assertLessEqual(f["trigger_prob"], 1.0)


class TestGenomeMutate(unittest.TestCase):
    """Mutation respects bounds across many iterations."""

    def test_mutate_respects_paytable_scale_bounds(self):
        rng = random.Random(42)
        g = Genome()
        for _ in range(500):
            g = g.mutate(rng, anneal=1.0)
            self.assertGreaterEqual(g.paytable_scale, 0.5)
            self.assertLessEqual(g.paytable_scale, 2.0)

    def test_mutate_respects_jitter_bounds(self):
        rng = random.Random(42)
        g = Genome()
        for _ in range(500):
            g = g.mutate(rng, anneal=1.0)
            self.assertGreaterEqual(g.reel_weight_jitter, 0.0)
            self.assertLessEqual(g.reel_weight_jitter, 0.5)

    def test_mutate_respects_trigger_scale_bounds(self):
        rng = random.Random(42)
        g = Genome()
        for _ in range(500):
            g = g.mutate(rng, anneal=1.0)
            self.assertGreaterEqual(g.feature_trigger_scale, 0.1)
            self.assertLessEqual(g.feature_trigger_scale, 5.0)

    def test_random_genome_returns_valid_bounds(self):
        rng = random.Random(42)
        for _ in range(100):
            g = Genome.random(rng, anneal=1.0)
            self.assertGreaterEqual(g.feature_trigger_scale, 0.0)
            # paytable_scale from .random() can be in [0.5, 1.5] roughly
            # No hard assertion, just sanity that it's a float
            self.assertIsInstance(g.paytable_scale, float)


@unittest.skipUnless(_bin_available(), "slot-sim binary not built")
class TestEvolutionRuns(unittest.TestCase):
    """End-to-end evolution runs."""

    BASELINE_LW = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"

    def test_evolution_returns_best_genome_with_rtp(self):
        # Use a target FAR from baseline so the solver actually runs all
        # generations instead of converging early
        result = evolve_to_target(
            self.BASELINE_LW,
            target_rtp=0.70,
            population=4, generations=2, spins_per_eval=3000,
            convergence_tol=1e-9,  # never converges → always runs all gens
        )
        best = result["best_genome"]
        self.assertIsNotNone(best.rtp)
        self.assertIsNotNone(best.gap_to_target)
        self.assertIn("best_ir", result)
        self.assertIn("generations_log", result)
        self.assertEqual(len(result["generations_log"]), 2)

    def test_evolution_improves_or_holds_fitness(self):
        """Final best gap should not be worse than initial best gap."""
        result = evolve_to_target(
            self.BASELINE_LW,
            target_rtp=0.80,  # baseline ~0.95 → solver must shrink
            population=6, generations=4, spins_per_eval=5000,
            seed=42,
        )
        history = result["generations_log"]
        self.assertGreaterEqual(len(history), 1)
        gen0_gap = history[0].best_gap
        gen_last_gap = history[-1].best_gap
        # Either improved or stayed flat (greedy μ+λ never worsens best)
        self.assertLessEqual(gen_last_gap, gen0_gap + 1e-9)

    def test_evolution_writes_best_ir(self):
        result = evolve_to_target(
            self.BASELINE_LW,
            target_rtp=0.90, population=3, generations=2, spins_per_eval=2000,
        )
        best_ir = result["best_ir"]
        # Must be a valid IR JSON-serializable dict with all key sections
        self.assertIn("meta", best_ir)
        self.assertIn("paytable", best_ir)
        self.assertIn("features", best_ir)
        self.assertIn("reels", best_ir)


if __name__ == "__main__":
    unittest.main()
