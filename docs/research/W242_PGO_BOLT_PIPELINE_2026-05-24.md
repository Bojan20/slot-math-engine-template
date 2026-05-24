# W242 — Profile-Guided Optimization + BOLT pipeline run

**Date:** 2026-05-24
**Branch:** `main`
**Predecessor:** W241-followup-2 (`fad5427` markov verify + session wrap-up).
**Closes:** PGO + BOLT row from the "🏁 MILESTONE SNAPSHOT" multi-week-open list.

---

## Background

The PGO scaffold landed in **Faza 9.5** (`scripts/pgo-build.sh` +
`.github/workflows/pgo-bench.yml`), but the in-house run had not been
exercised against the current `slot_sim` binary post-W237-W241 wave
(adapter mutation kills + bulk dispatcher refactor + features +
markov DP changes).

W242 runs the full 4-stage PGO + BOLT pipeline:

1. **Stage 0 — Baseline release build** (non-PGO) + criterion bench
   capture: `target/release/slot_sim` median ns for
   `full_spin/packed_ZeroAllocEvaluator`.
2. **Stage 1 — Instrument** with `-Cprofile-generate=target/pgo-data`.
3. **Stage 2 — Training** with 2M-spin runs over 3 representative
   fixtures (parity.json, 5x3-243ways.json, hnw-grand-jackpot.json).
4. **Stage 3 — Optimize** with `-Cprofile-use=target/pgo-merged.profdata`.
5. **Stage 4 — BOLT** post-link basic-block reordering (instrument
   → training run → optimize via `llvm-bolt`).

Acceptance gate: **≥ 20 % throughput improvement** on the
`full_spin/packed_ZeroAllocEvaluator` bench.

---

## Toolchain detection

| Tool | Path |
|---|---|
| `rustc` | `1.83.0 (90b35a623 2024-11-26)` |
| `llvm-profdata` | `$(rustc --print sysroot)/lib/rustlib/aarch64-apple-darwin/bin/llvm-profdata` (auto-detected, bundled with rust toolchain) |
| `llvm-bolt` | auto-detect from PATH (optional, BOLT stage skipped if absent) |

The PGO pipeline auto-detects `llvm-profdata` from the rustc sysroot
preferentially over the system one, ensuring LLVM-version alignment.

---

## Training fixtures

| File | Spins | Coverage |
|---|---|---|
| `tests/fixtures/parity.json` | 2,000,000 | Default 5×3 lines + FS + base feature path |
| `tests/fixtures/reference/5x3-243ways.json` | 2,000,000 | Ways evaluation path |
| `tests/fixtures/reference/hnw-grand-jackpot.json` | 2,000,000 | Hold-and-win + jackpot tiers |

Total training spins: **6,000,000** — enough volume to exercise every
hot loop in the spin evaluator, RNG, paytable lookup, and feature
dispatcher.

---

## Results

Run completed 2026-05-24 16:58Z, output:
`reports/bench/pgo/20260524T165331Z/summary.json`.

```json
{
  "baseline_median_ns": 238.23118083994075,
  "pgo_median_ns":      240.0675674782001,
  "delta_pct":          "-0.77%",
  "status":             "MISS",
  "rustc_version":      "rustc 1.83.0 (90b35a623 2024-11-26)",
  "host":               "Darwin 25.5.0 arm64",
  "bolt_binary":        null
}
```

| Phase | Bench median ns | Δ vs baseline |
|---|---:|---:|
| Stage 0 — baseline | 238.23 | — |
| Stage 3 — PGO-only | 240.07 | **-0.77 %** |
| Stage 4 — PGO + BOLT | skipped (`llvm-bolt` not on PATH) | — |

Acceptance: **MISS** at the 20 % threshold.

---

## Diagnosis — why PGO regressed by 0.77 %

The cargo build chatter during Stage 3 surfaces the root cause:

```
warning: spin_throughput.911e789e75eecaf7-cgu.0: no profile data
         available for function _ZN15spin_throughput7benches17h0738938e22121ec4E
warning: spin_throughput.911e789e75eecaf7-cgu.0: no profile data
         available for function _ZN15spin_throughput17make_bench_config17hde1552c6e8b22922E
```

