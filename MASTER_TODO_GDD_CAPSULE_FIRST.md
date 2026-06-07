# MASTER TODO — GDD-First Capsule Factory (v2 · post-gap-audit)

> **Track**: Capsule-first slot factory. Cilj: **GDD savršen** → **template** → **playable browser igra** sa Wrath-shape mehanikom, gde je svaki feature **nezavisna kapsula**.
>
> **Math is OUT OF SCOPE** ovog plana. PAR/MC/RTP gates dolaze posle Phase E.
>
> Owner: Boki (vizija) + Corti (implementacija, full autonomy per `CLAUDE.md`).
> Created: 2026-06-02. **v2 update**: 2026-06-02 (gap audit sa 4 paralelna research toka).

---

## 🔄 v2 changelog — šta je novo posle gap audit-a

| Promena | Razlog |
|---|---|
| **PCG64 → xoshiro128\*\*** (RNG) | Spec mismatch sa `runtime.js` line 109. Dan-1 cert fail. Agent #1 gap 8.1 |
| **Fixed-point math (millicredits i64)** dodato u locked decisions | Cross-platform determinism (Kimi #2, Agent #3 R4) |
| **30 novih kapsula** dodato (P0+P1 missing mechanics) | Agent #2 — Bonus Buy, Ante, jackpot tiers, prize-symbol, persistent mult itd |
| **Phase F-J** nove faze | 4 nove robustness/futuristic faze posle E |
| **Capsule contract v2** (12 lifecycle hooks, typed events) | Agent #3 — onMount/onPause/onBetChange/onError + 8 ostalih |
| **Top-10 P0 hardening list** | Agent #1 — must-fix before any user touches it |
| **Futuristic Phase II vision** (ZK, WASM components, Sigstore, WebGPU) | Kimi deep research — 2027 horizon |

---

## 🔒 Locked expert decisions (v2)

| Decision | Choice | Rationale |
|---|---|---|
| LLM in critical path | **NO** | Hallucination risk vs "potpuno sigurno" mandate |
| LLM hybrid layer | **Domain-tuned 7B for GDD parse + 14B for capsule synth** (both behind gate) | Kimi #4 — domain LLM scores 4.8/5 on GDD-to-IR |
| Capsule registry | **Extend existing `feature-registry.js`** | 13 modules already scaffolded |
| Mechanical reference | **`runtime.js` + Wrath v12.1.0** | Don't reinvent — extract |
| GDD format | **Markdown (sections) + JSON sidecar + HTML-comment anchors** | i18n-safe headings (Agent #1 1.4) |
| Schema | **Zod (TS) → exported JSONSchema 2020-12** | Single source, two runtimes |
| Determinism (RNG) | **xoshiro128\*\* seeded** (matches runtime.js, NOT PCG64) | Spec/impl alignment |
| Number representation | **Fixed-point millicredits (i64)** for all wallet/payout/solver math | IEEE-754 non-deterministic across arch (Kimi) |
| JSON canonicalization | **RFC 8785 (JCS)** for byte-deterministic Build | Agent #1 6.2 |
| Storage | Filesystem-first (no DB yet) | KISS |
| Bundle distribution | **Content-addressed `capsule-<sha256>.tar.zst` over OCI** (Phase II) | Sigstore-ready (Kimi #3) |
| Capsule isolation (Phase II) | **WASM Component Model + WASI 0.3** | Memory-safe sandbox |
| Renderer roadmap | **Canvas2D now → WebGPU Phase II** | 10× compute perf (Kimi #6) |

---

## 🛡️ Top-10 P0 hardening — must-fix list (Agent #1)

| # | Gap ID | Problem | Where it lands |
|:--:|---|---|---|
| 1 | 6.1 | Adapter fails-closed on unmapped GDD feature (no orphan IR) | **Phase F.1** |
| 2 | 8.1 | xoshiro128\*\* parity test TS↔Rust pinned pre-cert | **Phase E.5** |
| 3 | 2.1 + 2.2 | Compose-time DAG validator + retrigger-depth cap (≤8) | **Phase F.2** |
| 4 | 3.1 | Two-phase wallet commit + seed-replay recovery | **Phase F.3** |
| 5 | 3.2 | Spin semaphore (anti-double-click + held-Enter) | **Phase F.4** |
| 6 | 3.3 | Autoplay stops on every `bonus:entered` by default | **Phase F.5** |
| 7 | 6.2 | RFC 8785 canonical JSON for byte-determinism | **Phase F.6** |
| 8 | 5.1 + 5.2 | BroadcastChannel multi-tab lock + corrupt-state archive | **Phase F.7** |
| 9 | 4.1 + 4.4 | Wallet credit @ settle (not rollup end) + reduced-motion | **Phase F.8** |
| 10 | 7.6 + 7.1 | Inline IR as `type="application/json"` + file:// worker fallback | **Phase F.9** |

---

## 🧱 Capsule taxonomy v2 (5 tiers, 54 capsules)

### Tier A — Game-flow capsules (7, was 5)

| Kind | Status | Source |
|---|---|---|
| `base_game` | ⬜ implicit in runtime.js | extract spin loop + line eval |
| `free_spins` | ✅ scaffolded | extend w/ retrigger-state + multi-tier menu (Agent #2 #35) |
| `hold_and_win` | ✅ scaffolded | extend w/ prize-symbol payload (Agent #2 #9) |
| `cascade` | 🟡 *(planned)* | TS port; w/ chain-mult support (#12) |
| `pick_bonus` | 🟡 *(planned)* | new module |
| `wheel_bonus` | 🆕 P0 | segmented wheel, weighted pick (Agent #2 #6) |
| `jackpot_tiers` | 🆕 P0 | Mini/Minor/Major/Grand 4-level + contribution math (Agent #2 #7) |

### Tier B — Win-presentation capsules (5, was 4)

| Kind | Status | Notes |
|---|---|---|
| `win_lines` | ⬜ baked in runtime.js | extract overlay + sequencer (Agent #1 4.6) |
| `big_win` | ⬜ baked in runtime.js | tiers + reduced-motion fallback (Agent #1 4.4) |
| `anticipation` | ⬜ baked in runtime.js | per-reel curve confirmation (Agent #2 #43) |
| `multiplier_meter` | ✅ scaffolded | verify |
| `win_cap` | 🆕 P0 | 5000×/10000× regulator-mandated terminator (Agent #2 #44) |

### Tier C — Reel/UI capsules (15, was 8)

| Kind | Status | Notes |
|---|---|---|
| `reel_spin_profile` | ⬜ baked | WINDUP→ACCEL→STEADY→DECEL→CUSHION |
| `expanding_wild` | 🟡 *(planned)* | impls.rs port |
| `walking_wild` | 🟡 *(planned)* | impls.rs + directional/nudge (Agent #2 #26-27) |
| `sticky_wild` | 🟡 *(planned)* | impls.rs port |
| `mystery_symbol` | 🟡 *(planned)* | impls.rs + global-reveal mode (Agent #2 #22) |
| `ways` | 🟡 *(planned)* | static + **variable-ways (Megaways-style)** (Agent #2 #21) |
| `cluster_pays` | 🟡 *(planned)* | with avalanche-mult composition |
| `power_meter` | ✅ scaffolded | verify |
| `symbol_payload` | 🆕 P0 | generic cash/mult/jackpot value on symbol (Agent #2 #13-14) |
| `super_symbol` | 🆕 P0 | 2×2/3×3/4×4 colossal (Agent #2 #28) |
| `split_wild` | 🆕 P0 | stacked ×N (Agent #2 #25) |
| `replicator_wild` | 🆕 P1 | wild clones onto N tiles (Agent #2 #24) |
| `symbol_upgrade` | 🆕 P1 | level-up via meter (Agent #2 #15) |
| `transform` | 🆕 P1 | post-win class swap (Agent #2 #30) |
| `chain_mult` | 🆕 P0 | win-mult-on-win for cascade (Agent #2 #12) |

### Tier D — State/IO capsules (10, was 3)

| Kind | Status | Notes |
|---|---|---|
| `engine_api` | ⬜ inline | abstract spin/evaluate w/ two-phase wallet commit (P0) |
| `session_state` | ⬜ inline | stack-scoped frames, namespaced keys, multi-tab lock (P0) |
| `rng` | ⬜ inline | xoshiro128\*\* + named sub-RNGs (`rng.fork('viz'/'math')`) |
| `hud` | ⬜ baked | balance/bet/win pill match Wrath rollup |
| `bet_panel` | ⬜ baked | region step-table (Agent #2 #52) |
| `autoplay` | ⬜ baked | hard-cap rounds, stop-on-bonus default (P0) |
| `persistent_meter` | 🆕 P1 | charge/energy meter generic (Agent #2 #17) |
| `bonus_buy` | 🆕 P0 | multi-tier ladder, region-gated (Agent #2 #1-2) |
| `ante_bet` | 🆕 P0 | stake +N% boost weight (Agent #2 #3) |
| `stake_band` | 🆕 P1 | volatility bands w/ paytable swap (Agent #2 #4) |

### Tier E — Cross-cutting / system capsules (10, NEW)

| Kind | Status | Notes |
|---|---|---|
| `region_compliance` | 🆕 P0 | UKGC/MGA/IT/DE/JP profiles w/ pacing+autoplay+stake rules |
| `gamble` | 🆕 P1 | post-win ladder w/ EV target (Agent #2 #5) |
| `must_drop` | 🆕 P2 | time-locked jackpot (Agent #2 #8) |
| `prebought_round` | 🆕 P2 | pay X get N base spins w/ modifier (Agent #2 #37) |
| `paytable_evolve` | 🆕 P2 | stage-based paytable upgrade (Agent #2 #38) |
| `mission_engine` | 🆕 P2 | cross-session objectives (Agent #2 #47) |
| `tournament_hook` | 🆕 P2 | external score contribution (Agent #2 #46) |
| `grant_inbox` | 🆕 P2 | operator-awarded grants ingress (Agent #2 #49) |
| `net_position` | 🆕 P1 | UK net loss/win widget (Agent #2 #53) |
| `state_carry` | 🆕 P2 | JP pachislot bonus carry-over (Agent #2 #54) |

**Totals v2**: **47 capsules** (was 24). **Done**: 4. **Scaffolded**: 9. **Extract from monolit**: 11. **Net-new**: 23. **Planned subsume into existing**: 6 (see Agent #2 §2).

---

## 🔌 Capsule contract v2 (Agent #3 robustness)

```ts
export interface CapsuleV2 {
  manifest: CapsuleManifest;          // id, semver, deps, replaces, fallbacks
  schema: ZodSchema;                  // config validator
  goldens: GoldenCase[];              // bit-exact math + perceptual visual

  // Lifecycle (8 hooks, was 3)
  onMount?(ctx, deps): Disposable;    // L1
  onUnmount?(ctx): void;              // L1
  onPause?(reason): ResumeToken;      // L2
  onResume?(token): void;             // L2
  onBetChange?(prev, next): ConfigDelta; // L3
  onA11yToggle?(prev, next): void;    // L4
  onLocaleChange?(prev, next): void;  // L4
  onError?(err, phase): 'fatal'|'skip'|'retry';  // L5
  onSettings?(diff): void;            // L6
  onPersistRestore?(snap, ver): MigrationResult; // L8

  // Spin phases (split, was single onSpin)
  onPreSpin?(ctx): void;              // L7
  onEvaluate?(ctx): void;             // L7
  onPostSpin?(ctx): void;             // L7
  onPresent?(ctx): void;              // L7
}

export interface SpinContextV2 {
  grid: ReadOnlyGrid;
  payouts: Vec<PayoutEntry>;
  bus: TypedEventBus;                 // E6 — typed payloads
  clock: VirtualClock;                // T1 — replay-safe time
  rng: RngTree;                       // R1 — named sub-RNGs
  state: ScopedStateAPI;              // R5 — CRDT-style scoped writes
  triggered: Vec<TriggerEvent>;
  config: ObservableConfig;           // C1 — base ∘ server ∘ AB ∘ segment
  telemetry: TelemetryAPI;            // C2/O3 — span + metric + traceparent
  a11y: A11yState;                    // L4 — reducedMotion/highContrast/locale
  memBudget: MemBudgetEnforcer;       // O5 — WeakRef + FinalizationRegistry
}
```

**Strict rules** (Agent #3 §2-7):
- Bus order = `(tick, capsule_priority, emit_seq)` — frozen in manifest. Determinism gate (E1, E2, E5).
- Event names carry `@v` suffix → registered transformers handle version drift (E7).
- Slot ownership: manifest declares `exclusiveControl: 'reels'|'multiplier'` (P2, gap 2.7).
- Cycle detection mandatory; `breaker: capsuleId` directive resolves (P1).
- Two-tier goldens: `mathGolden` (bit-exact) + `visualGolden` (perceptual hash) (TS1).
- Crash isolation: each capsule in error-boundary; fail-soft, spin marked partial (O1).
- `slo: {p99Ms}` manifest field; CI regression-tests latency budget (O2).

---

## 🌊 Wave plan v2

> Sizing per `rule_realistic_time_estimates.md`: 4-atom wave = 15–30 min AI-paced.
> Full plan **v2** ≈ **9-12 h AI-paced** (was 3.5-5h pre-audit).

### 🌊 Phase A — GDD savršen (1 wave, 4 atoms, ~30 min)

| # | Atom | Deliverable | Gate |
|---|---|---|---|
| A.1 | Zod GDD schema v2 | `web/studio/src/gdd/schema.ts` — typed entries for all 47 capsules + HTML-comment heading anchors | zod-to-json-schema emits valid JSONSchema 2020-12 |
| A.2 | GDD markdown parser w/ NFC normalize | UTF-8 strip-BOM, LF, NFC, ASCII-quote on ingest (Agent #1 1.8) | 6 fixture GDDs round-trip MD↔Zod lossless via `gdd-mdx-lite` subset |
| A.3 | GDD → IR adapter — **fails-closed on unmapped feature** | pure deterministic transform, hard-error on unknown synonyms (P0 #6.1) | unmapped "Lightning Round" raises typed error w/ line/col |
| A.4 | GDD authoring panel + property fuzz | `fast-check` random MD → must parse or throw `GddParseError`, never panic (Agent #1 8.3) | E2E: malformed fixture → exact field path |

**Phase A acceptance**: 6 fixture GDDs (covering all 47 capsules) parse → IR → schema-validate. 0 LLM calls in critical path. Fuzz harness green.

---

### 🌊 Phase B — Capsule extraction from `runtime.js` monolit (3 waves)

#### B-wave-1 (4 atoms, ~30 min) — Reel + win presentation
| # | Atom | Gate |
|---|---|---|
| B1.1 | `reel_spin_profile` | bus event `reel:spin_start@v1`; deterministic timing |
| B1.2 | `win_lines` w/ sequencer | sequenceMs from IR; never all-at-once (Agent #1 4.6) |
| B1.3 | `big_win` w/ a11y | reduced-motion fallback (Agent #1 4.4) + auto-scale font (4.2) |
| B1.4 | `anticipation` per-reel curve | 2+ scatter triggers glow on remaining reels |

#### B-wave-2 (4 atoms, ~30 min) — Game-flow + transitions
| # | Atom | Gate |
|---|---|---|
| B2.1 | `base_game` extract | spin loop + line eval out of runtime.js core |
| B2.2 | Verify `free_spins` w/ stack-scoped state | FS-in-FS preserves outer ladder (Agent #1 2.4) |
| B2.3 | Verify `hold_and_win` w/ exclusive reel control | manifest `exclusiveControl: 'reels'` enforced (2.7) |
| B2.4 | `transitions` capsule (intro/outro) | epic-intro card + outro fade per Wrath shape |

#### B-wave-3 (4 atoms, ~30 min) — State/IO core
| # | Atom | Gate |
|---|---|---|
| B3.1 | `engine_api` w/ two-phase commit | stage debit, finalize on resolved outcome (P0 #3.1) |
| B3.2 | `session_state` w/ BroadcastChannel lock | second tab opens read-only (P0 #5.1) |
| B3.3 | `rng` xoshiro128\*\* + `fork('viz'/'math')` | TS↔Rust parity test pinned (P0 #8.1) |
| B3.4 | `hud` w/ Intl.NumberFormat | locale-aware currency (Agent #1 4.3) |

**Phase B acceptance**: `runtime.js` core ≤ 400 LOC orchestrator. Each capsule individually importable. Removing any optional capsule → playable still boots **AND DOM absence asserted** (Agent #1 8.2).

---

### 🌊 Phase C — Finish *(planned)* capsules + P0 new (3 waves)

#### C-wave-1 (4 atoms) — Symbol-behavior
| # | Atom | Gate |
|---|---|---|
| C1.1 | `expanding_wild` | reel column expands on land |
| C1.2 | `walking_wild` + directional/nudge | 4 directions, step-N config |
| C1.3 | `sticky_wild` w/ N-spin counter | persists across N spins |
| C1.4 | `mystery_symbol` + global-reveal mode | scope='cell' or 'all' |

#### C-wave-2 (4 atoms) — Bonus + variant capsules
| # | Atom | Gate |
|---|---|---|
| C2.1 | `cascade` w/ chain-mult composition | chain count badge |
| C2.2 | `bonus_pick` + `wheel_bonus` | pick-N-of-M + segmented wheel |
| C2.3 | `bonus_buy` w/ multi-tier ladder | region-gated, variant routing |
| C2.4 | `ways` + variable-ways (Megaways-shape) | per-spin ways recomputation |

#### C-wave-3 (4 atoms, NEW) — P0 missing mechanics
| # | Atom | Gate |
|---|---|---|
| C3.1 | `symbol_payload` (cash/mult/jackpot on symbol) | generic primitive subsumes 4 mechanics |
| C3.2 | `super_symbol` 2×2/3×3/4×4 colossal | grid occupancy semantics |
| C3.3 | `jackpot_tiers` (4-level + contribution) | persistence + audit trail |
| C3.4 | `win_cap` + auto-end feature | terminate animation @ cap |

**Phase C acceptance**: All 23 previously-planned + 8 new P0 capsules done.

---

### 🌊 Phase D — Template → game generator (1 wave, 4 atoms)

| # | Atom | Gate |
|---|---|---|
| D.1 | `gdd-to-game` CLI + `build.json` artifact | `{gddSha256, capsuleVersions, builtAt, builderVersion}` |
| D.2 | Inline-IR as `<script type="application/json">` | CSP-safe; runtime parses, never execs (P0 #7.6) |
| D.3 | Selective capsule bundling + static manifest | no dynamic resolution; bundle size scales (Agent #1 6.4) |
| D.4 | Studio "Build Game" button + sandboxed preview iframe | `sandbox="allow-scripts"`, no `allow-same-origin` (6.6) |

**Phase D acceptance**: Drop GDD → click Build → playable iframe with all declared features. Build is byte-identical for same input (RFC 8785).

---

### 🌊 Phase E — E2E golden path (2 waves)

#### E-wave-1 (4 atoms) — Golden fixtures + Playwright
| # | Atom | Gate |
|---|---|---|
| E.1 | Maximal GDD fixture (all 47 capsules) | builds + boots clean |
| E.2 | Minimal GDD fixture (base only) | builds + boots clean |
| E.3 | Playwright E2E spec | drag-drop → assert each feature DOM node |
| E.4 | Capsule isolation test + DOM absence | 47 boot tests; removal asserts DOM-clean + bus-listener-clean |

#### E-wave-2 (4 atoms, NEW) — Parity + replay
| # | Atom | Gate |
|---|---|---|
| E.5 | TS↔Rust RNG parity test | xoshiro128\*\* identical 1M sequences |
| E.6 | Canonical-JSON byte-determinism CI | SHA-256 of fixture output pinned |
| E.7 | Property fuzz on composer | random valid capsule subsets → determinism + SLO |
| E.8 | Mutation testing on adapter | mutmut on `gdd/to_ir.ts`; kill ≥ 95% |

**Phase E acceptance**: Both fixtures playable; parity green; byte-determinism enforced in CI.

---

### 🌊 Phase F — P0 hardening (Top-10 from Agent #1) (3 waves)

#### F-wave-1 (4 atoms) — Compose + lifecycle gates
| # | Atom | Gate |
|---|---|---|
| F.1 | Adapter fails-closed on unmapped feature | hard error w/ field path |
| F.2 | Compose-time DAG validator + retrigger cap ≤ 8 | cycle detection → composer error |
| F.3 | Two-phase wallet commit | stage→finalize; replay on boot if unfinalized |
| F.4 | Spin semaphore + 250ms keyboard repeat ignore | one-line guard, double-click safe |

#### F-wave-2 (4 atoms) — Regulator-driven defaults
| # | Atom | Gate |
|---|---|---|
| F.5 | Autoplay stop-on-`bonus:entered` default | UKGC §5/MGA compliant |
| F.6 | RFC 8785 canonical JSON serializer | byte-deterministic Build CI test |
| F.7 | BroadcastChannel multi-tab lock + corrupt-state archive | second-tab read-only banner |
| F.8 | Wallet credits @ `spin:settled` + reduced-motion | rollup is display-only |

#### F-wave-3 (4 atoms) — Browser/platform safety
| # | Atom | Gate |
|---|---|---|
| F.9 | Inline IR as `application/json` + file:// worker fallback | designer double-click works |
| F.10 | iOS Safari RAF fallback on `visibilityState=hidden` | snap-stop on hide |
| F.11 | Service Worker versioned cache per Build hash | no stale capsule serving |
| F.12 | UKGC 2500ms `spin_pace` capsule | region-gated min duration |

**Phase F acceptance**: All Top-10 P0 gaps closed. Pre-cert audit dry-run passes.

---

### 🌊 Phase G — P1 robustness (Agent #1 + #3 priorities) (3 waves)

#### G-wave-1 (4 atoms) — Replay + reproducibility
| # | Atom | Gate |
|---|---|---|
| G.1 | Named RNG forks (`viz`/`math`/`tween`) | viz fork doesn't perturb math seed |
| G.2 | Virtual clock + tween jitter seed | replay produces pixel-identical UI |
| G.3 | Per-capsule trace span + W3C traceparent | crash report carries capsule context |
| G.4 | IndexedDB ring buffer w/ quota recovery | `QuotaExceededError` → evict oldest |

#### G-wave-2 (4 atoms) — Capsule versioning + diamond deps
| # | Atom | Gate |
|---|---|---|
| G.5 | Manifest `requires:`, `replaces:`, `fallbacks:` | composer substitutes on miss |
| G.6 | Side-by-side `capsuleId@major` loading | diamond-dep resolution |
| G.7 | Event versioning `@v` suffix + transformers | semver bump doesn't break listeners |
| G.8 | Capsule `mathRevision: sha256` | math drift detection at bundle |

#### G-wave-3 (4 atoms) — Observability + telemetry
| # | Atom | Gate |
|---|---|---|
| G.9 | `slo: {p99Ms}` CI regression test | violation events ship to sink |
| G.10 | Memory budget enforcer (`WeakRef` + `FinalizationRegistry`) | long-session leak detected |
| G.11 | Capsule kill-switch via IR `disabledCapsules: []` | ops disables per-game without rebuild |
| G.12 | Telemetry diag channel `window.__MTL_DIAG__` | "Report Issue" exports snapshot |

**Phase G acceptance**: All P1 contract gaps closed. Long-session stress test green.

---

### 🌊 Phase H — P1 missing mechanics (P1 from Agent #2) (3 waves)

| Wave | Capsules |
|---|---|
| H-wave-1 | `chain_mult`, `persistent_meter`, `transform`, `symbol_upgrade` |
| H-wave-2 | `split_wild`, `replicator_wild`, `multi-tier FS menu`, `boosted_fs_variant` |
| H-wave-3 | `gamble`, `net_position`, `region_compliance` (UKGC+MGA+IT base) |

**Phase H acceptance**: 12 P1 mechanics implemented. Coverage matrix updated.

---

### 🌊 Phase I — Authoring DX + distribution (2 waves)

| Wave | Atoms |
|---|---|
| I-wave-1 | `capsule new <id>` CLI, `capsule preview <id>` Storybook-style, `capsule explain <gdd.md>` match graph, json-schema-to-ts codegen |
| I-wave-2 | Content-addressed `capsule-<sha256>.tar.zst`, Sigstore signing keyless, SBOM CycloneDX per capsule, signed `revoked.json` channel |

**Phase I acceptance**: Designer can author + preview a capsule in isolation; supply chain signed end-to-end.

---

### 🌊 Phase J — Futuristic vision (Phase II, deferred but tracked) (Kimi research)

| # | Future-tech | Why beats current | Tracking |
|:--:|---|---|---|
| J.1 | **Optimistic ZK fairness proofs per-spin** | ms-level proof gen (was 30s); regulator coexistence | Pilot post-Phase I |
| J.2 | **Formally-verified ECS kernel (Bevy/Flecs + Kani/Verus)** | bit-identical replay across server/browser; proofs of RTP invariants | Math wave gate |
| J.3 | **WASM Component Model + WASI 0.3** plugin capsules | kernel-grade sandbox vs iframe; CRA SBOM Dec 2027 | Phase II |
| J.4 | **Domain-tuned 7B GDD→IR LLM** behind eval gate | 4.8/5 score on GDD parse; gate kills bad gen | Phase II (LoRA train) |
| J.5 | **Signed hot-reload delta bundles** | live-ops in hours not months while audit-trail preserved | Phase II |
| J.6 | **WebGPU compute-native renderer** | 10× particle perf vs WebGL; 45%+ browser support 2024 | Phase II swap |
| J.7 | **Audio-native a11y mechanics** | opens blind/low-vision player market (RNIB/IGDA) | Phase II UX |
| J.8 | **Optimistic ZK + GLI dual-track audit** | crypto proofs alongside lab certificates | Phase II partnership |

**Phase J acceptance**: 2027 horizon — at least 3 of 8 ideas piloted in green-field game by Q2 2027.

---

## ❌ Out of scope (defer until Phase F+)

| Item | Where it goes |
|---|---|
| Math (PAR, MC, RTP gates, closed-form solvers) | Existing `SLOT_ENGINE_MASTER_TODO.md` |
| Art / skin / sprites / sound | Phase F-asset (separate track) |
| RGS backend (Fastify, audit, session) | Phase G-backend |
| Audio | Last, per Wrath `CLAUDE.md` rule |
| Regulator dossier | Phase H-dossier |

---

## ✅ Global acceptance (v2 — whole plan)

A non-tech designer drops a GDD markdown on Studio, clicks **Build**, and:
1. GDD parses 100% (Zod errors surface inline w/ line:col, **never silent fail**).
2. Generated game **boots in browser** with every declared feature visible.
3. **Mechanically matches Wrath shape**: spin profile, anticipation, big-win count-up, FS intro/HUD/outro, H&W locked-orb + reveal, multiplier strip, retrigger.
4. Each feature toggleable independently in GDD; removal asserts DOM + bus clean (capsule isolation).
5. **0 LLM calls** in critical path. **0 hardcoded vendor strings** (`rule_no_vendor_mentions`).
6. Build is **byte-deterministic** for same GDD input (RFC 8785).
7. Multi-tab + tab-close + refresh + autoplay-thru-bonus all safe (P0 hardening).
8. **TS↔Rust RNG parity** test green (xoshiro128\*\*).
9. **Reduced-motion + locale + ARIA live** for accessibility cert.
10. **Two-tier goldens** (math bit-exact + visual perceptual) all green.

---

## 📋 Status board v2

| Phase | Waves | Atoms | Status |
|---|---|---|---|
| A — GDD savršen | 1 | 4 | ⬜ |
| B — Capsule extraction | 3 | 12 | ⬜ |
| C — Finish planned + P0 new | 3 | 12 | ⬜ |
| D — Template → game | 1 | 4 | ⬜ |
| E — E2E golden + parity | 2 | 8 | ⬜ |
| F — P0 hardening (Top-10) | 3 | 12 | ⬜ |
| G — P1 robustness | 3 | 12 | ⬜ |
| H — P1 missing mechanics | 3 | 12 | ⬜ |
| I — Authoring DX + distribution | 2 | 8 | ⬜ |
| J — Futuristic (Phase II horizon) | — | 8 ideas tracked | 📍 deferred |
| **TOTAL Phase I (A-I)** | **21** | **84 atoms** | **0 / 84** |

**Estimated total Phase A-I**: ~9-12 h AI-paced. Phase J = Q2 2027 horizon (post green-field game).

---

## 🔗 Research provenance

| Source | What it contributed | Where it lives |
|---|---|---|
| Agent #1 (adversarial gap audit) | 60+ failure modes, Top-10 P0 list | Phases F, partial G |
| Agent #2 (slot mechanic taxonomy) | 55 missing mechanics, P0/P1/P2 tiers | Tier C/D/E new capsules, Phase H |
| Agent #3 (capsule contract robustness) | 70+ contract gaps, blast-radius matrix | Capsule Contract v2, Phases G, I |
| Kimi deep research (2025-2027) | 6 future-tech directions (ZK, ECS, WASM, LLM, Sigstore, WebGPU) | Phase J vision |

---

*Math wave gate*: All of Phase A-G + at least 80% of Phase H must be green before any math (PAR/MC/RTP) work resumes. Math lives in `SLOT_ENGINE_MASTER_TODO.md`, NOT here.

---

## 🔥 Hot-patches (cross-cutting, outside wave structure)

| Date | Hot-patch | Trigger | Files touched | Validation |
|---|---|---|---|---|
| **2026-06-07** | **Studio simulator — industry-realistic tier weights + reel-gated SCATTER + canonical-IR aware distribution** | Boki regression on `huff-puff.md`: *"nije ocitao sve parametre, nije bilo ni pola simbola. sve je nekako podeseno da se padaju sketeri."* | `web/studio/app.js` (`renderPlayGrid` + new `_drawCellSymbol` reel-gated weighted draw + rewritten `_computePlayDistFromIR` for the canonical IR shape + `buildSymbolPoolFor` tier weight table); `web/studio/src/gdd-parser.ts` (`gddToIR` weight_hint ladder); `web/studio/tests/gdd-parser.test.ts` (4 regression asserts on huff-puff fixture) | 23/23 vitest gdd-parser (4 new), 541 passed overall (0 regression vs pre-fix baseline 537), node-side 5 000-spin probe → P(3+ scatter)=**1.0%**, LP=50% / MP=30% / HP=15% / SCATTER=3% / WILD=2.5%, every symbol spawns. Template-wide (LEGO rule), zero game-specific branches. |

