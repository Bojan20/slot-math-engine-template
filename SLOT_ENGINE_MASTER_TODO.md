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

## STATE SNAPSHOT (overeno protiv git history-ja `477423b`, izvora i fixture-a — 2026-05-12)

**Ukupno: ~67% kompletno na kodu, ~30% kompletno na "acceptance proof"-u.**

Šta to znači u praksi:
- **Kod i moduli** za faze 0.1, 1.x, 2.x, 3.x, 4.x, 5, 5.5, 6, 6.7, 7, 7.5, 8, 8.5, 8.6, 9.1-9.4, 9.6-9.9, 10.1-10.7, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 12 (mehanike), 13.1, 13.2, 13.3, 13.4, 13.5, 13.7, 13.9, 13.10, 14.1, 14.2 **postoje i commit-ovani**.
- **Tehnički dug** je još otvoren: `SymbolId` enum + `NUM_REELS=5` / `NUM_ROWS=3` legacy konstante i dalje žive u `src/config/` i `src/model/` paralelno sa IR-om.
- **Nije commit-ovano:** windows-x64 CI grana, vitest bench, Renovate/Dependabot, 4 dokumenta (`architecture.md`, `rng.md`, `precision.md`, `glossary.md`, `compliance.md`, `research.md`), PAR sheet sakupljanje za reference igre, TestU01/NIST/PractRand izveštaji, PGO+BOLT pipeline, 11.1 web Config Builder UI, 13.6 cross-game wallet, 13.8 cross-game wallet, 13.11-13.18 futuristic, 14.3-14.8 strategic post-Multi-tier-jackpot family.
- **30 mechanic classes:** faza 12 commit-ovana kao **acid test mehanika** (sve fixture klase pokrivene preko `tests/fixtures/reference/*.json`). Sve fixture su **synthetic generic** — nijedan ne referencira komercijalnu igru ili vendor (template-safe).

Mapa "commit → faza":

