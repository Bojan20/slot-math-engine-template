"""Fort Knox pick-bonus parser (IGT — Fort Knox Cats / Wolf Run / Cleopatra).

The Fort Knox bonus is a separate top-row scatter feature where a
selected number of Vault symbols on the top reel triggers a pick-bonus.
The PAR sheet typically uses a dedicated section labeled "Fort Knox
Bonus" with per-bet-multiplier tables. Layout is highly vendor-specific
to IGT; this parser pulls **section presence + RTP contribution** from
the bet table column and trigger statistics from the body.

Profile config:

    type: fort_knox_pick_bonus
    config:
      section_label: "Fort Knox Bonus"
      section_label_col: 2
      rtp_label_col: 3
      rtp_value_col: 7
      max_search_rows: 200
      bet_table_fkb_rtp_col: 13      # "Fort Knox Bonus RTP" column on summary
"""
from __future__ import annotations
from typing import Any

from . import register
from ..tsv import s, n, find_label_row


def parse(rows: list[list[str]], cfg: dict, profile) -> dict:
    out: dict[str, Any] = {}
    sec_lbl = cfg.get("section_label", "Fort Knox Bonus")
    sec_col = cfg.get("section_label_col", 2)
    start = find_label_row(rows, sec_lbl, sec_col)
    out["present"] = start is not None
    out["section_start_row"] = start

    if start is not None:
        rtp_lbl_col = cfg.get("rtp_label_col", 3)
        rtp_val_col = cfg.get("rtp_value_col", 7)
        max_search = cfg.get("max_search_rows", 200)
        rtp_contrib = None
        for j in range(start, min(start + max_search, len(rows))):
            cell = s(rows, j, rtp_lbl_col).strip()
            if "Fort Knox" in cell and "RTP" in cell:
                rtp_contrib = n(rows, j, rtp_val_col)
                break
        out["rtp_contribution"] = rtp_contrib

    # Per-bet-multiplier FK Bonus RTP column (if profile bet_table includes it)
    bet_cfg = profile.data.get("bet_table") or {}
    fkb_col = cfg.get("bet_table_fkb_rtp_col")
    if bet_cfg and fkb_col is not None:
        r0, r1 = bet_cfg["row_range"]
        per_bm = []
        for r in range(r0, r1):
            bm = n(rows, r, bet_cfg["mult_col"])
            if bm is None:
                continue
            per_bm.append({"bet_multiplier": bm, "fkb_rtp": n(rows, r, fkb_col)})
        out["per_bet_multiplier"] = per_bm

    return out


register("fort_knox_pick_bonus", parse)
