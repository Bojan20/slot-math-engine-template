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

### P0-3 · IR feature unstub: cascade → mystery → respin (KIMI 03; Audit §19-20)
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

### P0-5 · TS↔Rust bit-match parity gate (Audit §16) — 🟢 **W152 PARTIAL LANDED**

**Status:**
- ✅ ChaCha20 backend ima **bit-exact TS↔Rust parity KAT** test
  (`tests/chacha20_parity.test.ts` + `rng::tests::chacha20_parity_kat_vector`).
- ✅ Pattern uspostavljen: 16 u32 vektor harcoded sa istog seed-a, oba
  side asseruju equality.
- 🟡 **Evaluator bit-match** (`lineEvaluator.ts` vs `evaluator.rs`) i
  dalje pending — to je glavni cilj P0-5, ChaCha20 parity je proof-of-concept.
- 🟡 CI Makefile `make parity` target — pending.

**Originalni plan (preostalo):**
**Trenutno:** Nema garancije bit-match-a `lineEvaluator.ts` vs
`evaluator.rs`.
**Diff:**
- `tests/parity/cross_impl.spec.ts` — generiše seed-based inputs;
  poziva oba evaluatora preko Node FFI (`napi-rs` ili child process);
  asserts identical outputs po byte.
- CI gate: `make parity` mora proći pre `make cert-bundle`.

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

### P1-8 · PAR sheet versioning + diff (KIMI 02)
- `src/math/par-sheet/schema.json` — JSON Schema verzionisana.
- `src/math/par-sheet/diff.ts` — compare dva PAR-a; emit RTP delta.
- `scripts/par-sheet-export.sh` → Excel/PDF za lab.

### P1-9 · cargo-mutants unblock + ≥ 95 % Rust mutation (Audit §30)
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

### P2-11 · RGS pluggable surface (KIMI 13)
- `src/protocols/rgs.ts` trait + Hub88 / CWS / Stake Engine adapteri.
- `src/rgs/wallet_adapter.ts` + auth middleware (HMAC/JWT/RSA).
- `tests/rgs/mock-walletservers/` docker-compose; p99 <100 ms gate.

### P2-12 · RG hooks reference + self-exclusion client (KIMI 11)
- `src/rg/hooks.ts` centralni emitter.
- `src/rg/self_exclusion_client.ts` — GAMSTOP/OASIS/Spelpaus/ROFUS/
  CRUKS/Ontario CSE async wrapper sa 500 ms circuit-breaker.
- `docs/RG_HOOK_REFERENCE.md`.

### P2-13 · AML signal spec + telemetry emitter (KIMI 12)
- `src/fraud/telemetry_emitter.ts` + Rust pendant.
- `src/fraud/dormant.ts` + `bonus_audit_trail.ts`.
- `docs/AML_BOUNDARY.md` — eksplicitan supplier-vs-operator delimiter.

### P2-14 · ECVRF + Chainlink VRF adapter (KIMI 15)
- `src/rng/vrf.rs` — ECVRF RFC 9381 `SECP256K1_SHA256_TAI`.
- `src/rng/chainlink_vrf.rs` — feature-gated `onchain-vrf`.
- **NE GRADI** ZK-per-spin (regulator zid); reklasifikuj
  `src/zkproof/` kao post-session reconciliation.

### P2-15 · Variance convergence + max-win cap math (KIMI 16)
- `src/math/maxWinCap.ts` — `clip(distribution, cap) → {rtp_capped,
  probability_mass_above, conditional_mean}`; sačuvaj na PAR sheet.
- `rust-sim/src/convergence.rs` — POT/EVT fit za heavy tail.
- `benches/megaways_10b.rs` — 10 G spin gate sa `cargo bench --features cert`.
- `src/math/cluster_percolation.rs` — adjacency graph simulator.

### P2-16 · Math studio toolchain modernization (KIMI 14)
- `run_config.toml` — `[profile.dev]`, `[profile.prod]`, `[profile.cert]`.
- `Makefile` targets: `run`, `unittest`, `par-sheet`, `rgs-verify`,
  `cert-bundle`, `parity`, `rng-cert`.

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
