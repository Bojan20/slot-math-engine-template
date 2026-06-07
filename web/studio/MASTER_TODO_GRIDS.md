# MASTER TODO — Studio per-grid ULTIMATE roadmap

> Living single-source-of-truth za sve što fali da **studio gridovi budu savršeni** — 280/280 ultimate-QA + production-grade across UX / a11y / performance / coverage / reliability dimensions.
>
> **Track**: cortex-eyes-grid-coverage matrix + sve sledeće dimenzije koje će se nasloniti na isti runner.
>
> **Owner**: Boki (vizija) + Corti (puna autonomija per `CLAUDE.md` core pravilo).
>
> **Created**: 2026-06-08 (post-Wave H3, post-`cba1bbcc` first audit ship).
>
> **Last updated**: 2026-06-08 · **HEAD**: `ad56ed0` (slot-gdd-factory) / `cba1bbcc` (slot-math-engine-template/web/studio).
>
> **Most recent ship**: `cba1bbcc` — cortex-eyes per-grid UX + technical audit (257/280 PASS · 91.8%).

---

## 📊 Project status snapshot

| Metric | Value |
|---|---|
| **Audit runner** | `tools/cortex-eyes-grid-coverage.mjs` — Playwright headless, vite-served, 14 asserts × N fixtures × 2 viewports |
| **Current pass rate** | **257/280 (91.8%)** — 23 known fail |
| **Pilot fixtures** | 5 canonical IR (Wrath / QHP / Spartacus / Rainbow / Huff) |
| **GDD-narrative fixtures** | 5 samples (huff-puff.md / dragon-spin / mega-cascade / minimal-hnw / cluster-cosmic) |
| **Viewports tested** | 2 (Desktop 1440×900, iPhone SE 375×667) |
| **A11y bar reached** | WCAG 2.5.5 tap-target ≥44×44 + touch-action: manipulation |
| **A11y bar NOT yet** | Color contrast · Keyboard · Screen-reader · Reduced-motion · RTL · High-DPI |
| **Cross-browser** | chromium only (firefox / webkit pending) |
| **Snapshot regression** | screenshot-ovi se snimaju, NE porede (pending pixel-diff baseline) |
| **CI hook** | manual `npm run` only — no pre-push gate |

---

## 🔍 23 known fail — breakdown (iz `reports/cortex-eyes-grid-coverage.md`)

| Cluster | Fail count | Root cause |
|---|:--:|---|
| **GDD-narrative path** — 5 samples × 2 vp × 2 asserts | **20** | `#play-grid renders > 0 cells` returns 0 — `parseGDD → gddToIR` pipeline ne seed-uje workspace pool kad je GDD narrative (sandbox race + missing tier-inference fallback). Asserts koje paraju: 7 (cells render) + 9 (every paying tier). |
| **Mobile tier hierarchy** — QHP + Rainbow + Huff @ iPhone SE × 1 assert | **3** | `every PAYING tier visible (HP+MP+LP)` failuje sa `HP=0` na mobile. Mobile viewport ima manju `play-grid` veličinu → renderPlayGrid sample window kraći → HP tier (lowest weight) ne uzorkovan u 30 spina. |

**Suma**: 20 + 3 = 23 ✅

---

## 🌊 Wave overview (newest first)

