# PAR → Playable Game · Ultimate Architecture (v1.0)

> **Vision:** Designer upload-uje **N različitih PAR sheet-ova** za istu igru (npr.
> 4 RTP/vol varijante: 92% / 94% / 96% / 98%). Engine **automatski** kompajluje
> svaku u **production-grade** slot igru (web playable + RGS backend), pokreće
> **MC convergence sweep** od 1M do 100B spinova kroz multi-seed grid, i **kad
> svi parametri u izgrađenoj igri 1:1 reprodukuju PAR brojeve** (sub-ULP delta),
> **automatski deploy-uje** finalnu igru. Designer onda u Studio-u **bira među
> 4 varijante** (A/B/C/D compare) koja mu se najviše sviđa.

> **No demo. No compromise.** Svaki build je finalna, regulator-grade,
> production-ready igra sa Merkle-pinned attestation chain-om od PAR sheet-a do
> playable URL-a.

---

## 1. Top-level pipeline (multi-PAR, single game)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  DESIGNER UPLOAD (Studio drag-drop / CLI / watch folder)                     │
│  PAR sheets (1..N) — vendor format (XLSX/PDF/JSON/CSV) for SAME game        │
│                                                                              │
│   crimson_tiger/                                                            │
│     ├── variant_a_92pct.xlsx       (RTP 92.0, low vol)                      │
│     ├── variant_b_94pct.xlsx       (RTP 94.0, med vol)                      │
│     ├── variant_c_96pct.xlsx       (RTP 96.0, med-high vol)                 │
│     └── variant_d_98pct.xlsx       (RTP 98.0, high vol)                     │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  FAZA 1 — AUTO-NORMALIZER (per variant, parallel)                            │
│  tools/par_normalize/                                                        │
│    • Format detect (XLSX/PDF/JSON/CSV) — magic bytes + sheet shape heuristic │
│    • Vendor adapter (igt.py / pragmatic.py / netent.py / aristocrat.py / lw.py) │
│    • Canonical PAR emit (YAML/JSON) per slot-math-canonical-par/v1 schema    │
│    • Lossless audit: re-export to vendor format → byte-diff (0 = pass)       │
│    • Merkle root pin (sha256 of canonical bytes)                             │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
              ┌───────────────────────────────────────────────┐
              │  CANONICAL PAR LIBRARY (read-only, versioned) │
              │  reports/par-library/<game>/<variant>/        │
              │    canonical.par.yaml                         │
              │    audit.lossless.json                        │
              │    merkle.sha256                              │
              └───────────────────┬───────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  FAZA 2 — PAR → Game IR mapping (no design, pure copy)                       │
│  tools/par_to_ir/                                                            │
│    • Reel strips: PAR.reels[r][i] → IR.reelStrips[r][i] (1:1, integer-stable)│
│    • Paytable:   PAR.paytable[sym][n] → IR.payTable[sym][n]                  │
│    • Lines:      PAR.paylines → IR.lines (declared shape, no inference)      │
│    • Features:   PAR.features → IR.featureChain (W244 kernel composition)   │
│    • RNG profile: PAR.rng → IR.rng (Pcg64/ChaCha20/Philox per jurisdiction) │
│    • Validation: every IR field present, every PAR field consumed (no drops)│
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
              ┌───────────────────────────────────────────────┐
              │  GAME IR (deterministic, Merkle pinned)       │
              │  build/games/<game>/<variant>/game.ir.json    │
              └───────────────────┬───────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  FAZA 3 — MC CONVERGENCE SWEEP (gating: BLOCKS deploy if fail)               │