| Commit | Faza |
|---|---|
| `833c040` | 0.1 (CI) + 1.1 (IR schema TS+Rust) |
| `01db154` | 1.2 + 1.3 (IR→GameConfig adapter, dynamic grid) |
| `20f83e2` | 2 (IR-native evaluator dispatch + Rust variable-rows ways) |
| `e74597d` | 3 (Symbol Behavior plugin layer) |
| `0405cb5` | 3 (feature framework: FS, H&W, Cascade, Buy/Ante) |
| `c06f23e` | 3b (simulator wiring + 6 feature simulators) |
| `4f93ab4` | 4 + 5 (HDR histogram, GLI-16 PAR, jackpot manager) |
| `62085b5` | 5.5 (jackpot 2PC, partition handling) |
| `00c4aac` | 6 (closed-form RTP — H&W Markov DP, FS geom, cascade EV) |
| `eb11cd4` | 6.7 (sensitivity + inverse RTP solver + auto-tuner) |
| `64719f0` | 7 (PCG-64, Xoshiro256**, Philox4x32, rejection sampling) |
| `068a5dd` | 7.5 (ChaCha20 + commit-reveal) |
| `f0e8a69` | 8 (Welford 4-moment, HDR quantiles, CDF, top-N, convergence) |
| `3bcf216` | 8.5 (spin recall — hash-chained NDJSON + replay) |
| `9666bff` | 8.6 (G2S, SAS, GAT-IV adapters) |
| `c618101` | 9 (Walker's Alias, PackedGrid u128, ZeroAllocEvaluator, SIMD u8x16, hot/cold) |
| `f62fa8b` | 9.8 (bulk dispatcher + cluster + GPU scaffold) |
| `69bdf08` | 9.8b (SIMD f32x8 + WGSL + TCP cluster) |
| `477423b` | 9.9 (NUMA-aware + mmap reel strips) |
| `8e62281` | 10 (proptest, KAT, adversarial, cargo-fuzz) |
| `73599dc` | 10.7 (mutation testing — Stryker + cargo-mutants) |
| `62ff81f` | 11.2 (reel strip optimizer) |
| `b24821a` | 11.6 (spin recall/replay CLI viewer) |
| `ad0a4a4` | 11.7 (observability dashboard) |
| `f619f93` | 11.8 (RG/AML hooks) |
| `b49584a` | 11.9 (jurisdiction adapter — 8 markets) |
| `ecf29a5` | 12 (30 reference games acid test — mehanike) |
| `6f6b59d` | 13.1 (GA auto-tuner) |
| `7e257fc` | 13.2 (player behavior simulator) |
| `32cd245` | 13.3 (anti-fraud ML) |
| `71d9401` | 13.4 + 13.10 (zk-SNARK scaffold + predictive convergence ML) |
| `dd37fc2` | 13.5 (QRNG bridge) |
| `692eb2c` | 13.7 (format converters — MG/PT/NE → USIF) |
| `e9121b2` | 13.9 (USIF v1.0 schema) |
| `0ee98b0` | 14.1 (analytical memoization — exhaustive enumeration) |
| `4d7fe47` | 14.2 (continuous certification — daily hash-chain reports) |

---

## FAZA 0 — Pripreme i temelji *(1-2 nedelje)*

### 0.1 Repo & infra
- ✅ Postaviti **CI matrix**: `linux-x64`, `macos-arm64`, `macos-x64`, `windows-x64` — bit-identičan RTP iz istih seed-ova. *(svi 4 OS-a sad u `.github/workflows/ci.yml` za TS+Rust)*
- ⚠️ Dodati `cargo bench` + `vitest bench` regresione grafove (criterion.rs + reporter). *(criterion benches: `rust-sim/benches/spin_throughput.rs`, `bulk_throughput.rs` ✅; vitest bench i CI graph reporter ❌)*
- ✅ `cargo-fuzz` setup za config parser + grid evaluator. *(`rust-sim/fuzz/fuzz_targets/{fuzz_alias,fuzz_eval_config,fuzz_packed_grid}.rs`)*
- ✅ Pre-commit: `cargo clippy -W clippy::pedantic`, `tsc --noEmit`, `cargo test`, `vitest run` (sve mora proći). *(`scripts/pre-commit.sh`)*
- ❌ Renovate / dependabot za `decimal.js`, `rust_decimal`, `rayon`, `proptest`.

### 0.2 Dokumentacija temelj
- ✅ `docs/architecture.md` — diagram protoka spin-a (TS i Rust). *(Faza 0.2 commit — full ASCII flow, modul ownership table, hot-path specialization)*
- ✅ `docs/rng.md` — formalna definicija svakog RNG-a + state-machine. *(4 backend katalog, splitting protokol, statistical-quality acceptance)*
- ✅ `docs/precision.md` — gde koristimo f64, bigint, Decimal i zašto. *(3 domena, 4 sanctioned conversion boundaries, common pitfalls)*
- ✅ `docs/glossary.md` — reel set, way, line, pay, scatter, trigger, retrigger, cascade… *(industry-grade A–W glossary sa cross-ref u kod)*
- ✅ *Bonus već postoji:* `docs/IR_SPEC.md`, `docs/MATH_QUICK_REFERENCE.md`, `docs/RECALL_SPEC.md`.

### 0.3 Reference materijal (sakupiti i indeksirati)
- ⚠️ PAR sheet sample-i za 20 generičkih mehanika konfiguracija (legalno reverse-engineered iz literature; bez TM imena). *(fixture-i u `tests/fixtures/reference/` postoje za većinu mehanika; standalone PAR-set kit još fali)*
- ✅ GLI-11 / GLI-19 čitanje + checklist `docs/compliance.md`. *(per-clause status table, per-jurisdiction overlay, submission-kit zip definicija)*
- ❌ Reading list: Markov chain RTP papers (link u `docs/research.md`).

---

## FAZA 1 — Config-as-IR (univerzalni temelj) 🔥 *(2-3 nedelje)*

### 1.1 Game IR (Intermediate Representation)
- ✅ **Definisati IR schema** (Zod + Rust serde) sa svim node tipovima. *(`src/ir/schema.ts`, `rust-sim/src/ir/mod.rs`; commit `833c040`)*
- ✅ **IR validator** (statički — pre simulacije): unreachable features, cycle overflow, unreachable paytable entries. *(`rust-sim/src/ir/validate.rs`)*
- ✅ **IR → TS evaluator** kodgen (or interpreter). *(`src/ir/adapter.ts` + `src/evaluators/*` dispatch; commit `20f83e2`)*
- ✅ **IR → Rust evaluator** kodgen (or interpreter, ali interp je dosta sporiji za hot path). *(`rust-sim/src/ir/adapter.rs` + `rust-sim/src/evaluator.rs`)*
- ⚠️ Migracija postojeće Example Game igre na IR. *(IR-native dispatch radi, ali legacy `src/model/symbols.ts` + `src/model/paylines.ts` postoji paralelno i nije obrisan)*
- ⚠️ **Acceptance:** isti RTP pre/posle migracije (±0.001% na 10⁹ spins). *(parity test postoji `tests/fixtures/parity.json` + `scripts/compare-parity.mjs`; pun 10⁹ MC nije izvršen kao acceptance run)*

### 1.2 Arbitrary symbol set
- ⚠️ Ukloniti hardcoded enum `SymbolId` u TS i Rust. *(IR koristi string ID-ove ✅, ali `src/model/symbols.ts` enum i `src/config/symbolConfig.ts` koriste hardcoded enum — legacy putanja nije obrisana)*
- ✅ Symbol = `{ id: string, paytable: number[], behaviors: SymbolBehavior[] }`. *(definisano u IR schemi)*
- ✅ Reel strip postaje `string[]` ili `u16[]` sa lookup tabelom. *(IR adapter konvertuje)*
- ⚠️ Acceptance: postojeća igra radi sa simbolima preimenovanim u Bog-zna-šta. *(IR-strana radi; legacy strana ne — vidi 1.1)*

### 1.3 Generic grid topology
- ✅ Grid: `width × height_per_reel[]` (asymmetric). *(`rust-sim/src/grid.rs` + IR `Grid` node)*
- ✅ Dinamička visina (variable-rows ways): `randomHeightDistribution` po reel-u. *(`src/evaluators/variableWaysEvaluator.ts` + Rust pendant)*
- ⚠️ Grid resize između spinova (expanding reels). *(static grid resize u IR ✅; "expanding reels" feature varianta — delimično preko `wildTransformer.ts`)*
- ✅ Acceptance: 3-4-5-4-3 igra prolazi, "variable-rows ways stub" config prolazi MC. *(`tests/fixtures/reference/variable-rows-7reels.json`, `5x3-243ways.json`)*

---

## FAZA 2 — Win evaluator univerzalan 🔥 *(2 nedelje)*

### 2.1 Lines evaluator (refactor)
- ✅ Generalizovati za N reels × variable height. *(`src/evaluators/lineEvaluator.ts`)*
- ✅ Levo→desno + desno→levo (both-ways) flag.
- ✅ Multiplier-on-line podrška.
- ✅ Wild u srednjoj poziciji **mora** doprineti najvišem payout-u (industry standard).
- ⚠️ Acceptance: both-ways evaluation config daje očekivan RTP po synthetic target-u. *(fixture postoji u `tests/fixtures/reference/`; closed-form ↔ MC validation pending)*

### 2.2 Ways evaluator
- ✅ `waysCount = Π(symbolsPerReel[i])` za određeni simbol. *(`src/evaluators/waysEvaluator.ts`, `allWaysEvaluator.ts`)*
- ✅ Wild count by reel.
- ✅ variable-rows ways: dynamic per-reel symbol count (2-7), top horizontal reel kao 6-th za visual. *(`variableWaysEvaluator.ts` + `rust-sim/tests/variable_ways.rs`)*
- ✅ Bitmask short-circuit (ako reel nema simbol → ways = 0 odmah).
- ⚠️ Acceptance: 1024 ways igra → analitički = simulirani RTP (±0.01%). *(fixture `5x3-243ways.json` ✅; konkretan 1024-ways acceptance gate ❌)*

### 2.3 Cluster evaluator
- ✅ Union-Find sa preallocated arena. *(`src/evaluators/clusterEvaluator.ts` + `rust-sim/src/cluster/`)*
- ✅ Adjacency: 4-conn ili 8-conn (config-driven).
- ✅ Min cluster size (config).
- ✅ Cluster value: paytable[cluster_size].
- ⚠️ Acceptance: cluster cascade + multiplier symbols → analytical = MC ±0.05% na 10⁹. *(fixture `cluster-7x7.json` postoji; sintetički target RTP set, full-scale MC cross-validate pending)*

### 2.4 Pattern evaluator
- ❌ Pattern lista: `Pattern = { positions: [[r,c],...], minMatches }`.
- ❌ Acceptance: 2 different pattern game konfiguracije prolaze tests.

### 2.5 Pay-anywhere / pay-adjacent
- ✅ Already partially done — generalizovati za bilo koji simbol, ne samo scatter. *(`src/evaluators/scatterEvaluator.ts` + fixture `pay-anywhere.json`)*

---

## FAZA 3 — Symbol behavior plugin layer 🔥 *(2-3 nedelje)*

### 3.1 Behavior interface
- ✅ `interface SymbolBehavior { onLand(ctx, pos): Effect[]; onWin(ctx, pos): Effect[]; onCascade(ctx, pos): Effect[]; }` *(`src/behaviors/types.ts`, `src/behaviors/pipeline.ts`)*
- ✅ Effect pipeline: `applyEffects(effects, state) → newState`. *(`src/behaviors/pipeline.ts`)*
- ✅ Rust mirror sa istom semantikom (`trait Behavior`). *(`rust-sim/src/behavior/types.rs`, `pipeline.rs`, `registry.rs`)*

### 3.2 Behaviors (svaki je svoj fajl + svoj test)
- ✅ `WildBehavior` (substitute, sa optional exclusion list).
- ✅ `ExpandingWildBehavior` — reel popunjavanje pri landing-u.
- ✅ `StickyWildBehavior` — config: persistOver (spin / cascade / feature).
- ✅ `WalkingWildBehavior` — pomera se za N po spinu.
- ✅ `WildMultiplierBehavior` — nosi mult value. *(`MultiplierWildBehavior.ts`)*
- ✅ `WanderingWildBehavior` — random reposition. *(`src/behaviors/impls/WanderingWildBehavior.ts` — deterministic LCG, uniform/avoid-current strategies, bounds-checked)*
- ✅ `WildReelBehavior` — ceo reel = wild. *(`src/behaviors/impls/WildReelBehavior.ts` — expand_wild + optional sticky lock)*
- ✅ `ScatterPayBehavior` (postoji ✅, refaktorisati u plugin). *(`ScatterBehavior.ts`)*
- ✅ `ScatterTriggerBehavior` (postoji ✅). *(deo `ScatterBehavior.ts`)*
- ✅ `MysterySymbolBehavior` — reveal weighted. *(`MysteryBehavior.ts` + `mysterySymbol.ts`)*
- ✅ `CoinValueBehavior` — H&W coin (postoji ✅, refaktor). *(`CoinBehavior.ts`)*
- ✅ `JackpotSymbolBehavior` — direkt jackpot trigger. *(`JackpotBehavior.ts`)*
- ✅ `MultiplierSymbolBehavior` — global mult add/mul.
- ✅ `CollectBehavior` — sakupi sve coin vrednosti. *(`src/behaviors/impls/CollectBehavior.ts` — sweeps grid for coin symbols, emits collect_coin per cell, multiplier support)*
- ✅ `UpgradeBehavior` — unapredi all-of-symbol na grid-u. *(`src/behaviors/impls/UpgradeBehavior.ts` — single + chain mode for cascade upgrades; distinct from feature `symbolUpgrade.ts` which is feature-level)*
- ✅ `SplitBehavior` — 2-in-1 pozicija. *(`src/behaviors/impls/SplitBehavior.ts` — ways scope mul; cluster spin scope; lines noop with paytable note)*
- ✅ `MegaSymbolBehavior` — 2×2 / 3×3 colossal. *(`src/behaviors/impls/MegaSymbolBehavior.ts` — 5 anchor modes, bounds-checked regulator-safe no-op when rectangle wouldn't fit)*
- ✅ `PrizeBehavior` — cash-on-reel. *(`src/behaviors/impls/PrizeBehavior.ts` — direct scatter_pay or collect_coin path, amountByCell + weighted distribution sampling with deterministic seed)*
- ✅ `TransformBehavior` — config-rule transformacija.
- ✅ Svaki behavior ima **unit test** (golden grid → expected effects). *(`tests/faza3_behaviors.test.ts`, `rust-sim/tests/faza3_behaviors.rs`)*
- ⚠️ Acceptance: kompoziciono — `expanding wild + multiplier wild` daje očekivan win. *(integration test postoji, ali ne svih 19 behavior-a — 6 fali)*

---

## FAZA 4 — Feature framework 🔥 *(3 nedelje)*

### 4.1 Feature state machine
- ✅ FSM definisan u IR: `currentState → triggerEvent → nextState`. *(`src/features/index.ts` orchestrator)*
- ✅ Stacking: feature mogu biti nested (FS u H&W u FS), max depth config.
- ✅ Re-entry guards.

### 4.2 Free Spins (full)
- ✅ Already done basic — refaktorisati u FSM. *(commit `0405cb5`)*
- ✅ Sub-features: globalni mult (✅), retrigger (✅), expanding mult, sticky wilds, extra reels, persistent state. *(`src/features/retrigger.ts`, `multiLevelBonus.ts`)*
- ⚠️ Acceptance: 5 različitih FS konfiguracija (basic, mult, retrigger, sticky, expanding) — RTP match. *(fixture-i postoje: `fs-retrigger.json`, `fs-sticky-wilds.json`, `fs-expanding-wilds.json`, `fs-multiplier-ladder.json`; eksplicitan 5-config RTP match izveštaj ❌)*

### 4.3 Hold & Win (full)
- ✅ Already done basic.
- ✅ Sub-features: tier progression, reset-on-no-new, collect, must-hit-by. *(`hnw-classic.json`, `hnw-full-grid.json`, `hnw-grand-jackpot.json`, `progressiveReset.ts`)*
- ⚠️ Acceptance: H&W multi-jackpot + money-symbol H&W multi-tier-jackpot synthetic configs prolaze. *(generičke konfiguracije postoje u `tests/fixtures/reference/`; full RTP-target acceptance pending)*

### 4.4 Cascade orchestrator (proper)
- ✅ Replace stub sa pravom implementacijom: `while (winsExist) { evaluate → mark wins → remove → drop new → multiplier++ if config }`. *(`src/evaluators/cascadeCalculator.ts`)*
- ✅ Cycle detector (max cascade depth cap).
- ✅ Per-cascade reel set (different strip after cascade). *(`cascade-fixed-strip.json`, `cascade-refill.json`, `cascade-drop.json`)*
- ⚠️ Acceptance: Variable-rows + cascade-style variable-rows ways+cascade igra. *(kombinovan fixture postoji; konkretan Variable-rows + cascade PAR match ❌)*

### 4.5 Respin
- ✅ Single respin trigger. *(`respin-feature.json`)*
- ✅ Sticky respin (until no new) — used in Hold & Win često.
- ⚠️ Walking-wild respin. *(walking-wild behavior ✅; eksplicitni respin trigger varijanta ⚠️)*

### 4.6 Pick / Wheel / Mini-game
- ✅ Wheel: weighted spin → single index → payout. *(`src/features/wheelBonus.ts`, `wheel-bonus.json`)*
- ✅ Pick: N options, weighted reveals, with "ends" rules (lose/collect/multiplier-up). *(`pickBonus.ts`, `pick-bonus.json`)*
- ⚠️ Acceptance: Multi-tier WAP jackpot + wheel-style wheel + Pick bonus + multi-level pick game. *(generic fixture ✅; nazivni KAT ❌)*

### 4.7 Buy feature (Feature Buy)
- ✅ Engine zna: za bet × N → direktan ulazak u feature → izračunata teoretska EV. *(commit `0405cb5`)*
- ✅ Validacija: BuyPrice × RTP_when_bought = expected return (sanity check).

### 4.8 Ante bet / Bet boost
- ✅ Multi-mode bet → različite probability tablice po mode-u. *(`src/features/anteBet.ts`)*

### 4.9 Gamble / Side bet
- ✅ Gamble: double-or-nothing math (simple) + ladder variant. *(`src/features/gamble.ts`)*
- ⚠️ Side bet: orthogonal RTP, doesn't affect main game. *(podržano arhitekturno; eksplicitan side-bet config ❌)*

---

## FAZA 5 — Jackpot manager 🟡 *(2 nedelje)*

- ✅ Fixed jackpot — paying out fixed amount on trigger. *(commit `4f93ab4`)*
- ✅ Mystery progressive — random trigger u opsegu [min, max].
- ✅ Must-hit-by — guaranteed hit pre `cap` vrednosti.
- ✅ Multi-tier (Mini/Minor/Major/Grand/Mega) — weighted hit per tier. *(`hnw-grand-jackpot.json`)*
- ✅ Standalone progressive — seed + contribution rate. *(`src/features/progressiveJackpot.ts`)*
- ⚠️ Money-symbol H&W + multi-tier jackpot ladder — coins+tier kombinovan. *(generic 2-tier H&W coin ✅; full N-tier ladder coverage ❌)*
- ❌ Pots of Gold — wheel pick + pot mechanics.
- ✅ Contribution math: `wager × rate → pool`. *(`src/jackpot/manager.ts`)*
- ⚠️ Acceptance: Multi-tier WAP jackpot + wheel-konfiguracija → 4-tier RTP raspodela. *(4-tier infrastruktura ✅; Multi-tier WAP jackpot + wheel PAR match ❌)*

---

## FAZA 6 — Closed-form RTP (analitički prvo, MC drugo) 🔥 *(3-4 nedelje)*

### 6.1 Base lines analytical
- ✅ Enumeracija svih (reel_pos ×...) kombinacija za male igre (< 10¹²). *(`src/enumerator/`, `src/analytical/`)*
- ✅ Probability po simbolu po reel-u → multinomial.
- ✅ Wild substitution kombinatorika.
- ✅ Cross-validate sa MC: razlika < epsilon. *(`tests/faza6_closedform.test.ts`)*

### 6.2 Scatter pay analytical
- ✅ Multinomial za fixed scatter count.
- ✅ Cross-validate.

### 6.3 FS analytical
- ✅ Markov chain: state = (FS_remaining, multiplier_level). *(`src/markov/`, `rust-sim/src/markov.rs`)*
- ✅ Retrigger: geometric expectation.
- ✅ Steady state RTP per FS spin × P(trigger).
- ✅ Cross-validate.

### 6.4 H&W analytical
- ✅ Semi-analytical: trigger probability × E[coin_value | trigger] × E[respins]. *(Markov DP — commit `00c4aac`)*

### 6.5 Cascade analytical
- ✅ Markov chain (state = grid composition) — feasible samo za male grid-ove.
- ✅ Fallback na MC za velike.

### 6.6 variable-rows ways
- ✅ Eksplicitno **bez closed-form** — MC + exhaustive small-instance validation.

### 6.7 Engine API
- ✅ `engine.theoreticalRTP(config) → { value: Decimal, decomposition: {base, scatter, fs, hw, jackpot, cascade}, method: 'analytical' | 'mc' | 'hybrid' }`. *(`src/engine/`)*
- ⚠️ CLI: `slot-sim rtp --config game.json` → instant rezultat. *(`src/cli/cli.ts` postoji ali `rtp` subkomanda nepotvrđena — proveri pre prodaje)*

---

## FAZA 7 — RNG hardening 🔥 *(1-2 nedelje)*

### 7.1 RNG plugin layer
- ✅ `RNG` trait/interface — bilo koji backend. *(`rust-sim/src/rng.rs`, `src/rng/`)*
- ✅ Backend-i: Mulberry32 (legacy), PCG-64 (default), Xoshiro256**, Philox-4 (GPU ready).
- ✅ Counter-based RNG za GPU. *(Philox)*
- ✅ Splittable RNG za paralelne workers.

### 7.2 Statistical certification
- ❌ **TestU01 BigCrush** run + report u repo (`tests/rng-bigcrush.md`).
- ❌ **NIST SP800-22** suite + report.
- ❌ **PractRand** do 1TB.
- ❌ Acceptance: PCG-64 i Xoshiro256** pass BigCrush. *(očekuje se da prođu — implementacije su kanonske, ali ZVANIČAN izveštaj nije generisan ni commit-ovan)*

### 7.3 Cross-platform determinism
- ⚠️ CI test: same seed → same first 1M outputs na linux-x64, macos-arm64, windows-x64. *(linux+macos parity ✅ kroz `compare-parity.mjs`; windows-x64 ❌)*
- ✅ Bitwise reproducibility test (samo integer state, ne f64 derivative). *(`tests/rng_parity.test.ts`)*

### 7.4 Anti-bias
- ✅ Rejection sampling za `randInt(max)` umesto modulo. *(commit `64719f0`)*
- ⚠️ Acceptance: chi-squared test pass za sve sample sizes. *(test postoji u `faza7_rng.test.ts`; "sve sample sizes" — proveri obuhvat pre prodaje)*

---

## FAZA 8 — Statistics & PAR 🟡 *(2 nedelje)*

### 8.1 Streaming statistike
- ✅ Mean, variance (Welford) — verifikovati Kahan compensation. *(`rust-sim/src/stats.rs` ima Welford + Kahan)*
- ✅ Skewness, kurtosis (online formulas).
- ✅ Coefficient of variation.
- ✅ **Volatility Index** (GLI formula). *(`rust-sim/src/par.rs` — volatility_category)*
- ✅ P50, P90, P99, P99.9 quantiles (t-digest ili HDR). *(HDR — commit `f0e8a69`)*

### 8.2 Win distribution
- ✅ Histogram (Rust ima — TS dodati). *(TS: `src/statistics/`)*
- ✅ Adaptive bucket sizing (log-scale za high volatility). *(HDR log-buckets)*
- ✅ CDF export.
- ✅ Top-N largest wins capture (with seed za reprodukciju). *(`TopNWins` sa replay fields)*

### 8.3 Confidence intervals
- ✅ 95% / 99% / 99.9% CI za RTP. *(`MultiSeedStats`)*
- ✅ Required spin count za N significant digits. *(`SpinCountEstimator`)*
- ✅ Convergence detector (auto-stop kad CI stabilizovan). *(`ConvergenceDetector`)*

### 8.4 Feature contribution
- ✅ Base/FS/HW/jackpot breakdown.
- ✅ Bonus frequency, bonus-to-bonus distance distribution. *(`BonusDistanceTracker`)*
- ✅ Max win frequency, max-win expected hit count per N spins.

### 8.5 PAR sheet generator
- ✅ `tools/par-gen` CLI → reads config + MC result → outputs PDF. *(`src/report/parPdf.ts` + `slot-sim par-pdf <report.json>` CLI komanda; sample u `reports/par-samples/sample-par-sheet.pdf` — 3 stranice, 20 KB)*
- ✅ Polja: RTP, hold, hit freq, vol index, bonus freq/contrib, max win, symbol weights, cycle length. *(GLI-16 sekcije 1-12 u `rust-sim/src/par.rs`)*
- ✅ GLI-compliant format option. *(8 sekcija u PDF-u: Meta / RTP / HitFreq+Vol / Quantiles / Features / Histogram / Paytable / Notes+Compliance; structural input typing accepts dialect PAR JSON-e)*

---

## FAZA 9 — Speed: rušimo zid 🔥 *(3-4 nedelje)*

### 9.1 SIMD evaluator (Rust)
- ✅ `std::simd` ili `wide` crate. *(`rust-sim/src/speed/simd_eval.rs` + 9.8b f32x8)*
- ✅ Lines eval u SIMD: 4-16 paylines paralelno (AVX-512) ili 4 (NEON).
- ⚠️ Acceptance: 3-5× speedup vs scalar. *(benchmark fajlovi postoje; konkretan speedup-broj u report ❌)*

### 9.2 Bitpacked grid
- ✅ u128 = 5×5×5-bit grid (ako ima ≤32 simbola). *(`packed_grid.rs`)*
- ✅ Line eval pomoću bitmask ops. *(`packed_eval.rs`)*
- ⚠️ Acceptance: cache miss-rate značajno niži, 2× ukupni speed. *(potvrdi merenjem pre prodaje)*

### 9.3 Arena allocator
- ⚠️ `bumpalo` ili custom arena za per-spin allocations. *(`ZeroAllocEvaluator` izbegava alloc, ali eksplicitno `bumpalo` crate nije u Cargo.toml — potvrdi)*
- ⚠️ Acceptance: heap allocs po spinu = 0 u steady state. *(claim, treba dheap-track test pre prodaje)*

### 9.4 Hot/cold struct layout
- ✅ Razdvojiti `SpinState` u hot (RNG, win acc) + cold (debug, history). *(`hot_cold.rs`)*
- ✅ Repr: `#[repr(C, align(64))]` za cache line.

### 9.5 PGO + BOLT
- ❌ CI build pipeline: 1) instrument build, 2) run benchmark, 3) optimized build, 4) BOLT.
- ❌ Acceptance: +20% throughput.

