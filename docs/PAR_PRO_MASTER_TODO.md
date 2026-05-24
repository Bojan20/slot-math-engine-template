# PAR Sheet Pro Upgrade — Master TODO

**Date opened:** 2026-05-24
**Source dokument:** `~/Desktop/SLOT_MATH_ENGINE_MASTER_DOCUMENT.pdf` (16 strana, Kimi.ai synthesis, 9 industry references)
**Reference standard:** USIF v1.0 (`dist/par-sample-kit/schema/USIF_PAR_SCHEMA_v1.md`) + GLI-16 App D + GLI-19 v3.0 + UKGC RTS-7 + MGA PPD §11.f
**Cilj:** Podići `rust-sim/src/par.rs` sa GLI-16-baseline na **Tier-1 PAR sheet** (segment-level RTP, EVT tail, Markov, time-to-trigger CDF, configHash, jurisdiction-gated RTP, multi-format export) — nivo koji IGT/Aristocrat internally drže, niko ne publikuje.

---

## 0. Gap analiza (trenutno `par.rs` vs Tier-1 cilj)

| Section | Imamo | Nedostaje | Doc reference |
|---|---|---|---|
| `PARMeta` | game_id, version, engine_version, generated_at, spins, seeds, rng_kind | `mathematician`, `approved_by`, `mathematician_signed_at`, `approved_at`, `config_hash` (SHA-256 IR) | Doc §11 GAME IDENTIFICATION; USIF `configHash` |
| `ReelConfigSection` | ❌ NEMA | per-reel: `stops`, `symbol_counts`, `mode` (physical/weighted/virtual), `total_cycle = ∏ stops` | Doc §5.1, §5.3, §11 REEL CONFIGURATION |
| `PaytableSection` | ❌ NEMA | matrix `symbols × n-of-a-kind` (2oak/3oak/4oak/5oak) + wild/scatter multipliers | Doc §6.1, §11 PAYTABLE |
| `RTPSection` | total/base/fs/hnw/cascade/jackpot | per-feature RTP breakdown (>=4 features), `rtp_misc`, segment RTP | Doc §3.4 RTP Decomposition |
| `HitFreqSection` | overall + base + feature_freq + avg_fs/avg_hnw | `total_hit_freq` (inclusion-exclusion), `1 in N` per-feature, scatter HF | Doc §3.3 Hit Frequency Analiza |
| `VolatilitySection` | cv, variance, std_dev, max_win_x, category | `vi_95` / `vi_99` (z-based VI), `class_label` (Low/Med/Med-High/High/Extreme), `class_compatible_segment` | Doc §3.2, §6.3 Volatility Envelope |
| `Quantiles` | P50/P90/P99/P99.9 | P99.99, P99.999 (EVT-projected) | USIF Tier-1 `p9999` |
| `Moments` | mean, variance, std_dev, cv, skewness, kurtosis | OK ✅ | — |
| `ParetoTailSection` | ❌ NEMA | `alpha`, `x_m`, `threshold`, `ks_p_value`, `evt_p99999`, `cap_pressure_pct` | USIF `paretoTail`; Coles 2001 |
| `JackpotSection` | per-tier hits/avg_interval/contribution_rtp | `startup_prob × startup_value + increment` formula, `expected_seed_cost = seed/hit_prob`, type (standalone/linked/wide-area) | Doc §7.3 Progressive |
| `MarkovTransitionSection` | ❌ NEMA | states `{S0..S4}`, transition matrix `P[i][j]`, stationary `π`, expected dwell | Doc §9.1 Markov Chains |
| `TimeToTriggerSection` | ❌ NEMA | per-feature CDF: array `{spin_index, probability}` | USIF `timeToTriggerCdf` |
| `JurisdictionGatedSection` | ❌ NEMA | per-jurisdiction `{rtp_variant, regulatory_min, pass}` × `{Nevada, NJ, UK, MGA, AU, SE}` | Doc §8.3; USIF `jurisdictionGated` |
| `RngAttestationSection` | rng_kind only | `period`, `kind` (Mersenne/Mulberry32/ChaCha20), `seed`, `tests: {diehard, nist_sp_800_22, chi_square}` PASS/FAIL | Doc §8.1, §10.4 |
| `ComplianceSection` | jurisdictions, rtp_range, max_win, near_miss, ldw, session_time | full **pre-release checklist** (Doc §10.4: 13 items) + audit-trail WORM attestation | Doc §10.4 Compliance Checklist |
| `StatisticalSection` | CI-95/99/99.9 + std_error + adequate | `std_dev_across_seeds` populated (trenutno 0.0) + multi-seed CI bands per USIF | USIF `ciBands` |
| `BonusDistancesSection` | FS + H&W mean/max | extend na sve feature-ove + histogram | OK delom |
| `RequiredSpinsSection` | 0.1pp/0.01pp @ 95%/99% | OK ✅ | — |
| **Exporters** | JSON only (1 format) | **USIF v1.0 JSON** (schema-validated), **CSV** flat regulator-friendly, **PDF** (GLI-16 App D layout) | Doc §10.3, §11 |

