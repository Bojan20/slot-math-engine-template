# W212 — 1B Spin Benchmark (Hardened)

Generated: 2026-05-18T19:35:45.883Z
Mode: synthetic (CI)
Spins per kernel: 10,000
Total wall: 0.10 s
Host: v25.2.1 on darwin/arm64

## Per-mode aggregate

| Mode | Kernels | Total spins | Wall (s) | Spins/sec | Speedup |
| --- | ---: | ---: | ---: | ---: | ---: |
| node-single | 3/3 | 30,000 | 0.00 | 7.40e+6 | 1.00× |
| node-workers | 3/3 | 30,000 | 0.09 | 3.44e+5 | 0.05× |

## Per-kernel × per-mode

| Kernel | Mode | Spins | Wall (ms) | Spins/sec | p50 (ns) | p95 (ns) | p99 (ns) | p999 (ns) | Hit freq | RTP |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P001-classic-5x3 | node-single | 10,000 | 2.2 | 4.65e+6 | 42 | 84 | 125 | 750 | 0.277 | 0.8843 |
| P001-classic-5x3 | node-workers | 10,000 | 31.1 | 3.22e+5 | 291 | 582 | 3083 | 88624 | 0.272 | 1.2133 |
| P017-megaways | node-single | 10,000 | 1.4 | 7.05e+6 | 42 | 84 | 84 | 291 | 0.225 | 1.0120 |
| P017-megaways | node-workers | 10,000 | 28.8 | 3.47e+5 | 250 | 624 | 1708 | 25959 | 0.234 | 1.8235 |
| P024-cluster-pays | node-single | 10,000 | 0.5 | 2.05e+7 | 1 | 42 | 42 | 42 | 0.299 | 0.7986 |
| P024-cluster-pays | node-workers | 10,000 | 27.3 | 3.67e+5 | 208 | 541 | 874 | 12459 | 0.317 | 0.9898 |

## Memory

- RSS before: 46.9 MiB
- RSS after:  119.8 MiB
- Δ RSS:      72.9 MiB
- Heap used:  7.6 MiB

## Notes

- Speedup is reported vs. `node-single` baseline. Values < 1.0× are honestly surfaced.
- Rust modes invoke `cargo run --release --example billion_spins_replay` as a subprocess; skip with `--skip-rust`.
- Synthetic mode: 100k spins × 10 kernels = 1M total. Full mode: 100M × 10 = 1B total.
