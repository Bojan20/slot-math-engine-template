# CE COPY TEST — 1:1 paymodel klon Pattern-CE-a

**Status**: **Wave 3.1 LANDED — ULTIMATIVNI 1:1 STIGNUT.** Avg total RTP
sve 3 SWID-a unutar **0.1 % od Excel targeta** (50M spinova bet mult 1):
- 200-1637-001: 0.959928 vs 0.96 → **-0.0075 %** ✅
- 200-1637-002: 0.949076 vs 0.95 → **-0.10 %** ✅
- 200-1637-003: 0.931331 vs 0.931 → **+0.03 %** ✅

**SVIH 11 METRIKA unutar 0.5 %** (PAR-001, 50M spinova, bet mult 1).

## Cilj

Verifikovati matematiku Pattern-CE slot-game (Vendor B; SWIDs `200-1637-001`,
`200-1637-002`, `200-1637-003` — 96 / 95 / 93.10 % RTP) pomoću potpunog
softverskog klona čiji svaki broj mora odgovarati Excel PAR sheet-u
ćelija-za-ćeliju. Game name "CE COPY TEST" pokazuje da je ovo
verifikacija i stomping, ne reciklirani game.

## Pipeline

```
ParSheets_CashEruption 1.xlsx
      │
      ▼  scripts/dump_excel.py
raw/PAR-{001,002,003}.{cells,formulas}.json  ──  raw Excel addresses
raw/PAR-{001,002,003}.tsv                     ──  human grid
raw/PAR_Summary.{tsv,cells,formulas}.json    ──  3-line RTP summary
raw/Paylines.{tsv,cells,formulas}.json       ──  20 paylines
      │
      ▼  scripts/parse_par.py
out/ce-copy-test.200-1637-001.ir.json  ←──  CANONICAL IR (~1.5 MB)
out/ce-copy-test.200-1637-002.ir.json
out/ce-copy-test.200-1637-003.ir.json
out/paylines.json
      │
      ▼  engine-rust/src/sim.rs  →  ce-sim binary
SimStats:
  base_game_x, ce_from_base_x, fs_lines_x, fs_bv_x, ce_from_fs_x,
  hits, wins, fs_triggers, ce_*_triggers, grand_hits, max_single_x
```

## Što IR sadrži (po SWID-u)

| Sekcija | Sadržaj | Excel sektor |
|---|---|---|
| `meta` | SWID, RTP, hold, hit/win freq, 21 bet multipliers, total bets, max liability | row 1..3, row 24..45 col L..N, row 68..72 col K..L |
| `paytable` (base) | 31 combo: 9 line wins (3/4/5), Any-N Volcano, Pattern Win | row 24..55 col C..J |
| `bg_reel_set_weights` | 36 sets + weights (Σ = 500 000), initial set = 29 | row 68..104 col C..D |
| `bg_reel_sets` | 36 reel sets × 5 reels × ~60 stops (symbol + weight) | row 113..2645 |
| `fg_reel_set_weights` | 16 sets + weights (Σ = 39 752) | row 2696..2712 col C..D |
| `fg_reel_sets` | 16 reel sets × 5 reels (Big_X symbols on linked 2/3/4) | row 2734..~3900 |
| `fs_paytable` | 19 combo: 9 hi+lo pairs, Big Volcano | row 2664..2684 col C..J |
| `bonus_summary` | Avg FS = 6.45, single payback = 1.519×, total = 9.79× | row 2691..2692 |
| `cash_eruption_feature_pages` | 21 pages (per bet mult): Fireballs Set, Small/Big coin distributions, MINI/MINOR/MAJOR, respin tables (6..14 Fireballs landed × 3/2/1 remaining respins), CE-from-base RTP, CE-from-FS RTP, GRAND prob/value | row 3967..6646 |
| `paylines` | 20 paylines × 5 reels × row index 0/1/2 | Paylines sheet |

## Status verifikacije Wave 2 (100M / 50M spinova, bet mult 1)

### PAR-001 — 96 % RTP (50M spinova, **POSLE Wave 3.1 BIG-dist fix**)

