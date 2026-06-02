# MASTER TODO — GDD-First Capsule Factory (math deferred)

> **Track**: Capsule-first slot factory. Cilj: **GDD savršen** → **template** → **playable browser igra** sa Wrath-shape mehanikom, gde je svaki feature **nezavisna kapsula**.
>
> **Math is OUT OF SCOPE** ovog plana. PAR/MC/RTP gates dolaze posle Phase E.
>
> Owner: Boki (vizija) + Corti (implementacija, full autonomy per `CLAUDE.md`).
> Created: 2026-06-02.

---

## 🔒 Locked expert decisions

| Decision | Choice | Rationale |
|---|---|---|
| LLM in critical path | **NO** | Hallucination risk vs "potpuno sigurno" mandate |
| LLM side-car | OPTIONAL (theme/copy only, human-reviewed) | Never writes IR / feature config |
| Capsule registry | **Extend existing `feature-registry.js`** | 13 modules already scaffolded |
| Mechanical reference | **`runtime.js` + Wrath v12.1.0** | Don't reinvent — extract |
| GDD format | **Markdown (sections) + JSON sidecar** | Designer prose + machine truth |
| Schema | **Zod (TS) → exported JSONSchema 2020-12** | Single source, two runtimes |
| Determinism | **PCG64 seeded** | Reproducible, regulator-ready |
| Storage | Filesystem-first (no DB yet) | KISS |

---

## 🧱 Capsule taxonomy (4 tiers, 24 capsules)

### Tier A — Game-flow capsules (5)
| Kind | Status (registry) | Source extraction |
|---|---|---|
| `base_game` | ⬜ implicit in runtime.js | extract spin loop + line eval |
| `free_spins` | ✅ scaffolded | done — verify gate |
| `hold_and_win` | ✅ scaffolded | done — verify gate |
| `cascade` | 🟡 *(planned)* | TS port from Wrath cascade math (math part deferred) |
| `pick_bonus` | 🟡 *(planned)* | new module |

### Tier B — Win-presentation capsules (4)
| Kind | Status | Notes |
|---|---|---|
| `win_lines` | ⬜ baked in runtime.js | extract payline overlay + highlight loop |
| `big_win` | ⬜ baked in runtime.js | extract count-up tiers (10×/25×/50×, 4s/tier) |
| `anticipation` | ⬜ baked in runtime.js | extract 2+ scatter glow logic |
| `multiplier_meter` | ✅ scaffolded | verify |

### Tier C — Reel/UI capsules (8)
| Kind | Status | Notes |
|---|---|---|
| `reel_spin_profile` | ⬜ baked in runtime.js | WINDUP→ACCEL→STEADY→DECEL→CUSHION |
| `expanding_wild` | 🟡 *(planned)* | impls.rs port |
| `walking_wild` | 🟡 *(planned)* | impls.rs port |
| `sticky_wild` | 🟡 *(planned)* | impls.rs port |
| `mystery_symbol` | 🟡 *(planned)* | impls.rs port |
| `ways` | 🟡 *(planned)* | new |
| `cluster_pays` | 🟡 *(planned)* | new |
| `power_meter` | ✅ scaffolded | verify |

### Tier D — State/IO capsules (3)
| Kind | Status | Notes |
|---|---|---|
| `engine_api` | ⬜ inline in runtime.js | extract `spin()` / `evaluate()` calls |
| `session_state` | ⬜ inline | balance / bet / autoplay |
| `rng` | ⬜ inline | PCG64 seeded |

**Total**: 24 capsules. **Done**: 4. **Scaffolded-needs-finishing**: 9. **Extraction from monolit**: 11.

---

## 🌊 Wave plan

> Sizing per `rule_realistic_time_estimates.md`: 4-atom wave = 15–30 min AI-paced. Full plan ≈ **3.5–5 h**.

### 🌊 Phase A — GDD savršen (1 wave, 4 atoms, ~30 min)

