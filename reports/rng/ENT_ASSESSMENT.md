# ENT Entropy Battery — Acceptance Report

> Closes **Kimi K1 partial** (deep-audit 2026-05-15) — ENT in-process battery.
> External TestU01 BigCrush + PractRand 2⁴⁸ + Dieharder remain operator-initiated via `.github/workflows/rng-cert.yml`.
> Generated: `2026-05-29T15:15:54.757Z` · sample: `100,000` bytes/source

## Headline: **6/6 sources PASS all 5 ENT stats** ✅

## Per-Source Results

| Source | Entropy (bits/byte) | χ² p-value | Mean | MC π (% err) | Serial ρ | Overall |
|---|---:|---:|---:|---:|---:|---|
| `mulberry32` | 7.9981 | 0.3450 | 127.22 | 3.15925 (0.562%) | -0.00464 | ✅ |
| `pcg64` | 7.9981 | 0.3740 | 127.49 | 3.15469 (0.417%) | 0.00295 | ✅ |
| `xoshiro256ss` | 7.9981 | 0.3489 | 127.17 | 3.14965 (0.256%) | -0.00357 | ✅ |
| `philox4x32` | 7.9984 | 0.9009 | 127.45 | 3.14509 (0.111%) | -0.00312 | ✅ |
| `chacha20` | 7.9980 | 0.2405 | 127.42 | 3.15565 (0.447%) | 0.00203 | ✅ |
| `hsm-mock-bridge` | 7.9982 | 0.4867 | 127.42 | 3.14125 (0.011%) | 0.00592 | ✅ |

## Per-Source Pass Detail

| Source | H ≥ 7.95 | χ² p ∈ [.01,.99] | \|mean−127.5\| < 1 | \|MC-π err\| < 1% | \|ρ\| < 0.05 |
|---|:-:|:-:|:-:|:-:|:-:|
| `mulberry32` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `pcg64` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `xoshiro256ss` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `philox4x32` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `chacha20` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `hsm-mock-bridge` | ✅ | ✅ | ✅ | ✅ | ✅ |

## What this means

ENT is John Walker's open-source RNG analyzer (1996, last updated 2008). Five statistics:
1. **Shannon entropy** — bits per byte; 8.0 = perfect uniform u8
2. **Chi-square goodness of fit** against uniform u8 (df=255)
3. **Arithmetic mean** — should ≈ 127.5 for uniform u8
4. **Monte Carlo π estimate** — pairs of bytes as (x,y); count in unit circle → π
5. **Lag-1 serial correlation** — autocorrelation; should be ~0 for IID source

Danish Gambling Authority SCP.01.00 (2025) explicitly accepts ENT as a "similar suite
of the same level" alternative to NIST STS. Macau DICJ MGCF v1.0 lists ENT as one of
three accepted batteries. ENT is a regulator-recognized supplement to SP 800-22 and
a permanent fixture in academic RNG-quality literature.

## Combined RNG cert posture (post-Wave 43)

| Battery | Status | Source |
|---|---|---|
| NIST SP 800-22 (5-test subset) | ✅ all 5 backends | `reports/rng/CHI_SQUARED_SIZES.{json,md}` (Wave 27) |
| **ENT (5 stats)** | **✅ Wave 43** | `reports/rng/ENT_ASSESSMENT.{json,md}` |
| SP 800-90B Non-IID + IID | ✅ Wave 39 | `reports/rng/SP_800_90B_ASSESSMENT.{json,md}` |
| TestU01 BigCrush | ⚠️ external runner | `.github/workflows/rng-cert.yml` |
| PractRand 2⁴⁸ | ⚠️ external runner | `.github/workflows/rng-cert.yml` |
| Dieharder | ⚠️ external runner | `.github/workflows/rng-cert.yml` |

Wave 43 closes the **third in-process RNG attestation** (alongside NIST SP 800-22 + SP 800-90B).
Three of six Kimi-cited batteries now landed; remaining three (BigCrush / PractRand / Dieharder)
are operator-initiated external runners requiring 8-12h compute per backend.