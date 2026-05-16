# CLASS_II_BINGO — Class-II Bingo Coordinator Acceptance

Generated: `2026-05-16T02:52:05.259Z`

## Headline

**6/6 configs PASS** at 50000 MC games each.

Closes Faza 12 scenario: ⚠️→✅ "Class-II bingo coordinator mode".

## Method

Closed-form: hypergeometric `P(pattern hit) = C(N − |P|, k − |P|) / C(N, k)`.
Multi-pattern P(any match) via inclusion-exclusion over 2^|patterns| subsets (≤ 16 patterns).
E[balls to first match] = (N+1)/(s+1) (negative-hypergeometric mean).
MC verified against closed-form at 50K games per config.

## Configs

| Config | Pass | CF hit | MC hit | hit rel | CF E[Y] | MC E[Y] | max pattern abs |
|---|---|---|---|---|---|---|---|
| A_50balls_5rows_all_match | ✅ | 0.5399 | 0.5365 | 0.62% | 6.805 | 6.757 | 0.0039 |
| B_50balls_12patterns_all | ✅ | 0.8144 | 0.8158 | 0.17% | 21.189 | 21.272 | 0.0039 |
| C_30balls_rare_hits | ✅ | 0.1435 | 0.1419 | 1.13% | 2.013 | 1.988 | 0.0008 |
| D_60balls_dense_hits | ✅ | 0.9859 | 0.9862 | 0.03% | 49.387 | 49.408 | 0.0029 |
| E_90ball_pool | ✅ | 0.5406 | 0.5395 | 0.22% | 6.879 | 6.881 | 0.0013 |
| F_50balls_highest_match | ✅ | 0.8144 | 0.8158 | 0.17% | 11.917 | 11.665 | 0.0039 |

## NIGC compliance context

- **NIGC 25 CFR Part 502** — defines Class II (bingo, player-vs-player) vs Class III (slots)
- Slot UI is cosmetic; underlying math is bingo coordinator-driven
- Cabot & Hannum 2002 ch. 13 — bingo math fundamentals reference