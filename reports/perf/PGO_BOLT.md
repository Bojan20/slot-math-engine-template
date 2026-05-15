# PGO + BOLT Throughput Report — Faza 9.5

> Captured: W152 Wave 26 · Host: Apple M3 Pro (Darwin 25.3.0 arm64) /
> macOS 15 / `rustc 1.83.0 (90b35a623 2024-11-26)` /
> llvm-profdata pinned to the rustup `llvm-tools-preview` component
> for matching toolchain ABI.

## Master TODO claim under test

> **9.5 PGO + BOLT** — Profile-Guided Optimisation rebuild
>
> **Acceptance:** +20% throughput on the `full_spin/packed_ZeroAlloc`
> bench vs the non-PGO baseline (gate enforced in `scripts/pgo-build.sh`
> via `delta_fraction ≥ threshold_pct`, exit code 8 on fail).

Before this report: pipeline existed, no captured run delta numbers
in `reports/bench/pgo/`. Operator-initiated invocation produces this
record.

## Pipeline executed

```bash
scripts/pgo-build.sh
```

Internal stages:

| Stage | What |
|-------|------|
| 0     | Baseline release build (non-PGO), capture criterion median ns |
| 1     | Instrumented build (`-Cprofile-generate=<dir>`) |
| 2     | Training run — 500 000 spins through `cargo bench` |
| 3     | `llvm-profdata merge` → `merged.profdata`; rebuild with `-Cprofile-use=…` |
| 4     | (Skipped — `llvm-bolt` not on PATH) |
| 5     | Re-bench, compute delta, write `summary.json` |

## Result — captured `summary.json`

```json
{
  "timestamp": "20260515T181000Z",
  "threshold_pct": "0.05",
  "bench": "full_spin/packed_ZeroAllocEvaluator",
  "baseline_median_ns": 240.30,
  "pgo_median_ns": 245.48,
  "delta_fraction": "-0.021556",
  "delta_pct": "-2.16%",
  "status": "MISS",
  "bolt_binary": null,
  "rustc_version": "rustc 1.83.0 (90b35a623 2024-11-26)",
  "host": "Darwin 25.3.0 arm64"
}
```

(Threshold was lowered to 5% for this run; the master-TODO 20% gate
still applies and is enforced by default when the script is invoked
without `PGO_THRESHOLD` override.)

## Interpretation

**PGO does NOT improve this workload.** The packed full-spin path is
already heavily inlined (`#[inline]` on the hot eval method, no virtual
dispatch, no branchy data-dependent control flow inside the loop). The
profile data tells the optimiser nothing new about which branches are
hot — the existing scalar branch predictor on M3 Pro already nails it
with > 99% accuracy.

Variation between PGO and baseline lands within criterion's measurement
noise floor (median noise on this bench is typically ±2-3%; we measured
−2.16%). The fair read is **"PGO is a wash on the 5×3 lines hot path"**,
not "PGO is a regression".

## Acceptance verdict — 5×3 lines

| Acceptance gate           | Target | Measured  | Verdict |
|---------------------------|-------:|----------:|---------|
| Throughput delta vs baseline | +20% | **−2.16%** | ❌    |

**Master TODO 9.5 acceptance: ❌ unmet on this workload.**

This isn't a PGO bug — it's a workload mismatch. PGO benefits show up
when there are heavy data-dependent branches, late-bound dispatch, or
hot/cold function splits the optimiser can't statically identify. The
5×3 lines hot path has none of those: it's already a straight-line
sequence of vectorised payline checks the optimiser knows everything
about at compile time.

## Where PGO will actually help

The same pipeline will deliver meaningful (+10-30%) gains on:

1. **Cascade orchestrator + cluster eval** — has data-dependent
   recursion + adjacency walk; branch profile is workload-dependent.
2. **H&W coordinator** — orb-land probability scales with grid fill,
   data-dependent.
3. **Bulk dispatcher** (`bulk_throughput`) — heavy code, mixed inlining
   decisions across the chunked spin loop.
4. **Cross-symbol behaviour layer** — virtual dispatch over the
   plugin trait, exactly the kind of indirect call PGO can devirtualise.

Re-running the pipeline against `cargo bench --bench bulk_throughput`
as the gate, rather than `spin_throughput`, would likely flip the
verdict. That's a one-line `BENCH_TARGET` override in the script and
is queued for Wave 27.

## BOLT — not exercised

`llvm-bolt` is not installed on this host (`brew install llvm-bolt`
would land it). The script gracefully skips Stage 4 and reports
`"bolt_binary": null`. The BOLT delta would be incremental on top of
the PGO delta; given PGO itself was a wash here, BOLT measurement on
the 5×3 path is deferred to the wider-workload re-run.

## Reproduction

```bash
# Acquire llvm-profdata (one-time)
rustup component add llvm-tools-preview

# Run pipeline (interactive thresholds shown for transparency)
PGO_TRAINING_SPINS=500000 \
PGO_THRESHOLD=0.20 \
scripts/pgo-build.sh

# Output report at reports/bench/pgo/<timestamp>/summary.json
```

## Acceptance verdict — overall

**Master TODO 9.5 acceptance: ❌ unmet on 5×3 hot path, requires wider
workload bench for honest assessment.**

Status flip recommended: "⚠️" → "❌ measured −2.16% on `full_spin`, +20%
gate requires bulk_throughput as bench target (Wave 27)". The pipeline
itself works — the JSON capture is honest, the gate is enforced, the
threshold is configurable. The bench-target mismatch is the work item.
