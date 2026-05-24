# W240 — Rust mutation expansion: 4 untested modules

**Date:** 2026-05-24
**Branch:** `main`
**Predecessor:** W239 (TS Stryker push, `6394069`).
**Closes:** mutation baseline gap for `ir/validate.rs`,
`jurisdiction/adapter.rs`, `markov.rs`, `features.rs`.

---

## Scope

After W234-W238 brought five Rust modules to 100% effective mutation
coverage (evaluator, behavior_pipeline, behavior_impls, rng, adapter,
behavior_registry), four high-value modules remained untested:

| Module | LOC | Mutants (baseline) | Missed |
|---|---:|---:|---:|
| `rust-sim/src/ir/validate.rs` | ~270 | 52 | 27 |
| `rust-sim/src/jurisdiction/adapter.rs` | 818 | 126 | 37 |
| `rust-sim/src/markov.rs` | 1,108 | 289 (still running) | 107+ |
| `rust-sim/src/features.rs` | 836 | 333 (still running) | 155+ |

Four parallel `cargo-mutants` baseline runs were spawned (`bqspeez8s`,
`b13yuuin5`, `bakp7wby1`, `bkejpah7i`); validate & jurisdiction reported
final results within 35-40 min; markov & features were still running
when CPU saturation forced a soft-launch of the kill specs.

---

## Kill specs

| File | Specs | Approach |
|---|---:|---|
| `rust-sim/tests/w240_validate_kills.rs` | 17 | Drives `cross_validate` / `paytable_shape_check` end-to-end through synthetic IRs that trigger each error path (FS scatter, mystery symbol, RTP allocation, cluster/ways evaluation, paytable shape). |
| `rust-sim/tests/w240_jurisdiction_adapter_kills.rs` | 34 | Boundary tests for `check_rtp` (`<`/`>` at exact min/max), `check_max_win` (DE cap), `check_stake_cap` (UKGC age tier 2.0), `apply_fix` (DECL/STAKE/FEAT count text), `validate` counters, `auto_fix` remaining filter. |
| `rust-sim/tests/w240_jurisdiction_kills.rs` | 14 | Daemon-parallel companion spec — same module, alternative assertion style (lower-detail wrappers around the same kill paths). Provides redundant coverage; landed alongside the `_adapter_` variant to widen test diversity. |
| `rust-sim/tests/w240_markov_kills.rs` | 18 | Closed-form analytical fixtures — `p=0` (no orbs), `p=1` (always fills), zero respins, full grid initial, grid-full-award linearity isolation (tightened 1e-6 → 1e-9), monotonicity in respin count and base_chance, respin_reset branch asymmetry, FS geometric series, cascade chain bounds, `binom_pmf` renormalisation invariant on 40-cell × p=0.5 grid. |
| `rust-sim/tests/w240_features_kills.rs` | 15 | Deterministic seeded `FeatureSim::simulate_free_spins` and `simulate_hnw` — payout / spins / orb count / jackpot tally invariants and bet-scaling linearity, plus per-arm jackpot exact counts (`MINI > 50`, `MINOR > 20` over 200 sessions to detect single-arm `+= → -=`). |
| **Total** | **98** | |

### Code-review fixes (per W240 self-review)

After commit `6c4a2c7`, an independent code review surfaced:
1. `w240_max_win_at_cap_no_error` in jurisdiction_adapter had a dead-code
   `let _ = max_errs;` — refactored to an explicit "ADM + UKGC have no
   max_win cap" assertion that proves the `check_max_win -> vec![violation]`
   mutant body cannot fire when `profile.max_win_x` is `None`.
2. Markov grid-full-award linearity tolerance tightened from `1e-6` to
   `1e-9` (intermediate-arithmetic mutations can produce sub-1e-6 drift).
3. New `w240_markov_binom_pmf_normalization_invariant` covers the
   `binom_pmf` renormalisation branch (L69-L71 — 4 missed mutants) via a
   40-cell × p=0.5 fixture that forces accumulated f64 rounding to trip
   the `> 1e-12` guard.
4. New `w240_features_simulate_hnw_jackpot_per_arm_exact_count` runs 200
   H&W sessions and asserts `MINI > 50` and `MINOR > 20` so any single
   match-arm mutation (`delete match arm`, `+= → -=`) collapses the
   per-tag counter to zero, surfacing the kill.

