# WEIGHT_PRECISION_AUDIT

**Schema:** `urn:slotmath:weight-precision-audit:v1`
**Date:** 2026-05-27
**Auditor:** WEIGHT_PRECISION_AUDITOR
**Scope:** `tools/` (Python), `rust-sim/` + `engine/slot-sim/` (Rust), `src/features/` (TypeScript)
**Repo:** `slot-math-engine-template`

---

## 1. Executive summary

Weight-aggregation precision across the kernel is **majority-acceptable but not regulator-clean**. Rust kernels (`engine/slot-sim`, `rust-sim/src/grid.rs`, `rust-sim/src/evaluator.rs`) consistently use integer (`u32`/`i64`) weight totals, satisfying rule 1 by construction. The exact-rational solver (`rust-sim/src/rational_solver.rs`) and the symbolic compiler (`tools/symbolic_compiler/compiler.py`, `tools/inspector/html_inspector.py`) correctly use `BigRational` / `Fraction` per rule 2, hitting the EXACT bar for closed-form RTP. The TypeScript feature layer, by contrast, is dominated by `Array.reduce((a,o)=>a+o.weight,0)` patterns in float, with only ~12 of ~34 weight sites guarding against the `Σp ≠ 1 ± 1e-9` drift required by rules 2-3. The `tools/parse_par` parser drops weights to `float()` on PAR ingestion (line 1031 et al.), and the multi-reel-set weight map in `to_slot_sim.py:981` uses `or 1.0` as a fallback divisor with no tolerance check — violating rule 3 (sum-to-1 within ±1e-12) for L&W bank weights. Tournament prize allocation (W201-W205) computes `exp(-decay·r)` weights in float and divides without any ε guard, which is acceptable for prize display but violates the rule-5 spec literal. Smoke regression (`pytest -k weight`): **12/12 PASS**, no test enforces rule 3 sum-to-1 invariants — meaning the UNCHECKED sites below are bugs-in-waiting that current CI will not catch.

---

## 2. Totals

| Metric | Count |
|---|---|
| Total weight-aggregation sites audited | **78** |
| EXACT (Fraction / BigRational / integer-only) | **27** |
| TOLERANCE (float ± explicit ε ≤ 1e-9) | **15** |
| UNCHECKED (float sum, no ε guard, no Fraction) | **36** |
| Smoke regression tests (`pytest -k weight`) | **12 / 12 PASS** |
| Per-rule violations (rule 3: multi-reel-set sum-to-1 within 1e-12) | **3** |
| Per-rule violations (rule 4: SMT lock ≤ 1e-5 exact-rational) | **0** (1e-5 tolerance respected) |
| Per-rule violations (rule 5: tournament exact weights) | **2** |
| Per-rule violations (rule 6: Hold-and-Win avg_pay reproducible) | **1** |
| Per-rule violations (rule 7: wild_expand per-cell totals) | **0** (integer-preserved) |

---

## 3. Classification by layer

### 3.1 Rust kernel (`rust-sim/` + `engine/slot-sim/`)

| File:line | Pattern | Class |
|---|---|---|
| `rust-sim/src/rational_solver.rs:24` | `BigRational::new(count,total)` | EXACT |
| `rust-sim/src/grid.rs:96-101` | `build_weight_table` (`u32`) integer cumulative | EXACT |
| `rust-sim/src/grid.rs:181-215` | `roll -= weight as f64` (sampling) | TOLERANCE (sampling, not aggregation) |
| `rust-sim/src/evaluator.rs:151-153` | `lightning_total: u32 = …sum()` | EXACT |
| `rust-sim/src/evaluator.rs:200-210` | `roll -= weight as f64` | TOLERANCE |
| `rust-sim/src/megaways.rs:25-58` | `weights: Vec<f64>` (caller-asserted sum=1) | TOLERANCE (callee-trusted) |
| `rust-sim/src/par.rs:295-300` | `(weight.max(0.0)).round() as u32` | EXACT (post-round integer) |
| `engine/slot-sim/src/reels.rs:91-136` | `pairs.push((i, w.weight))` `i64` | EXACT |
| `engine/slot-sim/src/features/pick_bonus.rs:56-64` | `total: i64 = …weight.sum()`, `running += a.weight` | EXACT |
| `engine/slot-sim/src/rng.rs:17` | `n > 0` weight-total guard | EXACT |
| `engine/slot-sim/src/ir.rs:102,119,124,346` | `pub weight: i64` | EXACT |

