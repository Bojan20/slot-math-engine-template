# `megaways-clean-room-template` — Variable-Rows Ways Slot Template

Copyright-safe clean-room math template for a **Megaways-style** 6-reel slot
with variable rows per reel (2-7), 117 649 max ways (7⁶), Mystery symbols,
and Cascade tumble. The original Megaways patent (BTG Big Time Gaming
2015) **expired in 2023**; the math primitives in this template are public
domain and shipping with the engine `megaways_eval.rs` evaluator since
W4.8 LANDED.

| Wave | Primitive |
|---|---|
| **W4.8** | Variable rows per reel + 3⁶..7⁶ ways calculator + Mystery symbols |

## Math primitives captured

### 1. Topology
| Field | Value |
|---|---|
| Reels | 6 |
| Rows per reel (min, max) | 2 – 7 |
| Max ways (7 rows × 6 reels) | 117 649 |
| Pay direction | Left-to-right, 3+ matching |

### 2. Reel strip + row sampling
Each spin draws a row-count per reel from `row_count_pmf`:
- 2 rows: weight 5
- 3 rows: weight 15
- 4 rows: weight 25
- 5 rows: weight 25
- 6 rows: weight 18
- 7 rows: weight 12

Then for each reel position, draws a symbol from `reel_strip[i]` (per-reel
weighted strip with BOOK/HP1..HP4/LP1..LP5/MYSTERY symbols).

### 3. Mystery symbol resolution
On grid landing, every `MYSTERY` cell is replaced with a single randomly-
drawn payable symbol from `mystery_symbol_pmf` (each Mystery cell on the
grid resolves to the **same** symbol per spin — Megaways convention).

### 4. Ways evaluator
Per anchor symbol `s`, ways count is `∏_{reel} count_of(s on reel)`. With
Wild substitution (BOOK acts as wild for HP/LP only, not for MYSTERY) the
per-reel counts include both natural + Wild occurrences.

### 5. Cascade / Tumble
Winning symbols are removed, remaining symbols cascade down, new symbols
fill empty cells from `cascade_fill_pmf`. Cascade continues until no new win.

### 6. Free Spins
Trigger: 4+ BOOK scatter symbols on the same spin. Award schedule:
- 4 BOOK → 12 FS
- 5 BOOK → 15 FS
- 6 BOOK → 20 FS

FS feature: **unlimited progressive multiplier** that accumulates per
cascade chain (+1 per cascade step, persists across the entire FS round).

### 7. Reference RTP
| Component | Share |
|---|---|
| Base game (lines + scatter) | 0.60 |
| Free Spins | 0.36 |
| **Total** | **0.96** |

## Copyright posture

| Item | Action |
|---|---|
| Vendor / game / SWID identifiers | None — this is a **synthetic template**, not lifted from any market XLSX |
| Symbol names | Generic ids (`BOOK`, `HP1..HP4`, `LP1..LP5`, `MYSTERY`) |
| Reel weights | Synthesized to hit reference RTP 0.96 across both tracks |
| Megaways trademark | Not used; "variable-rows ways" is the generic descriptor |

The math primitives (variable rows / 7⁶ ways / Mystery resolution /
cascade tumble / unlimited progressive FS multiplier) are public-domain
post the 2023 patent expiry. This template lets the engine show parity
with the family without requiring a vendor PAR.

## Layout

```
games/megaways-clean-room-template/
├── README.md                       # this file
├── scripts/
│   └── lift_to_ir.py               # builds the synthetic IR
└── out/
    └── template-megaways-cleanroom.ir.json
```

Run locally:

```bash
python3 games/megaways-clean-room-template/scripts/lift_to_ir.py
```

Pure stdlib — no network calls, no openpyxl (no XLSX input).
