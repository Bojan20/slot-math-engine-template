"""W244 wave 31 — asymmetric_paytable closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.asymmetric_paytable import (  # noqa: E402
    AsymmetricPaytableParams,
    asymmetric_paytable_rtp,
)


class TestAsymmetricPaytableRtp(unittest.TestCase):
    def test_simple_aggregation(self):
        """Single symbol, single shape: RTP = single contribution."""
        params = AsymmetricPaytableParams(
            per_symbol_contributions={"A": {"shape_a": 0.25}},
        )
        r = asymmetric_paytable_rtp(params)
        self.assertAlmostEqual(r["rtp_contribution"], 0.25)
        self.assertEqual(r["symbols_count"], 1)

    def test_multi_symbol_aggregation(self):
        """Total = sum of all per-symbol contributions."""
        params = AsymmetricPaytableParams(
            per_symbol_contributions={
                "A": {"left_only": 0.20, "any": 0.05},
                "B": {"any": 0.15},
            },
        )
        r = asymmetric_paytable_rtp(params)
        # 0.20 + 0.05 + 0.15 = 0.40
        self.assertAlmostEqual(r["rtp_contribution"], 0.40)
        self.assertEqual(r["symbols_count"], 2)


class TestValidation(unittest.TestCase):
    def test_rejects_empty_contributions(self):
        with self.assertRaises(ValueError):
            AsymmetricPaytableParams(per_symbol_contributions={})

    def test_rejects_empty_symbol_table(self):
        with self.assertRaises(ValueError):
            AsymmetricPaytableParams(per_symbol_contributions={"A": {}})

    def test_rejects_negative_contribution(self):
        with self.assertRaises(ValueError):
            AsymmetricPaytableParams(
                per_symbol_contributions={"A": {"shape": -0.1}},
            )


if __name__ == "__main__":
    unittest.main()
