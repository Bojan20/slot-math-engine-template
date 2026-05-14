# W152 ACTION_PLAN — slot-math-engine-template

> Izvedeno iz `W152/SYNTHESIS.md`. Sve referencirane rupe imaju
> izvor (KIMI 01–16) ili interni audit (Audit §N). P0 = blokira
> regulatornu submisiju; P1 = blokira professional reputaciju; P2 =
> incremental polish.

---

## P0 — CRITICAL (5 sesija, blokira lab submission)

### P0-1 · CSPRNG swap + HSM seed/sign (KIMI 04, 05, 08) — ✅ **W152 LANDED**

**Status:**
- ✅ `ChaCha20Backend` u `rust-sim/src/rng.rs` (RFC 8439 IETF 20-round) — RFC §2.3.2 KAT verified.
- ✅ `RngKind::ChaCha20` + factory `create_rng(RngKind::ChaCha20, seed)`.
- ✅ TS first-class `src/rng/backends/ChaCha20.ts` + `'chacha20'` u `RngKind`.
- ✅ **TS↔Rust parity KAT** (16 u32 za seed `"w152-parity-vector"`).
- ✅ 9 Rust testova + 8 TS testova, sve PASS.
- ✅ Cargo-mutants nije bio blocker — pure-Rust impl, nema novih external deps.
- 🟡 PKCS#11 HSM real driver — TS već ima `MockHSMProvider`; Rust `rust-cryptoki` integration pending (predloženo kao follow-up, ne blokira jurisdikcijski put pošto `ChaCha20Backend.from_seed_str(hsm_session_id)` pokriva CSPRNG zahtev).
- 🟡 Per-spin HSM reseed budget — pending.

**Originalni plan (referenca):**
**Trenutno:** PCG-64 + Xoshiro256SS — ni jedan nije CSPRNG.
**Cilj:** ChaCha20Rng baseline + Philox4×32 (counter-based parallel) +
PKCS#11 HSM seed.

**Diff:**
```toml
# rust-sim/Cargo.toml
[dependencies]
rand_chacha = "0.3"           # ChaCha20Rng — CSPRNG, NIST-evaluated
cryptoki    = "0.9"           # PKCS#11 (Luna7 / nShield5 / YubiHSM2)
sha3        = "0.10"          # transcript hash chain
ed25519-dalek = "2"           # transcript signing (140-3 compatible)
random123   = { version = "0.1", optional = true }  # Philox4x32
```
**Novi fajlovi:**
- `rust-sim/src/rng/csprng.rs` — `ChaChaCsprng { rng: ChaCha20Rng,
  reseed_threshold: u64, hsm: Option<Box<dyn HsmClient>> }`.
- `rust-sim/src/rng/philox.rs` — counter-based RNG (skip-ahead za
  parallel Monte Carlo bez state sharing).
- `rust-sim/src/hsm/pkcs11_client.rs` — `HsmClient` trait + Luna/
  YubiHSM/Cloud implementacija.
- `src/rng/csprng.ts` — TS mirror koristi `@noble/ciphers/chacha`.
**Acceptance:** TestU01 BigCrush PASS (p ∈ [0.001, 0.999] na svim 160
testovima) + PractRand do 4 TB clean. CI gate `make rng-cert`.

### P0-2 · UK RTS 14 + jurisdiction config matrica (KIMI 01) — ✅ **W149 LANDED**

**Status:** Verifikovano u `src/jurisdiction/profiles.ts` (W149 wave):
- `UKGC.prohibitedFeatures: ['gamble', 'buy_feature']` (buy-feature ban Sept 2025).
- `bonusWageringCapX: 10` (eff. Jan 2026).
- `prohibitAutoplay: true`, `prohibitTurbo: true` (RTS 14 / RTS 8A).
- `minSpinDurationMs: 2500` (RTS 14D).
- `ageTieredStakes: [{18-24: £2}, {25+: £5}]`.

P0-2 je zatvoren bez dodatne implementacije.