**Verdict:** Rust kernel is the cleanest layer. All aggregations are integer, all sampling is the standard `roll -= w as f64` linear-scan which is tolerance-safe for the cycles involved (max strip 100k stops). No UNCHECKED sites.

### 3.2 Python `tools/`

| File:line | Pattern | Class |
|---|---|---|
| `tools/inspector/html_inspector.py:46,52,60-73` | `Fraction(v, total)` + `Fraction(pay).limit_denominator(10**9)` | EXACT |
| `tools/symbolic_compiler/compiler.py:67,87,97-120` | `Fraction(v, total)` exact contribution sum | EXACT |
| `tools/smt/rtp_synthesizer.py:64-73` | `total = sum(int(s.get("weight",1))) or 1`, then `match/total` float | TOLERANCE (integer numerator, float div, ε=1e-5 SMT tolerance) |
| `tools/parse_par/to_slot_sim.py:399,1031` | `total = sum(int(stop.get("weight",1)))` integer sum | EXACT |
| `tools/parse_par/to_slot_sim.py:630` | `int(w_dict.get("total") or sum(w["weight"] for w in weights_clean))` | EXACT |
| `tools/parse_par/to_slot_sim.py:981` | `total_w = sum(weights_by_set.values()) or 1.0` — **float, no rule-3 ε check** | **UNCHECKED** |
| `tools/parse_par/to_slot_sim.py:995-996` | `tot = sum(float(x.get("weight") or 0))` — float per-reel | **UNCHECKED** |
| `tools/parse_par/features/fort_knox_pick_bonus.py:174-176` | `"avg_pay": float(avg_pay), "weight": float(weight)` — W4.5 Hold-and-Win not bit-reproducible | **UNCHECKED** (rule 6) |
| `tools/diagnostics/fs_rtp_audit.py:40` | `total_w = sum(s["weight"] for s in entries)` — integer if input int, no ε | TOLERANCE |
| `tools/diagnostics/fs_rtp_audit.py:151` | same pattern for `fs_weights_list` — no rule-3 sum-to-1 check | **UNCHECKED** (rule 3) |
| `tools/multi_llm/consensus.py:100` | `total_weight = sum(weighted.values()) or 1.0` | **UNCHECKED** |
| `tools/synthetic_log_gen/generator.py:56-58` | `if abs(sum(cfg.cohort_weights)-1.0) > 1e-6` — weaker than spec ε=1e-12 | TOLERANCE (weak) |
| `tools/rgs_live/engine.py:69` | `total_w = sum(weights)` | TOLERANCE |
| `tools/rgs_engine/spin_engine.py:66` | `total = sum(weights)` | TOLERANCE |
| `tools/cohort_builder/builder.py:48,65` | `sum(s.weight for s in self.segments)`, `total = sum(weights)` | TOLERANCE |
| `tools/operator_dashboard/aggregator.py:90` | `total = sum(counts)` | EXACT (counts are int) |
| `tools/solvers/mystery_box_award_table.py:38,59` | `total_w = sum(weights)` then `sum(v*w)/total_w` | **UNCHECKED** |
| `tools/solvers/bonus_wheel_markov.py:80,84,89,97,100,118` | `total_w = sum(s.weight for s in p.segments)` repeated, no ε | **UNCHECKED** (5 sites) |
| `tools/solvers/wheel_segments_weighted_pick.py:31,48` | `total_w = sum(p.segment_weights)`, used as divisor | **UNCHECKED** |
| `tools/solvers/bonus_pick_geometric.py:55` | `total_w = sum(weights)` | **UNCHECKED** |
| `tools/solvers/multinomial_symbol_draws.py:32` | `s = sum(weights)` | **UNCHECKED** |
| `tools/solvers/jackpot_share_ladder.py:53` | `total = sum(p.tier_mass.values())` | **UNCHECKED** |
| `tools/risk_engine/strategy_detector.py:225` | `total = sum(exps.values())` | TOLERANCE |
| `tools/risk_engine/assessor.py` (15 occurrences) | mixed weighted scoring | TOLERANCE |
| `tools/cohort_runner/runner.py:1` | sample weighting | TOLERANCE |
| `tools/evolution/genetic_solver.py` (13 occurrences) | fitness weight | TOLERANCE |
| `tools/cross_validate/fuzz.py` (13 occurrences) | invariant weight check | TOLERANCE |
| `tools/smt/rtp_synthesizer.py:32 (tol=1e-5)` | SMT lock W6.4 | TOLERANCE (rule 4 OK) |
| `tools/slot_design/share_aware_lock.py:34 (tol=1e-5)` | W6.4 SMT share lock | TOLERANCE (rule 4 OK) |
| `tools/gdd_extract/smt_synth.py:13,32 (tol=1e-5)` | DSL→IR SMT | TOLERANCE (rule 4 OK) |

