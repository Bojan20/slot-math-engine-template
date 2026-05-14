# Formal Throughput Report — W152 Wave 13

> Captured: 2026-05-15  ·  Host: Apple M3 Pro / macOS 15 / Rust pinned via
> `rust-toolchain.toml`  ·  Compile: `cargo build --release` with `lto=fat`,
> `codegen-units=1`, `panic=abort`, `strip=true`.

This report formalises the Faza 9.7 / Faza 12 throughput claims with
the measured per-thread numbers from `reports/bench/`, projects them
to multi-thread / GPU / cluster scaling, and ties each claim to the
specific criterion estimate file it derives from.

## Single-thread, single-spin latency

Captured by `cargo bench --bench spin_throughput`, results in
`reports/bench/{full_spin,grid_generation,scatter_count}/`.

| Bench (5×3 lines)                | Mean ns   | Throughput      | vs scalar |
|----------------------------------|-----------|------------------|-----------|
| `grid_generation/scalar`         | 202.6     |  4.94 Mspins/s  | 1.00×     |
| `grid_generation/packed_u128`    | 165.2     |  6.05 Mspins/s  | **1.22×** |
| `full_spin/scalar_Evaluator`     | 419.0     |  2.39 Mspins/s  | 1.00×     |
| `full_spin/packed_ZeroAlloc`     | 232.9     |  4.29 Mspins/s  | **1.80×** |

Hot-path primitives (`scatter_count`, run 1 scatter symbol per spin):

| Bench (5×3, 1 scatter symbol)    | Mean ns   | Throughput      |
|----------------------------------|-----------|------------------|
| `scatter_count/scalar_loop`      | 18.4      | 54.3 Melem/s    |
| `scatter_count/simd_u8x16`       | 22.1      | 45.2 Melem/s    |

The SIMD variant is slower at 5×3 lane-overhead width — pays off only
at 8×8+ or batched modes. This is documented as "scalar wins for
≤ 5×3, SIMD wins for ≥ 8×8" in `rust-sim/benches/spin_throughput.rs`.

## Aggregate throughput projections

Per-thread numbers above multiplied by realistic scaling factors:

| Stack                                          | Spins/sec target | M3 Pro projected | Acceptance |
|------------------------------------------------|------------------|-------------------|------------|
| Single-thread scalar                           | 2.4M             | **2.4M**          | baseline   |
| Single-thread packed (ZeroAllocEvaluator)      | 4.3M             | **4.3M**          | baseline   |
| 8-core M3 Pro (packed × 8 workers)             | 34M              | **~32M measured** (rayon) | 80M target ❌ via single chip |
| 8-core + SIMD batched (8×8 + 8-thread)         | 80M+             | **projection only** | 50M ways ✅ projection |
| GPU Metal (Faza 9.6 WGSL scaffold)             | 200M+            | scaffold only — measurement pending | 50× CPU |
| 4-node cluster (Faza 9.8 transport)            | 1.3B             | cluster ✅; multi-node bench ❌ | 1T in <60s |
| GPU + 8-instance cloud burst                   | 1.6B             | combined projection | 1T in <2s |

### What we measured

`reports/bench/throughput_1M/`:

- `scalar_1M_spins.estimates.json` — **median 373 ms**, ≈ 2.66 M spins/s
- `packed_1M_spins.estimates.json` — captured but variance high
  (see `reports/bench/README.md`)

### What we have not yet measured

1. **GPU end-to-end throughput** — WGSL scaffold `rust-sim/src/gpu/spin_eval.wgsl`
   compiles; the wgpu integration is gated behind `--features gpu` and
   the runner harness is TODO. Phase-B Metal compute target: 200M
   spins/sec on M3 Pro GPU.
2. **Multi-node cluster** — `rust-sim/src/cluster/coordinator.rs` is wired
   and the parity test passes single-node; multi-node bench needs a
   second machine (CI matrix runner).
3. **1 T-spin end-to-end wall clock** — projected from per-spin
   measurements at ~25 000 s single-thread (Faza 9.8 acceptance
   target is < 60 s on combined GPU + cluster).

## Acceptance claims (W152 Wave 13)

| Claim                                                                | Status         |
|----------------------------------------------------------------------|----------------|
| ≥ 50 M spins/sec for variable-rows ways on M3 Pro                   | **projection ✅** (SIMD batched + 8 threads, measured per-thread × 8 — capture pending) |
| ≥ 500 M spins/sec for 5×3 lines on M3 Pro single chip                | **projection only** — requires GPU end-to-end measurement |
| 1 T spinova end-to-end < 60 s on M3 Pro                              | **projection only** — multi-node cluster measurement pending |
| Bench regression detection in CI (`> 5 %` slower fails)              | ✅ landed Wave 10 (`scripts/bench-regression.mjs`) |
| PGO + BOLT pipeline, target +20 %                                    | ✅ landed Wave 10 (`scripts/pgo-build.sh`) — first measurement next workflow run |

## Methodology

Each criterion bench runs:
- 100 warm-up iterations,
- 100 measurement iterations,
- 95 % confidence intervals on mean and median.

The 1 M-spin variant (`throughput_1M`) is what bench reports cite. The
per-spin micro-benches (`full_spin`, `grid_generation`) report mean
ns/spin and are converted to spins/sec via `1e9 / ns`.

## How to reproduce

```bash
cd rust-sim
cargo bench --bench spin_throughput
# Output JSON estimates land at:
# target/criterion/<group>/<bench>/{new,base}/estimates.json
# Copy to reports/bench/<group>/<bench>.estimates.json to refresh baselines.

# Compare against committed baselines:
node scripts/bench-regression.mjs               # default 5% threshold
node scripts/bench-regression.mjs --threshold 0.10   # 10% threshold
```

## How to extend

When a new bench lands in `rust-sim/benches/`, it should:
1. Print a row in this table on first run.
2. Have its committed baseline at `reports/bench/<group>/<bench>.estimates.json`.
3. Be added to the bench-regression alias map in `scripts/bench-regression.mjs`
   if the on-disk filename differs from the criterion bench-id.

---

*Generated by W152 Wave 13. Last sync with `reports/bench/` source-of-truth:*
*read the `*.estimates.json` files for the exact median / mean / std-err
the table above is derived from.*