| Wave | Subject | Pass target | Status |
|---|---|:--:|:--:|
| **G1** | GDD-narrative empty-grid fix (parseGDD → workspace pool seeding) | 280/280 narrative path | ⏳ queued |
| **G2** | Mobile tier-coverage (HP tier sample window) | 280/280 mobile parity | ⏳ queued |
| **G3** | Workspace race elimination (`onWorkspaceReady` event) | 0 sandbox flake | ⏳ queued |
| **G4** | Pilot roster expansion (20+ pilots from slot-gdd-factory fixtures) | 20 × 2 × 14 = 560 asserts | ⏳ queued |
| **G5** | Industry pattern matrix (19 kinds × 26 patterns Cartesian) | 13 832 asserts | ⏳ queued |
| **G6** | Eval-pattern parity (cluster ne sme paylines, ways ne sme cluster) | per-fixture assert | ⏳ queued |
| **G7** | Chi-square weight contract (5000 spins per fixture) | hard tier-ratio gate | ⏳ queued |
| **G8** | WCAG AA color contrast (4.5:1 text / 3:1 UI) | axe-core integration | ⏳ queued |
| **G9** | Keyboard a11y (Space=spin, Enter=spin, focus-visible) | 4 asserts per fixture | ⏳ queued |
| **G10** | Screen-reader contract (aria-live win, role=grid, alt-text) | 5 asserts per fixture | ⏳ queued |
| **G11** | Reduced-motion (0 transitions when `prefers-reduced-motion`) | per-fixture animation budget | ⏳ queued |
| **G12** | i18n / RTL (dict bind + Arabic mirror) | RTL viewport test | ⏳ queued |
| **G13** | High-DPI / 4K (2560×1440 + 3840×2160) | + 2 viewports → 4 total | ⏳ queued |
| **G14** | Frame budget (60 fps → < 16.67 ms / frame) | performance.measure() assert | ⏳ queued |
| **G15** | Bundle size budget (< 500 KB gz / < 2 MB total) | `du -sh dist/` gate | ⏳ queued |
| **G16** | Cross-browser (chromium + firefox + webkit) | × 3 engines → 840 asserts | ⏳ queued |
| **G17** | Pixel-diff snapshot regression (pixelmatch baseline) | baseline + drift gate | ⏳ queued |
| **G18** | Error boundary (malformed IR → "Invalid IR" placeholder) | recovery assert | ⏳ queued |
| **G19** | Concurrent renders (4 paralelnih spinova, no shared state) | parallel-safe assert | ⏳ queued |
| **G20** | Fixture dashboard (HTML matrix + lazy screenshot embed) | sortable grid view | ⏳ queued |
| **G21** | Regression-watch CI hook (pre-push + GitHub Action) | git hook + .yml | ⏳ queued |
| **G22** | Deterministic seed mode (`?seed=N` URL param) | byte-identical screenshots | ⏳ queued |

---

## 🔴 P0 — must, zatvaranje 23 known fail (1 wave-batch, ~45 min)

### Wave **G1** — GDD-narrative empty-grid fix

> **Failing today**: `gdd · huff-puff.md` / `dragon-spin.json` / `mega-cascade.json` / `minimal-hnw.json` / `cluster-cosmic.txt` × 2 viewports × 2 asserts (cells render + every tier) = **20 fail**.

**Root cause** (verified iz audit report-a): kad GDD ide kroz narrative path (`parseGDD → gddToIR → reviewModal → #gdd-generate click`), workspace se seed-uje sinhrono ali symbol-pool build je lazy (runs on first `renderPlayGrid`). Playwright race tap-uje spin pre nego što je pool napravljen → `#play-grid` ima 0 cells.

**Acceptance**:
- `#play-grid renders > 0 cells` PASS na svim 5 GDD samples × 2 vp = 10 fixtures
- `every PAYING tier visible (HP+MP+LP)` PASS na svih 10 fixtures
- 0 sandbox race (eyes ne treba `wait(300)` workaround posle workspace switch)

**Files to touch**:
- `web/studio/app.js` — emit `onWorkspaceReady` event after `_seedSymbolPool()` completes; eager build umesto lazy.
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — zameni `wait(300)` sa `page.waitForFunction(() => window.__workspaceReady)`.

**Estimated**: 25 min.

**Dependency**: none.

---

### Wave **G2** — Mobile tier-coverage fix (HP tier sample window)

> **Failing today**: QHP / Rainbow / Huff @ iPhone SE → `HP=0` posle 30 spina.

**Root cause**: mobile viewport shrinks `#play-grid` rows (5×3 → fits manje vidljivih cells po batch-u). Sample window od 30 spina × ~15 cells = 450 cells. Pilot weights za HP često < 0.5% (Wrath HP=85, ali QHP HP=2 per reel-strip od 500) → expected HP sample = 450 × 0.005 = 2.25 hit-ova. Pri tom je standard deviation visok → realnistic da bude 0.