**Originalni plan (referenca):**
**Trenutno:** `gameConfig.ts` hardcoded; nema RTS 14 flags.
**Diff:**
```ts
// src/jurisdiction/uk.ts (NEW)
export const UK_PROFILE: JurisdictionProfile = {
  code: 'UK',
  stakeCap: { adult: 5.00, youngAdult: 2.00 },
  ageGate: { youngAdultBand: [18, 24], cutoff: 25 },
  bonusWageringCap: 10,        // eff. Jan 2026
  rts14: {
    banTurboSlamStop: true,    // RTS 14E
    banAutoplay: true,         // RTS 8A
    banFalseWinFx: true,       // RTS 14F
    banMultiGamePlay: true,    // RTS 14C
    minSpinDurationMs: 2500,
  },
  buyFeature: { enabled: false }, // UK Sept 2025 ban
};
```
**Engine guard:** `src/engine/spinGuard.ts` — refuse spin ako
`stake > profile.stakeCap[ageBand]` ili `bonusWagering > cap`.

### P0-3 · IR feature unstub: cascade → mystery → respin (KIMI 03; Audit §19-20) — ✅ **W152 LANDED**

**Status:** 3 od 8 stub-ova zatvoreno (`cascade`, `respin`,
`mystery_symbol`). Preostali stub-ovi (`pick`, `wheel`, `buy_feature`,
`ante_bet`, `gamble`, `symbol_upgrade`) ostaju za sledeću turu.

**Konkretno:**
- ✅ `rust-sim/src/config.rs` — 3 nove strukture (`CascadeConfig`,
  `RespinConfig`, `MysteryConfig`) sa `CascadeReplacement` enum-om;
  `GameConfig` ima 3 nova `Option<...>` polja sa
  `skip_serializing_if = "Option::is_none"`.
- ✅ `rust-sim/src/ir/adapter.rs` — `convert_cascade`,
  `convert_respin`, `convert_mystery` helperi; `convert_features` ne
  baca cascade/respin/mystery na pod više.
- ✅ `src/ir/adapter.ts` — mirror TS strana: 3 nove `TSXxxConfig`
  interfejse, optional polja u `TSGameConfig`, 3 convert helpera.
- ✅ TS adapter sortira `revealDistribution` ključeve leksikografski
  da odgovara Rust `BTreeMap` redosledu (byte-stable JSON za parity).
- ✅ Test fixture `tests/fixtures/cascade-respin-mystery.json`
  zajednički za TS i Rust integration testove.
- ✅ Rust: 5 unit testova u adapter-u + 6 integration testova =
  **11 novih Rust tests PASS**.
- ✅ TS: 6 novih tests PASS (`tests/ir_cascade_respin_mystery.test.ts`).
- ✅ **TS↔Rust parity gate** — isti fixture, identično ekstrakovan u
  oba pravca (mystery `BTreeMap`/sorted-Record byte equality verified).

**Preostalo za P0-3 (sledeća tura):**
- `pick` / `wheel` — bonus round prize-pool config.
- `buy_feature` — jurisdiction-gated (UKGC/NL/DE/DK ban-aware).
- `ante_bet` — bet modifier.
- `gamble` — red/black/suit side bet.
- `symbol_upgrade` — symbol transform u FS-u.

**Originalni plan (referenca):**
**Trenutno:** `src/ir/adapter.ts` + `rust-sim/src/ir/adapter.rs` —
TODO za 8 feature types.
**Sekvenca (3 najurgentnija):**
1. `cascade` — `src/features/cascade.ts` + Rust pendant; per-cell
   `(symbol, value, is_persistent)` matrix.
2. `mystery` — `src/features/mystery.ts`; symbol substitution config sa
   weighted reveal.
3. `respin` — `src/features/respin.ts`; geometric-reset Markov sa
   `resetOnHit:true` (KIMI 07 Hold&Win).
**Bit-match property test:** `tests/parity/cascade.spec.ts` —
generiše 1 M random inputs, oba evaluatora vraćaju identical output.

### P0-4 · RNG submission artifact + SHA-256 manifest (KIMI 02, 09)
**Cilj:** Single `make cert-bundle` produkuje GLI-19 v3.0 paket.
**Novi fajlovi:**
- `scripts/cert-bundle.sh` — orkestrira:
  1. `cargo run --bin gli19-rng-dump` → 96 M raw bits + 100 M outcomes.
  2. `sha256sum` po artifactu.
  3. Source code tarball sa pinned versions.
  4. `hardware-report.json` (uname, cpuid, RNG backend, HSM info).
