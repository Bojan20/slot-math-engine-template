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
| **PAR-001** | Sign-off block + Reel config + Paytable | 4 | 25 min | `par.rs`, `ir.rs`, `tests/par_pro_001.rs` | 🔵 Planned |
| **PAR-002** | configHash + RNG attestation | 3 | 20 min | `par.rs`, `rng.rs`, `tests/par_pro_002.rs` | 🔵 Planned |
| **PAR-003** | EVT Pareto tail u PAR sheet | 3 | 20 min | `par.rs`, `tail_fit.rs`, `tests/par_pro_003.rs` | 🔵 Planned |
| **PAR-004** | Per-feature time-to-trigger CDF | 4 | 25 min | `par.rs`, `stats.rs`, `tests/par_pro_004.rs` | 🔵 Planned |
| **PAR-005** | Markov transition matrix + stationary π | 4 | 30 min | `par.rs`, `stats.rs`, `tests/par_pro_005.rs` | 🔵 Planned |
| **PAR-006** | Jurisdiction-gated RTP variants | 3 | 20 min | `par.rs`, `jurisdiction/`, `tests/par_pro_006.rs` | 🔵 Planned |
| **PAR-007** | USIF v1.0 JSON exporter + validator hook | 3 | 25 min | `par/usif_export.rs` (new), schema validator, `tests/par_pro_007.rs` | 🔵 Planned |
| **PAR-008** | CSV exporter (flat regulator schema) | 2 | 15 min | `par/csv_export.rs` (new), `tests/par_pro_008.rs` | 🔵 Planned |
| **PAR-009** | PDF generator (GLI-16 App D layout) | 4 | 30 min | `par/pdf_export.rs` (new), template, `tests/par_pro_009.rs` | 🔵 Planned |
| **Total** | | **30** | **~3 h 30 min** | | |

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

### Acceptance gate
- ✅ JSON roundtrip preserves all 3 new sections
- ✅ Pretty-print (`PARGenerator::print`) renderuje GAME IDENTIFICATION + REEL CONFIGURATION + PAYTABLE bloks GLI-16 App D layout
- ✅ Sve postojeće test (`faza4_stats.rs`, `faza8_stats.rs`) i dalje prolaze

---

## 3. PAR-002 — configHash + RNG attestation

### Atomi

| # | Atom | File / Linije | Test |
|---|---|---|---|
| A1 | `PARMeta.config_hash: String` — SHA-256 nad **canonical** JSON serijalizacijom IR-a (sorted keys, no whitespace) | `par.rs:30-38`, `ir/canonical.rs` (new helper) | `tests/par_pro_002.rs::config_hash_deterministic` |
| A2 | `RngAttestationSection { kind, period, seed: String, tests: RngTestResults }` + `RngTestResults { diehard, nist_sp_800_22, chi_square: TestVerdict }` + `enum TestVerdict { Pass, Fail, NotRun }` | `par.rs` + `rng.rs::RngKind` enum | `tests/par_pro_002.rs::rng_attestation_emit` |
| A3 | Wire `PARMeta.rng_kind` → `RngAttestationSection.kind`; same seed bit-for-bit identical IR → same config_hash | `par.rs:251-260` | `tests/par_pro_002.rs::same_ir_same_hash` |

### Acceptance gate
- ✅ Mutiranje 1 byte u IR mijenja config_hash
- ✅ `RngAttestationSection.kind` matches actual RNG family used in `rust-sim` (Mulberry32 default; FIPS path stub-iran)

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

### Acceptance gate
- ✅ Observed RTP 96 % → svaki variant `pass = true`
- ✅ Observed RTP 74 % → Nevada `pass = false`, ostali svi `pass = false` osim ako npr. UK Cat A koji nema min — tada audit warning
- ✅ Variants su deterministički sortirani (alphabetical po code)

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

**Next action:** start **PAR-001 / A1** (`SignOffSection` + serde) — ETA 5 min.
