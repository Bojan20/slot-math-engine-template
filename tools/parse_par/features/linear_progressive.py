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
from ..tsv import s, n, load_tsv


def parse(rows: list[list[str]], cfg: dict, profile) -> dict:
    out: dict[str, Any] = {}

    # In-sheet bet table: progressive odds column (per bet multiplier row)
    bet_cfg = profile.data.get("bet_table") or {}
    if bet_cfg and "progressive_odds_col" in cfg:
        r0, r1 = bet_cfg["row_range"]
        oc = cfg["progressive_odds_col"]
        bms = []
        odds = []
        for r in range(r0, r1):
            bm = n(rows, r, bet_cfg["mult_col"])
            if bm is None:
                continue
            bms.append(bm)
            odds.append(n(rows, r, oc))
        out["per_bet_multiplier"] = {"bet_multipliers": bms, "progressive_odds": odds}

    # Optional summary sheet pull
    if "summary_sheet" in cfg and "summary_label" in cfg:
        raw_dir = cfg.get("__raw_dir__")  # caller can stash via profile.data; fallback below
        # We can't load arbitrary files here unless we know raw_dir. Skip if not provided.
        # The CLI passes profile + raw_dir; raw_dir is plumbed through core for paylines but
        # not for features in this iteration. Leaving extensible hook.
        pass

    return out


register("linear_progressive", parse)
