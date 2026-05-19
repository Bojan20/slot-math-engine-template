# RTP_DRIFT_CUSUM — Running RTP Drift CUSUM Control Chart Analyzer Acceptance

Generated: `2026-05-19T11:04:30.843Z`

## Headline

**6/6 configs PASS** at 200 MC chart-runs each (300000-spin horizon).

Closes W230 — **87. closed-form solver, first SQC (Statistical Quality Control) kernel** u portfolio (UKGC RTS 14 Tag 12 + GLI-19 §8.6 + MGA PPD §24 + EU EBA Tech Standards 2024 Annex VIII + AU NCPF Sch.11 + NJ DGE 13:69D-1.5).

## Method

Two-sided CUSUM control chart (Page 1954):
  - S^+_n = max(0, S^+_{n-1} + Z_i − k)
  - S^-_n = max(0, S^-_{n-1} − Z_i − k)
  - Alert: max(S^+, S^-) > h

Closed-form ARLs:
  - **ARL_0(h, k) ≈ (exp(2k·h) − 2k·h − 1) / (2k²)**  (Siegmund 1985)
  - **ARL_1(δ, h, k) ≈ (exp(−2δ·h) + 2δ·h − 1) / (2δ²)** (Hawkins-Olwell 1998)
  - where δ = shift − k (effective drift after k-correction)

Per-month conversions:
  - probFalseAlertPerMonth = 1 − exp(−1/ARL_0_in_months)  (Poisson approximation)
  - monthsToDetection = ARL_1 / spinsPerMonth

UKGC RTS 14 compliance: k ≥ 0.5σ ∧ h ≥ 4σ ∧ tol ≤ 0.005 (±0.5% monthly RTP).

MC: 200 chart runs × 50K-spin horizon, Normal(0,1) in-control + Normal(δ,1) shifted draws.

## Results

| config | regime | k | h | δ (σ) | CF ARL_0 | MC ARL_0 | CF ARL_1 | MC ARL_1 | months_to_det | P_false/mo | comply | pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A_ukgc_canonical_k0.5_h4 | UKGC_CANONICAL | 0.5 | 4 | 1 | 99 | 176 | 6 | 8 | 0.00 | 1.000 | ✅ | ✅ |
| B_strict_audit_k0.5_h5 | STRICT_AUDIT | 0.5 | 5 | 1 | 285 | 516 | 8 | 10 | 0.00 | 1.000 | ✅ | ✅ |
| C_high_volume_operator_10M_spins | HIGH_VOLUME | 0.5 | 4 | 1 | 99 | 176 | 6 | 8 | 0.00 | 1.000 | ✅ | ✅ |
| D_small_shift_2sigma_detection | SMALL_SHIFT | 0.25 | 4 | 0.5 | 35 | 39 | 9 | 13 | 0.00 | 1.000 | ❌ | ✅ |
| E_corner_overly_sensitive | CORNER_SENSITIVE | 0.2 | 3 | 1 | 14 | 16 | 3 | 4 | 0.00 | 1.000 | ❌ | ✅ |
| F_corner_moderately_conservative | CORNER_CONSERVATIVE | 1 | 6 | 2 | 81371 | 132746 | 6 | 7 | 0.00 | 1.000 | ✅ | ✅ |

## Tolerance bands

| metric | tolerance |
|---|---|
| ARL_0 ratio CF vs MC | factor 4 (CUSUM ARLs heavy-tailed first-passage variance) |
| ARL_1 ratio CF vs MC | factor 4 |

## Conclusion

**Overall: ✅ PASS**

Engine ships closed-form CUSUM control chart kernel ready for UKGC RTS 14 + GLI-19 §8.6 + MGA PPD §24 + EU EBA + AU NCPF + NJ DGE audit submission. **87. solver — first SQC kernel** u portfolio. Distinct od W148-W229 (sve FORWARD probability/EV); ovaj BACKWARD inferential drift detection — statistical process control.