| # | Atom | Deliverable | Gate |
|---|---|---|---|
| A.1 | Zod GDD schema | `web/studio/src/gdd/schema.ts` — every Tier-A/B/C/D capsule has typed feature entry | `zod-to-json-schema` emits valid JSONSchema 2020-12 |
| A.2 | GDD markdown parser | `web/studio/src/gdd/parse.ts` — read headings (`## Features`, `## Reels`, `## Paytable`, …) → Zod object | 6 fixture GDDs round-trip MD→Zod→MD lossless |
| A.3 | GDD → IR adapter | `web/studio/src/gdd/to_ir.ts` — pure deterministic transform, NO math inference | `npm run gdd:to-ir <fixture>` produces valid `game.ir.json` validated by existing IR schema |
| A.4 | GDD authoring panel | `web/studio/app.js` GDD tab — drag-drop MD, live Zod validation, error tooltips on bad fields | E2E: load broken fixture → see exact field path with error |

**Phase A acceptance**: 6 fixture GDDs (covering all 24 capsule kinds) parse → IR → schema-validate. **0 LLM calls in this path.**

---

### 🌊 Phase B — Capsule extraction from `runtime.js` monolit (3 waves)

#### B-wave-1 (4 atoms, ~30 min) — Reel + win presentation

| # | Atom | Deliverable | Gate |
|---|---|---|---|
| B1.1 | Extract `reel_spin_profile` capsule | `runner/features/reel-spin-profile.js` | runtime.js calls capsule via bus event `reel:spin_start`; deterministic timing match w/ pre-extract |
| B1.2 | Extract `win_lines` capsule | `runner/features/win-lines.js` | payline overlay + highlight loop visually identical |
| B1.3 | Extract `big_win` capsule | `runner/features/big-win.js` | 10×/25×/50× tiers, 4s per tier, count-up RAF loop |
| B1.4 | Extract `anticipation` capsule | `runner/features/anticipation.js` | 2+ scatter triggers glow on remaining reels |

#### B-wave-2 (4 atoms, ~30 min) — Game-flow capsules verification

| # | Atom | Deliverable | Gate |
|---|---|---|---|
| B2.1 | `base_game` capsule extract | `runner/features/base-game.js` | spin loop + line eval moved out of runtime.js core |
| B2.2 | Verify `free_spins` capsule completeness | gap-check vs runtime.js inline FS code | feature-flag toggle on/off in GDD reflects in playable |
| B2.3 | Verify `hold_and_win` capsule completeness | gap-check vs runtime.js inline H&W | feature-flag toggle works |
| B2.4 | Extract intro/outro animations as `transitions` capsule | `runner/features/transitions.js` | epic-intro card + outro fade per Wrath shape |

#### B-wave-3 (4 atoms, ~30 min) — State/IO capsules

| # | Atom | Deliverable | Gate |
|---|---|---|---|
| B3.1 | `engine_api` capsule | `runner/features/engine-api.js` | abstract spin/evaluate behind one interface |
| B3.2 | `session_state` capsule | `runner/features/session-state.js` | balance/bet/autoplay persisted to localStorage; reset() pure |
| B3.3 | `rng` capsule | `runner/features/rng.js` | PCG64 seeded; same seed → same outcomes (TS↔Rust parity tested in Phase E) |
| B3.4 | Status-bar rollup as `hud` capsule | `runner/features/hud.js` | balance/bet/win pill match Wrath rollup pulse |

**Phase B acceptance**: `runtime.js` core ≤ 400 LOC orchestrator. Each capsule individually importable. Removing any optional capsule from registry → playable still boots (just without that feature).

---

### 🌊 Phase C — Finish *(planned)* capsules (2 waves)

#### C-wave-1 (4 atoms, ~30 min) — Symbol-behavior capsules

| # | Atom | Deliverable | Gate |
|---|---|---|---|
| C1.1 | `expanding_wild` capsule | port from `rust-sim/src/behavior/impls.rs` (visual only, no RTP) | wild lands → reel column expands |
| C1.2 | `walking_wild` capsule | port w/ 4 directions × bounce/disappear | wild moves N cells per spin |
| C1.3 | `sticky_wild` capsule | port w/ N-spin counter | persists across N spins |
| C1.4 | `mystery_symbol` capsule | port w/ weighted reveal | placeholder → reveal after stop |

#### C-wave-2 (4 atoms, ~30 min) — Bonus + win-mode capsules

