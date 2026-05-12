# Benchmark Reports — P0 #5 deliverable

> Status: **first measured run** committed to repo.
> Audit gate: criterion `estimates.json` (mean / median / std / CI) for every
> bench in `rust-sim/benches/`. HTML reports are NOT committed (bloat); re-run
> `cargo bench` locally to regenerate them in `target/criterion/`.

## Hardware (this run)

| Item           | Value                                  |
|----------------|----------------------------------------|
| Machine        | Apple M3 Pro                           |
| OS             | Darwin 25.3.0 arm64 (macOS 15)         |
| Toolchain      | pinned via `rust-toolchain.toml`        |
| Profile        | `bench` (release + LTO + 1 codegen unit)|
| Date           | 2026-05-12                             |

Re-runs on other hardware should commit a new directory:
`reports/bench/<hw-label>/<date>/...`. The numbers below are this machine
specifically; the **shape** of the speedups should reproduce elsewhere.

---

## Headline results

### Single-spin path

| Bench (5×3 lines)              | Mean time | Throughput   | vs scalar |
|--------------------------------|-----------|--------------|-----------|
| `grid_generation/scalar`       | 202.6 ns  | 4.94 Mspins/s| 1.00×     |
| `grid_generation/packed_u128`  | 165.2 ns  | 6.05 Mspins/s| **1.22×** |
| `full_spin/scalar_Evaluator`   | 419.0 ns  | 2.39 Mspins/s| 1.00×     |
| `full_spin/packed_ZeroAlloc`   | 232.9 ns  | 4.29 Mspins/s| **1.80×** |

### Hot-path primitives

| Bench (5×3, 1 scatter symbol)  | Mean time | Throughput   |
|--------------------------------|-----------|--------------|
| `scatter_count/scalar_loop`    |  18.4 ns  | 54.3 Melem/s |
| `scatter_count/simd_u8x16`     |  22.1 ns  | 45.2 Melem/s |

**Note:** SIMD `scatter_count` is currently SLOWER than scalar on M3 Pro for a
single 5×3 grid because the lane-load overhead dominates 15 cells. The SIMD
path pays off only at ≥ 8×8 grids or in tight batched loops (cf.
`faza98b_simd_tcp.rs` results, batched evaluation).

### 1M-spin throughput

| Bench                          | Wall-clock | Throughput   |
|--------------------------------|------------|--------------|
| `throughput_1M/scalar_1M`      | 376.3 ms   | 2.66 Mspins/s|
| `throughput_1M/packed_1M`      | 226.7 ms   | 4.41 Mspins/s|

Packed-grid pipeline gives **1.66×** end-to-end speedup at the 1M batch size.
Same numbers as `full_spin` per-spin scaled — confirms the per-spin cost is
the bottleneck, not batching overhead.

### 1T projection (Faza 9.8 acceptance gate)

The `faza98_bulk_cpu` bench projects 1T total spin time from a 5M sample:

```
Sample size       : 5_000_000 spins
Sample wall-clock : 0.178 s
Throughput        : 2.81e7 spins/s (= 28.1 Mspins/s)
Projected 1T time : 35_557 s  (≈ 592 min  ≈ 9.9 h)
Acceptance target : ≤ 60 s
Verdict           : SINGLE-THREAD CPU IS INSUFFICIENT.
                    Need SIMD batched (9.8b) + GPU (9.6) + cluster (9.8).
```

The bulk dispatcher already runs multi-threaded — 28.1 Mspins/s on M3 Pro is
the **multi-threaded scalar baseline** without packed grid or SIMD batching.
Stacking +1.66× packed (already shown above) + ~5× SIMD batched + GPU/cluster
brings us into the < 60s target. See the gate breakdown in
`SLOT_ENGINE_MASTER_TODO.md` §"ACCEPTANCE: 1T SPIN HARD CRITERION".

---

## Files in this directory

```
reports/bench/
├── README.md                              ← this file
├── grid_generation/
│   ├── scalar_DynGrid.estimates.json
│   └── packed_u128_alias.estimates.json
├── full_spin/
│   ├── scalar_Evaluator.estimates.json
│   └── packed_ZeroAllocEvaluator.estimates.json
├── scatter_count/
│   ├── scalar_loop.estimates.json
│   └── simd_u8x16.estimates.json
├── throughput_1M/
│   ├── scalar_1M_spins.estimates.json
│   └── packed_1M_spins.estimates.json
└── faza98_bulk_cpu/
    └── 10M_spins.estimates.json
```

Each `*.estimates.json` is the criterion-emitted summary with these fields:
- `mean.point_estimate` — mean time per iteration (ns)
- `median.point_estimate` — robust median
- `std_dev.point_estimate` — standard deviation
- `Mean.confidence_interval.{lower,upper}_bound` — 95% CI

Auditors should diff the `mean.point_estimate` across runs to detect
regressions; CI gate threshold is currently **manual** (P0 #5 follow-up:
wire 5% mean drift → CI fail).

---

## How to re-run

```bash
# Single bench
cargo bench --manifest-path rust-sim/Cargo.toml --bench spin_throughput

# Both benches
cargo bench --manifest-path rust-sim/Cargo.toml

# Just one bench group within a file
cargo bench --manifest-path rust-sim/Cargo.toml -- grid_generation
```

Criterion writes to `rust-sim/target/criterion/<bench>/<group>/<id>/new/`.
Copy `estimates.json` from each `new/` directory into this `reports/bench/`
tree to update the committed numbers.

---

## What's NOT measured yet (next iteration)

- ❌ **PGO + BOLT optimised builds** — faza 9.5; expect +15-25% throughput.
- ❌ **GPU Metal compute (WGSL)** — faza 9.6; expect ~50-100× speedup for
  5×3 lines; report needs WGSL profiler output.
- ❌ **TS analytical mode bench** — `vitest bench` reporter integration is
  pending (P0 #5 follow-up).
- ❌ **Memory benchmarks** — peak RSS, allocations/spin, L1/L2 miss rates.
  Requires `instruments` or `perf` integration.
- ❌ **Cross-platform parity** — same bench on linux-x64 and windows-x64
  to confirm relative speedups (not absolute timing).

Without these, the engine's "1T spins/sec" marketing claim is **not** yet
backed end-to-end. But the per-stage measurements are now real numbers.

---

## Criterion sample for `grid_generation/packed_u128_alias`

```json
{
  "mean": {
    "confidence_interval": { "confidence_level": 0.95, "lower_bound": 162.94, "upper_bound": 167.39 },
    "point_estimate": 165.15,
    "standard_error": 1.13
  },
  "median": { "point_estimate": 164.31 },
  "std_dev": { "point_estimate": 11.27 }
}
```

(See the actual `*.estimates.json` files for full precision.)
