# SLOT-MATH-ENGINE — MASTER TODO (Ultimate Edition)

> Strogo izvedeno iz `SLOT_ENGINE_ULTIMATE_SCENARIOS.md`.
> Format: **fazni** (sve P0 pre P1 itd.), unutar faze **paralelizibilno** koliko god moguće.
> Acceptance kriterij za svaku stavku je **konkretan i merljiv**.

Legenda:
- ✅ uradjeno
- ⚠️ delimično / stub
- ❌ nije počelo
- 🔥 P0 (mora pre univerzalnosti)
- 🟡 P1 (mora pre "production-grade-universal")
- 🟢 P2 (završetak)
- 🔵 P3 (futuristic)

---

## FAZA 0 — Pripreme i temelji *(1-2 nedelje)*

### 0.1 Repo & infra
- ❌ Postaviti **CI matrix**: `linux-x64`, `macos-arm64`, `macos-x64`, `windows-x64` — bit-identičan RTP iz istih seed-ova.
- ❌ Dodati `cargo bench` + `vitest bench` regresione grafove (criterion.rs + reporter).
- ❌ `cargo-fuzz` setup za config parser + grid evaluator.
- ❌ Pre-commit: `cargo clippy -W clippy::pedantic`, `tsc --noEmit`, `cargo test`, `vitest run` (sve mora proći).
- ❌ Renovate / dependabot za `decimal.js`, `rust_decimal`, `rayon`, `proptest`.

### 0.2 Dokumentacija temelj
- ❌ `docs/architecture.md` — diagram protoka spin-a (TS i Rust).
- ❌ `docs/rng.md` — formalna definicija svakog RNG-a + state-machine.
- ❌ `docs/precision.md` — gde koristimo f64, bigint, Decimal i zašto.
- ❌ `docs/glossary.md` — reel set, way, line, pay, scatter, trigger, retrigger, cascade…

### 0.3 Reference materijal (sakupiti i indeksirati)
- ❌ PAR sheet-ovi za 20 reference igara iz `SLOT_ENGINE_ULTIMATE_SCENARIOS.md §8` (legalne javne objave + reverse-engineered iz literature).
- ❌ GLI-11 / GLI-19 čitanje + checklist `docs/compliance.md`.
- ❌ Reading list: Markov chain RTP papers (link u `docs/research.md`).

---

## FAZA 1 — Config-as-IR (univerzalni temelj) 🔥 *(2-3 nedelje)*

### 1.1 Game IR (Intermediate Representation)
- ❌ **Definisati IR schema** (Zod + Rust serde) sa sledećim node tipovima:
  - `Reel` (variable height per index)
  - `ReelSet` (collection, with switching rules)
  - `Grid` (W×H, variable per state)
  - `Symbol` (arbitrary id, behaviors[])
  - `SymbolBehavior` (wild, scatter, multiplier, mystery, expanding, sticky, walking, split, mega, collect, prize, jackpot…)
  - `WinEvaluator` (lines / ways / megaways / cluster / pattern / payAnywhere / payAdjacent)
  - `Feature` (freeSpins, holdAndWin, cascade, respin, pick, wheel, gamble, buy)
  - `JackpotTier` (fixed, mystery, mustHitBy, progressive, multiTier)
  - `Effect` (multiplier_add, multiplier_mul, transform, expand_reel, collect, lock, unlock, trigger_feature)
- ❌ **IR validator** (statički — pre simulacije): unreachable features, cycle overflow, unreachable paytable entries.
- ❌ **IR → TS evaluator** kodgen (or interpreter).
- ❌ **IR → Rust evaluator** kodgen (or interpreter, ali interp je dosta sporiji za hot path).
- ❌ Migracija postojeće Wrath of Olympus igre na IR.
- ❌ **Acceptance:** isti RTP pre/posle migracije (±0.001% na 10⁹ spins).

### 1.2 Arbitrary symbol set
- ❌ Ukloniti hardcoded enum `SymbolId` u TS i Rust.
- ❌ Symbol = `{ id: string, paytable: number[], behaviors: SymbolBehavior[] }`.
- ❌ Reel strip postaje `string[]` ili `u16[]` sa lookup tabelom.
- ❌ Acceptance: postojeća igra radi sa simbolima preimenovanim u Bog-zna-šta.

