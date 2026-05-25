# W152 ULTIMATE — SYNTHESIS

> Cross-reference 16 KIMI deep research-a (`01..16`) sa internim Corti audit-om
> repozitorijuma `slot-math-engine-template`. Cilj: identifikovati **svaku
> rupu** koja deli ovaj template od profesionalnog 2026 slot-math studija
> (Pragmatic / Hacksaw / Nolimit / Push / Relax / ELK / Big Time Gaming).
>
> **Status:** ✅ Phase 1 (01–08) i Phase 2 (09–16) landed.
> 16 KIMI deep research-a integrisano. Izvršna sekvenca:
> `docs/W152/ACTION_PLAN.md`.

---

## 0 · TL;DR — top 10 rupa (CRITICAL)

| # | Rupa | Izvor | Severity | Sekcija |
|---|------|-------|----------|---------|
| 1 | Non-CSPRNG (PCG/Xoshiro) bez HSM reseed-a | KIMI 04, 05, 08 + audit §1‑8 | 🔴 CRIT | §2.1 |
| 2 | TS evaluator vs Rust evaluator — nije bit-match garantovan | Audit §16 | 🔴 CRIT | §2.2 |
| 3 | 5 IR features stub (cascade, pattern, respin, pick, wheel, buy, ante, mystery) | Audit §19‑20 | 🔴 CRIT | §2.3 |
| 4 | RTS 14 (UK SI 2025/215) — turbo/autoplay/false-win/multi-game ban nije enforced | KIMI 01 | 🔴 CRIT | §2.4 |
| 5 | Bonus-buy nije jurisdiction-gated (UK ban Sept 2025, NL ban May 2024) | KIMI 01, 03 (+10 pending) | 🔴 CRIT | §2.5 |
| 6 | Nema RNG submission artifact generator (96M raw bits + SHA256 + binary dump) | KIMI 02, 04 | 🔴 CRIT | §2.6 |
| 7 | Nema PKCS#11 HSM client (FIPS 140-3 procurement window: 21 Sep 2026) | KIMI 05 | 🔴 CRIT | §2.7 |
| 8 | Nema regulator reporting adapters (PGAD bin, DK XML, MGA portal, NJ Excel) | KIMI 06 | 🔴 CRIT | §2.8 |
| 9 | Nema persistent grid / Hold&Win Markov za moderne mehanike | KIMI 03, 07 | 🟡 HIGH | §2.9 |
| 10 | Cargo-mutants ≥ 95% — Rust mutation score BLOCKED | Audit §30 | 🟡 HIGH | §2.10 |

---

## 1 · Interni audit slot-math-engine-template (31 konkretnih rupa)

### 1.1 Stub moduli (8)
`src/jackpot/index.ts`, `src/rg/index.ts`, `src/sensitivity/index.ts`,
`src/crypto/index.ts`, `src/observability/index.ts`, `src/optimizer/index.ts`
— svi 2–3 linije re-export; logika razbijena u sibling fajlovima bez
javnog API ugovora.
`src/zkproof/prover.ts` — SNARK scaffold, komentari L310-311 "Phase 1
scaffold for real Groth16/PLONK", bez real circuit evaluation.
`src/qrng/sources.ts` — Quantinuum/IdQuantique cloud API stub-ovi (L161–218).

### 1.2 Test coverage rupe (3)
- `/tests/` nema: `rng.test.ts`, `jackpot.test.ts`, kompletni
  `jurisdiction.test.ts` (8 jurisdikcija — samo adapter pokriven).
- `/rust-sim/tests/` nema: HSM bridge realan test, `recall.rs`
  reproducibility, `gpu.rs` GPU kernel acceptance.
- Differential parity test za PCG-64 vs Xoshiro256SS = samo basic;
  cascade evaluator = TODO; **`pattern` evaluator ne postoji uopšte**.

### 1.3 Dependencies (4)
- `package.json`: `@noble/curves@1.9.7` (8 meseci star), `zod@4.2.1` deprecated.
- `Cargo.toml`: `fastrand 1.9` pinovan (getrandom 0.4 / edition2024 issue),
  `proptest 1.4` eksplicitno pinovan.
- Nema u repo-u: TestU01 BigCrush / NIST SP800-22 / PractRand binaries.
- `rust-sim/Cargo.toml` `gpu` feature postoji ali je prazna.

### 1.4 Architectural inconsistency (3)
- TS↔Rust duplikacija: `src/model/symbols.ts` enum vs `src/ir/adapter.ts` IR
  string IDs; `src/evaluators/lineEvaluator.ts` vs
  `rust-sim/src/evaluator.rs` — nema bit-match property test.