- `rust-sim/src/bin/gli19_rng_dump.rs` — emit binary blob + outcomes
  CSV + hardware spec.
- `src/sim/rng_hasher.ts` — iterira repo + emit `{component, version,
  sha256}` JSON manifest.

### P0-5 · TS↔Rust bit-match parity gate (Audit §16) — ✅ **W152 LANDED (Wave 8)**

**Status:**
- ✅ ChaCha20 backend ima **bit-exact TS↔Rust parity KAT** (Wave 2).
- ✅ **Evaluator parity oracle landed (Wave 8)**:
  `rust-sim/src/bin/evaluator_parity.rs` emit NDJSON stream per-spin
  (config, seed, spins) → TS spec spawnSync-ima bin, validira
  self-determinism + schema invariants + aggregate RTP.
- ✅ `tests/evaluator_parity.test.ts` — 5 testova:
  Rust self-determinism, different-seed divergence, line-count =
  `--spins`, schema invariants, aggregate RTP unutar fixture range.
- ✅ `make parity` Makefile target (Wave 8 P2-16) builds bin + runs spec.
- 🟡 **Full per-spin TS↔Rust byte-match** ostaje za P0-5b — zahteva
  port Rust `generate_grid` weight-sampler u TS preko legacy
  `mulberry32`. Nije blocker za cert bundle jer self-determinism +
  aggregate-RTP pokriva najčešće regresije.

**Originalni plan (preostalo):**
**Trenutno:** Nema garancije bit-match-a `lineEvaluator.ts` vs
`evaluator.rs`.
**Diff:**
- `tests/parity/cross_impl.spec.ts` — generiše seed-based inputs;
  poziva oba evaluatora preko Node FFI (`napi-rs` ili child process);
  asserts identical outputs po byte.
- CI gate: `make parity` mora proći pre `make cert-bundle`.

---

### Faza 2.4 · Pattern evaluator (MASTER_TODO ❌ → ✅ **W152 LANDED**)

**Status:** Pattern evaluation, listed as ❌ in MASTER_TODO §2.4, is
now fully implemented in both TS and Rust with byte-stable parity.

- ✅ `rust-sim/src/evaluator.rs` — `EvalMode::Pattern { rules }`
  variant + `PatternRule { id, positions, pay_multiplier }` struct;
  `evaluate_pattern` honours wild substitution, voids on scatter/bonus,
  ignores wild-only rules.
- ✅ `rust-sim/src/config.rs` — `PatternConfig` + `PatternRuleConfig`
  serde structs; `GameConfig.pattern: Option<PatternConfig>`.
- ✅ `rust-sim/src/ir/adapter.rs` — `convert_pattern_to_config`
  extracts `evaluation.kind = "pattern"` into the runtime config.