### 1.3 Generic grid topology
- ❌ Grid: `width × height_per_reel[]` (asymmetric).
- ❌ Dinamička visina (Megaways): `randomHeightDistribution` po reel-u.
- ❌ Grid resize između spinova (expanding reels).
- ❌ Acceptance: 3-4-5-4-3 igra prolazi, "Megaways stub" config prolazi MC.

---

## FAZA 2 — Win evaluator univerzalan 🔥 *(2 nedelje)*

### 2.1 Lines evaluator (refactor)
- ❌ Generalizovati za N reels × variable height.
- ❌ Levo→desno + desno→levo (both-ways) flag.
- ❌ Multiplier-on-line podrška.
- ❌ Wild u srednjoj poziciji **mora** doprineti najvišem payout-u (industry standard).
- ❌ Acceptance: Starburst-like config daje očekivan RTP iz literature.

### 2.2 Ways evaluator
- ❌ `waysCount = Π(symbolsPerReel[i])` za određeni simbol.
- ❌ Wild count by reel.
- ❌ Megaways: dynamic per-reel symbol count (2-7), top horizontal reel kao 6-th za visual.
- ❌ Bitmask short-circuit (ako reel nema simbol → ways = 0 odmah).
- ❌ Acceptance: 1024 ways igra → analitički = simulirani RTP (±0.01%).

### 2.3 Cluster evaluator
- ❌ Union-Find sa preallocated arena.
- ❌ Adjacency: 4-conn ili 8-conn (config-driven).
- ❌ Min cluster size (config).
- ❌ Cluster value: paytable[cluster_size].
- ❌ Acceptance: Sweet Bonanza-like RTP iz published PAR sheet (±0.05% na 10⁹).

### 2.4 Pattern evaluator
- ❌ Pattern lista: `Pattern = { positions: [[r,c], ...], minMatches }`.
- ❌ Acceptance: 2 different pattern game konfiguracije prolaze tests.

### 2.5 Pay-anywhere / pay-adjacent
- ❌ Already partially done — generalizovati za bilo koji simbol, ne samo scatter.

---

## FAZA 3 — Symbol behavior plugin layer 🔥 *(2-3 nedelje)*

### 3.1 Behavior interface
- ❌ `interface SymbolBehavior { onLand(ctx, pos): Effect[]; onWin(ctx, pos): Effect[]; onCascade(ctx, pos): Effect[]; }`
- ❌ Effect pipeline: `applyEffects(effects, state) → newState`.
- ❌ Rust mirror sa istom semantikom (`trait Behavior`).

### 3.2 Behaviors (svaki je svoj fajl + svoj test)
- ❌ `WildBehavior` (substitute, sa optional exclusion list).
- ❌ `ExpandingWildBehavior` — reel popunjavanje pri landing-u.
- ❌ `StickyWildBehavior` — config: persistOver (spin / cascade / feature).
- ❌ `WalkingWildBehavior` — pomera se za N po spinu.
- ❌ `WildMultiplierBehavior` — nosi mult value.
- ❌ `WanderingWildBehavior` — random reposition.
- ❌ `WildReelBehavior` — ceo reel = wild.
- ❌ `ScatterPayBehavior` (postoji ✅, refaktorisati u plugin).
- ❌ `ScatterTriggerBehavior` (postoji ✅).
- ❌ `MysterySymbolBehavior` — reveal weighted.
- ❌ `CoinValueBehavior` — H&W coin (postoji ✅, refaktor).
- ❌ `JackpotSymbolBehavior` — direkt jackpot trigger.
- ❌ `MultiplierSymbolBehavior` — global mult add/mul.
- ❌ `CollectBehavior` — sakupi sve coin vrednosti.
- ❌ `UpgradeBehavior` — unapredi all-of-symbol na grid-u.
- ❌ `SplitBehavior` — 2-in-1 pozicija.
- ❌ `MegaSymbolBehavior` — 2×2 / 3×3 colossal.
- ❌ `PrizeBehavior` — cash-on-reel.
- ❌ `TransformBehavior` — config-rule transformacija.
- ❌ Svaki behavior ima **unit test** (golden grid → expected effects).
- ❌ Acceptance: kompoziciono — `expanding wild + multiplier wild` daje očekivan win.

---