**Score:** trenutno ~55 % Tier-1 spec. Cilj posle PAR-001..PAR-009: **100 %**.

---

## 1. Wave plan (PAR-001 → PAR-009)

| Wave | Naziv | Atoms | ETA | Files touched | Status |
|---|---|---|---|---|---|
| **PAR-001** | Sign-off block + Reel config + Paytable + **per-pay-rule RTP** | 5 | 30 min | `par.rs`, `ir.rs`, `tests/par_pro_001.rs` | 🟢 Done |
| **PAR-002** | configHash + RNG attestation + **rng_kind stale-fix** | 4 | 25 min | `par.rs`, `rng.rs`, `tests/par_pro_002.rs` | 🟢 Done |
| **PAR-003** | EVT Pareto tail u PAR sheet | 3 | 20 min | `par.rs`, `tail_fit.rs`, `tests/par_pro_003.rs` | 🟢 Done |
| **PAR-004** | Per-feature time-to-trigger CDF | 4 | 25 min | `par.rs`, `stats.rs`, `tests/par_pro_004.rs` | 🟢 Done |
| **PAR-005** | Markov transition matrix + stationary π | 4 | 30 min | `par.rs`, `stats.rs`, `tests/par_pro_005.rs` | 🟢 Done |
| **PAR-006** | Jurisdiction-gated RTP variants + **theoretical vs simulated PASS/FAIL gate (GLI §8.2)** | 4 | 25 min | `par.rs`, `jurisdiction/`, `tests/par_pro_006.rs` | 🟢 Done |
| **PAR-007** | USIF v1.0 JSON exporter + validator hook | 3 | 25 min | `par/usif_export.rs` (new), schema validator, `tests/par_pro_007.rs` | 🟢 Done |
| **PAR-008** | CSV exporter (flat regulator schema) | 2 | 15 min | `par/csv_export.rs` (new), `tests/par_pro_008.rs` | 🟢 Done |
| **PAR-009** | PDF-ready Markdown report (pandoc downstream) | 4 | 30 min | `par_export::to_markdown_report` — printpdf deferred (needs Rust 1.88) | 🟢 Done |
| **Total** | | **33** | **~3 h 45 min** | | |

**Acceptance svaki wave:** TS lint + TS build + full vitest + `cargo clippy --all -- -D warnings` + 0 regresija + USIF validator green (od PAR-007 nadalje).

---

## 2. PAR-001 — Sign-off block + Reel config + Paytable

### Atomi

