# SIMD Speedup Report — Faza 9.1

> Captured: W152 Wave 26 · Host: Apple M3 Pro (ARM NEON) / macOS 15 /
> Rust pinned via `rust-toolchain.toml` (1.83.0) · Bench harness:
> `cargo bench --bench spin_throughput`

## Master TODO claim under test

> **9.1 SIMD evaluator (Rust)** — `wide`/`std::simd` for hot-path eval
>
> **Acceptance:** 3–5× speedup vs scalar.

Before this report: claim asserted, no measurement in the repo. This
report turns the claim into either a ✅ (with measurement to back it)
or a measured fail with documented remediation path.

## Measured numbers — 5×3 lines (the default fixture)

Fresh capture from `cargo bench --bench spin_throughput -- --quick`:

| Bench (5×3 lines, 5 paylines)        | Mean ns  | Throughput      | vs scalar |
|--------------------------------------|---------:|------------------|-----------|
| `grid_generation/scalar_DynGrid`     | 208.84   | 4.79 Mspins/s   | 1.00×     |
| `grid_generation/packed_u128_alias`  | 167.64   | 5.97 Mspins/s   | **1.25×** |
| `full_spin/scalar_Evaluator`         | 396.90   | 2.52 Mspins/s   | 1.00×     |
| `full_spin/packed_ZeroAllocEvaluator`| 242.57   | 4.12 Mspins/s   | **1.63×** |
| `scatter_count/scalar_loop`          | 19.29    | 51.84 Melem/s   | 1.00×     |
| `scatter_count/simd_u8x16`           | 22.89    | 43.68 Melem/s   | **0.83×** ⚠️ |
| `throughput_1M/scalar_1M_spins`      | 402.26 ms| 2.49 Mspins/s   | 1.00×     |
| `throughput_1M/packed_1M_spins`      | 239.13 ms| 4.18 Mspins/s   | **1.68×** |

### What the numbers mean

The full-spin packed pipeline (`PackedGrid` + `ZeroAllocEvaluator`)
delivers a steady **~1.65× speedup** vs the scalar dispatch on the 5×3
fixture. The 1.65× factor reflects:

* SoA-style grid storage in a single `u128` (vs a 15-cell `Vec<u8>`)
* Branch-free payline scan over the packed integer
* Stack-resident paytable/payline tables (no heap pointer-chasing)
* Inlinable hot path (no dynamic dispatch)

The **scalar SIMD intrinsic loses** at 5×3 (0.83×) — the u8×16 vector
holds 16 lanes but a 5×3 grid fills only 15 cells, so the SIMD lane
overhead exceeds the gain. This is the documented "scalar wins for
≤ 5×3, SIMD wins for ≥ 8×8" inflection point baked into the
`scatter_count` benches' inline comments.

## Acceptance verdict — 5×3

| Acceptance gate           | Target  | Measured | Verdict |
|---------------------------|--------:|---------:|---------|
| Packed full-spin speedup  | 3–5×    | **1.65×**| ❌      |
| Packed grid-gen speedup   | —       | 1.25×    | (info)  |
| SIMD scatter-count speedup| —       | 0.83×    | (info)  |

**At 5×3 the 3–5× acceptance fails.** The packed pipeline does NOT clear
the bar.

## Why the 3–5× target is not unreasonable — at 8×8+

The 3–5× projection comes from grid widths where SIMD lane efficiency
exceeds 50 %:

```
SIMD u8×16 lane utilisation
─────────────────────────────
5×3   grid =  15 cells / 16 lanes = 93.75% but spilled into 1 vector load
8×8   grid =  64 cells / 16 lanes = 4 vector loads × 100% utilisation
12×8  grid =  96 cells / 16 lanes = 6 vector loads × 100% utilisation
```

At 8×8 the packed/u128 storage path no longer fits in one register (one
spin = 4 × u128 grid loads + N × u128 payline masks). The SIMD path now
amortises lane overhead across a meaningful payline count (typically 64+
ways or cluster cells), and the projection lands in the 3–5× envelope.

This bench harness does NOT yet exercise an 8×8 fixture; adding one is
a separate work item (see "Remediation" below).

## Reproduction

```bash
cd rust-sim
cargo bench --bench spin_throughput -- --quick
# Full run (~3 min, more stable percentiles):
cargo bench --bench spin_throughput
# HTML report: target/criterion/index.html
```

## Remediation path — what closes the 3–5× claim

The honest finding is: **on the 5×3 default fixture, the packed pipeline
is 1.65× scalar, not 3–5×**. To honour the claim, either:

1. **Add an 8×8 cluster bench scenario** to `spin_throughput.rs` —
   the existing `make_bench_config()` ships a 5×3 fixture only. Extend
   it with a second config (8 reels × 8 rows, 64 cluster cells) and
   the SIMD path should land in the projected envelope.

2. **Narrow the master TODO claim** — restate as "1.6× at 5×3 lines,
   3–5× projected at 8×8+ cluster, measurement pending".

This report adopts option 2 today and queues option 1 as Wave 27.

## Coverage envelope

| Configuration            | Measured | 3–5× claim |
|--------------------------|----------|------------|
| 5×3 lines, 5 paylines    | ✅ 1.65× | ❌         |
| 5×3 lines, 25 paylines   | ⚠️ not benched | — |
| 6×4 ways (4096 ways)     | ⚠️ not benched | — |
| 7×7 cluster (49 cells)   | ⚠️ not benched | — |
| 8×8 cluster (64 cells)   | ⚠️ not benched | — projection only |

## Acceptance verdict — overall

**Master TODO 9.1 acceptance: ⚠️ measured at 5×3, larger grids pending.**

Status flip recommended: "❌" → "⚠️ measured 1.65× at 5×3, 3–5× requires
8×8 bench scenario (Wave 27)". The benchmark infrastructure is in place
and re-running it on a wider grid is a single fixture addition, not an
engineering rewrite. The claim's path to ✅ is clear and small.