## FAZA 4 — Feature framework 🔥 *(3 nedelje)*

### 4.1 Feature state machine
- ❌ FSM definisan u IR: `currentState → triggerEvent → nextState`.
- ❌ Stacking: feature mogu biti nested (FS u H&W u FS), max depth config.
- ❌ Re-entry guards.

### 4.2 Free Spins (full)
- ⚠️ Already done basic — refaktorisati u FSM.
- ❌ Sub-features: globalni mult (✅), retrigger (✅), expanding mult (Sweet Bonanza), sticky wilds, extra reels, persistent state.
- ❌ Acceptance: 5 različitih FS konfiguracija (basic, mult, retrigger, sticky, expanding) — RTP match.

### 4.3 Hold & Win (full)
- ⚠️ Already done basic.
- ❌ Sub-features: tier progression, reset-on-no-new, collect, must-hit-by.
- ❌ Acceptance: Wolf Gold + Lightning Link-like konfiguracije.

### 4.4 Cascade orchestrator (proper)
- ❌ Replace stub sa pravom implementacijom:
  - while (winsExist) { evaluate → mark wins → remove → drop new → multiplier++ if config }.
  - Cycle detector (max cascade depth cap).
  - Per-cascade reel set (different strip after cascade).
- ❌ Acceptance: Bonanza-style Megaways+cascade igra.

### 4.5 Respin
- ❌ Single respin trigger.
- ❌ Sticky respin (until no new) — used in Hold & Win često.
- ❌ Walking-wild respin.

### 4.6 Pick / Wheel / Mini-game
- ❌ Wheel: weighted spin → single index → payout.
- ❌ Pick: N options, weighted reveals, with "ends" rules (lose/collect/multiplier-up).
- ❌ Acceptance: Mega Moolah-style wheel + 88 Fortunes pick game.

### 4.7 Buy feature (Feature Buy)
- ❌ Engine zna: za bet × N → direktan ulazak u feature → izračunata teoretska EV.
- ❌ Validacija: BuyPrice × RTP_when_bought = expected return (sanity check).

### 4.8 Ante bet / Bet boost
- ❌ Multi-mode bet → različite probability tablice po mode-u.

### 4.9 Gamble / Side bet
- ❌ Gamble: double-or-nothing math (simple) + ladder variant.
- ❌ Side bet: orthogonal RTP, doesn't affect main game.

---

## FAZA 5 — Jackpot manager 🟡 *(2 nedelje)*

- ❌ Fixed jackpot — paying out fixed amount on trigger.
- ❌ Mystery progressive — random trigger u opsegu [min, max].
- ❌ Must-hit-by — guaranteed hit pre `cap` vrednosti.
- ❌ Multi-tier (Mini/Minor/Major/Grand/Mega) — weighted hit per tier.
- ❌ Standalone progressive — seed + contribution rate.
- ❌ Lightning Link / Cash Connection — coins+tier kombinovan.
- ❌ Pots of Gold — wheel pick + pot mechanics.
- ❌ Contribution math: `wager × rate → pool`.
- ❌ Acceptance: Mega Moolah-konfiguracija → 4-tier RTP raspodela.

---

## FAZA 6 — Closed-form RTP (analitički prvo, MC drugo) 🔥 *(3-4 nedelje)*

### 6.1 Base lines analytical
- ❌ Enumeracija svih (reel_pos × ...) kombinacija za male igre (< 10¹²).
- ❌ Probability po simbolu po reel-u → multinomial.
- ❌ Wild substitution kombinatorika.
- ❌ Cross-validate sa MC: razlika < epsilon.

### 6.2 Scatter pay analytical
- ❌ Multinomial za fixed scatter count.
- ❌ Cross-validate.

### 6.3 FS analytical
- ❌ Markov chain: state = (FS_remaining, multiplier_level).
- ❌ Retrigger: geometric expectation.
- ❌ Steady state RTP per FS spin × P(trigger).
- ❌ Cross-validate.

### 6.4 H&W analytical
- ❌ Semi-analytical: trigger probability × E[coin_value | trigger] × E[respins].

### 6.5 Cascade analytical
- ❌ Markov chain (state = grid composition) — feasible samo za male grid-ove.
- ❌ Fallback na MC za velike.

### 6.6 Megaways
- ❌ Eksplicitno **bez closed-form** — MC + exhaustive small-instance validation.

