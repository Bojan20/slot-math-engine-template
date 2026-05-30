"""W244 wave 18 — expanding_symbol FS closed-form kernel acceptance."""
from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.expanding_symbol import (  # noqa: E402
    ExpandingSymbolParams,
    expanding_symbol_rtp,
    expected_pay_per_fs_spin,
    expected_pay_per_trigger,
    expected_reels_expanded,
    reel_expansion_probability,
)


class TestReelExpansionProbability(unittest.TestCase):
    def test_zero_p_zero(self):
        self.assertEqual(reel_expansion_probability(0.0, 3), 0.0)

    def test_full_p_one(self):
        self.assertEqual(reel_expansion_probability(1.0, 3), 1.0)

    def test_p_0p1_rows_3(self):
        """1 - 0.9^3 = 1 - 0.729 = 0.271."""
        self.assertAlmostEqual(reel_expansion_probability(0.1, 3), 0.271)


class TestExpectedReelsExpanded(unittest.TestCase):
    def test_linearity(self):
        """E[k] = reels × p_per_reel."""
        e = expected_reels_expanded(0.1, 5, 3)
        # 5 × 0.271 = 1.355
        self.assertAlmostEqual(e, 1.355)


class TestExpectedPayPerFsSpin(unittest.TestCase):
    def test_no_expansion_zero_pay(self):
        """p=0 → never expand → pay=0."""
        params = ExpandingSymbolParams(
            fs_trigger_p=0.01,
            fs_initial_spins=10,
            reels=5,
            rows=3,
            p_per_cell_in_fs=0.0,
            pay_table={3: 1.0, 4: 5.0, 5: 100.0},
        )
        # k=0 always, pay_table[0] = 0 default
        self.assertAlmostEqual(expected_pay_per_fs_spin(params), 0.0)

    def test_binomial_calculation(self):
        """5 reels × p=0.5, pay_table {0..5: k} → E[pay] = E[k] = 5×0.5 = 2.5."""
        params = ExpandingSymbolParams(
            fs_trigger_p=0.01,
            fs_initial_spins=10,
            reels=5,
            rows=1,  # rows=1 → p_per_reel = p_per_cell directly
            p_per_cell_in_fs=0.5,
            pay_table={0: 0, 1: 1.0, 2: 2.0, 3: 3.0, 4: 4.0, 5: 5.0},
        )
        # Binomial(5, 0.5), pay_table[k] = k → E[pay] = E[k] = 2.5
        self.assertAlmostEqual(expected_pay_per_fs_spin(params), 2.5)

    def test_book_of_dead_proxy(self):
        """Book-style pay table: 0/0/0/1/5/100, rare full-reel jackpot."""
        params = ExpandingSymbolParams(
            fs_trigger_p=0.01,
            fs_initial_spins=10,
            reels=5,
            rows=3,
            p_per_cell_in_fs=0.12,  # boosted in FS
            pay_table={3: 1.0, 4: 5.0, 5: 100.0},
        )
        # p_per_reel = 1 - 0.88^3 = 0.318272
        # Binomial(5, 0.318272), pay non-zero only for k∈{3,4,5}
        e_pay = expected_pay_per_fs_spin(params)
        # Should be a small positive number (mostly k<3)
        self.assertGreater(e_pay, 0.0)
        self.assertLess(e_pay, 10.0)

        # Verify by hand-computed binomial sum
        p_reel = 1.0 - 0.88 ** 3
        ref = 0.0
        for k in range(6):
            pmf = math.comb(5, k) * (p_reel ** k) * ((1 - p_reel) ** (5 - k))
            ref += pmf * params.pay_table.get(k, 0.0)
        self.assertAlmostEqual(e_pay, ref, places=10)


class TestExpectedPayPerTrigger(unittest.TestCase):
    def test_multiplies_by_fs_spins(self):
        """trigger total = fs_spins × per_spin_pay."""
        params = ExpandingSymbolParams(
            fs_trigger_p=0.01,
            fs_initial_spins=10,
            reels=5,
            rows=1,
            p_per_cell_in_fs=0.5,
            pay_table={0: 0, 1: 1.0, 2: 2.0, 3: 3.0, 4: 4.0, 5: 5.0},
        )
        # E_per_spin = 2.5, trigger = 25.0
        self.assertAlmostEqual(expected_pay_per_trigger(params), 25.0)


class TestExpandingSymbolRtp(unittest.TestCase):
    def test_full_breakdown(self):
        params = ExpandingSymbolParams(
            fs_trigger_p=0.01,
            fs_initial_spins=10,
            reels=5,
            rows=3,
            p_per_cell_in_fs=0.12,
            pay_table={3: 1.0, 4: 5.0, 5: 100.0},
            symbol_name="explorer",
        )
        r = expanding_symbol_rtp(params)
        # Validate audit dict shape
        self.assertIn("rtp_contribution", r)
        self.assertIn("fs_trigger_p", r)
        self.assertIn("p_per_reel", r)
        self.assertIn("expected_reels_expanded_per_spin", r)
        self.assertEqual(r["symbol_name"], "explorer")
        # rtp = trigger_p × fs_spins × per_spin_pay → small positive
        self.assertGreater(r["rtp_contribution"], 0.0)


class TestValidation(unittest.TestCase):
    def test_rejects_zero_fs_spins(self):
        with self.assertRaises(ValueError):
            ExpandingSymbolParams(0.01, 0, 5, 3, 0.1, {3: 1.0})

    def test_rejects_zero_reels(self):
        with self.assertRaises(ValueError):
            ExpandingSymbolParams(0.01, 10, 0, 3, 0.1, {3: 1.0})

    def test_rejects_p_above_one(self):
        with self.assertRaises(ValueError):
            ExpandingSymbolParams(0.01, 10, 5, 3, 1.1, {3: 1.0})

    def test_rejects_empty_pay_table(self):
        with self.assertRaises(ValueError):
            ExpandingSymbolParams(0.01, 10, 5, 3, 0.1, {})

    def test_rejects_negative_pay_value(self):
        with self.assertRaises(ValueError):
            ExpandingSymbolParams(0.01, 10, 5, 3, 0.1, {3: -1.0})

    def test_rejects_negative_pay_table_key(self):
        with self.assertRaises(ValueError):
            ExpandingSymbolParams(0.01, 10, 5, 3, 0.1, {-1: 1.0})


if __name__ == "__main__":
    unittest.main()