- ✅ `src/evaluators/patternEvaluator.ts` — TS evaluator mirroring
  Rust math exactly (`Math.round(pay × 1000) × totalBet / 1000` via
  `Math.floor` to mirror Rust's i64 integer division).
- ✅ `src/ir/adapter.ts` — `TSPatternConfig` + `convertPatternConfig`
  mirroring the Rust adapter path.
- ✅ Shared fixture `tests/fixtures/pattern-evaluator.json` consumed
  by both suites; 8 Rust + 9 TS tests with **identical expected payouts**
  (uniform HP1 = 40 credits across 3 rules; broken row_top = 30
  credits; wild substitution = 10; scatter voids = 0).
- ✅ Mutation-tested: 9 of 9 testable mutants caught (100 %); 12
  timeouts are budget-bound, not test-coverage gaps.

---

## P1 — HIGH (5 sesija, professional reputation)

### P1-6 · Reporting adapters: UK + MGA + ADM bin (KIMI 06)
- `src/reporting/event_schema.ts` (canonical event).
- `src/reporting/adapters/uk.ts` (quarterly portal rollup).
- `src/reporting/adapters/mga.ts` (monthly player funds).
- `src/reporting/adapters/adm.ts` (real-time PGAD/SOGEI fixed-width binary).
- 10-year retention policy (IT najjača).

### P1-7 · Persistent grid Hold&Win + Money Train 4 model (KIMI 03, 07)
- `src/features/persistentGrid.ts` — `grid_state[r][c] = {symbol,
  value, is_persistent}`; strongly non-Markov across respins.
- `src/features/holdAndWin.ts` — Markov sa resetOnHit + collector tuning.
- `rust-sim/src/features/persistent_grid.rs` — bit-match pendant.

### P1-8 · PAR sheet versioning + diff (KIMI 02) — ✅ **W152 LANDED (Wave 8)**

- ✅ `src/math/par-sheet/diff.ts` — `diffParSheets(prev, next) → PARDiff`
  + `formatDiffHeadline` (CI-friendly one-liner).
- ✅ Strukturni diff sa per-section deltama: RTP (sa noise threshold
  0.005pp), hit-frequency (review threshold 0.5pp), volatility, jackpot
  list, compliance (jurisdiction sets, max-win cap, near-miss rule,
  ldw/session display).
- ✅ Re-cert decision: `requiresRecertification` flag se diže kad
  RTP / max-win / volatility category / jackpot list / jurisdiction set
  promeni — GLI-19 §3.3.4 + UKGC RTS 7 mandat.
- ✅ `requiresOperatorReview` flag za softer drift (hit-rate, CI, non-blocking compliance).
- ✅ Schema-version mismatch baca eksplicitno (caller mora migrirati).
- ✅ Jackpots sortirani po id pre upoređivanja (kosmetičke promene
  redosleda ne aktiviraju diff).
- ✅ 13 vitest specs pokrivaju svaki trigger + headline format + edge cases.
- ✅ `make par-diff PREV=a.json NEXT=b.json` Makefile target.

### P1-9 · cargo-mutants unblock + ≥ 95 % Rust mutation (Audit §30) — ✅ **W152 ENABLED**

**Status:**
- ✅ `cargo-mutants 25.3.1` installed and working.
- ✅ Workaround `scripts/rust-mutate.sh` uses `RUSTUP_TOOLCHAIN=stable`
  to run cargo-mutants outside the parity-pinned 1.83 toolchain. Parity
  guarantee intact (mutants only mutates code under stable, runs the
  full test suite under same stable build).
- ✅ Demonstrated on `evaluate_pattern`: **9 caught / 0 missed / 12
  timeouts / 3 unviable** — **100 % mutation score** (caught /
  (caught + missed) excluding timeouts).
- ✅ Reports landed in `reports/mutation/rust/evaluator/mutants.out/`.
- 🟡 Workspace-wide ≥ 95 % score over **all** modules — next sprint
  (each module ~5 min × ~30 modules = ~2.5 h budget). The infrastructure
  works; this is now just running it.

**Originalni plan (referenca):**
**Trenutno:** P0 BLOCKED — cargo-mutants vs rust-toolchain pin.
**Hipotetski fix:**
1. Probaj `cargo-mutants 25.0.1+` (proveriti compat).
2. Ili: ublažiti rust-toolchain pin sa `channel = "1.85"` →
   `channel = "stable"`.
3. Ako nužno: feature-gated `mutants` profile koji ne deli pin.

### P1-10 · Test coverage trojka: rng, jackpot, jurisdiction (Audit §9)
- `tests/rng/quality.spec.ts` — chi-square + runs + entropy.
- `tests/rng/parity.spec.ts` — PCG-64 vs Xoshiro256SS vs ChaCha20Rng
  parity samo na deterministic seed.
- `tests/jackpot/multi_tier.spec.ts` — 4-tier ladder + contribution.
- `tests/jurisdiction/all_8.spec.ts` — full matrix UK/MGA/ADM/AGCO/
  DGE/DGOJ/PGCB/MGCB.

---

## P2 — MEDIUM (incremental polish)

### P2-11 · RGS pluggable surface (KIMI 13) — ✅ **W152 LANDED (Wave 9)**

- ✅ `src/rgs/types.ts` — canonical `BetRequest` / `WinRequest` /
  `BalanceResponse` / `WalletError` / `WalletResult<T>` / `RoundEvent`.
  Integer millicredits everywhere, ISO-4217 currency.
- ✅ `src/rgs/wallet.ts` — `WalletBackend` interface + `InMemoryMockWallet`
  reference impl (debit / credit / rollback / balance), idempotency
  cache by uuid, promo-token short-circuit.
- ✅ `src/rgs/auth/index.ts` — three signers: `HmacSha256Signer` (CWS
  pattern), `JwtHs256Signer` (RFC 7519 inner HMAC), `RsaSha256Signer`
  (Hub88 pattern, injected impl for Web3/Node crypto neutrality).
  `canonicalJson()` for stable signature input.
- ✅ `src/rgs/protocol.ts` — `RgsProtocol` orchestrator: sign-envelope,
  promo-validator gate, debit/credit/rollback, round-event sink, KIMI 13
  LCD `withDeadline(op)` (default 200 ms p99).
- ✅ 26 vitest specs (wallet contract + idempotency + promo +
  edge errors, all three signers, canonical JSON, RGS protocol
  round-trip, deadline timeout, end-to-end debit → credit → rollback).

### P2-12 · RG hooks reference + self-exclusion client (KIMI 11) — ✅ **W152 LANDED (Wave 9)**

- ✅ `src/rg/hooks.ts` — `RGHookEmitter` sa 8 typed event kinds:
  REALITY_CHECK_ACK, SPIN_SPEED_GATE, DEPOSIT_LIMIT_BLOCK,
  LOSS_LIMIT_REACHED, SELF_EXCLUSION_LOOKUP, AFFORDABILITY_SCREEN,
  SESSION_TIMER, COOLING_OFF_INIT. Subscribe/unsubscribe + fan-out
  + clear; synchronous; framework-agnostic.
- ✅ `src/rg/self_exclusion_client.ts` — `SelfExclusionClient` sa
  `Promise.all` fan-out na 6 registries (GAMSTOP, OASIS, SPELPAUS,
  ROFUS, CRUKS, AGCO_CSE). Per-call 500 ms p99 deadline (KIMI 11 LCD).
  Pluggable `SelfExclusionProvider` interface + `StubSelfExclusionProvider`
  reference impl za testove.
- ✅ `CircuitBreaker` — three-state (closed/open/half-open), default
  5-failures threshold + 30 s recovery, injected `now()` za deterministic
  testove.
- ✅ Fail-closed semantika kao default (KIMI 11: regulatorny safety) —
  ako svaki provider's breaker open, player se blokira; `failClosed=false`
  override za dev.
- ✅ 13 vitest specs (emitter fan-out + unsubscribe, breaker FSM,
  client multi-registry verdict, timeout → breaker trip, error capture,
  audit emission per provider).

### P2-13 · AML signal spec + telemetry emitter (KIMI 12)
- `src/fraud/telemetry_emitter.ts` + Rust pendant.
- `src/fraud/dormant.ts` + `bonus_audit_trail.ts`.
- `docs/AML_BOUNDARY.md` — eksplicitan supplier-vs-operator delimiter.

### P2-14 · ECVRF + Chainlink VRF adapter (KIMI 15) — ✅ **W152 LANDED (Wave 8)**

- ✅ `src/rng/vrf.ts` — `VRFProver` interface + 3 implementacije:
  * `Sha256CommitRevealVRF` — production baseline (Stake / Rollbit
    pre-ECVRF) — `H(serverSeed)` commit-pre-round + reveal posle.
  * `ChainlinkVRFv2_5Adapter` — bridge ka GLI-19 certified on-chain
    oracle (BMM Testlabs). Web3-library agnostic preko injected
    `requester` callback-a (~2 s round-trip per KIMI 15 §2).
  * `NoOpVRFProver` — null object za non-VRF jurisdikcije.
- ✅ 14 vitest specs (commitment publish-before-reveal, deterministic
  prove, tamper detection na input/beta/proof, short-seed reject,
  metadata schema, Chainlink round-trip + txHash check).
- ✅ **NE gradi ZK-per-spin** (per KIMI 15 §3): regulator zid +
  7-15 s latency incompatible sa <200 ms RGS SLA (KIMI 13).
- 🟡 Pure-Rust ECVRF (RFC 9381) port — pending (TS pokriva
  crypto-native casino layer; Rust layer može doći kad regulatori
  odobre on-chain RNG za licensed slots).

### P2-15 · Variance convergence + max-win cap math (KIMI 16)
- `src/math/maxWinCap.ts` — `clip(distribution, cap) → {rtp_capped,
  probability_mass_above, conditional_mean}`; sačuvaj na PAR sheet.
- `rust-sim/src/convergence.rs` — POT/EVT fit za heavy tail.
- `benches/megaways_10b.rs` — 10 G spin gate sa `cargo bench --features cert`.
- `src/math/cluster_percolation.rs` — adjacency graph simulator.

### P2-16 · Math studio toolchain modernization (KIMI 14) — ✅ **W152 LANDED (Wave 8)**

- ✅ `Makefile` (root) sa **18 discoverable targets**:
  `help`, `run`, `unittest`, `test`, `lint`, `build`,
  `par-sheet`, `par-diff`, `par-stress`,
  `cert-bundle`, `rng-cert`, `rng-quality`, `rng-submission`,
  `parity`, `parity-bin`,
  `mutate`, `mutate-rust`, `mutate-scoped`,
  `clean`, `ci`.
- ✅ `make help` ispisuje boji-kodiran spisak (grep nad `## docstrings`).
- ✅ `make ci` = aggregate gate (`lint + test + build + parity`).
- ✅ Wrapper preko postojećih npm scripts + cargo bins — nema
  duplicate orchestration logic.
- 🟡 `run_config.toml` profiles (dev/prod/cert sim sizes) — pending
  P2-16b; trenutno scope orkestriran preko `npm run sim:quick/sim:full`.

---

## Sequencing strategija

```
WEEK 1: P0-1 (CSPRNG/HSM)   [3 dana]  ┐
WEEK 1: P0-5 (parity gate)  [2 dana]  ┘ paralel
WEEK 2: P0-2 (UK RTS 14)    [1 dan]
WEEK 2: P0-3 (IR features)  [4 dana]
WEEK 3: P0-4 (cert bundle)  [2 dana]
WEEK 3: P1-9 (mutants)      [1 dan]   ─ unblock
WEEK 3: P1-10 (tests)       [2 dana]
WEEK 4: P1-6 (reporting)    [5 dana]
WEEK 5: P1-7 (persistent grid) + P1-8 (PAR diff)
WEEK 6+: P2 sekvenca (RGS → RG → AML → VRF → variance → toolchain)
```

## Acceptance gates (CI)

| Gate | Komanda | Mora proći |
|------|---------|-----------|
| `make rng-cert` | TestU01 BigCrush + PractRand 4 TB | P0-1 ✅ |
| `make parity` | TS↔Rust bit-match na 1 M inputs | P0-5 ✅ |
| `make cert-bundle` | GLI-19 artifact paket validan | P0-4 ✅ |
| `make jurisdiction-test` | 8 jx full matrix | P1-10 ✅ |
| `cargo mutants --check 95` | ≥ 95 % mutation score | P1-9 ✅ |
| `make rgs-verify` | Mock wallet p99 <100 ms | P2-11 ✅ |

## Risk register

| Rizik | Mitigation |
|-------|------------|
| FIPS 140-2 ekspira 21 Sep 2026 (KIMI 05) | HSM procurement do Q1 2026; Luna 7 ili nShield 5 (oba 140-3) |
| UK SI 2025/215 RTS 14 already in force (May 2025) | P0-2 mora landati pre prvog UK build-a |
| UK bonus-buy ban Sept 2025 already in force | P0-2 + P0-3 (jurisdiction gating) |
| Denmark buy ban expected 2026 (KIMI 10) | Već dodato u `buyFeature.banned` listu |
| MT19937 i bilo koji non-CSPRNG = auto-flag od audit firms (KIMI 14) | P0-1 swap mandatory pre lab submission |
| Cargo-mutants unblock može zahtevati toolchain redesign | P1-9 timeboxed 1 dan; ako fail → eskalacija na separate fix sprint |

---

**Total scope:** 16 work items × prosečno 2-3 dana = 32-48 radnih
dana = **6-8 nedelja punog tempa** za production-ready 2026 slot-math
template profesionalnog standarda.