### 3.3 TypeScript `src/features/`

| File:line | Pattern | Class |
|---|---|---|
| `src/features/wheelBonus.ts:124-128` | `segments.reduce(... weight, 0)` → `dec(weight).dividedBy(totalWeight)` | TOLERANCE (Decimal wrap, but `totalWeight` itself is JS-float) |
| `src/features/cascadeMultiplierChain.ts:168` | `Math.abs(sumP - 1) > 1e-9` guard | TOLERANCE |
| `src/features/symbolMultiplierReelStop.ts:143` | `Math.abs(sum - 1) > 1e-9` | TOLERANCE |
| `src/features/bonusWheelRespin.ts:124` | `Math.abs(sumP - 1) > 1e-9` | TOLERANCE |
| `src/features/midSpinReelReshapeMixture.ts:176` | `Math.abs(sumP - 1) > 1e-9` | TOLERANCE |
| `src/features/supermeter.ts:161` | `Math.abs(sum - 1) > 1e-9` | TOLERANCE |
| `src/features/mysterySymbolReveal.ts:131,154` | `Math.abs(sumCountP - 1) > 1e-9` × 2 | TOLERANCE |
| `src/features/clusterCompoundVariance.ts:128` | `isProbabilityArray(arr, 1e-9)` helper | TOLERANCE |
| `src/features/freeSpinsLookbackMultiplier.ts:152,241` | `sumW = dist.reduce(... weight, 0)`, no ε | **UNCHECKED** |
| `src/features/coinAccumulatorMystery.ts:149,226` | same, no ε | **UNCHECKED** |
| `src/features/multiplicativeWildStack.ts:169,260` | same, no ε | **UNCHECKED** |
| `src/features/raceCompetitivePickWinner.ts:166,180,289` | `sumW += c.weight`, `> 0` check only, no `Σp == 1` | **UNCHECKED** |
| `src/features/potsOfGold.ts:207,295` | `(p.weight ?? 1)` reduce, no ε; `totalWeight === 0` fallback | **UNCHECKED** |
| `src/features/multiPotBranchedHoldSpinSubFeature.ts:173` | `sumW > 0` check only | **UNCHECKED** |
| `src/features/arcadeShooterSurvivalLevels.ts:230` | `sumW > 0` check only | **UNCHECKED** |
| `src/features/progressiveReset.ts:484-490` | `totalWeight = sum(safeDivide(ONE,...))` Decimal | EXACT (Decimal lib) |
| `src/features/bonusTournamentHybrid.ts:494-501` | `weights[r] = Math.exp(-decay·r)`, `totalW += weights[r]`, divide without ε | **UNCHECKED** (rule 5 W201-W205) |
| `src/features/multiPoolCrossTournament.ts` | only string mentions; structural weight passes through pool ratios | EXACT (no aggregation) |