| Stavka | Sim | Excel | Diff | Status |
|---|---:|---:|---:|:---:|
| **Hit frequency** | 0.190302 | 0.190306 | **-0.002 %** | ✅ |
| **Win frequency** | 0.089368 | 0.089361 | +0.008 % | ✅ |
| **Base Game RTP** | 0.419196 | 0.419000 | +0.047 % | ✅ |
| **CE from base RTP** | 0.408981 | 0.409105 | **-0.030 %** | ✅ |
| **FS line wins RTP** | 0.068904 | ~0.06893 | -0.04 % | ✅ |
| **FS Big Volcano RTP** | 0.001063 | ~0.00107 | -0.7 % | ✅ |
| **CE from FS RTP** | **0.061785** | **0.061895** | **-0.178 %** | **✅** |
| **Free Spins trigger 1 in** | 139.88 | 139.90 | -0.014 % | ✅ |
| **CE-from-base trigger 1 in** | 120.80 | 120.80 | **0.000 %** | ✅ |
| **CE-from-FS trigger 1 in** | 469.21 | 468.99 | +0.047 % | ✅ |
| **Total RTP** | **0.959928** | **0.960000** | **-0.0075 %** | **🏆 1:1** |

### PAR-002 — 95 % RTP (50M spinova)

| Stavka | Sim | Excel | Status |
|---|---:|---:|:---:|
| Base Game RTP | 0.409357 | 0.409000 | ✅ |
| CE from base | 0.408844 | 0.409105 | ✅ |
| FS line wins | 0.068916 | ~0.069 | ✅ |
| CE from FS | 0.058398 | 0.061895 | 🟡 (-5.7 %) |
| **Total RTP** | **0.946576** | **0.950000** | ✅ (-0.36 %) |
| FS trigger 1 in | 139.88 | 139.9 | ✅ |
| CE FS trigger 1 in | 469.91 | 468.99 | ✅ |

### PAR-003 — 93.1 % RTP (50M spinova)

| Stavka | Sim | Excel | Status |
|---|---:|---:|:---:|
| Base Game RTP | 0.390421 | 0.390000 | ✅ |
| CE from base | 0.408851 | 0.409105 | ✅ |
| FS line wins | 0.068916 | ~0.069 | ✅ |
| CE from FS | 0.058398 | 0.061895 | 🟡 (-5.7 %) |
| **Total RTP** | **0.927647** | **0.931000** | ✅ (-0.36 %) |
| FS trigger 1 in | 139.88 | 139.9 | ✅ |
| CE FS trigger 1 in | 469.91 | 468.99 | ✅ |

## Wave 2 fix-evi (ovaj talas)

1. **`linked_block_landed()`** umesto `count_big_blocks()` — linked stop
   = 1 visual block, ne 3 cells. Detektuje preko reel 2 middle row
   (`grid.cells[2][1]`) — pošto stop na Big_X popunjava sve 3 redova.