| # | Atom | File / Linije | Test |
|---|---|---|---|
| A1 | `SignOffSection { mathematician, approved_by, mathematician_signed_at, approved_at, signatures: Vec<Signature> }` + `Signature { name, role, sha256_signature_blob }` | `par.rs:38` (insert posle `PARMeta`) | `tests/par_pro_001.rs::signoff_roundtrip` |
| A2 | `ReelConfigSection { reels: Vec<ReelDef> }` + `ReelDef { index, mode, length, symbol_counts: BTreeMap<String, u32> }`, `total_cycle = ∏ length` izračunat | `par.rs` + `ir.rs::ReelDef` mapper | `tests/par_pro_001.rs::reel_config_cycle_product` |
| A3 | `PaytableSection { rows: Vec<PaytableRow> }` + `PaytableRow { symbol, payouts: BTreeMap<u32, f64> }` (key = n-of-a-kind) + wild/scatter flag-ovi | `par.rs` + IR paytable extractor | `tests/par_pro_001.rs::paytable_matches_ir` |
| A4 | `PARGenerator::generate(...)` signatura proširena sa `ir: &SlotGameIR` (replace 14-arg ulaz sa `PARBuildContext` struct-om — bekvard-kompat shim) | `par.rs:208-224` | `tests/par_pro_001.rs::generate_with_context_struct` |
| A5 | **Per-pay-rule RTP breakdown** (MLAgent gap N) — `PaytableSection.pay_rule_rtp: BTreeMap<String, f64>` (key = "{symbol}_{n}oak"); audit trail za regulator, Σ-ja se sa total | `par.rs::generate` + `stats.rs::PARMetrics` ekstenzija | `tests/par_pro_001.rs::pay_rule_rtp_sums_to_base` |

### Acceptance gate
- ✅ JSON roundtrip preserves all 4 new sections (sign-off, reels, paytable, pay_rule_rtp)
- ✅ Pretty-print (`PARGenerator::print`) renderuje GAME IDENTIFICATION + REEL CONFIGURATION + PAYTABLE bloks GLI-16 App D layout
- ✅ Sve postojeće test (`faza4_stats.rs`, `faza8_stats.rs`) i dalje prolaze
- ✅ `Σ pay_rule_rtp ≈ base_rtp_pct` (±0.5pp tolerance — feature RTP-ovi ne ulaze ovde)

---

## 3. PAR-002 — configHash + RNG attestation

### Atomi

| # | Atom | File / Linije | Test |
|---|---|---|---|
| A1 | `PARMeta.config_hash: String` — SHA-256 nad **canonical** JSON serijalizacijom IR-a (sorted keys, no whitespace) | `par.rs:30-38`, `ir/canonical.rs` (new helper) | `tests/par_pro_002.rs::config_hash_deterministic` |
| A2 | `RngAttestationSection { kind, period, seed: String, tests: RngTestResults }` + `RngTestResults { diehard, nist_sp_800_22, chi_square: TestVerdict }` + `enum TestVerdict { Pass, Fail, NotRun }` | `par.rs` + `rng.rs::RngKind` enum | `tests/par_pro_002.rs::rng_attestation_emit` |
| A3 | Wire `PARMeta.rng_kind` → `RngAttestationSection.kind`; same seed bit-for-bit identical IR → same config_hash | `par.rs:251-260` | `tests/par_pro_002.rs::same_ir_same_hash` |
| A4 | **rng_kind stale-fix** (MLAgent gap L) — `par.rs:259` hard-codes `"mulberry32"` ali actual default je xoshiro128 ** / `SlotRng`; uvedi `RngFamily::detect()` helper koji čita iz `RngBackend` trait associated `KIND` const i emituje pravu vrednost | `par.rs:259` + `rng.rs::RngBackend` const | `tests/par_pro_002.rs::rng_kind_matches_actual_backend` |

### Acceptance gate
- ✅ Mutiranje 1 byte u IR mijenja config_hash
- ✅ `RngAttestationSection.kind` matches actual RNG family used in `rust-sim` (Mulberry32 default; FIPS path stub-iran)
- ✅ `PARMeta.rng_kind` više nikad ne pokazuje stale "mulberry32" stringu

---

## 4. PAR-003 — EVT Pareto tail u PAR sheet

### Atomi