**Acceptance**:
- `every PAYING tier visible (HP+MP+LP)` PASS na 70/70 mobile fixtures
- **Bez** menjanja pilot PAR weights (production safety)

**Files to touch**:
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — bump `SPINS_TO_RUN` 30 → 200 (samo na mobile viewport ako desktop već prolazi sa 30), **ili** zameni soft heuristic sa hard chi-square test koji prihvata 0-hit ako expected < 3 (Cochran rule). Druga opcija ne usporava run.

**Estimated**: 15 min.

**Dependency**: none (paralelno sa G1).

---

### Wave **G3** — Workspace race elimination

> **Failing today**: nije direktno fail — ali eyes ima ugrađen workaround (`tabs[length-1].click() + wait(300)`) koji maskira flakiness.

**Root cause**: Studio izlaže `goToTab` ali ne i `switchToLatestWorkspace` / `getActiveWorkspaceState`. Eyes mora da pogađa kroz DOM query (`.ws-tab`).

**Acceptance**:
- Studio izlaže `window.__cortex_workspace_api = { switchToLatest, getActiveState, onReady }` API.
- Eyes pozivaju te API-je direktno → 0 workaround DOM query.
- Pošto Studio sad ima eksplicitan ready signal, ukloniti SVE `wait(N)` koji nisu absolutely necessary.

**Files to touch**:
- `web/studio/app.js` — eksponovati `window.__cortex_workspace_api`.
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — zameni workaround sa API call-ovima.

**Estimated**: 30 min.

**Dependency**: G1 (ovo gradi nad G1 ready-event).

---

## 🟡 P1 — coverage proširenje (3-4 wave, ~3 sata)

### Wave **G4** — Pilot roster expansion (5 → 20+ pilots)

> **Trenutno**: 5 pilots × 2 vp = 10 fixtures. **Target**: 20 pilots × 2 vp = 40 fixtures.

**Industry topology fali**:

| Pilot kind | Source repo | Pattern reference |
|---|---|---|
| `hexagonal_37tile` | `slot-gdd-factory/samples/06_hexagonal_GAME_GDD.md` | Hex ring=3 |
| `diamond_3-4-5-4-3` | `slot-gdd-factory/samples/07_diamond_GAME_GDD.md` | Diamond grid |
| `pyramid_1-3-5-3-1` | `slot-gdd-factory/samples/08_pyramid_GAME_GDD.md` | Pyramid grid |
| `cross_5x5` | `slot-gdd-factory/samples/09_cross_GAME_GDD.md` | Cross-grid (corner blank=1) |
| `lshape_5x5` | `slot-gdd-factory/samples/10_lshape_GAME_GDD.md` | L-shape (corner blank=2) |
| `radial_8spoke` | `slot-gdd-factory/samples/11_radial_GAME_GDD.md` | Radial 8-spoke |
| `infinity_3x3` | `slot-gdd-factory/samples/12_infinity_GAME_GDD.md` | Infinity horizontal |
| `expanding_5x3_to_5x9` | `slot-gdd-factory/samples/13_expanding_GAME_GDD.md` | Expanding reel |
| `dual_colossal` | `slot-gdd-factory/samples/14_dual_colossal_GAME_GDD.md` | Dual 5×4 + 5×12 |
| `slingo_5x5` | `slot-gdd-factory/samples/15_slingo_GAME_GDD.md` | Slingo board + strip |
| `plinko_16row` | `slot-gdd-factory/samples/16_plinko_GAME_GDD.md` | Plinko triangle |
| `crash_curve` | `slot-gdd-factory/samples/17_crash_GAME_GDD.md` | Crash multiplier (no grid) |
| `wheel_24seg` | `slot-gdd-factory/samples/18_wheel_GAME_GDD.md` | Wheel 24-segment |
| `lock_respin_5x4` | `slot-gdd-factory/samples/19_lock_respin_GAME_GDD.md` | Hold & Win |
| `rectangular_stacked_scatter_5x4` | `slot-gdd-factory/samples/20_rectangular_stacked_scatter_GAME_GDD.md` | Stacked scatter |

