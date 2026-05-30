"""W244 wave 13 — pick_chain closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.pick_chain import (  # noqa: E402
    PickChainParams,
    PickLevel,
    expected_credit_per_pick,
    expected_picks_at_level,
    expected_total_award,
    level_advance_probability,
    level_credit_probability,
    level_end_probability,
    pick_chain_rtp,
)
from tools.math_dsl.spec import parse_spec, DslParseError  # noqa: E402


class TestLevelProbabilities(unittest.TestCase):
    def test_uniform_three_outcomes(self):
        # 12-pool, 6 credit / 3 end / 3 advance
        lvl = PickLevel("L1", 12, {1.0: 4, 2.0: 2, 0.0: 3, -1.0: 3})
        # credit (any positive award) = 6 of 12 = 0.5
        self.assertAlmostEqual(level_credit_probability(lvl), 0.5)
        # end = 3 of 12 = 0.25
        self.assertAlmostEqual(level_end_probability(lvl), 0.25)
        # advance = 3 of 12 = 0.25
        self.assertAlmostEqual(level_advance_probability(lvl), 0.25)


class TestExpectedCreditPerPick(unittest.TestCase):
    def test_weighted_average(self):
        # {1×: 4, 5×: 2} → E = (1×4 + 5×2)/(4+2) = 14/6 = 2.333
        lvl = PickLevel("L1", 6, {1.0: 4, 5.0: 2})
        self.assertAlmostEqual(expected_credit_per_pick(lvl), 14.0 / 6.0)

    def test_zero_credit_when_no_credit(self):
        # All end + advance, no credit
        lvl = PickLevel("L1", 4, {0.0: 2, -1.0: 2})
        self.assertEqual(expected_credit_per_pick(lvl), 0.0)


class TestExpectedPicksAtLevel(unittest.TestCase):
    def test_no_end_takes_all(self):
        # All credit, no end → take all picks
        lvl = PickLevel("L1", 5, {1.0: 5})
        self.assertEqual(expected_picks_at_level(lvl), 5.0)

    def test_one_end_in_pool(self):
        # n=8, end_count=1 → E[picks] = (8+1)/(1+1) = 4.5
        lvl = PickLevel("L1", 8, {1.0: 7, 0.0: 1})
        self.assertAlmostEqual(expected_picks_at_level(lvl), 4.5)


class TestExpectedTotalAward(unittest.TestCase):
    def test_single_level(self):
        # 6-pool, all 2× → 6 picks × 1.0 credit_p × 2.0 = 12.0
        params = PickChainParams(
            trigger_p=0.01,
            levels=(PickLevel("L1", 6, {2.0: 6}),),
        )
        e = expected_total_award(params)
        self.assertAlmostEqual(e, 12.0)

    def test_multi_level_with_advance(self):
        # L1: 4-pool, 2 credit×1 + 1 end + 1 advance → reach prob 50/50
        # L2: 4-pool, 4 credit×10 → if reached, big reward
        params = PickChainParams(
            trigger_p=0.05,
            levels=(
                PickLevel("L1", 4, {1.0: 2, 0.0: 1, -1.0: 1}),
                PickLevel("L2", 4, {10.0: 4}),
            ),
        )
        e = expected_total_award(params)
        # P(reach L2) = advance/(advance+end) = 1/2
        # L1 contribution: E[picks=2.5] × 0.5 credit_p × 1.0 = 1.25
        # L2 contribution: 0.5 reach × 4 picks × 1.0 × 10 = 20.0
        # Total ≈ 21.25
        self.assertGreater(e, 20.0)
        self.assertLess(e, 22.0)


class TestPickChainRtp(unittest.TestCase):
    def test_emits_full_breakdown(self):
        params = PickChainParams(
            trigger_p=0.01,
            levels=(PickLevel("L1", 6, {2.0: 6}),),
        )
        result = pick_chain_rtp(params)
        self.assertIn("rtp_contribution", result)
        self.assertIn("trigger_p", result)
        self.assertIn("expected_total_award_x_bet", result)
        self.assertIn("levels", result)
        self.assertEqual(len(result["levels"]), 1)
        # RTP = 0.01 × 12.0 = 0.12
        self.assertAlmostEqual(result["rtp_contribution"], 0.12)


class TestLevelValidation(unittest.TestCase):
    def test_rejects_pool_size_mismatch(self):
        with self.assertRaises(ValueError):
            PickLevel("L1", 10, {1.0: 5, 2.0: 4})  # 9, not 10

    def test_rejects_zero_pool(self):
        with self.assertRaises(ValueError):
            PickLevel("L1", 0, {1.0: 0})

    def test_rejects_negative_count(self):
        with self.assertRaises(ValueError):
            PickLevel("L1", 5, {1.0: 6, 0.0: -1})


PICK_CHAIN_GDD = """
schema_version: "1.0.0"
meta:
  name: "Pick Chain Test"
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
  - kind: pick_chain
    pick_trigger_p: 0.02
    pick_levels:
      - name: bronze
        pool_size: 12
        award_distribution:
          1: 4
          2: 2
          0: 3
          -1: 3
      - name: silver
        pool_size: 8
        award_distribution:
          5: 4
          10: 2
          0: 1
          -1: 1
      - name: gold
        pool_size: 6
        award_distribution:
          50: 4
          100: 2

paylines: 20

constraints:
  target_rtp: 0.96
  rtp_tolerance: 0.005
  volatility_class: high
  hit_freq_target: 0.22
  max_win_x: 25000
"""


class TestPickChainDsl(unittest.TestCase):
    def test_parses_pick_chain(self):
        spec = parse_spec(PICK_CHAIN_GDD)
        pcs = [f for f in spec.features if f.kind == "pick_chain"]
        self.assertEqual(len(pcs), 1)
        pc = pcs[0]
        self.assertAlmostEqual(pc.pick_trigger_p, 0.02)
        self.assertEqual(len(pc.pick_levels), 3)
        # Award distribution normalized to {float: int}
        bronze = pc.pick_levels[0]
        self.assertEqual(bronze["name"], "bronze")
        self.assertEqual(bronze["award_distribution"][1.0], 4)
        self.assertEqual(bronze["award_distribution"][-1.0], 3)

    def test_rejects_count_mismatch(self):
        bad = PICK_CHAIN_GDD.replace("pool_size: 12", "pool_size: 11")
        with self.assertRaises(DslParseError):
            parse_spec(bad)

    def test_rejects_missing_pool_size(self):
        bad = PICK_CHAIN_GDD.replace("pool_size: 12\n", "")
        with self.assertRaises(DslParseError):
            parse_spec(bad)

    def test_rejects_empty_levels(self):
        bad = PICK_CHAIN_GDD.replace(
            "pick_levels:\n      - name: bronze",
            "pick_levels: []\n      # dummy: bronze",
        )
        with self.assertRaises(DslParseError):
            parse_spec(bad)


if __name__ == "__main__":
    unittest.main()
