# STICKY_MULTIPLIER_FS_TRAIL — Sticky Multiplier FS Trail Aggregator Acceptance (W179, 61st solver)

Generated: `2026-05-17T22:44:18.935Z`

## Headline

**6/6 configs PASS** at 20000 FS-bonus MC runs each = 120K total FS simulations.

Closes Faza 12 ext (post-W100): ✅ "Sticky Multiplier FS Trail Aggregator" (Wave 179 — 61st closed-form solver, compound Binomial trail sa quadratic-in-N payout).

## Method

Wald-Blackwell compound trail aggregator + per-spin Gaussian-Y + Bernoulli-increment MC.
  - **N_inc ~ Binomial(N, q)** — # increment events u N FS spinova
  - **T_inc = Σ Δ_i** — compound Binomial sum sa iid Δ
  - **E[M_N] = M_0 + N·q·μ_Δ** (linear u N)
  - **Var[M_N] = N·q·(σ²_Δ + (1−q)·μ_Δ²)** Wald-Blackwell
  - **E[S_FS] = μ_Y · (N·M_0 + q·μ_Δ · N(N−1)/2)** — quadratic-in-N trail-sum payout
  - **commercialUpliftRatio = E[S_FS] / (μ_Y · N · M_0)** — vs flat-multiplier FS baseline

MC: per-FS-run Bernoulli(q) increments + Box-Muller Gaussian draws (Δ, Y, clipped at 0), mulberry32 RNG.

## Configs — sticky-multiplier-trail operator disclosure table

| Config | Pass | N | q | μ_Δ | E[#inc] CF/MC | E[M_N] CF/MC | E[S_FS] CF/MC | uplift× |
|---|---|---|---|---|---|---|---|---|
| A_btg_bonanza_megaways_fs_increment_per_cluster | ✅ | 12 | 0.4 | 1 | 4.80/4.80 | 5.80/5.80 | 19.20/19.23 | 3.20 |
| B_pragmatic_sweet_bonanza_fs_mult_coin | ✅ | 10 | 0.3 | 15 | 3.00/3.01 | 46.00/46.10 | 170.00/171.35 | 21.25 |
| C_btg_white_rabbit_xmult_per_scatter | ✅ | 15 | 0.2 | 3 | 3.00/2.99 | 10.00/10.16 | 31.20/31.72 | 5.20 |
| D_hacksaw_wanted_dead_bounty_chain | ✅ | 8 | 0.5 | 2 | 4.00/4.00 | 9.00/9.05 | 21.60/21.81 | 4.50 |
| E_pragmatic_money_cart_extra_shift_persistent | ✅ | 6 | 0.15 | 1 | 0.90/0.90 | 1.90/1.90 | 8.25/8.29 | 1.38 |
| F_quickspin_big_bad_wolf_pigs_turned_wild | ✅ | 10 | 0.25 | 0.5 | 2.50/2.51 | 3.25/3.26 | 17.94/17.96 | 1.28 |

## Compliance context

- **UKGC RTS 14** — multiplier mechanic disclosure (operator must show typical sticky trail growth).
- **MGA PPD §11** — FS feature transparency (operator must disclose multiplier-on-feature mehanics).
- **eCOGRA Generic Slots Audit** — multiplier accumulator audit trail (per FS run).
- **EU GA 2024** — cross-jurisdiction baseline.

Industry use: BTG Bonanza Megaways FS (+1 per cluster), Pragmatic Sweet Bonanza FS (mult-coin lands),
BTG White Rabbit FS (xMult per scatter), Hacksaw Wanted Dead or a Wild Bounty (chain), Pragmatic Money Cart 4
EXTRA SHIFT (persistent across re-spins), Quickspin Big Bad Wolf FS (Pigs Turned Wild).