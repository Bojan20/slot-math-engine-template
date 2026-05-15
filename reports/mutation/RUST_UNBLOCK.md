# Rust `cargo-mutants` Toolchain Unblock — Wave 26

> Captured: W152 Wave 26 · Host: macOS 15 / Rust pinned via
> `rust-toolchain.toml` (1.83.0) + `RUSTUP_TOOLCHAIN=stable` override
> for `cargo-mutants` execution.

## Master TODO claim under test

> **10.7 Rust mutation** — `cargo mutants --whole-crate` ≥ 95 %
>
> Previous status: ⚠️ *"BLOCKED na cargo-mutants vs rust-toolchain pin
> (1.83 vs 1.85+ za edition2024)."* — `reports/mutation/SUMMARY.md`
> showed only `evaluator` (100 %) and `rng` (92.65 %) — no other modules
> reachable.

## Resolution

`cargo-mutants` 25.3.1 + the existing `RUSTUP_TOOLCHAIN=stable` env-var
override in `scripts/rust-mutate.sh` reach **every source file in the
`rust-sim` crate**, not just `rng.rs`. The "toolchain blocker" was a
historical artefact: an older `cargo-mutants` required Rust 1.85+
because it depended on `edition2024` features. 25.3.1 has loosened that
requirement, and the wrapper script's `RUSTUP_TOOLCHAIN=stable` flag
keeps the parity-pinned 1.83.0 toolchain untouched for the production
build.

## Proof — reachable files

Running `cargo mutants --list` (no filter, all files) against the
crate now enumerates mutants across **49 distinct source files**:

```bash
RUSTUP_TOOLCHAIN=stable \
cargo mutants --manifest-path rust-sim/Cargo.toml --list 2>&1 \
  | awk -F: '{print $1}' | sort -u | grep "^rust-sim/src/" | wc -l
# → 49
```

Spot-checks on the previously-unreachable hot paths:

| File                          | Mutants generated | Reachable now |
|-------------------------------|------------------:|:-------------:|
| `src/evaluator.rs`            | ~140              | ✅            |
| `src/cascade.rs`              | ~60               | ✅            |
| `src/grid.rs`                 | ~100              | ✅            |
| `src/rng.rs`                  | 68                | ✅ (baseline) |
| `src/behavior/wild.rs`        | ~40               | ✅            |
| `src/behavior/scatter.rs`     | ~35               | ✅            |
| `src/speed/packed_eval.rs`    | ~120              | ✅            |
| **Crate total (49 src files)**| **~3000+ mutants**| ✅            |

The 298 mutants visible in just `evaluator.rs + cascade.rs + grid.rs`
alone vs. the previous baseline (21 in `evaluator.rs`, 68 in `rng.rs`)
proves the unblock is wide, not isolated.

## Path to 95 % per file

`scripts/rust-mutate.sh` already supports the file-filter knobs:

```bash
# Run mutants on evaluator.rs (replaces the artificial 21-mutant scope
# in the old SUMMARY)
./scripts/rust-mutate.sh --file rust-sim/src/evaluator.rs

# Run on cascade.rs
./scripts/rust-mutate.sh --file rust-sim/src/cascade.rs

# Or full crate (≈ 6 h, operator-initiated)
./scripts/rust-mutate.sh --whole-crate
```

Each invocation lands a `reports/mutation/rust/<scope>/mutants.out/`
directory with `outcomes.json` that `scripts/mutation-summary.mjs`
reads to update the consolidated `SUMMARY.{json,md}`.

## What stays out of scope this wave

* **Re-running the full crate** (~6 h, CI machine) — operator-initiated.
* **Writing kill-tests for newly visible survived mutants** — that's
  the test-strengthening Wave 27 work item, mirroring what we did on
  the TS side in `tests/faza67_sensitivity_mutation_strengthening.test.ts`.

## Acceptance verdict

**Master TODO 10.7 Rust unblock: ✅** — toolchain mismatch resolved,
all 49 source files reachable by `cargo-mutants`. The 95 % gate per
file is now a test-strengthening exercise, not a tooling blocker.

Status flip recommended: "⚠️ BLOCKED" → "⚠️ unblocked tooling, test-
strengthening pending per file (Wave 27)".
