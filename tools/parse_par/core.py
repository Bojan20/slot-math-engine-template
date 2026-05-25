"""Vendor-agnostic PAR parsing engine.

Drives the parse by reading **only** layout coordinates from the vendor
profile + delegating feature-specific blocks to pluggable parsers in
`tools.parse_par.features.*`. Game-specific math (paytable values,
weights) flows through unchanged so the IR is bit-identical to the
hand-written game scripts.
"""
from __future__ import annotations
from pathlib import Path
from typing import Any, Optional
import re

from .profile import VendorProfile
from .tsv import load_tsv, num, s, n, find_label_row, find_substr_row
from . import features as _features


def _cell_coord(spec: dict | None) -> tuple[int, int] | None:
    if not spec:
        return None
    if "row" not in spec or "col" not in spec:
        return None
    return int(spec["row"]), int(spec["col"])


def parse_meta(rows: list[list[str]], profile: VendorProfile) -> dict:
    """Extract header metrics (SWID, hold, hit/win freq, RTP breakdown,
    bet table) using profile coordinates."""
    meta_cfg = profile.data.get("meta") or {}

    def fetch_num(key: str):
        c = _cell_coord(meta_cfg.get(key))
        return n(rows, *c) if c else None

    def fetch_str(key: str):
        c = _cell_coord(meta_cfg.get(key))
        return s(rows, *c).strip() if c else ""

    swid = fetch_str("swid")
    hold = fetch_num("hold")
    hit_freq = fetch_num("hit_freq")
    win_freq = fetch_num("win_freq")

    # RTP breakdown — every (key, {row,col}) becomes a numeric component
    rtp_breakdown: dict[str, Any] = {}
    for key, spec in (profile.data.get("rtp_breakdown") or {}).items():
        c = _cell_coord(spec)
        if c is not None:
            rtp_breakdown[key] = n(rows, *c)
    rtp_total = rtp_breakdown.get("total")

    # Bet multipliers / total bets / max liability
    bet_mults: list[Any] = []
    total_bets: list[Any] = []
    max_liabs: list[Any] = []
    bet_cfg = profile.data.get("bet_table")
    if bet_cfg:
        r0, r1 = bet_cfg["row_range"]
        mult_c = bet_cfg["mult_col"]
        total_c = bet_cfg.get("total_col")
        ml_c = bet_cfg.get("max_liab_col")
        for r in range(r0, r1):
            bm = n(rows, r, mult_c)
            if bm is None:
                continue
            bet_mults.append(bm)
            if total_c is not None:
                total_bets.append(n(rows, r, total_c))
            if ml_c is not None:
                max_liabs.append(n(rows, r, ml_c))

    dims = profile.dimensions
    out = {
        "name": profile.data.get("game_name") or profile.display_name,
        "vendor": profile.vendor,
        "swid": swid,
        "reels": dims.get("reels"),
        "rows": dims.get("rows"),
        "lines": dims.get("paylines"),
        "left_to_right_only": bool(dims.get("left_to_right_only", True)),
        "hold": hold,
        "hit_frequency_all_line": hit_freq,
        "win_frequency_all_line": win_freq,
        "rtp_breakdown": rtp_breakdown,
        "rtp_total": rtp_total,
        "bet_multipliers": bet_mults,
        "total_bets": total_bets,
        "max_liabilities": max_liabs,
    }
    if "based_on" in profile.data:
        out["based_on"] = profile.data["based_on"]
    return out


def parse_symbol_counts(rows: list[list[str]], profile: VendorProfile) -> dict:
    cfg = profile.data.get("symbol_counts")
    if not cfg:
        return {}
    r0, r1 = cfg["row_range"]
    name_col = cfg["name_col"]
    rc0, rc1 = cfg["reel_col_range"]
    out: dict[str, list[Any]] = {}
    for r in range(r0, r1):
        name = s(rows, r, name_col).strip()
        if not name or name == "Total":
            continue
        out[name] = [n(rows, r, c) for c in range(rc0, rc1)]
    return out


def parse_paytable(rows: list[list[str]], profile: VendorProfile) -> list[dict]:
    cfg = profile.data.get("paytable")
    if not cfg:
        return []
    r0, r1 = cfg["row_range"]
    cc0, cc1 = cfg["combo_cols"]
    pays_c = cfg["pays_col"]
    pph_c = cfg.get("pph_col")
    rtp_c = cfg.get("rtp_pct_col")
    mk_c = cfg.get("marker_col")
    combos = []
    for r in range(r0, r1):
        cells = [s(rows, r, c).strip() for c in range(cc0, cc1)]
        pays = n(rows, r, pays_c)
        pph = n(rows, r, pph_c) if pph_c is not None else None
        rtp_pct = n(rows, r, rtp_c) if rtp_c is not None else None
        marker = s(rows, r, mk_c).strip() if mk_c is not None else ""
        if pays is None or all(c == "" for c in cells):
            continue
        combos.append({
            "marker": marker,
            "combo": cells,
            "pays": pays,
            "pph": pph,
            "rtp_pct": rtp_pct,
        })
    return combos


