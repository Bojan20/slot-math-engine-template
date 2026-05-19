# RNG Quality — PractRand 4 GiB (2³² bytes) Audit Capture

**Generated:** 2026-05-19  ·  **Tool:** PractRand v0.96 (arm64 patched, `RNG_test stdin`)  ·  **Sample:** 4 GiB per backend  ·  **Driver:** `scripts/practrand-fullsuite-run.sh` (5 parallel)

## Verdict matrix

| Backend          | Result                          | Wall time | Verdict file |
|------------------|---------------------------------|-----------|--------------|
| `mulberry32`     | ❌ FAIL @ 2³⁰ bytes (FPF/16:all p=1.7e-18) | aborted   | [`mulberry32-practrand-4GB.verdict`](./mulberry32-practrand-4GB.verdict) |
| `pcg64`          | ✅ PASS — 2 unusual events (within α-noise) | 194 s     | [`pcg64-practrand-4GB.verdict`](./pcg64-practrand-4GB.verdict) |
| `xoshiro256ss`   | ✅ PASS — 0 anomalies                          | 171 s     | [`xoshiro256ss-practrand-4GB.verdict`](./xoshiro256ss-practrand-4GB.verdict) |
| `philox4x32`     | ✅ PASS — 3 unusual events (within α-noise)    | 396 s     | [`philox4x32-practrand-4GB.verdict`](./philox4x32-practrand-4GB.verdict) |
| `chacha20`       | ✅ PASS — 0 anomalies                          | 113 s     | [`chacha20-practrand-4GB.verdict`](./chacha20-practrand-4GB.verdict) |

**Production-grade backends:** 4 / 4 PASS at 4 GiB. `mulberry32` fails as
expected per `docs/rng.md` — 32-bit period of 2³² distinct outputs is
saturated at ~1 GiB byte volume (each call yields 4 bytes), and PractRand's
FPF-class tests detect the resulting first-passage-frequency artefacts.
`mulberry32` is retained ONLY for the TS↔Rust byte-for-byte parity test
(`scripts/cross-platform-rng-parity.mjs`); it is **never** the live RNG
for production game evaluation.

## Comparison vs the W217 1 GiB sanity capture

| Backend          | 1 GiB (W217 `PRACTRAND_1GB_SANITY.md`) | 4 GiB (this capture) |
|------------------|-----------------------------------------|----------------------|
| `mulberry32`     | ❌ 1 FAIL                               | ❌ FAIL (deeper)     |
| `pcg64`          | ✅ 1 unusual                            | ✅ 2 unusual         |
| `xoshiro256ss`   | ✅ 0 anomalies                          | ✅ 0 anomalies       |
| `philox4x32`     | ✅ 1 unusual                            | ✅ 3 unusual         |
| `chacha20`       | ✅ 0 anomalies                          | ✅ 0 anomalies       |

Unusual-event count grows roughly linearly with sample size — that's
expected statistical noise at α = 0.005 with PractRand's ~230 sub-tests.
Going from 1 GiB to 4 GiB ≈ 4× the chance of seeing an unusual flag on a
*good* stream. None of the production backends has produced a single FAIL
event in either capture.

## What's next

| Stage        | Status      | Bytes (target)    | Wall time (est, M3 Pro) |
|--------------|-------------|-------------------|--------------------------|
| W217 sanity  | ✅ landed   | 2³⁰ (1 GiB)       | ~80 s per backend (parallel) |
| **W218 audit** (this) | ✅ landed | 2³² (4 GiB)       | ~3-7 min per backend (parallel) |
| Intermediate | ⏳ optional | 2³⁶ (64 GiB)      | ~1-2 hours per backend (parallel) |
| Submission   | ⏳ deferred | 2³⁸ (256 GiB)     | ~6-10 hours per backend |

The 2³⁸ submission run is operator-initiated per Faza 7.2; runbook is in
[`HOWTO-fullsuite.md`](./HOWTO-fullsuite.md). Combined with the W216 NIST
SP 800-22 full battery (5/5 backends 188/188 sub-tests) and the W217 1 GiB
sanity capture, this 4 GiB checkpoint demonstrates that the four production
backends clear PractRand at a scale 4× beyond casual sanity-checking, well
into audit-grade territory.

## Reproduction

```bash
# Prerequisites:
# - PractRand 0.96 built from source (apply arm64 #include patch — see
#   reports/rng/HOWTO-fullsuite.md). Bin at /tmp/practrand/PractRand/RNG_test.
# - `npm run build` has run (dist/ populated for --dump).

cd ~/Projects/slot-math-engine-template
PRACTRAND_DIR=/tmp/practrand/PractRand \
BYTES_PER=4294967296 \
bash scripts/practrand-fullsuite-run.sh
```