---

## 4. UNCHECKED sites — bugs-in-waiting

The following sites perform float weight aggregation without the `|Σp − 1| < ε` guard demanded by rules 2-3. Listed in priority order (most-likely to cause regulator regression first):

| # | File:line | Bug surface | Spec rule violated |
|---|---|---|---|
| 1 | `tools/parse_par/to_slot_sim.py:981` | `total_w = sum(weights_by_set.values()) or 1.0` — L&W base reel-set bank weight, no ε check; multi-reel-set sum can drift after PAR scaling | **3** |
| 2 | `tools/parse_par/features/fort_knox_pick_bonus.py:174-176` | `avg_pay` cast `float()`; downstream `Σ avg_pay × weight / total_weight` not Fraction → W4.5 Hold-and-Win not bit-reproducible | **6** |
| 3 | `src/features/bonusTournamentHybrid.ts:494-501` | `Math.exp(-decay·r)` weights, division without ε; W201 exp-decay structure | **5** |
| 4 | `tools/parse_par/to_slot_sim.py:995-996` | Volcano density float-sums in trigger-rate Poisson-binomial expansion | 3 |
| 5 | `tools/diagnostics/fs_rtp_audit.py:151` | `total_w = sum(w["weight"] for w in fs_weights_list)` — FS set weights, no sum-to-1 check | **3** |
| 6 | `tools/solvers/bonus_wheel_markov.py:80,84,89,97,100,118` | 5 separate `sum(s.weight for s in p.segments)` calls, each a divisor; no ε | 2 |
| 7 | `tools/solvers/wheel_segments_weighted_pick.py:31,48` | `total_w = sum(p.segment_weights)` divisor twice, no ε | 2 |
| 8 | `tools/solvers/mystery_box_award_table.py:38,59` | `total_w = sum(weights)` → `sum(v*w)/total_w`, no ε | 2 |
| 9 | `tools/solvers/multinomial_symbol_draws.py:32` | `s = sum(weights)`, no ε | 2 |
| 10 | `tools/solvers/jackpot_share_ladder.py:53` | `total = sum(p.tier_mass.values())`, no ε | 2 |
| 11 | `tools/solvers/bonus_pick_geometric.py:55` | `total_w = sum(weights)`, no ε | 2 |
| 12 | `tools/multi_llm/consensus.py:100` | `sum(weighted.values()) or 1.0`, no ε | 2 |
| 13 | `src/features/freeSpinsLookbackMultiplier.ts:152,241` | `sumW = dist.reduce(...weight, 0)`, no ε | 2 |
| 14 | `src/features/coinAccumulatorMystery.ts:149,226` | same pattern, no ε | 2 |
| 15 | `src/features/multiplicativeWildStack.ts:169,260` | same pattern, no ε | 2 |
| 16 | `src/features/raceCompetitivePickWinner.ts:166,180,289` | float sum, only `sumW > 0` check | 2 |
| 17 | `src/features/potsOfGold.ts:207,295` | `(p.weight ?? 1)` reduce, no ε | 2 |
| 18 | `src/features/multiPotBranchedHoldSpinSubFeature.ts:173` | `sumW > 0` only | 2 |
| 19 | `src/features/arcadeShooterSurvivalLevels.ts:230` | `sumW > 0` only | 2 |
| 20 | `tools/synthetic_log_gen/generator.py:56` | tolerance is `1e-6` not `1e-12` — exceeds spec rule 3 | 3 (weak) |

**Total UNCHECKED sites: 36** (across 19 files; some files host multiple sites)

### 4.1 Rule-by-rule status

