# PERF_BENCHMARKS

> W212 Faza 600.1 — Agent C. Benchmark methodology, baselines, and the
> regression policy for `slot-math-engine-template`.

This document describes how perf is measured, what we consider authoritative
baselines, how regressions are detected, and what to do when one fires.

## Benchmarks at a glance

| Bench | Driver | Source | What it asserts |
| --- | --- | --- | --- |
| Wave 27 10⁹ replay | Node single-thread | `scripts/billion-spins-replay.mjs` | Legacy 5×3 replay baseline (15.76s Node) |
| Wave 28 Rust 10⁹ replay | `cargo run` example | `rust-sim/examples/billion_spins_replay.rs` | Rust closure (5.43s Rust) |
| W212 hardened 1B spin | Node + Rust × 10 P-IDs | `scripts/perf/billion-spin-benchmark.mjs` | Multi-kernel, multi-mode latency histogram |
| W212 baselines | Synthetic probes | `scripts/perf/baseline-tracker.mjs` | Seven perf metrics vs stored baseline |
| W212 Criterion bench | `cargo bench --bench W212_bench` | `rust-sim/benches/W212_bench.rs` | Five hot paths in `slot_sim` (grid eval, full spin, 1M replay, parity, alias) |
| W210 smoke / W211 pilot | `npm run smoke:all` / `pilot:integration` | `scripts/smoke-tests/`, `scripts/pilot/` | Suite-level wall-clock baselines |
| W208 load tests | `npm run load-test:gaas` | `scripts/load-test/` | Steady-state RPS + p99 budget |

## Tracked metrics & targets

`scripts/perf/baseline-tracker.mjs` records seven metrics. Each is stored in
`reports/perf/baselines.json` (committed to git) and gated by
`npm run perf:regression-check`.

| Metric | Target | Direction | Source |
| --- | --- | --- | --- |
| `single_spin_latency_p99_ms` | ≤ 100 | lower | synth probe / live spin |
| `cert_dossier_build_s` | ≤ 5 | lower | cert-dossier-build wall |
| `smoke_suite_s` | ≤ 30 | lower | smoke:all total |
| `pilot_suite_s` | ≤ 90 | lower | pilot:integration:quick total |
| `rust_1m_mc_ms` | record only | lower | `cargo bench` 1M MC |
| `cache_hit_rate` | ≥ 0.90 | higher | server cache observability |
| `marketplace_endpoint_p99_ms` | ≤ 200 | lower | marketplace REST |

## Regression policy

> A metric is **regressed** when the current measurement is worse than
> `REGRESSION_THRESHOLD × baseline`. Default threshold is `1.10` (10%
> degradation). For higher-is-better metrics (currently only
> `cache_hit_rate`), regression fires when current is below `baseline /
> threshold`.

### What CI does

1. Every PR and every push to `main` triggers `.github/workflows/perf-regression.yml`.
2. The workflow runs `npm run perf:regression-check`.
3. On non-zero exit:
   - The job fails, blocking merge.
   - A PR comment is posted with the full markdown verdict table.
   - `reports/perf/REGRESSION_CHECK.{json,md}` is uploaded as an artifact.

### What to do when a regression fires

1. **Reproduce locally**: `npm run perf:regression-check`. Read
   `reports/perf/REGRESSION_CHECK.md` for the specific metric, current
   value, baseline, and delta.
2. **Triage**: is the regression caused by your PR, or by infrastructure
   noise? Re-run on a clean machine. If the variance is high, raise the
   measurement sample count rather than the threshold.
3. **Fix the regression**: prefer a perf fix over a baseline bump.
4. **If the new value is the intended new baseline** (rare; e.g., a
   feature added unavoidable cost), update the baseline:
   ```bash
   npm run perf:baseline-update
   ```
   Commit `reports/perf/baselines.json` in the same PR with a clear
   rationale in the commit message.
5. **Never** bypass the gate with `--no-verify` or by skipping the
   workflow.

## Methodology

### Latency histograms

We use a fixed-size reservoir (default 50,000 samples) per metric. Percentiles
are computed via in-place sort of the reservoir. Reservoir sampling guarantees
unbiased percentiles regardless of total sample count.

### Synthetic vs. live probes

Each probe in `baseline-tracker.mjs` has a synthetic fallback so CI can run
without a live backend. Synthetic probes are deterministic; the noise floor
is small enough that the 10% threshold is meaningful.

For production validation use `--live` mode and ensure the target backend is
warm.

### Rust criterion benches

Run `cargo bench --bench W212_bench` from `rust-sim/`. HTML reports land under
`target/criterion/`. The W212 suite covers:

- `evaluator_grid_eval` — single grid eval
- `evaluator_spin_full` — full spin (generate + evaluate)
- `evaluator_replay_1m` — 1M spin replay
- `evaluator_parity_check` — TS↔Rust parity payload at 10k seeds
- `alias_method_sample` — Vose alias sample (RNG hot path)

Re-run the criterion suite when you touch any code reachable from these paths.

## Operational runbook

| When | Run | Why |
| --- | --- | --- |
| Pre-PR | `npm run perf:regression-check` | Catch regression before review |
| After perf-affecting commit | `npm run perf:gauntlet:synthetic` | Run the full pre-prod gauntlet |
| Before release | `npm run perf:gauntlet` | Full mode, all gates |
| Quarterly | `npm run perf:baseline-update` | Refresh baselines from clean runs |
| After Rust hot-path change | `cd rust-sim && cargo bench --bench W212_bench` | Track criterion deltas |

## Reports

| Path | Producer | Content |
| --- | --- | --- |
| `reports/perf/baselines.json` | `baseline-tracker.mjs --mode=update` | Committed source of truth |
| `reports/perf/REGRESSION_CHECK.{json,md}` | `baseline-tracker.mjs` | Per-PR regression verdict |
| `reports/perf/BILLION_SPIN_BENCHMARK.{json,md}` | `billion-spin-benchmark.mjs` | 1B spin multi-mode histogram |
| `reports/perf/MEMORY_LEAK.{json,md}` | `memory-leak-detector.mjs` | Heap growth verdict |
| `reports/perf/BILLION_SPINS_REPLAY.{json,md}` | `billion-spins-replay.mjs` | Wave 27 legacy baseline |
| `target/criterion/` | `cargo bench --bench W212_bench` | Rust HTML reports |

## Honest reporting

All W212 benchmark outputs surface speedups vs. the `node-single` baseline
even when they are below 1.0×. Regressions are not hidden, not rounded
favourably, not aggregated to mask them. The baseline gate fails loudly so
the regression is caught at review time, not in production.

If a benchmark cannot run on a given host (e.g., no cargo toolchain), the
script either skips with `skipped: true` in the JSON or exits 2 with the
underlying error in stderr. Silent passes are a CI bug, not a feature.

## See also

- `docs/PRE_PROD_GAUNTLET.md` — pre-prod gauntlet runbook
- `docs/PERFORMANCE.md` — historical perf notes (Wave 9 → Wave 28)
- `scripts/sub-ms-mc-bench.mjs` — sub-ms MC bench (existing)
- `scripts/load-test/_lib.mjs` — load-test histogram primitives (W208)