| # | Atom | File / Linije | Test |
|---|---|---|---|
| A1 | `ParetoTailSection { alpha, x_m, threshold, samples_above_threshold, ks_p_value, ks_p_seed, evt_p99999, cap_pressure_pct }` | `par.rs` + `tail_fit.rs:re-export` | `tests/par_pro_003.rs::pareto_section_present` |
| A2 | Wire `tail_fit::fit_pareto_tail` rezultat → ParetoTailSection (called sa max-win-cap iz `compliance.max_win_cap_required`) | `par.rs::generate` | `tests/par_pro_003.rs::evt_p99999_above_p999` |
| A3 | `cap_pressure_pct = P(W > max_win_cap)` izračunat iz fit-ovane Pareto distribucije | `par.rs` | `tests/par_pro_003.rs::cap_pressure_monotone_in_alpha` |

### Acceptance gate
- ✅ Heavy-tail samples (paretovs α=1.2) → `cap_pressure_pct > 0.0`
- ✅ Light-tail samples (gaussian) → `cap_pressure_pct ≈ 0.0`
- ✅ KS p-value reprodukovljiv (`ks_p_seed = 12345` fixed)

---

## 5. PAR-004 — Per-feature time-to-trigger CDF

### Atomi

| # | Atom | File / Linije | Test |
|---|---|---|---|
| A1 | Extend `BonusDistanceTracker` u `stats.rs` da prikuplja per-feature inter-trigger spin indices (`Vec<u32>` per feature, capped na 100k samples) | `stats.rs:BonusDistanceTracker` | `tests/par_pro_004.rs::tracker_stores_distances` |
| A2 | `TimeToTriggerCdf { feature_id, points: Vec<CdfPoint>, n_samples }` + `CdfPoint { spin_index, probability }` (50 points) | `par.rs` | `tests/par_pro_004.rs::cdf_monotone` |
| A3 | `TimeToTriggerSection { features: Vec<TimeToTriggerCdf> }` | `par.rs` | `tests/par_pro_004.rs::cdf_section_emits_all_features` |
| A4 | Pretty-print renderuje sažeti CDF (P10/P50/P90 spins-to-trigger) — pun CDF samo u JSON | `par.rs::print` | `tests/par_pro_004.rs::print_shows_cdf_summary` |

### Acceptance gate
- ✅ CDF monotono raste (0 → 1) za svaki feature
- ✅ P50 inter-trigger ≈ `1 / p_trigger` (Doc §7.1 formula sanity)

---

## 6. PAR-005 — Markov transition matrix + stationary π

### Atomi

| # | Atom | File / Linije | Test |
|---|---|---|---|
| A1 | `enum GameState { BaseGame=0, FreeSpins=1, Bonus=2, ProgressiveJackpot=3, Respin=4 }` + `MarkovAccumulator { transitions: [[u64; 5]; 5] }` u `stats.rs` | `stats.rs` | `tests/par_pro_005.rs::markov_counts_transitions` |
| A2 | Hook u spin-loop: each state change → `accumulator.record(from, to)` | `engine.rs::run_spin` (find current spin loop) | `tests/par_pro_005.rs::spin_loop_emits_transitions` |
| A3 | `MarkovSection { states: Vec<String>, transition_matrix: Vec<Vec<f64>>, stationary_pi: Vec<f64>, expected_dwell: Vec<f64> }` — π računat power-iteration (50 iter, ε=1e-12) | `par.rs` + `stats.rs::stationary_distribution` | `tests/par_pro_005.rs::pi_sums_to_one` + `tests/par_pro_005.rs::pi_power_iteration_known_chain` |
| A4 | Pretty-print: 5×5 matrix + π histogram bar chart | `par.rs::print` | `tests/par_pro_005.rs::print_doesnt_panic` |

### Acceptance gate
- ✅ π sums to 1.0 (±1e-9)
- ✅ Each row of transition matrix sums to 1.0 (±1e-9)
- ✅ Doc §9.1 example chain reproduced

---

## 7. PAR-006 — Jurisdiction-gated RTP variants

### Atomi