### 6.7 Engine API
- ❌ `engine.theoreticalRTP(config) → { value: Decimal, decomposition: {base, scatter, fs, hw, jackpot, cascade}, method: 'analytical' | 'mc' | 'hybrid' }`.
- ❌ CLI: `slot-sim rtp --config game.json` → instant rezultat.

---

## FAZA 7 — RNG hardening 🔥 *(1-2 nedelje)*

### 7.1 RNG plugin layer
- ❌ `RNG` trait/interface — bilo koji backend.
- ❌ Backend-i: Mulberry32 (legacy), PCG-64 (default), Xoshiro256**, Philox-4 (GPU ready).
- ❌ Counter-based RNG za GPU.
- ❌ Splittable RNG za paralelne workers.

### 7.2 Statistical certification
- ❌ **TestU01 BigCrush** run + report u repo (`tests/rng-bigcrush.md`).
- ❌ **NIST SP800-22** suite + report.
- ❌ **PractRand** do 1TB.
- ❌ Acceptance: PCG-64 i Xoshiro256** pass BigCrush.

### 7.3 Cross-platform determinism
- ❌ CI test: same seed → same first 1M outputs na linux-x64, macos-arm64, windows-x64.
- ❌ Bitwise reproducibility test (samo integer state, ne f64 derivative).

### 7.4 Anti-bias
- ❌ Rejection sampling za `randInt(max)` umesto modulo.
- ❌ Acceptance: chi-squared test pass za sve sample sizes.

---

## FAZA 8 — Statistics & PAR 🟡 *(2 nedelje)*

### 8.1 Streaming statistike
- ⚠️ Mean, variance (Welford) — verifikovati Kahan compensation.
- ❌ Skewness, kurtosis (online formulas).
- ❌ Coefficient of variation.
- ❌ **Volatility Index** (GLI formula).
- ❌ P50, P90, P99, P99.9 quantiles (t-digest ili HDR).

### 8.2 Win distribution
- ⚠️ Histogram (Rust ima — TS dodati).
- ❌ Adaptive bucket sizing (log-scale za high volatility).
- ❌ CDF export.
- ❌ Top-N largest wins capture (with seed za reprodukciju).

### 8.3 Confidence intervals
- ❌ 95% / 99% / 99.9% CI za RTP.
- ❌ Required spin count za N significant digits.
- ❌ Convergence detector (auto-stop kad CI stabilizovan).

### 8.4 Feature contribution
- ⚠️ Base/FS/HW/jackpot breakdown (delimično).
- ❌ Bonus frequency, bonus-to-bonus distance distribution.
- ❌ Max win frequency, max-win expected hit count per N spins.

### 8.5 PAR sheet generator
- ❌ `tools/par-gen` CLI → reads config + MC result → outputs PDF.
- ❌ Polja: RTP, hold, hit freq, vol index, bonus freq/contrib, max win, symbol weights, cycle length.
- ❌ GLI-compliant format option.

---

## FAZA 9 — Speed: rušimo zid 🔥 *(3-4 nedelje)*

### 9.1 SIMD evaluator (Rust)
- ❌ `std::simd` ili `wide` crate.
- ❌ Lines eval u SIMD: 4-16 paylines paralelno (AVX-512) ili 4 (NEON).
- ❌ Acceptance: 3-5× speedup vs scalar.

### 9.2 Bitpacked grid
- ❌ u128 = 5×5×5-bit grid (ako ima ≤32 simbola).
- ❌ Line eval pomoću bitmask ops.
- ❌ Acceptance: cache miss-rate značajno niži, 2× ukupni speed.

### 9.3 Arena allocator
- ❌ `bumpalo` ili custom arena za per-spin allocations.
- ❌ Acceptance: heap allocs po spinu = 0 u steady state.

### 9.4 Hot/cold struct layout
- ❌ Razdvojiti `SpinState` u hot (RNG, win acc) + cold (debug, history).
- ❌ Repr: `#[repr(C, align(64))]` za cache line.

### 9.5 PGO + BOLT
- ❌ CI build pipeline: 1) instrument build, 2) run benchmark, 3) optimized build, 4) BOLT.
- ❌ Acceptance: +20% throughput.