**Acceptance**:
- 20 pilots × 2 viewports × 14 asserts = **560 asserts**.
- Pass rate ≥ 95% nakon G1/G2 fixes lend down.
- Crash topology dobija "no grid expected" guard (skip asserts 7-9, pass na ostalim).

**Files to touch**:
- `web/studio/pilots/*.ir.json` — copy ili adapt 15 novih IR-ova iz slot-gdd-factory canonical samples.
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — FIXTURES roster +15.
- `web/studio/app.js` — verify svi grid kindovi imaju `renderPlayGrid` adapter (možda treba per-kind dispatcher).

**Estimated**: 90 min.

**Dependency**: G1 + G3.

---

### Wave **G5** — Industry pattern matrix (Cartesian fixture factory)

> **Pattern**: kao `slot-gdd-factory/tools/gen-synthetic-gdds.mjs` (19 kinds × 26 industry patterns = 174 syntetic IR-ova).

**Acceptance**:
- Studio import-uje fixture factory iz slot-gdd-factory (npm link ili copy).
- Eyes runner prihvata `--synth` flag → loop kroz 174 + 5 pilots + 5 GDD = 184 fixtures.
- 184 × 2 vp × 14 asserts = **5 152 asserts**.
- Smoke pass rate ≥ 90% (jer mnogi sintetički IR-ovi neće biti polished).

**Files to touch**:
- `web/studio/tools/gen-synthetic-irs.mjs` — copy/port iz `slot-gdd-factory/tools/gen-synthetic-gdds.mjs` ali generiše IR (ne GDD) direktno.
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — `--synth` flag.

**Estimated**: 120 min.

**Dependency**: G4.

---

### Wave **G6** — Eval-pattern parity assert

> **Industry rule**: cluster topology MORA da koristi `clusterPaysEval`, ne lines/ways; ways topology MORA `waysEval`; megaclusters MORA da split-uje pre eval-a.

**Acceptance**:
- Per fixture: probe `window.__active_eval_kind` (Studio expose) i verify match sa `gridKind`.
- Mapa: `cluster_grid → clusterPaysEval`, `ways_variable → waysEval`, `rectangular → linesEval | waysEval` (per IR), `megaclusters → clusterPaysEval (after split)`.

**Files to touch**:
- `web/studio/app.js` — eksponuj `window.__active_eval_kind` nakon spin evaluacije.
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — assert 16.

**Estimated**: 30 min.

**Dependency**: G4.

---

### Wave **G7** — Chi-square weight contract

> **Trenutno**: soft heuristic LP ≥ MP ≥ HP. **Target**: hard statistical assertion.

**Acceptance**:
- Per fixture: izračunaj expected pool ratio iz IR weights, run 5 000 spina, compute observed counts.
- Chi-square test `χ² < critical_value(df, α=0.05)` → pass.
- Skip test ako expected count < 5 per cell (Cochran rule).

**Files to touch**:
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — `SPINS_TO_RUN` bump 30 → 5 000 + chi-square helper.
- Run-time budget: 5 000 spina × ~50 ms/spin = 250 s/fixture → 250 × 20 × 2 = 167 min (10× too slow). Mitigation: paralelan worker pool ili sample na samo 1 viewport (desktop) za chi-square, zadržati 30 spina sample na mobile.

**Estimated**: 60 min code + 90 min tuning runtime.

**Dependency**: G5.

---

## 🟢 P2 — UX + a11y dimensions (5-6 wave, ~5 sati)

### Wave **G8** — WCAG AA color contrast (axe-core integration)

**Acceptance**:
- `axe-core` injected per page (npm: `axe-core`).
- Probe `axe.run('#panel-play')` → 0 violations of `color-contrast` rule (4.5:1 text, 3:1 UI).
- Per fixture × viewport assert: `axe contrast violations === 0`.

