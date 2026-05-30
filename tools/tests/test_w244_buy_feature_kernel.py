"""W244 wave 15 — buy_feature closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.buy_feature import (  # noqa: E402
    BuyFeatureParams,
    buy_feature_audit,
    buy_rtp,
    delta_pp_vs_base,
    fair_buy_cost_x_bet,
    mga_2021_02_pass,
    ukgc_rts13c_pass,
)


class TestBuyRtp(unittest.TestCase):
    def test_simple_ratio(self):
        """Buy RTP = bonus_pay / cost. 96 RTP @ 100× cost → 96/100 = 0.96."""
        params = BuyFeatureParams(
            bonus_average_pay_x_bet=96.0,
            buy_cost_x_bet=100.0,
            base_game_rtp=0.96,
        )
        self.assertAlmostEqual(buy_rtp(params), 0.96)


class TestFairBuyCost(unittest.TestCase):
    def test_target_0p96(self):
        """fair = bonus_pay / target. 96 @ target 0.96 → fair = 100."""
        params = BuyFeatureParams(
            bonus_average_pay_x_bet=96.0,
            buy_cost_x_bet=100.0,
            base_game_rtp=0.96,
            target_buy_rtp=0.96,
        )
        self.assertAlmostEqual(fair_buy_cost_x_bet(params), 100.0)

    def test_target_0p97(self):
        """fair = 96 / 0.97 ≈ 98.97."""
        params = BuyFeatureParams(
            bonus_average_pay_x_bet=96.0,
            buy_cost_x_bet=100.0,
            base_game_rtp=0.96,
            target_buy_rtp=0.97,
        )
        self.assertAlmostEqual(fair_buy_cost_x_bet(params), 96.0 / 0.97)


class TestDeltaPpVsBase(unittest.TestCase):
    def test_zero_delta(self):
        """buy_rtp == base_rtp → 0 pp delta."""
        params = BuyFeatureParams(
            bonus_average_pay_x_bet=96.0,
            buy_cost_x_bet=100.0,
            base_game_rtp=0.96,
        )
        self.assertAlmostEqual(delta_pp_vs_base(params), 0.0)

    def test_positive_delta(self):
        """buy_rtp 0.97 vs base 0.96 → +1.0 pp."""
        params = BuyFeatureParams(
            bonus_average_pay_x_bet=97.0,
            buy_cost_x_bet=100.0,
            base_game_rtp=0.96,
        )
        self.assertAlmostEqual(delta_pp_vs_base(params), 1.0)

    def test_negative_delta(self):
        """buy_rtp 0.94 vs base 0.96 → -2.0 pp (buyer-side risk)."""
        params = BuyFeatureParams(
            bonus_average_pay_x_bet=94.0,
            buy_cost_x_bet=100.0,
            base_game_rtp=0.96,
        )
        self.assertAlmostEqual(delta_pp_vs_base(params), -2.0)


class TestUkgcRts13c(unittest.TestCase):
    def test_within_tolerance_pass(self):
        """delta 0.3 pp within 0.5 pp tolerance → PASS."""
        params = BuyFeatureParams(
            bonus_average_pay_x_bet=96.3,
            buy_cost_x_bet=100.0,
            base_game_rtp=0.96,
        )
        self.assertTrue(ukgc_rts13c_pass(params, tolerance_pp=0.5))

    def test_outside_tolerance_fail(self):
        """delta 1.0 pp exceeds 0.5 pp → FAIL."""
        params = BuyFeatureParams(
            bonus_average_pay_x_bet=97.0,
            buy_cost_x_bet=100.0,
            base_game_rtp=0.96,
        )
        self.assertFalse(ukgc_rts13c_pass(params, tolerance_pp=0.5))

    def test_negative_delta_pass(self):
        """delta -0.4 pp (buyer disadvantage) within 0.5 pp tolerance → PASS."""
        params = BuyFeatureParams(
            bonus_average_pay_x_bet=95.6,
            buy_cost_x_bet=100.0,
            base_game_rtp=0.96,
        )
        self.assertTrue(ukgc_rts13c_pass(params, tolerance_pp=0.5))


class TestMga2021_02(unittest.TestCase):
    def test_ceiling_0p96_strict(self):
        """buy_rtp 0.96 exactly at MGA ceiling → PASS (<=)."""
        params = BuyFeatureParams(
            bonus_average_pay_x_bet=96.0,
            buy_cost_x_bet=100.0,
            base_game_rtp=0.96,
        )
        self.assertTrue(mga_2021_02_pass(params, ceiling_rtp=0.96))

    def test_exceeds_ceiling_fail(self):
        """buy_rtp 0.97 > MGA 0.96 ceiling → FAIL."""
        params = BuyFeatureParams(
            bonus_average_pay_x_bet=97.0,
            buy_cost_x_bet=100.0,
            base_game_rtp=0.96,
        )
        self.assertFalse(mga_2021_02_pass(params, ceiling_rtp=0.96))


class TestBuyFeatureAudit(unittest.TestCase):
    def test_full_audit_dict(self):
        """Audit emits all keys + reasonable values."""
        params = BuyFeatureParams(
            bonus_average_pay_x_bet=96.0,
            buy_cost_x_bet=100.0,
            base_game_rtp=0.96,
            target_buy_rtp=0.96,
        )
        a = buy_feature_audit(params)
        expected_keys = {
            "bonus_average_pay_x_bet", "buy_cost_x_bet", "base_game_rtp",
            "target_buy_rtp", "buy_rtp", "fair_buy_cost_x_bet",
            "delta_pp_vs_base", "delta_pp_vs_target",
            "ukgc_rts13c_pass_0p5", "ukgc_rts13c_pass_1p0",
            "mga_2021_02_pass_0p96", "mga_2021_02_pass_0p97",
            # W244 wave 36 — composition compat
            "rtp_contribution",
        }
        self.assertEqual(set(a.keys()), expected_keys)
        self.assertAlmostEqual(a["buy_rtp"], 0.96)
        self.assertAlmostEqual(a["fair_buy_cost_x_bet"], 100.0)
        self.assertTrue(a["ukgc_rts13c_pass_0p5"])
        self.assertTrue(a["mga_2021_02_pass_0p96"])


class TestParamsValidation(unittest.TestCase):
    def test_rejects_negative_bonus_pay(self):
        with self.assertRaises(ValueError):
            BuyFeatureParams(-1, 100, 0.96)

    def test_rejects_zero_cost(self):
        with self.assertRaises(ValueError):
            BuyFeatureParams(96, 0, 0.96)

    def test_rejects_negative_cost(self):
        with self.assertRaises(ValueError):
            BuyFeatureParams(96, -1, 0.96)

    def test_rejects_base_rtp_above_one(self):
        with self.assertRaises(ValueError):
            BuyFeatureParams(96, 100, 1.01)

    def test_rejects_zero_base_rtp(self):
        with self.assertRaises(ValueError):
            BuyFeatureParams(96, 100, 0.0)


if __name__ == "__main__":
    unittest.main()
