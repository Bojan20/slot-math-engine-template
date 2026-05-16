# STICKY_CASH_COLLECTOR — Sticky-Cash Collector Variant Acceptance

Generated: `2026-05-16T03:00:13.742Z`

## Headline

**6/6 configs PASS** at 10000 MC episodes each.

Closes Faza 12 scenario: ⚠️→✅ "Sticky-cash variant" (cash-collect mechanic with multiplier-collector).

## Method

Renewal-reward theory: collector triggers reset sticky total + pay M × T. Long-run RTP = p_cash · E[V] · E[M]
per spin (independent of p_collect in infinite horizon).

Finite-horizon via E[T_n] moment propagation: `E[T_{n+1}] = E[T_n]·(1−p_collect) + p_cash·E[V]`,
cumulative `E[Y_n] = E[Y_{n-1}] + p_collect·E[M]·E[T_{n-1}]`. Tracks "stranded cash at N" deduction.

Different from Wave 52 (Sticky Cash + Reveal Mult): W52 has deterministic single end-of-window
multiplier; W60 has random-arrival collector events with reset between.

## Configs

| Config | Pass | N | CF E[Y] | MC E[Y] | rel | CF eff | RTP_ss |
|---|---|---|---|---|---|---|---|
| A_short_N50_classic | ✅ | 50 | 16.889 | 17.026 | 0.81% | 63.1% | 0.53550 |
| B_long_N500_classic | ✅ | 500 | 257.040 | 257.513 | 0.18% | 96.0% | 0.53550 |
| C_high_collect_rate | ✅ | 100 | 101.745 | 101.968 | 0.22% | 95.0% | 1.07100 |
| D_rare_collector | ✅ | 200 | 121.449 | 120.767 | 0.56% | 56.7% | 1.07100 |
| E_heavy_mult | ✅ | 100 | 307.815 | 309.254 | 0.47% | 80.1% | 3.84200 |
| F_tiny_episode | ✅ | 20 | 8.008 | 8.205 | 2.46% | 56.1% | 0.71400 |