**Files to touch**:
- `package.json` — add `axe-core` devDep.
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — `page.addScriptTag({ path: axePath })` + `page.evaluate(() => axe.run(...))`.
- `web/studio/styles/play.css` — fix any contrast fails (likely tier-LP green on dark BG, scatter purple text).

**Estimated**: 45 min audit + variable remediation.

**Dependency**: G1.

---

### Wave **G9** — Keyboard a11y

**Acceptance**:
- Per fixture: focus `#btn-spin` → emit `keydown Space` → assert `spinTriggered`.
- Tab order valid: Tab cycles through #btn-spin → #btn-bet-down → #btn-bet-up → ... (deklarisan u code).
- `:focus-visible` outline 2px visible on every interactive element.

**Files to touch**:
- `web/studio/app.js` — add keydown Space/Enter handlers on #btn-spin.
- `web/studio/styles/a11y.css` — `*:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`.
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — asserts 17-20.

**Estimated**: 60 min.

**Dependency**: G1.

---

### Wave **G10** — Screen-reader contract

**Acceptance**:
- `#play-grid` ima `role="grid"`, `aria-label="Play grid {kind} {rows}×{cols}"`.
- `.play-cell` ima `role="gridcell"`, `aria-label="{tier} {symbol}"`.
- Win banner ima `aria-live="polite"`, `aria-atomic="true"`.
- Spin button ima `aria-label="Spin reels"` + `aria-pressed` state.
- Probe: query all live regions, assert presence.

**Files to touch**:
- `web/studio/app.js` `renderPlayGrid()` — emit aria-* attrs.
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — asserts 21-25.

**Estimated**: 45 min.

**Dependency**: G1.

---

### Wave **G11** — Reduced-motion respect

**Acceptance**:
- `@media (prefers-reduced-motion: reduce)` CSS rule disables all `.spin-anim` / transitions.
- Probe: launch context sa `reducedMotion: 'reduce'` → measure `getComputedStyle(spinningCell).transitionDuration` → assert `0s`.

**Files to touch**:
- `web/studio/styles/play.css` — reduced-motion media query.
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — duplicate VIEWPORTS sa `reducedMotion: 'reduce'` flag → 4 viewports total, assert 26.

**Estimated**: 30 min.

**Dependency**: G1.

---

### Wave **G12** — i18n / RTL

**Acceptance**:
- Sve text-label-e (BET, SPIN, WIN, BALANCE, PAYTABLE...) iz `web/studio/lang/{en,ar,es}.json` dictionary.
- RTL viewport: launch context sa `locale: 'ar-AE'` → assert `<html dir="rtl">` + `#play-grid` mirror (reel order desno-levo).
- 3 jezika × 2 vp = 6 dodatnih probe runova.

**Files to touch**:
- `web/studio/lang/{en,ar,es}.json` — dict (~30 strings).
- `web/studio/app.js` — `i18n(key)` helper, `data-i18n="key"` attrs on all labels.
- `web/studio/styles/rtl.css` — `[dir="rtl"] #play-grid { flex-direction: row-reverse; }`.
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — locale matrix.

**Estimated**: 120 min.

**Dependency**: G9 (treba accessible name layer).

---

### Wave **G13** — High-DPI / 4K viewport expansion

**Acceptance**:
- VIEWPORTS += `{ id: 'desktop-2k', width: 2560, height: 1440 }`, `{ id: 'desktop-4k', width: 3840, height: 2160 }`.
- Per HDPI viewport: assert no SVG raster blur (DPR=2 context).
- Per HDPI viewport: assert `#play-grid` ne overflow-uje horizontalno (responsive break at 1920+ honors max-width).

**Files to touch**:
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — VIEWPORTS +2.
- `web/studio/styles/play.css` — `@media (min-width: 1920px) { #play-grid { max-width: 1600px; margin: 0 auto; } }` if needed.

**Estimated**: 30 min.

**Dependency**: none (paralel sa P2).

---

## 🔵 P3 — performance + reliability (4 wave, ~3 sata)

