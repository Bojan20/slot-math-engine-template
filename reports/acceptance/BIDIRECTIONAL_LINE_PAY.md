# BIDIRECTIONAL_LINE_PAY — Bi-Directional Line Pay Aggregator Acceptance

Generated: `2026-05-16T07:57:24.039Z`

## Headline

**6/6 configs PASS** at 100000 spins each = 600K total MC.

Closes Faza 12 ext (post-W100): ✅ "Bi-Directional Line Pay Aggregator" (Wave 125).

## Method

Closed-form bi-directional line evaluation:
  - N reels independent, per-symbol density q
  - **P(L_k) = q^k·(1−q)** za k<N, **P(L_N) = q^N**
  - P(R_k) symetrično (start from reel N)
  - **E[pay_BD] = E[L] + E[R] − paytable[N]·q^N** (deduct N-match overlap)
  - hit_freq_BD = hf_L + hf_R − P(L_N)
  - **bidirectionalUpliftRatio = E[pay_BD] / E[pay_L]** (operator disclosure)

MC: 100K spins per config, mulberry32 RNG, per-reel Bernoulli + chain count.

## Configs

| Config | Pass | N | kMin | E[pay_BD] CF | MC | rel | Uplift |
|---|---|---|---|---|---|---|---|
| A_microgaming_avalon_5reel_k3 | ✅ | 5 | 3 | 0.3148 | 0.3101 | 1.49% | 1.794 |
| B_netent_lights_5reel_k2 | ✅ | 5 | 2 | 0.5120 | 0.5134 | 0.28% | 1.778 |
| C_4reel_both_ways | ✅ | 4 | 3 | 0.5934 | 0.5958 | 0.42% | 1.403 |
| D_high_density_low_uplift | ✅ | 5 | 3 | 4.0000 | 4.0200 | 0.50% | 1.123 |
| E_2reel_all_or_nothing | ✅ | 2 | 2 | 2.5000 | 2.5092 | 0.37% | 1.000 |
| F_3reel_classic_slot | ✅ | 3 | 3 | 0.3575 | 0.3408 | 4.66% | 1.000 |

## Compliance context

- **UKGC RTS 14** — pay-frequency disclosure both-directions
- **MGA PPD §11.f** — operator-facing line-evaluation rule
- **eCOGRA Generic Slots Audit** — verifies bi-directional pay match engine
- Industry use: Microgaming Avalon, NetEnt Lights / Witches Wheel, IGT Cleopatra
  Bi-Way variants, Stakelogic Witchcraft Academy.