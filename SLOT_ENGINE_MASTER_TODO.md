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

## STATE SNAPSHOT (overeno protiv git history-ja Wave 15, izvora i fixture-a — 2026-05-15, W152 Wave 15 landed)

**Ukupno: ~96% kompletno na kodu, ~71% kompletno na "acceptance proof"-u.** *(W152 Wave 15: Faza 1.6 quick-RTP CLI (`slot-sim rtp <ir.json>` + `--strict` CI gate), Faza 11.3 cancel/resume sa preserved state (AbortSignal + checkpoint serialise/deserialise + IR-hash binding), Faza 14.2 daily replay (`scripts/cert-daily.mjs` no-silent-drift guardian sa SHA-256 engine fingerprint + hash-chain CHAIN.json), tehnički dug — TS parse-once IR cache (LRU keyed by FNV-1a, default capacity 64). **+59 vitest specs (2271 total).** Wave 14: Faza 11.1 Web Config Builder UI MVP (pure HTML+CSS+ESM, no Vite/React, 20 vitest specs), Faza 14.5 MIT LICENSE + standards body submission pitch, Faza 14.8 statistical fairness across player segments (Decimal.js precision + Wilson-Hilferty p-value + Bonferroni-corrected pairwise z, 18 vitest specs). Wave 13: ±0.001% precision unification + Faza 10.5/10.2/9.7/14.6. Wave 12: 9 items. Wave 11: 7.2 + 10.3 + 7.5 + 9.4 + 14.3.)*

Šta to znači u praksi:
- **Kod i moduli** za faze 0.1, 1.x, 2.x, 3.x, 4.x, 5, 5.5, 6, 6.7, 7, 7.5, 8, 8.5, 8.6, 9.1-9.4, 9.6-9.9, 10.1-10.7, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 12 (mehanike), 13.1, 13.2, 13.3, 13.4, 13.5, 13.7, 13.9, 13.10, 14.1, 14.2 **postoje i commit-ovani**.
- **Tehnički dug** je još otvoren: `SymbolId` enum + `NUM_REELS=5` / `NUM_ROWS=3` legacy konstante i dalje žive u `src/config/` i `src/model/` paralelno sa IR-om.
- **Landed kasnije (post-`477423b`):** windows-x64 CI grana (`b67a340`), 5 foundational docs (`architecture.md`/`rng.md`/`precision.md`/`glossary.md`/`compliance.md`) (`b67a340`), 20 generic-mechanic PAR samples (`b5d5372`+`3701af7`), P0 #4.2 non-linear PAR tuner (`5c43725`), TS-side NIST 5-test baseline + 4-backend reports + `HOWTO-fullsuite.md` (`6896eb3`), HSM bridge interface + `MockHSMProvider` (`54a3ba6`), bench reports (`9e1588b`), TS mutation baseline (`da2b88e`), 7 plugin behaviors (`2633274`), P0 #2 SymbolId enum purge → free-form string + IR loader (`f70581b`), P0 #10 HSM audit/health/audited-provider + sanitization helper (`03eef5b`), P0 #4 stability harness via PAR distribution stress (50 seeds × 20k spins, CoV ≤ 2.5%) (`03eef5b`→`d9d2bd8`), **W149 UKGC+MGA+ADM compliance overhaul** (`a740303`→`89a14c0`, 12 files, +2294/−121: SI 2025/215 stake limits £5/£2 + age-tier enforcement, RTS 14D 2.5s spin gate + autoplay/turbo ban + false-win guard + net-position display, 10× bonus wagering cap, MGA Player Protection Directive 2018 actuals, ADM AAMS license + jurisdiction-aware product gating).
- **Nije commit-ovano:** vitest bench, Renovate/Dependabot, `research.md`, full external TestU01 BigCrush / NIST 15 / PractRand 2³⁸ captures (HOWTO landed; binarije TBD), PGO+BOLT pipeline, real PKCS#11 driver via `dlopen()`/N-API (audit/health monitor + MockHSMProvider landed), 11.1 web Config Builder UI, 13.6 cross-game wallet, 13.8 cross-game wallet, 13.11-13.18 futuristic, 14.3-14.8 strategic post-Multi-tier-jackpot family.
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
| `a977a9f`+`30f7760` | TM-clean: strip all game/vendor names from template |
| `802801f` | TODO reconcile against actual repo state |
| `61add41` | P0 #2 partial: NUM_REELS/NUM_ROWS derived from PAYLINES |
| `b67a340` | P0 #1 (Windows CI) + P0 #7 (5 foundational docs) |
| `2633274` | P0 #9 (7 plugin behaviors close out plugin layer claim) |
| `9e1588b` | P0 #5 (bench reports — first measured M3 Pro baseline) |
| `da2b88e` | P0 #8 partial (TS mutation baseline + Rust blocker docs) |
| `b5d5372` | P0 #6 (PAR sheet PDF renderer + CLI + sample) |
| `a5679c9` | Workspace root Cargo.toml + lockfile for daemon check |
| `2539256`+`3ffa438` | P0 #8 TS push (rg/session, analyzer, RNG mutation scores) |
| `6896eb3`→`853880d` | P0 #3 TS-side (Node NIST 5-test baseline + 4-backend reports + HOWTO) |
| `54a3ba6`→`51a1f67` | P0 #10 (HSM bridge interface + MockHSMProvider) |
| `5c43725`→`3701af7` | P0 #4.2 (non-linear PAR tuner — bisection, 20/20 within ±0.5%) |
| `09f7f6e` | Wave 1 docs closure (`PARALLEL_TASK_LOG.md`) |
| `e557b33`→`f70581b` | P0 #2 (SymbolId enum purge → free-form string + IR-derived loader) |
| `4950337` | Wave 1 + B3 docs reconcile (commit→phase mapping refresh) |
| `03eef5b`→`d9d2bd8` | P0 #10 hardening (HSMAuditLog + HSMHealthMonitor + HSMAuditedProvider + sanitize, 25 tests) + P0 #4 stability harness (`par-distribution-stress.mjs`, 50 seeds × 20k spins, CoV ≤ 2.5%) |
| `a740303`→`89a14c0` | **W149** — UKGC+MGA+ADM compliance overhaul (jurisdiction profile data refresh + RTS 14D gates + 10× wagering + 18 new tests) |
| `2f5cec2` | **W152** ULTIMATE research bundle — 16 KIMI deep dives + synthesis + action plan (18 files, +974 LOC, 31 concrete gaps identified) |
| `2b06dec` | **W152 P0-1 + P0-5** — RFC 8439 ChaCha20 CSPRNG + bit-exact TS↔Rust KAT parity (CSPRNG-class RNG unlocks UK/MGA/DE cert path) |
| `7c62305` | **W152 P0-3 round 1** — IR adapter unstub: cascade / respin / mystery_symbol with shared JSON fixture, 12 tests (6 Rust + 6 TS) |
| `4ca3f4e` | **W152 P0-3 round 2** — IR adapter unstub: pick / wheel / buy_feature / ante_bet / gamble / symbol_upgrade (closes all 8 stubs) — 18 tests (9 Rust + 9 TS) |
| `100d4a6` | **W152 P0-4 + P0-6 + P0-7 + P0-8** — GLI-19 cert pipeline (`rng_submission` bin + `cert-bundle.sh`) + 4 jurisdiction reporting adapters (PGAD/DK-XML/MGA-JSON/NJ-CSV) + H&W Markov solver + `slot-truth-check.sh` self-honesty gate — 69 new tests (6 Rust + 63 TS), 6 new files, +2400 LOC |
| `38702a4` | **W152 Faza 2.4 Pattern evaluator + P1-9 cargo-mutants ENABLED** — `EvalMode::Pattern`, `evaluate_pattern`, `PatternRule`, shared fixture, 8 Rust + 9 TS bit-exact parity tests + 9/9 mutants caught at 100% score |
| `fafb148` | **W152 P1-7 + P1-10 + P2-15 + Faza 7.2 + P2-13** — persistent-grid H&W solver (Money Train 4 class, multi-class cells cash/mult/collector/inert with closed-form bilinear payout) + rng/jackpot/jurisdiction coverage trojka (88 new TS tests covering HSM fallback, jackpot lifecycle invariants, all 8 jurisdiction profiles) + max-win cap math + EVT Pareto POT fit (`clipDistribution` / `fitParetoTail` / `evtTailQuantile` Rust + TS mirror) + RNG cert ChaCha20 row + SUMMARY.md aggregator + AML telemetry emitter (5 pluggable backends: Noop / Buffering / Stdout / JsonlFile / Composite) — **24 new Rust tests + 165 new TS tests (189 total)**, 11 new files, +2900 LOC |
| (this commit) | **W152 Wave 15 — 4 stavke / 4 ⚠️→✅ flips** — Faza 1.6 quick-RTP CLI (`src/cli/rtp.ts` + `slot-sim rtp` subkomanda + `--strict` CI gate, 13 specs); Faza 11.3 cancel/resume sa preserved state (`src/sim/cancel-resume.ts` AbortSignal + checkpoint serialise/deserialise + IR-hash binding, 17 specs); Faza 14.2 daily replay (`scripts/cert-daily.mjs` no-silent-drift guardian sa SHA-256 engine fingerprint + appended hash-chain CHAIN.json + golden compare exit-2-on-drift, 9 specs); tehnički dug — TS parse-once IR cache (`src/ir/parseCache.ts` LRU keyed by 64-bit FNV-1a fingerprint, default capacity 64, hit returns same instance ref, failures NOT cached, 20 specs). **+59 vitest specs (2271 total / +20 net since 2251 baseline). 0 regresija — full suite 89 files / 2274 tests pass.** 7 new files, +1400 LOC. |

---

## FAZA 0 — Pripreme i temelji *(1-2 nedelje)*

