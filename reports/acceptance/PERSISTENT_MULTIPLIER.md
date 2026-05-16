# PERSISTENT_MULTIPLIER — Sticky Running Multiplier Acceptance

Generated: `2026-05-16T04:55:03.369Z`

## Headline

**6/6 configs PASS** at 50000 episodes each = 300K total MC.

Closes Faza 4.3 extension: ✅ "Persistent Multiplier Accumulator" (Wave 89).

## Method

Closed-form via Binomial drop chain + linearity + cross-spin covariance:
  - D_n ~ Binomial(n, q): E[D_n] = n·q, Var[D_n] = n·q·(1-q)
  - M_n = m_init + D_n · m_drop
  - E[Y] = μ_W · (K·m_init + q·m_drop · K(K+1)/2)
  - Var[Y] = Σ Var[W_n·M_n] + 2·μ²·m_drop²·q(1-q)·Σ n·(K-n)
  - Tail: P(no drops) = (1-q)^K, P(all drops) = q^K

MC: 50K episodes per config, deterministic mulberry32, exact 2-point base win + Bernoulli drop.

## Configs

| Config | Pass | E[Y]_CF | E[Y]_MC | rel | E[M_K]_CF | E[M_K]_MC | rel |
|---|---|---|---|---|---|---|---|
| A_pragmatic_15fs_q025 | ✅ | 27.000 | 26.978 | 0.08% | 4.750 | 4.751 | 0.02% |
| B_btg_megaways_big_drops | ✅ | 29.760 | 30.118 | 1.20% | 10.600 | 10.652 | 0.49% |
| C_aggressive_short_session | ✅ | 20.000 | 19.950 | 0.25% | 6.000 | 5.997 | 0.05% |
| D_low_drop_rate | ✅ | 9.150 | 9.120 | 0.33% | 2.000 | 1.999 | 0.03% |
| E_guaranteed_drops | ✅ | 32.500 | 32.510 | 0.03% | 11.000 | 11.000 | 0.00% |
| F_no_initial_mult | ✅ | 16.500 | 16.468 | 0.19% | 3.000 | 3.004 | 0.13% |

## Tail metrics (per config)

| Config | E[drops] | P(no drops) | P(all drops) | P(≥half drops) | Var[M_K] |
|---|---|---|---|---|---|
| A_pragmatic_15fs_q025 | 3.75 | 1.3363% | 0.00000009% | 1.73% | 2.813 |
| B_btg_megaways_big_drops | 0.96 | 36.7666% | 0.00000000% | 0.02% | 88.320 |
| C_aggressive_short_session | 2.50 | 3.1250% | 3.12500000% | 50.00% | 5.000 |
| D_low_drop_rate | 1.00 | 35.8486% | 0.00000000% | 0.00% | 0.950 |
| E_guaranteed_drops | 10.00 | 0.0000% | 100.00000000% | 100.00% | 0.000 |
| F_no_initial_mult | 3.00 | 2.8248% | 0.00059049% | 15.03% | 2.100 |

## Compliance context

- **UKGC RTS 14** — variance disclosure for sticky-multiplier features
- **MGA PPD §11.f** — tail-probability disclosure (P(no drops), P(all drops))
- **eCOGRA Generic Slots Audit** — Binomial drop chain auditor-verifiable
- Industry use: Pragmatic (sticky wilds + mult), BTG-Megaways (big-drop multipliers)