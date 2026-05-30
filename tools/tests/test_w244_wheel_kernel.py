"""W244 wave 16 — wheel closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.wheel import (  # noqa: E402
    WheelParams,
    WheelSegment,
    expected_award_per_trigger,
    spin_again_probability,
    terminal_award_expectation,
    wheel_rtp,
)


class TestTerminalAwardExpectation(unittest.TestCase):
    def test_simple_two_segment(self):
        """Two equal credit segments: E = (50 × 1 + 100 × 1)/2 = 75."""
        segs = (
            WheelSegment("credit", 1.0, 50.0),
            WheelSegment("credit", 1.0, 100.0),
        )
        self.assertAlmostEqual(terminal_award_expectation(segs), 75.0)

    def test_weighted_segments(self):
        """80% × 0 (no_win) + 20% × 100 = 20."""
        segs = (
            WheelSegment("no_win", 4.0, 0.0),
            WheelSegment("credit", 1.0, 100.0),
        )
        self.assertAlmostEqual(terminal_award_expectation(segs), 20.0)

    def test_spin_again_excluded(self):
        """spin_again segments don't contribute to terminal award."""
        segs = (
            WheelSegment("credit", 1.0, 50.0),
            WheelSegment("spin_again", 1.0, 0.0),
        )
        # Only credit: 1 × 50 / 2 = 25
        self.assertAlmostEqual(terminal_award_expectation(segs), 25.0)


class TestSpinAgainProbability(unittest.TestCase):
    def test_no_spin_again(self):
        segs = (WheelSegment("credit", 1.0, 50.0),)
        self.assertEqual(spin_again_probability(segs), 0.0)

    def test_with_spin_again(self):
        segs = (
            WheelSegment("credit", 3.0, 50.0),
            WheelSegment("spin_again", 1.0, 0.0),
        )
        self.assertAlmostEqual(spin_again_probability(segs), 0.25)


class TestExpectedAwardPerTrigger(unittest.TestCase):
    def test_no_spin_again_simple(self):
        """No spin_again → E_total = E_terminal."""
        params = WheelParams(
            trigger_p=0.01,
            segments=(WheelSegment("credit", 1.0, 100.0),),
        )
        self.assertAlmostEqual(expected_award_per_trigger(params), 100.0)

    def test_geometric_amortisation(self):
        """50% spin-again, 50% × 100 award. Bounded N=5.

        E_term = 100 × 0.5 = 50
        p_again = 0.5
        E_total = 50 × (1 - 0.5^6) / (1 - 0.5)
                = 50 × (1 - 0.015625) / 0.5
                = 50 × 1.96875 = 98.4375
        """
        params = WheelParams(
            trigger_p=1.0,
            segments=(
                WheelSegment("credit", 1.0, 100.0),
                WheelSegment("spin_again", 1.0, 0.0),
            ),
            max_spin_again=5,
        )
        self.assertAlmostEqual(expected_award_per_trigger(params), 98.4375)

    def test_max_spin_again_zero(self):
        """N=0 → no re-spins, single attempt only.

        E_terminal = 100 × 0.5 = 50, geom_sum(p, 0) = 1 → E_total = 50.
        """
        params = WheelParams(
            trigger_p=1.0,
            segments=(
                WheelSegment("credit", 1.0, 100.0),
                WheelSegment("spin_again", 1.0, 0.0),
            ),
            max_spin_again=0,
        )
        self.assertAlmostEqual(expected_award_per_trigger(params), 50.0)


class TestWheelRtp(unittest.TestCase):
    def test_full_breakdown(self):
        params = WheelParams(
            trigger_p=0.05,
            segments=(
                WheelSegment("no_win", 4.0, 0.0),
                WheelSegment("credit", 3.0, 10.0),
                WheelSegment("credit", 2.0, 50.0),
                WheelSegment("credit", 1.0, 200.0),
            ),
        )
        r = wheel_rtp(params)
        # E_term = (4×0 + 3×10 + 2×50 + 1×200) / 10 = 330/10 = 33
        # p_again = 0; E_total = 33
        # RTP = 0.05 × 33 = 1.65
        self.assertAlmostEqual(r["terminal_award_expectation"], 33.0)
        self.assertAlmostEqual(r["expected_award_per_trigger"], 33.0)
        self.assertAlmostEqual(r["rtp_contribution"], 1.65)
        self.assertEqual(len(r["segments"]), 4)

    def test_with_jackpot_segment(self):
        params = WheelParams(
            trigger_p=0.01,
            segments=(
                WheelSegment("no_win", 9.0, 0.0),
                WheelSegment("jackpot", 1.0, 10_000.0, jackpot_id="grand"),
            ),
        )
        r = wheel_rtp(params)
        # E_term = (9×0 + 1×10_000) / 10 = 1000
        # RTP = 0.01 × 1000 = 10.0
        self.assertAlmostEqual(r["expected_award_per_trigger"], 1000.0)
        self.assertAlmostEqual(r["rtp_contribution"], 10.0)


class TestValidation(unittest.TestCase):
    def test_rejects_invalid_kind(self):
        with self.assertRaises(ValueError):
            WheelSegment("invalid", 1.0, 0.0)

    def test_rejects_negative_weight(self):
        with self.assertRaises(ValueError):
            WheelSegment("credit", -1.0, 100.0)

    def test_rejects_jackpot_no_id(self):
        with self.assertRaises(ValueError):
            WheelSegment("jackpot", 1.0, 1000.0, jackpot_id="")

    def test_rejects_empty_segments(self):
        with self.assertRaises(ValueError):
            WheelParams(trigger_p=0.01, segments=())

    def test_rejects_trigger_p_above_one(self):
        with self.assertRaises(ValueError):
            WheelParams(
                trigger_p=1.5,
                segments=(WheelSegment("credit", 1.0, 100.0),),
            )

    def test_rejects_negative_max_spin_again(self):
        with self.assertRaises(ValueError):
            WheelParams(
                trigger_p=0.01,
                segments=(WheelSegment("credit", 1.0, 100.0),),
                max_spin_again=-1,
            )


if __name__ == "__main__":
    unittest.main()