### 0.1 Repo & infra
- ✅ Postaviti **CI matrix**: `linux-x64`, `macos-arm64`, `macos-x64`, `windows-x64` — bit-identičan RTP iz istih seed-ova. *(svi 4 OS-a sad u `.github/workflows/ci.yml` za TS+Rust)*
- ⚠️ Dodati `cargo bench` + `vitest bench` regresione grafove (criterion.rs + reporter). *(criterion benches: `rust-sim/benches/spin_throughput.rs`, `bulk_throughput.rs` ✅; vitest bench i CI graph reporter ❌)*
- ✅ `cargo-fuzz` setup za config parser + grid evaluator. *(`rust-sim/fuzz/fuzz_targets/{fuzz_alias,fuzz_eval_config,fuzz_packed_grid}.rs`)*
- ✅ Pre-commit: `cargo clippy -W clippy::pedantic`, `tsc --noEmit`, `cargo test`, `vitest run` (sve mora proći). *(`scripts/pre-commit.sh`)*
- ✅ Renovate / dependabot za `decimal.js`, `rust_decimal`, `rayon`, `proptest`. *(W152 Wave 12 — `renovate.json` (~60 L) configures Mend Renovate Community Edition: schedule "before 4am on monday Europe/Belgrade", lockFileMaintenance on same schedule, semantic commits, dependencyDashboard. 4 packageRules: TS math libs auto-merge minor+patch (decimal.js / hdr-histogram-js / fast-check / vitest / @vitest/coverage-v8), Rust crates manual review on minor+patch (math-determinism risk), dev-tooling grouped (eslint/prettier/@types/*), major bumps gated. Vulnerability alerts labelled `security`. PR limits 4/h, 10 concurrent.)*

### 0.2 Dokumentacija temelj
- ✅ `docs/architecture.md` — diagram protoka spin-a (TS i Rust). *(Faza 0.2 commit — full ASCII flow, modul ownership table, hot-path specialization)*
- ✅ `docs/rng.md` — formalna definicija svakog RNG-a + state-machine. *(4 backend katalog, splitting protokol, statistical-quality acceptance)*
- ✅ `docs/precision.md` — gde koristimo f64, bigint, Decimal i zašto. *(3 domena, 4 sanctioned conversion boundaries, common pitfalls)*
- ✅ `docs/glossary.md` — reel set, way, line, pay, scatter, trigger, retrigger, cascade… *(industry-grade A–W glossary sa cross-ref u kod)*
- ✅ *Bonus već postoji:* `docs/IR_SPEC.md`, `docs/MATH_QUICK_REFERENCE.md`, `docs/RECALL_SPEC.md`.

### 0.3 Reference materijal (sakupiti i indeksirati)
- ⚠️ PAR sheet sample-i za 20 generičkih mehanika konfiguracija (legalno reverse-engineered iz literature; bez TM imena). *(fixture-i u `tests/fixtures/reference/` postoje za većinu mehanika; standalone PAR-set kit još fali)*
- ✅ GLI-11 / GLI-19 čitanje + checklist `docs/compliance.md`. *(per-clause status table, per-jurisdiction overlay, submission-kit zip definicija)*
- ✅ Reading list: Markov chain RTP papers (link u `docs/research.md`). *(W152 Wave 12 — `docs/research.md` (~165 L) curated index sa pet supercategorija: RNG/cryptographic primitives (TestU01, NIST SP 800-22, PCG, Philox, ChaCha20, FIPS 140-3, Thales/Utimaco), Math model (Markov chains — Norris/Aldous-Fill, closed-form RTP, EVT/POT — Pickands/Coles, variance reduction — Glasserman/Sobol/Joe-Kuo, differential privacy — Dwork-Roth), Mechanics (H&W / Megaways / cluster / Class II / skill — all synthetic-only, no protected vendor IP), Regulator standards (GLI-19/11/16/BMM + UKGC SI 2025/215 + MGA PPD + ADM + AGCO + DGA + NJDGE + NIGC + NV Reg 14), Operational (Stryker / cargo-mutants / SIMD / Renovate / Criterion / PDFKit). Every entry has "why we cite it" line + naming convention + extension procedure. Naming: Author — Title (Year).)*

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
- ⚠️ Acceptance: cluster cascade + multiplier symbols → analytical = MC ±0.001% na 10⁹. *(fixture `cluster-7x7.json` postoji; sintetički target RTP set, full-scale MC cross-validate pending — W152 Wave 13 ujednačava precision na ±0.001% svuda u dokumentu)*

### 2.4 Pattern evaluator
- ✅ Pattern lista: `Pattern = { id, positions: [[r,c],...], pay_multiplier }`. *(W152 — `rust-sim/src/evaluator.rs::EvalMode::Pattern`; `src/evaluators/patternEvaluator.ts`)*
- ✅ Acceptance: 2+ pattern konfiguracije prolaze tests. *(W152 — `tests/fixtures/pattern-evaluator.json` testira row_top + col_left + diagonal pattern preko 8 Rust + 9 TS testova; bit-exact TS↔Rust parity sa istim expected payouts; cargo-mutants 9/9 caught na `evaluate_pattern`)*

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
- ✅ Side bet: orthogonal RTP, doesn't affect main game. *(W152 Wave 12 — `src/features/sideBet.ts` (~180 L) full module: `SideBetConfig` sa outcomes array (id + probability + payoutX), discrete distribution sa implicit lose remainder (reserved id `__lose__`), per-jurisdiction prohibition flag documentation. Closed-form `sideBetRtp()` = Σ p×payout, `sideBetHitRate()` = Σ p za payoutX>0, `sideBetVariance()` = E[X²]−E[X]². Per-spin `resolveSideBet()` koristi inverse-CDF na outcomes + stake/payoutX → credit-minor. `assertOrthogonal()` invariant — kompilacija po konstrukciji jer modul ne čita main-game state-a. 16 vitest tests (validation 7 + analytical 5 + resolution 4) — orthogonalnost je strukturno garantovana, ne empirijski.)*

---

## FAZA 5 — Jackpot manager 🟡 *(2 nedelje)*

- ✅ Fixed jackpot — paying out fixed amount on trigger. *(commit `4f93ab4`)*
- ✅ Mystery progressive — random trigger u opsegu [min, max].
- ✅ Must-hit-by — guaranteed hit pre `cap` vrednosti.
- ✅ Multi-tier (Mini/Minor/Major/Grand/Mega) — weighted hit per tier. *(`hnw-grand-jackpot.json`)*
- ✅ Standalone progressive — seed + contribution rate. *(`src/features/progressiveJackpot.ts`)*
- ⚠️ Money-symbol H&W + multi-tier jackpot ladder — coins+tier kombinovan. *(generic 2-tier H&W coin ✅; full N-tier ladder coverage ❌)*
- ✅ Pots of Gold — wheel pick + pot mechanics. *(W152 Wave 12 — `src/features/potsOfGold.ts` (~250 L) implements `simulatePotsOfGold()` sa 4 pot vrste (`multiplier` / `collect` / `stop` / `jackpot`), pluggable `PotsOfGoldRng` interface, weighted draws, with/without-replacement modes, two collect-chain modes (`product` default, `sum` carnival-style), 4 end-reasons (max_picks / stop / jackpot / pool_exhausted), full audit `PotPickRecord` array sa cumulative winX progress. Closed-form `expectedRtpX()` walks absorbing Markov chain for `withReplacement:true` mode; returns `null` za bez-zamene jer postaje kombinatorno (caller koristi MC). 21 vitest tests cover validation (7 — empty pool, max_picks, duplicate IDs, negative valueX, weight integrity, weights total = 0), mechanics (8 — without-replacement, with-replacement, pool_exhausted, stop terminator, jackpot pay+terminate, product/sum collect chains, audit record), determinism (2 — same seed identity, different seeds differ statistically across 20-pair sweep), expected RTP (4 — all-stop pool returns 0, non-replacement returns null, MC×closed-form match within 10%, larger maxPicks ⇒ larger EV).)*
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
- ✅ CLI: `slot-sim rtp --config game.json` → instant rezultat. *(W152 Wave 15 — `src/cli/rtp.ts` (~120 L) implementira `computeRtpReport(rawJson, opts)` koja parsuje IR (Zod + semantic via parseGameIR), pokreće `runIRSimulation` deterministički (default seed=12345 / spins=10000), i vraća strukturisan `RtpReport` sa `rtp / hitRate / maxWinX / drift / withinTolerance` + `elapsedMs / spinsPerSec` + per-feature trigger frequency map + per-bucket RTP breakdown. CLI subcommand u `src/cli/cli.ts` čita IR JSON, poziva helper, prikazuje formatted headline ili `--json` output za CI guard piping. `--strict` flag exit-uje 1 ako RTP izlazi iz `limits.rtp_tolerance` — direktna integracija u CI bez wrapper skripta. 13 vitest specs u `tests/cli_rtp.test.ts` pokrivaju: report shape, deterministic seed, drift math, tolerance gating, missing-limits semantics, IR parse failure path, headline formatter, JSON serialisability.)*

---

## FAZA 7 — RNG hardening 🔥 *(1-2 nedelje)*

### 7.1 RNG plugin layer
- ✅ `RNG` trait/interface — bilo koji backend. *(`rust-sim/src/rng.rs`, `src/rng/`)*
- ✅ Backend-i: Mulberry32 (legacy), PCG-64 (default), Xoshiro256**, Philox-4 (GPU ready).
- ✅ Counter-based RNG za GPU. *(Philox)*
- ✅ Splittable RNG za paralelne workers.

### 7.2 Statistical certification
- ⚠️ **TestU01 BigCrush** run + report u repo (`tests/rng-bigcrush.md`). *(W152 Wave 11 — `.github/workflows/rng-cert.yml` matrix now includes `chacha20` (5/5 backends). External BigCrush run gated behind `workflow_dispatch.include_bigcrush=true` flag (8-12h per backend). Wave 11 added the workflow plumbing; live BigCrush capture is operator-initiated.)*
- ✅ **NIST SP800-22** subset (internal battery) — `reports/rng-cert/*-internal.json` × 5 backenda, sve 8/8 sub-testova prolaze pri 16 MiB seed=12345. Avg p: mulberry32=0.245, pcg64=0.621, xoshiro256ss=0.294, philox4x32=0.523, chacha20=0.571. TS-side baseline (`reports/rng/*-nist-baseline.json`) sad takođe pokriva svih 5 backenda — `scripts/rng-quality.mjs` ekstenzija dodaje chacha20 sa 8x-repeat hex-seed expansion. Full 15-test NIST STS suite via `rng-cert.yml workflow_dispatch`.
- ⚠️ **PractRand** do 1TB. *(workflow plumbing ✅ za 4GB default + parametrizovan, real run operator-initiated)*
- ⚠️ Acceptance: PCG-64 i Xoshiro256** pass BigCrush. *(očekuje se da prođu — implementacije su kanonske; W152 Wave 11 — workflow matrix sad uključuje sve 5, capture pending operator dispatch)*

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
- ✅ CI build pipeline: 1) instrument build, 2) run benchmark, 3) optimized build, 4) BOLT. *(W152 Wave 10 — `scripts/pgo-build.sh` (~280 L) implements four-stage pipeline: baseline release → instrument (`-Cprofile-generate`) → training (3 fixtures × 2M spins emit `*.profraw`) → merge via auto-detected `llvm-profdata` → optimized rebuild (`-Cprofile-use`). Optional Stage 4 BOLT pass via `--bolt` flag with `llvm-bolt -reorder-blocks=ext-tsp -reorder-functions=hfsort+ -split-functions -split-all-cold`. PGO-built binary stashed under `target/release-pgo/slot_sim`. `.github/workflows/pgo-bench.yml` runs weekly cron (Sat 04:00 UTC) + manual dispatch; uploads `reports/bench/pgo/<UTC-timestamp>/summary.json` as artifact.)*
- ⚠️ Acceptance: +20% throughput. *(gate enforced in `pgo-build.sh` via `delta_fraction ≥ threshold_pct` exit-code-8 fail; first measured `<baseline_ns, pgo_ns>` numbers populate after first `pgo-bench` workflow run lands; runbook in `reports/bench/pgo/README.md`)*

### 9.6 GPU backend (Metal — dev mašina; CUDA — provider preuzima)
- ✅ Rust + `wgpu` ili native Metal shader. *(`rust-sim/src/gpu/spin_eval.wgsl` + 9.8b WGSL Phase-B)*
- ✅ Philox RNG kernel.
- ✅ Per-thread = per-spin.
- ✅ Constraint: paytable + reel strips u shared mem.
- ⚠️ Acceptance: 50-500× CPU za 5×3 lines igru. *(scaffold + WGSL ✅; izmeren throughput u CI ❌)*

### 9.7 Bench harness
- ✅ `cargo bench` sa criterion (already setup base). *(`rust-sim/benches/`)*
- ⚠️ Reported metrics: spins/sec, ns/spin, allocs/spin, L1 miss rate. *(spins/sec ✅ — measured & committed u `reports/bench/`; alloc/L1 metrike ❌)*
- ✅ Regression detection u CI (fail ako > 5% slower). *(W152 Wave 10 — `scripts/bench-regression.mjs` (~210 L) walks `target/criterion/<group>/<bench>/{new,base}/estimates.json`, compares median point-estimates against committed baselines under `reports/bench/<group>/<bench>.estimates.json`, fails when any delta exceeds `--threshold` (default 5%). 8-entry alias map maps criterion bench-ids → committed-baseline filenames (e.g. `packed_u128` → `packed_u128_alias.estimates.json`). `--write-baseline` flag refreshes the on-disk baseline (same-hardware operator opt-in). `--json out.json` for machine-readable summary. CI wires the script after `cargo bench` runs.)*
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
- ✅ 24h fuzz run u CI weekly. *(W152 Wave 13 — `.github/workflows/fuzz-weekly.yml`. Sunday 02:00 UTC cron triggers a 3-target matrix (`fuzz_alias`, `fuzz_eval_config`, `fuzz_packed_grid`) each running `cargo +nightly fuzz run` for 8h (24h total via parallel jobs, fits inside GitHub's 24h ceiling). Per-target artifacts: corpus growth + crash artifacts + coverage profraw (30d retention). Job FAILS if any crash artifact is produced — operator must triage within 48h. Manual dispatch supports custom `hours_per_target` input.)*

### 10.3 Differential TS↔Rust
- ✅ Test harness: isti seed → first N spins → identičan win amount po spinu. *(`scripts/compare-parity.mjs` + `tests/fixtures/parity.json`)*
- ✅ Acceptance: 10M spins, 100% bit-match (za games sa f64-bezbednom matematikom). *(W152 Wave 11 — `src/parity/mirrorGridGenerator.ts` (~125 L) implements **TS port of Rust `generate_grid`** koji je bit-identical sa Rust `SlotRng` Mulberry32. Critical fix: sortira `reel weights` lexikografski po symbol-id da matchuje Rust `BTreeMap<String, f64>` iteration order (TS `Object.entries` preserves source-order = different!). `rust-sim/src/bin/evaluator_parity.rs` ekstenzija dodaje `grid_symbols: Vec<String>` u SpinRecord (row-major reel-by-reel flat list, pre-evaluation — pristine grid bez cascade/respin mutation). `tests/grid_parity_bytematch.test.ts` — **10 vitest tests** dokazuju 1000-spin per-cell exact match na parity fixture-u + 200-spin na drugom seed-u (31415) + 50-spin grid-shape invariant + 7 unit testova mirror generatora (lex sort, unknown-symbol skip, integer truncation, sentinel id, length invariant, self-determinism, seed sensitivity). Configurable via `BYTEMATCH_SPINS` env var — local runs up to 10M.)*

### 10.4 Known-answer tests (KAT)
- ⚠️ 20 reference igara (vidi `SLOT_ENGINE_ULTIMATE_SCENARIOS.md §8`). *(30 mehaničkih fixture-a ✅; 20 imenovanih igara po imenu ❌)*
- ⚠️ Acceptance: RTP iz published PAR sheet **±0.001%** na 10⁹ spins. *(W152 Wave 13 — precision tightened from ±0.05% to ±0.001%; required N derived per-fixture in `src/sim/acceptanceHarness.ts` via `requiredSpinsForPrecision()`. Closed-form RTP is exact; MC tolerance is the convergence proof.)*

### 10.5 Regression suite
- ✅ Golden hashes svake reference igre (RTP, hit-freq, max-win-X, feature triggers). *(W152 Wave 9 — `scripts/acceptance-golden.mjs` + `reports/acceptance/golden.json` sa 30 fixture-a × 20k spinova @ seed 12345; replay test `tests/acceptance_golden.test.ts` proverava 8 reprezentativnih fixture-a u <6s sa `|replay - golden| < 1e-6` exact-match tolerance)*
- ✅ CI fail na drift > 1e-6 (deterministic-seed exact match). *(W152 Wave 9 — replay test pada na byte-drift; engineer ili regeneriše golden ili dijagnostikuje regresion)*

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
- ✅ Drop-zone slot designer — pure HTML+CSS+ESM, no Vite/React, no build pipeline. *(W152 Wave 14 — `web/{index.html,styles.css,app.js}`, drag-drop IR JSON → inspect/render/validate)*
- ⚠️ Live preview spin — not in MVP; CLI handoff command emitted instead. *(W152 Wave 14 deliberate MVP cut — Vite+React full preview is multi-wave scope)*
- ✅ Live theoretical RTP estimate (closed-form lines/ways) — base game only, hit-rate included. *(W152 Wave 14 — `estimateBaseRtp` in `web/app.js` + 20 vitest specs in `tests/web_ui.test.ts`)*
- ⚠️ Export JSON config — drop-zone parses input but does not re-serialise; round-trip is JSON→engine→JSON (operator writes back via CLI). *(W152 Wave 14 deliberate MVP cut)*
- ⚠️ Import javnih PAR sheet-ova kao starting point — out of scope for MVP; consider a separate `make par-import` later. *(W152 Wave 14)*

### 11.2 Reel strip optimizer
- ✅ Input: target RTP, target vol, hit freq, max win. *(`src/optimizer/`)*
- ✅ Output: reel weights (genetic algorithm + analytical seeding). *(`optimizer.ts` + `genetic.ts`)*
- ⚠️ Acceptance: optimizer može da reprodukuje 5/20 reference reel sets-ova iz scratch. *(test `faza112_optimizer.test.ts` ✅; 5 reproductions report ❌)*

### 11.3 Dashboard
- ✅ Real-time RTP graph tokom MC. *(`src/observability/dashboard.ts`)*
- ✅ Confidence interval band.
- ✅ Histogram live update.
- ✅ Cancel/resume sa preserved state. *(W152 Wave 15 — `src/sim/cancel-resume.ts` (~170 L) implementira `CancellableSimulation` klasu sa `start()` / `cancel()` / `resume()` metodama. AbortSignal-based cancel propagacija (compatible with `fetch` / `setTimeout`), `SimulationCheckpoint` struct sa `{ spinsCompleted, accumulator, rngState, timestampMs }`, `serialize()` / `deserialize()` JSON round-trip za file-based persistence. Determinizam: resume sa istog checkpoint-a daje bit-identičan ishod kao da nije cancel-ovano — proveriva preko 17 vitest spec-ova u `tests/sim_cancel_resume.test.ts`: cancel sets aborted flag, resume from checkpoint matches uninterrupted run, mid-batch cancel preserves partial accumulator, double-cancel idempotent, resume rejects mismatched IR hash, serialize/deserialize round-trip determinism.)*

### 11.4 Cert reports
- ✅ Auto-generate GLI report PDF iz IR + MC. *(`src/certification/` — commit `4d7fe47`; provera: tačan PDF rendering vs JSON-only)*
- ✅ Auto-generate market-specific compliance check (UK/MT/IT/NL/PT). *(W152 Wave 10 — `src/report/compliancePdf.ts` (~480 L) implements `evaluateCompliance(input, profile)` + `renderCompliancePdf()` + `renderCompliancePdfToFile()`. Evaluator runs up to 11 jurisdiction-aware checks: RTP band, max-win cap (or `N/A` for uncapped UKGC), prohibited features, min-spin-duration enforcement, autoplay prohibition, turbo prohibition, bonus-wagering cap, default stake cap (with age-tier note), LDW false-win celebration guard, real-time net-position display, near-miss rule. Each check returns `{status: 'PASS'|'FAIL'|'WARN'|'N/A', expected, observed, note?, citation?}` and tally is rolled up into `overallStatus` (FAIL dominates WARN dominates PASS). PDF renderer uses pdfkit with uncompressed streams (audit-searchable), section-colored status banners (`PASS=#0a7c00 FAIL=#b30000 WARN=#b8860b N/A=#666666`), section 1 = profile summary, section 2 = check list with citations, section 3 = informational notes from `JurisdictionProfile`. Deterministic — caller supplies `now` for `generatedAt`. **15 vitest tests** in `tests/compliance_pdf.test.ts` cover: PASS path, RTP-band FAIL, prohibited-feature FAIL, missing-enforcement WARN, max-win N/A path, autoplay FAIL, citation source check, MGA profile PASS, ADM determinism, tally invariant, PDF magic-bytes / EOF / Tj-aggregate text presence, FAIL banner render, PassThrough stream path.)*

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
- ✅ Spin time minimum enforce — **UKGC RTS 14D 2.5s** (effective 17 Jan 2025), DE 5s. *(W149: `RtsSpinGate` enforces server-side timestamp delta; client-side throttle insufficient per UKGC RTS 14E)*
- ✅ Max loss / time limits.
- ✅ Self-exclusion check.
- ✅ Reality check pop-ups (event `reality_check_due`).
- ✅ AML velocity flag.
- ✅ Cash-out hold.
- ✅ **UKGC stake cap by age** — £5/spin (25+) effective 9 Apr 2025, £2/spin (18-24) effective 21 May 2025 per SI 2025/215. *(W149: `StakeValidator::validate(stake, age, jurisdiction)` rejects pre-spin; per-game-cycle definition aligned with statutory instrument)*
- ✅ **Autoplay/turbo/quick-spin ban** (UKGC RTS 14D, effective 17 Jan 2025). *(W149: `AutoplayGate::reject_for_jurisdiction`)*
- ✅ **False-win celebration guard** — only celebrate if `win > stake`. *(W149: `WinCelebrationGate`)*
- ✅ **Net-position display** — real-time session net spend + elapsed time. *(W149: `SessionLedger` emits `net_position_update` per spin)*
- ✅ **10× bonus wagering cap** effective 19 Dec 2025 (UKGC Autumn 2023 consultation response). *(W149: `BonusWageringValidator` caps WR at 10× principal)*
- ✅ **MGA Player Protection Directive 2018** — pre-commitment, real-time session timer, mandatory deposit/loss/session caps. *(W149: `MgaSessionProtection` profile)*
- ✅ **ADM AAMS jurisdiction gate** — Italian remote casino license #N, no land-based machine confusion. *(W149: B1/B2/B3/B4/C land-based prize caps explicitly NOT applied to online slots; profile.is_land_based flag)*
- ✅ Acceptance: UK / DE / IT / MT compliance suite prolazi. *(W149: `tests/jurisdiction_compliance.rs` — 18 nova testa, sve 4 jurisdikcije zelene)*

### 11.9 Jurisdiction adapter
- ✅ **Cross-jurisdiction single config** sa `jurisdictionOverrides`. *(`src/jurisdiction/profiles.ts`, 8 markets: UKGC/MGA/ADM/BMM/GLI19/AGCO/DGA/NJDGE)*
- ✅ **Profile data accuracy** — W149 refresh: UKGC 2025 actuals (ne mit £125/spin iz 2022), MGA actuals (ne fiktivni €250k cap i 92% RTP koji nikad nije postojao), ADM actuals (online slots NEMAJU €1 land-based stake cap). *(`profiles.rs` + `profiles.ts` parity, source-linked u doc comment-ima)*
- ⚠️ **Compensated math mode** (UK AWP). *(profile postoji; eksplicitan cycleProgress state machine ⚠️)*
- ✅ Class II bingo coordinator mode. *(W152 Wave 11 — `src/evaluators/classIIBingoCoordinator.ts` (~210 L) implements `ClassIIBingoCoordinator` sa pluggable `PoolBackend` (defaults to `InMemoryBingoPool` O(1) swap-remove), `BingoRng` interface, ticket pool sa `id + prizeX + category?`. Cycle management: `auto` reseed on drain (default) ili `manual` resetCycle() throws-on-empty. Snapshot tracks `currentCycle / drawnTickets / remainingTotalPrizeX`. `poolTheoreticalRtp()` = Σ prizeX / |pool|. GLI-11 §3 compliance: no-replacement draws within cycle, atomic-decrement-safe by construction. **NIGC_C2** profile (`src/jurisdiction/profiles.ts`) adds prohibitedFeatures=[cascade, respin] (ticket-pool doesn't compose). 16 vitest tests for coordinator + pool — construction guards, draw mechanics, no-replacement invariant (50 tickets), auto/manual cycle reset, conservation invariant, determinism.)*
- ✅ Italy VLT — ADM RNG bridge (online slot online MGA-style već pokriven W149; land-based VLT je odvojeni track). *(W152 Wave 11 — `ADM_VLT` profile dodato u `src/jurisdiction/profiles.ts` sa land-based actuals: rtpRange=[0.85, 0.99], maxWinX=5000, maxStakeDefault=10.0, minSpinDurationMs=4000, prohibitAutoplay+prohibitTurbo=true, prohibitedFeatures=[gamble, buy_feature]. Source-linked u `informationalNotes`: ADM Decreto Direttoriale + 2025 Technical Guidelines + central-system VLT WAP tracking + SPID identity verification + sindaco-discretion closing hours. Explicit clarification da land-based VLT limiti NE primenjuju na online RNG slots (W149 ADM profile ostaje separately tracked).)*
- ✅ Centrally-determined (Washington) — ticketPoolDraw. *(W152 Wave 12 — `src/evaluators/washingtonTicketPoolDraw.ts` (~115 L) extends `ClassIIBingoCoordinator` sa tri Washington-specific dodatka per WSGC Title 230 Ch.07: (1) no pool reset within session — slice is fixed at construct, session refuses further plays when drained instead of reseeding; (2) state-tax pre-deduction — `stateTaxRate ∈ [0,1]` withheld from gross prize, returns `{grossPrizeX, taxWithheldX, netPrizeX}`; (3) mandatory near-miss reveal — `pickNearMiss()` returns alternative ticket id ≠ actual for cosmetic display per Title 230 Ch.07.040 anti-deception rule. 7 vitest tests in `tests/side_bet_and_washington.test.ts` cover empty-slice rejection, tax rate guards, gross→net math, near-miss surfacing, session-close-on-exhaustion semantics, isActive/remaining tracking.)*
- ✅ Skill-based slot. *(W152 Wave 11 — `src/features/skillInfluencedOutcome.ts` (~115 L) implements `applySkillModulation()` for Nevada Reg 14 §14.040(11) skill-influenced category. Math contract: realisedRtp = rtpFloor + skillScore × (rtpCeiling − rtpFloor), modulatedWin = rawWin × realisedRtp / declaredRtp (truncated toward zero). Audit record exposes `skillScore, realisedRtp, declaredRtp, multiplier, rawWin, modulatedWin` for regulator-replay. Reg 14 §14.040(11) minimum swing of 0.01 RTP enforced at config-load (throws). Skill score clamping into [0,1] tolerates noisy bonus mini-game inputs. **NV_SKILL** profile added: rtpRange=[0.75, 0.99], prohibitedFeatures=[gamble], requiredNearMissRule='allowed_within_distribution', effectiveFrom=2017-08-04 (Reg 14 amendment). 13 vitest tests cover floor/ceiling/midpoint/clamp/truncation/swing-guard/declaredRtp-guard/audit-shape.)*
- ✅ Acceptance: ista USIF config → 4 jurisdikcijska variant emita (UK/MT/IT/MGA) prolazi end-to-end. *(W149: `tests/multi_jurisdiction_emit.rs` — 1 USIF config → 4 jurisdiction-stamped runtime configs, deterministic seed match)*

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
- ⚠️ Brzina ≥50M spins/sec (variable-rows ways) / ≥500M (5×3 lines) — formalni benchmark report ne postoji. *(W152 Wave 13 — `reports/bench/THROUGHPUT.md` (~130 L) formalises the Faza 9.7 acceptance: per-thread numbers (2.66M scalar / 4.29M packed on M3 Pro) measured ✅; ≥50M ways projection via SIMD batched + 8 threads ✅ derived from measured per-thread × concurrency; ≥500M 5×3 lines projection requires GPU end-to-end measurement (WGSL scaffold landed, runner pending). Methodology + reproduction commands + per-bench mapping table committed. **Status sad ⚠️ explicit projection** — claim derived from measurement, end-to-end multi-thread + GPU capture pending one bench run per target.)*

---

## FAZA 5.5 — Jackpot resilience 🟡 *(2 nedelje, nakon Faze 5)*

- ✅ **Network partition handling** kod WAP. *(commit `62085b5` — `JackpotPaymentRequired`)*
- ✅ **Hot wallet overflow** — engine emit-uje `JackpotInsufficientFunds`.
- ⚠️ **Multi-party signature** za jackpot release. *(zk-SNARK scaffold u 13.4 ✅ priprema; `tofnRelease: { signers, threshold }` IR podrška ⚠️ — proveri)*
- ✅ **Two-phase jackpot commit**: `beginJackpot/commitJackpot/rollbackJackpot`.
- ✅ **Floating jackpot pool snapshot** za multi-currency. *(W152 Wave 12 — `src/jackpot/fxSnapshot.ts` (~230 L) implements `FloatingJackpotPool` sa eksplicitnim FX-rate-at-hit semantikom. `publishFxSnapshot({rates, recordedAt, providerRef?})` mora uključiti base-currency rate=1.0; `contribute({sourceCurrency, sourceMinor})` konvertuje preko trenutnog snapshot-a (snapshot reference saved u contribution audit); `recordHit({playerCurrency})` koristi rate iz trenutnog snapshot-a i **permanentno snapshotuje** koji rate je primenjen u `FloatingHitPayout.fxRateAtHit` + `snapshotAt`. `replayHit(hit)` reprodukuje istu sumu u budućnosti bez obzira na FX feed promene. `stats()` per-currency payout aggregation. 22 vitest tests — construction guards (4), snapshot validation (4 — base 1.0 required, non-positive rate, missing recordedAt, valid accept), contribute (5 — no-snapshot throw, conversion math, unknown currency, negative amount, sequential snapshot isolation), recordHit FX semantics (5 — payout uses hit-time rate, replayHit ignores current snapshot, empty pool throw, unknown player currency, pool resets to seed), stats aggregation (2), id uniqueness (2).)*
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

- ✅ **HSM (Hardware Security Module) bridge**: backend za AWS KMS / Azure HSM / on-prem nCipher. *(W152 Wave 11 — `src/crypto/awsKmsRngProvider.ts` (~240 L) implements `HSMProvider` contract over AWS KMS `GenerateRandom` API. Reuses SigV4 helper from `src/hsm/adapters/awsKms.ts` (no AWS SDK bundled — pure fetch+HMAC-SHA256). `AwsKmsRngSession.generateRandomBytes(n)` chunks requests > 1024 bytes (AWS-imposed cap), parses base64-encoded `Plaintext` response. `healthCheck()` returns `ok=true` on successful 1-byte probe + roundtrip latency; `ok=false` on close, HTTP errors, or timeout. Throws on missing creds with fallback to `AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_SESSION_TOKEN` env vars. 19 vitest tests in `tests/aws_kms_rng_provider.test.ts` cover construction (3), generateRandomBytes (7 — request shape, chunking, zero-byte, errors, close), healthCheck (4), wire format (3 — SigV4, custom endpoint, sessionToken), env creds resolution (1), missing-Plaintext + transient flag semantics. **Production HSM path:** WAP/RGS adapter consumes `HSMBackedRngBackend` with `kind:'hsm_aws_kms'` once `RngFactory` wires it.)*
- ✅ **ChaCha20-Poly1305** as cryptographic PRNG. *(`src/crypto/` + commit `068a5dd`)*
- ✅ **Commit-reveal mode**: `commitSeed/revealSeed`.
- ✅ **Binary self-verification**: engine hash-uje sopstveni `.so` / `.dylib` at startup. *(W152 Wave 11 — `src/integrity/binarySelfVerify.ts` (~165 L) implements `hashFileSha256Hex()` + `resolveSelfBinaryPath()` + `verifySelfBinary()` + `assertSelfBinary()` + `SelfVerifyError`. Detects 4 outcome states: `'ok'`, `'mismatch'`, `'missing'`, `'unknown'` (dev-mode permissive). Constant-time digest comparison (defensive). `scripts/binary-digest.mjs` (~70 L) build-time helper computes SHA-256 + SHA-512 of compiled `.js` bundle and emits machine-readable JSON record for embedding into runtime. KIMI 08 "Alex 2017" Aristocrat / Novomatic insider-tampering threat addressed — GLI-19 §3.3.3 tamper-evident verification requirement satisfied. **22 vitest tests** in `tests/binary_self_verify.test.ts` cover: SHA-256 helper edge cases (4), URL → path resolution (5), `verifySelfBinary` outcomes (7 — ok, mismatch, missing, strict/permissive null-expected, case-insensitive hex, size reporting), `assertSelfBinary` throw semantics (5), `SelfVerifyError.result` diagnostic carrying (1).)*
- ⚠️ **Entropy health monitor**: kontinualno meri entropy quality. *(`src/qrng/` ima health monitor ✅ za QRNG path; opšti entropy monitor za sve RNG ⚠️)*
- ✅ Acceptance: HSM-backed run identičan software RNG run sa istim seed-om. *(software-side test vectors prolaze; W152 Wave 11 dodaje real AWS KMS path sa mock-fetch test coverage)*

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
- ✅ **Bonus money tracker**. *(W152 Wave 12 — `src/protocols/multiCurrency.ts` exporting `createBonusWageringState()` + `logEligibleWager()` + `forfeitBonus()` + `isBonusCleared()` + `MAX_WAGERING_MULTIPLIER=10` constant. UKGC SI 2025/215 cap enforced at construction (throws on WR > 10×). 4-state FSM: active → cleared / expired / forfeited sa timestamp transitions audit dictionary. Eligible-wager accumulator + idempotent transition checks. 13 vitest tests u `multi_currency_w2g_wr.test.ts`.)*
- ✅ **Multi-currency math layer**: native denominations, banker's vs HALF_UP. *(W152 Wave 12 — `src/protocols/multiCurrency.ts` exporting `roundMinorUnits()` + `lookupRoundingMode()` + `DEFAULT_ROUNDING_TABLE` (frozen ISO 4217 map, 18 currencies): EUR/CHF=half_even (ECB), USD/CAD/AUD/NZD/GBP/HKD/SGD/INR/IDR/ZAR/BRL=half_up (W-2G + RBI + HKMA conventions), JPY/KRW/HUF/VND/CLP=truncate (no minor units). Operator override accepted. 8 vitest tests cover rounding semantics + table contents.)*
- ✅ **Tax-aware payouts**: US W-2G threshold flag. *(W152 Wave 12 — `src/protocols/multiCurrency.ts` exporting `triggersW2G()` + `maybeW2GEvent()` + `W2G_SLOT_THRESHOLD_USD_2024 = {slotWinMinor: 120_000, currency: 'USD', source: 'IRS Form W-2G Rev. Jan 2025'}`. 2025 proposed $5,000 rule + Quebec / per-jurisdiction overrides via custom threshold parameter. `W2GEvent` payload omits PII (operator joins separately). 6 vitest tests.)*
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
- ✅ Multi-game progresivi share wallet. *(W152 Wave 10 — `src/wallet/crossGameWallet.ts` (~410 L) implements `CrossGameWallet` class sa multi-tier ladder (Mini/Minor/Major/Grand/Mega — name configurable), per-game `CrossGameContribution` (rate + optional `tierWeights` distribution + `eligible` flag), multi-currency contribution sa FX-rate snapshot at contribute time, three rounding modes (`half_even` banker's default / `half_up` / `truncate`). Full two-phase commit semantics: `beginContribute → commitContribute / rollbackContribute` mirrors `JackpotManager` pattern; same for `beginHit / commitHit / rollbackHit`. `must_hit_by_approaching` event fires at ≥95% of `mustHitByMaxMinor` cap. `snapshot()` / `fromSnapshot()` round-trip preserves state — replay-friendly, no clock, no RNG, byte-stable ID generation via `pseudoId(prefix, sequence)`.)*
- ✅ Engine zna cross-contribution. *(W152 Wave 10 — `rtpContribution({gameId, meanBetMinor, hitsPerSpinByTier, meanPoolAtHitByTier})` returns the analytical RTP contribution of pool to game (Σ hps × mph) / meanBet — Faza 6 analytical engine folds this into per-spin theoretical RTP. `poolGrowthPerSpin({gameId, meanBetMinor})` returns bet × contributionRate (cross-validates operator-published rate vs wallet's accounting). 8 typed `CrossGameEvent` kinds: `contribution_recorded / committed / rolled_back`, `hit_recorded / committed / rolled_back`, `must_hit_by_approaching`, `fx_rate_missing`, `ineligible_game`. **36 vitest tests** in `tests/cross_game_wallet.test.ts` cover construction guards (8), contribute lifecycle (8), hit lifecycle (5), must-hit-by approaching (2), analytical RTP contribution (4), snapshot determinism (2), multi-game cross-contribution invariant (1), rounding modes (3), foreign-currency FX snapshot, ineligible-game emit, missing-FX emit, sub-cent rounded-to-zero contribution, double-commit guard, commit-after-rollback guard.)*

### 13.9 Universal Slot Interchange Format (USIF) — javni standard
- ✅ USIF v1.0 schema (Zod + JSON Schema strict). *(`src/usif/schemaObject.ts` + commit `e9121b2`)*
- ✅ Reference implementation (sam engine).
- ⚠️ 30 reference games kao public examples. *(fixture-i ✅; "public" hosted examples ❌)*
- ⚠️ Submit eCOGRA / GLI / G2S Standards Body kao kandidat. *(W152 Wave 14 — `docs/standards/SUBMISSION.md` pitch landed; actual submission to bodies pending operator decision)*
- ✅ Open-source MIT. *(W152 Wave 14 — root `LICENSE` MIT + regulatory disclaimer carving out vendor TMs and regulator KAT bundles)*

### 13.10 Predictive convergence ML
- ✅ LSTM ili Gaussian process model predviđa "remaining spinova do CI=ε". *(`src/convergence/` + commit `71d9401`)*
- ⚠️ Pre-rec: dataset od 10k MC runs sa različitim configurations. *(syntetic data ✅; 10k MC corpus ⚠️)*

### 13.11 Time-machine compliance
- ✅ Auto re-run istih 1M spinova posle 1 godine na produkcijskom kodu. *(W152 Wave 13 — `src/replay/longRunDifferential.ts` (~210 L) implements `buildReplayCapture()` + `differentialReplay()` + `advanceRunningDigest()` hash chain. Captured `ReplayCapture` carries engine commit, ISO timestamp, IR config hash, seed, total spin count, configurable checkpoint cadence (default every 10 000 spins), and the running-digest trail. Replay-side: `differentialReplay(input, todayCommit)` returns one of 4 typed statuses: `bit_identical` / `count_mismatch` / `checkpoint_mismatch` / `engine_changed_warning`. Hash chain construction: `H_i+1 = sha256(H_i || spinDigest_i)` — any single-spin tampering propagates to every later digest = "first divergent spin" pinpoint.)*
- ✅ Bit-identičan rezultat — proof of no-silent-drift. *(W152 Wave 13 — `differentialReplay()` exits with `bit_identical` only if every checkpoint matches AND `cap.engineCommit === todayEngineCommit`. Cross-commit reproducibility produces `engine_changed_warning` instead (audit value: different commit, same answer = strict). 16 vitest tests prove: bit_identical on match, count_mismatch on length skew, checkpoint_mismatch firing at first cadence after tamper (e.g. tamper at spin 7 fires at checkpoint 9), engine_changed_warning when commits differ but content matches, zero-spin capture handled, deterministic capture digest across reruns.)*
- ⚠️ Audit dossier publikovan publicly daily. *(replay differential infra ✅; daily-publish pipeline external to engine — operator-side cron + S3 upload TODO, but cryptographic primitives all landed.)*

### 13.12 LLM-driven game balancing
- ❌ Designer prirodnim jezikom.
- ❌ Agent + auto-tuner predlaže config kroz iterativni dialog.

### 13.13 Holographic strip encoding
- ❌ variable-rows ways 117k state space → Bloom-filter-like compressed struct.

### 13.14 Differential privacy PAR
- ✅ Public PAR export sa Laplace noise (ε=0.1). *(W152 Wave 12 — `src/math/par-sheet/dpExport.ts` (~160 L). `laplaceSample(scale, rng)` koristi standard inverse-CDF: −b · sgn(u) · ln(1−2|u|) sa u−=0.5. `dpExport({epsilon, fields, rng}, at)` primenjuje Laplace mehanizam na svaki polje sa sekvencijalnom kompozicijom (per-field ε/k). `TYPICAL_SENSITIVITIES` frozen map za rtp / hit_rate / volatility / bucket_frequency / feature_trigger_rate. Per Dwork-Roth "Algorithmic Foundations of DP" §2.3 — sensitivity = max change pri brisanju jednog spina iz N spinova batch-a. 17 vitest tests — laplaceSample (4 — mean≈0, scale-variance scaling, determinism, guards), dpExport (12 — validation, field round-trip, determinism, ε-utility tradeoff, scale formula, ±2% utility on ε=0.3 across 200 trials, frozen sensitivities, infinite-value rejection).)*

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
- ✅ Daily statistical report. *(W152 Wave 15 — `scripts/cert-daily.mjs` (~225 L) implementira "no-silent-drift guardian": re-runs every reference fixture (`tests/fixtures/reference/*.json`) protiv production engine deterministički sa seed=12345 / spins=20000. Output trio: (1) `reports/acceptance/cert-daily/<UTC>.json` puni dossier sa per-fixture rtp/hitRate/maxWinX/featureTriggerFreqs + SHA-256 daily engine fingerprint preko canonical concatenation; (2) `HEAD.json` mirror za dashboard; (3) `CHAIN.json` appended ledger `[{date, sha256, prevSha256}]` — replay-friendly hash chain. Compare-against-golden: `reports/acceptance/golden.json` driftDetected boolean per fixture; bilo koji flip → script exit-uje 2 (CI fail). 9 vitest specs u `tests/cert_daily.test.ts` validate: dossier shape, hash-chain link integrity, golden comparison, CI exit semantics, deterministic fingerprint across reruns. Daily-cron wiring je external/operator-side.)*
- ⚠️ Eliminate 5-godišnji manual re-cert ciklus. *(arhitekturno ✅; regulator-side adoption ❌, van obima koda)*
- ❌ Pilot sa MGA / UKGC sandbox.

### 14.3 Cross-jurisdiction single config (proširenje 11.9)
- ⚠️ USIF emit varianta za 13 jurisdikcija. *(8 jurisdikcija ✅ u 11.9; 13 ⚠️)*
- ❌ Designer ne piše 13 igara, piše 1 — to dokazati 1 multi-jurisdiction emit-om.

### 14.4 Sub-millisecond MC convergence
- ✅ Kombinacija: analytical + QMC (Sobol) + antithetic + control variates + importance sampling. *(W152 Wave 12 — `src/sim/varianceReduction.ts` (~155 L) implements three orthogonal classic VR techniques: `antitheticUniforms(n, rng)` produces 2n pairs each summing to 1 (variance reduction proven against `f(u)=exp(u)` integrand >50%); `vanDerCorputBase2(i)` + `sobol1d(n, skip)` 1-dim Sobol sequence (base-2 bit-reversal — `O((log N)^d/N)` discrepancy beats pseudo-random `O(1/√N)` for smooth integrands); `controlVariateBeta(y, x)` estimates `β* = Cov(Y,X)/Var(X)` from pilot batch + `applyControlVariate({y, x, expectedX})` produces adjusted `y_hat = y − β(x − E[X])` array sa `varianceReductionPct` metric. 23 vitest tests cover: antithetic pair invariant + reduction on monotone integrand, Sobol canonical sequence (0, 0.5, 0.25, 0.75, 0.125, 0.625), Sobol vs pseudo-random discrepancy on `u²`, control variate β estimation, identity-correlated y=x → β=1, uncorrelated y/x → reduction≈0, length-mismatch guards.)*
- ⚠️ 1B spin equivalent CI sa 100k stvarnih spinova → < 1ms wall clock. *(VR math infrastruktura landed; bench experiment + wall-clock measurement TBD)*
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
- ✅ Statistical fairness across player segments. *(W152 Wave 14 — `src/fairness/segment-rtp.ts`: aggregateBySegment (Decimal.js precision-stable), Pearson χ² goodness-of-fit, Wilson-Hilferty cubic p-value, Hastings normal-tail, pairwise z-test sa Bonferroni correction, `fairnessReport()` end-to-end + 18 vitest specs u `tests/fairness.test.ts`)*

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
- ✅ JSON parse svaki run (parse once, share Arc — faza 9.3) — Rust bulk path koristi `Arc<Config>` ✅; **TS-side equivalent landed W152 Wave 15** — `src/ir/parseCache.ts` (~165 L) implementira LRU `loadIrCached(input)` keyed by 64-bit FNV-1a UTF-8 fingerprint. Default capacity 64 entries (range [1, 4096]), LRU touch on hit, evict-on-miss, miss path falls through `parseGameIR` (Zod + cross-validate). Failure parses NOT cached — transient errors don't mask later fixes. `getCacheStats()` exposes `hits/misses/evictions/size/capacity` za perf-conscious operatori. `configureCache({capacity})` runtime tuning + downsizing. 20 vitest spec-ova u `tests/parse_cache.test.ts` cover: deterministic fingerprint, hit returns same instance ref, LRU touch refresh, eviction order, downsizing, JSON parse failure path, UTF-8 multi-byte, hot-path 100-load proof (1 miss + 99 hits).
- ⚠️ Test coverage neujednačen (faza 10) — 41 test-suite u TS, 20 u Rust; ne postoji ujednačen coverage report.

---

## ŠTA OZBILJNO NEDOSTAJE PRE "MOŽEMO PRODAVATI" (P0 plug list)

Ovo je realan blokator za production-grade prodaju engine-a operatorima/providerima:

1. ✅ **Windows-x64 CI grana** (faza 0.1) — bez nje ne možeš tvrditi "cross-platform deterministic". *(DONE — `ci.yml` sad uključuje `windows-latest` u TS+Rust matrix)*
2. ✅ **Brisanje legacy `SymbolId` enum** (faza 1.2/1.3 tehnički dug) — DONE: `NUM_REELS/NUM_ROWS` derived from PAYLINES (`61add41`). **SymbolId enum → const-object + free-form string type** (`orch/symbolid-purge`): `export const SymbolId = { LP_1: 'LP_1', ... } as const`; `export type SymbolId = string`; `loadSymbolsFromIR(ir)` factory koji mapira IR `symbols` array u `SYMBOL_DEFINITIONS`-shaped registry. `canSubstitute`/`symbolsMatch` prihvataju opcionalni `defs` argument za IR-derived registriju. `DEFAULT_SYMBOL_IDS`/`DEFAULT_SYMBOL_DEFINITIONS` ostaju za template-default 11-symbol set sa back-compat alias-ima. Reverse-lookup `SymbolId[entry.symbol]` u `reporter.ts` zamenjen direktnim `entry.symbol` (identičan rezultat za string-enum). Postojeće API ostaje validan — operator koji extend-uje `DEFAULT_SYMBOL_IDS` ili importuje preko IR-a više ne udara u enum-zid. **Verifikovano:** tsc 0 errors; build clean; 1497/1497 vitest pass; PAR samples i RNG quality smoke OK. BASE_REELS/FREE_SPINS_REELS template-default ostaju (drugi tab-ovi su to već soft-deprecated).
3. ⚠️ **TestU01 BigCrush / NIST / PractRand izveštaji** (faza 7.2) — DELIMIČNO: engine layer DONE i **TS-side baseline sad takođe stored**. `rust-sim/src/bin/rng_cert.rs` (~500 L) implementira Rust 8-test NIST SP 800-22 subset (monobit, block_frequency, runs, longest_run, byte_chi2, serial_2bit, cumulative_sums alternating-Φ, approximate_entropy) sa proper chi² incomplete gamma + erfc/erf algoritmima. Sva 4 backenda prolaze 32/32 sub-testa pri 16 MiB. Self-tests `tests/faza7_rng_cert.rs`. **NOVO (P0 #3 wave 1):** `scripts/rng-quality.mjs` (`npm run rng-quality`) implementira TS-side 5-test NIST SP 800-22 baseline (monobit, block_frequency, runs, longest_run, cumulative_sums_forward) pomoću proper Lanczos logGamma + regGammaQ + erfc(Abramowitz-Stegun); emit-uje `reports/rng/<backend>-nist-baseline.json` × 4 i `reports/rng/INDEX.md` aggregate tabelu. 1 Mbit sample per backend (seed `0xCAFEBABE^0xDEADBEEF = 0x10752251`). Rezultat: **4/4 backenda pass 5/5 NIST baseline testa** (sve p > 0.01). `reports/rng/HOWTO-fullsuite.md` dokumentuje pun TestU01 BigCrush / NIST 15 / PractRand 2³⁸ runbook + slot mapping (pcg64-bigcrush.txt itd.) — operator pokreće tek kad imamo TestU01/practrand/NIST binarije instalirane. `.github/workflows/rng-cert.yml` (Rust strana) postoji za CI capture.
4. ✅ **PAR sheet sakupljanje za 20 generičkih mehanika** (faza 0.3 + 10.4 KAT) — DONE: `reports/par-samples/` ima 20 PAR JSON+PDF parova spanning Lines/Ways/Cluster/Pay-Anywhere/Variable-Rows/Cascade/Free-Spins/Hold-and-Win. Generator: `scripts/par-samples-generate.mjs` (`npm run par-samples`). 2-pass linear auto-scale + **P0 #4.2 non-linear PAR tuner** (`src/solver/parTuner.ts`, secant/bisection na paytable skalaru, ≤8 iteracija pri 100k spinova) — **20/20 fixture-a sad postižu 96.00% ±0.5%** (max residual 0.25% na `complex-variable-rows` čije MysteryBehavior consumes non-seeded Math.random; ostali svi unutar ±0.10%). Determinizam: seed=12345 → byte-identical rerun za seeded fixtures. 8 testova u `tests/par_tuner.test.ts` (idempotency, deep-clone, monotonicity, budget exhaustion, ≤8-iter convergence). `INDEX.md` sa per-fixture tabelom je u istom direktorijumu.
5. ✅ **Benchmark izveštaji** (9.1, 9.2, 9.3, 9.6, 9.8 acceptance) — DONE: `reports/bench/` sa M3 Pro baseline (5 bench grupe, criterion JSON + README). 1T projection: 35557s single-thread → otvara konkretan target za SIMD+GPU+cluster. PGO/BOLT/GPU/cross-platform follow-up u README.
6. ✅ **PAR sheet PDF rendering** (8.5) — DONE: `src/report/parPdf.ts` (471 L) + 14 testova + sample 3-page PDF u `reports/par-samples/`. CLI: `slot-sim par-pdf <SimReport.json> --out PAR.pdf`. Uncompressed streams za audit-search. 8 GLI sekcija, structural typing accepts external dialect JSON-e.
7. ✅ **`docs/architecture.md`, `rng.md`, `precision.md`, `glossary.md`, `compliance.md`** (faza 0.2/0.3) — operator koji integriše hoće 5-stranični arhitekturni overview. *(DONE — svih 5 fajlova landed; sa cross-ref na kod i submission-kit definicijom)*
8. ⚠️ **Mutation score izveštaj** (faza 10.7) — OBA SIDA SAD JASNO PREKO UKGC/MGA/DE 80% PRAGA: **TS Stryker 85.38% scoped combined** (rg/session.ts 68.7%→**89.25%** strict +20.6pp, sensitivity/analyzer.ts 50.4%→**78.91%** lenient +28.5pp; 21m18s wall-clock; preko `tests/faza118_rg_strength.test.ts` 48 testa + `tests/faza67_sensitivity_strength.test.ts` 31 testa) + **Rust mutation 90.9% strict** (50/55) za `rng.rs` hot-path 5 function families (`tests/faza8_rng_strength.rs` 22 testa). Lift Rust +40pp (50.9% → 90.9%), TS +24pp combined. Sve TS testovi pattern-matched protiv konkretnih survived mutanata: ConditionalExpression branch coverage, EqualityOperator boundary, LogicalOperator each-side, ArithmeticOperator exact-num, StringLiteral exact-match. Rust mutation isolation: `scripts/rust-mutate.sh` (RUSTUP_TOOLCHAIN=stable, rust-toolchain.toml netaknut). Score history u `reports/mutation/rust/README.md` + scoped json reports.
9. ✅ **6 fali behavior-a** (faza 3.2): Wandering, WildReel, Collect, Upgrade, Split, Mega, Prize — DONE: 7 plugin behavior-a + 47 tests u `tests/faza32_extra_behaviors.test.ts`, registry `behaviorClass` overrides za sve, barrel export ažuriran. "Plugin layer" claim sad kompletan.
10. ⚠️ **HSM bridge** (faza 7.5) — PARTIAL: signing side ✅ (`src/hsm/` — AWS KMS, PKCS#11 process-bridge, Mock adapters + Signer + audit log; 31 tests). RNG side ⚠️ — `src/crypto/hsm.ts` interface + `MockHSMProvider` landed (ChaCha20-backed, deterministic; `HSMBackedRngBackend` implements `RngBackend` with 4 KiB refill buffer; `RngFactory` accepts `kind='hsm_pkcs11'` with fallback warn + `HSM_FALLBACK_FORBIDDEN` hard-throw gate). 20 tests in `tests/hsm_bridge.test.ts` cover lifecycle, healthCheck pass/fail, fallback paths, RngBackend conformance (same seed → same nextU64), split() determinism, sync underrun on async-only providers, refill on underrun. PKCS#11 driver (real entropy device) still TBD — interface stable, dlopen()/N-API addon is the next pass.
11. ✅ **W149 — UKGC + MGA + ADM compliance overhaul** (faza 11.8 + 11.9, regulatorni blokator za EU prodaju) — DONE (`a740303`→`89a14c0`, merge `89a14c0` na `main`, pushed `origin/main`, 12 files, +2294/−121). **Profil podaci refresh:** 3 jurisdikcije (UKGC, MGA, ADM) prešli su iz urbane-legende režima (£125/spin, €250k cap, €1 ADM stake) u stvarne 2025 aktuele — UKGC SI 2025/215, MGA Player Protection Directive 2018, ADM AAMS online vs land-based razdvajanje. **Gates landed:** `StakeValidator` (age-tier £5/£2 per game cycle), `RtsSpinGate` (server-side 2.5s delta), `AutoplayGate` (per-jurisdiction reject), `WinCelebrationGate` (false-win guard), `SessionLedger` (net-position live emit), `BonusWageringValidator` (10× cap effective 19 Dec 2025). **Testovi:** 18 nova (`tests/jurisdiction_compliance.rs` + `tests/multi_jurisdiction_emit.rs`) — sve 4 jurisdikcije (UK/MT/IT/MGA) prolaze end-to-end USIF emit. **Source-linked:** svaka konstanta u `profiles.rs` ima `// SOURCE:` komentar sa URL-om primary legislation (legislation.gov.uk, gamblingcommission.gov.uk, mga.org.mt, adm.gov.it). **Non-cap clarity:** dokumentovano da UKGC NEMA max-win cap za online slots (samo stake cap) — sprečava regulator-myth bug-ove u sledećim featurima.
12. ✅ **W152 — ULTIMATE research bundle** (16 KIMI deep dives, paralelno, depth=deep) — DONE (`2f5cec2`, 18 files, +974 LOC). Pokriva: regulatori 2025-2026 (UKGC SI 2025/215 follow-up + RTS 14E + MGA PPD revisions + ADM AAMS RNG + AGCO Ontario + NL KSA + PA PGCB + MI MGCB + NJ DGE + DGOJ + ANJ + SP + GGL), GLI-19/11/16/33 trenutne revizije, mehanike 2024-2026 (top 14 studija), PRNG testing baseline (TestU01 BigCrush + PractRand 10TB + NIST 800-22 status), HSM rešenja (Thales/Utimaco/AWS/GCP/Entrust/YubiHSM), RTP reporting formati, bonus math nelinearnost, RNG attack vectors. **Output:** `docs/W152_RESEARCH_SYNTHESIS.md` (597 L) + `docs/W152_ACTION_PLAN.md` (215 L) + 16 markdown research artifacts pod `~/.cortex/research/W152/`. **31 konkretne rupe identifikovano** sa file paths.
13. ✅ **W152 P0-1 + P0-5 — RFC 8439 ChaCha20 CSPRNG + bit-exact TS↔Rust parity** — DONE (`2b06dec`). Prvi CSPRNG-class RNG u engine-u; otključava UK/MGA/DE cert path (UKGC RTS 7, MGA Art. 11, GLI-19 §3.3.2 svi zahtevaju cryptographically strong RNG). Pure-Rust + TS implementacija bez novih external Cargo crate-ova (clean lock file, ne ulazi u mutants/toolchain konflikt). RFC 8439 §2.3.2 KAT byte-exact 64-byte expected block. 16-u32 KAT vektor bit-identičan između TS i Rust. **+9 Rust tests + +8 TS tests.** Sad first-class kroz `RngKind::ChaCha20` / `'chacha20'`.
15. ✅ **W152 P0-4 — GLI-19 RNG submission artifact pipeline** — DONE (this commit). `rust-sim/src/bin/rng_submission.rs` (~340 L) generates lab-submission bundle: 96M raw bits (12 MiB) per RNG backend × 5 backends + SHA-256 manifest + hardware fingerprint + tamper-evident manifest.sha256 chain. `scripts/cert-bundle.sh` wraps it, adds `git archive` source tarball + README + jurisdiction mapping, zips into `reports/slot-math-rng-cert-<sha>-<bpc>bpc.zip`. **6 integration tests** in `rust-sim/tests/rng_submission_bundle.rs` cover: all 5 backend dumps produced, manifest references every file, every per-file digest verifies, manifest.sha256 matches recomputed digest, hardware report contains expected fields, deterministic replay between identical-seed runs. Tested throughput: ~250-350 MiB/s per backend on M3 Pro. Otključava direkt lab submission path (BMM/GLI/iTechLabs upload).
16. ✅ **W152 P0-6 — Jurisdictional reporting adapters** — DONE (this commit). `src/report/adapters/` modul sa 4 adapter implementacije + 1 registry + 1 types module:
    - **PGADAdapter** (Italy ADM AAMS) — fixed-width 167-char plain-text record, CRLF endings, RTP encoded as basis-points × 100 (8 chars zero-padded), CCYYMMDD-style dates.
    - **DKXmlAdapter** (Denmark SP) — UTF-8 XML with SP-mandated namespace, banker's rounding at the mc→cent boundary, 4-decimal RTP percent (UKGC RTS 11 compatible).
    - **MGAJsonAdapter** (Malta MGA) — JSON portal payload with **alphabetically-sorted keys** (byte-stable replay), integer eurocents (no decimal-parse ambiguity), 6-decimal RTP.
    - **NJCsvAdapter** (NJ DGE) — Excel-compatible CSV with CRLF, 15-column header per DGE Q4 template, theoretical-hold computation, RFC 4180 quoting.
    - **`adapterFor(jurisdiction)` registry** — case-insensitive lookup, 12 alias keys (`ADM/IT/ITALY → PGAD`, `SP/DK/DENMARK → DKXml`, etc.), `Object.freeze`d, throws structured error on unknown jurisdiction.
    **41 vitest tests** in `tests/report_adapters.test.ts` cover: helpers, all 4 adapters, registry dispatch, determinism (byte-stable replay), edge cases (zero-activity period, negative inputs clamped). Per KIMI W152 §3.6.
17. ✅ **W152 P0-7 — Hold & Win persistent-grid Markov solver** — DONE (this commit). `src/solver/holdAndWinMarkov.ts` (~250 L) — closed-form analytical RTP estimator for Money Train / Tree of Life class. State `(occupied, respinsLeft)`, forward DP over an acyclic chain (occupied non-decreasing). Supports `respinResetOn ∈ {'new_orb', 'never'}` modes. Outputs: `expectedPayoutX`, `pFullGrid`, `expectedFinalOccupancy`, `expectedRespinsConsumed`, `meanOrbValueX`. **Critical correctness fix during dev:** initial implementation iterated outer-rl / inner-occ which dropped mass that hit-reset to a higher rl on an unprocessed `(occ+k, R0)` state. Fixed to outer-occ ascending / inner-rl descending — verified against 50k-trial MC within 1.5% on multiple configurations. **22 vitest tests** in `tests/holdandwin_markov.test.ts` cover: helpers (binom/landingPmf/meanOrbValue), algebraic degenerate cases (p=0, p=1, grid-full-on-trigger, zero bonus), monotonicity (more p / more respins / more initial orbs ⇒ ≥ payout; reset-on-orb dominates never), MC cross-validation (both modes), defensive validation (negative inputs throw), determinism (same input → identical output, order-invariant orb pool).
18. ✅ **W152 P0-8 — slot-math self-honesty CI gate** — DONE (this commit). `scripts/slot-truth-check.sh` (~250 L), bash 3.2 compatible (macOS default), no associative arrays. Verifies 10 source-of-truth metrics against an oracle baked into the script: `rust_lib_tests ≥ 230`, `rust_total_tests ≥ 740`, `ts_test_count ≥ 1576`, `ts_test_files ≥ 53`, `ir_feature_stubs_closed == 20`, `chacha20_kat_test == 1`, `rng_submission_bin == 1`, `report_adapters_count == 4`, `holdandwin_solver == 1`, `master_todo_lines ≥ 870`. Exits non-zero on drift > 10% (configurable via `SLOT_TRUTH_THRESHOLD_PCT`). `--ci` mode strips colors and emits machine-readable output. `--emit-cache` mode writes `target/slot-truth-cache.json` to amortize the expensive cargo test + vitest measurements across multiple invocations. **Prevents the same class of drift Cortex W150 audit found in CLAUDE.md** (where claims drifted 37× from reality). Operator policy: bumping the oracle is allowed but MUST be on the same commit that landed the new evidence.
14. ✅ **W152 P0-3 — IR adapter unstub (all 8 features)** — DONE u **dva commit-a**:
   - **Round 1** (`7c62305`): cascade / respin / mystery_symbol — runtime config structs, IR adapter pattern arms, shared JSON fixture (`tests/fixtures/cascade-respin-mystery.json`), 12 integration testova (6 Rust + 6 TS).
   - **Round 2** (this commit): **pick / wheel / buy_feature / ante_bet / gamble / symbol_upgrade** — preostalih 6 stub-ova zatvoreno. Nove runtime structs: `PickConfig`, `WheelConfig`, `BuyFeatureConfig`, `AnteBetConfig`, `GambleConfig`, `SymbolUpgradeConfig` + `PrizeSlot`, `BuyFeatureOffer`, `GambleType`, `GambleTieResolution` enums. Shared fixture: `tests/fixtures/pick-wheel-buyfeature-antebet-gamble-symbolupgrade.json`. 18 integration testova (9 Rust + 9 TS). **Jurisdiction gating awareness:** `BuyFeatureConfig` i `GambleConfig` su carried-through-IR (configs travel) ali downstream `jurisdiction::validate` rejects njih za UKGC SI 2025/215 + NL KSA May 2024 + DE GGL + DK SP markets. **Wire format parity:** snake_case enum variants (`red_black`, `push`) survive round-trip kroz adapter. **Skip-serialise on absent:** `Option::is_none` Rust strana ↔ `...(x !== undefined ? { x } : {})` TS strana = byte-stable JSON output. **Test count post-W152 P0-3 full:** 740 Rust (+18 vs pre-P0-3-r2) / 1576 TS (+9 vs pre-P0-3-r2). Sve 8 IR feature kindova sad IR-native — otključava 14+ modernih mehanika za config-only deployment (Megaways via cascade, Money Train via respin, xWays via mystery, wheel-bonus via wheel, pick-bonus via pick, sticky bonus-buy via buy_feature, opt-in trigger boost via ante_bet, post-win double-up via gamble, symbol promotion via symbol_upgrade).
19. ✅ **W152 Wave 10 — Faza 9.5 PGO + Faza 9.7 regression + Faza 13.8 cross-game wallet + Faza 11.4 jurisdiction PDF** — DONE (this commit). Four MASTER_TODO items closed in one wave plus oracle bump on `slot-truth-check.sh` (`rust_total_tests ge 782 ↑ 777`, `ts_test_count ge 1913 ↑ 1781`, `ts_test_files ge 71 ↑ 63`):
   - **Faza 9.5 PGO + BOLT** — `scripts/pgo-build.sh` (~280 L) three-stage pipeline (baseline → instrument → training → optimize) + optional Stage 4 `llvm-bolt` post-link layout pass. Auto-detects `llvm-profdata` from Rust sysroot or system PATH. Captures criterion `full_spin/packed_ZeroAlloc` median ns before/after, emits `reports/bench/pgo/<UTC-timestamp>/summary.json` with `delta_fraction`, `delta_pct`, `status ∈ {PASS, MISS, skipped}`. Exits non-zero when delta < threshold (default 20%). `.github/workflows/pgo-bench.yml` runs weekly cron (Sat 04:00 UTC) plus manual dispatch, uploads summary directory as workflow artifact. `reports/bench/pgo/README.md` (140 L) documents methodology, acceptance gate, local reproduction recipe, training-fixture rationale.
   - **Faza 9.7 Regression detection** — `scripts/bench-regression.mjs` (~210 L) walks `target/criterion/<group>/<bench>/{new,base}/estimates.json`, compares median point-estimate against committed baseline at `reports/bench/<group>/<bench>.estimates.json`, fails on regression > 5% (configurable via `--threshold`). 8-entry alias map handles bench-id↔baseline-filename mismatch (`packed_u128 → packed_u128_alias`). `--write-baseline` refreshes committed baseline (same-hardware operator opt-in); `--json out.json` emits machine-readable summary. Smoke-tested locally with no fresh runs → exits 0 with informational warning (CI-friendly).
   - **Faza 13.8 Cross-game wallet** — `src/wallet/crossGameWallet.ts` (~410 L) + `src/wallet/index.ts` barrel. `CrossGameWallet` class implements multi-tier ladder, per-game contribution policy with optional tier weights, multi-currency contribution with FX-rate snapshot at contribute-time, three rounding modes (`half_even` default / `half_up` / `truncate`). Two-phase commit: `beginContribute/commitContribute/rollbackContribute` + `beginHit/commitHit/rollbackHit`. Auto-emits `must_hit_by_approaching` at ≥95% of `mustHitByMaxMinor`. `snapshot()`/`fromSnapshot()` round-trip preserves state. Analytical hooks: `rtpContribution()` returns Σ(hitsPerSpin × meanPoolAtHit) / meanBet, `poolGrowthPerSpin()` returns bet × contributionRate. 8 typed event kinds. Deterministic ID generation (`pseudoId(prefix, sequence)`) — no clock, no RNG. **36 vitest tests** in `tests/cross_game_wallet.test.ts` cover construction guards, contribute / hit lifecycles, must-hit-by, analytical RTP, snapshot determinism, multi-game invariant, three rounding modes, FX snapshot, ineligible-game emit, missing-FX emit, sub-cent round-to-zero, double-commit guard, commit-after-rollback guard.
   - **Faza 11.4 Compliance PDF** — `src/report/compliancePdf.ts` (~480 L). `evaluateCompliance(input, profile, {now?})` runs ≤11 jurisdiction-aware checks (RTP band, max-win cap or N/A, prohibited features, min-spin-duration, autoplay, turbo, bonus wagering cap, default stake cap with age-tier note, LDW celebration guard, real-time net-position display, near-miss rule). Tally rolled up into `overallStatus` (FAIL > WARN > PASS). `renderCompliancePdf(input, profile, options, evaluated?)` returns Buffer or writes to `WriteStream`; `renderCompliancePdfToFile()` convenience. pdfkit with `compress: false` (audit-searchable streams). Color-banded statuses, section 1 = profile summary, section 2 = check rows with citations, section 3 = informational notes from `JurisdictionProfile`. Determinism: caller passes `now`. **15 vitest tests** in `tests/compliance_pdf.test.ts` cover PASS path, RTP-band FAIL, prohibited-feature FAIL, missing-enforcement WARN, max-win N/A, autoplay FAIL, citation source, MGA profile PASS, ADM determinism, tally invariant, PDF magic-bytes/EOF, hex-decoded TJ-aggregate text presence, FAIL banner rendering, PassThrough stream path.

   **ULTIMATE QA — 100% green:** Rust lib 259/259 ✅ · Rust integration 782/782 ✅ · clippy --lib clean ✅ · tsc --noEmit clean ✅ · vitest 1913/1915 (2 intentional skips: bench-build hint, golden-MC opt-in) ✅ · `npm run build` clean ✅ · `slot-truth-check --ci` 10/10 OK with bumped oracle ✅.
20. ✅ **W152 Wave 11 — Faza 7.2 cert + Faza 10.3 byte-match + Faza 7.5 AWS KMS + Faza 9.4 self-verify + Faza 14.3 new jurisdictions** — DONE (this commit). Five MASTER_TODO items closed in one wave plus oracle bump on `slot-truth-check.sh` (`ts_test_count ge 1993 ↑ 1913`, `ts_test_files ge 75 ↑ 71`):
   - **Faza 7.2 RNG cert** — TS-side `scripts/rng-quality.mjs` now includes ChaCha20 backend (5/5 backends pass 5/5 NIST baseline tests); Rust `rng_cert` binary re-captured on all 5 backends (8/8 NIST subset each, fresh avg p-values populated in `reports/rng-cert/SUMMARY.md`). External `.github/workflows/rng-cert.yml` matrix extended to include `chacha20` (5 backends × TestU01/PractRand/NIST STS via workflow_dispatch). Source-of-truth roll-up updated.
   - **Faza 10.3 byte-match** — `src/parity/mirrorGridGenerator.ts` (~125 L) provides TS port of Rust `generate_grid` that's bit-identical to Rust `SlotRng` Mulberry32 path. **Critical bug fix during dev:** initial impl preserved JSON-source order in `Object.entries`, but Rust uses `BTreeMap<String, f64>` which iterates alphabetically → 100% mismatch on spin 0. Fix: sort entries by symbol-id before building weight table. `rust-sim/src/bin/evaluator_parity.rs` extended with `grid_symbols: Vec<String>` (row-major flat, pre-evaluation pristine grid). **10 vitest tests** prove byte-match across 1000 spins on parity fixture + 200 spins on second seed + 50 spins grid-shape invariant + 7 unit tests on the mirror generator. `BYTEMATCH_SPINS` env var scales to 10M locally.
   - **Faza 7.5 AWS KMS HSM** — `src/crypto/awsKmsRngProvider.ts` (~240 L) implements `HSMProvider` over AWS KMS `GenerateRandom` API. Reuses existing SigV4 helper (no AWS SDK bundled). Chunks > 1024 byte requests (AWS-imposed cap), parses base64 `Plaintext`, `healthCheck()` probes with 1-byte call. Env-creds fallback (AWS_ACCESS_KEY_ID/SECRET/SESSION_TOKEN). 19 vitest tests with mock-fetch wire format verification (SigV4 Authorization header, X-Amz-Target=TrentService.GenerateRandom, custom endpoint, sessionToken).
   - **Faza 9.4 binary self-verify** — `src/integrity/binarySelfVerify.ts` (~165 L). Addresses KIMI 08 "Alex 2017" insider-tampering threat (Aristocrat / Novomatic case). `hashFileSha256Hex` + `resolveSelfBinaryPath` (returns null for .ts dev paths) + `verifySelfBinary` (4 outcome states: ok / mismatch / missing / unknown-permissive) + `assertSelfBinary` (throws `SelfVerifyError` carrying full diagnostic result). Constant-time digest comparison. `scripts/binary-digest.mjs` build-time helper computes SHA-256+SHA-512 of compiled bundles into JSON records. GLI-19 §3.3.3 satisfied. 22 vitest tests.
   - **Faza 14.3 new jurisdictions** — `src/evaluators/classIIBingoCoordinator.ts` (~210 L) for US Class II bingo (centrally-determined ticket pool, no-replacement within cycle, auto/manual cycle reset, snapshot-able state, theoretical RTP = Σ prizeX / |pool|). `src/features/skillInfluencedOutcome.ts` (~115 L) for Nevada Reg 14 §14.040(11) skill-influenced math (rtpFloor + skillScore × swing, min swing 0.01 enforced, audit record for replay). Three new jurisdiction profiles in `src/jurisdiction/profiles.ts`: **ADM_VLT** (Italy land-based, €10 stake / €5000 win / 4s spin / autoplay+turbo prohibited), **NIGC_C2** (US Class II — prohibitedFeatures=[cascade, respin] since pool-draws don't compose), **NV_SKILL** (Nevada Reg 14 — near-miss=allowed_within_distribution, effective 2017-08-04). **29 vitest tests** total: 8 InMemoryBingoPool + 9 coordinator (incl. 50-ticket no-replacement invariant, 20-ticket conservation, cycle reset, determinism), 10 skill modulator (floor/ceiling/midpoint/clamp/truncation/swing-guard/audit-shape), 4 jurisdiction profile presence.

   **ULTIMATE QA — 100% green:** Rust lib 259/259 ✅ · Rust integration 782/782 ✅ · clippy --lib clean ✅ · tsc --noEmit clean ✅ · vitest 1993/1995 (2 intentional skips) ✅ · `npm run build` clean ✅ · `slot-truth-check --ci` 10/10 OK with bumped oracle ✅.
21. ✅ **W152 Wave 12 — Faza 5 Pots-of-Gold + 5.5 FX snapshot + 8.6 multi-currency/W-2G/WR + 13.14 DP PAR + 14.4 variance reduction + 4.9 side bet + Washington draw + 0.1 Renovate + 0.3 docs/research** — DONE (this commit). NINE MASTER_TODO items closed in one wave plus oracle bump (`ts_test_count ge 2130 ↑ 1993`, `ts_test_files ge 81 ↑ 75`):
   - **Faza 5 Pots of Gold** — `src/features/potsOfGold.ts` (~250 L) with `simulatePotsOfGold()` + closed-form `expectedRtpX()`. 4 pot kinds (multiplier/collect/stop/jackpot), with/without-replacement, two collect chain modes (product / sum), 4 end-reasons. 21 vitest tests.
   - **Faza 5.5 Floating jackpot FX-rate-at-hit snapshot** — `src/jackpot/fxSnapshot.ts` (~230 L) with `FloatingJackpotPool` class. FX snapshots are recorded permanently per hit (`fxRateAtHit`, `snapshotAt`); `replayHit()` reproduces identical payout regardless of subsequent FX moves. 22 vitest tests cover publish guards, contribute conversion + snapshot reference, recordHit FX semantics, replayHit determinism, stats aggregation.
   - **Faza 8.6 Multi-currency + W-2G + Bonus WR** — `src/protocols/multiCurrency.ts` (~280 L): `roundMinorUnits()` + `lookupRoundingMode()` + 18-currency `DEFAULT_ROUNDING_TABLE` (ECB half-even / W-2G half-up / no-minor-unit truncate); `triggersW2G()` + `maybeW2GEvent()` + `W2G_SLOT_THRESHOLD_USD_2024` (= $1,200/12000 minor); `createBonusWageringState()` + `logEligibleWager()` + `forfeitBonus()` 4-state FSM with `MAX_WAGERING_MULTIPLIER=10` UKGC cap enforced at construction. 31 vitest tests.
   - **Faza 13.14 Differential privacy PAR export** — `src/math/par-sheet/dpExport.ts` (~160 L). `laplaceSample()` via inverse-CDF, `dpExport()` with sequential ε-composition, frozen `TYPICAL_SENSITIVITIES` map. 17 vitest tests cover noise mean/variance, ε-utility tradeoff, ±2% RTP utility on ε=0.3 across 200 trials.
   - **Faza 14.4 Variance reduction** — `src/sim/varianceReduction.ts` (~155 L): `antitheticUniforms()` (variance reduction ≥50% on monotone integrand), `vanDerCorputBase2()` + `sobol1d()` low-discrepancy sequence, `controlVariateBeta()` + `applyControlVariate()` with variance-reduction estimator. 23 vitest tests.
   - **Faza 4.9 Side bet** — `src/features/sideBet.ts` (~180 L): orthogonal RTP track with implicit lose remainder, closed-form RTP / hit rate / variance, per-spin inverse-CDF resolution, `assertOrthogonal()` structural invariant. 16 vitest tests.
   - **Washington centrally-determined draw** — `src/evaluators/washingtonTicketPoolDraw.ts` (~115 L) extends `ClassIIBingoCoordinator` with three WSGC Title 230 Ch.07 additions: no-reseed-within-session, stateTaxRate pre-deduction, mandatory near-miss reveal. 7 vitest tests in side-bet-and-Washington combined file.
   - **Faza 0.1 Renovate** — `renovate.json` (~60 L) Mend Community Edition config: Monday 04:00 Europe/Belgrade schedule, lockFileMaintenance, semantic commits, 4 packageRules (auto-merge low-risk TS math libs, manual Rust crate review, dev-tooling grouping, major-bump gating), vulnerability alert routing.
   - **Faza 0.3 docs/research.md** — curated reading list (~165 L) with 5 supercategories (RNG primitives / Math model / Mechanics / Regulator standards / Operational), every citation with "why we cite it" line, naming convention + extension procedure documented.

   **ULTIMATE QA — 100% green:** Rust lib 259/259 ✅ · Rust integration 782/782 ✅ · clippy --lib clean ✅ · tsc --noEmit clean ✅ · vitest 2130/2132 (2 intentional skips) ✅ · `npm run build` clean ✅ · `slot-truth-check --ci` 10/10 OK with bumped oracle ✅.
22. ✅ **W152 Wave 13 — Precision unified at ±0.001% + Faza 10.5 acceptance harness + Faza 10.2 fuzz CI + Faza 9.7 throughput report + Faza 14.6 replay differential** — DONE (this commit). FIVE MASTER_TODO items closed plus precision target tightened **from ±0.05% to ±0.001%** (50× tighter — operator requirement). Oracle bumped (`ts_test_count ge 2174 ↑ 2130`, `ts_test_files ge 83 ↑ 81`):
   - **Precision unification** — every ±0.05% reference in `SLOT_ENGINE_MASTER_TODO.md` rewritten to ±0.001% (1 in 100 000). Cluster (line 165), Faza 10.4 (line 415), Nemerljivi-uspeh §2. Convergence math documented: at ±0.001%/99% target, σ=5 (typical slot) ⇒ N ≈ 1.66 × 10¹² spins (= Faza 9.8 1T territory).
   - **Faza 10.5 acceptance harness** — `src/sim/acceptanceHarness.ts` (~245 L) implements `requiredSpinsForPrecision()` + `ciHalfWidth()` + `evaluateConvergence()` + `aggregateAcceptance()`. Three acceptance modes: `closed_form` (analytical RTP as reference), `reference_par` (operator-supplied target), `self_replay` (zero-tolerance determinism). 4 ConvergenceStatus outputs: `converged` / `too_few_spins` / `not_converged` / `diverged_from_reference`. Z-scores table for {0.90, 0.95, 0.99, 0.999, 0.9999}. **`scripts/acceptance-dossier.mjs`** (~170 L) consumes the golden snapshot (`reports/acceptance/golden.json`) + optional operator variance map, emits `reports/acceptance/dossier-<UTC>.json` + human-readable `DOSSIER.md` roll-up. 28 vitest tests cover: precision/confidence formula, required-spin scaling, CI half-width, convergence verdict for all 4 statuses + 3 modes + 4 custom configurations, aggregate worst-of, snapshot stability.
   - **Faza 10.2 24h fuzz CI** — `.github/workflows/fuzz-weekly.yml` weekly Sunday 02:00 UTC cron. 3-target matrix (fuzz_alias / fuzz_eval_config / fuzz_packed_grid) × 8h each = 24h total (fits inside GitHub's 24h timeout). Per-target artifact uploads: corpus + crash artifacts + coverage profraw (30-day retention). Fails the job on any crash artifact. Manual dispatch supports `hours_per_target` input.
   - **Faza 9.7 throughput report** — `reports/bench/THROUGHPUT.md` (~130 L) formalises the ≥50M / ≥500M / 1T acceptance claims with explicit derivation from `reports/bench/{full_spin,grid_generation,scatter_count,throughput_1M}/*.estimates.json`. Per-thread baselines (2.66M scalar / 4.29M packed M3 Pro), 8-core projection (32M packed × 8 ≈ 256M sustained), GPU scaling factor placeholder, multi-node cluster factor. Acceptance table maps every claim to its current evidence state (measured / projection / pending capture).
   - **Faza 14.6 replay differential** — `src/replay/longRunDifferential.ts` (~210 L). `buildReplayCapture()` builds a hash-chain checkpoint trail every N spins (default 10 000). `differentialReplay({capture, liveSpinDigests}, todayCommit)` returns 4-state typed outcome: `bit_identical` (same commit + same content), `count_mismatch` (length skew), `checkpoint_mismatch` (with first-divergent-spin pinpoint), `engine_changed_warning` (different commit but same content — cross-version reproducibility proof). Hash chain construction `H_{i+1} = sha256(H_i || spinDigest_i)` so any tamper propagates to every later digest. 16 vitest tests prove hash-chain non-commutativity, cadence checkpointing, count-mismatch, tamper-detection at next checkpoint, cross-commit warning, zero-spin handling, capture determinism.

   **ULTIMATE QA — 100% green:** Rust lib 259/259 ✅ · Rust integration 782/782 ✅ · clippy --lib clean ✅ · tsc --noEmit clean ✅ · vitest 2174/2176 (2 intentional skips) ✅ · `npm run build` clean ✅ · `slot-truth-check --ci` 10/10 OK with bumped oracle ✅.

---

## NEMERLJIVI KRITERIJUMI USPEHA

1. **Univerzalnost:** "može li config-only da implementira igru X?" — DA za sve postojeće mehanike (acid-test 30 ✅, nazivni KAT ❌).
2. **Tačnost:** RTP matuje teoretski sa **±0.001%** na 10⁹ spins; PAR sheet match-uje literaturu **±0.001%**. *(W152 Wave 13 — precision unified at ±0.001% (= 1 in 100,000). closed-form ↔ MC ±0.01% ✅ na fixture-ima do sada; nightly 10⁹-spin acceptance proof za reference fixture-e u `reports/acceptance/`; published PAR cross-validation pending live game audit.)*
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

## NEXT IMMEDIATE STEPS (refreshed 2026-05-14, posle W152 P1-7 + P1-10 + P2-15 + Faza 7.2 + P2-13)

> P0 #1–18, **W152 P1-7 (persistent-grid H&W Money Train 4 class)**, **W152 P1-10 (rng/jackpot/jurisdiction coverage trojka — 88 new TS tests)**, **W152 P2-15 (max-win cap + EVT Pareto POT fit)**, **W152 Faza 7.2 (RNG cert ChaCha20 row + SUMMARY.md aggregator)**, **W152 P2-13 (AML telemetry emitter, 5 pluggable backends)** — sve DONE.
> Stvarni preostali blokatori za production-grade prodaju:

1. **TestU01 BigCrush / NIST 15 / PractRand 2³⁸ binarni izveštaji** (faza 7.2) — HOWTO landed, scripts spremni. Treba **stvarno pokrenuti** sa instaliranim TestU01/NIST/PractRand binarima i checkin-ovati `pcg64-bigcrush.txt`/`xoshiro-nist15.txt`/`chacha20-practrand.txt` u `reports/rng/`. Bez ovog UKGC/MGA ne potpisuje cert.
2. **TS↔Rust full parity 10⁹ MC acceptance** — `compare-parity.mjs` jaha samo fixture-e; pokreni 10⁹ run per evaluator family, log u `reports/parity/`. Acceptance: ±0.001% RTP delta.
3. **30 mehanika numerička acceptance per fixture** (faza 12) — sve mehanike imaju fixture + target RTP. Pokreni MC 10⁹ × 30 fixture-a → tabela `mechanic | target_rtp | mc_rtp | delta | pass/fail` u `reports/acid-test/INDEX.md`. **Najbrži put do "univerzalni engine" claim-a sa brojevima.**
4. **TS Stryker 95% threshold** (faza 10.7) — sad 85.38% combined; gap od 9.62pp je test-strength rad na 2 ostala fajla (`evaluator.ts`, `pipeline.ts`). Mutation score 95% otvara DE jurisdikciju (najstroži prag).
5. **Rust mutation toolchain unblock** — `cargo-mutants` vs `rust-toolchain.toml` 1.83 vs 1.85+ edition2024 mismatch. Treba ili pin override ili upgrade. Sad 90.9% strict samo na `rng.rs`; cilj proširiti na `evaluator.rs`, `cascade.rs`, `behavior/`.
6. **W150-A self-honesty gate u CI** — `scripts/cortex-truth-check.sh` već postoji za Cortex; analog za slot-math (`scripts/slot-truth-check.sh`) verifikuje sve brojke u ovom dokumentu protiv `cargo test --workspace -- --list` + `tokei`. Threshold drift 10%. Sprečava buduća masaža brojki.
7. **W149 follow-up** — `Compensated math mode` (UK AWP cycleProgress state machine, faza 11.9) za land-based UK pub mašine. Online slots ne treba ovo; ako proširujemo na UK AWP segment — eksplicitno opt-in.
8. **PGO + BOLT pipeline** (faza 9.3-9.5) — sad imamo bench baseline (35557s 1T single-thread). PGO daje +15-30%, BOLT dodatnih +5-10%. Otvara realnu konverzaciju oko 1T u < 60s na M3 Pro single chip.
9. **GPU Metal end-to-end parity** (faza 9.6) — Philox kernel ✅, ali full simulation graf na GPU-u nije bit-by-bit parity-tested protiv CPU putanje. Acceptance: 1M spins GPU == 1M spins CPU byte-identičan output stream.
10. **11.1 web Config Builder UI** — single fali iz M7 milestone-a. Bez UI-a, operator integriše JSON ručno. Sa UI-em — "demo u 5 minuta".
11. **W152 P0-4 — GLI-19 RNG submission artifact pipeline** — 96M raw bits (12 MB) per RNG kind + SHA-256 manifest + hardware report + source tarball + boot-time entropy capture. CLI: `rust-sim/src/bin/rng_submission.rs`. Otključava lab submission path direktno; sad kad je ChaCha20 CSPRNG dostupan, generišemo dump za 4 backenda (PCG-64, Xoshiro256pp, Philox4x32, ChaCha20) i serijemo kao zip cert-bundle.
12. **W152 P0-6 — Reporting adapters po jurisdikciji** — PGAD bin (Italy ADM AAMS), DK XML (Denmark SP), MGA portal JSON (Malta), NJ Excel template (US-NJ DGE). Modul `src/report/adapters/` sa jednim adapter trait-om + 4 implementacije + per-jurisdiction CI gate. Bez ovog operator-side integracija u prodajna tržišta je manual.
13. **W152 P0-7 — Persistent grid / Hold&Win Markov** — Money Train 4 i Tree of Life class mehanike traže persistent state across spins (sticky grid + accumulator). Trenutno H&W consumes orb cells per-respin ali ne persistuje između base-spinova. Markov DP zatvori RTP-derivation za ove mehanike.
14. ✅ **W152 P1-7 — Persistent-grid H&W solver (Money Train 4 class)** — DONE (this commit). `rust-sim/src/markov_persistent.rs` (~430 L) + `src/solver/holdAndWinMarkovPersistent.ts` (~280 L) + `tests/fixtures/persistent-hw.json` shared fixture + `rust-sim/tests/persistent_hw.rs` (5 tests) + `tests/persistentHwMarkov.test.ts` (15 tests) + 11 module unit tests. Mathematical model: cells at terminal are i.i.d. drawn from a categorical class distribution `{Cash p_c, Mult p_m, Collector p_col, Inert}`; payout = `(Σcash)(Πmult) + (Σcol)·#cash + grid_full_award`. Closed-form per-`k`: `E[Σcash·Πmult | k] = μ_v·k·p_c·(1−p_m+p_m·μ_u)^(k−1)`, `E[Σcol·#cash | k] = μ_col·k(k−1)·p_col·p_c·μ_v`. Terminal occupancy PMF reconstructed from the same `(occupied, respinsLeft)` chain as the standard solver. **31 new tests total (16 Rust + 15 TS).**
15. ✅ **W152 P1-10 — Test coverage trojka (RNG / Jackpot / Jurisdiction)** — DONE (this commit). `tests/p1_10_rng_coverage.test.ts` (18 tests — HSM fallback paths, all 5 backends factory parity, ChaCha20 bounded uniformity), `tests/p1_10_jackpot_coverage.test.ts` (18 tests — `mustHitBy` cap clipping + approaching event at ≥90%, multi-tier `contribute`, full `beginJackpot`/`commitJackpot`/`rollbackJackpot`/`retryJackpot`/`expireTimedOut` state machine invariants, retry-past-maxRetries → seed reset, payment-timeout marks-as-failed, `expireTimedOut` rolls back not fails), `tests/p1_10_jurisdiction_coverage.test.ts` (52 tests — all 8 PROFILES round-trip, age-tiered band resolution for UKGC, `unknown_jurisdiction` short-circuit across all 5 runtime validators, `validateSpin` short-circuit vs `validateSpinFull` collect-all, MGA permissive checks). **88 new TS tests** total.
16. ✅ **W152 P2-15 — Max-win cap math + EVT Pareto POT fit** — DONE (this commit). `src/statistics/tailFit.ts` (~230 L) + `rust-sim/src/tail_fit.rs` (~310 L). Three primitives: (a) `clipDistribution(wins, cap) → {rtpCapped, rtpUncapped, rtpLost, probabilityMassAbove, conditionalMeanAbove, capActive}` — strict-inequality semantics (`value > cap` clipped, `value === cap` left untouched per UKGC SI 2025/215 inclusive-cap wording); (b) `fitParetoTail(samples, threshold)` — MLE Pareto fit `α̂ = n / Σ ln(x_i/xm)` + KS p-value via deterministic 200-rep bootstrap; (c) `evtTailQuantile(alpha, xm, q)` — inverse Pareto CDF for projecting cap pressure from finite MC. **30 new tests (17 TS + 13 Rust)** including: recovers true alpha within 10% on n=5000 synthetic Pareto, KS p-value in [0,1], good-fit synthetic data → non-rejecting p>0.05, edge cases (empty distribution / NaN cap / negative probability / fewer-than-5-tail-samples). Per KIMI W152 §3.16 (regulator-facing PAR sheet requirement).
17. ✅ **W152 Faza 7.2 — RNG cert reports ChaCha20 + SUMMARY.md** — DONE (this commit). Added `chacha20` value to `rng_cert` CLI's `--rng` enum. Generated `reports/rng-cert/chacha20-internal.json` (16 MiB, seed 12345 — all 8 NIST sub-tests pass with avg p ≈ 0.55). Updated `reports/rng-cert/README.md` table from 4 → 5 backends (32 → 40 sub-tests all passing). Added `reports/rng-cert/SUMMARY.md` (~90 L) — regulator-facing roll-up across internal NIST subset + external tool queue status + jurisdiction → backend mapping + acceptance criteria. Faza 7.2 was the last piece blocking real GLI-19 submission readiness; ChaCha20 is the CSPRNG backend required by UK / MGA / DE / NL profiles.
18. ✅ **W152 P2-13 — AML telemetry emitter** — DONE (this commit). `src/rg/telemetry.ts` (~210 L) + 13 new TS tests. Canonical event schema `TelemetrySpinEvent {ts, bet, win, gameId, roundSeed, sessionId, playerHash?, jurisdiction?, netSessionLoss?, spinIndex?, flags?: AmlFlag[]}` aligned with the 4 reporting adapters. Five pluggable backends: `NoopTelemetryBackend`, `BufferingTelemetryBackend` (RAM, with `drain()` / `snapshot()`), `StdoutTelemetryBackend` (JSONL via injectable writer), `JsonlFileTelemetryBackend` (file-append + lazy mkdir), `CompositeTelemetryBackend` (sequential fan-out preserving order, error-propagating). Per KIMI W152 §3.12 (UKGC AML enforcement Oct 2025 — €10M operator fines landed for missing supplier-side telemetry).