- Bridge FFI ne postoji: TS↔Rust RNG samo seeding, ne call bridge.
  `src/protocols/bridge.rs` postoji ali nije u TS pipeline.
- Legacy konstante: `src/config/gameConfig.ts` `NUM_REELS=5`, `NUM_ROWS=3`
  van IR-a — dve putanje aktivne.

### 1.5 TODO koncentracija (3)
- `src/ir/adapter.ts` — TODO za cascade (L382), pattern (L335), respin /
  pick / wheel / buy / ante / mystery (L384–426). **5 features stub.**
- `rust-sim/src/ir/adapter.rs` — identičan skup TODO-ova.
- `src/qrng/sources.ts` + `src/zkproof/prover.ts` — 5+ stub marker po fajlu.

### 1.6 Missing professional artifacts (8)
1. `math-spec-schema.json` (JSON Schema za IR validaciju izvan Zod-a).
2. `docs/gli19-checklist.md` — per-clause sign-off table za 35 klauza.
3. `docs/jurisdiction-matrix.csv` — RTP bounds / bet caps / spin time
   side-by-side za 8+ jurisdikcija.
4. `src/rgs/*` — RGS adapter spec / API contract.
5. `docs/rg-hook-reference.md` — hook signatures.
6. `src/fraud/AML_SIGNALS.md` — koje događaje emituje template.
7. `benchmarks/HARNESS.md` — multi-OS bench runner.
8. `scripts/certification-pipeline.sh` — GLI artifact generator.

### 1.7 Known gaps (MASTER_TODO + ULTIMATE_SCENARIOS)
- ~70 % code complete / **~35 % acceptance proof complete** (MASTER_TODO L18-25).
- **P0 BLOCKED:** Rust mutation score (cargo-mutants vs rust-toolchain pin).
- ULTIMATE_SCENARIOS §13.6 cross-game wallet, §13.8 federated ML — netaknuto.

---

## 2 · KIMI Phase 1 nalazi → ukrštanje sa auditom

### 2.1 RNG / CSPRNG — KIMI 04 + 08

**Šta KIMI tvrdi:**
- TestU01 BigCrush window `p ∈ [0.001, 0.999]`; <10⁻¹⁰ = "clear fail",
  [10⁻¹⁰, 10⁻⁴) = "suspicious".
- PractRand 4 TB = de-facto threshold pre BigCrush; labs idu do 32 TB.
- BigCrush wall-clock: MT19937 ~3 h, PCG64 ~4–6 h, Xoshiro256SS ~4 h.
- **Philox4x32 64-bit key recovery za ~1 dan na 500–1 k RTX 4090** (ePrint 2025).
- Mersenne Twister: 624 outputs = full state reveal (open-source crackers).
- "Alex" 2017: reverse-eng. Novomatic/Vendor C PRNG → $250 k/week.

**Rupa u template-u:**
- `src/rng/` koristi PCG-64 + Xoshiro256SS — **ni jedan nije CSPRNG**.
- Nema NIST SP 800-90A DRBG (AES-CTR / Hash / HMAC) niti ChaCha20.
- Seed nije iz FIPS entropy source; nema per-spin reseed iz HSM.

**Action:**
1. Dodaj `src/rng/csprng.rs` + `rust-sim/src/rng/chacha20_drbg.rs`
   (ChaCha20Rng iz `rand_chacha`, ili AES-CTR DRBG `aes-prng` crate).
2. Seed isključivo iz HSM ili `getrandom` sa SP 800-90B health check.
3. Per-spin reseed ako latency < 100 ms; inače reseed every N spins (cap 1k).
4. Integrate TestU01 + PractRand u CI (separate workflow, 4 TB nightly).

### 2.2 GLI-19 / GLI-11 / GLI-16 — KIMI 02

**Šta KIMI tvrdi:**
- GLI-19 v3.0 (2020) **NIJE menjana**; samo fake izvori tvrde v3.1.
- GLI-16 v3.0 (2024) **JESTE novo**.
- "Cryptographically strong" RNG = otpornost na direct cryptanalysis +
  known-input + state-compromise-extension.
- Periodic reseed iz **external entropy** (ne samo time).
- Submission format (Composite Req v2.0): ~96 M raw bits, ~100 M+ final
  outcomes, SHA256 checksum, hardware spec, src za GLI compile+sign.
- PAR sheets: svaka RTP izmena = nova igra.

