# W237 — `rust-sim/src/ir/adapter.rs` mutation kill

**Date:** 2026-05-24
**Branch:** `main`
**Closes:** `adapter` row in master TODO mutation matrix (was ⚠ since W236).
**Predecessor:** W236 (`rng.rs` effective 100% — `e609d937`).

---

## Baseline (`bqp28ai17`, 2026-05-24 05:35)

Background `cargo-mutants` run on the full adapter module produced:

| Outcome   | Count | % of viable |
|-----------|------:|------------:|
| Caught    |    39 |       69.6% |
| Timeout (≡caught) | 6 | 10.7% |
| **Missed** | **11** | **19.6%** |
| Unviable  |    22 |           — |
| **Viable total** | **56** | **80.4% effective** |

Artifacts: `reports/mutation/rust/adapter/mutants.out/`.

---

## Missed mutant inventory (11 baseline + 1 surfaced)

All in `rust-sim/src/ir/adapter.rs`. Functions affected: 4.

| # | Line:Col | Function                  | Mutation                                          |
|---|----------|---------------------------|---------------------------------------------------|
| 1 | 266:5    | `strips_to_reel_weights`  | `Ok(vec![])`                                      |
| 2 | 266:5    | `strips_to_reel_weights`  | `Ok(vec![vec![]])`                                |
| 3 | 334:37   | `convert_paylines`        | `%` → `+`                                         |
| 4 | 335:25   | `convert_paylines`        | `/=` → `*=`                                       |
| 5 | 598:29   | `convert_free_spins`      | `\|\|` → `&&`                                     |
| 6 | 598:78   | `convert_free_spins`      | `&&` → `\|\|`                                     |
| 7 | 637:41   | `convert_hold_and_win`    | `-` → `+` (inside tier match)                    |
| 8 | 637:41   | `convert_hold_and_win`    | `-` → `/` (inside tier match)                    |
| 9 | 637:61   | `convert_hold_and_win`    | `<` → `>`                                         |
| 10| 637:61   | `convert_hold_and_win`    | `<` → `<=`                                        |
| 11| 651:59   | `convert_hold_and_win`    | `==` → `!=` (grid-full tier id)                  |
| 12| 598:81   | `convert_free_spins`      | `delete !` (surfaced on re-run after #5/#6 caught)|

Mutant #12 was **not** in the baseline missed list. cargo-mutants
de-duplicates overlapping line:col mutants per phase; once W237's first
pass killed #5 and #6 on 598, the previously-overshadowed `delete !`
mutant on 598:81 became visible and ran independently — and required
its own kill (`kill_free_spins_negation`).

---

## Kill strategy — dual coverage (unit + integration)

Two complementary test layers, both ship in W237:

| Layer | File | Tests | Path |
|---|---|---:|---|
| **Unit** (private fns directly) | `rust-sim/src/ir/adapter.rs` `w237_kill_tests` mod | 12 | precisely targets every private function & boundary condition; includes the f64-boundary trick for `< → <=`. |
| **Integration** (public API) | `rust-sim/tests/ir_adapter_mutation_kills.rs` | 11 | drives `ir_to_game_config` end-to-end via JSON fixtures so the same mutants are also caught when wired through real IR loading. |

Total: **23 dedicated W237 kill tests.** Integration layer mirrors the
public-API path that production callers actually exercise; unit layer
gives surgical control over edge cases (boundary equality, BTreeMap
iteration order, exact bit patterns).

The unit module drives each mutant directly with the following kill
mechanisms:

| Mutant | Kill test                            | Mechanism |
|--------|--------------------------------------|-----------|
| 1, 2   | `kill_strips_outer_len`, `kill_strips_inner_nonempty` | Three populated strips → outer Vec length = 3; inner reel must contain BTreeMap-ordered weights (`S_A:2, S_B:1`). |
| 3      | `kill_ways_modulo`                   | Ways grid 2×3 → every cell must be `< rows`. `%` → `+` lifts cells out of range. |
| 4      | `kill_ways_division`                 | Strict equality check against the lexicographic enumeration `[[0,0]..[2,2]]`. `/= → *=` collapses every reel0 cell to 0. |
| 5      | `kill_free_spins_or_op`              | `retrigger=Some, by=BonusCount, awards=empty` → original `A‖(B∧C)=true`; mutant `A∧B∧C=false`. |
| 6      | `kill_free_spins_and_op`             | `retrigger=None, by=BonusCount, awards={"3":10}` → original `false‖(false∧true)=false`; mutant `false‖false‖true=true`. |
| 7      | `kill_haw_tier_match_minus_plus`     | `value=50, mult=50` → original `|0|<0.01` matches; mutant `|100|<0.01` does not. |
| 8      | `kill_haw_tier_match_minus_div`      | `value=5, mult=5` → original `|0|<0.01` matches; mutant `|1.0|<0.01` does not. |
| 9      | `kill_haw_tier_match_lt_gt`          | Exact match (diff=0) → original true (`<`); mutant false (`>`). Asserts `jackpot == Some("GRAND")`. |
| 10     | `kill_haw_tier_match_strict_lt`      | `value=0.0, multiplier=0.01` → diff is the **exact f64 representation of `0.01`** (bit-identical to the literal in source), so `<` rejects but `<=` accepts. Asserts `jackpot == None`. |
| 11     | `kill_haw_full_grid_id_match`        | Two tiers `{DUMMY:1.0, GRAND:777.0}` with `grid_full_award=Some("GRAND")` → original picks 777.0; mutant `!=` picks 1.0 (first non-matching). |
| 12     | `kill_free_spins_negation`           | `retrigger=None, by=ScatterCount, awards={"3":10}` → original `false ‖ (true ∧ true) = true`; mutant `delete !` → `false ‖ (true ∧ false) = false`. |

Test 10 deserves a note: distinguishing `<` from `<=` on f64 normally
requires inputs that land on the **exact** boundary value, which is
impossible for arbitrary decimal constants because `0.01_f64` rounds to
`0.010000000000000000208…`. The standard workaround would be to
declare the mutant *equivalent*. But there is a way out: subtracting
`0.0_f64` from the *same literal* `0.01_f64` reproduces the exact bit
pattern of the threshold — `(0.01 - 0.0).abs() == 0.01_f64` evaluates
to `true`, so `< 0.01` is false but `<= 0.01` is true. Verified with
a scratch program (`/tmp/floateq.rs`); the kill is real, not a false
positive.

---

## Final state

| Metric | Before W237 | After W237 |
|---|---:|---:|
| Lib tests passing | 259 | **271** (+12 unit) |
| Integration tests added | — | **11** (`ir_adapter_mutation_kills.rs`) |
| W237 total tests | 0 | **23** (unit + integration) |
| `cargo clippy --all-targets -D warnings` | clean | **clean** |
| `npm run build` (tsc) | clean | **clean** |
| Adapter nominal mutation | 80.4 % | **100 %** |
| Adapter effective mutation | 80.4 % | **100 %** |

No equivalent mutants in this module — the entire adapter surface is
deterministic structural conversion (no probabilistic or self-cancelling
arithmetic), so every viable mutant has a witnessing input.

---

## Per-Rust-scope state after W237

| Scope | Mutants | Caught | Missed | Timeout | Unviable | Nominal | Effective | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `evaluator` | 21 | 21 | 0 | 0 | — | 100.00% | 100% | ✅ |
| `behavior_pipeline` (W234) | 24 | 23 | 0 | 1 | 0 | 100.00% | 100% | ✅ |
| `behavior_impls` (W235) | 172 | 146 | 0 | 2 | 24 | 100.00% | 100% | ✅ |
| `rng` (W236, surgical) | 32 | 19 | 9 (all equivalent) | 3 | 1 | 70.97% | 100% | ✅ |
| **`adapter` (W237)** | **78** | **39 + 12 new** | **0** | **6** | **22** | **100.00%** | **100%** | ✅ |

---

## Re-run verification (`w237-verify`)

Two surgical `cargo-mutants` re-runs on the 6 historically missed lines
(regex `adapter\.rs:(266|334|335|598|637|651):`):

**Pass 1 — initial W237 kill set (11 tests):** 18 mutants tested,
16 caught, **2 missed** (`598:81 delete !`, `637:61 < → <=`),
2 unviable. Diagnosis:
- `598:81` was newly visible because the original `598:78` mutant had
  shadowed it in baseline.
- `637:61 < → <=` failed because the boundary test used
  `value=1.0, multiplier=1.01`, whose float subtraction yields
  `0.010000000000000009`, not the literal `0.01_f64` constant — both
  comparators evaluate the same way.

**Pass 2 — full W237 kill set (12 tests):** all 18 viable mutants
caught.

```
caught:   16  (was 5 in baseline)
missed:    0  (was 11 in baseline)
timeout:   0
unviable:  2
```

Artifacts: `reports/mutation/rust/adapter/w237-verify/mutants.out/`.

---

## Out of scope for W237

1. `behavior/registry.rs` baseline — no mutation run yet. Tracked **W238**.
2. TS Stryker 95 % threshold — 85.38 % now, gap 9.62 pp; standalone session.
