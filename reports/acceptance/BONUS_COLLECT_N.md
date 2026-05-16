# BONUS_COLLECT_N — Bonus Collect-N Trigger Tracker Acceptance

Generated: `2026-05-16T07:20:48.459Z`

## Headline

**6/6 configs PASS** at 50000 episodes each = 300K total MC episodes.

Closes Faza 4.6 ext (post-W100): ✅ "Bonus Collect-N Trigger Tracker" (Wave 118).

## Method

Closed-form Negative Binomial NB(N, p):
  - T_N ~ NB(N, p) sa support {N, N+1, ...}
  - **E[T_N] = N/p**, **Var[T_N] = N(1−p)/p²**
  - P(T_N ≤ k) = 1 − P(C_k < N) via log-space binomial PMF
  - Median + percentile via monotone CDF binary search
  - Lanczos logGamma za numerical stability

MC: 50K episodes per config, mulberry32 RNG, per-spin Bernoulli + count tracker.

## Configs

| Config | Pass | N/p | E[T]_CF | E[T]_MC | rel | P(horiz)_CF | P(horiz)_MC |
|---|---|---|---|---|---|---|---|
| A_money_cart_6coin | ✅ | 6/0.03 | 200.00 | 199.83 | 0.08% | 99.75% | 99.75% |
| B_money_train_12coin_retrigger | ✅ | 12/0.04 | 300.00 | 299.86 | 0.05% | 100.00% | 100.00% |
| C_rare_high_threshold | ✅ | 20/0.01 | 2000.00 | 1996.16 | 0.19% | 100.00% | 100.00% |
| D_high_freq_short_threshold | ✅ | 3/0.2 | 15.00 | 14.98 | 0.11% | 99.87% | 99.85% |
| E_geometric_corner_N1 | ✅ | 1/0.05 | 20.00 | 20.02 | 0.12% | 99.41% | 99.41% |
| F_deterministic_p1 | ✅ | 5/1 | 5.00 | 5.00 | 0.00% | 100.00% | 100.00% |

## Per-config percentile disclosure (Config A — Money Cart 6-coin)

| Percentile | k_q |
|---|---|
| P50 | 189 |
| P75 | 247 |
| P95 | 348 |

## Compliance context

- **UKGC RTS 14** — median + 95th percentile wait time disclosure
- **MGA PPD §11.f** — operator-facing collect-rate disclosure
- **eCOGRA Generic Slots Audit** — verifies E[T_N], P(T_N≤k) match engine
- Industry use: Pragmatic Money Cart / Money Train series (Money Train 2/3/4),
  Stake Logic Wild Swarm, Hacksaw Money Hunt, Push Gaming Razor Shark.