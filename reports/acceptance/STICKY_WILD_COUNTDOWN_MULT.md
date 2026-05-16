# STICKY_WILD_COUNTDOWN_MULT — Sticky Wild Countdown Multiplier Acceptance

Generated: `2026-05-16T07:01:15.392Z`

## Headline

**6/6 configs PASS** at 100000 spins each = 600K total MC.

Closes Faza 12 ext (post-W100): ✅ "Sticky Wild Countdown Multiplier" (Wave 114).

## Method

Closed-form Markov-chain stationary solver:
  - (N+1)-state chain: idle (state 0) + N active countdown phases (states 1..N)
  - **π_0 = 1/(1 + N·p)**, **π_k = p/(1 + N·p)** for k=1..N
  - M_k = base + (k−1)·step (linear) or base·ratio^(k−1) (geometric)
  - **E[M per spin] = π_0 + π_1·ΣM_k**
  - **E[Y per spin] = E[V]·E[M]** (cross-independence with baseWinPmf)

MC: 100K spins per config, mulberry32 RNG, state-tracking with idle/active flag.

## Configs

| Config | Pass | E[M]_CF | E[M]_MC | rel | E[Y]_CF | active% | maxM |
|---|---|---|---|---|---|---|---|
| A_classic_linear_N4_step1 | ✅ | 1.2500 | 1.2522 | 0.18% | 0.8750 | 16.67% | 4.00 |
| B_pragmatic_hot_fiesta_geom_N6 | ✅ | 1.3758 | 1.3851 | 0.68% | 0.9631 | 15.25% | 7.59 |
| C_netent_vikings_N7_step1 | ✅ | 1.3684 | 1.3780 | 0.70% | 0.9579 | 12.28% | 7.00 |
| D_high_freq_short_N3 | ✅ | 2.1250 | 2.1203 | 0.22% | 1.4875 | 37.50% | 6.00 |
| E_rare_long_aggressive_geom | ✅ | 5.8238 | 5.9738 | 2.58% | 4.0767 | 4.76% | 512.00 |
| F_corner_deterministic_constant | ✅ | 3.0000 | 3.0021 | 0.07% | 2.1000 | 50.00% | 5.00 |

## Compliance context

- **UKGC RTS 14** — variance + tail-multiplier disclosure (maxM + Var[Y])
- **MGA PPD §11.f** — operator-facing volatility metric
- **eCOGRA Generic Slots Audit** — verifies steady-state E[M], E[Y] match engine
- Industry use: Pragmatic Hot Fiesta, NetEnt Vikings Berzerk, Push Gaming Wild Swarm,
  Quickspin Sakura Fortune, Yggdrasil Vault of Anubis, plus dozens of branded clones.