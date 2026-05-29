#!/usr/bin/env python3
"""CE COPY TEST — comprehensive PAR parser.

Reads raw/PAR-001.tsv (and PAR-002, PAR-003) and emits a canonical
IR JSON `out/ce-copy-test.<swid>.ir.json` containing EVERY structured
piece of the PAR sheet:

  - meta: SWID, RTP, hold, hit freq, win freq, max win, max liability, bets
  - symbols: full list (base + Big variants for FS)
  - paylines: 20 paylines from Paylines.tsv
  - paytable (base game): all combos + Pattern Win
  - bg_reel_sets: 36 sets × 5 reels (symbol + weight per stop)
  - bg_reel_set_weights: weight per set (total 500000), initial set
  - fg_reel_sets: 16 sets × 5 reels (FS pool, includes Big-symbol variants)
  - fg_reel_set_weights: weight per set (total 39752)
  - fg_paytable: free spins paytable (4/5 of kind, Big Volcano)
  - bonus_summary: avg FS, single-spin payback%, total payback%
  - cash_eruption_feature: per-bet-multiplier feature math (Fireball
    landed → remaining respins → additional-Fireball weight tables;
    small/big fireball coin-value pools low/med/high; MINI/MINOR/MAJOR
    pots; GRAND probabilities; per-page CE-from-base + CE-from-FS RTP)

Round-trips bit-identical against raw/<sheet>.cells.json so the IR is
the proven single source of truth for downstream Rust/TS engines.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
OUT = ROOT / "out"
OUT.mkdir(parents=True, exist_ok=True)


def load_tsv(name: str) -> list[list[str]]:
    rows = []
    text = (RAW / f"{name}.tsv").read_text()
    for line in text.split("\n"):
        rows.append(line.split("\t"))
    return rows


def num(s):
    if s is None or s == "":
        return None
    try:
        v = float(s)
        return int(v) if v.is_integer() else v
    except (ValueError, TypeError):
        return None


def s(rows, r, c):
    if r >= len(rows) or c >= len(rows[r]):
        return ""
    return rows[r][c]


def n(rows, r, c):
    return num(s(rows, r, c))


# ---------------------------------------------------------------- META
def parse_meta(rows):
    # Row 1 (idx 0): Hold*: -> O1 (idx 14)
    # Row 2 (idx 1): All Line Hit Frequency*: -> O2 (idx 14)
    # Row 3 (idx 2): All Line Win Frequency*: -> O3 (idx 14); Software ID -> E3 (idx 4)
    hold = n(rows, 0, 14)
    hit_freq = n(rows, 1, 14)
    win_freq = n(rows, 2, 14)
    swid = s(rows, 2, 4).strip()
    # K68..K71 (idx 10) labels, L68..L72 (idx 11) values
    rtp_breakdown = {
        "base_game": n(rows, 67, 11),               # L68
        "cash_eruption_from_base": n(rows, 68, 11), # L69
        "free_spins": n(rows, 69, 11),              # L70
        "cash_eruption_from_fs": n(rows, 70, 11),   # L71
        "total": n(rows, 71, 11),                   # L72
    }
    # Bet multipliers: L25..L45 (idx 11) ; Total bet M (idx 12) ; Max Liability N (idx 13)
    bet_mults, total_bets, max_liabs = [], [], []
    for r in range(24, 45):
        bm = n(rows, r, 11)
        tb = n(rows, r, 12)
        ml = n(rows, r, 13)
        if bm is not None:
            bet_mults.append(bm)
            total_bets.append(tb)
            max_liabs.append(ml)
    return {
        "name": "CE COPY TEST",
        "based_on": "Pattern-CE (exact paymodel copy)",
        "swid": swid,
        "reels": 5,
        "rows": 3,
        "lines": 20,
        "left_to_right_only": True,
        "hold": hold,
        "hit_frequency_all_line": hit_freq,
        "win_frequency_all_line": win_freq,
        "rtp_breakdown": rtp_breakdown,
        "rtp_total": rtp_breakdown["total"],
        "bet_multipliers": bet_mults,
        "total_bets": total_bets,
        "max_liabilities": max_liabs,
    }


# ---------------------------------------------------------------- SYMBOLS
def parse_symbol_counts(rows):
    # Rows 7..19 col C..H: symbol name + 5 reel averages
    out = {}
    for r in range(7, 20):
        name = s(rows, r, 2).strip()
        if not name or name == "Total":
            continue
        out[name] = [n(rows, r, c) for c in range(3, 8)]
    return out


# ---------------------------------------------------------------- PAYTABLE
def parse_paytable(rows):
    # Rows 25..55 (Python idx 24..54): C..G (idx 2..6) = symbols ; H (7) = Pays ; I (8) = PPH ; J (9) = RTP%
    # Marker (e.g. "*") at column B (idx 1).
    combos = []
    for r in range(24, 55):
        cells = [s(rows, r, c).strip() for c in range(2, 7)]
        pays = n(rows, r, 7)
        pph = n(rows, r, 8)
        rtp_pct = n(rows, r, 9)
        marker = s(rows, r, 1).strip()
        if pays is None or all(c == "" for c in cells):
            continue
        combos.append({
            "marker": marker,
            "combo": cells,
            "pays": pays,
            "pph": pph,
            "rtp_pct": rtp_pct,
        })
    # The 21-row bet table appears in the same row range under col J..L.
    # That's the bet_multipliers already captured in parse_meta — skip here.
    return combos


# ---------------------------------------------------------------- REEL SET WEIGHTS
def parse_bg_reel_set_weights(rows):
    # Rows 68..103 col C..D : set# weight, row 104 Total/500000
    out = []
    for r in range(68, 104):
        idx = n(rows, r, 2)
        w = n(rows, r, 3)
        if idx is not None and w is not None:
            out.append({"set": idx, "weight": w})
    initial_set = n(rows, 104, 5)  # F105 = 29
    initial_rtp = n(rows, 104, 6)  # G105 = 0.024612
    total = n(rows, 104, 3)        # D105 = 500000
    return {"weights": out, "total": total, "initial_set": initial_set, "initial_set_rtp": initial_rtp}


# ---------------------------------------------------------------- REELS
RE_REEL_HEADER = re.compile(r"^Base Game Reel Set:\s*$|^Free Spins Reel Set:\s*$")


def parse_reel_sets(rows, kind: str):
    """Walk the TSV and pull every '<kind> Reel Set: N' block.

    kind = 'base' or 'fs'.  Returns list of dict { set: N, reels: [[ {symbol, weight} ] * 5] }
    """
    label = "Base Game Reel Set:" if kind == "base" else "Free Spins Reel Set:"
    sets = []
    i = 0
    while i < len(rows):
        # Search for the label cell — typically col B (idx 1)
        if s(rows, i, 1).strip() == label:
            set_num = n(rows, i, 3)
            # Strip header rows: blank, "Reel 1 ...", "Symbol Weight ..."
            data_start = i + 4
            reels = [[] for _ in range(5)]
            j = data_start
            while j < len(rows):
                # Stop at "Total" line
                if s(rows, j, 2).strip() == "Total":
                    break
                # Each row: col B = index, col C = R1 symbol, col D = R1 weight, col E = R2 symbol, col F = R2 weight, ...
                idx = n(rows, j, 1)
                if idx is None:
                    j += 1
                    if j > data_start + 200:
                        break
                    continue
                for reel in range(5):
                    sym = s(rows, j, 2 + reel * 2).strip()
                    w = n(rows, j, 3 + reel * 2)
                    if sym:
                        reels[reel].append({"symbol": sym, "weight": w if w is not None else 0})
                j += 1
            sets.append({"set": set_num, "reels": reels})
            i = j + 1
        else:
            i += 1
    return sets


# ---------------------------------------------------------------- FS REEL SET WEIGHTS
def parse_fg_reel_set_weights(rows):
    # The FS reel weights table appears AFTER the "Free Spins Reel Set Weights" header
    # Find that header row, then walk down "Reel Set / Weight" until "Total".
    for i, r in enumerate(rows):
        joined = "\t".join(r)
        if "Free Spins Reel Set Weights" in joined:
            # Skip header + header-row
            start = i + 3
            out = []
            j = start
            total = None
            while j < len(rows):
                idx = n(rows, j, 2)
                if s(rows, j, 2).strip() == "Total":
                    total = n(rows, j, 3)
                    break
                w = n(rows, j, 3)
                if idx is not None and w is not None:
                    out.append({"set": idx, "weight": w})
                j += 1
                if j > start + 60:
                    break
            return {"weights": out, "total": total}
    return {"weights": [], "total": None}


# ---------------------------------------------------------------- BONUS SUMMARY
def parse_bonus_summary(rows):
    for i, r in enumerate(rows):
        joined = "\t".join(r)
        if "Bonus Summary" in joined:
            # Data is 3 rows below header (header row + col-headers + data)
            data_row = i + 3
            avg_fs = n(rows, data_row, 2)
            single_pct = n(rows, data_row, 3)
            total_pct = n(rows, data_row, 4)
            return {
                "avg_free_spins": avg_fs,
                "single_spin_payback_pct": single_pct,
                "total_payback_pct": total_pct,
            }
    return {}


# ---------------------------------------------------------------- FS PAYTABLE
def parse_fs_paytable(rows):
    # Find FS section header: cell C with literal "Free Spins Bonus"
    # (skips the earlier 'note' row about scatter triggers).
    fs_start = None
    for i, r in enumerate(rows):
        if s(rows, i, 2).strip() == "Free Spins Bonus":
            fs_start = i
            break
    if fs_start is None:
        return []
    # Scan for "Combination ... Pays PPH RTP %" header below fs_start
    header_row = None
    for j in range(fs_start, min(fs_start + 50, len(rows))):
        if s(rows, j, 2).strip() == "Combination" and "Pays" in s(rows, j, 7):
            header_row = j
            break
    if header_row is None:
        return []
    combos = []
    j = header_row + 1
    while j < len(rows):
        cells = [s(rows, j, c).strip() for c in range(2, 7)]
        pays = n(rows, j, 7)
        pph = n(rows, j, 8)
        rtp_pct = n(rows, j, 9)
        marker = s(rows, j, 1).strip()
        if all(c == "" for c in cells) and pays is None:
            j += 1
            if j > header_row + 60:
                break
            continue
        if "RTP and PPH" in "\t".join(rows[j]) or "Bonus Summary" in "\t".join(rows[j]):
            break
        combos.append({
            "marker": marker,
            "combo": cells,
            "pays": pays,
            "pph": pph,
            "rtp_pct": rtp_pct,
        })
        j += 1
    return combos


# ---------------------------------------------------------------- CASH ERUPTION FEATURE
def parse_cash_eruption_pages(rows):
    """Walk the entire sheet and pull every 'BET MULTIPLIER N' page."""
    pages = []
    i = 0
    while i < len(rows):
        joined = "\t".join(rows[i])
        m = re.search(r"BET MULTIPLIER\s+(\d+)", joined)
        if m:
            bet_mult = int(m.group(1))
            page = parse_one_ce_page(rows, i)
            page["bet_multiplier"] = bet_mult
            pages.append(page)
        i += 1
    return pages


def parse_one_ce_page(rows, start: int):
    """Parse one Pattern-CE feature page (one BET MULTIPLIER)."""
    out = {
        "fireballs_set_weights": {},  # low / med / high pool weights (out of 4294967295)
        "small_fireball_values": [],  # rows: coin_value, low, med, high
        "big_fireball_values": [],
        "mini_minor_major": {},  # {"MINI": {value, low, med, high}, ...}
        "respin_tables": {},  # {N_landed: {3: {0: w, 1: w, ...}, 2: {...}, 1: {...}}}
        "ce_from_base_rtp": None,
        "ce_from_fs_rtp": None,
        "grand_prob_base": None,
        "grand_prob_fs": None,
        "top_award": None,
    }
    # Find limits: next BET MULTIPLIER OR end of sheet
    end = len(rows)
    for k in range(start + 1, len(rows)):
        if re.search(r"BET MULTIPLIER\s+\d+", "\t".join(rows[k])):
            end = k
            break
    block = rows[start:end]
    # 1) Fireballs Set weights — label at col K (idx 10), weight at L (idx 11)
    for j, r in enumerate(block):
        if s(rows, start + j, 10).strip() == "Fireballs Set":
            for offset in range(1, 6):
                lbl = s(rows, start + j + offset, 10).strip()
                w = n(rows, start + j + offset, 11)
                if lbl in ("low", "med", "high"):
                    out["fireballs_set_weights"][lbl] = w
                elif lbl == "Total":
                    out["fireballs_set_weights"]["total"] = w
                    break
            break
    # 2) Small Fireballs + Big Fireball tables — label at col K (idx 10)
    sf_header_j = None
    bf_header_j = None
    for j, r in enumerate(block):
        absrow = start + j
        if s(rows, absrow, 10).strip() == "Small Fireballs":
            sf_header_j = absrow
        if s(rows, absrow, 10).strip() == "Big Fireball":
            bf_header_j = absrow
    if sf_header_j is not None:
        out["small_fireball_values"] = parse_fireball_table(rows, sf_header_j, out["mini_minor_major"], "small")
    if bf_header_j is not None:
        out["big_fireball_values"] = parse_fireball_table(rows, bf_header_j, out["mini_minor_major"], "big")
    # 3) Respin tables: "N Fireballs landed" at col C (idx 2)
    for j, r in enumerate(block):
        absrow = start + j
        m = re.match(r"(\d+) Fireballs landed", s(rows, absrow, 2).strip())
        if m:
            n_landed = int(m.group(1))
            out["respin_tables"][n_landed] = parse_respin_table(rows, absrow)
    # 4) CE from base / CE from FS RTP — label at col D (idx 3), value at col H (idx 7)
    for j, r in enumerate(block):
        absrow = start + j
        cell = s(rows, absrow, 3).strip()
        if "Pattern-CE" in cell and "from the Base Game RTP" in cell:
            out["ce_from_base_rtp"] = n(rows, absrow, 7)
        if "Pattern-CE" in cell and "from the Free Spins Bonus RTP" in cell:
            out["ce_from_fs_rtp"] = n(rows, absrow, 7)
    # 5) GRAND row — label at K, value at K next row, probs at L,M
    for j, r in enumerate(block):
        absrow = start + j
        if s(rows, absrow, 10).strip() == "GRAND":
            # next row holds the numeric value + probs
            out["top_award"] = n(rows, absrow + 1, 10)
            out["grand_prob_base"] = n(rows, absrow + 1, 11)
            out["grand_prob_fs"] = n(rows, absrow + 1, 12)
            break
    return out


def parse_fireball_table(rows, header_row, mini_minor_major, kind: str):
    """Parse Small Fireballs / Big Fireball coin-value × {low,med,high} weight table.

    Column layout discovered from cells.json (PAR-001 BET MULTIPLIER 1 page):
      K (idx 10) = coin value (or 'MINI'/'MINOR'/'MAJOR' label when J idx 9 has tier name)
      L (idx 11) = low weight
      M (idx 12) = med weight
      N (idx 13) = high weight
      'Total' row at K column with total in L/M/N.
    Tier label (MINI/MINOR/MAJOR) is at column J (idx 9); pot value at K (idx 10).
    """
    out = []
    # +2 skips: "Small Fireballs / Weight" header row + "coin values / low / med / high" sub-header
    j = header_row + 2
    safety = 0
    while j < len(rows) and safety < 60:
        lbl_k = s(rows, j, 10).strip()
        lbl_j = s(rows, j, 9).strip()
        if lbl_k == "Total":
            break
        if lbl_j in ("MINI", "MINOR", "MAJOR"):
            mini_minor_major.setdefault(kind, {})[lbl_j] = {
                "value": n(rows, j, 10),
                "low": n(rows, j, 11),
                "med": n(rows, j, 12),
                "high": n(rows, j, 13),
            }
            j += 1
            safety += 1
            continue
        coin = n(rows, j, 10)
        low = n(rows, j, 11)
        med = n(rows, j, 12)
        high = n(rows, j, 13)
        if coin is not None:
            out.append({"coin_value": coin, "low": low, "med": med, "high": high})
        j += 1
        safety += 1
    return out


def parse_respin_table(rows, header_row):
    """Parse 'N Fireballs landed' respin table.

    Layout:
      header_row:    N Fireballs landed
      header_row+1:    Number of remaining respins
      header_row+2:    3   2   1
      header_row+3:  Number of additional Fireballs    Weight
      header_row+4:  0  w3  w2  w1
      ...
      header_row+?:  Total  T3 T2 T1
    """
    out = {3: {}, 2: {}, 1: {}}
    j = header_row + 4
    safety = 0
    while j < len(rows) and safety < 25:
        lbl = s(rows, j, 2).strip()
        v = n(rows, j, 2)
        if lbl == "Total":
            out[3]["total"] = n(rows, j, 3)
            out[2]["total"] = n(rows, j, 4)
            out[1]["total"] = n(rows, j, 5)
            break
        if v is not None and isinstance(v, int):
            n_add = v
            w3 = n(rows, j, 3)
            w2 = n(rows, j, 4)
            w1 = n(rows, j, 5)
            if w3 is not None:
                out[3][n_add] = w3
            if w2 is not None:
                out[2][n_add] = w2
            if w1 is not None:
                out[1][n_add] = w1
        j += 1
        safety += 1
    return out


# ---------------------------------------------------------------- PAYLINES
def parse_paylines():
    rows = load_tsv("Paylines")
    # 20 paylines arranged in 4 row-groups of 5 paylines × 3 rows (header + 3 rows of X marks)
    # We need: for each payline, list of 5 row indices (0=top, 1=mid, 2=bot)
    paylines = []
    # Block 1: lines 1-5 = rows 1..4 (header in row 2, data in rows 3..5 → indices 2,3,4)
    # Headers at TSV row 2 (idx 1): "Payline 1" "Payline 2" etc.
    blocks = [
        # (header_row_idx, line numbers, data row range)
        (1, [1, 2, 3, 4, 5], (2, 5)),
        (5, [6, 7, 8, 9, 10], (6, 9)),
        (9, [11, 12, 13, 14, 15], (10, 13)),
        (13, [16, 17, 18, 19, 20], (14, 17)),
    ]
    # Each block has 5 paylines × 5 reels. Columns: each payline block spans 5 columns.
    # Layout: col 2 = label (e.g. blank), cols 3..7 = payline 1 reels, cols 8..12 = payline 2 reels, ...
    for hdr_idx, line_nums, (d0, d1) in blocks:
        for k, ln in enumerate(line_nums):
            # Labels: C2/H2/M2/R2/W2 → cols 2,7,12,17,22 (idx) → step 5 starting at 2.
            col_start = 2 + k * 5
            line = []
            for reel in range(5):
                col = col_start + reel
                # find which row in [d0..d1] has "X" in this column
                row_idx = None
                for r in range(d0, d1 + 1):
                    if s(rows, r, col).strip() == "X":
                        row_idx = r - d0  # 0,1,2 within block
                        break
                line.append(row_idx)
            paylines.append({"line": ln, "rows": line})
    return paylines


# ---------------------------------------------------------------- DRIVER
def parse_one(sheet_name: str):
    rows = load_tsv(sheet_name)
    print(f"\n=== {sheet_name} ===")
    meta = parse_meta(rows)
    print(f"  SWID={meta['swid']} RTP={meta['rtp_total']} hold={meta['hold']} HF={meta['hit_frequency_all_line']}")
    sym_counts = parse_symbol_counts(rows)
    paytable = parse_paytable(rows)
    bg_w = parse_bg_reel_set_weights(rows)
    bg_sets = parse_reel_sets(rows, "base")
    fg_w = parse_fg_reel_set_weights(rows)
    fg_sets = parse_reel_sets(rows, "fs")
    fs_paytable = parse_fs_paytable(rows)
    bonus_summary = parse_bonus_summary(rows)
    ce_pages = parse_cash_eruption_pages(rows)
    print(f"  bg_sets={len(bg_sets)} fg_sets={len(fg_sets)}")
    print(f"  paytable_combos={len(paytable)} fs_paytable_combos={len(fs_paytable)}")
    print(f"  ce_feature_pages={len(ce_pages)} (per bet-multiplier)")
    return {
        "meta": meta,
        "symbol_counts_per_reel": sym_counts,
        "paytable": paytable,
        "bg_reel_set_weights": bg_w,
        "bg_reel_sets": bg_sets,
        "fg_reel_set_weights": fg_w,
        "fg_reel_sets": fg_sets,
        "fs_paytable": fs_paytable,
        "bonus_summary": bonus_summary,
        "cash_eruption_feature_pages": ce_pages,
    }


def main():
    paylines = parse_paylines()
    out_paylines = {"paylines": paylines}
    (OUT / "paylines.json").write_text(json.dumps(out_paylines, indent=2, ensure_ascii=False))
    print(f"\n[paylines] {len(paylines)} lines → out/paylines.json")

    for sheet in ("PAR-001", "PAR-002", "PAR-003"):
        ir = parse_one(sheet)
        ir["paylines"] = paylines
        swid = ir["meta"]["swid"].replace(" ", "_")
        path = OUT / f"ce-copy-test.{swid}.ir.json"
        path.write_text(json.dumps(ir, indent=2, ensure_ascii=False, default=str))
        print(f"  → {path.name} ({path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