### Wave **G14** — Frame budget (60 fps)

**Acceptance**:
- Per fixture: enable `page.tracing.start({ screenshots: false })` → spin → assert max frame duration < 16.67 ms.
- Tolerate up to 3 long frames per spin (Chrome compositor noise).

**Files to touch**:
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — performance trace + frame analysis.

**Estimated**: 60 min.

**Dependency**: G1.

---

### Wave **G15** — Bundle size budget

**Acceptance**:
- `npm run build` → `dist/` total < 2 MB, gzipped < 500 KB.
- Failing this is hard fail (CI exit 1).

**Files to touch**:
- `web/studio/tools/bundle-size-gate.mjs` — new script.
- `package.json` — `test:bundle-size` npm script.

**Estimated**: 30 min.

**Dependency**: none.

---

### Wave **G16** — Cross-browser matrix

**Acceptance**:
- `BROWSERS = ['chromium', 'firefox', 'webkit']`.
- Per fixture × viewport × browser = 20 × 2 × 3 = 120 runs → 120 × 14 = **1 680 asserts**.
- Tolerate webkit-specific behaviors (touch-action: manipulation polyfill).

**Files to touch**:
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — outer loop on browser engine.

**Estimated**: 45 min.

**Dependency**: G1.

---

### Wave **G17** — Pixel-diff snapshot regression

**Acceptance**:
- `pixelmatch` (npm) dep added.
- Baseline screenshots committed to `web/studio/tools/_eyes/grid-coverage/baseline/`.
- Per fixture × viewport: compute pixel diff vs baseline → fail if `> 0.5%` mismatch.

**Files to touch**:
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — pixelmatch diff helper.
- `package.json` — add `pixelmatch` devDep.
- `web/studio/tools/_eyes/grid-coverage/baseline/*.png` — committed baseline.

**Estimated**: 60 min.

**Dependency**: G22 (deterministic seed) — bez seed-a pixel-diff je flaky.

---

### Wave **G18** — Error boundary

**Acceptance**:
- Inject malformed IR (`{ topology: 'invalid', reels: null }`) → assert `#play-grid` shows "Invalid IR — see console" placeholder umesto crash.
- Inject IR with NaN weights → assert no propagation to UI.

**Files to touch**:
- `web/studio/app.js` — `try/catch` boundary around `gddToIR` + `renderPlayGrid` with fallback UI.
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — injection fixture (synth-error-001 etc).

**Estimated**: 45 min.

**Dependency**: G1.

---

### Wave **G19** — Concurrent renders (parallel-safe)

**Acceptance**:
- Spawn 4 paralelnih browser contexts → load same fixture → spin independently × 10 spins each.
- Assert tier counts svaki context su nezavisni (no shared `window.*` state leakage).

**Files to touch**:
- `web/studio/app.js` — guard sve `window.__*` global state, prefer per-context state container.
- `web/studio/tools/cortex-eyes-concurrent.mjs` — new probe.

**Estimated**: 60 min.

**Dependency**: G1.

---

## 🟣 P4 — scale + tooling (3 wave, ~2 sata)

### Wave **G20** — Fixture dashboard (sortable HTML matrix)

**Acceptance**:
- Generator: `tools/eyes-dashboard.mjs` → output `reports/grid-coverage-dashboard.html`.
- Tabla N×3 sa lazy-load screenshot embed, sort kolone (fixture / pass-rate / time).
- Live filter input (npr "filter: cluster*" prikazuje samo cluster topology).

**Files to touch**:
- `web/studio/tools/eyes-dashboard.mjs` — new generator.

**Estimated**: 90 min.

**Dependency**: G4 + G16 (treba bogata data za dashboard da bude smislen).

---

### Wave **G21** — Regression-watch CI hook

**Acceptance**:
- `.git/hooks/pre-push` → run `npm run test:cortex-eyes-grids:quick` → fail block push.
- `.github/workflows/grid-coverage.yml` → run on every PR, post comment sa pass-rate delta vs main.

