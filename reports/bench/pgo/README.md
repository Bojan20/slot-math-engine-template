# Faza 9.5 — Profile-Guided Optimization (PGO) bench reports

> **Status:** pipeline + CI gate landed in W152 Wave 10. PGO build artifacts
> (instrumented + optimized binaries) are produced by `scripts/pgo-build.sh`
> and `pgo-bench` GitHub workflow. Per-run summaries land in
> `reports/bench/pgo/<UTC-timestamp>/summary.json`.

## What this measures

`scripts/pgo-build.sh` runs the canonical three-stage PGO build:

| Stage | Action | Notes |
|-------|--------|-------|
| **0** | baseline release build, criterion bench captured | `target/release/slot_sim` |
| **1** | instrument build (`-Cprofile-generate=<dir>`) | rebuilds `slot_sim` only |
| **2** | training workload (3 representative fixtures × `PGO_TRAINING_SPINS` each) | emits `*.profraw` |
| **3** | merge → optimized build (`-Cprofile-use=...`) + re-run criterion bench | PGO-optimised binary stashed in `target/release-pgo/` |
| **4** (opt.) | `llvm-bolt` post-link basic-block reordering | only when `--bolt` is passed and `llvm-bolt` is on PATH |

The acceptance bench is `full_spin/packed_ZeroAlloc` (the hot path that
dominates 1T-spin runs). Both runs use the same criterion settings
(`--warm-up-time 1 --measurement-time 3`).

## Acceptance gate (Faza 9.5)

| Metric | Threshold | Where enforced |
|--------|-----------|----------------|
| Throughput delta vs non-PGO | **≥20 %** | `summary.json.status == "PASS"`; script exits non-zero on `MISS` |

The `pgo-bench` workflow is on a weekly cron (Saturdays 04:00 UTC) plus
manual dispatch — it's expensive enough that we don't put it on every PR.

## How to read `summary.json`

```jsonc
{
  "timestamp":        "20260515T001530Z",
  "threshold_pct":    "0.20",
  "bench":            "full_spin/packed_ZeroAlloc",
  "baseline_median_ns": 232.94,
  "pgo_median_ns":      181.30,
  "delta_fraction":   "0.221693",
  "delta_pct":        "22.17%",
  "status":           "PASS",
  "bolt_binary":      null,
  "rustc_version":    "rustc 1.82.0 (f6e511eec 2024-10-15)",
  "host":             "Linux 6.5 x86_64"
}
```

- `delta_fraction = (baseline_ns − pgo_ns) / baseline_ns` (positive = PGO faster)
- `status` is `PASS` when `delta_fraction ≥ threshold_pct`, otherwise `MISS`
- `bolt_binary` is `null` unless `--bolt` was passed and `llvm-bolt` was on PATH

## Local reproduction

```bash
# 1. Make sure llvm-tools-preview is installed (provides llvm-profdata).
rustup component add llvm-tools-preview

# 2. Full pipeline (Stage 0–3, no BOLT):
scripts/pgo-build.sh

# 3. With BOLT post-link layout pass (Linux + binutils-bolt):
scripts/pgo-build.sh --bolt

# 4. Tune the acceptance gate (default 0.20 = 20 %):
scripts/pgo-build.sh --threshold 0.15

# 5. Skip the criterion runs (build only, ~70 s):
scripts/pgo-build.sh --skip-bench
```

## Why these fixtures train

The training workload exercises the three hot paths that dominate real
production traffic:

1. `tests/fixtures/parity.json` — the bit-exact TS↔Rust parity fixture
2. `tests/fixtures/reference/5x3-243ways.json` — Ways-class evaluator + scatter pay
3. `tests/fixtures/reference/hnw-grand-jackpot.json` — Hold&Win + jackpot ladder

Total ≈ 6M spins × release-mode evaluator = enough samples for the BB
profiles to converge. Cold paths (config parse, CLI flag handling,
report serialization) get `-pgo-warn-missing-function` so we know what
was *not* covered — important when tweaking the training set.