def parse_reel_sets(rows: list[list[str]], cfg: dict) -> list[dict]:
    """Generic reel-set walker driven by profile cfg.

    cfg keys:
      header_label       — exact cell text marking a reel set header
      header_col         — column where header label is found (default 1)
      set_num_col        — column with set number on the header row (default 3)
      data_offset        — rows below header where stop-by-stop data starts
      reel_count         — number of reels (default 5; override for Megaways etc.)
      symbol_col_start   — first column of stop data (where reel-1 symbol lives)
      stride             — cols per reel (default 2 — symbol + weight)
      index_col          — column with the stop index (default symbol_col_start - 1)
      total_label        — string in symbol_col_start marking end-of-set (default "Total")
      max_stops          — safety cap to avoid runaway walks (default 200)
    """
    label = cfg["header_label"]
    header_col = cfg.get("header_col", 1)
    set_num_col = cfg.get("set_num_col", 3)
    data_offset = cfg.get("data_offset", 4)
    reel_count = cfg.get("reel_count", 5)
    sym_c0 = cfg.get("symbol_col_start", 2)
    stride = cfg.get("stride", 2)
    index_col = cfg.get("index_col", sym_c0 - 1)
    total_label = cfg.get("total_label", "Total")
    max_stops = cfg.get("max_stops", 200)

    sets = []
    i = 0
    while i < len(rows):
        if s(rows, i, header_col).strip() == label:
            set_num = n(rows, i, set_num_col)
            data_start = i + data_offset
            reels: list[list[dict]] = [[] for _ in range(reel_count)]
            j = data_start
            scanned = 0
            while j < len(rows) and scanned < max_stops:
                if s(rows, j, sym_c0).strip() == total_label:
                    break
                idx = n(rows, j, index_col)
                if idx is None:
                    j += 1
                    scanned += 1
                    continue
                for reel in range(reel_count):
                    sym = s(rows, j, sym_c0 + reel * stride).strip()
                    w = n(rows, j, sym_c0 + reel * stride + 1)
                    if sym:
                        reels[reel].append({"symbol": sym, "weight": w if w is not None else 0})
                j += 1
                scanned += 1
            sets.append({"set": set_num, "reels": reels})
            i = j + 1
        else:
            i += 1
    return sets


def parse_reel_set_weights(rows: list[list[str]], cfg: dict) -> dict:
    """Generic reel-set-weights table parser.

    cfg keys:
      row_range        — [start, end] for weight rows
      set_col          — column with set index
      weight_col       — column with weight
      total_row        — row containing total
      total_col        — column for total
      initial_set      — { row, col }   optional
      initial_rtp      — { row, col }   optional
      header_substr    — optional: if set, find the header row dynamically
                         (used by FS weights which appear AFTER a dynamic
                         section). row_range is interpreted as offsets
                         from the discovered header in this mode.
    """
    out_weights: list[dict] = []
    total = None
    if "header_substr" in cfg:
        hdr = find_substr_row(rows, cfg["header_substr"])
        if hdr is None:
            return {"weights": [], "total": None}
        offset_start = cfg.get("data_offset", 3)
        max_rows = cfg.get("max_rows", 60)
        j = hdr + offset_start
        sc = cfg["set_col"]
        wc = cfg["weight_col"]
        while j < len(rows) and j < hdr + offset_start + max_rows:
            if s(rows, j, sc).strip() == cfg.get("total_label", "Total"):
                total = n(rows, j, wc)
                break
            idx = n(rows, j, sc)
            w = n(rows, j, wc)
            if idx is not None and w is not None:
                out_weights.append({"set": idx, "weight": w})
            j += 1
        return {"weights": out_weights, "total": total}

    r0, r1 = cfg["row_range"]
    sc = cfg["set_col"]
    wc = cfg["weight_col"]
    for r in range(r0, r1):
        idx = n(rows, r, sc)
        w = n(rows, r, wc)
        if idx is not None and w is not None:
            out_weights.append({"set": idx, "weight": w})
    tr = cfg.get("total_row")
    tc = cfg.get("total_col", wc)
    if tr is not None:
        total = n(rows, tr, tc)
    res: dict[str, Any] = {"weights": out_weights, "total": total}
    is_cfg = cfg.get("initial_set")
    if is_cfg:
        c = _cell_coord(is_cfg)
        if c:
            res["initial_set"] = n(rows, *c)
    ir_cfg = cfg.get("initial_rtp")
    if ir_cfg:
        c = _cell_coord(ir_cfg)
        if c:
            res["initial_set_rtp"] = n(rows, *c)
    return res