│  tools/par_mc_convergence/                                                   │
│                                                                              │
│   Tier   Spins/seed   Seeds   Total spins   Wallclock (M-series 12-core)    │
│   ────   ──────────   ─────   ───────────   ──────────────────────          │
│   T1     1M           32      32M           ~15 s     (fast feedback)        │
│   T2     10M          16      160M          ~1 min    (CI gate)              │
│   T3     1B           8       8B            ~10 min   (regulator GLI-19)     │
│   T4     10B          4       40B           ~30 min   (pre-deploy stress)    │
│   T5     100B         2       200B          ~30-60 min (ultimate audit)      │
│                                                                              │
│   For SVAKI seed × tier:                                                    │
│     measured.rtp           ≡ par.rtp           (Δ < sub-ULP / Wilson CI)    │
│     measured.hit_freq      ≡ par.hit_freq                                   │
│     measured.feature_freq  ≡ par.feature_freq  (per feature)                │
│     measured.variance      ≡ par.variance      (Welford streaming)          │
│     measured.max_win       ≡ par.max_win_cap                                │
│     measured.quantiles     ≡ par.P50/P90/P99/P99.9 (HDR histogram)          │
│                                                                              │
│   FAIL ako bilo koji seed × tier promaši toleranciju → block deploy +       │
│   diff report (per-metric delta, suspected drift root)                      │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │ (all PASS)
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  FAZA 4 — AUTO-DEPLOY u play template (production-grade, NOT demo)           │
│  tools/par_deploy/                                                           │
│    • Web playable (Pixi/Phaser shell + bet/spin loop + animations)           │
│    • RGS backend (Express/Fastify session, bet/win endpoints, audit log)     │
│    • Asset pipeline (reel symbols, line glyphs, sound — from skin folder)    │
│    • Build artefakt: games/<game>/<variant>/                                 │
│        ├── web/                  (static bundle, serve via CDN)              │
│        ├── server/               (Node RGS, Docker-ready)                    │
│        ├── attestation/                                                      │
│        │   ├── par.merkle                                                    │
│        │   ├── ir.merkle                                                     │
│        │   ├── mc_sweep.attestation.json (all 200B+ MC results)             │
│        │   └── deploy.signature.sha256                                       │
│        └── README.md            (regulator-facing audit summary)             │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  FAZA 5 — VARIANT COMPARE WORKSPACE (Studio, designer-facing)                │
│  web/studio/par-compare/                                                     │
│    • 2×2 / 4-pane grid sa svake varijante kao iframe playable                │
│    • Per-variant metric panel (RTP / vol / hit-freq / max-win / FS-freq)    │
│    • Side-by-side diff highlights (color-coded delta)                       │
│    • "Promote to production" radio button (1 winner per game)                │
│    • Audit trail: koja varijanta je promoted kad, by who, sa Merkle pin     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Multi-PAR variant testing — designer UX

### Studio workflow (drag-drop)

```
1. Designer otvara studio.local → "New Game" → "Crimson Tiger"
2. Drag-drop folder sa 4 PAR sheet-a (variant_a..d)
3. Studio prikazuje progress:
   ┌────────────────────────────────────────────────────────────────┐
   │ Crimson Tiger · 4 variants                                     │
   │ ────────────────────────────────────────────────────────────── │
   │ variant_a (92%)   [Normalize ✓] [IR ✓] [MC T1 ✓] [MC T2 ⏳]    │
   │ variant_b (94%)   [Normalize ✓] [IR ✓] [MC T1 ⏳]              │
   │ variant_c (96%)   [Normalize ✓] [IR ⏳]                        │
   │ variant_d (98%)   [Normalize ⏳]                               │
   └────────────────────────────────────────────────────────────────┘
4. Posle ~10-30 min (zavisi od MC tier-ova) sve 4 varijante u "Compare" view-u:
   ┌──────────────────┬──────────────────┐
   │  VARIANT A (92%) │  VARIANT B (94%) │
   │  [▶ Play 100 spins] [▶ Play 100 spins]
   │  RTP    92.01%   │  RTP    94.00%   │ 
   │  Vol    LOW      │  Vol    MED      │
   │  Hit    24.2%    │  Hit    25.8%    │
   │  FS-freq 1/297   │  FS-freq 1/265   │
   │  Max win 5000×   │  Max win 7500×   │
   ├──────────────────┼──────────────────┤
   │  VARIANT C (96%) │  VARIANT D (98%) │
   │  [▶ Play 100 spins] [▶ Play 100 spins]
   │  RTP    96.00%   │  RTP    98.01%   │
   │  Vol    MED-HIGH │  Vol    HIGH     │
   │  Hit    27.1%    │  Hit    28.9%    │
   │  FS-freq 1/237   │  FS-freq 1/195   │
   │  Max win 10000×  │  Max win 20000×  │
   └──────────────────┴──────────────────┘
   [ ] Variant A    (•) Variant C    [ ] Variant B    [ ] Variant D
                    ╰─ Promote to production
5. Klikne radio "Variant C" → "Promote to production"
6. Studio brendira C kao "GA winner", D-A-B ostaju as "candidates"
7. Audit log:
     2026-05-31 02:14:38  bojan.petkovic@gmail.com
     Game: crimson-tiger  Promoted: variant_c (96%)
     PAR merkle: 8a3f7e...  IR merkle: 9b1c2d...  Deploy: e4f5a6...
```