### 9.6 GPU backend (Metal — dev mašina; CUDA — provider preuzima)
- ❌ Rust + `wgpu` ili native Metal shader.
- ❌ Philox RNG kernel.
- ❌ Per-thread = per-spin.
- ❌ Constraint: paytable + reel strips u shared mem.
- ❌ Acceptance: 50-500× CPU za 5×3 lines igru.

### 9.7 Bench harness
- ❌ `cargo bench` sa criterion (already setup base).
- ❌ Reported metrics: spins/sec, ns/spin, allocs/spin, L1 miss rate.
- ❌ Regression detection u CI (fail ako > 5% slower).

---

## FAZA 10 — Testing fortress 🔥 *(paralelno sa fazama 1-9, finalizacija 2 nedelje)*

### 10.1 Property-based
- ❌ Rust: `proptest` — invariants: 0 ≤ RTP ≤ maxPayout, no NaN, no panic.
- ❌ TS: `fast-check` — isti invariants.
- ❌ Acceptance: 1000+ random configs → 0 crash.

### 10.2 Fuzzing
- ❌ `cargo-fuzz` na config parser.
- ❌ `cargo-fuzz` na grid evaluator (random grid → never panic).
- ❌ 24h fuzz run u CI weekly.

### 10.3 Differential TS↔Rust
- ❌ Test harness: isti seed → first N spins → identičan win amount po spinu.
- ❌ Acceptance: 10M spins, 100% bit-match (za games sa f64-bezbednom matematikom).

### 10.4 Known-answer tests (KAT)
- ❌ 20 reference igara (vidi `SLOT_ENGINE_ULTIMATE_SCENARIOS.md §8`).
- ❌ Acceptance: RTP iz published PAR sheet ±0.05% na 10⁹ spins.

### 10.5 Regression suite
- ❌ Golden hashes svake reference igre (RTP, hit-freq, vol, max-win freq).
- ❌ CI fail na drift > 0.005%.

### 10.6 Adversarial tests
- ❌ Malicious config: 10¹⁸ cycle count → reject sa clear error.
- ❌ Cyclic feature trigger → detect i abort.
- ❌ Reel strip sa svim wild-ovima → graceful behavior.

---

## FAZA 11 — Tooling i UX 🟡 *(3-4 nedelje, paralelno)*

### 11.1 Config builder UI (web)
- ❌ Vite + React drag-drop slot designer.
- ❌ Live preview spin.
- ❌ Live theoretical RTP.
- ❌ Export JSON config.
- ❌ Import javnih PAR sheet-ova kao starting point.

### 11.2 Reel strip optimizer
- ❌ Input: target RTP, target vol, hit freq, max win.
- ❌ Output: reel weights (genetic algorithm + analytical seeding).
- ❌ Acceptance: optimizer može da reprodukuje 5/20 reference reel sets-ova iz scratch.

### 11.3 Dashboard
- ❌ Real-time RTP graph tokom MC.
- ❌ Confidence interval band.
- ❌ Histogram live update.
- ❌ Cancel/resume sa preserved state.

### 11.4 Cert reports
- ❌ Auto-generate GLI report PDF iz IR + MC.
- ❌ Auto-generate market-specific compliance check (UK/MT/IT/NL/PT).

### 11.5 Import / export
- ❌ Reader za hypothetical drugih dijalekata (Playtech-like, generic SAS).
- ❌ JSON Schema export.

---

## FAZA 12 — Univerzalnost: 20 reference igara 🔥 *(4 nedelje)*

Za **svaku** od sledećih igara: config (IR JSON) + RTP test (KAT) + PAR sheet generacija + svi feature-i prolaze:

- ❌ Starburst
- ❌ Cleopatra
- ❌ Sweet Bonanza
- ❌ Gates of Olympus
- ❌ Big Bass Bonanza
- ❌ Bonanza (Megaways)
- ❌ Book of Dead
- ❌ Wolf Gold
- ❌ Money Train 3
- ❌ Reactoonz
- ❌ Dead or Alive 2
- ❌ Mega Moolah
- ❌ Mega Joker
- ❌ Lightning Link
- ❌ Dragon Link
- ❌ Buffalo Stampede
- ❌ Cash Connection
- ❌ 88 Fortunes
- ❌ Aviator-like (corner case)
- ❌ Fishin' Frenzy Megaways

