# TRAIL_BONUS_TRACKER — Trail/Board Bonus Progression Tracker Acceptance

Generated: `2026-05-16T10:50:36.611Z`

## Headline

**6/6 configs PASS** at 100000 episodes each = 600K total MC episodes.

Closes Faza 12 ext (post-W100): ✅ "Trail/Board Bonus Progression Tracker" (Wave 144).

## Method

Closed-form DP over (position, picksRemaining) state-space:
  - V(p, r) = E[total reward | starting at p with r picks]
  - Per step Δ ~ stepPmf → newPos = min(p+Δ, N)
  - End → V = endBonusX; Bust → V = 0; Advance → V = stepReward + V(pNew, r-1)
  - Plus P_reach, P_bust, P_timeout (sum = 1 invariant)

MC: 100K episodes per config, mulberry32 RNG, per-pick PMF sampling.

## Configs

| Config | Pass | E[reward] | P_reach | P_bust | P_timeout |
|---|---|---|---|---|---|
| A_konami_stairway_12_step | ✅ | 2046.80 | 23.66% | 66.69% | 9.66% |
| B_igt_wof_multi_tier_trail_20step | ✅ | 14804.69 | 69.48% | 0.00% | 30.52% |
| C_microgaming_lotr_30step_deep | ✅ | 14117.68 | 27.38% | 72.57% | 0.04% |
| D_inspired_ladder_climb_short | ✅ | 685.00 | 100.00% | 0.00% | 0.00% |
| E_corner_always_bust_at_first_advance | ✅ | 0.00 | 0.00% | 100.00% | 0.00% |
| F_corner_giant_step_reaches_end_p1 | ✅ | 1000.00 | 100.00% | 0.00% | 0.00% |

## Compliance context

- **UKGC RTS 14** — trail progression + bust position disclosure
- **MGA PPD §11.f** — bonus-game rule transparency (step + reward + bust)
- **eCOGRA Generic Bonus Audit** — verifies trail math matches engine
- Industry use: Konami Stairway to Heaven, IGT Wheel of Fortune Multi-Tier
  Trail, Microgaming Lord of the Rings, Inspired ladder climb, Bally
  Quick Hit Cash trail, IGT Mystical Mermaid.