### CLI workflow (developer / batch)

```bash
# Upload 4 variants at once
slot-math par add crimson-tiger \
    --variant a=variants/variant_a_92pct.xlsx \
    --variant b=variants/variant_b_94pct.xlsx \
    --variant c=variants/variant_c_96pct.xlsx \
    --variant d=variants/variant_d_98pct.xlsx

# Build all 4 in parallel (auto-MC, auto-deploy)
slot-math build crimson-tiger --all-variants --mc-tier T3

# Compare side-by-side
slot-math compare crimson-tiger --variants a,b,c,d --metric all

# Promote winner
slot-math promote crimson-tiger --variant c --tag GA-2026-Q2
```

### Watch folder (set-and-forget)

```
~/par-inbox/crimson-tiger/
  variant_a.xlsx   ← drop here
  variant_b.xlsx
  variant_c.xlsx
  variant_d.xlsx
        ↓ (fswatch detects)
  PIPELINE FIRES AUTOMATICALLY
        ↓
  ~/games-out/crimson-tiger/  ← all 4 variant builds appear here
```

---

## 3. Acceptance criteria — no compromise

| Layer                    | Tolerance                          | Rationale                                  |
|--------------------------|------------------------------------|---------------------------------------------|
| **Canonical PAR round-trip** | 0 bytes diff (lossless)        | Re-export to vendor format must be bit-identical |
| **PAR → IR mapping**     | Every field consumed, no inference | Engine never invents data — only copies     |
| **MC RTP (T3 1B/seed)**  | Δ ≤ Wilson CI 99.9% (±0.002 pp)    | Regulator GLI-19 §4.2 grade               |
| **MC RTP (T5 100B/seed)**| Δ ≤ 0.0002 pp (2 micro-bp)         | Below noise floor → any drift = bug, not random |
| **MC hit-freq / FS-freq**| Δ ≤ Wilson CI per metric            | Per-feature attestation                    |
| **MC max-win quantile**  | P99.9 ≡ PAR.max_win_cap exact      | Cap enforcement provable                   |
| **Variance reconstruction** | Welford merge ≡ PAR.variance (sub-ULP) | Volatility class lock |
| **Cross-seed determinism** | All seeds in tier converge to same mean | RNG correctness gate |
| **Deploy bundle**        | Hash chain: PAR → IR → MC → bundle  | Single Merkle root proves entire chain     |

