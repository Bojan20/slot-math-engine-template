"""W244 wave 23 — sticky_wilds closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.sticky_wilds import (  # noqa: E402
    StickyWildsParams,
    _wild_count_distribution_at_respin,
    expected_pay_per_chain,
    expected_wilds_per_respin,
    sticky_wilds_rtp,
)


class TestWildCountDistribution(unittest.TestCase):
    def test_initial_state_concentrated(self):
        """Before any respin, P(k = initial_wilds) = 1, all else 0."""
        params = StickyWildsParams(
            trigger_p=0.01, n_respins=3, n_cells=15,
            p_wild_per_cell_per_respin=0.05,
            pay_per_wild_count={0: 0, 1: 0, 2: 1.0, 3: 5.0, 4: 25.0},
            initial_wilds=1,
        )
        dists = _wild_count_distribution_at_respin(params)
        # Initial dist (t=0)
        self.assertEqual(dists[0][1], 1.0)
        self.assertEqual(dists[0][0], 0.0)
        for k in range(2, 16):
            self.assertEqual(dists[0][k], 0.0)

    def test_distributions_sum_to_one(self):
        """Every t's distribution must sum to 1.0 (probability conservation)."""
        params = StickyWildsParams(
            trigger_p=0.01, n_respins=4, n_cells=15,
            p_wild_per_cell_per_respin=0.08,
            pay_per_wild_count={3: 1.0, 5: 5.0, 8: 25.0},
            initial_wilds=1,
        )
        dists = _wild_count_distribution_at_respin(params)
        for t, d in enumerate(dists):
            self.assertAlmostEqual(sum(d), 1.0, places=8,
                                   msg=f"t={t} sum != 1")

    def test_monotonic_expected_wilds(self):
        """E[W_t] strictly increases with t (more respins → more wilds)."""
        params = StickyWildsParams(
            trigger_p=0.01, n_respins=5, n_cells=15,
            p_wild_per_cell_per_respin=0.1,
            pay_per_wild_count={1: 1.0},
            initial_wilds=1,
        )
        e_per_t = expected_wilds_per_respin(params)
        for i in range(1, len(e_per_t)):
            self.assertGreater(e_per_t[i], e_per_t[i - 1])


class TestExpectedPayPerChain(unittest.TestCase):
    def test_zero_pay_table_returns_zero(self):
        """Pay table {0: 0, 1: 0, ...} → total chain pay 0."""
        params = StickyWildsParams(
            trigger_p=0.01, n_respins=3, n_cells=15,
            p_wild_per_cell_per_respin=0.1,
            pay_per_wild_count={k: 0.0 for k in range(16)},
            initial_wilds=1,
        )
        self.assertEqual(expected_pay_per_chain(params), 0.0)

    def test_linear_in_pay(self):
        """Doubling all pays doubles E[chain_pay]."""
        params_1x = StickyWildsParams(
            trigger_p=0.01, n_respins=3, n_cells=15,
            p_wild_per_cell_per_respin=0.05,
            pay_per_wild_count={1: 1.0, 2: 2.0, 3: 4.0, 4: 8.0},
            initial_wilds=1,
        )
        params_2x = StickyWildsParams(
            trigger_p=0.01, n_respins=3, n_cells=15,
            p_wild_per_cell_per_respin=0.05,
            pay_per_wild_count={1: 2.0, 2: 4.0, 3: 8.0, 4: 16.0},
            initial_wilds=1,
        )
        self.assertAlmostEqual(
            expected_pay_per_chain(params_2x),
            2.0 * expected_pay_per_chain(params_1x),
        )


class TestStickyWildsRtp(unittest.TestCase):
    def test_full_audit_dict(self):
        params = StickyWildsParams(
            trigger_p=0.01, n_respins=3, n_cells=15,
            p_wild_per_cell_per_respin=0.08,
            pay_per_wild_count={1: 0.5, 2: 1.5, 3: 5.0, 4: 25.0, 5: 100.0},
            initial_wilds=1,
        )
        r = sticky_wilds_rtp(params)
        self.assertIn("rtp_contribution", r)
        self.assertEqual(len(r["expected_wilds_per_respin"]), 3)
        # E[W_1] > initial (some wilds added in respin 1)
        self.assertGreater(r["expected_wilds_per_respin"][0], 1.0)


class TestValidation(unittest.TestCase):
    def test_rejects_zero_respins(self):
        with self.assertRaises(ValueError):
            StickyWildsParams(0.01, 0, 15, 0.1, {1: 1.0})

    def test_rejects_zero_cells(self):
        with self.assertRaises(ValueError):
            StickyWildsParams(0.01, 3, 0, 0.1, {1: 1.0})

    def test_rejects_initial_over_cells(self):
        with self.assertRaises(ValueError):
            StickyWildsParams(0.01, 3, 15, 0.1, {1: 1.0}, initial_wilds=16)

    def test_rejects_negative_initial(self):
        with self.assertRaises(ValueError):
            StickyWildsParams(0.01, 3, 15, 0.1, {1: 1.0}, initial_wilds=-1)

    def test_rejects_empty_pay_table(self):
        with self.assertRaises(ValueError):
            StickyWildsParams(0.01, 3, 15, 0.1, {})

    def test_rejects_negative_pay(self):
        with self.assertRaises(ValueError):
            StickyWildsParams(0.01, 3, 15, 0.1, {1: -1.0})

    def test_rejects_negative_pay_key(self):
        with self.assertRaises(ValueError):
            StickyWildsParams(0.01, 3, 15, 0.1, {-1: 1.0})

    def test_rejects_p_above_one(self):
        with self.assertRaises(ValueError):
            StickyWildsParams(0.01, 3, 15, 1.5, {1: 1.0})


if __name__ == "__main__":
    unittest.main()