**Acceptance:** svih 20 prolaze KAT, MC RTP match-uje publikovani PAR sheet ±0.05%, simulator >50M spins/sec na najvećoj (Megaways), >500M/sec na najmanjoj.

---

## FAZA 13 — Futuristic 🔵 *(opciono, kontinualno)*

- ❌ Auto-tuner (genetic / Bayesian) za reel weight design.
- ❌ Player behavior simulator (session length, RTP perceived, churn).
- ❌ ML anti-fraud signature detector.
- ❌ zk-SNARK proof layer (provable-fair za crypto).
- ❌ Live hash-chained spin log + online RTP monitor.
- ❌ A/B math testing framework.
- ❌ Quantum RNG entropy bridge (off-the-shelf QRNG service).
- ❌ Distributed simulation grid (1T spins/sec aggregate).
- ❌ Provider-format converters (Microgaming, Playtech, NetEnt dialect imports).
- ❌ Cross-game wallet math (multi-game progresivi).
- ❌ "Universal Slot IR" javni standard prijavljen GLI/eCOGRA-i kao reference.

---

## TEHNIČKI DUG (registar — popraviti uz odgovarajuće faze)

- ❌ Hardkodovan `SymbolId` enum (faza 1.2).
- ❌ Hardkodovan `NUM_REELS=5` / `NUM_ROWS=3` (faza 1.3).
- ❌ TS `BASE_REELS` / `FREE_SPINS_REELS` kao TS const (faza 1.1).
- ❌ Mulberry32 jedini RNG (faza 7.1).
- ❌ TS i Rust evaluatori divergirajuće implementacije (faza 1.1 — IR → kodgen unifikuje).
- ❌ Cascade stub u oba (faza 4.4).
- ❌ JSON parse svaki run (parse once, share Arc — faza 9.3).
- ❌ Test coverage neujednačen (faza 10).

---

## NEMERLJIVI KRITERIJUMI USPEHA

1. **Univerzalnost:** "može li config-only da implementira igru X?" — DA za sve postojeće mehanike.
2. **Tačnost:** RTP matuje teoretski sa ±0.001% na 10⁹ spins; PAR sheet match-uje literaturu ±0.05%.
3. **Brzina:** ≥ 500M spins/sec za 5×3 lines na M-series single chip; ≥ 50M za Megaways; GPU ≥ 50× CPU.
4. **Deterministički:** isti config + seed → identičan rezultat kroz TS, Rust, GPU (uz dokumentovane f64 boundary).
5. **Certifiable:** RNG prolazi BigCrush, NIST, PractRand. Engine generiše GLI-spreman PAR.
6. **Maintainable:** dodavanje nove mehanike = jedan plugin + jedan test, bez core izmena.

---

## DELIVERABLE TIMELINE (orijentaciono, full-time rad)

| Mesec | Faze | Stanje |
|---|---|---|
| **M1** | 0 + 1 (config IR) | univerzalni temelj |
| **M2** | 2 + 3 (evaluators + behaviors) | sve mehanike kao plugin |
| **M3** | 4 + 5 (features + jackpots) | feature parity sa industrijom |
| **M4** | 6 + 7 (closed-form RTP + RNG hardening) | bulletproof matematika |
| **M5** | 8 + 9 (stats + speed) | najbrži ikada |
| **M6** | 10 (testing fortress) | regression-safe |
| **M7** | 11 + 12 (tooling + 20 reference igara) | DONE-UNIVERSAL |
| **M8+** | 13 | futuristic kontinualno |

---

## NEXT IMMEDIATE STEPS (ovaj tjedan)

1. Pročitati i validirati `SLOT_ENGINE_ULTIMATE_SCENARIOS.md` — usaglasiti prioritete.
2. Pokrenuti **FAZA 0.1** (CI matrix, pre-commit, cargo-fuzz setup).
3. Skicirati IR schema (faza 1.1) — početak u `src/ir/schema.ts` i `rust-sim/src/ir/mod.rs`.
4. Skupiti PAR sheet-ove za prvih 5 reference igara (Starburst, Cleopatra, Sweet Bonanza, Wolf Gold, Mega Moolah).
5. Odlučiti: nastavljamo `Wrath of Olympus` kao "demo igra" ili engine ide u zasebnu repo kao library?