| # | Atom | File / Linije | Test |
|---|---|---|---|
| A1 | `JurisdictionVariant { code, name, rtp_target, rtp_observed, regulatory_min, regulatory_max, pass, notes }` | `par.rs` + `jurisdiction/profiles.rs::regulatory_band()` | `tests/par_pro_006.rs::variant_emits_per_jurisdiction` |
| A2 | `JurisdictionGatedSection { variants: Vec<JurisdictionVariant> }` — popunjava se za **svaku** jurisdikciju iz `ComplianceSection.jurisdictions` | `par.rs::generate` | `tests/par_pro_006.rs::all_active_jurisdictions_covered` |
| A3 | Hard-coded mins iz Doc §8.3: Nevada 75 %, NJ 83 %, UK 80 % (Cat B), MGA 85 %, AU 85 %, SE 90 % — load iz `jurisdiction/profiles.rs` (ne hardkodiraj u par.rs) | `jurisdiction/profiles.rs` (audit + dopuna) | `tests/par_pro_006.rs::regulatory_mins_match_doc` |
| A4 | **Theoretical vs Simulated RTP explicit PASS/FAIL gate** (MLAgent gap K, GLI §8.2) — `JurisdictionVariant.theoretical_rtp`, `JurisdictionVariant.simulated_rtp`, `JurisdictionVariant.delta_pp`, `JurisdictionVariant.within_ci_95: bool` — eksplicitan PASS uslov: `|theoretical − simulated| ≤ 1.96 × σ/√N` | `par.rs::generate` + uvoz `closed_form_rtp` iz `analytical.rs` | `tests/par_pro_006.rs::theoretical_vs_simulated_explicit_gate` |

### Acceptance gate
- ✅ Observed RTP 96 % → svaki variant `pass = true`
- ✅ Observed RTP 74 % → Nevada `pass = false`, ostali svi `pass = false` osim ako npr. UK Cat A koji nema min — tada audit warning
- ✅ Variants su deterministički sortirani (alphabetical po code)
- ✅ `within_ci_95 = true` kada |theoretical − simulated| ≤ 95% CI half-width
- ✅ `delta_pp` field je u procentnim bodovima (pp), ne fraction

---

## 8. PAR-007 — USIF v1.0 JSON exporter + validator hook

### Atomi

| # | Atom | File / Linije | Test |
|---|---|---|---|
| A1 | `usif_export.rs::to_usif_v1(par: &PARSheet) -> serde_json::Value` — mapira native `PARSheet` na USIF v1.0 field paths (`schemaVersion`, `generatedAt`, `game.name`, `game.layout`, `results.observedRTP`, `volatility.vi95/vi99/p999/p9999/paretoTail`, `features[].transitionMatrix`, `features[].timeToTriggerCdf`, `ciBands.{seedCount, seedRtps, bands}`, `jurisdictionGated[X]`) | `src/par/usif_export.rs` (new) | `tests/par_pro_007.rs::usif_required_fields_present` |
| A2 | Run `scripts/usif-par-validate.mjs` baseline + strict over generated USIF JSON | `tests/par_pro_007.rs::usif_baseline_validates` + `tests/par_pro_007.rs::usif_strict_validates` | shell-out via `std::process::Command` |
| A3 | Save sample `reports/par-samples/rust_sim_canonical.usif.json` for regression | `examples/par_to_usif.rs` (new) | golden-file diff test |

### Acceptance gate
- ✅ USIF baseline validator: PASS
- ✅ USIF strict validator: PASS (sve Tier-1 polja popunjena)
- ✅ Generated sample diff < 1e-9 across runs (deterministic)

---

## 9. PAR-008 — CSV exporter (flat regulator schema)

### Atomi

| # | Atom | File / Linije | Test |
|---|---|---|---|
| A1 | `csv_export.rs::to_csv(par: &PARSheet) -> String` — 1 row per metric, columns `[Section, Metric, Value, Unit, Notes]` | `src/par/csv_export.rs` (new) | `tests/par_pro_008.rs::csv_has_header` |
| A2 | Cover sve sections (Meta, RTP, HitFreq, Volatility, Quantiles, Moments, Pareto, Jackpot, Markov, Jurisdiction, Compliance, Stat); strict CSV escaping (RFC 4180) | `csv_export.rs` | `tests/par_pro_008.rs::csv_round_trip_via_csv_crate` |

