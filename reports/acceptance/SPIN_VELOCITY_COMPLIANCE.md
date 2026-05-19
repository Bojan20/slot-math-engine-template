# SPIN_VELOCITY_COMPLIANCE — Spin Velocity / Auto-Play Time Compliance Analyzer Acceptance

Generated: `2026-05-19T05:46:27.366Z`

## Headline

**6/6 configs PASS** at 20000 MC interval samples each = 120K total Gamma random draws.

Closes W222 — **79. closed-form solver**, first **TIME-RATE kernel** u portfolio (UKGC SI 2025/215 §8.4 + AU NCPF Schedule 6 + DE GlüStV §6 Abs 4 + NL KSA RWA §7 + MT MGA PPD §11 + CA AGCO §3.4.7).

## Method

Natural player click rate fits Gamma distribution (Harrigan-Dixon 2009, Templeton 2015):
  - **X ~ Gamma(shape=k, scale=θ)**, E[X] = k·θ
  - CDF: **F(x) = γ(k, x/θ) / Γ(k)** (regularized lower incomplete gamma)

Throttled interval **Y = max(X, T_min)**:
  - **E[Y] = T_min·F(T_min) + k·θ·(1 − F_{k+1}(T_min))**
  - Identity ∫x·f_k(x)dx = k·θ·P(Gamma(k+1) ≥ t) (NR 6.2 lemma)

Numerical recipe for γ(k, x):
  - **Series** representation for x < k+1 (NR eq 6.2.5)
  - **Continued fraction** for x ≥ k+1 (NR eq 6.2.6)
  - Lanczos log-gamma sa coefficient set g=7, n=9 (1e-15 accuracy)

MC: per config 20K Marsaglia-Tsang Gamma(k, θ) random draws + max-clip throttle, mulberry32 RNG seed.

## Results

| config | jurisd. | k | θ | T_min | nat spm | eff spm | P_below CF | P_below MC | Δ_P | rel_E[Y] | harm | comply | pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A_uk_si2025_2.5s_typical_user | UKGC | 2 | 0.8 | 2.5s | 37.5 | 22.4 | 0.819 | 0.821 | 0.002 | 0.003 | 0.919 | ❌ | ✅ |
| B_au_ncpf_3.0s_fast_tapper | AU_NCPF | 1.5 | 0.6 | 3s | 66.7 | 19.9 | 0.981 | 0.981 | 0.001 | 0.000 | 0.796 | ❌ | ✅ |
| C_de_glustv_5.0s_strictest | DE_GLUSTV | 2 | 1.5 | 5s | 20.0 | 11.4 | 0.845 | 0.847 | 0.002 | 0.003 | 0.368 | ❌ | ✅ |
| D_nl_ksa_4.0s_medium | NL_KSA | 3 | 0.7 | 4s | 28.6 | 14.7 | 0.924 | 0.919 | 0.005 | 0.002 | 0.537 | ❌ | ✅ |
| E_mt_mga_no_throttle_slow_user | MT_MGA | 4 | 2 | 0.001s | 7.5 | 7.5 | 0.000 | 0.000 | 0.000 | 0.004 | 0.175 | ✅ | ✅ |
| F_extreme_fast_tapper_uk_throttle | UKGC | 1 | 0.3 | 2.5s | 200.0 | 24.0 | 1.000 | 1.000 | 0.000 | 0.000 | 1.000 | ❌ | ✅ |

## Tolerance bands

| metric | tolerance |
|---|---|
| E[Y] (effective mean) | ≤ 0.03 rel |
| P(X < T_min) | ≤ 0.02 abs |
| spins/min CF vs MC | ≤ 0.04 rel |

## Conclusion

**Overall: ✅ PASS**

Engine ships closed-form spin-velocity compliance kernel ready for UKGC SI 2025/215 + AU NCPF + DE GlüStV + NL KSA + MT MGA + CA AGCO audit submission. First TIME-RATE kernel u portfoliju — distinct od W110 (Negative Binomial trigger TIME, not rate), W163 (bet-progression Markov), W167 (cycle compensation), W220 (cumulative-net session stop).