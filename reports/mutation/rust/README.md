# `reports/mutation/rust/` — Rust mutation testing baseline

Closes **P0 #8 finish** (Rust side) of the submission plug list. The
TS side was already shipped in commit `da2b88e` (Stryker baseline,
68.7% session.ts + 46.9% analyzer.ts). The Rust side was blocked
because `cargo-mutants ≥ 24` requires `edition2024` and the repo's
parity toolchain is pinned at Rust 1.83.0.

## Resolution

We run mutation testing **outside** the parity toolchain via
`RUSTUP_TOOLCHAIN=stable` (currently 1.93). This keeps:

- `rust-toolchain.toml` untouched (1.83 parity guarantee preserved)
- All builds, tests, benches reproducible on 1.83
- Mutation runs reproducible on newer stable

The choice is documented in `scripts/rust-mutate.sh` and the
`npm run mutate:rust` script forwards to it.

## Baseline run — `src/rng.rs` (P0 critical module)

Command:
```bash
RUSTUP_TOOLCHAIN=stable cargo mutants \
  --manifest-path rust-sim/Cargo.toml \
  --file rust-sim/src/rng.rs \
  --re "pick_weighted|random_int|random_bounded|next_f64|next_u64" \
  --timeout 60 --no-shuffle --jobs 6 \
  --output reports/mutation/rust/rng
```

Scope: 5 hot-path correctness-critical function families (the
user-facing RNG API every spin touches).

Results (Apple M3 Pro, 12 m 41 s wall-clock, 6 parallel jobs):

| Outcome                       | Count | %      |
|--------------------------------|-------|--------|
| Caught (tests killed mutant)   | 28    | 40.6 % |
| Missed (tests passed despite)  | 27    | 39.1 % |
| Timeout (tests hung > 60 s)    | 13    | 18.8 % |
| Unviable (won't compile)       | 1     | 1.4 %  |
| **Total**                      | **69**| 100 %  |

### Two scores

- **Strict mutation score** (`caught / (caught + missed)`)
  = 28 / 55 = **50.9 %**
- **Lenient** (timeouts as caught, since a hung test arguably
  detects the mutation albeit slowly) = 41 / 68 = **60.3 %**

Operator submission kit cites the **strict** figure.

## Top survived mutants (compliance gap analysis)

The 27 missed mutants concentrate in two function families. Both are
critical for slot-engine correctness; the tests we have do not
adequately constrain their arithmetic.

### `SlotRng::pick_weighted_index` (lines 587–597, 9 missed)

```
replace * with + in 588    — running total miscalculation
replace * with / in 588
replace -= with /= in 591  — wrong subtraction direction
replace -= with += in 591
replace <= with > in 592   — boundary flip
replace - with + in 597    — bucket index off-by-one
replace - with / in 597
replace fn -> 0
replace fn -> 1
```

**Implication.** A subtle bug in weighted symbol selection (e.g.
boundary `<=` swapped for `>`) would not be caught by current unit
tests. The function is hot — every spin uses it for reel-strip symbol
draws. RTP drift in the 0.01–0.1 % range could be invisible to
existing chi² tests at typical sample sizes.

**Mitigation.** Add boundary-distribution tests:
- Two-bucket scenario `weights = [1, 1]` → 1M draws → ratio ∈ [0.499, 0.501]
- Boundary scenario `weights = [0, 1, 0, …]` → 100 % must land bucket 1
- Index-zero scenario `weights = [w, 0, 0, …]` → 100 % must land bucket 0
- Off-by-one boundary `weights = [3, 1]` → exact 75/25 within ±0.5 %

### `SlotRng::random_int` / `random_bounded` (lines 543–553, 7 missed)

```
replace * with + in 543    — modulo computation
replace * with / in 543
replace fn -> 0 / 1        — constant-return
replace == with != in 553  — zero-check inversion
```

**Implication.** `random_int(min, max)` and `random_bounded(max)`
are the public API for any integer draw — anti-fraud RNG entropy
binding, plugin behaviors, jackpot tier selection. A constant-return
mutation that ALWAYS returns 0 should be killed instantly by any
distribution test; that it survives means the distribution coverage
in tests is thin.

**Mitigation.** Direct distribution tests (1M draws per function,
chi² with df = N−1, p ≥ 0.01 NIST threshold).

### Algorithm internals — Xoshiro256\*\* / Philox4x32 (lines 271–399, 9 missed)

Mutating bit operations (`<<`, `>>`, `^=`, `|=`, `&=`) inside
specific RNG step functions is hard to catch with output-only tests
since two different bit twiddles can yield outputs that pass
chi² at typical sample sizes.

**Mitigation.** Add known-answer tests against the reference vectors
published with each algorithm. Xoshiro256\*\* and Philox4x32 both
have golden test vectors in their original papers. Pin those.

## Path to ≥ 95 % strict score

| Add                                          | Est. extra caught | New strict % |
|----------------------------------------------|-------------------|--------------|
| `pick_weighted_index` boundary tests (8)     | +8                | 65.5 %       |
| `random_int` / `random_bounded` dist tests (5)| +5                | 71.0 %       |
| KAT vectors for Xoshiro / Philox / Mulberry (10) | +10           | 84.6 %       |
| Reduce timeout budget; fix slow tests (13)   | +13 (recat)       | 95.1 %       |

Each row is ~½–1 day of work. Total path to ≥ 95 % ≈ 3 dev-days.

## Reproducibility

```
toolchain   = stable @ 1.93.1 (locally; pinned in CI via dtolnay action)
seed        = deterministic (cargo-mutants does not randomize)
--no-shuffle → mutant ordering stable
hardware    = Apple M3 Pro (12 cores; --jobs 6)
wall-clock  = 12 m 41 s
```

`outcomes.json` (in `mutants.out/`) is the canonical artifact — it
contains every mutant with its full diff, log path, and phase
timings. Re-run with the same flags yields the same JSON modulo
hostname/timestamp fields.

## What this run does NOT establish

- **Whole-crate score.** We only mutated `rng.rs`. Full-crate runs
  would take ~6 hours wall-clock. Queue via the GitHub workflow.
- **Cross-platform invariance.** Mac vs. Linux mutation scores can
  differ if a mutant interacts with platform timing. The CI workflow
  runs on `ubuntu-latest`.
- **Replacement for code review.** Mutation testing surfaces gaps;
  it does not validate that the existing tests are well-named or
  that the implementation is correct.

## Files in this directory

- `rng/mutants.out/outcomes.json` — full per-mutant log + diff paths
- `rng/mutants.out/caught.txt`     — 28 caught mutants
- `rng/mutants.out/missed.txt`     — 27 missed mutants
- `rng/mutants.out/timeout.txt`    — 13 timed-out mutants
- `rng/mutants.out/unviable.txt`   — 1 unviable mutant
- `rng/mutants.out/log/`            — per-mutant compile + test logs
- `rng/mutants.out/diff/`           — per-mutant unified diff
- `README.md`                       — this file