def parse_paylines(profile: VendorProfile, raw_dir: Path) -> list[dict]:
    """Generic block-based paylines parser.

    cfg (profile.paylines_layout):
      sheet            — basename (default "Paylines")
      blocks: list of
        line_numbers: [1,2,3,4,5]
        data_row_range: [d0, d1]   inclusive
        col_start: 2               # first reel column for line 0
        cols_per_line: 5           # stride between lines
        marker: "X"                # cell marker indicating active row
        reels: 5
    """
    cfg = profile.data.get("paylines_layout")
    if not cfg:
        return []
    sheet = cfg.get("sheet", profile.sheets.get("paylines", "Paylines"))
    rows = load_tsv(raw_dir, sheet)
    marker = cfg.get("marker", "X")
    reels = cfg.get("reels", profile.dimensions.get("reels", 5))
    out: list[dict] = []
    for blk in cfg.get("blocks", []):
        line_nums = blk["line_numbers"]
        d0, d1 = blk["data_row_range"]
        col_start = blk["col_start"]
        cpl = blk["cols_per_line"]
        for k, ln in enumerate(line_nums):
            col0 = col_start + k * cpl
            line: list[int | None] = []
            for reel in range(reels):
                col = col0 + reel
                row_idx: int | None = None
                for r in range(d0, d1 + 1):
                    if s(rows, r, col).strip() == marker:
                        row_idx = r - d0
                        break
                line.append(row_idx)
            out.append({"line": ln, "rows": line})
    return out


def parse_features(rows: list[list[str]], profile: VendorProfile) -> dict:
    """Dispatch each feature block in profile.features to its registered parser.

    Returns dict {feature_type: parsed_data}. If a feature type appears
    multiple times, results are merged into a list under that key.
    """
    out: dict[str, Any] = {}
    for f in profile.features:
        ftype = f.get("type")
        if not ftype:
            continue
        parser = _features.get_parser(ftype)
        if parser is None:
            raise ValueError(f"unknown feature parser: {ftype!r}")
        result = parser(rows, f.get("config", {}) or {}, profile)
        if ftype in out:
            existing = out[ftype]
            if isinstance(existing, list):
                existing.append(result)
            else:
                out[ftype] = [existing, result]
        else:
            out[ftype] = result
    return out


def parse_par(profile: VendorProfile, raw_dir: Path, sheet: str | None = None) -> dict:
    """Parse one PAR sheet to canonical IR.

    `sheet` overrides profile.sheets.main_par (e.g. for multi-SWID
    iteration: PAR-001, PAR-002, PAR-003).
    """
    raw_dir = Path(raw_dir)
    sheet_name = sheet or profile.sheets["main_par"]
    rows = load_tsv(raw_dir, sheet_name)

    ir: dict[str, Any] = {
        "meta": parse_meta(rows, profile),
    }
    if profile.data.get("symbol_counts"):
        ir["symbol_counts_per_reel"] = parse_symbol_counts(rows, profile)
    if profile.data.get("paytable"):
        ir["paytable"] = parse_paytable(rows, profile)

    # Reel sets
    rs_cfg = profile.data.get("reel_sets") or {}
    if "base" in rs_cfg:
        ir["bg_reel_sets"] = parse_reel_sets(rows, rs_cfg["base"])
    if "fs" in rs_cfg:
        ir["fg_reel_sets"] = parse_reel_sets(rows, rs_cfg["fs"])

    # Reel set weights
    rw_cfg = profile.data.get("reel_set_weights") or {}
    if "base" in rw_cfg:
        ir["bg_reel_set_weights"] = parse_reel_set_weights(rows, rw_cfg["base"])
    if "fs" in rw_cfg:
        ir["fg_reel_set_weights"] = parse_reel_set_weights(rows, rw_cfg["fs"])

    # Features
    feat = parse_features(rows, profile)
    ir.update(feat)

    # Paylines (only if profile carries layout; auto-attached to IR)
    if profile.data.get("paylines_layout"):
        ir["paylines"] = parse_paylines(profile, raw_dir)
    return ir