**Files to touch**:
- `.git/hooks/pre-push` (template, ne commit-uje se direktno — provide install script).
- `web/studio/tools/install-pre-push-hook.sh`.
- `.github/workflows/grid-coverage.yml`.
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — `--quick` flag (subset of fixtures, < 30 s).

**Estimated**: 60 min.

**Dependency**: G4 + G16.

---

### Wave **G22** — Deterministic seed mode

**Acceptance**:
- Studio respekuje `?seed=12345` URL param → simulator koristi seedable PRNG (mulberry32 / xoshiro128**) umesto Math.random.
- Eyes runner uvek inject-uje `?seed=42` → screenshot-ovi byte-identical run-to-run → clean pixel-diff baseline (Wave G17).

**Files to touch**:
- `web/studio/app.js` — seeded PRNG, parse URL seed param.
- `web/studio/tools/cortex-eyes-grid-coverage.mjs` — inject `?seed=42`.

**Estimated**: 60 min.

**Dependency**: must-have prerequisite for G17.

---

## 🧭 Implementation order (DAG)

```
G1 (narrative path fix) ──┬──► G3 (workspace API) ──► G4 (20 pilots) ──┬──► G5 (synth matrix)
                          │                                            │
                          │                                            ├──► G6 (eval parity)
G2 (mobile sample)  ──────┘                                            │
                                                                       └──► G7 (chi-square)

G1 ──► G8 (axe contrast)
   ──► G9 (keyboard)  ──► G12 (i18n + RTL)
   ──► G10 (screen reader)
   ──► G11 (reduced-motion)
   ──► G14 (frame budget)
   ──► G16 (cross-browser) ──► G20 (dashboard)
   ──► G18 (error boundary)
   ──► G19 (concurrent)

G22 (seed) ──► G17 (pixel-diff)

G13 (HDPI)  — independent, anytime
G15 (bundle size) — independent, anytime
G21 (CI hook) — last (needs G4 + G16 to be meaningful)
```

---

## ✅ Acceptance gate per G-wave (universal)

| Gate | Required for ALL G-waves |
|---|---|
| **Audit re-run** | `npm run test:cortex-eyes-grids` posle ship → 0 regression on previously-passing asserts |
| **Pass-rate delta** | Post-wave pass-rate ≥ pre-wave pass-rate |
| **Run-time delta** | Post-wave total run-time ≤ 110% pre-wave (no 10×+ slowdown) |
| **Screenshot delta** | If wave touches UI, baseline screenshots updated + diff committed |
| **JSDoc header** | New scripts have purpose + acceptance + ako extend-uje runner: which assert # they add |
| **Vendor-neutral** | 0 IGT/Pragmatic/Megaways/Cleopatra/Buffalo strings (per `rule_no_vendor_mentions.md`) |
| **Commit message** | `feat(studio-grids): WAVE_ID — subject` with body listing pass-rate before/after |
| **Master TODO update** | This file: flip wave row status ⏳ → 🔄 → ✅, append timeline row, hash pin |
| **Push origin/main** | Automatic per `rule_master_todo_auto_commit.md` |

---

## ❌ What this roadmap does NOT cover

| Out of scope | Why / where it lives |
|---|---|
| **PAR math validation** (RTP, volatility, win cap, hit-frequency calibration) | Belongs to `slot-math-engine-template` core (Rust `crates/slot_math/`); studio is renderer + visual QA only |
| **Real-cash HUD wiring** | Belongs to vendor B operator integration layer |
| **Server-side state persistence** | Belongs to operator account system |
| **Game-specific copy / sprites / theme assets** | Belongs to per-game asset pack repos |
| **L3 LoRA / on-device inference** | Hardware-blocked (M4 Ultra Q1 2027) — `rule_realistic_time_estimates.md` |
| **Compliance certification** (GLI-19, ISO/IEC 27001) | Different track, post-Phase E of capsule-first plan |

---

## ❓ Open questions (need Boki ruling before ambiguous waves start)

