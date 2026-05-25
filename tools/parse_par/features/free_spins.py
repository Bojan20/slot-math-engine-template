"""Free Spins bonus parser.

Profile config:

    type: free_spins
    config:
      paytable_header_label: "Free Spins Bonus"   # exact cell text
      paytable_header_col: 2                       # default 2
      combo_header_label: "Combination"            # marks the header row
      pays_substr: "Pays"                          # disambiguation for combo header
      combo_cols: [2, 7]                           # 5 reels
      pays_col: 7
      pph_col: 8
      rtp_pct_col: 9
      marker_col: 1
      max_rows: 60
      summary_header_substr: "Bonus Summary"
      summary_data_offset: 3
      summary_cols:
        avg_free_spins: 2
        single_spin_payback_pct: 3
        total_payback_pct: 4
"""
from __future__ import annotations
from typing import Any

from . import register
from ..tsv import s, n, find_substr_row


def parse(rows: list[list[str]], cfg: dict, profile) -> dict:
    out: dict[str, Any] = {}

    # ----- FS paytable -----
    fs_paytable: list[dict] = []
    hdr_lbl = cfg.get("paytable_header_label", "Free Spins Bonus")
    hdr_col = cfg.get("paytable_header_col", 2)
    fs_start = None
    for i in range(len(rows)):
        if s(rows, i, hdr_col).strip() == hdr_lbl:
            fs_start = i
            break
    if fs_start is not None:
        combo_lbl = cfg.get("combo_header_label", "Combination")
        pays_substr = cfg.get("pays_substr", "Pays")
        pays_col = cfg.get("pays_col", 7)
        combo_hdr_col = cfg.get("combo_header_col", 2)
        header_row = None
        for j in range(fs_start, min(fs_start + 50, len(rows))):
            if s(rows, j, combo_hdr_col).strip() == combo_lbl and pays_substr in s(rows, j, pays_col):
                header_row = j
                break
        if header_row is not None:
            cc0, cc1 = cfg.get("combo_cols", [2, 7])
            pph_col = cfg.get("pph_col")
            rtp_pct_col = cfg.get("rtp_pct_col")
            marker_col = cfg.get("marker_col")
            stop_substrs = cfg.get("stop_substrs", ["RTP and PPH", "Bonus Summary"])
            max_rows = cfg.get("max_rows", 60)
            j = header_row + 1
            while j < len(rows) and j < header_row + max_rows + 1:
                cells = [s(rows, j, c).strip() for c in range(cc0, cc1)]
                pays = n(rows, j, pays_col)
                pph = n(rows, j, pph_col) if pph_col is not None else None
                rtp_pct = n(rows, j, rtp_pct_col) if rtp_pct_col is not None else None
                marker = s(rows, j, marker_col).strip() if marker_col is not None else ""
                joined = "\t".join(rows[j])
                if any(sub in joined for sub in stop_substrs):
                    break
                if all(c == "" for c in cells) and pays is None:
                    j += 1
                    continue
                fs_paytable.append({
                    "marker": marker,
                    "combo": cells,
                    "pays": pays,
                    "pph": pph,
                    "rtp_pct": rtp_pct,
                })
                j += 1
    out["fs_paytable"] = fs_paytable

    # ----- Bonus Summary -----
    summary: dict[str, Any] = {}
    summary_hdr = cfg.get("summary_header_substr", "Bonus Summary")
    sum_start = find_substr_row(rows, summary_hdr)
    if sum_start is not None:
        offset = cfg.get("summary_data_offset", 3)
        data_row = sum_start + offset
        for key, col in (cfg.get("summary_cols") or {}).items():
            summary[key] = n(rows, data_row, col)
    out["bonus_summary"] = summary

    return out


register("free_spins", parse)
