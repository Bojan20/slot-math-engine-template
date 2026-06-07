# Cortex Eyes — Studio per-grid UX + technical audit

**Boki imperative (2026-06-07)**: *"Qa, ui ux tehnicki, kompletan svakog grida, ukljuci cortex eyes"*.

Run: 2026-06-07T22:03:38.593Z · Total: **166.1 s**

## Headline

| Metric | Value |
|---|---:|
| Fixtures audited | 10 |
| Viewports per fixture | 2 (Desktop 1440×900 + iPhone SE 375×667) |
| Asserts per fixture·viewport | up to 15 |
| **PASS** | **257** |
| **FAIL** | **23** |
| Pass rate | 91.8% |

## Per-fixture results

| Fixture | Viewport | Pass | Fail | Time | Failing assertions |
|---|---|---:|---:|---:|---|
| pilot · Wrath of Olympus | 1440×900 | 14 | 0 | 7713 ms | — |
| pilot · Wrath of Olympus | iPhone SE | 14 | 0 | 7307 ms | — |
| pilot · Quick Hit Platinum Phoenix | 1440×900 | 14 | 0 | 7900 ms | — |
| pilot · Quick Hit Platinum Phoenix | iPhone SE | 13 | 1 | 7291 ms | every PAYING tier visible (HP+MP+LP) (HP=0 MP=30 LP=420) |
| pilot · Spartacus Colossal | 1440×900 | 14 | 0 | 7867 ms | — |
| pilot · Spartacus Colossal | iPhone SE | 14 | 0 | 7284 ms | — |
| pilot · Rainbow Riches Megaways | 1440×900 | 14 | 0 | 7875 ms | — |
| pilot · Rainbow Riches Megaways | iPhone SE | 13 | 1 | 7300 ms | every PAYING tier visible (HP+MP+LP) (HP=0 MP=0 LP=450) |
| pilot · Huff N Puff Storm Cellar | 1440×900 | 14 | 0 | 7876 ms | — |
| pilot · Huff N Puff Storm Cellar | iPhone SE | 13 | 1 | 7290 ms | every PAYING tier visible (HP+MP+LP) (HP=0 MP=30 LP=420) |
| gdd · huff-puff.md | 1440×900 | 12 | 2 | 9295 ms | #play-grid renders > 0 cells (0 cells over 30 spins); every PAYING tier visible (HP+MP+LP) (HP=0 MP=0 LP=0) |
| gdd · huff-puff.md | iPhone SE | 12 | 2 | 8784 ms | #play-grid renders > 0 cells (0 cells over 30 spins); every PAYING tier visible (HP+MP+LP) (HP=0 MP=0 LP=0) |
| gdd · dragon-spin.json | 1440×900 | 12 | 2 | 9312 ms | #play-grid renders > 0 cells (0 cells over 30 spins); every PAYING tier visible (HP+MP+LP) (HP=0 MP=0 LP=0) |
| gdd · dragon-spin.json | iPhone SE | 12 | 2 | 8778 ms | #play-grid renders > 0 cells (0 cells over 30 spins); every PAYING tier visible (HP+MP+LP) (HP=0 MP=0 LP=0) |
| gdd · mega-cascade.json | 1440×900 | 12 | 2 | 9297 ms | #play-grid renders > 0 cells (0 cells over 30 spins); every PAYING tier visible (HP+MP+LP) (HP=0 MP=0 LP=0) |
| gdd · mega-cascade.json | iPhone SE | 12 | 2 | 8771 ms | #play-grid renders > 0 cells (0 cells over 30 spins); every PAYING tier visible (HP+MP+LP) (HP=0 MP=0 LP=0) |
| gdd · minimal-hnw.json | 1440×900 | 12 | 2 | 9304 ms | #play-grid renders > 0 cells (0 cells over 30 spins); every PAYING tier visible (HP+MP+LP) (HP=0 MP=0 LP=0) |
| gdd · minimal-hnw.json | iPhone SE | 12 | 2 | 8771 ms | #play-grid renders > 0 cells (0 cells over 30 spins); every PAYING tier visible (HP+MP+LP) (HP=0 MP=0 LP=0) |
| gdd · cluster-cosmic.txt | 1440×900 | 12 | 2 | 9330 ms | #play-grid renders > 0 cells (0 cells over 30 spins); every PAYING tier visible (HP+MP+LP) (HP=0 MP=0 LP=0) |
| gdd · cluster-cosmic.txt | iPhone SE | 12 | 2 | 8785 ms | #play-grid renders > 0 cells (0 cells over 30 spins); every PAYING tier visible (HP+MP+LP) (HP=0 MP=0 LP=0) |

## Assertion matrix (per fixture × viewport)

Each cell shows ✓ or ✗ for the 15-point matrix:

1. page-error 0  2. console-error 0  3. Play tab activates  4. Spin visible  5. Tap-target ≥44×44  6. touch-action  7. Grid renders  8. LP≥MP≥HP  9. Every tier  10. Trigger <6%  11. No "undefined"  12. No DOM redness  13. Font-size  14. Spin <1500ms  15. Screenshot

| Fixture | View | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| pilot · Wrath of Olympus | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Wrath of Olympus | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Quick Hit Platinum Phoenix | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Quick Hit Platinum Phoenix | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Spartacus Colossal | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Spartacus Colossal | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Rainbow Riches Megaways | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Rainbow Riches Megaways | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Huff N Puff Storm Cellar | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Huff N Puff Storm Cellar | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · huff-puff.md | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · huff-puff.md | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · dragon-spin.json | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · dragon-spin.json | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · mega-cascade.json | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · mega-cascade.json | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · minimal-hnw.json | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · minimal-hnw.json | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · cluster-cosmic.txt | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · cluster-cosmic.txt | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Tier distribution (averaged across fixtures & viewports)

| Tier | Count | Visible-freq |
|---|---:|---:|
| HP | 420 | 9.33% |
| MP | 448 | 9.96% |
| LP | 3438 | 76.40% |
| WILD | 66 | 1.47% |
| SCATTER | 27 | 0.60% |
| MULT | 101 | 2.24% |

Aggregate scatter trigger rate: **0.00%** across 600 spins (industry baseline 1–3%).

## Screenshots

`tools/_eyes/grid-coverage/` — one PNG per fixture × viewport (20 total).
