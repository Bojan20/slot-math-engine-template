"""W244 wave 12 — must_hit_by closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.must_hit_by import (  # noqa: E402
    MustHitByParams,
    MustHitByPot,
    expected_spins_to_cap,
    expected_strike_value,
    must_hit_by_rtp,
    per_pot_rtp_contribution,
    probability_forced_strike,
)
from tools.math_dsl.spec import parse_spec, DslParseError  # noqa: E402


class TestExpectedSpinsToCap(unittest.TestCase):
    def test_linear_pot_growth(self):
        """(must_hit - seed) / contribution = spins."""
        pot = MustHitByPot("grand", seed_x_bet=1000, contribution_x=0.001,
                           must_hit_by_x_bet=11000)
        # (11000 - 1000) / 0.001 = 10,000,000 spins
        self.assertAlmostEqual(expected_spins_to_cap(pot), 10_000_000)


class TestProbabilityForcedStrike(unittest.TestCase):
    def test_zero_p_strike_always_forced(self):
        pot = MustHitByPot("a", 100, 0.01, 1000, p_strike_per_spin=0.0)
        self.assertAlmostEqual(probability_forced_strike(pot), 1.0)

    def test_high_p_strike_rarely_forced(self):
        # p_strike=0.5 over 1000 spins → P(no strike) ≈ 0.5^1000 ≈ 0
        pot = MustHitByPot("a", 0, 0.001, 1, p_strike_per_spin=0.5)
        self.assertLess(probability_forced_strike(pot), 1e-200)

    def test_geometric_mean_matches_cap(self):
        """For p_strike = 1/spins_to_cap, P(forced) ≈ 1/e."""
        pot = MustHitByPot("a", 0, 0.001, 1, p_strike_per_spin=1.0 / 1000)
        # (1 - 1/1000)^1000 ≈ 1/e ≈ 0.3679
        self.assertAlmostEqual(probability_forced_strike(pot), 1.0 / 2.71828, places=2)


class TestExpectedStrikeValue(unittest.TestCase):
    def test_natural_strike_dominant(self):
        """p_strike high → most strikes are natural, value near seed + 1/p × contrib."""
        pot = MustHitByPot("a", seed_x_bet=100, contribution_x=0.01,
                           must_hit_by_x_bet=10_000, p_strike_per_spin=0.01)
        # p_strike=0.01, contribution=0.01 → mean strike ≈ 100 + 0.01/0.01 = 101
        e = expected_strike_value(pot)
        self.assertGreater(e, 100)
        self.assertLess(e, 200)  # well below cap

    def test_forced_strike_at_cap(self):
        """p_strike = 0 → ALL strikes are forced at must_hit_by."""
        pot = MustHitByPot("a", seed_x_bet=100, contribution_x=0.01,
                           must_hit_by_x_bet=10_000, p_strike_per_spin=0.0)
        e = expected_strike_value(pot)
        self.assertAlmostEqual(e, 10_000)


class TestPerPotRtpContribution(unittest.TestCase):
    def test_flow_argument(self):
        """RTP contribution = contribution_x (conservation of bet flow)."""
        pot = MustHitByPot("a", 1000, 0.005, 100_000)
        self.assertAlmostEqual(per_pot_rtp_contribution(pot), 0.005)


class TestMustHitByRtp(unittest.TestCase):
    def test_multi_pot_sum(self):
        """4-tier mini/minor/major/grand → RTP = sum of contributions."""
        params = MustHitByParams(pots=(
            MustHitByPot("mini",  seed_x_bet=10,     contribution_x=0.001,  must_hit_by_x_bet=100),
            MustHitByPot("minor", seed_x_bet=50,     contribution_x=0.002,  must_hit_by_x_bet=500),
            MustHitByPot("major", seed_x_bet=500,    contribution_x=0.003,  must_hit_by_x_bet=5_000),
            MustHitByPot("grand", seed_x_bet=10_000, contribution_x=0.005,  must_hit_by_x_bet=100_000),
        ))
        result = must_hit_by_rtp(params)
        self.assertAlmostEqual(result["rtp_contribution"], 0.011)  # 0.001+0.002+0.003+0.005
        self.assertEqual(len(result["pots"]), 4)


class TestParamsValidation(unittest.TestCase):
    def test_rejects_must_hit_le_seed(self):
        with self.assertRaises(ValueError):
            MustHitByPot("a", seed_x_bet=1000, contribution_x=0.001,
                         must_hit_by_x_bet=1000)

    def test_rejects_contribution_at_one(self):
        with self.assertRaises(ValueError):
            MustHitByPot("a", 100, 1.0, 10_000)

    def test_rejects_negative_seed(self):
        with self.assertRaises(ValueError):
            MustHitByPot("a", seed_x_bet=-1, contribution_x=0.001,
                         must_hit_by_x_bet=10_000)

    def test_rejects_empty_pots(self):
        with self.assertRaises(ValueError):
            MustHitByParams(pots=())


MUST_HIT_BY_GDD = """
schema_version: "1.0.0"
meta:
  name: "Must-Hit-By Jackpot Test"
  vendor: "vendor_b"

topology:
  kind: rectangular
  reels: 5
  rows: 4

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
  - kind: must_hit_by
    mhb_pots:
      - name: mini
        seed_x_bet: 10
        contribution_x: 0.001
        must_hit_by_x_bet: 100
        p_strike_per_spin: 0.0001
      - name: major
        seed_x_bet: 500
        contribution_x: 0.003
        must_hit_by_x_bet: 5000
        p_strike_per_spin: 0.000001

paylines: 50

constraints:
  target_rtp: 0.96
  rtp_tolerance: 0.005
  volatility_class: high
  hit_freq_target: 0.22
  max_win_x: 25000
"""


class TestMustHitByDsl(unittest.TestCase):
    def test_parses_must_hit_by(self):
        spec = parse_spec(MUST_HIT_BY_GDD)
        mhbs = [f for f in spec.features if f.kind == "must_hit_by"]
        self.assertEqual(len(mhbs), 1)
        self.assertEqual(len(mhbs[0].mhb_pots), 2)
        self.assertEqual(mhbs[0].mhb_pots[0]["name"], "mini")

    def test_rejects_cap_le_seed(self):
        bad = MUST_HIT_BY_GDD.replace(
            "must_hit_by_x_bet: 100", "must_hit_by_x_bet: 10"
        )
        with self.assertRaises(DslParseError):
            parse_spec(bad)

    def test_rejects_missing_required_key(self):
        bad = MUST_HIT_BY_GDD.replace("contribution_x: 0.001\n", "")
        with self.assertRaises(DslParseError):
            parse_spec(bad)


if __name__ == "__main__":
    unittest.main()
