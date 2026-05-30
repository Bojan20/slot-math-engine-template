"""W244 wave 11 — charge_meter closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.charge_meter import (  # noqa: E402
    ChargeMeterParams,
    ChargeTier,
    charge_meter_rtp,
    expected_charge_from_distribution,
    rtp_contribution_per_tier,
)
from tools.math_dsl.spec import parse_spec, DslParseError  # noqa: E402


class TestExpectedChargeFromDistribution(unittest.TestCase):
    def test_uniform(self):
        # {0:1, 1:1, 2:1} → mean = 1.0
        self.assertAlmostEqual(
            expected_charge_from_distribution({0.0: 1, 1.0: 1, 2.0: 1}),
            1.0,
        )

    def test_weighted(self):
        # 80% × 0 + 20% × 5 = 1.0
        self.assertAlmostEqual(
            expected_charge_from_distribution({0.0: 4, 5.0: 1}),
            1.0,
        )

    def test_zero_weights_raises(self):
        with self.assertRaises(ValueError):
            expected_charge_from_distribution({1.0: 0, 2.0: 0})


class TestRtpContributionPerTier(unittest.TestCase):
    def test_wald_identity(self):
        """Per-tier RTP = (E[charge]/threshold) × award."""
        tier = ChargeTier("grand", threshold=100.0, award_value_x_bet=50.0)
        rtp = rtp_contribution_per_tier(2.0, tier)
        # E[charges_per_spin] = 2 / 100 = 0.02; award = 50 → rtp = 1.0
        self.assertAlmostEqual(rtp, 1.0)

    def test_zero_charge_zero_rtp(self):
        tier = ChargeTier("mini", threshold=10.0, award_value_x_bet=5.0)
        self.assertEqual(rtp_contribution_per_tier(0.0, tier), 0.0)


class TestChargeMeterRtp(unittest.TestCase):
    def test_single_tier_starburst_like(self):
        """Mean charge 0.5 / spin, threshold 50, award 10× → RTP=0.10."""
        params = ChargeMeterParams(
            expected_charge_per_spin=0.5,
            tiers=(ChargeTier("classic", 50.0, 10.0),),
        )
        result = charge_meter_rtp(params)
        # 0.5/50 × 10 = 0.10
        self.assertAlmostEqual(result["rtp_contribution"], 0.10)
        self.assertEqual(len(result["tiers"]), 1)

    def test_multi_tier_sums_correctly(self):
        """Three tiers: small/medium/grand, RTPs sum to total."""
        params = ChargeMeterParams(
            expected_charge_per_spin=1.0,
            tiers=(
                ChargeTier("small", 20.0, 4.0),       # 0.20 RTP
                ChargeTier("medium", 100.0, 30.0),    # 0.30 RTP
                ChargeTier("grand", 1000.0, 500.0),   # 0.50 RTP
            ),
        )
        result = charge_meter_rtp(params)
        # 4/20 + 30/100 + 500/1000 = 0.2 + 0.3 + 0.5 = 1.0
        self.assertAlmostEqual(result["rtp_contribution"], 1.0)
        # Per-tier breakdown is monotonic by threshold (ordered as given)
        names = [t["name"] for t in result["tiers"]]
        self.assertEqual(names, ["small", "medium", "grand"])


class TestParamsValidation(unittest.TestCase):
    def test_rejects_negative_charge(self):
        with self.assertRaises(ValueError):
            ChargeMeterParams(
                expected_charge_per_spin=-0.1,
                tiers=(ChargeTier("a", 10.0, 1.0),),
            )

    def test_rejects_empty_tiers(self):
        with self.assertRaises(ValueError):
            ChargeMeterParams(expected_charge_per_spin=1.0, tiers=())

    def test_rejects_unsorted_thresholds(self):
        with self.assertRaises(ValueError):
            ChargeMeterParams(
                expected_charge_per_spin=1.0,
                tiers=(
                    ChargeTier("big", 100.0, 50.0),
                    ChargeTier("small", 10.0, 1.0),  # out of order
                ),
            )

    def test_rejects_zero_threshold(self):
        with self.assertRaises(ValueError):
            ChargeTier("bad", threshold=0.0, award_value_x_bet=1.0)

    def test_rejects_negative_award(self):
        with self.assertRaises(ValueError):
            ChargeTier("bad", threshold=10.0, award_value_x_bet=-1.0)


CHARGE_METER_GDD = """
schema_version: "1.0.0"
meta:
  name: "Charge Meter Test"
  vendor: "vendor_b"

topology:
  kind: rectangular
  reels: 5
  rows: 3

symbols:
  - id: wild
    kind: wild
  - id: hp1
    kind: hp
  - id: hp2
    kind: hp
  - id: lp1
    kind: lp
  - id: lp2
    kind: lp

features:
  - kind: charge_meter
    charge_per_spin: 1.0
    charge_persistent: false
    charge_tiers:
      - name: small
        threshold: 20
        award_value_x_bet: 4
        award_kind: credit_x_bet
      - name: medium
        threshold: 100
        award_value_x_bet: 30
        award_kind: credit_x_bet
      - name: grand
        threshold: 1000
        award_value_x_bet: 500
        award_kind: free_spin_trigger

paylines: 20

constraints:
  target_rtp: 0.96
  rtp_tolerance: 0.005
  volatility_class: high
  hit_freq_target: 0.22
  max_win_x: 25000
"""


class TestChargeMeterDsl(unittest.TestCase):
    def test_parses_charge_meter_feature(self):
        spec = parse_spec(CHARGE_METER_GDD)
        cms = [f for f in spec.features if f.kind == "charge_meter"]
        self.assertEqual(len(cms), 1)
        cm = cms[0]
        self.assertEqual(cm.charge_per_spin, 1.0)
        self.assertEqual(cm.charge_persistent, False)
        self.assertIsInstance(cm.charge_tiers, list)
        self.assertEqual(len(cm.charge_tiers), 3)
        self.assertEqual(cm.charge_tiers[0]["name"], "small")

    def test_rejects_empty_tiers(self):
        bad = CHARGE_METER_GDD.replace(
            "charge_tiers:\n      - name: small",
            "charge_tiers: small_only",  # not a list
        )
        with self.assertRaises(DslParseError):
            parse_spec(bad)

    def test_rejects_missing_threshold(self):
        bad = CHARGE_METER_GDD.replace("threshold: 20\n", "")
        with self.assertRaises(DslParseError):
            parse_spec(bad)

    def test_rejects_zero_threshold(self):
        bad = CHARGE_METER_GDD.replace("threshold: 20", "threshold: 0")
        with self.assertRaises(DslParseError):
            parse_spec(bad)


if __name__ == "__main__":
    unittest.main()
