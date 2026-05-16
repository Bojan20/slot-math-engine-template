# ANTICIPATION_REEL_TEASE — Bayesian Anticipation/Tease Tracker Acceptance

Generated: `2026-05-16T08:07:45.610Z`

## Headline

**6/6 configs PASS** at 100000 spins each = 600K total MC.

Closes Faza 12 ext (post-W100): ✅ "Anticipation/Tease Reel Probability Tracker" (Wave 127).

## Method

Closed-form Bayesian conditional:
  - N reels independent Bernoulli scatter (per-reel prob q)
  - Bonus trigger requires K total scatters
  - **P(trigger | m, i) = Σ_{j=K-m}^{N-i} C(N-i,j)·q^j·(1-q)^(N-i-j)**
  - Anticipation activated kada conditional ≥ threshold T (UX/cinematic)
  - Forward state propagation za exact P(any antic per spin)
  - **falseAnticipationRate = P(no trigger | activated)** UKGC RTS 8 §3.5 metric

MC: 100K spins per config, mulberry32 RNG, per-reel scatter sampling.

## Configs

| Config | Pass | N/K | q | T | P(trig) | P(antic) | False% |
|---|---|---|---|---|---|---|---|
| A_pragmatic_5reel_K3_classic | ✅ | 5/3 | 0.2 | 0.5 | 5.792% | 5.792% | 0.00% |
| B_btg_megaways_6reel_K4 | ✅ | 6/4 | 0.15 | 0.5 | 0.589% | 0.589% | 0.00% |
| C_netent_suspense_5reel_lowT | ✅ | 5/3 | 0.25 | 0.3 | 10.352% | 18.262% | 43.32% |
| D_high_freq_low_K | ✅ | 5/2 | 0.4 | 0.5 | 66.304% | 100.000% | 33.70% |
| E_ukgc_strict_bayesian_T1 | ✅ | 5/3 | 0.2 | 1 | 5.792% | 5.792% | 0.00% |
| F_rare_trigger_long_tease | ✅ | 5/4 | 0.1 | 0.2 | 0.046% | 0.046% | 0.00% |

## Compliance context

- **UKGC RTS 8 §3.5** — "false anticipation" prohibition (compliant if threshold=1.0)
- **MGA PPD §11.f** — anticipation rate operator-facing disclosure
- **eCOGRA Generic Slots Audit** — verifies anticipation matches Bayesian conditional
- Industry use: BTG Megaways tease reels, Pragmatic anticipation reels,
  NetEnt suspense reels, branded slot-game UX patterns.