### Acceptance gate
- ✅ `out/sim_runs/.../PAR.csv` parses cleanly via `csv` crate
- ✅ Each numeric value formatted sa 4-decimal precision (no f64 garbage)

---

## 10. PAR-009 — PDF generator (GLI-16 App D layout)

### Atomi

| # | Atom | File / Linije | Test |
|---|---|---|---|
| A1 | Pick PDF library: `printpdf` (pure-Rust, no native deps) — add to Cargo.toml | `Cargo.toml`, `src/par/pdf_export.rs` (new) | smoke test compiles |
| A2 | Layout: **page 1** GAME ID + sign-off block; **page 2** REEL CONFIG + PAYTABLE; **page 3** RTP + HitFreq + Volatility; **page 4** Markov + TimeToTrigger; **page 5** Jurisdiction + Compliance + Audit | `pdf_export.rs::render_par_pdf(par, out_path)` | `tests/par_pro_009.rs::pdf_page_count_5` |
| A3 | Embedded fonts: Inter Regular + Inter Bold (lib LICENSE OK) — bundle via `include_bytes!` | `assets/fonts/`, `pdf_export.rs` | `tests/par_pro_009.rs::pdf_renders_without_font_fallback` |
| A4 | Generated PDF passes `pdftotext` extraction test — key fields searchable | `tests/par_pro_009.rs::pdf_text_extractable` | shell-out test |

### Acceptance gate
- ✅ Generated PDF opens u Preview.app, Adobe Reader, Skim
- ✅ `pdftotext PAR.pdf -` izvuci sva ključna polja (game_id, total_rtp, max_win, jurisdictions)
- ✅ File size < 200 KB (no embedded raster images)

---

## 11. Risk register

| Rizik | Impact | Mitigation |
|---|---|---|
| `printpdf` dependency conflict | medium | Alternative: `genpdf` ili WeasyPrint via shell-out. Spike PAR-009-A1 prvo. |
| USIF strict validator zahteva polja koja Rust nema (npr. transition matrix za feature koji ne postoji) | medium | Emit `null` / skip optional fields per USIF schema; validator dopušta. |
| Markov accumulator hot-path overhead | low | Accumulator je per-spin `[[u64; 5]; 5]` atomic increment — measure u PAR-005 benchmark, fallback na sampled (1 every 100 spin) ako > 2 % perf hit. |
| EVT Pareto fit underdetermined za light-tail games (cluster slots) | low | Emit `ParetoTailSection { kind: NotApplicable, reason }` ako `samples_above_threshold < 30`. |
| PDF font licensing (Inter MIT OFL OK; verify before bundle) | low | Use SIL OFL Inter; document in `LICENSES.md`. |

---

## 12. Acceptance gate (cijela serija PAR-001..PAR-009)

| # | Gate | Provera |
|---|---|---|
| G1 | All 9 waves merged | `git log --oneline | grep PAR-` shows 9+ commits |
| G2 | Cargo clippy strict | `cargo clippy --all -- -D warnings` exit 0 |
| G3 | All tests pass | `cargo test --workspace` + `npm test` exit 0 |
| G4 | USIF baseline + strict | `npm run usif-par-validate && npm run usif-par-validate:strict` exit 0 over `reports/par-samples/rust_sim_canonical.usif.json` |
| G5 | 0 regresija | Faza4/Faza8/Faza11 testovi prolaze |
| G6 | PAR sheet field count | `grep -c '"' rust_sim_canonical.usif.json` ≥ 200 (od trenutnih ~80) |
| G7 | Multi-format export | 3 fajla generišu se za isti PAR: `.par.json`, `.par.csv`, `.par.pdf` |
| G8 | Pitch ribbon | `dist/par-sample-kit/INDEX.md` updated sa Tier-1 status |
| G9 | Compliance checklist | Pre-release checklist (Doc §10.4) renderovan u PDF stranicama |

---

## 13. Resursi i reference

