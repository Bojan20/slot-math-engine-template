"""Cash Eruption feature parser (L&W signature feature).

Mirrors the math in `games/ce-copy-test/scripts/parse_par.py` so the
round-trip IR is bit-identical. All layout coordinates are profile-
configurable; the legacy script's hard-coded indices live as defaults.

Profile config:

    type: cash_eruption_pages
    config:
      page_pattern: "BET MULTIPLIER\\s+(\\d+)"
      fireballs_set_label: "Fireballs Set"
      fireballs_set_label_col: 10
      fireballs_set_weight_col: 11
      pool_labels: [low, med, high]
      small_fireballs_label: "Small Fireballs"
      big_fireball_label: "Big Fireball"
      fireball_value_col: 10        # coin value column
      tier_label_col: 9             # MINI/MINOR/MAJOR labels
      fireball_low_col: 11
      fireball_med_col: 12
      fireball_high_col: 13
      respin_landed_col: 2
      respin_weight_cols: [3, 4, 5]
      ce_from_base_substr: "from the Base Game RTP"
      ce_from_fs_substr: "from the Free Spins Bonus RTP"
      ce_label_col: 3
      ce_value_col: 7
      grand_label: "GRAND"
      grand_label_col: 10
      grand_value_col: 10
      grand_prob_base_col: 11
      grand_prob_fs_col: 12
"""
from __future__ import annotations
import re
from typing import Any

from . import register
from ..tsv import s, n


def _parse_fireball_table(rows, header_row, mini_minor_major, kind, cfg):
    fb_val_col = cfg.get("fireball_value_col", 10)
    tier_col = cfg.get("tier_label_col", 9)
    low_col = cfg.get("fireball_low_col", 11)
    med_col = cfg.get("fireball_med_col", 12)
    high_col = cfg.get("fireball_high_col", 13)
    tier_labels = cfg.get("tier_labels", ["MINI", "MINOR", "MAJOR"])
    total_label = cfg.get("total_label", "Total")
    max_iter = cfg.get("max_iter", 60)
    out: list[dict] = []
    j = header_row + 2  # skip "<kind> / Weight" header + "coin / low / med / high" sub-header
    safety = 0
    while j < len(rows) and safety < max_iter:
        lbl_val = s(rows, j, fb_val_col).strip()
        lbl_tier = s(rows, j, tier_col).strip()
        if lbl_val == total_label:
            break
        if lbl_tier in tier_labels:
            mini_minor_major.setdefault(kind, {})[lbl_tier] = {
                "value": n(rows, j, fb_val_col),
                "low": n(rows, j, low_col),
                "med": n(rows, j, med_col),
                "high": n(rows, j, high_col),
            }
            j += 1
            safety += 1
            continue
        coin = n(rows, j, fb_val_col)
        low = n(rows, j, low_col)
        med = n(rows, j, med_col)
        high = n(rows, j, high_col)
        if coin is not None:
            out.append({"coin_value": coin, "low": low, "med": med, "high": high})
        j += 1
        safety += 1
    return out


def _parse_respin_table(rows, header_row, cfg):
    landed_col = cfg.get("respin_landed_col", 2)
    weight_cols = cfg.get("respin_weight_cols", [3, 4, 5])  # weights for [3, 2, 1] remaining respins
    total_label = cfg.get("total_label", "Total")
    out: dict[int, dict] = {3: {}, 2: {}, 1: {}}
    j = header_row + 4
    safety = 0
    while j < len(rows) and safety < 25:
        lbl = s(rows, j, landed_col).strip()
        v = n(rows, j, landed_col)
        if lbl == total_label:
            for k, wc in zip([3, 2, 1], weight_cols):
                out[k]["total"] = n(rows, j, wc)
            break
        if v is not None and isinstance(v, int):
            n_add = v
            for k, wc in zip([3, 2, 1], weight_cols):
                w = n(rows, j, wc)
                if w is not None:
                    out[k][n_add] = w
        j += 1
        safety += 1
    return out


