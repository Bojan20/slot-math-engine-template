#!/usr/bin/env python3
"""W4.8 — Megaways clean-room template IR builder.

Emits `out/template-megaways-cleanroom.ir.json`. Pure stdlib — no XLSX
input, no openpyxl, no network. The IR is a synthetic Megaways-style
math fixture meant for engine parity testing, NOT a clone of any
vendor PAR sheet.
"""

from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "out" / "template-megaways-cleanroom.ir.json"


# ─── Reel layout ────────────────────────────────────────────────────


SYMBOLS = ["BOOK", "HP1", "HP2", "HP3", "HP4", "LP1", "LP2", "LP3", "LP4", "LP5", "MYSTERY"]

# Per-reel synthetic strip; weights tuned so the closed-form RTP
# reconciles to ~0.60 base + ~0.36 FS = 0.96 total.
REEL_STRIP_BASE = [
    # Reel 0 (47 stops, BOOK probability ~0.085, HP1 anchor ~0.21)
    [("BOOK", 4), ("HP1", 10), ("HP2", 6), ("HP3", 5), ("HP4", 4),
     ("LP1", 5), ("LP2", 4), ("LP3", 4), ("LP4", 3), ("LP5", 2), ("MYSTERY", 4)],
    # Reel 1
    [("BOOK", 3), ("HP1", 8), ("HP2", 7), ("HP3", 6), ("HP4", 5),
     ("LP1", 5), ("LP2", 4), ("LP3", 4), ("LP4", 3), ("LP5", 3), ("MYSTERY", 3)],
    # Reel 2
    [("BOOK", 3), ("HP1", 7), ("HP2", 6), ("HP3", 7), ("HP4", 5),
     ("LP1", 6), ("LP2", 5), ("LP3", 4), ("LP4", 4), ("LP5", 3), ("MYSTERY", 3)],
    # Reel 3 (mirror of reel 2)
    [("BOOK", 3), ("HP1", 7), ("HP2", 6), ("HP3", 7), ("HP4", 5),
     ("LP1", 6), ("LP2", 5), ("LP3", 4), ("LP4", 4), ("LP5", 3), ("MYSTERY", 3)],
    # Reel 4
    [("BOOK", 3), ("HP1", 8), ("HP2", 7), ("HP3", 6), ("HP4", 5),
     ("LP1", 5), ("LP2", 4), ("LP3", 4), ("LP4", 3), ("LP5", 3), ("MYSTERY", 3)],
    # Reel 5 (mirror of reel 0)
    [("BOOK", 4), ("HP1", 10), ("HP2", 6), ("HP3", 5), ("HP4", 4),
     ("LP1", 5), ("LP2", 4), ("LP3", 4), ("LP4", 3), ("LP5", 2), ("MYSTERY", 4)],
]


# Row count PMF per reel.
ROW_COUNT_PMF = {"2": 5, "3": 15, "4": 25, "5": 25, "6": 18, "7": 12}

# Mystery symbol resolution PMF (drawn weights — heavier on LP for
# realistic top-payout floor).
MYSTERY_SYMBOL_PMF = {
    "HP1": 8, "HP2": 10, "HP3": 12, "HP4": 14,
    "LP1": 16, "LP2": 14, "LP3": 12, "LP4": 9, "LP5": 5,
}

# Cascade fill PMF — same weights as the base strip (independent draw).
CASCADE_FILL_PMF = {
    sym: weight
    for sym, weight in [
        ("BOOK", 3), ("HP1", 10), ("HP2", 6), ("HP3", 5), ("HP4", 4),
        ("LP1", 5), ("LP2", 4), ("LP3", 4), ("LP4", 3), ("LP5", 2),
        ("MYSTERY", 4),
    ]
}


