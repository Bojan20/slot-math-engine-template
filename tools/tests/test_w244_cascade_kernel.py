"""W244 wave 20 — cascade closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.cascade import (  # noqa: E402
    CascadeParams,
    cascade_rtp,
    expected_chain_length,
    expected_pay_per_trigger,
)


class TestExpectedChainLength(unittest.TestCase):
    def test_p_zero(self):
        """No cascade ever → E[chain_len] = 0."""
        params = CascadeParams(
            p_initial_win=0.3, base_pay_per_cascade_x_bet=1.0,
            p_win_per_cascade=0.0, multiplier_ladder=(1.0,),
        )
        self.assertEqual(expected_chain_length(params), 0.0)

    def test_p_one_deterministic(self):
        """p=1 → cascade always continues → E[chain_len] = max_chain."""
        params = CascadeParams(
            p_initial_win=0.3, base_pay_per_cascade_x_bet=1.0,
            p_win_per_cascade=1.0, multiplier_ladder=(1.0,),
            max_chain=10,
        )
        self.assertEqual(expected_chain_length(params), 10.0)

    def test_geometric_formula(self):
        """p=0.5, max=10: E = 0.5 × (1 - 0.5^10) / 0.5 = 1 - 1/1024 ≈ 0.999."""
        params = CascadeParams(
            p_initial_win=0.3, base_pay_per_cascade_x_bet=1.0,
            p_win_per_cascade=0.5, multiplier_ladder=(1.0,),
            max_chain=10,
        )
        e = expected_chain_length(params)
        self.assertAlmostEqual(e, 1.0 - 1.0 / 1024.0)


class TestExpectedPayPerTrigger(unittest.TestCase):
    def test_no_cascade(self):
        """p=0 → only step 1 fires → total = mult[1] × base_pay."""
        params = CascadeParams(
            p_initial_win=0.1, base_pay_per_cascade_x_bet=1.0,
            p_win_per_cascade=0.0, multiplier_ladder=(1.0,),
        )
        # Step 1: 1.0 × 1.0 × 1.0 = 1.0
        self.assertAlmostEqual(expected_pay_per_trigger(params), 1.0)

    def test_multiplier_ramp(self):
        """ladder=[1,2,4,8,16], p=0.5: each step halves chance, mult doubles.

        Sum: 1×1 + 0.5×2 + 0.25×4 + 0.125×8 + 0.0625×16 = 1 + 1 + 1 + 1 + 1 = 5.0
        """
        params = CascadeParams(
            p_initial_win=0.1, base_pay_per_cascade_x_bet=1.0,
            p_win_per_cascade=0.5, multiplier_ladder=(1.0, 2.0, 4.0, 8.0, 16.0),
            max_chain=5,
        )
        self.assertAlmostEqual(expected_pay_per_trigger(params), 5.0)

    def test_truncates_at_max_chain(self):
        """max_chain=3 with infinite ramp: only first 3 steps count."""
        params = CascadeParams(
            p_initial_win=0.1, base_pay_per_cascade_x_bet=1.0,
            p_win_per_cascade=1.0, multiplier_ladder=(1.0, 2.0, 4.0),
            max_chain=3,
        )
        # All probabilities 1 (p_cascade=1), so 1 + 2 + 4 = 7
        self.assertAlmostEqual(expected_pay_per_trigger(params), 7.0)


class TestCascadeRtp(unittest.TestCase):
    def test_full_audit(self):
        params = CascadeParams(
            p_initial_win=0.25, base_pay_per_cascade_x_bet=0.4,
            p_win_per_cascade=0.4,
            multiplier_ladder=(1.0, 2.0, 4.0, 8.0, 16.0),
            max_chain=10,
        )
        r = cascade_rtp(params)
        self.assertIn("rtp_contribution", r)
        self.assertIn("expected_chain_length", r)
        self.assertIn("per_step_breakdown", r)
        self.assertEqual(len(r["per_step_breakdown"]), 10)
        # Step 1 always reached, so p_reach=1.0
        self.assertEqual(r["per_step_breakdown"][0]["p_reach"], 1.0)
        # Step 10 p_reach = 0.4^9 ≈ 0.000262144
        self.assertAlmostEqual(r["per_step_breakdown"][9]["p_reach"], 0.4 ** 9)


class TestValidation(unittest.TestCase):
    def test_rejects_p_initial_above_one(self):
        with self.assertRaises(ValueError):
            CascadeParams(1.5, 1.0, 0.5, (1.0,))

    def test_rejects_negative_pay(self):
        with self.assertRaises(ValueError):
            CascadeParams(0.5, -0.1, 0.5, (1.0,))

    def test_rejects_empty_ladder(self):
        with self.assertRaises(ValueError):
            CascadeParams(0.5, 1.0, 0.5, ())

    def test_rejects_negative_ladder_value(self):
        with self.assertRaises(ValueError):
            CascadeParams(0.5, 1.0, 0.5, (1.0, -1.0))

    def test_rejects_max_chain_zero(self):
        with self.assertRaises(ValueError):
            CascadeParams(0.5, 1.0, 0.5, (1.0,), max_chain=0)

    def test_rejects_p_cascade_above_one(self):
        with self.assertRaises(ValueError):
            CascadeParams(0.5, 1.0, 1.1, (1.0,))


if __name__ == "__main__":
    unittest.main()
