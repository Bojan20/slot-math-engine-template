# Faza 14.1 — 10⁹ Spins Single-Thread Replay

Generated: 2026-05-15T19:03:07.716Z

## Acceptance

Master TODO §14.1: **"5×3 lines igra → 10⁹ spinova replay u 1 sekundi single thread"**.

Implementation: `AnalyticalEngine.buildTable(ir)` enumerates every grid configuration in the strip-mode IR and memoises its exact payout under the uniform-position distribution. A "replay" is therefore an O(1) lookup against that table — no RNG sampling of symbols, no payline scan, no feature evaluation. This is the exact primitive a demo / re-audit runtime would expose.

## Result

**❌ GAP** — 1,000,000,000 replays in **15764.56 ms** (target ≤ 1000 ms).

* Throughput: `6.343e+7` spins/s
* Per-spin: `15.76` ns
* Build cost (one-time): `96575.26` ms
* Empirical replay RTP: `319.3269%`
* Analytical RTP (exact): `319.3074%`

## Fixture

`5x3-20lines.json` — 5×3, 20 paylines, 14,348,907 total reel-position states, 759,375 unique post-evaluation grid hashes.

## Host

* Node: `v25.2.1`
* Platform: `darwin/arm64`

## Reproducer

```
npm run build && node scripts/billion-spins-replay.mjs
```

## Gap Analysis (honest fail)

Measured `15764.56` ms vs. `1000` ms target. Closing the gap on Node:
* Drop the Float64Array indirection in favour of a typed-array bump-allocated payout view (current loop already uses `Float64Array`).
* Replace `Math.floor(rng() * len)` with a 32-bit bias-corrected bound (Lemire) inline.
* Move the hot loop to a Wasm export — the Rust `analytical_engine` crate already memoises into a `Vec<f64>`; binding via `wasm-bindgen` keeps the call sub-ns.
* Drop runtime to Rust: `rust-sim` already has `AnalyticalEngine`-equivalent code paths; a `cargo bench` companion is the obvious next step (**landed Wave 28** — see below).

## Wave 28 update — Rust closure (single thread)

`rust-sim/examples/billion_spins_replay.rs` enumerates the same fixture
into a `Vec<f64>` of size `totalStates` and runs the same Mulberry32
lookup loop, this time native:

| Measurement | Node v25.2.1 | Rust 1.80 release |
|---|---|---|
| 10⁹ replays | 15 764.56 ms | **5 428.02 ms** |
| ns/spin | 15.76 | **5.43** |
| spins/sec | 6.34 × 10⁷ | **1.84 × 10⁸** |
| empirical RTP | 319.327 % | 319.327 % (4-decimal match) |

Rust closure is **2.9× faster** than Node, but still **5.43× over the 1 s
budget** on this fixture. The bottleneck is L3 cache pressure: the
`Vec<f64>` is 109.5 MiB (14.3 M × 8 B), and a uniform-index loop walks
random cache lines — every spin pays roughly one main-memory miss.

Closing the remaining 5.43× without dropping the "single thread" rule
requires one of:
* **Smaller table** — reduce strip lengths so totalStates fits L2
  (≤ 12 MiB on M-class Apple silicon); typical production strips
  (60-80 stops per reel) wouldn't fit either, so this becomes a
  per-fixture spec rather than a universal claim.
* **SIMD gather** — batch 4-8 RNG indices per iteration and use
  `gather` (AVX-512 on x86, NEON `tbl` is too narrow to help here).
  Wins are workload-dependent; on a 110 MiB table the bottleneck is
  the DRAM bus, not ALU throughput.
* **GPU memo replay** — store the flat table in VRAM and have the GPU
  issue 10⁹ uniform lookups. M-class arm64 has ~200 GB/s shared
  bandwidth; 8 B/spin × 10⁹ = 8 GB to move = ~40 ms compute-only.
  Same shape as the Faza 9.6 GPU parity scaffold; tracking under
  `reports/perf/GPU_PARITY_STATUS.md`.

For the Wave 27/28 boundary, the honest claim is: single-thread JS ≈ 16 ns
optimum, single-thread Rust ≈ 5 ns optimum, "10⁹ in 1 s on single thread"
lives in the SIMD / GPU regime. The acceptance row stays ⚠️ with both
languages' measurements archived for the cert dossier.

### Reproducer (Rust)

```
cargo run --release --example billion_spins_replay -- 1000000000 1000000
```
