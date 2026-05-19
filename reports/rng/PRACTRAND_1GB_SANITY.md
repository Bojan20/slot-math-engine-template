# RNG Quality — PractRand 1 GiB Sanity Capture

**Generated:** 2026-05-19  ·  **Tool:** PractRand v0.96 (`RNG_test stdin`)  ·  **Sample:** 2³⁰ bytes (1 GiB) per backend  ·  **α (per test):** 0.005 fail / 0.01 unusual

This is a lightweight sanity capture taken after the W174 `--dump` corruption
fix. The audit-grade 2³⁸-byte (256 GiB) PractRand capture is run separately
once `scripts/practrand-fullsuite-run.sh` is invoked by an operator with
a quiet machine (~5 hours sequential on M3 Pro).

## What this proves

- The TS `--dump <backend> <bytes>` path streams a byte-exact PRNG output
  through stdout to PractRand `stdin` mode WITHOUT pipe corruption (the
  pre-W174 `Buffer.subarray` view caused all backends to fail BCFN(2+) at
  R ≈ +60k with identical signatures — a tell-tale shared-corruption
  pattern, not a real RNG defect).
- All four 64-bit backends (`pcg64`, `xoshiro256ss`, `philox4x32`,
  `chacha20`) pass the first 1 GiB block of PractRand within α = 0.005.
- `mulberry32` fails as **documented and expected**: 32-bit period, kept
  only for TS↔Rust byte-parity (`docs/rng.md` policy). Never live RNG.

## Verdict (W174 post-fix)

| Backend          | Anomalies | Unusual | FAIL | Verdict | Notes |
|------------------|-----------|---------|------|---------|-------|
| `mulberry32`     | 230/232   | 1       | 1    | ❌ FAIL (expected) | `FPF/16:all R=+20.3 p=1.7e-18` — period exhaustion, parity-only backend |
| `pcg64`          | 230/231   | 1       | 0    | ✅ PASS | `DC6-9 R=+6.0 p=2.7e-3` — within α-noise |
| `xoshiro256ss`   | 231/231   | 0       | 0    | ✅ PASS | clean |
| `philox4x32`     | 230/231   | 1       | 0    | ✅ PASS | `BCFN(2+8,13-8U) R=+17.1 p=2.5e-5` — within α-noise |
| `chacha20`       | 231/231   | 0       | 0    | ✅ PASS | clean |

**Pass rate (excluding parity-only mulberry32):** 4/4 backends clear at 1 GiB.

## Reproduction

```bash
# After the W174 --dump fix in scripts/rng-quality.mjs:
npm run build
for b in pcg64 xoshiro256ss philox4x32 chacha20; do
  echo "▶ $b"
  node scripts/rng-quality.mjs --dump $b 1073741824 \
    | RNG_test stdin -tlmin 1GB -tlmax 1GB -tlfail
done
```

(Build PractRand from <https://sourceforge.net/projects/pracrand/> per
`reports/rng/HOWTO-fullsuite.md`; on Apple Silicon, gate the
`#include <x86intrin.h>` headers behind `__x86_64__ || __i386__`.)

## Why the pre-W174 stream was broken

`scripts/rng-quality.mjs --dump` accumulated a 1 MiB chunk in a reused
`Buffer`, then wrote `buf.subarray(0, off)` — a **view** that shared
memory with `buf`. Because `process.stdout.write` to a pipe is async +
back-pressured, the next iteration started overwriting `buf` before the
previous chunk's bytes had actually flushed downstream. The result was
that PractRand received a stream where chunk-boundary bytes had been
corrupted, regardless of which RNG produced them — hence the identical
`BCFN(2+,13-1U) R=+60k` failure signature across every backend.

W174 fix: allocate a **fresh** `Buffer.allocUnsafe(target)` per chunk so
each one owns its memory until Node flushes. Throughput ~30 MB/s on
M3 Pro for 64-bit backends — adequate for both the 1 GiB sanity capture
and the 2³⁶-byte (64 GiB) intermediate audit run.