1. **Chi-square sample size** (G7) — 5 000 spina × 20 pilots × 2 vp = 200 000 spina ~ 2 h. Acceptable, ili treba dedicated chi-square track (separate `npm script`) sa nightly run?
2. **i18n languages** (G12) — koje su prioritetne? Predlažem EN + AR (RTL stress) + ES (LatAm). Ako treba i ZH/RU/PT — dodajem u G12+.
3. **High-DPI matrix** (G13) — 2K + 4K dovoljno, ili treba i 5K (Apple Studio Display)?
4. **Pixel-diff tolerance** (G17) — 0.5% ili stricter (0.1%)? Stricter → flakier ali catches actual visual regression.
5. **CI hook gate** (G21) — pre-push hard block (fail = no push), ili soft warn (fail = warn but allow)? UKGC compliance market kažu hard.
6. **Per-grid eval-pattern map** (G6) — ko owns canonical mapping (`gridKind → evalKind`)? Studio app.js, ili novi `web/studio/lib/eval-pattern-registry.js`?
7. **Synthetic fixture port** (G5) — copy `slot-gdd-factory/tools/gen-synthetic-gdds.mjs` (fork), ili npm-link cross-repo (couples versions)?

---

## 📂 Files to be created / modified (full inventory)

### NEW files (waves G1-G22 collectively)

```
web/studio/MASTER_TODO_GRIDS.md                          ← this file
web/studio/lang/en.json
web/studio/lang/ar.json
web/studio/lang/es.json
web/studio/styles/a11y.css
web/studio/styles/rtl.css
web/studio/tools/eyes-dashboard.mjs
web/studio/tools/bundle-size-gate.mjs
web/studio/tools/install-pre-push-hook.sh
web/studio/tools/cortex-eyes-concurrent.mjs
web/studio/tools/gen-synthetic-irs.mjs
web/studio/tools/_eyes/grid-coverage/baseline/*.png      ← N baseline screenshots
.github/workflows/grid-coverage.yml
+15 web/studio/pilots/*.ir.json                          ← hex / diamond / pyramid / cross / lshape / radial / infinity / expanding / dual_colossal / slingo / plinko / crash / wheel / lock_respin / rectangular_stacked
```

### MODIFIED files (waves G1-G22 collectively)

```
web/studio/app.js                                        ← +onWorkspaceReady event, +i18n, +aria, +seeded PRNG, +error boundary, +keyboard handlers
web/studio/styles/play.css                               ← +reduced-motion guard, +HDPI rules, +contrast fixes
web/studio/tools/cortex-eyes-grid-coverage.mjs           ← +21 new asserts (16-36), +viewports, +browser matrix, +seed inject, +pixel-diff
web/studio/package.json                                  ← +axe-core, +pixelmatch, +test:* scripts
```

---

## 🔚 Definition of done (entire roadmap)

| Metric | Today | Done |
|---|---:|---:|
| Pass rate | 257/280 (91.8%) | **≥ 5 000 / 5 000 (100%)** post-G16 |
| Fixtures audited | 10 | **184** (20 pilots + 5 GDD + 174 synth) post-G5 |
| Viewports | 2 | **4** (desktop + mobile + 2K + 4K) post-G13 |
| Browsers | chromium | **chromium + firefox + webkit** post-G16 |
| A11y dimensions | 2 (tap-target + touch-action) | **8** (contrast, keyboard, SR, RM, RTL, focus, ARIA, HDPI) post-G13 |
| Performance gates | 1 (per-spin < 1500 ms) | **3** (per-spin + per-frame + bundle) post-G15 |
| Reliability gates | 3 (page-err, console-err, undefined) | **6** (+ error boundary, concurrent, pixel-diff drift) post-G19 |
| CI integration | manual | **pre-push + GitHub Action** post-G21 |
| Determinism | Math.random | **`?seed=` PRNG** post-G22 |

**Estimated total**: 22 waves × ~30 min avg = **~11 h pure code**, raspoređeno preko 4-5 sessions sa testing/iteration. AI rate ne ljudski rate.

---

*Generated by Corti, 2026-06-08. Live-updated after every G-wave ship.*
