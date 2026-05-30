"""W244 wave 17 — state_machine closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.state_machine import (  # noqa: E402
    GameState,
    StateMachineParams,
    stationary_distribution,
    state_machine_rtp,
)


class TestStationaryDistribution(unittest.TestCase):
    def test_two_state_symmetric(self):
        """Symmetric 2-state chain → π = [0.5, 0.5]."""
        params = StateMachineParams(
            states=(GameState("a", 0.9), GameState("b", 1.0)),
            transitions=((0.5, 0.5), (0.5, 0.5)),
        )
        pi = stationary_distribution(params)
        self.assertAlmostEqual(pi[0], 0.5)
        self.assertAlmostEqual(pi[1], 0.5)

    def test_two_state_asymmetric(self):
        """Base 99% stay / 1% go super; super 50% stay / 50% back to base.

        Detailed balance: π_super × 0.50 = π_base × 0.01
        → π_super / π_base = 0.01 / 0.50 = 0.02
        → π_base = 1 / 1.02 ≈ 0.9804
        → π_super = 0.02 / 1.02 ≈ 0.0196
        """
        params = StateMachineParams(
            states=(GameState("base", 0.96), GameState("super", 2.50)),
            transitions=((0.99, 0.01), (0.50, 0.50)),
        )
        pi = stationary_distribution(params)
        self.assertAlmostEqual(pi[0], 1.0 / 1.02, places=6)
        self.assertAlmostEqual(pi[1], 0.02 / 1.02, places=6)

    def test_three_state_chain(self):
        """3-state chain with sequential transitions; verify sum=1."""
        params = StateMachineParams(
            states=(
                GameState("base", 0.95),
                GameState("super", 1.10),
                GameState("mega", 2.0),
            ),
            transitions=(
                (0.95, 0.04, 0.01),
                (0.50, 0.45, 0.05),
                (0.30, 0.20, 0.50),
            ),
        )
        pi = stationary_distribution(params)
        self.assertAlmostEqual(sum(pi), 1.0, places=10)
        # All probabilities ≥ 0
        for p in pi:
            self.assertGreaterEqual(p, 0.0)


class TestStateMachineRtp(unittest.TestCase):
    def test_two_state_weighted_rtp(self):
        """π = [0.5, 0.5], rtp = [0.9, 1.0] → total = 0.95."""
        params = StateMachineParams(
            states=(GameState("a", 0.9), GameState("b", 1.0)),
            transitions=((0.5, 0.5), (0.5, 0.5)),
        )
        r = state_machine_rtp(params)
        self.assertAlmostEqual(r["rtp_contribution"], 0.95)
        self.assertEqual(r["states_count"], 2)
        self.assertEqual(len(r["states"]), 2)

    def test_supermeter_low_super_share(self):
        """Asymmetric supermeter: π_super ≈ 0.0196, super RTP=2.50.

        Total RTP = 0.9804 × 0.96 + 0.0196 × 2.50
                  = 0.9412 + 0.0490 = 0.9902
        """
        params = StateMachineParams(
            states=(GameState("base", 0.96), GameState("super", 2.50)),
            transitions=((0.99, 0.01), (0.50, 0.50)),
        )
        r = state_machine_rtp(params)
        self.assertAlmostEqual(r["rtp_contribution"], 0.9902, places=4)


class TestValidation(unittest.TestCase):
    def test_rejects_empty_name(self):
        with self.assertRaises(ValueError):
            GameState("", 0.96)

    def test_rejects_negative_rtp(self):
        with self.assertRaises(ValueError):
            GameState("a", -0.1)

    def test_rejects_empty_states(self):
        with self.assertRaises(ValueError):
            StateMachineParams(states=(), transitions=())

    def test_rejects_transition_row_count_mismatch(self):
        with self.assertRaises(ValueError):
            StateMachineParams(
                states=(GameState("a", 0.9), GameState("b", 1.0)),
                transitions=((0.5, 0.5),),  # only 1 row, expected 2
            )

    def test_rejects_non_stochastic_row(self):
        with self.assertRaises(ValueError):
            StateMachineParams(
                states=(GameState("a", 0.9), GameState("b", 1.0)),
                transitions=((0.5, 0.4), (0.5, 0.5)),  # 0.5+0.4=0.9 ≠ 1.0
            )

    def test_rejects_negative_probability(self):
        with self.assertRaises(ValueError):
            StateMachineParams(
                states=(GameState("a", 0.9), GameState("b", 1.0)),
                transitions=((1.5, -0.5), (0.5, 0.5)),
            )

    def test_rejects_row_column_count_mismatch(self):
        with self.assertRaises(ValueError):
            StateMachineParams(
                states=(GameState("a", 0.9), GameState("b", 1.0)),
                transitions=((0.5, 0.5, 0.0), (0.5, 0.5, 0.0)),  # 3 cols
            )


if __name__ == "__main__":
    unittest.main()
