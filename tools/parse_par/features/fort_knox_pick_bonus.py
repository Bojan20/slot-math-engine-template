"""Fort Knox pick-bonus parser (IGT — Fort Knox Cats / Wolf Run / Cleopatra).

The Fort Knox bonus is a Bernoulli-triggered top-prize feature, NOT a
scatter-triggered pick. The PAR layout has three published tables in this
order (Fort Knox Wolf Run PAR_001):

  ▸ Trigger Table     — row ~460: `Yes / No / Total` weights → trigger_prob
  ▸ Award Table        — row ~467+: per-BM (Average Pay, Weight) per award class
  ▸ Average Pay row    — last row of each BM block: per-BM E[award_coins]

The PAR also publishes a per-bet-multiplier `Fort Knox Bonus RTP` column
in the summary bet table; the parser surfaces both (bm column + section
detail) so downstream adapters can choose between trigger×award MC or
deterministic RTP injection.

W4.3c additions (in addition to the v1 fields):
  ▸ trigger_table     {yes, no, total, trigger_prob}
  ▸ award_table       per-BM rows of (award, avg_pay, weight) with totals

Profile config:

    type: fort_knox_pick_bonus
    config:
      section_label: "Fort Knox Bonus"
      section_label_col: 2
      rtp_label_col: 3
      rtp_value_col: 7
      max_search_rows: 800
      bet_table_fkb_rtp_col: 4      # IGT keeps FK RTP in col 4
"""
from __future__ import annotations
from typing import Any

from . import register
from ..tsv import s, n, find_label_row, find_substr_row


def _parse_trigger_table(rows: list[list[str]], start: int, max_search: int) -> dict | None:
    """Scan for `Trigger Table` header within `max_search` rows of `start`.

    Expected layout:
        row K:    `Trigger Table` (in any col 0..4)
        row K+1:  header `Trigger? · Weight · · · Overall Trigger Odds`
        row K+2:  `Yes · 670005 · · · 150`        (weight + overall odds)
        row K+3:  `No  · 99329995`
        row K+4:  `Total · 100000000`
    """
    hdr = None
    for j in range(start, min(start + max_search, len(rows))):
        for c in range(0, 5):
            if s(rows, j, c).strip() == "Trigger Table":
                hdr = j
                break
        if hdr is not None:
            break
    if hdr is None:
        return None
    # Find Yes/No/Total rows below the header (skip the column header row).
    yes_w = no_w = total_w = None
    for j in range(hdr + 1, min(hdr + 12, len(rows))):
        for c in range(0, 4):
            lbl = s(rows, j, c).strip()
            if lbl == "Yes":
                yes_w = n(rows, j, c + 1)
            elif lbl == "No":
                no_w = n(rows, j, c + 1)
            elif lbl == "Total":
                total_w = n(rows, j, c + 1)
    if yes_w is None or total_w is None or total_w == 0:
        return None
    return {
        "yes": yes_w,
        "no": no_w,
        "total": total_w,
        "trigger_prob": float(yes_w) / float(total_w),
    }


