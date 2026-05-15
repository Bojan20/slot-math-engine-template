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
* Drop runtime to Rust: `rust-sim` already has `AnalyticalEngine`-equivalent code paths; a `cargo bench` companion is the obvious next step (queued Wave 28).
