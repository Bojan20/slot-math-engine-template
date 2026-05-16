# CASCADE_MULTIPLIER_CHAIN — Lockstep Conditional Cascade Chain Acceptance

Generated: `2026-05-16T07:35:42.453Z`

## Headline

**6/6 configs PASS** at 100000 spins each = 600K total MC.

Closes Faza 12 ext (post-W100): ✅ "Cascade Multiplier Chain Lockstep Conditional" (Wave 121).

## Method

Closed-form lockstep conditional chain (multiplier raste samo na win cascade):
  - L ~ Geometric(1-p) sa support {0, 1, 2, ...}
  - **P(L=0) = 1-p**, **P(L≥k) = p^k**, **E[L] = p/(1-p)**
  - M_k linear (base+(k-1)·step) ili geometric (base·ratio^(k-1))
  - **`E[Y] = E[V] · Σ M_k · p^k`** (Wald-style via P(L≥k)=p^k)
  - **`Var[Y] = E[Y²] − E[Y]²`** sa cross-term 2·E[V]²·Σ_{j<k} M_j·M_k·p^k
  - Convergence guard: r·p < 1 for geometric mode

MC: 100K spins per config, mulberry32 RNG, walk-chain-until-empty.

## Configs

| Config | Pass | p | E[L]_CF | E[L]_MC | E[Y]_CF | E[Y]_MC | rel |
|---|---|---|---|---|---|---|---|
| A_quickspin_reactor_wilds_p06 | ✅ | 0.6 | 1.500 | 1.505 | 17.250 | 17.379 | 0.75% |
| B_push_token_of_life_geom | ✅ | 0.5 | 1.000 | 0.999 | 9.200 | 9.115 | 0.92% |
| C_hacksaw_cascade_p04 | ✅ | 0.4 | 0.667 | 0.669 | 5.111 | 5.161 | 0.98% |
| D_rare_chain_aggressive_step | ✅ | 0.2 | 0.250 | 0.250 | 2.588 | 2.584 | 0.13% |
| E_constant_multiplier_corner | ✅ | 0.5 | 1.000 | 0.999 | 13.800 | 13.803 | 0.02% |
| F_heavy_tail_geom_r2_p03 | ✅ | 0.3 | 0.429 | 0.428 | 3.450 | 3.468 | 0.52% |

## Compliance context

- **UKGC RTS 14** — variance + max-multiplier disclosure (Var[Y], M_K_max via truncation)
- **MGA PPD §11.f** — chain volatility disclosure
- **eCOGRA Generic Slots Audit** — verifies steady-state E[Y] / Var[Y] match engine
- Industry use: Quickspin Reactor Wilds, Push Gaming Token of Life, Hacksaw cascade
  multiplier games, BTG Megaways multiplier-on-win, dozens of branded clones.