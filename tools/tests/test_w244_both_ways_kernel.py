"""W244 wave 30 — both_ways evaluator closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.both_ways import (  # noqa: E402
    BothWaysParams,
    bidirectional_multiplier,
    both_ways_rtp,
)


class TestBidirectionalMultiplier(unittest.TestCase):
    def test_full_line_share_doubles(self):
        """All RTP is line pay → multiplier = 2.0."""
        params = BothWaysParams(ltr_only_rtp=0.96, line_pay_share=1.0)
        self.assertAlmostEqual(bidirectional_multiplier(params), 2.0)

    def test_no_line_share_no_uplift(self):
        """All RTP is scatter → multiplier = 1.0 (no doubling)."""
        params = BothWaysParams(ltr_only_rtp=0.96, line_pay_share=0.0)
        self.assertAlmostEqual(bidirectional_multiplier(params), 1.0)

    def test_partial_share(self):
        """70 % line, 30 % scatter → multiplier = 1.70."""
        params = BothWaysParams(ltr_only_rtp=0.96, line_pay_share=0.7)
        self.assertAlmostEqual(bidirectional_multiplier(params), 1.7)


class TestBothWaysRtp(unittest.TestCase):
    def test_thunderstruck_proxy(self):
        """Thunderstruck both-ways: 0.96 LTR × 1.7 = 1.632 RTP."""
        params = BothWaysParams(ltr_only_rtp=0.96, line_pay_share=0.7)
        r = both_ways_rtp(params)
        self.assertAlmostEqual(r["rtp_contribution"], 1.632)
        self.assertAlmostEqual(r["uplift_x_bet"], 0.672)

    def test_starburst_proxy(self):
        """Starburst both-ways: 96 % LTR, ~80 % is line → multiplier=1.8."""
        params = BothWaysParams(ltr_only_rtp=0.96, line_pay_share=0.8)
        r = both_ways_rtp(params)
        self.assertAlmostEqual(r["rtp_contribution"], 0.96 * 1.8)

    def test_audit_fields(self):
        params = BothWaysParams(ltr_only_rtp=0.5, line_pay_share=0.5)
        r = both_ways_rtp(params)
        self.assertIn("ltr_only_rtp", r)
        self.assertIn("line_pay_share", r)
        self.assertIn("bidirectional_multiplier", r)
        self.assertIn("line_pay_ltr", r)
        self.assertIn("line_pay_doubled", r)
        self.assertIn("scatter_bonus_unchanged", r)
        self.assertIn("uplift_x_bet", r)
        # Line LTR pay = 0.5 × 0.5 = 0.25; doubled = 0.5; scatter = 0.25
        self.assertAlmostEqual(r["line_pay_ltr"], 0.25)
        self.assertAlmostEqual(r["line_pay_doubled"], 0.5)
        self.assertAlmostEqual(r["scatter_bonus_unchanged"], 0.25)


class TestValidation(unittest.TestCase):
    def test_rejects_ltr_above_two(self):
        with self.assertRaises(ValueError):
            BothWaysParams(ltr_only_rtp=2.5, line_pay_share=1.0)

    def test_rejects_negative_ltr(self):
        with self.assertRaises(ValueError):
            BothWaysParams(ltr_only_rtp=-0.1, line_pay_share=1.0)

    def test_rejects_line_share_above_one(self):
        with self.assertRaises(ValueError):
            BothWaysParams(ltr_only_rtp=0.96, line_pay_share=1.5)

    def test_rejects_negative_line_share(self):
        with self.assertRaises(ValueError):
            BothWaysParams(ltr_only_rtp=0.96, line_pay_share=-0.1)


if __name__ == "__main__":
    unittest.main()
