# `book-expanding-bonusbuy` — Bonus Buy + Expanding Symbol Template

Copyright-safe math template lifted from a real-market released 5×3 / 10-line
Book-style slot. Vendor / game / SWID identifiers are stripped at extract
time; all downstream artifacts use generic symbol ids and a generic game
name. The template captures two industry mechanics:

| Wave | Primitive |
|---|---|
| **W4.11** | Direct-buy Bonus Buy (fair-price model) |
| **W4.15** | Expanding Symbol in Free Spins (Book-style) |

## How the template was produced (local only)

```
games/book-expanding-bonusbuy/
├── raw/
│   ├── PARSheets_source.xlsx          # source PAR (kept locally, never shipped)
│   └── dump/                          # per-sheet TSV + cells.json + formulas.json
├── scripts/
│   ├── dump_excel.py                  # openpyxl dumper, in-process, no network
│   └── lift_to_ir.py                  # builder for copyright-safe IR
└── out/
    └── template-book-bonusbuy.ir.json # the template
```

Run locally:

```bash
python3 games/book-expanding-bonusbuy/scripts/dump_excel.py
python3 games/book-expanding-bonusbuy/scripts/lift_to_ir.py
```

Both scripts use only `openpyxl` + stdlib. **No API calls. No telemetry.**

## Math primitives captured

### 1. Topology + paytable
| Field | Value |
|---|---|
| Reels × Rows | 5 × 3 |
| Paylines | 10 (fixed, 1 coin per line) |
| Symbol roster | BOOK (scatter+wild), HP1..HP4, LP1..LP5 |
| Reel totals | 52 / 51 / 35 / 26 / 25 |
| Top award | 5000× total bet (5-of-a-kind HP1) |

### 2. Expanding Symbol (Free Spins)
| Step | Behaviour |
|---|---|
| Trigger | 3+ BOOK on initial reel window |
| Expansion symbol draw | Weighted, with replacement, from `expansion_symbol_table` |
| Expansion behaviour | Drawn symbol expands to all 3 rows on its reel after each spin pays |
| Expansion cap | 99 |
| Expansion limit by book count | 3→4, 4→6, 5→10 (weighted by initial trigger size) |
| Retrigger | Allowed |
| Reference avg spins | 13.69 |
| Reference avg expansions | 4.40 |
| Reference RTP share | 42.58 % |

### 3. Bonus Buy (Direct Purchase, fair-price)
| Field | Value |
|---|---|
| Cost (multiple of total bet) | **100×** |
| Trigger mechanism | Weighted draw from a dedicated 184-entry **stops table** that always lands 3/4/5 BOOK |
| Reference RTP (BB Base) | 0.0691 |
| Reference RTP (BB Bonus) | 0.8930 |
| Reference RTP (BB Total) | **0.9621** |
| Reference RTP (Normal game) | 0.9620 |
| Fair-price delta (BB − Normal) | **+0.000037** |
| Top award odds (per BB) | 1-in-1013 (vs 1-in-59 299 from natural trigger) |

### 4. RTP tiers (three reference variants)
| Tier id | Normal RTP |
|---|---|
| `tier_001` | 0.9620 |
| `tier_002` | 0.9420 |
| `tier_003` | 0.9251 |

## Copyright posture

| Item | Action |
|---|---|
| Game title / vendor / publisher names | Stripped at extract time (`<<redacted>>` placeholder) |
| SWIDs (200-1696-001..003) | Kept only in `raw/dump/*` for local parity testing — **never** referenced in IR / dossier / pitch |
| Symbol names (Book / Man / Woman / Ring / Key / Ace…Ten) | Replaced with generic ids (`BOOK`, `HP1..HP4`, `LP1..LP5`) |
| Paytable structure + reel weights | **Kept** — those are math primitives, not protectable expression |
| Bonus Buy cost + fair-price delta | **Kept** — published mathematical pattern |

The intent is to use this as a **mechanic reference template** for the engine
test suite and for designer-facing IR-library, not to clone the source game.

## Source PAR

The XLSX in `raw/PARSheets_source.xlsx` is kept locally and is excluded from
public commercial bundles (operator-package ZIP, dossier, pitch deck). It
exists only so a developer can re-run `dump_excel.py` + `lift_to_ir.py` to
regenerate the IR if the schema changes.