def _parse_one_page(rows, start: int, cfg: dict) -> dict:
    out: dict[str, Any] = {
        "fireballs_set_weights": {},
        "small_fireball_values": [],
        "big_fireball_values": [],
        "mini_minor_major": {},
        "respin_tables": {},
        "ce_from_base_rtp": None,
        "ce_from_fs_rtp": None,
        "grand_prob_base": None,
        "grand_prob_fs": None,
        "top_award": None,
    }
    page_pat = re.compile(cfg.get("page_pattern", r"BET MULTIPLIER\s+(\d+)"))
    end = len(rows)
    for k in range(start + 1, len(rows)):
        if page_pat.search("\t".join(rows[k])):
            end = k
            break
    block_len = end - start
    fb_set_lbl = cfg.get("fireballs_set_label", "Fireballs Set")
    fb_set_lbl_col = cfg.get("fireballs_set_label_col", 10)
    fb_set_w_col = cfg.get("fireballs_set_weight_col", 11)
    pool_labels = cfg.get("pool_labels", ["low", "med", "high"])
    total_label = cfg.get("total_label", "Total")

    # 1) Fireballs Set weights
    for j in range(block_len):
        absrow = start + j
        if s(rows, absrow, fb_set_lbl_col).strip() == fb_set_lbl:
            for off in range(1, 6):
                lbl = s(rows, absrow + off, fb_set_lbl_col).strip()
                w = n(rows, absrow + off, fb_set_w_col)
                if lbl in pool_labels:
                    out["fireballs_set_weights"][lbl] = w
                elif lbl == total_label:
                    out["fireballs_set_weights"]["total"] = w
                    break
            break

    # 2) Small Fireballs + Big Fireball tables
    sf_label = cfg.get("small_fireballs_label", "Small Fireballs")
    bf_label = cfg.get("big_fireball_label", "Big Fireball")
    fb_val_col = cfg.get("fireball_value_col", 10)
    sf_hdr = None
    bf_hdr = None
    for j in range(block_len):
        absrow = start + j
        if s(rows, absrow, fb_val_col).strip() == sf_label:
            sf_hdr = absrow
        if s(rows, absrow, fb_val_col).strip() == bf_label:
            bf_hdr = absrow
    if sf_hdr is not None:
        out["small_fireball_values"] = _parse_fireball_table(rows, sf_hdr, out["mini_minor_major"], "small", cfg)
    if bf_hdr is not None:
        out["big_fireball_values"] = _parse_fireball_table(rows, bf_hdr, out["mini_minor_major"], "big", cfg)

    # 3) Respin tables
    landed_col = cfg.get("respin_landed_col", 2)
    landed_pat = re.compile(r"(\d+) Fireballs landed")
    for j in range(block_len):
        absrow = start + j
        m = landed_pat.match(s(rows, absrow, landed_col).strip())
        if m:
            n_landed = int(m.group(1))
            out["respin_tables"][n_landed] = _parse_respin_table(rows, absrow, cfg)

    # 4) CE-from-base / CE-from-FS RTP
    ce_lbl_col = cfg.get("ce_label_col", 3)
    ce_val_col = cfg.get("ce_value_col", 7)
    base_sub = cfg.get("ce_from_base_substr", "from the Base Game RTP")
    fs_sub = cfg.get("ce_from_fs_substr", "from the Free Spins Bonus RTP")
    for j in range(block_len):
        absrow = start + j
        cell = s(rows, absrow, ce_lbl_col).strip()
        if "Cash Eruption" in cell and base_sub in cell:
            out["ce_from_base_rtp"] = n(rows, absrow, ce_val_col)
        if "Cash Eruption" in cell and fs_sub in cell:
            out["ce_from_fs_rtp"] = n(rows, absrow, ce_val_col)

    # 5) GRAND
    grand_lbl = cfg.get("grand_label", "GRAND")
    grand_lbl_col = cfg.get("grand_label_col", 10)
    grand_val_col = cfg.get("grand_value_col", 10)
    grand_pb_col = cfg.get("grand_prob_base_col", 11)
    grand_pf_col = cfg.get("grand_prob_fs_col", 12)
    for j in range(block_len):
        absrow = start + j
        if s(rows, absrow, grand_lbl_col).strip() == grand_lbl:
            out["top_award"] = n(rows, absrow + 1, grand_val_col)
            out["grand_prob_base"] = n(rows, absrow + 1, grand_pb_col)
            out["grand_prob_fs"] = n(rows, absrow + 1, grand_pf_col)
            break
    return out


def parse(rows: list[list[str]], cfg: dict, profile) -> list[dict]:
    pat = re.compile(cfg.get("page_pattern", r"BET MULTIPLIER\s+(\d+)"))
    pages: list[dict] = []
    for i in range(len(rows)):
        joined = "\t".join(rows[i])
        m = pat.search(joined)
        if m:
            page = _parse_one_page(rows, i, cfg)
            page["bet_multiplier"] = int(m.group(1))
            pages.append(page)
    # Return under a stable IR key — we store the list directly. The
    # legacy CE script used `cash_eruption_feature_pages`, so we
    # preserve that for round-trip equality.
    return pages


register("cash_eruption_pages", parse)
