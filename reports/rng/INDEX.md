# RNG Quality — NIST SP 800-22 Baseline

**Generated:** 2026-05-19T01:15:18.463Z  ·  **Sample:** 1.0 Mbit per backend  ·  **Seed:** `0xCAFEBABE_DEADBEEF (XOR-mixed → 0x14530451)`  ·  **Pass bar:** p > 0.01 (NIST default α)

## Scope

This baseline implements 5 of the 15 NIST SP 800-22 tests directly in Node.js so the engine can produce a quality report without external tooling. The five chosen are the most foundational and catch first-order quality defects — any backend failing one of these is unfit for live deployment, full stop.

**Full-suite escalation** (TestU01 BigCrush, full NIST 15, PractRand 2³⁸-byte streaming) is documented in [HOWTO-fullsuite.md](./HOWTO-fullsuite.md) — CI operators run those once the matching binaries are installed.

## Results

| Backend | Overall | Monobit | BlockFreq | Runs | LongestRun | CuSumFwd |
|---------|---------|---------|-----------|------|------------|----------|
| `mulberry32` | ✅ 5/5 | ✅ 0.984 | ✅ 0.113 | ✅ 0.454 | ✅ 0.646 | ✅ 0.722 |
| `pcg64` | ✅ 5/5 | ✅ 0.396 | ✅ 0.554 | ✅ 0.214 | ✅ 0.918 | ✅ 0.322 |
| `xoshiro256ss` | ✅ 5/5 | ✅ 0.683 | ✅ 0.803 | ✅ 0.882 | ✅ 0.547 | ✅ 0.812 |
| `philox4x32` | ✅ 5/5 | ✅ 0.481 | ✅ 0.836 | ✅ 0.748 | ✅ 0.602 | ✅ 0.775 |
| `chacha20` | ✅ 5/5 | ✅ 0.194 | ✅ 0.063 | ✅ 0.646 | ✅ 0.524 | ✅ 0.282 |

## Per-backend JSON

- [`mulberry32-nist-baseline.json`](./mulberry32-nist-baseline.json)
- [`pcg64-nist-baseline.json`](./pcg64-nist-baseline.json)
- [`xoshiro256ss-nist-baseline.json`](./xoshiro256ss-nist-baseline.json)
- [`philox4x32-nist-baseline.json`](./philox4x32-nist-baseline.json)
- [`chacha20-nist-baseline.json`](./chacha20-nist-baseline.json)

## Acceptance

- **Production default (`pcg64`)** MUST pass all 5 tests every release or the build fails. Tracked in CI.
- **`mulberry32`** is permitted to fail one or more tests — it exists only for TS↔Rust byte-for-byte parity (see `docs/rng.md`). It must never be the default for a live config.
- `xoshiro256ss` and `philox4x32` are held to the same bar as `pcg64`.

## Reproduction

```bash
npm run build
node scripts/rng-quality.mjs
# OR:
npm run rng-quality
```