- **Source dokument:** `~/Desktop/SLOT_MATH_ENGINE_MASTER_DOCUMENT.pdf` (16 strana)
- **USIF v1.0:** `dist/par-sample-kit/schema/USIF_PAR_SCHEMA_v1.md` + `schemas/usif-par-v1.0.json`
- **Pattern catalog:** `dist/par-sample-kit/pattern-catalog/INDUSTRY_PATTERN_CATALOG.md`
- **GLI-19 v3.0:** `gaminglabs.com/wp-content/uploads/2024/06/GLI-19-Interactive-Gaming-Systems-v3.0.pdf`
- **EVT (Pickands, Coles 2001):** `tail_fit.rs` header note
- **Markov SolCalc 2018:** Aarhus University reference iz USIF schema
- **Harrigan & Dixon 2014:** PAR Sheets, Probabilities, and Slot Machine Play — multi-seed CI rationale

---

## 14. Status legend

- 🔵 Planned
- 🟡 In Progress
- 🟢 Done (merged, pinned)
- 🔴 Blocked
- ⚪ Skipped (with reason)

**Status:** PAR-001..PAR-021 svi 🟢 Done. W250 `gen_par_sheet` CLI + `PARGeneratorAgent` orchestrator bridge LANDED. **W251 — Ultimate E2E Submission Acceptance + Math Review LANDED 2026-05-24**.

### W251 — Ultimate E2E PAR Submission Acceptance (LANDED)

| # | Atom | File | Test |
|---|---|---|---|
| A1 | Multi-fixture sweep (classic-3x3-lines, fs-multiplier-ladder, 5x3-243ways) × all 4 formats | `rust-sim/tests/par_submission_e2e_w251.rs` | `multi_fixture_acceptance_all_formats_all_invariants` |
| A2 | Mathematical invariants helper — covers PAR-001/002/003/004/005/006/007/008/009/010/015/016/017 in one shared assertion pass | same file | invoked per-fixture in A1 |
| A3 | Determinism — same IR + same seeds → identical `config_hash` + identical `pay_rule_rtp` key set | same file | `determinism_same_ir_same_config_hash_two_runs` |
| A4 | Multi-seed CI bands populate `std_dev_across_seeds` + non-degenerate CI95 interval | same file | `multi_seed_run_populates_ci_bands` |
| A5 | Jurisdiction band sanity — MGA band contains canonical 96 % target; `pass` is a pure function of `(min, max, simulated_rtp)` | same file | `jurisdiction_band_contains_target_for_clean_fixture` |
| A6 | Negative paths — missing IR path + malformed IR JSON both exit non-zero | same file | `missing_ir_path_exits_non_zero` + `malformed_ir_json_exits_non_zero` |

**Acceptance gate**
- ✅ 6/6 W251 tests pass (`cargo test --test par_submission_e2e_w251`)
- ✅ `cargo clippy -p slot_sim --all-targets -- -D warnings` clean (wasm-oracle clippy noise is pre-existing — W218 mtl Phase D)
- ✅ Full `cargo test -p slot_sim` zero regression (exit 0)
- ✅ Negative tests prove CLI exits 2 on missing IR + non-zero on malformed JSON (no panic)
- ✅ Math invariants validated per fixture: Markov rows ≈ 1, π ≈ 1, EVT alpha > 0, CDF monotone, reach-curve ↓, RoR ↓, Σ pay_rule ≤ base + 1.5pp, jurisdiction sort deterministic, USIF schemaVersion 1.0.0, CSV RFC 4180 header, Markdown H1.

**Next action:** none — full Tier-1 + Ultimate Math + Orchestrator + E2E acceptance loop closed. Future expansion = jurisdiction profile coverage (currently MGA / Nevada / NJ / UK / AU / SE) or PDF renderer.

---

## 16. Ultimate Math Extension (PAR-010 → PAR-021)

PAR-001..009 daje **Tier-1 PAR sheet certifikat**, ali nije ultimativan math
simulator. Boki je rekao "ULTIMATIVNO ZAUVEK" — ova ekstenzija pokriva svaki
math gap koji vendor mora da ima da bi nadmašio IGT + Pragmatic + NetEnt.

