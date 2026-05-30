"""W244 wave 27 — hold_and_win composed kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.hold_and_win import HoldAndWinParams, hold_and_win_rtp  # noqa: E402
from tools.math_dsl.money_collect import MoneyCollectParams  # noqa: E402
from tools.math_dsl.must_hit_by import MustHitByPot  # noqa: E402


class TestHoldAndWinRtp(unittest.TestCase):
    def test_lightning_link_style(self):
        """Money_collect + 4-tier jackpot ladder = full H&W."""
        money = MoneyCollectParams(
            p_per_cell=0.04, n_cells=15, trigger_count_min=6,
            respins_reset=3, grid_cap=15,
            value_table={1.0: 50.0, 2.0: 30.0, 5.0: 15.0, 10.0: 4.0, 50.0: 1.0},
        )
        jackpots = (
            MustHitByPot("mini",  10,     0.0005, 100,     p_strike_per_spin=1e-4),
            MustHitByPot("minor", 50,     0.001,  500,     p_strike_per_spin=1e-5),
            MustHitByPot("major", 500,    0.002,  5_000,   p_strike_per_spin=1e-6),
            MustHitByPot("grand", 10_000, 0.005,  100_000, p_strike_per_spin=1e-7),
        )
        params = HoldAndWinParams(money_params=money, jackpot_pots=jackpots)
        r = hold_and_win_rtp(params)
        # Money + jackpot contributions both positive
        self.assertGreater(r["money_component"]["rtp_contribution"], 0.0)
        self.assertGreater(r["jackpot_component"]["rtp_contribution"], 0.0)
        # Total = sum of components
        self.assertAlmostEqual(
            r["rtp_contribution"],
            r["money_component"]["rtp_contribution"]
            + r["jackpot_component"]["rtp_contribution"],
        )
        # 4 jackpot pots represented
        self.assertEqual(r["jackpot_component"]["pots_count"], 4)

    def test_dragon_cash_simpler(self):
        """Money_collect + 2-tier jackpot (minor + grand)."""
        money = MoneyCollectParams(
            p_per_cell=0.05, n_cells=20, trigger_count_min=6,
            respins_reset=3, grid_cap=20,
            value_table={1.0: 40.0, 5.0: 25.0, 25.0: 8.0, 100.0: 2.0},
        )
        jackpots = (
            MustHitByPot("minor", 100,    0.001, 1_000),
            MustHitByPot("grand", 50_000, 0.003, 500_000),
        )
        params = HoldAndWinParams(money_params=money, jackpot_pots=jackpots)
        r = hold_and_win_rtp(params)
        # Jackpot component = 0.001 + 0.003 = 0.004 (conservation flow)
        self.assertAlmostEqual(
            r["jackpot_component"]["rtp_contribution"], 0.004,
        )


class TestValidation(unittest.TestCase):
    def test_rejects_empty_jackpot_pots(self):
        money = MoneyCollectParams(
            p_per_cell=0.04, n_cells=15, trigger_count_min=6,
            respins_reset=3, grid_cap=15,
            value_table={1.0: 1.0},
        )
        with self.assertRaises(ValueError):
            HoldAndWinParams(money_params=money, jackpot_pots=())


if __name__ == "__main__":
    unittest.main()