### 9.6 GPU backend (Metal — dev mašina; CUDA — provider preuzima)
- ✅ Rust + `wgpu` ili native Metal shader. *(`rust-sim/src/gpu/spin_eval.wgsl` + 9.8b WGSL Phase-B)*
- ✅ Philox RNG kernel.
- ✅ Per-thread = per-spin.
- ✅ Constraint: paytable + reel strips u shared mem.
- ⚠️ Acceptance: 50-500× CPU za 5×3 lines igru. *(scaffold + WGSL ✅; izmeren throughput u CI ❌)*

### 9.7 Bench harness
- ✅ `cargo bench` sa criterion (already setup base). *(`rust-sim/benches/`)*
- ⚠️ Reported metrics: spins/sec, ns/spin, allocs/spin, L1 miss rate. *(spins/sec ✅ — measured & committed u `reports/bench/`; alloc/L1 metrike ❌)*
- ❌ Regression detection u CI (fail ako > 5% slower).
- ✅ **Bench reports committed** (P0 #5) — Apple M3 Pro baseline: scalar 2.66 Mspins/s, packed 4.41 Mspins/s, 1T projection 35557s single-thread → confirms need for SIMD batched + GPU + cluster za <60s acceptance.

---

## FAZA 10 — Testing fortress 🔥 *(paralelno sa fazama 1-9, finalizacija 2 nedelje)*

### 10.1 Property-based
- ✅ Rust: `proptest` — invariants: 0 ≤ RTP ≤ maxPayout, no NaN, no panic. *(`rust-sim/tests/faza10_property.rs`)*
- ✅ TS: `fast-check` — isti invariants. *(`tests/engine.property.test.ts`)*
- ⚠️ Acceptance: 1000+ random configs → 0 crash. *(harness postoji; 1000+ config sweep izveštaj ❌)*

### 10.2 Fuzzing
- ✅ `cargo-fuzz` na config parser. *(`fuzz_eval_config.rs`)*
- ✅ `cargo-fuzz` na grid evaluator (random grid → never panic). *(`fuzz_packed_grid.rs`)*
- ❌ 24h fuzz run u CI weekly.

### 10.3 Differential TS↔Rust
- ✅ Test harness: isti seed → first N spins → identičan win amount po spinu. *(`scripts/compare-parity.mjs` + `tests/fixtures/parity.json`)*
- ⚠️ Acceptance: 10M spins, 100% bit-match (za games sa f64-bezbednom matematikom). *(harness ✅; 10M run u CI artifact ❌)*

### 10.4 Known-answer tests (KAT)
- ⚠️ 20 reference igara (vidi `SLOT_ENGINE_ULTIMATE_SCENARIOS.md §8`). *(30 mehaničkih fixture-a ✅; 20 imenovanih igara po imenu ❌)*
- ❌ Acceptance: RTP iz published PAR sheet ±0.05% na 10⁹ spins.

### 10.5 Regression suite
- ⚠️ Golden hashes svake reference igre (RTP, hit-freq, vol, max-win freq). *(neke fixture parity hash-eve postoje; sveobuhvatan golden registry ❌)*
- ❌ CI fail na drift > 0.005%.

### 10.6 Adversarial tests
- ✅ Malicious config: 10¹⁸ cycle count → reject sa clear error. *(`tests/faza10_adversarial.test.ts`)*
- ✅ Cyclic feature trigger → detect i abort.
- ✅ Reel strip sa svim wild-ovima → graceful behavior.

### 10.7 Mutation testing
- ✅ Mutation testing — `stryker.config.mjs` (TS) + `cargo-mutants` (Rust). *(commit `73599dc`)*
- ✅ Differential semantic-preserving rewrites: test suite. *(`tests/faza107_mutation.test.ts`)*
- ⚠️ Acceptance: mutation score ≥95% obe runtime. *(harness ✅; **baseline measured** u `reports/mutation/` — TS 2-file run 61.1% (rg/session 68.7%, sensitivity/analyzer 46.9%); Rust BLOCKED na cargo-mutants vs rust-toolchain pin (1.83 vs 1.85+ za edition2024). Path to 95% = test-strength rad, ne engine bug. Plan u README.)*

---

## FAZA 11 — Tooling i UX 🟡 *(3-4 nedelje, paralelno)*

### 11.1 Config builder UI (web)
- ❌ Vite + React drag-drop slot designer.
- ❌ Live preview spin.
- ❌ Live theoretical RTP.
- ❌ Export JSON config.
- ❌ Import javnih PAR sheet-ova kao starting point.

### 11.2 Reel strip optimizer
- ✅ Input: target RTP, target vol, hit freq, max win. *(`src/optimizer/`)*
- ✅ Output: reel weights (genetic algorithm + analytical seeding). *(`optimizer.ts` + `genetic.ts`)*
- ⚠️ Acceptance: optimizer može da reprodukuje 5/20 reference reel sets-ova iz scratch. *(test `faza112_optimizer.test.ts` ✅; 5 reproductions report ❌)*

### 11.3 Dashboard
- ✅ Real-time RTP graph tokom MC. *(`src/observability/dashboard.ts`)*
- ✅ Confidence interval band.
- ✅ Histogram live update.
- ⚠️ Cancel/resume sa preserved state. *(checkpoint module ✅ u Rustu `bulk/checkpoint.rs`; TS dashboard cancel/resume — proveri)*

### 11.4 Cert reports
- ✅ Auto-generate GLI report PDF iz IR + MC. *(`src/certification/` — commit `4d7fe47`; provera: tačan PDF rendering vs JSON-only)*
- ⚠️ Auto-generate market-specific compliance check (UK/MT/IT/NL/PT). *(8 jurisdikcija u 11.9 ✅; specifični "compliance report" PDF za svaki ⚠️)*

### 11.5 Import / export
- ✅ Reader za hypothetical drugih dijalekata (Weighted-pairs family-like, generic SAS). *(`src/converters/dialects.ts` — MG/PT/NE → USIF, commit `692eb2c`)*
- ✅ JSON Schema export. *(`src/usif/schemaObject.ts`)*

### 11.6 Spin recall/replay UI
- ✅ Replay viewer: paste spin signature → vidi grid + feature stack + win, reel-by-reel animacija. *(`src/recall/viewer.ts` — ASCII viewer)*
- ✅ Verify chain: public viewer puls hash chain dnevni digest → green check.
- ✅ Dispute mode: igrač upload signature → engine verifikuje → emit cert PDF.

### 11.7 Math observability dashboard
- ✅ Live RTP heatmap po grid poziciji × simbolu × vremenskoj rampi. *(`src/observability/`)*
- ✅ Feature contribution graf sa hourly trending + 2σ outlier flag.
- ✅ Convergence predictor (ML LSTM ili Gaussian process). *(commit `71d9401` 13.10)*
- ✅ Drift detector: kontinualno upoređuje live RTP sa expected, alert pri >3σ.
- ✅ Symbol balance audit: per-reel chi-squared live.
- ⚠️ Acceptance: dashboard prikaže anomaliju unutar 60 sekundi od pojave u prod-u. *(test `faza117_observability.test.ts` ✅; konkretan E2E timing report ❌)*

### 11.8 RG & AML hooks
- ✅ Spin time minimum enforce (UK 2.5s, DE 5s).
- ✅ Max loss / time limits.
- ✅ Self-exclusion check.
- ✅ Reality check pop-ups (event `reality_check_due`).
- ✅ AML velocity flag.
- ✅ Cash-out hold.
- ⚠️ Acceptance: UK / DE / IT compliance suite prolazi. *(test ✅; jurisdiction-specific gate izveštaj ⚠️)*

### 11.9 Jurisdiction adapter
- ✅ **Cross-jurisdiction single config** sa `jurisdictionOverrides`. *(`src/jurisdiction/profiles.ts`, 8 markets: UKGC/MGA/ADM/BMM/GLI19/AGCO/DGA/NJDGE)*
- ⚠️ **Compensated math mode** (UK AWP). *(profile postoji; eksplicitan cycleProgress state machine ⚠️)*
- ❌ Class II bingo coordinator mode.
- ❌ Italy VLT — ADM RNG bridge.
- ❌ Centrally-determined (Washington) — ticketPoolDraw.
- ❌ Skill-based slot.
- ⚠️ Acceptance: ista USIF config → 5 jurisdikcijskih variants. *(8 profila ✅; multi-variant emit test ⚠️)*

---

## FAZA 12 — Univerzalnost: 30 mehanika *(5 nedelja, revidovano)*

> **Status:** `commit ecf29a5` — "30 mechanics acid test — all mechanics validated".
> Acid test pokriva **30 mehaničkih klasa** preko 30 fixture-a u `tests/fixtures/reference/*.json`. **Niti jedan fixture ne nosi ime stvarne komercijalne igre niti vendor-a** — template je generički.

30 mehaničkih klasa (each: synthetic config + target RTP + golden hash):

- ⚠️ Both-ways evaluation + expanding wild *(fixture: `expanding-wilds.json`)*
- ⚠️ Asymmetric grid + scatter multiplier
- ⚠️ Cluster cascade + multiplier symbols *(`cluster-7x7.json` + cascade)*
- ⚠️ Pay-anywhere + multiplier collect + ante-bet + buy-feature
- ⚠️ Money-symbol collect FS
- ⚠️ Variable-rows ways + cascade + unbounded multiplier *(`variable-rows-7reels.json`)*
- ⚠️ Expanding-symbol FS
- ⚠️ Hold & Win + multi-tier jackpot *(`hnw-grand-jackpot.json`)*
- ⚠️ Persistent multiplier + symbol upgrade FS
- ⚠️ Cluster cascade + charge meter
- ⚠️ Sticky wilds + multi-mode FS
- ⚠️ Multi-tier WAP jackpot + wheel pick
- ⚠️ Supermeter state-switch
- ⚠️ Money symbol + hold + multi-tier jackpot
- ⚠️ Must-hit-by jackpot
- ⚠️ Stacked wilds + 1024 ways + bonus
- ⚠️ Pseudo-must-hit + level progression
- ⚠️ Pick bonus + multi-level
- ⚠️ Crash-style multiplier-only (non-reel) corner case
- ⚠️ Money collect + variable-rows ways + cascade
- ⚠️ Three-mode FS choice
- ⚠️ Sticky cash + reveal multiplier
- ⚠️ Scatter pay + multiplier scale
- ⚠️ Parallel screens (N independent screens spun together)
- ⚠️ Wheel re-entry tiers
- ⚠️ Sticky-cash variant
- ⚠️ Per-spin reel-modifier reveal
- ⚠️ Megacluster + reveal-stack-ways hybrid
- ⚠️ Pick bonus + variable-rows ways combo
- ⚠️ Class-II bingo coordinator mode (synthesized — verifies coord mode)

**Acceptance (revidovano):**
- ✅ Sve mehanike pokrivene preko 30 fixture-a + faza12 acid test.
- ⚠️ **Numerička acceptance po fixture-u (±0.001%)** — postoji synthetic target RTP per config; cross-validate sa enumeration + MC 10⁹.
- ❌ Brzina ≥50M spins/sec (variable-rows ways) / ≥500M (5×3 lines) — formalni benchmark report ne postoji.

---

## FAZA 5.5 — Jackpot resilience 🟡 *(2 nedelje, nakon Faze 5)*

- ✅ **Network partition handling** kod WAP. *(commit `62085b5` — `JackpotPaymentRequired`)*
- ✅ **Hot wallet overflow** — engine emit-uje `JackpotInsufficientFunds`.
- ⚠️ **Multi-party signature** za jackpot release. *(zk-SNARK scaffold u 13.4 ✅ priprema; `tofnRelease: { signers, threshold }` IR podrška ⚠️ — proveri)*
- ✅ **Two-phase jackpot commit**: `beginJackpot/commitJackpot/rollbackJackpot`.
- ⚠️ **Floating jackpot pool snapshot** za multi-currency. *(eksplicitan FX-rate-at-hit modul ⚠️)*
- ✅ Acceptance: simulacija network partition u CI. *(`tests/faza55_jackpot_resilience.test.ts`)*

---

## FAZA 6.7 — Symbolic math kernel 🟡 *(2 nedelje, paralelno Fazi 6)*

- ✅ **CAS-lite layer**: probability izrazi simbolično. *(`src/sensitivity/`, `src/math/`)*
- ✅ **Sensitivity analyzer u runtime-u**. *(`src/sensitivity/analyzer.ts` + commit `eb11cd4`)*
- ✅ **Inverse RTP solver**: Newton-Raphson + analytical gradient. *(`src/solver/rtpSolver.ts`)*
- ⚠️ **Generating functions** za sum-of-payouts distribuciju. *(GF za moments ⚠️ — proveri pokrivenost; analytical mean/var ✅, skew/kurt iz Welford ✅ ali GF formulacija ⚠️)*
- ✅ Acceptance: solver pogađa weight za 96% RTP ±0.0001% kroz analytical path. *(`tests/faza67_sensitivity.test.ts`)*

---

## FAZA 7.5 — HSM & cryptographic RNG 🟡 *(1 nedelja, nakon Faze 7)*

- ❌ **HSM (Hardware Security Module) bridge**: backend za AWS KMS / Azure HSM / on-prem nCipher.
- ✅ **ChaCha20-Poly1305** as cryptographic PRNG. *(`src/crypto/` + commit `068a5dd`)*
- ✅ **Commit-reveal mode**: `commitSeed/revealSeed`.
- ❌ **Binary self-verification**: engine hash-uje sopstveni `.so` / `.dylib` at startup.
- ⚠️ **Entropy health monitor**: kontinualno meri entropy quality. *(`src/qrng/` ima health monitor ✅ za QRNG path; opšti entropy monitor za sve RNG ⚠️)*
- ✅ Acceptance: HSM-backed run identičan software RNG run sa istim seed-om. *(software-side test vectors prolaze; HSM grana ❌)*

---

## FAZA 8.5 — Spin recall & replay 🔥 *(2 nedelje, paralelno Fazi 8)*

- ✅ **Spin signature**: 64-byte hash. *(`src/recall/integrity.ts` + commit `3bcf216`)*
- ✅ **Audit hash chain**: `spin[N].audit = H(spin[N-1].audit || spin[N].signature)`.
- ⚠️ **Cross-version replay** sa compatibility shim. *(replay ✅; eksplicitan v3.x compatibility shim ⚠️)*
- ✅ **Forensic CLI**: `slot-sim replay --signature=...`. *(`src/recall/viewer.ts` + 11.6 viewer)*
- ⚠️ **Storage adapter**: S3 / IPFS / SQLite. *(NDJSON journal ✅; pluggable backend adapter ⚠️)*
- ✅ **Daily public hash digest** root hash. *(`src/certification/` — commit `4d7fe47`)*
- ✅ Acceptance: forensic replay random spinova → 100% bit-identičan. *(`tests/recall.test.ts`, `rust-sim/tests/recall_kat.rs`)*

---

## FAZA 8.6 — Server-side protocols (G2S/SAS/GAT-IV) 🟡 *(2 nedelje)*

- ✅ **G2S** adapter. *(`src/protocols/g2s.ts` + commit `9666bff`)*
- ✅ **SAS 6.x** legacy adapter.
- ✅ **GAT-IV** signature verification.
- ✅ **Idempotency key**.
- ✅ **Two-phase commit API**: `beginSpin/commitSpin/rollbackSpin`.
- ⚠️ **Bonus money tracker**. *(podržano u IR; eksplicitan WR tracker modul ⚠️)*
- ⚠️ **Multi-currency math layer**: native denominations, banker's vs HALF_UP. *(decimal.js ✅; rounding-mode-per-currency tablica ⚠️)*
- ⚠️ **Tax-aware payouts**: US W-2G threshold flag. *(IR podrška za threshold ⚠️ — proveri)*
- ✅ Acceptance: simulirani G2S sequence. *(`tests/faza86_protocols.test.ts`)*

---

## FAZA 9.8 — 1T spinova/sec acceptance 🔥 *(revidovano, 4 nedelje)*

**Hardware target:** single Apple M-series chip (M3 Pro / M4) ili x64 16-core.

- ✅ **CPU SIMD baseline** (NEON / AVX-512) — faza 9.1 + 9.8b f32x8.
- ✅ **Bitpacked grid + branchless evaluator** — faza 9.2.
- ⚠️ **Arena allocator** — faza 9.3 (vidi 9.3 status — `bumpalo` integracija nepotvrđena).
- ✅ **GPU Metal compute** — faza 9.6 (WGSL Phase-B).
- ✅ **Distributed mode**: gRPC / TCP orchestrator + worker. *(`rust-sim/src/cluster/transport.rs` + `coordinator.rs`)*
- ✅ **Streaming HDR accumulator** za 1T runs (memory constant).
- ⚠️ **Progress UX**: 0.1% resolution progress bar, ETA, abortable. *(`bulk/progress.rs` ✅; abortable UX hook ⚠️)*
- ✅ **Checkpoint-resume**: snapshot svakih 10M spinova. *(`bulk/checkpoint.rs`)*
- ❌ Acceptance (merenje):
 - 1T spinova end-to-end **< 60 sekundi** single M3 Pro / M4.
 - 4× M3 Ultra grid → **< 15 sekundi**.
 - GPU + 8 instances cloud burst → **< 2 sekunde**.
 - Bit-identičan rezultat — bench izveštaj **NIJE** generisan ni commit-ovan.

---

## FAZA 9.9 — NUMA, FPGA & Persistent memory 🟢 *(opciono, 3 nedelje)*

- ✅ **NUMA-aware** allocation. *(`rust-sim/src/numa/mod.rs` + commit `477423b`)*
- ✅ **Persistent memory** (Apple unified, mmap reel strip-ova). *(`numa/mmap_strips.rs`)*
- ❌ **FPGA accelerator path**: Verilog generator iz IR za hot evaluatore.
- ❌ Acceptance: dual-socket EPYC server → linear scaling 30B/s.

---

## FAZA 10.7 — Differential mutation testing 🟡 *(1 nedelja)*

- ✅ **Mutation testing** sa `cargo-mutants` (Rust) + `stryker` (TS).
- ✅ **Differential semantic-preserving rewrites**.
- ⚠️ Acceptance: mutation score ≥95% obe runtime. *(harness ✅; eksplicitan score report u repu ❌)*

---

## FAZA 10.8 — Adversarial test generator (LLM + property-based) 🔵 *(2 nedelje, futuristic)*

- ❌ **LLM agent** trazi edge config-e koji crashuju ili violentno krše invariante.
- ❌ **Continuous CI** background 24/7.
- ❌ **Auto-propose fix**: LLM + Rust analyzer skicira PR.
- ❌ Acceptance: 0 bug-ova u prethodnih 30 dana koji nije agent prvo našao.

---

## FAZA 11.6 — Spin recall/replay UI 🟡 *(1 nedelja)*

Vidi gore (premešteno u glavni FAZA 11 blok).

---

## FAZA 11.7 — Math observability dashboard 🔥 *(2 nedelje, paralelno Fazi 11)*

Vidi gore (premešteno u glavni FAZA 11 blok).

---

## FAZA 11.8 — RG & AML hooks 🟡 *(1 nedelja)*

Vidi gore (premešteno u glavni FAZA 11 blok).

---

## FAZA 11.9 — Jurisdiction adapter 🔥 *(2 nedelje)*

Vidi gore (premešteno u glavni FAZA 11 blok).

---

## FAZA 13 — Futuristic 🔵 *(opciono, kontinualno)*

### 13.1 Auto-tuner
- ✅ **Genetic + Bayesian optimization** za reel weight design. *(`src/optimizer/genetic.ts` + commit `6f6b59d`)*
- ⚠️ Cilj: zadaš target {RTP, vol, hitFreq, maxWinFreq}, engine generiše reel weights. *(target tuple ✅; mass-validation report ⚠️)*

### 13.2 Player behavior simulator
- ✅ Session length, perceived RTP, churn modeli. *(`src/player/simulator.ts` + commit `7e257fc`)*
- ✅ Output: profili za casual / whale / etc.

### 13.3 ML anti-fraud
- ✅ Spin sequence pattern → fraud signature classification. *(`src/fraud/detector.ts` + commit `32cd245`)*
- ⚠️ Real-time alert ka operator dashboard. *(detektor ✅; eksplicitan operator-dashboard wiring ⚠️)*

### 13.4 zk-SNARK proof layer
- ✅ Spin → arithmetic circuit → SNARK proof scaffold. *(`src/zkproof/prover.ts` + commit `71d9401`)*
- ⚠️ Crypto-casino native (Stake-style provable fair). *(scaffold ✅; production-grade SNARK backend ⚠️)*
- ⚠️ Pre-rec: MPC multi-party jackpot signature (faza 5.5 priprema). *(scaffold ✅)*

### 13.5 QRNG bridge
- ✅ Off-the-shelf quantum RNG service (ID Quantique, Quantinuum API). *(`src/qrng/sources.ts` + commit `dd37fc2`)*
- ✅ Entropy source bridge sa fallback ka ChaCha20. *(`bridge.ts` health-monitored)*

### 13.6 Distributed 1T+ grid
- ✅ Skicirano u 9.8 — full distributed 100T+/s aggregate. *(scaffold ✅; multi-instance acceptance test ❌)*

### 13.7 Format converters
- ✅ Reel-weight-map family, Weighted-pairs family, Reel-strips family dialect imports → USIF. *(`src/converters/dialects.ts` + commit `692eb2c`)*
- ✅ Lossy emit warnings za missing fields.

### 13.8 Cross-game wallet math
- ❌ Multi-game progresivi share wallet.
- ❌ Engine zna cross-contribution.

### 13.9 Universal Slot Interchange Format (USIF) — javni standard
- ✅ USIF v1.0 schema (Zod + JSON Schema strict). *(`src/usif/schemaObject.ts` + commit `e9121b2`)*
- ✅ Reference implementation (sam engine).
- ⚠️ 30 reference games kao public examples. *(fixture-i ✅; "public" hosted examples ❌)*
- ❌ Submit eCOGRA / GLI / G2S Standards Body kao kandidat.
- ❌ Open-source MIT.

### 13.10 Predictive convergence ML
- ✅ LSTM ili Gaussian process model predviđa "remaining spinova do CI=ε". *(`src/convergence/` + commit `71d9401`)*
- ⚠️ Pre-rec: dataset od 10k MC runs sa različitim configurations. *(syntetic data ✅; 10k MC corpus ⚠️)*

### 13.11 Time-machine compliance
- ❌ Auto re-run istih 1M spinova posle 1 godine na produkcijskom kodu.
- ❌ Bit-identičan rezultat — proof of no-silent-drift.
- ❌ Audit dossier publikovan publicly daily.

### 13.12 LLM-driven game balancing
- ❌ Designer prirodnim jezikom.
- ❌ Agent + auto-tuner predlaže config kroz iterativni dialog.

### 13.13 Holographic strip encoding
- ❌ variable-rows ways 117k state space → Bloom-filter-like compressed struct.

### 13.14 Differential privacy PAR
- ❌ Public PAR export sa Laplace noise (ε=0.1).

### 13.15 Quantum advantage research
- ❌ Grover-style enumeration za variable-rows ways state.

### 13.16 Mining-pool decentralized WAP
- ❌ Multi-tier WAP jackpot + wheel pool van centralnog provider control-a.

### 13.17 Federated math ML
- ❌ Multipli operatori share anonymous session stats.

### 13.18 Live RTP heatmap (extension)
- ⚠️ 3D matrica. *(2D heatmap ✅ u 11.7; full 3D × time ⚠️)*

---

## FAZA 14 — Post-Multi-tier-jackpot family (gde niko trenutno nije) 🔵 *(strategic, 4+ meseci)*

### 14.1 Sub-1ns analytical spin
- ✅ Memoize celokupan analytical RTP graf — single spin = `lookup(gridHash) → win`. *(`src/calculator/` + commit `0ee98b0`)*
- ✅ Achievable za male igre (≤ 5×3 sa < 10⁹ stanja).
- ⚠️ 0 RNG poziva u "demo" mode — instant playback. *(scaffold ✅; eksplicitan "demo mode" flag ⚠️)*
- ⚠️ Acceptance: 5×3 lines igra → 10⁹ spinova replay u 1 sekundi single thread. *(`tests/faza141_analytical.test.ts` ✅; pun 10⁹ run report ❌)*

### 14.2 Continuous certification
- ✅ Production live emit-uje hash chain → automated regulator inbox. *(`src/certification/certifier.ts` + commit `4d7fe47`)*
- ✅ Daily statistical report.
- ⚠️ Eliminate 5-godišnji manual re-cert ciklus. *(arhitekturno ✅; regulator-side adoption ❌, van obima koda)*
- ❌ Pilot sa MGA / UKGC sandbox.

### 14.3 Cross-jurisdiction single config (proširenje 11.9)
- ⚠️ USIF emit varianta za 13 jurisdikcija. *(8 jurisdikcija ✅ u 11.9; 13 ⚠️)*
- ❌ Designer ne piše 13 igara, piše 1 — to dokazati 1 multi-jurisdiction emit-om.

### 14.4 Sub-millisecond MC convergence
- ❌ Kombinacija: analytical + QMC (Sobol) + antithetic + control variates + importance sampling.
- ❌ 1B spin equivalent CI sa 100k stvarnih spinova → < 1ms wall clock.
- ❌ "Live tuning console".

### 14.5 USIF Hub
- ❌ Web portal: upload USIF, dobiješ instant RTP + PAR + 100M MC validation.
- ❌ Community-shared mehanic library.
- ❌ Reference igre kao public examples.
- ❌ Network effect cilj.

### 14.6 AI co-designer
- ❌ Multi-turn LLM agent koji vodi designer-a od koncepta do finalnog config-a.

### 14.7 Predictive maintenance
- ❌ ML model gleda prod metrics, predviđa drift.

### 14.8 Behavioral fairness audit
- ❌ Statistical fairness across player segments.

---

## ACCEPTANCE: 1T SPIN HARD CRITERION

Sve faze do 14 moraju zadovoljiti **1T spinova/sec end-to-end** kao acceptance.

| Stack | Spins/sec target | 1T trajanje | Status |
|---|---|---|---|
| CPU SIMD (faza 9.1) | 5B+ | 200 sek | ⚠️ kod ✅, merenje **započeto** — scatter_count SIMD trenutno SPORIJI od scalar na M3 Pro za 5×3 (lane overhead), pays off na 8×8+ ili batched |
| + Bitpacked (faza 9.2) | 8B+ | 125 sek | ⚠️ kod ✅, merenje ✅ — 1.66× speedup vs scalar full_spin (`reports/bench/full_spin/`) |
| + Arena + PGO/BOLT (faza 9.3-9.5) | 12B+ | 80 sek | ❌ PGO/BOLT |
| + GPU Metal (faza 9.6) | 600B+ | < 2 sek ⚡ | ⚠️ WGSL ✅, merenje ❌ |
| + Distribuirani (faza 9.8, 4-8 nodes) | 1.8T+ | < 1 sek ⚡⚡ | ⚠️ cluster ✅, multi-node merenje ❌ |

**1T spinova mora biti rutinska operacija** — single command, < 60s na dev mašini. Trenutno: command ✅ (CLI `bulk dispatcher`), end-to-end timing measurement ❌.

---

## TEHNIČKI DUG (registar — popraviti uz odgovarajuće faze)

- ⚠️ Hardkodovan `SymbolId` enum (faza 1.2) — i dalje živi u `src/model/symbols.ts` + `src/config/symbolConfig.ts` paralelno sa IR-om. Treba **obrisati legacy granu**.
- ⚠️ Hardkodovan `NUM_REELS=5` / `NUM_ROWS=3` (faza 1.3) — **POPRAVLJENO (delimično)**: `paylines.ts` više ne hardkoduje `5`/`3`, sad **derived from PAYLINES** + dodate `buildStraightLinePaylines(reels, rows)` i `deriveDimensions(paylines)` helper funkcije. `validatePaylines` accepts `(paylines, reels, rows)` parametre. `PaylineDefinition` više nije fixed-tuple `[n,n,n,n,n]`, sad generički `number[]`. Legacy 5×3 demo i dalje radi; operator koji želi 6-reel: zameni `PAYLINES` ili koristi `buildStraightLinePaylines(6, 4)`. Full IR migracija demo igre (`BASE_REELS`, `SymbolId` enum) i dalje na čekanju.
- ⚠️ TS `BASE_REELS` / `FREE_SPINS_REELS` kao TS const (faza 1.1) — IR adapter ih učitava, ali izvori su još hardcoded TS.
- ✅ Mulberry32 jedini RNG (faza 7.1) — **REŠENO**: 5 backend-a aktivnih (Mulberry32 legacy, PCG-64 default, Xoshiro256**, Philox4x32, ChaCha20-Poly1305).
- ⚠️ TS i Rust evaluatori divergirajuće implementacije (faza 1.1) — IR-native dispatch unifikuje glavnu putanju ✅; ali legacy `lineEvaluator.ts` ↔ Rust `evaluator.rs` razlikuju se u sub-mehanikama. Parity test (`compare-parity.mjs`) jaha samo specifične fixture-e.
- ✅ Cascade stub u oba (faza 4.4) — **REŠENO** (`cascadeCalculator.ts` + Rust pendant).
- ⚠️ JSON parse svaki run (parse once, share Arc — faza 9.3) — Rust bulk path koristi `Arc<Config>` ✅; TS path još parse-uje per-spin u nekim CLI rutama. Proveri pre prodaje.
- ⚠️ Test coverage neujednačen (faza 10) — 41 test-suite u TS, 20 u Rust; ne postoji ujednačen coverage report.

---

## ŠTA OZBILJNO NEDOSTAJE PRE "MOŽEMO PRODAVATI" (P0 plug list)

Ovo je realan blokator za production-grade prodaju engine-a operatorima/providerima:

1. ✅ **Windows-x64 CI grana** (faza 0.1) — bez nje ne možeš tvrditi "cross-platform deterministic". *(DONE — `ci.yml` sad uključuje `windows-latest` u TS+Rust matrix)*
2. ⚠️ **Brisanje legacy `SymbolId` + `NUM_REELS/NUM_ROWS` enuma** (faza 1.2/1.3 tehnički dug) — `NUM_REELS/NUM_ROWS` POPRAVLJENO (derived from PAYLINES, `buildStraightLinePaylines` factory dostupan). SymbolId enum + full IR migracija demo igre (BASE_REELS/FREE_SPINS_REELS) i dalje na čekanju za hard purge.
3. **TestU01 BigCrush / NIST / PractRand izveštaji** (faza 7.2) — bez tih izveštaja regulator ne prihvata RNG.
4. ✅ **PAR sheet sakupljanje za 20 generičkih mehanika** (faza 0.3 + 10.4 KAT) — DONE: `reports/par-samples/` ima 20 PAR JSON+PDF parova spanning Lines/Ways/Cluster/Pay-Anywhere/Variable-Rows/Cascade/Free-Spins/Hold-and-Win. Generator: `scripts/par-samples-generate.mjs` (`npm run par-samples`). 2-pass auto-scale na target_rtp = 0.96 — 18 od 20 fixture-a postižu 96.00% ±0.05%, 2 feature-heavy (complex-variable-rows 106%, 6x4-4096ways 97.4%) zahtevaju ne-linearno tuniranje koje sledi u P0 #4.2. Determinizam: seed=12345 → byte-identical rerun. `INDEX.md` sa per-fixture tabelom je u istom direktorijumu.
5. ✅ **Benchmark izveštaji** (9.1, 9.2, 9.3, 9.6, 9.8 acceptance) — DONE: `reports/bench/` sa M3 Pro baseline (5 bench grupe, criterion JSON + README). 1T projection: 35557s single-thread → otvara konkretan target za SIMD+GPU+cluster. PGO/BOLT/GPU/cross-platform follow-up u README.
6. ✅ **PAR sheet PDF rendering** (8.5) — DONE: `src/report/parPdf.ts` (471 L) + 14 testova + sample 3-page PDF u `reports/par-samples/`. CLI: `slot-sim par-pdf <SimReport.json> --out PAR.pdf`. Uncompressed streams za audit-search. 8 GLI sekcija, structural typing accepts external dialect JSON-e.
7. ✅ **`docs/architecture.md`, `rng.md`, `precision.md`, `glossary.md`, `compliance.md`** (faza 0.2/0.3) — operator koji integriše hoće 5-stranični arhitekturni overview. *(DONE — svih 5 fajlova landed; sa cross-ref na kod i submission-kit definicijom)*
8. ⚠️ **Mutation score izveštaj** (faza 10.7) — DELIMIČNO: TS Stryker baseline 61.1% u `reports/mutation/` sa per-mutant JSON (945 KB), top-survived kinds analiza i konkretan path do 95%. Rust BLOCKED — cargo-mutants ≥24 traži edition2024 (Rust 1.85), repo pinned na 1.83 zbog parity. Option B (nightly wrapper) je sledeći korak.
9. ✅ **6 fali behavior-a** (faza 3.2): Wandering, WildReel, Collect, Upgrade, Split, Mega, Prize — DONE: 7 plugin behavior-a + 47 tests u `tests/faza32_extra_behaviors.test.ts`, registry `behaviorClass` overrides za sve, barrel export ažuriran. "Plugin layer" claim sad kompletan.
10. **HSM bridge** (faza 7.5) — operatori u UK/MT/DE traže HSM-backed RNG za live.

---

## NEMERLJIVI KRITERIJUMI USPEHA

1. **Univerzalnost:** "može li config-only da implementira igru X?" — DA za sve postojeće mehanike (acid-test 30 ✅, nazivni KAT ❌).
2. **Tačnost:** RTP matuje teoretski sa ±0.001% na 10⁹ spins; PAR sheet match-uje literaturu ±0.05%. *(closed-form ↔ MC ±0.01% ✅ na fixture-ima; vs publikovani PAR ❌)*
3. **Brzina:** ≥ 500M spins/sec za 5×3 lines na M-series single chip; ≥ 50M za variable-rows ways; GPU ≥ 50× CPU. *(arhitektura postoji; **merenje ne postoji**)*
4. **Deterministički:** isti config + seed → identičan rezultat kroz TS, Rust, GPU. *(TS↔Rust ✅; GPU determinism — Philox kernel ✅, end-to-end parity ⚠️)*
5. **Certifiable:** RNG prolazi BigCrush, NIST, PractRand. *(implementacije kanonske ✅; **zvanični izveštaji NE postoje**)*
6. **Maintainable:** dodavanje nove mehanike = jedan plugin + jedan test, bez core izmena. *(behavior + feature framework ✅)*

---

## DELIVERABLE TIMELINE (revidovano, posle commit-a `477423b`)

| Mesec | Faze | Stanje |
|---|---|---|
| ✅ M1 | 0 + 1 (config IR) | **uglavnom done**, fali legacy purge |
| ✅ M2 | 2 + 3 (evaluators + behaviors) | done, fali 6 behavior-a |
| ✅ M3 | 4 + 5 (features + jackpots) | done, fali Pots of Gold + LL/CC ladder |
| ✅ M4 | 6 + 7 (closed-form + RNG) | kod done, fali RNG certification |
| ✅ M5 | 8 + 9 (stats + speed) | kod done, fali bench reports |
| ✅ M6 | 10 (testing fortress) | kod done, fali nazivni KAT + mutation score |
| ⚠️ M7 | 11 + 12 (tooling + reference) | 11.2-11.9 done, 11.1 web UI ❌, 12 fali nazivni PAR |
| ⚠️ M8+ | 13 | 7 commit-a, 11 stavki ostaje |

**Trenutna procena za "DONE-UNIVERSAL" prodajno spreman engine:** ~3-4 nedelje fokusiranog rada na P0 plug listi gore.

---

## NEXT IMMEDIATE STEPS (ovaj tjedan)

1. **TEH DUG PURGE** — obrisati `src/model/symbols.ts` enum + `src/model/paylines.ts` NUM_REELS/NUM_ROWS i preusmeriti `src/config/gameConfig.ts` da čita iz IR-a. (Ako "default demo" treba da preživi, prepiši ga u IR JSON pod `tests/fixtures/reference/example-game.json` i pusti adapter.)
2. **Windows CI grana** — dodaj `windows-latest` u `.github/workflows/ci.yml` matrix.
3. **`docs/architecture.md` + `docs/rng.md` + `docs/precision.md` + `docs/glossary.md`** — 4 fajla, ~2-3 sata, blokator za operator onboarding.
4. **Reference fixture sakupljanje** — krenuti od 5 generičkih mehanika (both-ways + expanding wild, asymmetric pay grid, H&W multi-jackpot, money-collect FS, cluster-cascade sa multiplier symbols), izgraditi sintetičke configs u `tests/fixtures/reference/<mechanic>.json` + KAT test sa target RTP.
5. **TestU01 BigCrush run** za PCG-64 + Xoshiro256** + ChaCha20 — output u `tests/rng-bigcrush.md`. Bez ovog regulator ne prihvata engine.
6. **Bench report fajlovi** — `cargo bench` → izvezeš criterion HTML u `reports/bench/`, commit-uješ.
7. **6 fali behavior-a** — Wandering, WildReel, Collect, Upgrade(plugin), Split, Mega, Prize. Svaki je jedan plugin + jedan test, ~1 dan po behavior-u.