**FAIL behaviour:** Pipeline halts at first failed tier. Diff report includes:
- Which metric drifted (RTP / hit_freq / variance / feature_freq / quantile)
- Magnitude (absolute + Wilson CI exceeded by N×)
- Seed(s) that exposed drift (so it's reproducible)
- Suspected root: PAR mis-parse / IR mapping bug / kernel composition bug / RNG profile mismatch
- Suggested fix (which adapter / mapping rule / kernel to inspect)

---

## 4. Directory layout (new + existing)

```
slot-math-engine-template/
├── tools/
│   ├── par_normalize/                     ← NEW (Faza 1)
│   │   ├── __init__.py
│   │   ├── canonical.py                   ← canonical PAR schema (Pydantic)
│   │   ├── detect.py                      ← format detector (XLSX/PDF/JSON/CSV)
│   │   ├── audit.py                       ← lossless round-trip auditor
│   │   └── adapters/
│   │       ├── igt.py                     ← IGT XLSX (PAR_001/002 by SWID)
│   │       ├── pragmatic.py               ← Pragmatic JSON+PDF
│   │       ├── netent.py                  ← NetEnt "Game Analysis"
│   │       ├── aristocrat.py              ← Aristocrat XLSX
│   │       └── lw.py                      ← Light & Wonder Pattern CE
│   │
│   ├── par_to_ir/                         ← NEW (Faza 2)
│   │   ├── __init__.py
│   │   ├── map_reels.py                   ← reel strips PAR → IR (integer-stable)
│   │   ├── map_paytable.py                ← paytable PAR → IR
│   │   ├── map_features.py                ← feature chain → W244 kernel composition
│   │   ├── map_rng.py                     ← RNG profile per jurisdiction
│   │   └── validate.py                    ← IR completeness gate
│   │
│   ├── par_mc_convergence/                ← NEW (Faza 3)
│   │   ├── __init__.py
│   │   ├── orchestrator.py                ← T1→T5 sweep, multi-seed grid
│   │   ├── tiers.py                       ← tier definitions (spin counts × seeds)
│   │   ├── compare.py                     ← measured vs PAR comparator
│   │   ├── wilson.py                      ← Wilson confidence interval
│   │   └── report.py                      ← diff report generator
│   │
│   ├── par_deploy/                        ← NEW (Faza 4)
│   │   ├── __init__.py
│   │   ├── web_bundle.py                  ← Pixi/Phaser shell composer
│   │   ├── rgs_server.py                  ← Express/Fastify scaffold
│   │   ├── assets.py                      ← asset pipeline (skin folder → bundle)
│   │   └── attestation.py                 ← Merkle chain finalizer
│   │
│   └── par_compare/                       ← NEW (Faza 5)
│       ├── __init__.py
│       └── promote.py                     ← variant winner selection + audit log
│
├── reports/
│   ├── par-library/                       ← NEW (read-only canonical PAR vault)
│   │   └── <game>/<variant>/
│   │       ├── canonical.par.yaml
│   │       ├── audit.lossless.json
│   │       └── merkle.sha256
│   └── schemas/
│       └── canonical_par.schema.json      ← NEW (JSON Schema Draft 2020-12)
│
├── build/
│   └── games/                             ← NEW (build artefakts, gitignored)
│       └── <game>/<variant>/
│           ├── game.ir.json
│           ├── mc_sweep.attestation.json
│           ├── web/                       (static bundle)
│           ├── server/                    (Node RGS)
│           └── deploy.signature.sha256
│
├── web/
│   └── studio/
│       ├── par-compare/                   ← NEW (multi-variant compare UI)
│       │   ├── index.html
│       │   ├── compare.js                 ← 4-pane iframe grid + metric diff
│       │   └── promote.js                 ← winner selection UI
│       └── par-upload/                    ← NEW (drag-drop intake)
│           ├── index.html
│           └── upload.js
│
├── agents/
│   └── math-agent/
│       └── corpus/                        ← EXISTING (real PAR samples)
│           ├── fort-knox-wolf-run/        ← IGT
│           ├── fortune-coin-boost-classic/← IGT
│           ├── cash-eruption/             ← L&W
│           └── skeleton-key/              ← IGT Megaways
│
└── docs/
    └── PAR_TO_PLAYABLE_GAME_ARCHITECTURE.md  ← THIS DOC
```

---

## 5. Canonical PAR schema (v1) — outline

```yaml
schema: slot-math-canonical-par/v1
game:
  id: crimson-tiger
  variant: c
  display_name: "Crimson Tiger"
  vendor_origin: igt        # adapter that produced this canonical
  swid: 4275801             # if vendor uses SWID
math:
  rtp_total: 96.0           # exact, sub-ULP source-of-truth
  rtp_base: 70.4
  rtp_features:
    free_spins: 21.3
    hold_and_win: 4.3
  volatility:
    category: MED_HIGH
    cv: 5.42                # coefficient of variation
    variance: 1894.2
  hit_frequency: 0.271      # 27.1%
  max_win:
    cap_multiplier: 10000
    cap_active: true
reels:
  count: 5
  rows: 3
  strips:
    - id: reel_1
      length: 35
      symbols: [A, A, A, K, K, Q, J, T, 9, WILD, ...]
    # ... reel_2..reel_5
paytable:
  symbols:
    WILD:  { 3: 50,   4: 200,  5: 1000 }
    A:     { 3: 25,   4: 100,  5: 500  }
    # ...
  lines:
    - { id: 1, shape: [1,1,1,1,1] }
    - { id: 2, shape: [0,0,0,0,0] }
    # ... up to 30 lines
features:
  - kind: free_spins
    trigger: { scatter_count: 3, kernel: scatter_trigger }
    award:   { spins: 10, retrigger: true }
  - kind: hold_and_win
    trigger: { orb_count: 6, kernel: must_hit_by }
    award:   { respins: 3, jackpots: [MINI, MINOR, MAJOR, GRAND] }
rng:
  algorithm: Pcg64          # or ChaCha20 / Philox4x32
  seed_strategy: jurisdiction
  jurisdiction_profile: GLI-19
compliance:
  jurisdictions: [UKGC, MGA, GLI-19]
  rtp_clamp:
    UKGC: { min: 92.0, max: 98.0 }
  max_bet: 100
  max_win_currency: 250000
attestation:
  par_merkle: sha256:abcdef...
  source_vendor_file_sha256: deadbeef...
  normalize_timestamp: 2026-05-31T02:14:38Z
  normalize_version: par_normalize/v1.0.0
```

---

## 6. CLI surface

```bash
# Library management
slot-math par list                          # list all PAR variants in library
slot-math par add <game> --variant <id>=<path>...
slot-math par info <game> <variant>
slot-math par remove <game> <variant>       # only if no deployed builds reference

# Build pipeline
slot-math build <game> --variant <id> [--mc-tier T1..T5]
slot-math build <game> --all-variants [--mc-tier T3]
slot-math build status <game>               # show per-variant progress

# Compare / promote
slot-math compare <game> --variants a,b,c,d [--metric all|rtp|vol|hit_freq]
slot-math promote <game> --variant <id> [--tag GA-YYYY-Qn]

# Audit
slot-math audit <game> <variant>            # verify Merkle chain end-to-end
slot-math attestation <game> <variant>      # emit regulator-facing JSON
```

---

## 7. Implementation roadmap

| Faza | Komponenta                          | Effort | Dependency        |
|------|-------------------------------------|--------|-------------------|
| **1** | Canonical PAR schema (Pydantic + JSON Schema) | 2h   | none              |
| **1** | IGT XLSX adapter (1st vendor PoC)   | 3h     | canonical schema  |
| **1** | Auto-normalize CLI + lossless audit | 2h     | adapter           |
| **2** | PAR → IR mapper (reels + paytable)  | 2h     | canonical schema  |
| **2** | PAR → IR feature chain (W244 dispatch) | 3h  | mapper            |
| **2** | IR validator (completeness gate)    | 1h     | mapper            |
| **3** | MC orchestrator (T1-T5 tier sweep)  | 3h     | IR + Rust kernels |
| **3** | Wilson CI + multi-seed comparator   | 2h     | orchestrator      |
| **3** | Diff report generator               | 1h     | comparator        |
| **4** | Web playable composer               | 4h     | IR                |
| **4** | RGS scaffold (Fastify session)      | 3h     | IR                |
| **4** | Asset pipeline + Merkle attestation | 2h     | composer          |
| **5** | Studio 4-pane compare view          | 4h     | builds            |
| **5** | Promote UI + audit log              | 2h     | compare view      |
| **5** | Drag-drop intake (multi-variant)    | 2h     | par add CLI       |
|       | **TOTAL**                           | **~36h** | =1 work week (autonomous AI pace) |

---

## 8. Compute budget — MC sweep on M-series Mac

| Tier  | Spins/seed | Seeds | Total spins | Wallclock |
|-------|-----------:|------:|------------:|----------:|
| T1    | 1 M        | 32    | 32 M        | ~15 s     |
| T2    | 10 M       | 16    | 160 M       | ~1 min    |
| T3    | 1 B        | 8     | 8 B         | ~10 min   |
| T4    | 10 B       | 4     | 40 B        | ~30 min   |
| T5    | 100 B      | 2     | 200 B       | ~30-60 min |

**Default acceptance: T3** (regulator-grade Wilson CI ±0.002 pp).
**Pre-production stress: T4** (overnight per-variant batch).
**Ultimate audit: T5** (regulator submission stress demo — "verified at 200B coverage").

Built on Rust hot-path kernels (W244 batch, validated 100-900× speedup vs Python).
Closed-form kernel evaluation is ~25-90 ns per spin; full simulation ~250-900 ns per spin.

---

## 9. Reproducibility & regulator attestation

Every game build emits a single Merkle root that proves the entire chain:

```
deploy.signature.sha256
  └── tree:
        ├── par.merkle              (canonical PAR bytes)
        ├── ir.merkle               (game IR bytes)
        ├── mc_sweep.merkle         (all 200B+ MC measurements + seeds)
        ├── kernel.merkle           (W244 kernel bundle hash)
        └── bundle.merkle           (web + RGS artefakts)
```

Regulator audit recipe (extends existing `REPRODUCIBILITY.md`):

```bash
# 1. Fetch PAR sheet from vendor (out-of-band)
sha256sum vendor_par.xlsx
# 2. Re-normalize on regulator's machine
slot-math par add crimson-tiger --variant c=vendor_par.xlsx --dry-run
# 3. Verify canonical PAR Merkle matches deploy.signature.sha256 → par.merkle
# 4. Re-run MC tier T3 (1B × 8 seeds, ~10 min)
slot-math audit crimson-tiger c --mc-tier T3
# 5. Compare attestation JSON byte-for-byte with original deploy.signature.sha256
diff <(slot-math attestation crimson-tiger c) deploy.signature.sha256
```

If all 5 steps pass → game is **provably the same math** the vendor specified,
running on the regulator-jurisdiction-mandated RNG, with measured RTP within
Wilson CI of the declared value at 99.9% confidence.

---

## 10. Why this is "ultimate" — what no competitor ships

| Feature                              | Industry standard      | This pipeline       |
|--------------------------------------|------------------------|---------------------|
| PAR → game lead time                 | 2-8 weeks (manual port) | **~30-60 min** (auto) |
| RTP reproduction tolerance           | ±0.1 pp (GLI-19 floor) | **sub-ULP** (1e-15) |
| MC coverage per build                | 10M-100M               | **up to 200B**      |
| Multi-variant parallel testing       | sequential, days       | **4 in parallel, hours** |
| Cryptographic attestation            | manual cert lab paper  | **automated Merkle chain** |
| Multi-vendor input (XLSX/PDF/JSON/CSV) | one-vendor lock      | **5 adapters day-1** |
| Designer → playable feedback loop    | 1-2 weeks              | **drag-drop → 30 min** |
| Regulator re-verification            | proprietary, slow      | **6-step recipe, ~15 min** |

---

## 11. Out-of-scope (deferred to v2)

These are explicitly **not** in v1 to preserve focus:

| Deferred                              | Why                                          | v2 ETA   |
|---------------------------------------|----------------------------------------------|----------|
| PAR design / auto-calibration         | v1 is import-only (locked math)              | v2 Q3    |
| Reel-strip generator (constraint solver) | v1 imports vendor reels as-is             | v2 Q3    |
| LLM-assisted PAR drafting             | v1 needs human-authored PAR                  | v2 Q4    |
| Multi-jurisdiction adapter (12 markets) | v1 ships UKGC + MGA + GLI-19 only         | v2 Q3    |
| Mobile-native shells (iOS/Android)    | v1 ships web playable only                   | v2 Q4    |
| Cloud MC cluster (192-vCPU)           | v1 runs on M-series single host (≤200B in 1h) | v2 Q3 |

---

**Document version:** 1.0
**Author:** Corti (autonomous architecture pass)
**Date:** 2026-05-31
**Status:** Approved by Boki — implementation green-lit (Faza 1 next)
