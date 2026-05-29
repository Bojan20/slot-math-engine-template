#!/usr/bin/env python3
"""W4.12 — Walking Wild clean-room template IR builder.

Emits `out/template-walking-wild-cleanroom.ir.json`. Pure stdlib.
"""

from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "out" / "template-walking-wild-cleanroom.ir.json"


SYMBOLS = ["BOOK", "WILD", "HP1", "HP2", "HP3", "LP1", "LP2", "LP3", "LP4", "LP5"]

# 5 reels × ~40 stops each, tuned for ~0.61 base RTP.
REEL_STRIP_BASE = [
    [("BOOK", 2), ("WILD", 1), ("HP1", 6), ("HP2", 5), ("HP3", 4),
     ("LP1", 5), ("LP2", 4), ("LP3", 4), ("LP4", 3), ("LP5", 3)],
    [("BOOK", 3), ("WILD", 1), ("HP1", 5), ("HP2", 5), ("HP3", 4),
     ("LP1", 5), ("LP2", 4), ("LP3", 4), ("LP4", 4), ("LP5", 3)],
    [("BOOK", 2), ("WILD", 2), ("HP1", 5), ("HP2", 4), ("HP3", 4),
     ("LP1", 5), ("LP2", 5), ("LP3", 4), ("LP4", 4), ("LP5", 3)],
    [("BOOK", 3), ("WILD", 1), ("HP1", 5), ("HP2", 5), ("HP3", 4),
     ("LP1", 5), ("LP2", 4), ("LP3", 4), ("LP4", 4), ("LP5", 3)],
    [("BOOK", 2), ("WILD", 1), ("HP1", 6), ("HP2", 5), ("HP3", 4),
     ("LP1", 5), ("LP2", 4), ("LP3", 4), ("LP4", 3), ("LP5", 3)],
]


# 20 paylines (5×3 standard set).
PAYLINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 0, 0],
    [2, 2, 1, 2, 2], [1, 0, 1, 0, 1], [1, 2, 1, 2, 1],
    [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
    [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
    [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0],
    [2, 2, 0, 2, 2], [0, 2, 0, 2, 0],
]


PAYTABLE_LINES = {
    "WILD": {"3": 5,  "4": 25, "5": 200},  # wild pays as top non-BOOK
    "HP1":  {"3": 4,  "4": 20, "5": 150},
    "HP2":  {"3": 3,  "4": 15, "5": 100},
    "HP3":  {"3": 2,  "4": 10, "5": 75},
    "LP1":  {"3": 1.5, "4": 7, "5": 50},
    "LP2":  {"3": 1.2, "4": 5, "5": 40},
    "LP3":  {"3": 1.0, "4": 4, "5": 30},
    "LP4":  {"3": 0.8, "4": 3, "5": 20},
    "LP5":  {"3": 0.6, "4": 2.5, "5": 15},
}


PAYTABLE_SCATTER = {"3": 2, "4": 10, "5": 100}


STICKY_TTL_PMF = {"1": 20, "2": 40, "3": 25, "4": 10, "5": 5}
WALKING_STEPS_PMF = {"1": 15, "2": 30, "3": 30, "4": 15, "5": 10}
WALKING_DIRECTION_PMF = {"left": 50, "right": 50}


SCATTER_TRIGGER = {"3": 10, "4": 15, "5": 20}


def _strip_entries(strip):
    return [{"symbol": s, "weight": w} for s, w in strip]


def build_ir() -> dict:
    reels_base = [_strip_entries(s) for s in REEL_STRIP_BASE]
    return {
        "schema_version": "1.0.0",
        "meta": {
            "id": "template-walking-wild-cleanroom",
            "name": "Sticky + Walking Wild (clean-room template)",
            "family": "lines",
            "vendor": "<<synthetic>>",
            "version": "1.0.0",
            "theme_tags": ["template", "walking-wild", "sticky-wild", "state-machine"],
            "rtp_breakdown_reference": {
                "base_game": 0.61,
                "sticky_walking_bonus": 0.13,
                "free_spins": 0.22,
                "total": 0.96,
            },
            "hit_frequency_reference": 0.30,
            "win_frequency_reference": 0.13,
            "notes": [
                "Synthetic clean-room template. Not lifted from any vendor XLSX.",
                "Sticky Wild = lock-position state machine with TTL.",
                "Walking Wild = lock-position + direction state machine; evaporates at grid edge.",
                "FS feature: every fresh wild becomes Walking Wild left-direction steps_left=4.",
            ],
        },
        "topology": {
            "kind": "lines",
            "reels": 5,
            "rows": 3,
            "paylines": 20,
            "pay_direction": "left_to_right",
        },
        "symbols": SYMBOLS,
        "reels": {
            "base": [{"set": 1, "reels": reels_base}],
            "free_spins": [{"set": 1, "reels": reels_base}],
        },
        "evaluation": {
            "kind": "lines",
            "lines": PAYLINES,
            "min_count": 3,
        },
        "paytable": {
            "line_wins": PAYTABLE_LINES,
            "scatter": PAYTABLE_SCATTER,
        },
        "features": {
            "sticky_wild": {
                "kind": "lock_position_with_ttl",
                "trigger": "wild_lands_on_reel",
                "state_per_cell": ["empty", "freshly_landed", "sticky", "expired"],
                "transitions": {
                    "empty_to_freshly_landed_on": "wild_draw",
                    "freshly_landed_to_sticky_on": "next_spin",
                    "sticky_decay": "ttl-based",
                },
                "ttl_pmf": STICKY_TTL_PMF,
                "rtp_share_reference": 0.07,
            },
            "walking_wild": {
                "kind": "lock_position_plus_direction",
                "trigger": "wild_lands_on_reel",
                "direction_pmf": WALKING_DIRECTION_PMF,
                "steps_pmf": WALKING_STEPS_PMF,
                "edge_behaviour": "evaporate_after_completing_in_progress_chain",
                "respin_bonus_per_walk_step": True,
                "rtp_share_reference": 0.06,
            },
            "free_spins": {
                "trigger_min_scatters": 3,
                "scatter_symbol": "BOOK",
                "award_schedule": SCATTER_TRIGGER,
                "feature": "auto_walking_wild_left_steps_4",
                "rtp_reference": 0.22,
            },
        },
        "industry_first_anchors": [
            "W4.12a — sticky wild state machine",
            "W4.12b — walking wild state machine",
        ],
    }


def main() -> int:
    ir = build_ir()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(ir, sort_keys=True, indent=2))
    rb = ir["meta"]["rtp_breakdown_reference"]
    print(f"Wrote {OUT}")
    print(f"  symbols={len(ir['symbols'])} reels={ir['topology']['reels']} paylines={ir['topology']['paylines']}")
    print(f"  RTP: base={rb['base_game']} bonus={rb['sticky_walking_bonus']} fs={rb['free_spins']} total={rb['total']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
