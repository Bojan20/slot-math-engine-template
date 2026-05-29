#!/usr/bin/env python3
"""
Lift Bonus Buy + Expanding-Symbol PAR dump → copyright-safe IR template.

Reads `raw/dump/*.tsv` (produced by `dump_excel.py`) and emits a
generic-named IR JSON that captures the math primitives required to
re-simulate the game:

  * reel weights (base + FS)
  * paytable (n-of-a-kind multiplier matrix)
  * 10-payline geometry
  * Expansion Symbol weights + Expansion Limit table
  * Bonus Buy cost + (optional) BB-stops weighted table
  * RTP breakdown reference (for parity gate)

Vendor / game / SWID identifiers are stripped:
  * meta.name      = "Book-Style Expanding Symbol + Bonus Buy (template)"
  * meta.vendor    = "<<redacted>>"
  * symbol ids     = HP1..HP4, LP1..LP5, BOOK
  * pay table keys = the same generic ids

Reads only local files.  No network access.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
DUMP = REPO / "raw" / "dump"
OUT = REPO / "out" / "template-book-bonusbuy.ir.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Copyright-safe symbol mapping
# ---------------------------------------------------------------------------
SYMBOL_MAP = {
    "Book": "BOOK",
    "Man": "HP1",
    "Woman": "HP2",
    "Ring": "HP3",
    "Key": "HP4",
    "Ace": "LP1",
    "King": "LP2",
    "Queen": "LP3",
    "Jack": "LP4",
    "Ten": "LP5",
}
REEL_ORDER = ["BOOK", "HP1", "HP2", "HP3", "HP4", "LP1", "LP2", "LP3", "LP4", "LP5"]


def read_tsv(name: str) -> list[list[str]]:
    with (DUMP / f"{name}.tsv").open(encoding="utf-8") as fh:
        return list(csv.reader(fh, delimiter="\t"))


def to_float(x: str) -> float | None:
    try:
        return float(x)
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Extract reel weights from PAR_001
# ---------------------------------------------------------------------------
def extract_base_reels() -> dict:
    rows = read_tsv("PAR_001")
    # Reel header sits a few rows below "BASE GAME" header.
    # We scan for the row containing "Reel 1" "Reel 2" ... in order.
    weights: dict[str, list[int]] = {}
    in_block = False
    for row in rows:
        joined = [c.strip() for c in row]
        if "Reel 1" in joined and "Reel 5" in joined:
            in_block = True
            continue
        if not in_block:
            continue
        if not any(joined):
            break
        # First non-empty cell is symbol name
        cells = [c for c in joined if c]
        if not cells:
            continue
        name = cells[0]
        if name.lower() in ("total", "totals"):
            break
        if name not in SYMBOL_MAP:
            continue
        sid = SYMBOL_MAP[name]
        try:
            wvec = [int(float(c)) for c in cells[1:6]]
        except ValueError:
            continue
        if len(wvec) == 5:
            weights[sid] = wvec
    return weights


# ---------------------------------------------------------------------------
# Extract paytable from PAR_001 (n-of-a-kind matrix)
# ---------------------------------------------------------------------------
def extract_paytable() -> dict[str, dict[int, int]]:
    rows = read_tsv("PAR_001")
    pay: dict[str, dict[int, int]] = {}
    for row in rows:
        cells = [c.strip() for c in row if c.strip()]
        if len(cells) < 5:
            continue
        # Pattern: SYM SYM SYM SYM SYM PPH PAYS PAY%
        sym = cells[0]
        if sym not in SYMBOL_MAP:
            continue
        if not all(c in (sym, "--") for c in cells[:5]):
            continue
        count = sum(1 for c in cells[:5] if c == sym)
        pays_idx = 6  # PPH at index 5, PAYS at index 6
        if len(cells) <= pays_idx:
            continue
        pays = to_float(cells[pays_idx])
        if pays is None or pays <= 0:
            continue
        sid = SYMBOL_MAP[sym]
        pay.setdefault(sid, {})[count] = int(pays)
    return pay


def extract_scatter_pay() -> dict[int, int]:
    rows = read_tsv("PAR_001")
    out: dict[int, int] = {}
    for row in rows:
        cells = [c.strip() for c in row if c.strip()]
        if len(cells) < 3:
            continue
        if not cells[0].endswith("Book Scatter"):
            continue
        try:
            count = int(cells[0].split()[0])
            pays = int(float(cells[2]))
        except (ValueError, IndexError):
            continue
        out[count] = pays
    return out


# ---------------------------------------------------------------------------
# Extract paylines from PAR_LINES
# ---------------------------------------------------------------------------
def extract_paylines() -> list[list[int]]:
    """
    The dump represents each line as a 3-row × 5-col patch with `1` in the
    cells where the line passes through. We recover them by grouping
    consecutive non-empty triples. csv reader strips trailing empty cells per
    row so we re-read raw to preserve column alignment.
    """
    raw = (DUMP / "PAR_LINES.tsv").read_text(encoding="utf-8").splitlines()
    rows = [line.split("\t") for line in raw]
    # Search the grid: for every column position where header "Line N:" sits,
    # the next 3 rows × 5 columns to the right encode that line.
    out: list[list[int]] = []
    for r_idx, row in enumerate(rows):
        for c_idx, cell in enumerate(row):
            cell_s = cell.strip()
            if not cell_s.startswith("Line ") or not cell_s.endswith(":"):
                continue
            # Each line block is laid out as 3 rows × 5 cols starting at the same
            # column as the "Line N:" cell, with `1` marking the row the line
            # passes through on each reel.
            line_geom: list[int] = []
            for col_off in range(0, 5):
                col = c_idx + col_off
                row_idx = -1
                for rr in range(1, 4):
                    if r_idx + rr >= len(rows):
                        break
                    target_row = rows[r_idx + rr]
                    if col < len(target_row) and target_row[col].strip() == "1":
                        row_idx = rr - 1  # 0=top, 1=middle, 2=bottom
                        break
                if row_idx >= 0:
                    line_geom.append(row_idx)
            if len(line_geom) == 5:
                out.append(line_geom)
    return out


# ---------------------------------------------------------------------------
# Extract Bonus Buy + Expansion tables from PAR_BonusBuy_001 + PRE-BONUS block
# ---------------------------------------------------------------------------
def extract_expansion_table_and_limit() -> tuple[dict[str, int], dict[int, int]]:
    """
    PRE-BONUS GAME block (in PAR_001) carries:
      * Expansion Symbol Table  (symbol -> weight)
      * Expansion Limit table   (book_count -> limit)
    """
    rows = read_tsv("PAR_001")
    exp_weights: dict[str, int] = {}
    exp_limit: dict[int, int] = {}
    in_block = False
    for row in rows:
        joined = " ".join(c.strip() for c in row if c.strip())
        if "Expansion Symbol Table" in joined:
            in_block = True
            continue
        if not in_block:
            continue
        cells = [c.strip() for c in row if c.strip()]
        if not cells:
            if exp_weights:
                # Block ended after weights table read
                break
            continue
        # Symbol weight row
        if cells[0] in SYMBOL_MAP and len(cells) >= 2:
            sid = SYMBOL_MAP[cells[0]]
            w = to_float(cells[1])
            if w is not None:
                exp_weights[sid] = int(w)
            # Optional book count + limit on same line (cols 3 / 4)
            if len(cells) >= 4:
                bc = to_float(cells[2])
                lim = to_float(cells[3])
                if bc is not None and lim is not None:
                    exp_limit[int(bc)] = int(lim)
    return exp_weights, exp_limit


def extract_bonus_buy_meta() -> dict:
    rows = read_tsv("PAR_BonusBuy_001")
    meta: dict[str, Any] = {
        "cost_x_total_bet": 100,
        "rtp_bb_base": None,
        "rtp_bb_bonus": None,
        "rtp_bb_total": None,
        "rtp_normal_reference": None,
        "fair_price_delta": None,
        "top_award_x_bet": 5000,
        "top_award_odds_per_bb": None,
    }
    for row in rows:
        cells = [c.strip() for c in row if c.strip()]
        if "BB Base RTP" in row:
            for c in cells:
                v = to_float(c)
                if v is not None and 0 < v < 1:
                    meta["rtp_bb_base"] = v
                    break
        if "BB Bonus RTP" in row:
            for c in cells:
                v = to_float(c)
                if v is not None and 0 < v < 1:
                    meta["rtp_bb_bonus"] = v
                    break
        if any("BB Total RTP" in c for c in row):
            for c in cells:
                v = to_float(c)
                if v is not None and 0 < v < 1:
                    meta["rtp_bb_total"] = v
                    break
        if "Normal RTP" in row:
            for c in cells:
                v = to_float(c)
                if v is not None and 0 < v < 1:
                    meta["rtp_normal_reference"] = v
                    break
        if "BB - Normal" in row or "BB-Normal" in row:
            for c in cells:
                v = to_float(c)
                if v is not None and abs(v) < 0.1:
                    meta["fair_price_delta"] = v
                    break
    return meta


def extract_bonus_buy_stops_summary() -> dict:
    rows = read_tsv("PAR_BonusBuyStops")
    entries = 0
    total_weight = 0
    for row in rows:
        cells = [c.strip() for c in row if c.strip()]
        if len(cells) >= 7:
            try:
                int(cells[0])  # index column
                w = int(cells[6])
            except ValueError:
                continue
            entries += 1
            total_weight += w
    return {
        "stop_entries": entries,
        "total_weight": total_weight,
        "sampling": "weighted_draw_with_replacement",
        "guarantees_trigger": True,
    }


# ---------------------------------------------------------------------------
# Assemble the IR
# ---------------------------------------------------------------------------
def build_ir() -> dict:
    base_weights = extract_base_reels()
    paytable = extract_paytable()
    scatter_pay = extract_scatter_pay()
    paylines = extract_paylines()
    exp_weights, exp_limit = extract_expansion_table_and_limit()
    bb_meta = extract_bonus_buy_meta()
    bb_stops = extract_bonus_buy_stops_summary()

    # Convert per-symbol weight vectors → standard `reels.base[set=1]` structure
    reels: list[dict] = []
    for reel_idx in range(5):
        strip: list[dict] = []
        for sid in REEL_ORDER:
            w = base_weights.get(sid, [0, 0, 0, 0, 0])[reel_idx]
            if w > 0:
                strip.append({"symbol": sid, "weight": w})
        reels.append(strip)

    return {
        "schema_version": "1.0.0",
        "meta": {
            "id": "template-book-bonusbuy",
            "name": "Book-Style Expanding Symbol + Bonus Buy (template)",
            "vendor": "<<redacted>>",
            "version": "1.0.0",
            "family": "lines",
            "theme_tags": ["template", "book-of-x", "bonus-buy", "expanding-symbol"],
            "rtp_breakdown_reference": {
                "line_pay": 0.5282426698490047,
                "scatter_pay": 0.008004723783004326,
                "bonus_pay": 0.42579679451229185,
                "total_normal": 0.9620441881443009,
            },
            "hit_frequency_reference": 0.299380912,
            "win_frequency_reference": 0.079729474,
            "rtp_tiers_reference": {
                "tier_001": 0.9620441881443009,
                "tier_002": 0.9420319725805693,
                "tier_003": 0.9250643113665171,
            },
            "notes": [
                "Copyright-safe template — vendor/game/SWID identifiers stripped.",
                "10 paylines fixed bet for 10 coins (1 coin per line).",
                "BOOK is both scatter AND wild substitute for all other symbols.",
                "Free Spins trigger: 3+ BOOK on initial reel window.",
                "Pre-FS: draw 1 Expansion Symbol (weighted, with replacement).",
                "During FS: drawn Expansion Symbol expands to all rows on its reel.",
                "Expansions counter ≤ Expansion Limit table (3/4/5 books → 4/6/10).",
                "Bonus Buy: pay 100× total bet → triggering spin sampled from BB stops table",
                "  (always lands 3/4/5 Book → bonus always triggers).",
                "Fair-price model: BB Total RTP − Normal RTP ≈ +0.00004 (BB Base on trigger).",
            ],
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "evaluation": {"kind": "lines", "lines": paylines, "min_count": 3},
        "symbols": [
            {"id": "BOOK", "name": "BOOK", "role": "scatter_wild",
             "substitutes": ["*"], "substitutes_except": []},
            {"id": "HP1", "name": "HP1", "role": "hp"},
            {"id": "HP2", "name": "HP2", "role": "hp"},
            {"id": "HP3", "name": "HP3", "role": "hp"},
            {"id": "HP4", "name": "HP4", "role": "hp"},
            {"id": "LP1", "name": "LP1", "role": "lp"},
            {"id": "LP2", "name": "LP2", "role": "lp"},
            {"id": "LP3", "name": "LP3", "role": "lp"},
            {"id": "LP4", "name": "LP4", "role": "lp"},
            {"id": "LP5", "name": "LP5", "role": "lp"},
        ],
        "reels": {
            "base": [{"set": 1, "reels": reels}],
            "free_spins": [{"set": 1, "reels": reels, "note": "FS uses same physical strips as base."}],
        },
        "paytable": {
            "line_wins": paytable,
            "scatter": {"symbol": "BOOK", "pays_x_total_bet": scatter_pay},
        },
        "features": {
            "free_spins": {
                "trigger_min_scatters": 3,
                "expansion_symbol_table": exp_weights,
                "expansion_limit_by_book_count": exp_limit,
                "expansion_cap": 99,
                "retrigger": True,
                "avg_spins_reference": 13.69438366960194,
                "avg_expansions_reference": 4.397483048525336,
                "avg_pay_x_bet_reference": 77,
                "rtp_reference": 0.42579679451229185,
            },
            "bonus_buy": {
                **bb_meta,
                "stops_table": bb_stops,
                "deterministic_trigger": True,
                "fair_price_target": "BB Total RTP ≈ Normal RTP (delta ≤ +0.1%)",
            },
        },
        "industry_first_anchors": {
            "W4_11_bonus_buy": True,
            "W4_15_expanding_symbol_fs": True,
        },
    }


def main() -> None:
    ir = build_ir()
    OUT.write_text(json.dumps(ir, ensure_ascii=False, indent=2))
    print(f"[lift-to-ir] wrote {OUT}")
    print(f"[lift-to-ir] paylines={len(ir['evaluation']['lines'])}")
    print(f"[lift-to-ir] reel-symbol coverage:")
    for i, strip in enumerate(ir["reels"]["base"][0]["reels"]):
        total = sum(e["weight"] for e in strip)
        syms = ",".join(e["symbol"] for e in strip)
        print(f"  reel {i+1}: total={total:3d}  syms={syms}")
    bb = ir["features"]["bonus_buy"]
    print(f"[lift-to-ir] BB: cost={bb['cost_x_total_bet']}x, "
          f"bb_total={bb['rtp_bb_total']}, normal={bb['rtp_normal_reference']}, "
          f"delta={bb['fair_price_delta']}")
    fs = ir["features"]["free_spins"]
    print(f"[lift-to-ir] FS: avg_spins={fs['avg_spins_reference']:.2f}, "
          f"avg_exp={fs['avg_expansions_reference']:.2f}, "
          f"rtp_share={fs['rtp_reference']:.4f}")


if __name__ == "__main__":
    main()