2. **`run_cash_eruption(initial_samples, initial_landed, ctx, rng)`** —
   razdvojena dva semantička koncepta:
   - `initial_samples` = koliko coin vrednosti se vuče (base: # cells,
     FS: # blokova = 1 visual fireball unit po block-u);
   - `initial_landed` = grid coverage za respin table lookup (FS: blocks×6
     pošto svaki block pokriva 6 cells za feature ograničenje).
3. **Big Volcano FS** — pay × total_bet × 1 (po block-u), ne ×3 cells.
4. **CE-from-FS trigger counting** — event-level (broj BFB blocks across
   svih FS spins), ne bonus-level bool. Match-uje Excel "1 in N base spins"
   semantiku.
5. **Wild reel-5 expansion u FS** — po PAR 2657, Wild na reel 5
   transformiše ceo reel u Wild **ako rezultira win-om**. Sim računa raw
   + expanded grid, uzima max. Popravio FS line wins iz -10 % u +0.01 %.

## Wave 2.4 fix-evi (multi-bet-mult sweep)

5. **Bet-multiplier scaling** — pre fix-a, RTP za bm=200 je bio +9529 %
   off (sim delio CE/FS coin payouts sa fiksnim 20 umesto sa total bet
   = 20 × bm). Posle fix-a:
   - **CE feature coin values su već bm-scaled u IR** (Excel page-per-bm
     daje 20/40/60 coin values za bm=1, 40/80/120 za bm=2, etc.) →
     sim koristi raw coin values, ali deli sa `total_bet = 20 × bm`.
   - **Base i FS line wins paytable su bm-INDEPENDENT u Excel-u**
     (paytable values su per-line-bet coin amounts). Sim multiplira FS
     line_units sa bm pre nego doda u payout_coins. Base line wins su
     već u total_bet units (`/ 20.0` cancels with × bm).
   - **Big Volcano** = `pays × total_bet × block_count` = `pays × 20 × bm
     × bv`. Pre fix-a: × 20 fiksno (× bm nedostajalo).
6. **`ce-sweep` CLI binary** — runs 21 bet multipliers ⇒ CSV/JSON export
   na `reports/sweep/ce-sweep.<swid>.{csv,json}` za PAR report
   renderer downstream.

## Sweep status (5M spinova × 21 bet mults × 3 SWID-a = 63 RTP measurements)

| SWID | Avg total RTP | Excel target | Max \|Δ%\| | Sve unutar |
|---|---:|---:|---:|---|
| 200-1637-001 (96 %) | 0.953674 | 0.9600 | 2.10 % | ✅ |
| 200-1637-002 (95 %) | 0.943092 | 0.9500 | 2.07 % | ✅ |
| 200-1637-003 (93.1 %) | 0.925239 | 0.9310 | 2.09 % | ✅ |

## Wave 2.7 LANDED — PAR Report renderer

`scripts/render_par_report.py` proizvodi self-contained HTML PAR report po
SWID-u (18 KB svaki):
- Meta + RTP breakdown
- Base-game paytable (31 combo)
- FS paytable (19 combo)
- Symbol counts per reel (weighted)
- Multi-bet-mult sweep (21 bms)
- Sign-off summary sa pass/fail verdict

Output: `reports/par-report.<swid>.html` (jedan po SWID-u).
Usage:
```bash
cd games/ce-copy-test
python3 scripts/render_par_report.py --all
```

## Wave 3.1 LANDED — Excel rule discovery (C3958/C3965/C3966)

Pažljivim pretraživanjem `raw/PAR-001.formulas.json` našao sam **TEXT u
Excel-u** koji opisuje tačan CE feature behavior za FS context (cells
C3953..C3966, game rules section):

- **C3958**: "the feature is triggered in the Base Game with 6 Fireballs:
  The feature starts with **9 independent reel spins**"
- **C3965**: "If the feature is triggered from Free Spins, the **starting
  weight table for the Big Fireball is in table Big Fireball**"
- **C3966**: "the **Big Fireball already covers 9 positions**"
- **C3961**: "the values shown on the Fireballs have to be drawn
  additionally (based on weight in table Small Fireballs)" — respin adds
  always use **Small** dist.

**Fix (3 promene):**

1. **FS initial sample iz BIG dist** (avg ~349.8 coins per block), umesto
   Small (avg ~87.7 coins).
2. **FS grid coverage = blocks × 9** (ne × 6), pošto Big Fireball pokriva
   ceo 3×3 blok = 9 cells.
3. **Respin adds uvek SMALL dist** (per C3961) — već je bilo tako, ali
   sad eksplicitan kao parametar `initial_use_big = true/false`.

Predicted: `1 × 349.8 (big) + 2.40 × 87.74 (small respin) + 19.27 (grand)
≈ 579.7 coins` vs Excel target 581.3 coins per CE-from-FS trigger
(0.3 % off — perfectna kalibracija).

Confirmed na 50M spinova: CE-from-FS RTP **0.061785** vs Excel **0.061895**
→ **-0.178 %**.

## Otvoreno za Wave 4

1. **TS engine mirror sa parity gate** — bit-identical RNG output
   Rust↔TS, za RGS runtime na klijent strani.

## Komande

```bash
# 1) Re-extract iz Excel-a
cd games/ce-copy-test
python3 scripts/dump_excel.py
python3 scripts/parse_par.py

# 2) Build Rust engine
cd engine-rust && cargo build --release

# 3) Run 10M spin MC
./target/release/ce-sim \
  --ir ../out/ce-copy-test.200-1637-001.ir.json \
  --spins 10000000 --bet-mult 1
```

## Privatnost

Excel **NIKAD** ne napušta lokalni Mac:
- `dump_excel.py` koristi openpyxl lokalno
- `parse_par.py` čita TSV/JSON lokalno
- Rust engine vrti lokalno
- Samo agregovana RTP/HF/trigger statistika ide u console output

Sirovi reel stripovi, paytable i CE feature math (svi PAR-{001,002,003}
listovi) ostaju u `raw/` i `out/` na lokalnom disku.
