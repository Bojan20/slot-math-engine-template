"""Mission #3 — 12×12 Topology × Feature matrix regression tests."""
from __future__ import annotations
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.cert_lab.matrix_runner import (
    TOPOLOGY_KINDS,
    FEATURE_KINDS,
    build_synthetic_ir,
    run_matrix,
    _find_slot_sim_bin,
)


def _bin_available() -> bool:
    return _find_slot_sim_bin() is not None


class TestMatrixSize(unittest.TestCase):
    def test_12_topologies_defined(self):
        self.assertEqual(len(TOPOLOGY_KINDS), 12,
                          f"expected 12 topologies, got {len(TOPOLOGY_KINDS)}")

    def test_12_features_defined(self):
        self.assertEqual(len(FEATURE_KINDS), 12,
                          f"expected 12 features, got {len(FEATURE_KINDS)}")

    def test_total_cells_144(self):
        self.assertEqual(len(TOPOLOGY_KINDS) * len(FEATURE_KINDS), 144)


class TestSyntheticIRBuilder(unittest.TestCase):
    def test_every_pair_builds_ir(self):
        for t in TOPOLOGY_KINDS:
            for f in FEATURE_KINDS:
                with self.subTest(topology=t.value, feature=f.value):
                    ir = build_synthetic_ir(t, f)
                    self.assertIn("meta", ir)
                    self.assertIn("topology", ir)
                    self.assertIn("evaluation", ir)
                    self.assertIn("symbols", ir)
                    self.assertIn("reels", ir)
                    self.assertIn("paytable", ir)
                    self.assertIn("features", ir)


@unittest.skipUnless(_bin_available(), "slot-sim binary required")
class TestFullMatrix(unittest.TestCase):
    def test_full_12x12_no_engine_failures(self):
        """Every cell must either PASS or be explicitly SKIPPED — zero
        unexpected engine failures."""
        report = run_matrix(spins_per_cell=2000, seed=42)
        self.assertEqual(report.failed, 0,
                          f"unexpected engine failures: "
                          f"{[(c.topology.value, c.feature.value, c.reason) for c in report.cells if not c.passed and not c.skipped]}")
        self.assertEqual(report.total_cells, 144)
        # At least 50 runnable cells must pass (5×3 + 5×4 + ways + cluster
        # × all features = >50)
        self.assertGreaterEqual(report.passed, 50)

    def test_report_serializes_to_dict(self):
        report = run_matrix(spins_per_cell=1000, seed=42)
        d = report.to_dict()
        for key in ("total_cells", "passed", "failed", "skipped",
                    "pass_rate", "elapsed_s", "cells"):
            self.assertIn(key, d)
        self.assertEqual(len(d["cells"]), report.total_cells)


if __name__ == "__main__":
    unittest.main()
