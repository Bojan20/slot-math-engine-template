# 1T spins/sec E2E Acceptance Timing — Faza 9.8

> Captured: W152 Wave 26 · Host: Apple M3 Pro / macOS 15 / Rust pinned
> via `rust-toolchain.toml` (1.83.0) · Build: `cargo bench --release`,
> profile inherits release (lto=fat, codegen-units=1, panic=abort).

## Master TODO claim under test

> **9.8 1T spinova/sec** — bulk dispatcher
>
> **Acceptance:**
> * CPU single-machine: ≤ 60 s for 1 T spins (M3/M4 stretch)
> * 4× M3 Ultra cluster: ≤ 15 s for 1 T
> * GPU + 8-instance cloud burst: ≤ 2 s for 1 T

Before this report: dispatcher implemented, bench harness landed, no
captured "what does THIS host actually do" numbers. This report ties
the bench to a concrete delta against each acceptance band.

## Measured numbers — single M3 Pro

Captured via `cargo bench --bench bulk_throughput`. Criterion bench
result + an independent timing marker:

| Bench                          | Mean      | Throughput     |
|--------------------------------|----------:|-----------------|
| `faza98_bulk_cpu/10M_spins`    | 222.76 ms | 44.89 M spins/s |

Independent timer (printed to stderr alongside criterion stats):

```
────────────────────────────────────────────────────────
 Faza 9.8 — 1T acceptance projection (CPU release build)
────────────────────────────────────────────────────────
 Sample size       : 5 000 000 spins
 Sample wall-clock : 0.183 s
 Throughput        : 2.74e7 spins/s
 Projected 1T time : 36 522 s (608.70 min ≈ 10 h)
 Acceptance target : ≤ 60 s  → needs SIMD/GPU/cluster (9.8b)
────────────────────────────────────────────────────────
```

The two numbers differ because criterion warms the workers + caches
across iterations (lands on the 44.89 M/s peak), whereas the
independent timer measures a cold one-shot run (lands at 27.4 M/s
fresh-spawn including dispatcher setup). The honest envelope is
**27–45 M spins/sec on a single M3 Pro depending on cache warmth**.

## Acceptance verdict — per band

| Stack                                | Target 1T runtime | M3 Pro actual / projection | Verdict |
|--------------------------------------|------------------:|---------------------------:|---------|
| Single CPU machine                   | ≤ 60 s            | **22 273 – 36 522 s** (~6-10 h) | ❌ |
| 4× M3 Ultra cluster                  | ≤ 15 s            | projection: ~9 100 s ÷ 4 = 2 275 s | ❌ (cluster not exercised here) |
| GPU + 8-instance cloud burst         | ≤ 2 s             | scaffold only — no run     | ⚠️ |

Single-machine M3 Pro **misses the 60 s gate by ~370–610×**. This is
expected — the 60 s target requires aggregate scaling across SIMD,
multi-thread, AND GPU/cluster offload. The dispatcher's per-thread
throughput (~4 M spins/s × 8 cores ≈ 32 M aggregate measured) is
consistent with what the THROUGHPUT.md projection table predicts.

## Where the gap lives

The 1T-in-60s acceptance assumes a stack of multipliers:

| Layer                     | Required multiplier on M3 Pro base |
|---------------------------|------------------------------------|
| Single-core ZeroAlloc base| 1.0× — measured 4.18 M spins/s     |
| 8-core multi-thread       | 8× — measured ~32–45 M spins/s     |
| SIMD batched (8-wide)     | 8× — measured 1.65× @ 5×3 (needs 8×8) |
| GPU Metal                 | 50–100× — scaffold only, not measured |
| 8-instance cloud burst    | 8× — config layer only, no run     |

Composite achievable on the test host: **~32 M/s today (multi-thread
only)**. To clear 1T-in-60s = 16 700 M/s, the gap is ~520×, which
breaks down as:

* ~5× from real SIMD utilisation on wider grids
* ~50× from GPU Metal kernel that's currently scaffold-only
* ~2× from cloud burst (or cluster) parallelism

None of these multipliers is fictional; they each have a separate work
item in the master TODO. The integrated assembly is what's missing.

## Reproduction

```bash
cd rust-sim
cargo bench --bench bulk_throughput -- --quick
```

(`--quick` gives stable percentiles in ~30 s; the full run takes ~3
min and produces criterion HTML in `target/criterion/`.)

## Acceptance verdict — overall

**Master TODO 9.8 acceptance: ❌ single-machine 60 s gate unmet.**

Status flip recommended: "⚠️" → "❌ measured ~32 M spins/s aggregate
on M3 Pro vs 16 700 M/s target. GPU + cluster wiring required for ✅
(Wave 28+)". The dispatcher works correctly; the gap is the absent
GPU/cluster integration, NOT a dispatcher defect.

## Honesty note

The numbers above are real measurement. The 1T-in-60s claim is the
correct STRETCH target for the engine — it's a TAM-anchor for the
biz pitch — but it requires the full stack assembled, not just the
single-machine CPU path. Pretending today's M3 Pro hits 1T-in-60s
would be a lie; this report puts honest measurement on the record and
maps the remaining engineering to specific bench bumps.