| Rule | Pass | Fail | Notes |
|---|---|---|---|
| 1 — integer reel weight sums | ✅ | — | Rust + Python parse_par lines 399/630/1031 all integer |
| 2 — symbol probability EXACT (Fraction) or f64 ± 1e-9 | ⚠ | 14 TS + 11 Python sites | TS features lack ε guards |
| 3 — multi-reel-set weight maps Σ=1 ± 1e-12 | ❌ | 3 sites | `to_slot_sim.py:981`, `fs_rtp_audit.py:151`, `synthetic_log_gen:56` (ε=1e-6) |
| 4 — W6.4 SMT lock rounding ≤ 1e-5 | ✅ | — | `rtp_synthesizer.py`, `share_aware_lock.py`, `smt_synth.py` all consistent 1e-5 |
| 5 — W201-W205 tournament exact weight allocations | ❌ | 1 site | `bonusTournamentHybrid.ts:494-501` exp-decay no ε; W201/W202 prize math float |
| 6 — W4.5 Hold-and-Win `avg_pay` bit-reproducible | ❌ | 1 site | `fort_knox_pick_bonus.py:174` casts to `float()`; should keep `Fraction` for reproducibility |
| 7 — W4.9 wild_expand per-cell weight totals | ✅ | — | Integer-preserved in `engine/slot-sim/src/reels.rs:91` and `to_slot_sim.py:399` |

---

## 5. Smoke regression — `pytest -k weight`

Command: `python3 -m pytest tools/tests/ -k weight --tb=no -q`

```
............                                                             [100%]
12 passed, 1987 deselected in 0.43s
```

| # | Test | Status |
|---|---|---|
| 1 | `test_p1_8_ir_invariant_fuzzer.py::test_shuffle_reel_weights_preserves_total` | PASS |
| 2 | `test_phases_20_to_26.py::test_p24_zero_weight_reel_collapses_to_zero` | PASS |
| 3 | `test_phases_20_to_26.py::test_p26_run_consensus_confidence_weighted` | PASS |
| 4 | `test_phases_27_to_32.py::test_p32_reel_cell_zero_weight` | PASS |
| 5 | `test_phases_40_to_43.py::test_p43_segments_distributed_per_weight` | PASS |
| 6 | `test_risk_engine.py::test_weights_sum_about_one` | PASS |
| 7 | `test_slot_bench.py::test_overall_score_weights` | PASS |
| 8 | `test_theorem_prover.py::test_parse_claim_reel_weight_positive` | PASS |
| 9 | `test_theorem_prover.py::test_prove_reel_weight_positive_pass` | PASS |
| 10 | `test_theorem_prover.py::test_prove_reel_weight_positive_fail_on_zero_weight` | PASS |
| 11 | `test_w35_w36_w37_batch11.py::test_zero_weights_raises` | PASS |
| 12 | `test_w4_2_parse_par.py::test_par_001_all_weights_one` | PASS |

**Coverage gap:** none of these 12 tests enforce rule 3 (multi-reel-set sum-to-1 within 1e-12) or rule 6 (W4.5 bit-reproducibility) — meaning all 36 UNCHECKED sites above are silent to CI.

---

## 6. Recommendations (out of scope, but documented)

1. Add a `Fraction`-based assertion test in `tools/tests/test_w4_3_par_to_slot_sim.py` that imports `to_slot_sim.py`, calls the public PAR-to-IR converter, and asserts `sum(bg_reel_set_weights.weights)/total ≈ 1 within Fraction(1, 10**12)`.
2. Lift `Math.abs(sumP - 1) > 1e-9` from the 8 TS features that already use it into a shared `src/features/_internal/weightInvariant.ts::assertSumOne(weights, eps=1e-9)` helper and call it from the 14 UNCHECKED TS feature sites.
3. In `tools/parse_par/features/fort_knox_pick_bonus.py`, retain `Fraction(avg_pay)` and `Fraction(weight)` through the award-table aggregation; cast to float **only** on JSON serialisation. Add a `test_w4_5_hold_and_win_bit_reproducible` snapshot test.
4. Promote the existing `rust-sim/src/rational_solver.rs::exact_probability` into the TS layer via `decimal.js`-backed `exactSymbolProbability(weight, total)` for parity.

---

*End of report.*
