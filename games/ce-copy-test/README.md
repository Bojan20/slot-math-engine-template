# CE COPY TEST — 1:1 paymodel klon Cash Eruption-a

**Status**: Wave 1 LANDED — Excel → IR → Rust engine pipeline.
Sledeći talas kalibriše CE-from-FS payout magnitude.

## Cilj

Verifikovati matematiku Cash Eruption slot-game (L&W; SWIDs `200-1637-001`,
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

## Status verifikacije (PAR-001, 10M spinova, bet mult 1)

| Stavka | Sim | Excel | Diff | Status |
|---|---:|---:|---:|:---:|
| **Hit frequency** | 0.190379 | 0.190306 | +0.04 % | ✅ |
| **Win frequency** | 0.089402 | 0.089361 | +0.05 % | ✅ |
| **Base Game RTP** | 0.418736 | 0.419000 | -0.06 % | ✅ |
| **CE from base RTP** | 0.405089 | 0.409105 | -0.98 % | ✅ |
| **FS line wins RTP** | 0.062839 | ~0.07000 | -10 % | 🟡 |
| **FS Big Volcano RTP** | 0.003193 | (deo FS RTP) | n/a | 🟡 |
| **CE from FS RTP** | **0.427739** | **0.061895** | **+591 %** | ❌ |
| **Free Spins trigger 1 in** | 139.58 | 139.9 | -0.23 % | ✅ |
| **CE-from-base trigger 1 in** | 120.88 | 120.8 | +0.06 % | ✅ |
| **CE-from-FS trigger 1 in** | 530.76 | 468.99 | +13 % | 🟡 |
| **GRAND hits / 10M** | 1 | 1.93 (expected) | n/a | ✅ |

## Šta dalje treba kalibrirati (Wave 2)

1. **CE-from-FS payout magnitude** — sim daje 0.428 (avg 200× per trigger),
   Excel 0.062 (avg 29× per trigger). Razlika 7× → najverovatnije
   pogrešna interpretacija "Big Fireball" coin distribucije (možda CE u FS
   koristi small distribuciju umesto big, ili broji block-occurrences kao
   1 Fireball umesto 3).
2. **CE-from-FS trigger frequency** — sim 1/530.76, Excel 1/468.99 (13 %
   ređe). Treba refine Big Fireball block trigger (možda block = 1 Fireball
   za trigger gate, ne 3).
3. **FS line wins** — sim 0.0628, target ~0.07. Treba doverify Wild
   substitution u linked block i 4/5-of-a-kind detection.
4. **Pokriti svih 21 bet multipliers** — trenutno samo bet mult 1
   sa CE feature; ostali bet multipliers koriste svoje page sa svojim
   coin values.
5. **PAR-002, PAR-003** — full sim sa istim engine-om, samo IR replace.
6. **TS engine mirror sa parity gate** — bit-identical RNG output Rust↔TS.
7. **PAR report renderer** — generišu HTML/PDF sa istim layout-om kao
   Excel, popunjen sa sim values.

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
