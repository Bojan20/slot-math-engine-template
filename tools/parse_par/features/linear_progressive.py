"""Linear progressive jackpot parser (IGT signature: scales 1:1 with bet).

Profile config:

    type: linear_progressive
    config:
      summary_sheet: PAR_Summary
      summary_label: "Progressive"
      summary_label_col: 9
      summary_value_col: 10        # base odds at min bet
      bet_table_progressive_col: 16  # column on main PAR sheet
"""
from __future__ import annotations
from typing import Any

from . import register
from ..tsv import n


def parse(rows: list[list[str]], cfg: dict, profile) -> dict:
    out: dict[str, Any] = {}

    # In-sheet bet table: progressive odds column (per bet multiplier row)
    bet_cfg = profile.data.get("bet_table") or {}
    if bet_cfg and "progressive_odds_col" in cfg:
        r0, r1 = bet_cfg["row_range"]
        oc = cfg["progressive_odds_col"]
        bms = []
        odds = []
        increments: list[Any] = []
        # W4.3e — pull deterministic per-spin increment if profile provides
        # `bet_table.increment_col` (IGT publishes this in the "Increment"
        # column of the bet table; e.g. 0.003 for Wolf Run).
        inc_col = bet_cfg.get("increment_col")
        for r in range(r0, r1):
            bm = n(rows, r, bet_cfg["mult_col"])
            if bm is None:
                continue
            bms.append(bm)
            odds.append(n(rows, r, oc))
            if inc_col is not None:
                increments.append(n(rows, r, inc_col))
        out["per_bet_multiplier"] = {
            "bet_multipliers": bms,
            "progressive_odds": odds,
        }
        if increments:
            out["per_bet_multiplier"]["increments"] = increments

    # Optional summary sheet pull — hook reserved for future raw_dir plumbing.
    # The CLI currently passes profile + raw_dir; raw_dir is plumbed through core
    # for paylines but not for features in this iteration.
    if "summary_sheet" in cfg and "summary_label" in cfg:
        _ = cfg.get("__raw_dir__")  # reserved for follow-up wave

    return out


register("linear_progressive", parse)