**Rupa u template-u:**
- Nema RNG test artifact generator (`scripts/gli19-rng-dump.sh` ne postoji).
- Nema PAR sheet versioning system.
- Nema GLI-19 per-clause checklist (audit §1.6 #2).

**Action:**
1. `scripts/gli19-rng-artifact.rs` — bin koji dumpuje N bita, hash-uje,
   pakuje sa hardware report (uname, cpuid, getrandom backend).
2. `src/math/par-sheet/` — JSON-versioned PAR sa diff alat.
3. `docs/compliance/gli19-checklist.md` — 35-rod tabela sa sign-off.

### 2.3 Mehanike 2024-2026 — KIMI 03

**Šta KIMI tvrdi:**
- Tri kampa: reel-based (Megaways/Hold&Win), persistent-grid
  (Money Train 4 — strongly non-Markov entre respins), physics
  (Plinko / Reapers — non-reel paradigma).
- IR mora imati: dynamic `reel_height[]`, `cascade_step` counter,
  `grid_state` (per-cell `(symbol_type, value, is_persistent)`),
  `adjacency_graph` (cluster split 2-4 sub-simbola), `tree_height /
  tree_multiplier` (Hacksaw Tree-of-Life vertical growth).

**Rupa u template-u:**
- IR adapter (TS + Rust) — 5 feature stub (cascade, pattern, respin,
  pick, wheel, buy, ante, mystery).
- Hardcoded reel height + grid dim u `gameConfig.ts`.
- Nema `adjacency_graph` ili persistent grid matrix.
- Nema "non-reel" game type.

**Action:**
1. Implementiraj IR feature-e u redosledu: `cascade` → `mystery` → `respin`
   → `buy` (jurisdiction-gated) → `pick` → `wheel` → `pattern` → `ante`.
2. Migriraj `gameConfig.ts` u IR-only (obriši legacy konst).
3. Dodaj `GameType::NonReel(PhysicsConfig)` enum u IR.
4. `grid_state` matrix u TS + Rust sa identical struct layout test.

### 2.4 UK SI 2025/215 + RTS 14 — KIMI 01

**Šta KIMI tvrdi (efektivno 9-21 May 2025):**
- £5 max stake (25+), £2 (18-24).
- Ban turbo/slam-stop (RTS 14E), autoplay (8A), false-win FX (14F),
  multi-game play (14C).
- Bonus wagering cap 10× od januara 2026.

**Rupa u template-u:**
- Nema jurisdictional age-gated stake switch.
- Nema bonus-cap multiplier enforcement.
- Nema RTS 14 flag set na config nivou.

**Action:**
1. `src/jurisdiction/uk.ts` — `{stakeCap:{adult:5, young_adult:2},
   bonusWageringCap:10, banTurbo:true, banAutoplay:true,
   banFalseWin:true, banMultiGame:true}`.
2. Engine guard u `simulator.ts` — refuse spin ako stake > cap, ako bonus
   wagering > cap, ako turbo flag enabled.

### 2.5 Bonus-buy gating — KIMI 01 + 03 (10 pending)

**Šta KIMI tvrdi:**
- UK Sept 2025 = complete ban. NL May 2024 = ban. MGA = dozvoljeno.
- Pricing model: volatility-tier 50×–500× (Hacksaw/Nolimit), ne pure EV.

**Rupa u template-u:**
- Nema `feature.buy.enabled` jurisdiction flag.
- Nema volatility-tier pricing calculator.

**Action:**
1. `src/features/buyFeature.ts` — `enabled: jurisdiction.allowsBuyFeature()`.
2. Pricing API: `pricing(jurisdiction, volatilityTier) → costMultiplier`.
3. Sim invariant: ako disabled, kupon nikad nije aktiviran.

### 2.6 RNG submission artifact — KIMI 02 + 04

(integrisan sa §2.1, §2.2 — single artifact pipeline)

### 2.7 HSM — KIMI 05

**Šta KIMI tvrdi:**
- FIPS 140-2 ekspira 21 Sep 2026 — Cloud HSMs (AWS, Google) još 140-2.
- Luna 7, Entrust nShield 5 = 140-3 L3 dostupno.
- YubiHSM 2 $650, 13 ops/s; Luna A790 20 k ECC/s.
- Rust: `rust-cryptoki` crate kompatibilan svi PKCS#11 (osim Google gRPC).
- Sve osim Google Cloud HSM podržavaju Ed25519.

**Rupa u template-u:**
- `src/hsm/` postoji folder — sadržaj? (audit ne našao kod, samo strukturu).
- Nema PKCS#11 dependency u Cargo.toml.

**Action:**
1. `rust-sim/Cargo.toml`: add `cryptoki = "0.9"` (compat 140-3 Luna 7).
2. `src/hsm/pkcs11.rs` — `Pkcs11Client::sign(transcript) -> Ed25519Sig`.
3. Mock backend `MemoryHsm` za dev; real backend feature-gated `hsm-real`.
4. Health check loop: HSM reachability + key availability 60 s.

### 2.8 Reporting adapters — KIMI 06

**Šta KIMI tvrdi:**
- UK: quarterly portal (Remote Casino return, GGY, self-excl., due 28 d).
- MGA: monthly Player Funds Report do 20. sledećeg meseca (portal).
- IT ADM: **real-time PGAD/SOGEI binary** (fiksne širine, ne XML/JSON),
  10 g. AML retention.
- AGCO Ontario: daily/monthly GGR SFTP/SharePoint, 120 d audit.
- DK: per-session `KasinospilPrSessionStruktur` XML na SAFE, 5 min max
  lag, EOD do 04:00 UTC.

**Rupa u template-u:**
- Nema canonical event schema.
- Nema niti jednog adaptera (PGAD bin, DK XML, NJ Excel, UK/MGA/ON rollup).
- Retention policy nije implementiran.

**Action:**
1. `src/reporting/event_schema.ts` — `{operator_id, player_pseudo_id,
   game_id, session_id, ts, wager, win, currency, game_type,
   jackpot_contribution}`.
2. `src/reporting/adapters/{uk,mga,adm,agco,nj,dk,de}.ts`.
3. Retention: 10 g. IT (najjača); per-jurisdiction config.

### 2.9 Bonus math non-linearity — KIMI 07

**Šta KIMI tvrdi:**
- Moderne slove 55–65 % RTP u features (vs 35–45 % base).
- Hold&Win = geometric-reset respin chain; per-cell hit p tuning.
- Mystery reveal: xWays 1→4 simbola, ways 729→11 664.
- Multiplier additive (Gates of Olympus, no cap) vs position
  (Sugar Rush x128 cap); product rare jer ne prođe lab.
- Max-win caps truncate tail; probability-mass clipping = mandatory math.

**Rupa u template-u:**
- Nema respin-chain simulator.
- Nema mystery-reveal logic.
- Nema multiplier-cap enforcement / variance budget.

**Action:**
1. `src/features/holdAndWin.ts` — Markov sa `resetOnHit:true`.
2. `src/features/mysteryReveal.ts` — symbol substitution config.
3. `src/math/maxWinCap.ts` — `clip_mass(distribution, cap) -> {clipped_p,
   conditional_mean}`.

### 2.10 Cargo-mutants pin — Audit §30

**Stanje:**
- Rust mutation score ≥ 95 % je P0 ali BLOCKED zbog `cargo-mutants` vs
  `rust-toolchain.toml` pin mismatch.

**Action:**
1. Probaj `cargo-mutants 25.0.1+` (proverio kompatibilnost sa pinom).
2. Ili: unpinuj toolchain na `1.85.0-channel` ili switchuj na rolling MSRV.

---

## 3 · Phase 2 (09–16)

| # | Tema | Status |
|---|------|--------|
| 09 | Sim-to-cert reproducibility (Pragmatic, Hacksaw, ELK pipeline) | ✅ landed |
| 10 | Buy-feature regulatory ban deep-dive 2024-2026 | ✅ landed |
| 11 | RG technical hooks (UKGC RTS 8/8B, MGA PPD, GAMSTOP, CRUKS) | ✅ landed |
| 12 | AML/transaction monitoring obligations | ✅ landed |
| 13 | RGS integration protocols (Pragmatic, Relax, OneTouch, Vendor B, Vendor A) | ✅ landed |
| 14 | Math studio toolchain (Mathematica/Rust/Python) | ✅ landed |
| 15 | ZK / verifiable RNG state-of-art | ✅ landed |
| 16 | Megaways / Cluster / Infinity-Reels closed-form vs sim | ✅ landed |

### 3.12 AML / transaction monitoring — KIMI 12

**TL;DR:** Regulatori (FATF, FinCEN, EU 6AMLD) očekuju real-time emit
per-spin telemetry iz slot servera u operator PAM <1 s; AML *scoring*
ostaje operator-side. Triggeri: deposit-bez-igre, rapid in-out, dormant
reactivation. CDD thresholds: US $10 k, EU/MT €2 k, UK £3 k.

**Ključni nalazi:**
- FinCEN Oct 2025 SAR FAQs: kazina = "designated non-financial businesses".
- GLI-19 izričito: dormant-account / no-gameplay monitoring = *operator
  responsibility*, ne suplajer.
- UKGC enforcement H1 2025: Platinum Gaming €10 m, ProgressPlay €1 m,
  Videoslots £650 k za AML failures (>$160 m globalno, 40+ akcija).

**Rupa u template-u:**
- `src/fraud/` ima skelet ali **nema event emitter** ka PAM-u.
- Nema `dormant_flags`, nema bonus audit trail emit.

**Action:**
1. `src/fraud/telemetry_emitter.ts` + `rust-sim/src/fraud/emit.rs` —
   `{ts, bet, win, game_id, round_seed, session_id, player_level}` via
   gRPC ili HTTP, sub-second.
2. `src/fraud/dormant.ts` — emit reactivation event posle 30 d neaktivnosti.
3. `src/fraud/bonus_audit_trail.ts` — log opt-in, wagering milestones,
   cashout requests.
4. `docs/AML_BOUNDARY.md` — eksplicitno: scoring/CTR/sankcije = operator.

### 3.14 Math studio toolchain — KIMI 14

**TL;DR:** Top studios 2026 = Python 3.12 (rules) + Rust (hot path) +
TOML orchestration. Slot Designer SD4 (komerc.) dominira spec authoring.
**Mersenne Twister više nije prihvatljiv;** counter-based **Philox**
(C++26 P2075) je novi baseline. RGS lock-in: Hive (Push), OpenRGS
(Hacksaw), OMNY v2.1 (Play'n GO).

**Ključni nalazi:**
- Stake-engine-math GitHub leak (Jan 2026): production SDK =
  Python rules + Rust optimizer + TOML threading config.
- Slot Designer (2023): "Excel cannot model all games; Megaways,
  Cascading Reels, Sticky Wilds = simulation-only".
- Audit firms (Gamix Labs 2024) favorizuju cryptographically-aware
  generators; MT19937 = automatic flag.

**Rupa u template-u:**
- Template ima TS + Rust ali **nedostaje TOML run profile** (dev 1 k
  sims vs prod 1 M sims).
- Nema `Makefile` targeta `par-sheet`, `rgs-verify`.
- RNG izbor PCG-64 / Xoshiro256SS — **nema Philox put**.

**Action:**
1. `run_config.toml` — `[profile.dev] sims=1000`, `[profile.prod]
   sims=1_000_000`, `[profile.cert] sims=10_000_000_000`.
2. `Makefile`: `make run`, `make unittest`, `make par-sheet`, `make
   rgs-verify`, `make cert-bundle`.
3. `src/rng/philox.rs` — Random123 (D.E. Shaw) Philox4x32_10 sa
   counter-based skip-ahead za parallel Monte Carlo.
4. `scripts/par-sheet-export.ts` — JSON → Excel/PDF za lab submission.

### 3.15 ZK / verifiable RNG — KIMI 15

**TL;DR:** **Ni jedan licencirani slot RNG ne koristi ZK proofs u
produkciji.** "Provably fair" = SHA256/HMAC commit-reveal (Stake,
Rollbit→ECVRF RFC 9381). Chainlink VRF v2.5 = jedini GLI-19-certified
on-chain oracle (~2 s latency). UKGC/MGA nisu odobrili ZK slot RNG.
Risc0/SP1 proof = sekunde-minute, ne ms.

**Ključni nalazi:**
- Rollbit (2025): ECVRF `SECP256K1_SHA256_TAI` — public-key verify bez
  privatnog ključa.
- Chainlink VRF v2.5: 20 M+ requests, GLI-19 via BMM Testlabs.
- Risc0 GPU: 7–15 s za EVM programe, proof 222 KB – MB.
- UKGC 2025: aktivni crackdown na unlicensed crypto-native operatera.

**Rupa u template-u:**
- `src/zkproof/prover.ts` SNARK scaffold = **dead code za regulatory put**.
- Nema ECVRF RFC 9381 implementacije.
- Nema VRF abstrakcija za Chainlink VRF v2.5 integration.

**Action:**
1. **NE GRADI** ZK-per-spin arhitekturu — regulator zid.
2. `src/rng/vrf.rs` — ECVRF RFC 9381 `SECP256K1_SHA256_TAI` (koristi
   `vrf-rs` ili `ecvrf` crate).
3. `src/rng/chainlink_vrf.rs` — adapter za on-chain GLI-19 path
   (feature-gated `feat = "onchain-vrf"`).
4. `src/zkproof/` → reklasifikuj kao "backend financial reconciliation"
   (post-session attestation), ne front-end RNG. Update README.
5. `docs/PROVABLY_FAIR.md` — eksplicitno: commit-reveal layer postoji
   *iznad* GLI-19 certified RNG-a, ne umesto.

### 3.16 Megaways / cluster / infinity-reels variance — KIMI 16

**TL;DR:** **Nema published closed-form** za Megaways, Infinity Reels,
Gigablox ili cluster-pays. Industrija = proprietary solvers (SD4) +
100 M–10 B spinova. Max-win cap math = trivial truncation. Heavy-tailed
slot distributions nemaju dedicated convergence theory (no published
Stein/saddle-point/Cramér-tilting).

**Ključni nalazi:**
- Megaways 6 reels × 2–7 = do 117 649 načina; product distribucija nad
  weighted virtual reels = zero closed-form.
- ReelPlay Infinity Reels = trademark/patent maths engine, reverse-eng
  "almost impossible".
- Vendor D cluster-pays = percolation/adjacency; coinciding wins =
  analytically intractable.
- GLI/BMM/iTech sample sizes nesistematski: academic 100 M, Gamix 10 B,
  UKGC pretpostavlja normal convergence ~1 M.
- Max-win cap: `E[capped] = E[X] − E[(X−C)⁺]`; trivial ali često
  *neprijavljen* na PAR sheet-u.

**Rupa u template-u:**
- `src/math/megaways.ts` — postoji ali bez 10 B-spin budget.
- Nema max-win cap probability-mass conservation.
- Nema percolation/adjacency convergence test.

**Action:**
1. `src/math/maxWinCap.ts` —
   `clip(distribution, cap) → {rtp_capped, probability_mass_above, cond_mean}`.
   Sačuvaj `probability_mass_above` na PAR sheet-u.
2. `rust-sim/src/convergence.rs` — POT/EVT fits za heavy tail; ne samo
   ±0.5 % RTP normal CI.
3. `benches/megaways_10b.rs` — long-run prof za 10 B spinova; CI gate
   `cargo bench --features cert`.
4. `src/math/cluster_percolation.rs` — adjacency graph simulator;
   compare convergence vs naive Monte Carlo.
5. `docs/CONVERGENCE.md` — decision tree: closed-form ✓ / sim-only ✗ /
   hybrid.

### 3.09 Sim-to-cert reproducibility — KIMI 09

**TL;DR:** GLI-19 zahteva source-code review + statistički testovi
(chi-square, runs) na 99 % CL; **NE prescriba fixed spin count**.
Industrija interno cilja 1–10 G spinova ±0,1 % RTP. Handoff = code +
math spec + SHA-256 manifest. Multi-RTP variant → multi-build cert
matrix (Hacksaw 4× RTP = 4 odvojena certified build-a).

**Ključni nalazi:**
- Pragmatic Sweet Bonanza testirana na 50 M; Gamix Labs standard 10 G
  pre lab submission-a.
- Gaming Associates reports pinjuju SHA-1 hash po RNG komponenti na
  konkretnu verziju (`24.4.2`).
- Slot Designer (single-node): 100 M sims u ~12 s. Nema javnih dokaza
  za Rayon/Tokio/Spark u studio pipelines.
- Multi-RTP version pinning mora pokriti **RNG + feature code +
  jurisdiction rulesets** kao 1 atomski manifest.

**Rupa u template-u:**
- Nema SHA-256 manifest generatora.
- Nema checkpoint-restart u Monte Carlo workeru.
- Nema RTP-lock CI gate.

**Action:**
1. `src/sim/rng_hasher.ts` + `rust-sim/src/sim/hasher.rs` — iterira
   `src/{rng,features,jurisdiction,evaluators,ir}/**`, emituje
   `{component, version, sha256}` JSON manifest.
2. `src/sim/seed_manager.ts` — eliminiši `Date.now()` seed; isključivo
   `crypto.getRandomValues()` ili HSM.
3. `rust-sim/src/sim/checkpoint.rs` — periodic snapshot `{spin_count,
   rng_state, rolling_stats}` na disk; resume API.
4. `rust-sim/src/recall/rtp_lock.rs` — `assert |empirical_rtp -
   target_rtp| < tol_pct` posle N spinova; CI fail ako ne.
5. `scripts/cert-build-matrix.sh` — multi-RTP × multi-jurisdiction
   build product → distinct manifests.

### 3.10 Buy-feature regulatory gates — KIMI 10

**TL;DR:** Bonus-buy ban: **UK, NL, DE, DK**. Dozvoljen: **IT, ES, RO,
ON, NJ, PA, MI**. Sweden = politički sporno, dozvoljeno za sada
(55 % igrača za ban per Play'n GO Feb 2024). Industrija = server-side
jurisdiction flag, ali neki regulatori zahtevaju separate certified
binary.

**Ključni nalazi:**
- UKGC RTS 14 Jan 2020: "must not actively encourage stake increase" —
  UK builds ship sa **deaktiviranom** feature.
- Netherlands KSA: bonus-buy klasifikovan kao impermissible autoplay
  (Remote Gambling System Assessment Scheme).
- GlüStV 2021 (DE): explicit prohibition "Feature Bonus Kauf" + €1
  stake + 5 s delay → mehanički nemoguće.
- Nolimit City revenue impact Sweden ban diskusije: "hundreds of
  millions of SEK".
- Denmark Gambling Package 1 (Oct 2025): expected 2026 enforcement.

**Rupa u template-u:**
- `src/features/buyFeature.ts` nije jurisdiction-aware.
- `src/jurisdiction/rules.ts` nema `buyFeature.banned` listu.
- Nema compliance test koji potvrđuje `buyFeature === null` u banned
  builds.

**Action:**
1. `src/jurisdiction/rules.ts` — `buyFeature: { banned: [UK, NL, DE,
   DK], configurable: [IT, ES, RO, ON, NJ, PA, MI], permitted_contested:
   [SE] }` + effective dates.
2. `src/features/buyFeature.ts` — refactor: `isBuyFeatureEnabled(jx)`
   getter; ne build-bake-uj feature u client kod.
3. `tests/jurisdiction/buyFeatureCompliance.spec.ts` — per-banned-jx
   assert da binary nema buy entrypoint.
4. `src/rg/affordability_gate.ts` — UK RTS 14: tretiraj buy kao "stake
   increase" → affordability prompt pre klika.
5. `docs/REVENUE_IMPACT.md` — dokumentuj: izgubljen feature kanal
   ≈ 5–15 % market revenue (Nolimit / Play'n GO precedent).

### 3.11 RG technical hooks — KIMI 11

**TL;DR:** 2025–2026 regulatori traže **synchronous, server-side**
RG hooks: real-time self-exclusion API (GAMSTOP/OASIS/Spelpaus/ROFUS/
CRUKS), reality checks, loss/deposit limits, sub-500 ms latency.
Cached status = non-compliant. UKGC tvrdi 97 % "frictionless"
affordability audits, ali UK black market 5–9 % zbog friction.

**Ključni nalazi:**
- UKGC RTS 12/14 (eff. 31 Oct 2025): gross deposit limit + block +
  24 h cooling-off. Bez grace period.
- GAMSTOP **mora** biti query-ovan real-time, ne cached (SBC News 2025).
- MGA "Markers of Harm": transactions, payments, reversals, comms,
  RG-tool usage — automated, traceable.
- GGL OASIS v6.0: `POST /spielerstatus`, TLS 1.3, Actor ID / API Key.
  €1 stake cap + €1 k monthly default + mandatory 5 min break / 1 h.
- Spelpaus SIFS 2026:3 (eff. 1 Aug 2026): **odvojeni** login vs
  marketing API (Actor ID / API Key).

**Rupa u template-u:**
- `src/rg/` ima types ali nema centralizovani event emitter.
- Nema self-exclusion client wrapper niti circuit breaker.
- Nema latency budget monitoring.

**Action:**
1. `src/rg/hooks.ts` — centralni emitter:
   `REALITY_CHECK_ACK`, `SPIN_SPEED_GATE`, `DEPOSIT_LIMIT_BLOCK`,
   `LOSS_LIMIT_REACHED`, `SELF_EXCLUSION_LOOKUP`,
   `AFFORDABILITY_SCREEN`, `SESSION_TIMER`, `COOLING_OFF_INIT`.
2. `src/rg/self_exclusion_client.ts` — async wrapper:
   `queryGAMSTOP`, `queryOASIS`, `querySpelpaus`, `queryROFUS`,
   `queryCRUKS`, `queryOntarioCSE`. Circuit-breaker 500 ms; fail-closed
   (block-on-failure).
3. `src/rg/limits.ts` — server-side enforcement sa DB row lock:
   `checkDepositLimit`, `checkLossLimit`, `checkSessionDuration`,
   `initCoolingOff`.
4. `rust-sim/src/jurisdiction/rg_profile.rs` — per-jx struct:
   `{deposit_limit, loss_limit, reality_check_frequency,
   session_time_cap, spin_speed_ms, self_exclusion_apis: Vec<ApiSpec>,
   affordability_triggers}`.
5. `src/recall/latency_budget.ts` — p95 monitor po API call; alert
   > 500 ms; log timeout fallback decisions.

### 3.13 RGS integration protocols — KIMI 13

**TL;DR:** Nema univerzalnog RGS standarda — svi veliki provideri
proprietary HTTPS/REST sa različitim auth (HMAC/JWT/RSA), atomska
debit→RNG→credit lifecycle, sub-200 ms SLA. GLI-19 je baseline (NE
GLI-31). Math-engine mora biti **stateless** sa pluggable wallet adapter.

**Ključni nalazi:**
- REST/JSON dominira (CasinoWebScripts 2025, Stake Engine 2025); SOAP
  legacy (WagerWorks 2010). WebSocket = game events; wallet uvek sync REST.
- Auth: CasinoWebScripts HMAC-SHA256, Hub88 RSA-SHA256, Capermint JWT.
  **Nema unifikacije** → plug-in middleware obavezan.
- Lifecycle: `getbalance` + `balance_adj`; Stake Engine `/wallet/play`
  + `/wallet/end-round`. Atomska debit-pre-RNG + credit-u-istoj-tx.
- Idempotency: UUID obavezna (`uniqid`, `transaction_uuid`). Hub88 3×
  retry 1 s, CasinoWebScripts 1× retry 5 s → queue.
- Latency: enterprise <50 ms; SLA prag <200 ms; preko = churn.
- Free spins / bonus = external promo token koji suppress real-balance
  debit (BetConstruct FSWithdraw/Deposit; Pragmatic Enhance; Yggdrasil BOOST).
- GLI-19 je RGS baseline; **GLI-31 NIJE** (raffle systems).

**Rupa u template-u:**
- `src/protocols/` postoji (Bridge.rs unused) ali nema `RgsProtocol` trait.
- Nema `src/rgs/` (wallet adapter doesn't exist).
- Nema RGS latency benchmark / mock harness.

**Action:**
1. `src/protocols/rgs.ts` + `rust-sim/src/protocols/rgs.rs` — trait
   `RgsProtocol { endpoint_builder, auth_resolver, json_codec }`.
2. `src/rgs/wallet_adapter.ts` — trait `WalletBackend {
   debit(uuid, amount), credit(uuid, amount), rollback(uuid) }`.
3. `src/rgs/auth/{hmac,jwt,rsa}.ts` — pluggable signer middleware.
4. `src/rgs/envelope.ts` — `{status, balance?, error?, transaction_id}`.
5. `src/rgs/promo_token.ts` — parser; suppress real-balance debit.
6. `src/engine/round_event.ts` — `RoundEvent {player_id, bet_uuid,
   win_uuid, elapsed_ms, compliance_hash}` → async event queue.
7. `tests/rgs/mock-walletservers/` — docker-compose sa Hub88 + CWS mock;
   round-trip benchmark assert <100 ms p99.
8. `docs/RGS_INTEGRATION.md` — integrator handbook: koji auth, koji
   endpoints, expected response format.

---

## 4 · Predložena P0 / P1 / P2 sekvenca

**P0 (sledećih 5 sesija):**
1. CSPRNG swap (ChaCha20Rng) + HSM seed signing.
2. UK RTS 14 jurisdiction config + bonus-buy gating.
3. RNG submission artifact generator (GLI-19 v3.0 compliant).
4. IR feature unstub: cascade → mystery → respin (3 najurgentnija).
5. TS↔Rust bit-match property test.

**P1 (sledećih 5 sesija):**
6. Reporting adapter trojka (UK, MGA, ADM bin).
7. Persistent grid Hold&Win simulator.
8. PAR sheet versioning + diff tool.
9. cargo-mutants unblock → ≥ 95 % Rust mutation.
10. Test coverage: rng, jackpot, jurisdiction (full).

**P2:**
11. RGS adapter spec (KIMI 13 → §3.13).
12. RG hooks reference doc + tests (KIMI 11 → §3.11).
13. AML signal spec (KIMI 12 → §3.12).
14. ZK / VRF backend (KIMI 15 → §3.15 — **NE GRADI ZK-per-spin**).
15. Reduced-form variance closed-form (KIMI 16 → §3.16).
16. Math studio toolchain modernization (KIMI 14 → §3.14).
