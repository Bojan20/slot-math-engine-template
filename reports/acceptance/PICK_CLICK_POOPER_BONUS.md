# PICK_CLICK_POOPER_BONUS — Pick-and-Click Pooper Bonus Analyzer Acceptance

Generated: `2026-05-17T10:40:18.501Z`

## Headline

**6/6 configs PASS** at 20000 MC rounds each = 120K total pick-round sims.

Closes Faza 12 ext (post-W100): ✅ "Pick-and-Click Pooper Bonus Analyzer" (Wave 173 — 58th solver, Negative Hypergeometric).

## Method

Closed-form Negative Hypergeometric (r=1 failure stop), Johnson-Kotz-Kemp §6.2.4:
  - **T ~ NHG(N, K, r=1)** number of prize reveals before first pooper
  - **E[T] = M/(K+1)** where M = N − K prize boxes
  - **Var[T] = M·(N+1)·K / ((K+1)²·(K+2))**
  - **P(T = 0) = K / N** (first pick is pooper)
  - PMF: P(T=t) = ∏_{j=0..t−1}(M−j)/(N−j) · K/(N−t)
  - **Wald** compound for total payout S = Σ V_i:
    - E[S] = E[T]·μ_V
    - Var[S] = E[T]·σ²_V + Var[T]·μ_V²
  - Cap truncation: residual mass into cap bucket (truncated PMF sums to 1).

MC: 20K rounds per config, partial Fisher-Yates shuffle until pooper or cap; Gaussian prize draws (Box-Muller), mulberry32 RNG.

## Configs — pick-bonus operator disclosure table

| Config | Pass | N | K | E[T] CF/MC | E[S] CF/MC | P(T=0) CF/MC | P(T≥3) CF/MC |
|---|---|---|---|---|---|---|---|
| A_aristocrat_5dragons_n20_k5 | ✅ | 20 | 5 | 2.500/2.522 | 25.00/25.22 | 25.0%/24.5% | 39.9%/40.1% |
| B_bally_quick_hit_n12_k2 | ✅ | 12 | 2 | 3.333/3.358 | 26.67/26.85 | 16.7%/16.3% | 54.5%/55.2% |
| C_netent_gonzo_n15_k3 | ✅ | 15 | 3 | 3.000/2.973 | 18.00/17.86 | 20.0%/20.5% | 48.4%/47.9% |
| D_igt_wof_pick_a_pack_n10_k1 | ✅ | 10 | 1 | 4.500/4.534 | 67.50/68.02 | 10.0%/10.1% | 70.0%/70.5% |
| E_konami_china_shores_n8_k4_high_pooper | ✅ | 8 | 4 | 0.800/0.809 | 4.00/4.07 | 50.0%/49.6% | 7.1%/7.2% |
| F_corner_buffalo_gold_n25_k2_capped_8 | ✅ | 25 | 2 | 5.400/5.379 | 64.80/64.55 | 8.0%/8.4% | 77.0%/76.8% |

## Compliance context

- **UKGC RTS 14** — bonus mechanic disclosure: operator must show pooper count + expected reveals on help screen.
- **MGA PPD §11** — bonus game transparency: PMF auditor-accessible.
- **AU NCPF Class III** — bonus help screen must include "1-in-X rounds first pick is pooper" disclosure.
- **eCOGRA Generic Slots Audit** — pick-bonus PMF audit trail across all reveal positions.

Industry use: Aristocrat 5 Dragons / Buffalo Gold pick-coin, Bally Quick Hit pick-a-prize, NetEnt Gonzo's
Quest hieroglyph reveal, IGT Wheel of Fortune Pick-a-Pack, Konami China Shores, Light & Wonder Wonder 4.