def _parse_award_table(rows: list[list[str]], start: int, max_search: int) -> dict | None:
    """Walk the multi-block `Award Table` section starting at `start`.

    IGT publishes one BM-header row per block followed by a column-header
    row (`Award · Average Pay · Weight · Average Pay · Weight · ...`), then
    13 award rows, a `Total` row with per-BM weights, and an `Average Pay`
    summary row (per-BM expected pay = Σ avg_pay × weight / total_weight).

    Returns:
      {
        "bms": [1, 2, 3, ...],
        "per_bm_avg_pay": {bm: float, ...},   # from the `Average Pay` row
        "awards": {bm: [{"label": str, "avg_pay": float, "weight": float}]},
      }
    """
    hdr = None
    for j in range(start, min(start + max_search, len(rows))):
        for c in range(0, 5):
            if s(rows, j, c).strip() == "Award Table":
                hdr = j
                break
        if hdr is not None:
            break
    if hdr is None:
        return None

    bms_all: list[int] = []
    per_bm_avg_pay: dict[int, float] = {}
    awards: dict[int, list[dict]] = {}

    j = hdr + 1
    end = min(hdr + max_search, len(rows))
    while j < end:
        # Find a `Bet Multiplier` header row (row before the BM-value row)
        bm_header_row = None
        for k in range(j, min(j + 20, end)):
            if any(s(rows, k, c).strip() == "Bet Multiplier" for c in range(0, 5)):
                bm_header_row = k
                break
        if bm_header_row is None:
            break
        # The BM-values row sits one row below the `Bet Multiplier` label
        bm_value_row = bm_header_row + 1
        # Parse BM values across the row — they live at col 2,4,6,8,10
        bms_block: list[tuple[int, int]] = []  # (bm, awards_col_start)
        for col_idx in (2, 4, 6, 8, 10):
            bm = n(rows, bm_value_row, col_idx)
            if bm is not None and isinstance(bm, (int, float)) and bm > 0:
                bms_block.append((int(bm), col_idx))
        if not bms_block:
            break
        for bm, _ in bms_block:
            if bm not in bms_all:
                bms_all.append(bm)

        # Column header row is one row below BM-value (Award · Average Pay · Weight ...)
        col_hdr_row = bm_value_row + 1
        # Confirm "Award" in col 1
        if s(rows, col_hdr_row, 1).strip() != "Award":
            break

        # Award rows start at col_hdr_row + 1 and end at `Total` row
        award_block_start = col_hdr_row + 1
        award_rows: list[int] = []
        total_row = None
        avg_pay_row = None
        for k in range(award_block_start, min(award_block_start + 30, end)):
            label = s(rows, k, 1).strip()
            if label == "Total":
                total_row = k
            elif label == "Average Pay":
                avg_pay_row = k
                break
            elif label:
                award_rows.append(k)
        if avg_pay_row is None:
            break

        # Parse per-BM avg pay from `Average Pay` row at col_idx
        for bm, col_start in bms_block:
            ap = n(rows, avg_pay_row, col_start)
            if ap is not None:
                per_bm_avg_pay[bm] = float(ap)

        # Parse award rows for each BM in this block
        for bm, col_start in bms_block:
            block: list[dict] = []
            for ar in award_rows:
                label = s(rows, ar, 1).strip()
                avg_pay = n(rows, ar, col_start)
                weight = n(rows, ar, col_start + 1)
                if avg_pay is None or weight is None:
                    continue
                block.append({
                    "label": label,
                    "avg_pay": float(avg_pay),
                    "weight": float(weight),
                })
            awards[bm] = block

        # Advance past this block
        j = (total_row or avg_pay_row or award_block_start) + 2

    if not bms_all:
        return None
    return {
        "bms": bms_all,
        "per_bm_avg_pay": per_bm_avg_pay,
        "awards": awards,
    }


def parse(rows: list[list[str]], cfg: dict, profile) -> dict:
    out: dict[str, Any] = {}
    sec_lbl = cfg.get("section_label", "Fort Knox Bonus")
    sec_col = cfg.get("section_label_col", 2)
    start = find_label_row(rows, sec_lbl, sec_col)
    out["present"] = start is not None
    out["section_start_row"] = start

    max_search = cfg.get("max_search_rows", 800)

    if start is not None:
        rtp_lbl_col = cfg.get("rtp_label_col", 3)
        rtp_val_col = cfg.get("rtp_value_col", 7)
        rtp_contrib = None
        for j in range(start, min(start + max_search, len(rows))):
            cell = s(rows, j, rtp_lbl_col).strip()
            if "Fort Knox" in cell and "RTP" in cell:
                rtp_contrib = n(rows, j, rtp_val_col)
                break
        out["rtp_contribution"] = rtp_contrib

        # W4.3c — full trigger + award table extraction
        trig = _parse_trigger_table(rows, start, max_search)
        if trig is not None:
            out["trigger_table"] = trig
        award = _parse_award_table(rows, start, max_search)
        if award is not None:
            out["award_table"] = award

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
