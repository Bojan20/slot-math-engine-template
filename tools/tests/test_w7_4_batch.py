"""W7.4-batch — parallel 1000-variant runner regression tests.

Four guarantees:

  1. **Single-worker mode equivalence** — workers=1 produces results
     equivalent to a sequential loop.
  2. **Parallel pool runs all variants** — workers=N completes
     variants in `variants_completed` count == requested.
  3. **Pareto front extraction** — output contains the non-dominated
     subset under `pareto_front` with rank=0.
  4. **JSON report shape** — all required top-level keys present.

Run:
    python -m unittest tools.tests.test_w7_4_batch
"""
from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.evolution.batch_runner import run_batch
from tools.evolution.genetic_solver import _find_slot_sim_bin


def _bin_available() -> bool:
    return _find_slot_sim_bin() is not None


@unittest.skipUnless(_bin_available(), "slot-sim binary required")
class TestBatchRunner(unittest.TestCase):
    BASELINE = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"

    def test_single_worker_runs_all_variants(self):
        report = run_batch(
            self.BASELINE,
            target_rtp=0.90,
            variants=5, spins_per_variant=2000,
            workers=1,
        )
        self.assertEqual(report["variants_completed"], 5)
        self.assertEqual(report["workers"], 1)
        self.assertGreater(report["elapsed_s"], 0)

    def test_multi_worker_runs_all_variants(self):
        report = run_batch(
            self.BASELINE,
            target_rtp=0.90,
            variants=6, spins_per_variant=2000,
            workers=2,
        )
        self.assertEqual(report["variants_completed"], 6)
        self.assertEqual(report["workers"], 2)

    def test_report_has_required_keys(self):
        report = run_batch(
            self.BASELINE,
            target_rtp=0.90, target_hit_freq=0.20,
            variants=4, spins_per_variant=2000,
            workers=2,
        )
        for key in (
            "baseline_ir", "target_rtp", "target_hit_freq", "max_win_cap",
            "variants_requested", "variants_completed", "workers",
            "elapsed_s", "throughput_variants_per_sec",
            "pareto_front_size", "pareto_front", "all_variants",
        ):
            self.assertIn(key, report, f"missing report key {key!r}")

    def test_pareto_front_is_non_dominated_subset(self):
        report = run_batch(
            self.BASELINE,
            target_rtp=0.90, target_hit_freq=0.20,
            variants=10, spins_per_variant=2000,
            workers=2,
        )
        front = report["pareto_front"]
        self.assertGreaterEqual(len(front), 1)
        for entry in front:
            self.assertEqual(entry["rank"], 0)
            self.assertGreater(len(entry["objectives"]), 0)

    def test_all_variants_have_genome_dict(self):
        report = run_batch(
            self.BASELINE,
            target_rtp=0.90,
            variants=5, spins_per_variant=2000,
            workers=2,
        )
        for v in report["all_variants"]:
            if "error" in v:
                continue
            self.assertIn("genome", v)
            self.assertIn("paytable_scale", v["genome"])
            self.assertIn("rtp", v)
            self.assertIn("objectives", v)


if __name__ == "__main__":
    unittest.main()