| # | Atom | Deliverable | Gate |
|---|---|---|---|
| C2.1 | `cascade` capsule (visual, no RTP) | winning symbols vanish + drop | chain count badge |
| C2.2 | `bonus_pick` / `wheel_bonus` | pick-N-of-M + wheel | reveal + collect/lose terminator |
| C2.3 | `buy_feature` button | reads per-feature buy multipliers from IR | button mounted in `#mtl-features-bottom` |
| C2.4 | `cluster_pays` + `ways` (mutually exclusive) | overlay + ways badge | conflict detection in registry surfaces warning |

**Phase C acceptance**: All 11 previously-planned capsules implemented. Registry shows 0 `*(planned)*`.

---

### 🌊 Phase D — Template → game generator (1 wave, 4 atoms, ~45 min)

| # | Atom | Deliverable | Gate |
|---|---|---|---|
| D.1 | `gdd-to-game` CLI | `tools/gdd_to_game/cli.ts` — `gdd.md` + skin folder → `games/<id>/web/` | one-command emit |
| D.2 | Inline-IR injector | injects `<script id="inline-ir">{...}</script>` into `template.html` | byte-deterministic output for same input |
| D.3 | Selective capsule bundling | only IR-referenced capsules included in final bundle | bundle size scales with feature count |
| D.4 | Studio "Build Game" button | wires `gdd-to-game` CLI to UI; preview iframe pre-deploy | round-trip drag-drop → live preview |

**Phase D acceptance**: Drop GDD on Studio → click "Build" → playable iframe opens with all declared features visible. No math, but mechanics work.

---

### 🌊 Phase E — E2E golden path (1 wave, 4 atoms, ~30 min)

| # | Atom | Deliverable | Gate |
|---|---|---|---|
| E.1 | Golden GDD fixture: maximal | `tests/fixtures/gdd_maximal.md` — every capsule declared | builds + boots clean |
| E.2 | Golden GDD fixture: minimal | `tests/fixtures/gdd_minimal.md` — base only | builds + boots clean |
| E.3 | Playwright E2E | `tests/e2e/gdd_to_playable.spec.ts` — drag-drop → assert each feature DOM node exists | green on CI |
| E.4 | Capsule isolation test | remove each capsule individually → game still boots | 24 boot tests all PASS |

**Phase E acceptance**: Both fixtures playable in browser, every declared feature renders, no console errors.

---

## ❌ Out of scope (defer until Phase F+)

| Item | Where it goes |
|---|---|
| Math (PAR generation, MC, RTP gates, closed-form solvers) | Existing `SLOT_ENGINE_MASTER_TODO.md` — continues unchanged |
| Art / skin (sprites, sound, theme assets) | Phase F (asset pipeline) |
| RGS backend (Fastify, session, audit) | Phase G |
| Audio | Last, per Wrath `CLAUDE.md` rule |
| Regulator dossier | Phase H |

---

## ✅ Global acceptance (whole plan)

A non-tech designer drops a GDD markdown on Studio, clicks **Build**, and:
1. GDD parses 100% (Zod errors surface inline, never silent fail).
2. Generated game **boots in browser** with every declared feature visible.
3. **Mechanically matches Wrath shape**: spin profile, anticipation, big-win count-up, FS intro/HUD/outro, H&W locked-orb + reveal, multiplier strip, retrigger.
4. Each feature toggleable independently in GDD (capsule isolation).
5. **0 LLM calls** in this path. **0 hardcoded vendor strings** (per `rule_no_vendor_mentions`).
6. Build is byte-deterministic for same GDD input.

---

## 📋 Status board

| Phase | Waves | Atoms | Status |
|---|---|---|---|
| A — GDD perfect | 1 | 4 | ⬜ |
| B — Capsule extraction | 3 | 12 | ⬜ |
| C — Finish *(planned)* | 2 | 8 | ⬜ |
| D — Template → game | 1 | 4 | ⬜ |
| E — E2E golden path | 1 | 4 | ⬜ |
| **TOTAL** | **8** | **32** | **0 / 32** |

**Estimated total**: 3.5–5 h AI-paced. Math wave starts AFTER Phase E green.