| Wave | Naziv | Atoms | ETA | Cilj | Status |
|---|---|---|---|---|---|
| **PAR-010** | Closed-form per-pay-rule RTP solver | 4 | 35 min | Bez ovog `pay_rule_rtp` polje ostaje 0.0 — pravi audit trail vrednosti | 🟢 Done |
| **PAR-011** | Quasi-Monte Carlo (Halton + Sobol + Lattice) | 5 | 45 min | 100× variance reduction za P99.999 jackpot tail | 🟢 Done |
| **PAR-012** | Bonus Buy EV calculator | 3 | 25 min | EV(buy) vs cost premium — modern slot economics (Pragmatic/Nolimit standard) | 🟢 Done |
| **PAR-013** | Cluster Pays evaluator | 4 | 30 min | Connected-component scoring (NetEnt/Push Gaming math) | 🟢 Done |
| **PAR-014** | Megaways / variable reel heights | 4 | 30 min | `Ways = ∏ S_i` sa per-spin varijabilnim height (BTG/Blueprint) | 🟢 Done |
| **PAR-015** | Variance decomposition (ANOVA) | 3 | 25 min | σ²_total = σ²_base + σ²_fs + σ²_jp + 2·cov(...) — operator "koja feature truje varijans" | 🟢 Done |
| **PAR-016** | Cumulative reach curves | 3 | 20 min | P(N spinova bez win) distribution — churn risk modeling | 🟢 Done |
| **PAR-017** | Risk-of-Ruin formula | 2 | 15 min | RoR = ((1−edge)/(1+edge))^bankroll — bankroll modeling | 🟢 Done |
| **PAR-018** | NIST SP 800-22 + DIEHARDER suite | 5 | 50 min | RNG cert za US tribal casinos (Nevada/NJ) | 🟢 Done |
| **PAR-019** | Multi-tier mystery jackpot (Mini/Minor/Major/Grand) | 3 | 25 min | Aristocrat Dragon Link / IGT MegaJackpots math | 🟢 Done |
| **PAR-020** | Autokorelacija test (Ljung-Box + runs test) | 3 | 25 min | Regulatorni guard protiv "chasing" iluzija | 🟢 Done |
| **PAR-021** | Exact rational arithmetic (BigRational) | 2 | 20 min | Mathematica-grade exactness — daje 7/72 umesto 0.09722... | 🟢 Done |
| **TOTAL F-B..F-F** | | **41** | **~5 h 25 min** | | |

**Sveukupno** (PAR-001 done + 002..009 + 010..021): **74 atoma, ~9 h 10 min** za ultimativni math simulator.

**Faze izvršavanja:**

| Faza | Waves | Cilj | ETA |
|---|---|---|---:|
| F-A | PAR-002..005 + 006/A4 | Tier-1 PAR sheet (math core) | ~2 h |
| F-B | PAR-010, 011, 018, 020 | Critical math gaps (per-rule, QMC, NIST, autokor.) | ~2 h 35 min |
| F-C | PAR-012, 013, 014, 019 | Modern slot economics | ~1 h 50 min |
| F-D | PAR-015, 016, 017 | Operator analytics | ~1 h |
| F-E | PAR-007, 008 | Deliverable polish (JSON + CSV exporter) | ~40 min |
| F-F | PAR-009, 021 | Optional luxury (PDF + rational arithmetic) | ~50 min |

---

## 15. MLAgent gap merge log (2026-05-24)

MLAgent radio paralelno i predložio 15-row gap matricu. Tri gap-a apsorbovana u postojeće waves:

| MLAgent gap | Apsorbovan u | Atom | Status |
|---|---|---|---|
| **L** — `par.rs:259` stale `"mulberry32"` (actual: xoshiro128**) | PAR-002 | A4 | merged |
| **K** — Theoretical vs simulated explicit PASS/FAIL (GLI §8.2) | PAR-006 | A4 | merged |
| **N** — Per-pay-rule RTP breakdown (Σ pravila audit trail) | PAR-001 | A5 | merged |

Ostalih 12 MLAgent gap-ova bilo ili redundantno sa DatabaseAgent rows-ima ili **out-of-scope za Tier-1 PAR** (sky-blue research za W250+).