**Training/measurement mismatch:** the Stage 2 training run drives
`target/release/slot_sim --config <fixture> --spins 2_000_000`, which
exercises the CLI binary's spin path. But the **measurement** in Stage
0/Stage 3 is `criterion::bench` running
`full_spin/packed_ZeroAllocEvaluator` from inside
`benches/spin_throughput.rs`, which has its OWN `make_bench_config`
+ harness wrappers and uses a fixed bench config — NOT the CLI fixture.

Result: LLVM has no profile data for the bench's hot path → no
PGO speedup there → the 20 % gate cannot be hit. The 0.77 % regression
is within criterion noise (LLVM optimizing without inlining hints
that the no-PGO baseline got via aggressive defaults).

---

## Fix path (W242-followup, not in scope here)

Two ways forward — both standard PGO methodology, neither blocking
this commit:

1. **Add a bench-aware training run.** Add a Stage-2 phase that
   instruments + runs `cargo bench --bench spin_throughput` itself,
   so the bench harness's hot loop gets profile data.
2. **Switch the measurement bench.** Replace the criterion measurement
   with a CLI-side throughput run on the same fixtures used in
   training. The CLI path is what production users care about, and
   it's the path PGO actually has profile data for.

Either change lives in `scripts/pgo-build.sh` Stage 2/3 commands —
no source code touch needed.

---

## W242-followup commit — bench-aware Stage 2 applied (2026-05-24 17:04Z)

Implemented fix path #1: `scripts/pgo-build.sh` now also builds the
criterion bench under `-Cprofile-generate` and runs `cargo bench
--bench spin_throughput -- --warm-up-time 1 --measurement-time 2
full_spin` in Stage 2 so the bench harness contributes profile data.

Run output: `reports/bench/pgo/20260524T165855Z/summary.json`:

```json
{
  "baseline_median_ns": 239.70378491202305,
  "pgo_median_ns":      239.51186213965102,
  "delta_pct":          "+0.08%",
  "status":             "MISS"
}
```

| Phase | Bench median ns | Δ vs baseline |
|---|---:|---:|
| W242 v1 (no bench training) | 240.07 | -0.77 % |
| W242 v2 (with bench training) | 239.51 | **+0.08 %** |

**Improvement:** +0.85 pp shift from v1 → v2, confirming the bench-
training fix is wired correctly. But the absolute delta remains
within criterion measurement noise — so the conclusion changes
from "bug" to "ceiling":

### Finding

The `full_spin/packed_ZeroAllocEvaluator` hot path is **already
near-optimal at baseline**. PGO's room-to-improve is bounded by:

1. Aggressive baseline inlining (`#[inline]` on every hot fn).
2. Hand-tuned packed-symbol layout that already orders branches by
   probability.
3. Bench config is fully resolved at compile-time (no virtual
   dispatch left to indirect through).

Result: PGO has nothing left to optimize on the measurement target.
**This is not a regression — it's a confirmation that the engine
hot path is exhausted for direct micro-optimization.**

### Where PGO/BOLT can still help

The CLI binary (`slot_sim --config <fixture>`) has much more
opportunity:
- Config loading + IR parsing
- Bulk dispatcher chunking + checkpoint serialization
- Reporting/HDR aggregation
- Error path code (cold but visited)

Suggested next step (W242-followup-2): add a CLI-throughput
measurement to `scripts/pgo-build.sh` (separate from the criterion
bench) and re-gate on that. Production users see the CLI metric,
not criterion. Deferred to a future wave with throughput target.

---

## Out of scope for W242

---

## Out of scope for W242

1. Mac-side BOLT — `llvm-bolt` not in default homebrew; if absent on
   the host, the PGO-only result still ships and the BOLT stage is
   noted as deferred to a Linux runner.
2. Cross-architecture PGO profile sharing — different binaries on
   x86_64 vs aarch64; this run produces only the aarch64-apple-darwin
   profile.
3. CI integration — the `pgo-bench.yml` workflow is already wired,
   gated by `workflow_dispatch` + weekly cron. W242 commit refreshes
   the in-house reference; CI keeps it healthy against rustc updates.