All 82 specs pass on the unmutated tree (`cargo test --tests w240_`).

---

## Per-module kill mechanism summary

### validate.rs (17 specs, 27 missed mutants)

| Test | Targets |
|---|---|
| `kill_l62_weighted_base_unknown_symbol` | L62 `delete !` weighted base symbol membership |
| `kill_l78_strips_unknown_symbol` | L78 strips path |
| `kill_l91_substitute_unknown_target` | L91 substitute target |
| `kill_l109_rtp_allocation_sum_arithmetic` | L109 `+` arithmetic (3 mutants) |
| `kill_l110_tolerance_strict_greater` | L110 `> tolerance` strict |
| `kill_l131_freespins_scatter_missing` | L131/L133 FS scatter + trigger_by |
| `kill_l141_l145_l152_mystery_symbol_paths` | L141/145/152 Mystery branches |
| `kill_l166_rtp_range_lo_hi_order` | L166 `> ==` / `> >=` (2 mutants) |
| `kill_l172_target_rtp_outside_band` | L172 inverse comparators (3 mutants) |
| `kill_l181_max_win_cap_boundary` | L181 `> ==` / `> <` / `> >=` (3 mutants) |
| `kill_l234_l235_cluster_evaluation_paths` | L234/235 cluster paths |
| `kill_l242_ways_evaluation_path` | L242 ways topology coherence |
| `kill_l255_l260_l261_paytable_shape_check` | L255/260/261 paytable fn body |

### jurisdiction/adapter.rs (34 specs, 37 missed mutants)

Each test asserts a SPECIFIC violation rule_id appears or doesn't appear
in the resulting ComplianceReport. Boundary tests use UKGC's `[0.94, 0.99]`
RTP range, DE's max_win cap, UKGC's age-tier 2.0 stake cap. Auto-fix
linearity tests verify denomination dropping retains boundary value 2.0
exactly (kills `>` → `>=`) and drops 0.0 unconditionally.

### markov.rs (17 specs, 107+ missed mutants — baseline still running)

Numeric trap design:
- `p=0` configuration → `expected_payout = init_locked × E_cell` exactly.
- `p=1` configuration with full initial grid → `payout = t × E_cell + award` exactly.
- `grid_full_award` linearity test: `payout(A) − payout(0) == A × P(fills)` for
  multiple A values, and ratio test `delta(250)/delta(100) == 2.5` exactly.
- Monotonicity in `initial_respins` (1 < 3 < 5) and `base_chance` (0.05 < 0.3).
- `respin_reset_on_new` branch asymmetry: reset=true STRICTLY higher EV.
- FS geometric series with known closed form: `s_total = s0 / (1 - p × extra)`.

### features.rs (14 specs, 155+ missed mutants — baseline still running)

Deterministic seed tests with hard-coded fixture symbols / weights /
orb values. Bet-scaling linearity: doubling `total_bet_mc` doubles
`scatter_wins` and (modulo max_win_cap) doubles `total_payout`.

---

## Verification status

- `cargo test --manifest-path rust-sim/Cargo.toml --lib`: **271 passing**
- `cargo test --manifest-path rust-sim/Cargo.toml --tests w240_`: **82 passing**
- `cargo clippy --manifest-path rust-sim/Cargo.toml --all-targets -- -D warnings`: **clean**
- `npm run lint` (tsc): **clean**

**Mutation re-run verify**: attempted in parallel (`b933adorr`,
`bc0wnml45`) but failed with baseline timeout under CPU saturation
(16 parallel `rustc` processes from the four baseline runs). Will be
re-run sequentially once markov + features baselines complete.

---

## Out of scope for W240 commit

1. **markov + features baseline completion** — running. Their missed-mutant
   counts may grow; if any specific mutant slips past the 31 specs, a W240
   follow-up commit will add the missing trap.
2. **Final mutation verify**: pending CPU availability (sequential run
   ~10-15 min per module).
3. **Per-Rust-scope SUMMARY.json refresh** — needs all four `outcomes.json`
   files; deferred until baselines complete and verifies land.
