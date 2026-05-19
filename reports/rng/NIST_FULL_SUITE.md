# RNG Quality — NIST SP 800-22 Full Suite (LIVE)

**Generated:** 2026-05-19T01:15:18.247Z  ·  **Tool:** NIST sts-2.1.2 (`assess`)  ·  **Bitstream length:** 10⁶ bits  ·  **Bitstreams per backend:** 100  ·  **Total bits per backend:** 10⁸  ·  **α (per-test):** 0.01  ·  **α (uniformity p-value):** 1e-4

This is the **audit-grade** NIST SP 800-22 capture — full 15-test battery, official NIST `assess` binary, 100 × 10⁶-bit bitstreams per backend (matching the regulator-recommended sample size). The lightweight 5-test Node baseline in [`INDEX.md`](./INDEX.md) stays always-on in CI; this artefact is the **submission** copy.

## Acceptance bar

- Each of the 188 sub-tests (15 named tests, several with multiple sub-variants — NonOverlappingTemplate × 148, RandomExcursions × 8, RandomExcursionsVariant × 18, CumulativeSums × 2, Serial × 2) is judged against:
   - **Proportion** ≥ 0.99 − 3·√(0.99·0.01/100) ≈ **0.960** (passing sequences / total)
   - **Uniformity p-value** > 1e-4 (χ² over 10-bucket histogram of per-bitstream p-values)
- A backend passes the **submission bar** iff **all 188 sub-tests pass** both criteria. Production default `pcg64` MUST clear this every release.

## Backend summary

| Backend          | Verdict | Passed | Failed (prop) | Failed (uniformity) | Failed (both) | Artefact |
|------------------|---------|--------|---------------|---------------------|----------------|----------|
| `mulberry32` | ✅ PASS | 188/188 | 0 | 0 | 0 | [`mulberry32-nist-full.json`](./mulberry32-nist-full.json) · [`mulberry32-nist-full.txt`](./mulberry32-nist-full.txt) |
| `pcg64` | ✅ PASS | 188/188 | 0 | 0 | 0 | [`pcg64-nist-full.json`](./pcg64-nist-full.json) · [`pcg64-nist-full.txt`](./pcg64-nist-full.txt) |
| `xoshiro256ss` | ✅ PASS | 184/184 | 0 | 0 | 0 | [`xoshiro256ss-nist-full.json`](./xoshiro256ss-nist-full.json) · [`xoshiro256ss-nist-full.txt`](./xoshiro256ss-nist-full.txt) |
| `philox4x32` | ✅ PASS | 188/188 | 0 | 0 | 0 | [`philox4x32-nist-full.json`](./philox4x32-nist-full.json) · [`philox4x32-nist-full.txt`](./philox4x32-nist-full.txt) |
| `chacha20` | ✅ PASS | 188/188 | 0 | 0 | 0 | [`chacha20-nist-full.json`](./chacha20-nist-full.json) · [`chacha20-nist-full.txt`](./chacha20-nist-full.txt) |

## Per-test breakdown (named test → pass count across backends)

| Test                       | `mulberry32` | `pcg64` | `xoshiro256ss` | `philox4x32` | `chacha20` |
|----------------------------|-----------------|-----------------|-----------------|-----------------|-----------------|
| Frequency                  | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 |
| BlockFrequency             | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 |
| CumulativeSums             | ✅ 2/2 | ✅ 2/2 | ✅ 2/2 | ✅ 2/2 | ✅ 2/2 |
| Runs                       | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 |
| LongestRun                 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 |
| Rank                       | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 |
| FFT                        | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 |
| NonOverlappingTemplate     | ✅ 148/148 | ✅ 148/148 | ✅ 144/144 | ✅ 148/148 | ✅ 148/148 |
| OverlappingTemplate        | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 |
| Universal                  | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 |
| ApproximateEntropy         | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 |
| RandomExcursions           | ✅ 8/8 | ✅ 8/8 | ✅ 8/8 | ✅ 8/8 | ✅ 8/8 |
| RandomExcursionsVariant    | ✅ 18/18 | ✅ 18/18 | ✅ 18/18 | ✅ 18/18 | ✅ 18/18 |
| Serial                     | ✅ 2/2 | ✅ 2/2 | ✅ 2/2 | ✅ 2/2 | ✅ 2/2 |
| LinearComplexity           | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 |

## How to reproduce

```bash
# 1. Build NIST sts-2.1.2 (one-time):
#    curl -sL -o sts.zip https://csrc.nist.gov/CSRC/media/Projects/Random-Bit-Generation/documents/sts-2_1_2.zip
#    unzip sts.zip && cd sts-2.1.2/sts-2.1.2 && make
#    export STS_DIR=$(pwd)

npm run build                              # populate dist/ for --dump
bash scripts/nist-fullsuite-run.sh         # generate streams + run assess × 5
node scripts/nist-fullsuite-index.mjs      # regenerate this aggregate
```

## Notes on `mulberry32`

`mulberry32` is **only retained** for TS↔Rust byte-for-byte parity tests (`scripts/cross-platform-rng-parity.mjs`). It is a 32-bit splitmix-style PRNG and is **permitted** to fail individual NIST sub-tests at the submission threshold; it is **never** configured as the live RNG for a production game. The policy is documented in [`docs/rng.md`](../../docs/rng.md).