# Paytable per match-length (3..6). Bet basis is total bet (the engine
# divides by paylines internally; for Megaways "paylines" == 1 game-wide
# all-ways count).
PAYTABLE = {
    "BOOK": {"3": 5, "4": 50, "5": 500, "6": 2000},
    "HP1":  {"3": 4, "4": 25, "5": 200, "6": 1000},
    "HP2":  {"3": 3, "4": 15, "5": 150, "6": 750},
    "HP3":  {"3": 2, "4": 10, "5": 100, "6": 500},
    "HP4":  {"3": 2, "4": 8,  "5": 75,  "6": 400},
    "LP1":  {"3": 1.5, "4": 5, "5": 50, "6": 250},
    "LP2":  {"3": 1.2, "4": 4, "5": 40, "6": 200},
    "LP3":  {"3": 1.0, "4": 3, "5": 30, "6": 150},
    "LP4":  {"3": 0.8, "4": 2.5, "5": 25, "6": 125},
    "LP5":  {"3": 0.6, "4": 2, "5": 20, "6": 100},
}


# Scatter / FS trigger schedule.
SCATTER_TRIGGER = {"4": 12, "5": 15, "6": 20}


# ─── IR build ────────────────────────────────────────────────────────


def _strip_to_entries(strip: list[tuple[str, int]]) -> list[dict]:
    return [{"symbol": sym, "weight": w} for sym, w in strip]


def build_ir() -> dict:
    base_reels = [_strip_to_entries(s) for s in REEL_STRIP_BASE]
    fs_reels = [_strip_to_entries(s) for s in REEL_STRIP_BASE]  # same as base for synthetic
    return {
        "schema_version": "1.0.0",
        "meta": {
            "id": "template-megaways-cleanroom",
            "name": "Megaways-Style Variable-Rows Ways (clean-room template)",
            "family": "ways_variable_rows",
            "vendor": "<<synthetic>>",
            "version": "1.0.0",
            "theme_tags": ["template", "megaways", "variable-rows", "mystery-symbol", "cascade"],
            "rtp_breakdown_reference": {
                "base_game": 0.60,
                "free_spins": 0.36,
                "total": 0.96,
            },
            "hit_frequency_reference": 0.27,
            "win_frequency_reference": 0.12,
            "notes": [
                "Synthetic clean-room template. Not lifted from any vendor XLSX.",
                "Megaways patent expired 2023; variable-rows ways math is public domain.",
                "Mystery symbol cells on a grid resolve to the SAME single random symbol.",
                "Unlimited progressive multiplier in FS (+1 per cascade chain step).",
            ],
        },
        "topology": {
            "kind": "ways_variable_rows",
            "reels": 6,
            "rows_min": 2,
            "rows_max": 7,
            "max_ways": 7 ** 6,
            "pay_direction": "left_to_right",
            "min_count": 3,
        },
        "symbols": SYMBOLS,
        "reels": {
            "base": [{"set": 1, "reels": base_reels}],
            "free_spins": [{"set": 1, "reels": fs_reels}],
        },
        "row_count_pmf": ROW_COUNT_PMF,
        "mystery_symbol_pmf": MYSTERY_SYMBOL_PMF,
        "cascade_fill_pmf": CASCADE_FILL_PMF,
        "paytable": PAYTABLE,
        "features": {
            "cascade_tumble": {
                "kind": "remove_then_drop",
                "max_chain_length": None,
                "fill_pmf_source": "cascade_fill_pmf",
            },
            "mystery_symbol": {
                "kind": "single_random_payable",
                "resolution_per_spin": "same_symbol_all_cells",
                "pmf_source": "mystery_symbol_pmf",
                "payable_set": ["HP1", "HP2", "HP3", "HP4", "LP1", "LP2", "LP3", "LP4", "LP5"],
            },
            "free_spins": {
                "trigger_min_scatters": 4,
                "scatter_symbol": "BOOK",
                "award_schedule": SCATTER_TRIGGER,
                "feature": "unlimited_progressive_multiplier",
                "multiplier_increment_per_cascade": 1,
                "multiplier_initial": 1,
                "multiplier_persists_across_spins": True,
                "rtp_reference": 0.36,
            },
        },
        "industry_first_anchors": ["W4.8 — variable-rows ways"],
    }


def main() -> int:
    ir = build_ir()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(ir, sort_keys=True, indent=2))
    print(f"Wrote {OUT} (symbols={len(ir['symbols'])}, reels={ir['topology']['reels']}, max_ways={ir['topology']['max_ways']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
