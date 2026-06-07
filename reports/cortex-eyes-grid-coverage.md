# Cortex Eyes — Studio per-grid UX + technical audit

**Boki imperative (2026-06-07)**: *"Qa, ui ux tehnicki, kompletan svakog grida, ukljuci cortex eyes"*.

Run: 2026-06-07T22:31:57.277Z · Total: **139.3 s**

## Headline

| Metric | Value |
|---|---:|
| Fixtures audited | 10 |
| Viewports per fixture | 2 (Desktop 1440×900 + iPhone SE 375×667) |
| Asserts per fixture·viewport | up to 15 |
| **PASS** | **280** |
| **FAIL** | **0** |
| Pass rate | 100.0% |

## Per-fixture results

| Fixture | Viewport | Pass | Fail | Time | Failing assertions |
|---|---|---:|---:|---:|---|
| pilot · Wrath of Olympus | 1440×900 | 14 | 0 | 6406 ms | — |
| pilot · Wrath of Olympus | iPhone SE | 14 | 0 | 6247 ms | — |
| pilot · Quick Hit Platinum Phoenix | 1440×900 | 14 | 0 | 6227 ms | — |
| pilot · Quick Hit Platinum Phoenix | iPhone SE | 14 | 0 | 6263 ms | — |
| pilot · Spartacus Colossal | 1440×900 | 14 | 0 | 6160 ms | — |
| pilot · Spartacus Colossal | iPhone SE | 14 | 0 | 6224 ms | — |
| pilot · Rainbow Riches Megaways | 1440×900 | 14 | 0 | 6184 ms | — |
| pilot · Rainbow Riches Megaways | iPhone SE | 14 | 0 | 6225 ms | — |
| pilot · Huff N Puff Storm Cellar | 1440×900 | 14 | 0 | 6210 ms | — |
| pilot · Huff N Puff Storm Cellar | iPhone SE | 14 | 0 | 6240 ms | — |
| gdd · huff-puff.md | 1440×900 | 14 | 0 | 7589 ms | — |
| gdd · huff-puff.md | iPhone SE | 14 | 0 | 7739 ms | — |
| gdd · dragon-spin.json | 1440×900 | 14 | 0 | 7612 ms | — |
| gdd · dragon-spin.json | iPhone SE | 14 | 0 | 7775 ms | — |
| gdd · mega-cascade.json | 1440×900 | 14 | 0 | 7630 ms | — |
| gdd · mega-cascade.json | iPhone SE | 14 | 0 | 7758 ms | — |
| gdd · minimal-hnw.json | 1440×900 | 14 | 0 | 7644 ms | — |
| gdd · minimal-hnw.json | iPhone SE | 14 | 0 | 7740 ms | — |
| gdd · cluster-cosmic.txt | 1440×900 | 14 | 0 | 7661 ms | — |
| gdd · cluster-cosmic.txt | iPhone SE | 14 | 0 | 7739 ms | — |

## Assertion matrix (per fixture × viewport)

Each cell shows ✓ or ✗ for the 15-point matrix:

1. page-error 0  2. console-error 0  3. Play tab activates  4. Spin visible  5. Tap-target ≥44×44  6. touch-action  7. Grid renders  8. LP≥MP≥HP  9. Every tier  10. Trigger <6%  11. No "undefined"  12. No DOM redness  13. Font-size  14. Spin <1500ms  15. Screenshot

| Fixture | View | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| pilot · Wrath of Olympus | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Wrath of Olympus | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Quick Hit Platinum Phoenix | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Quick Hit Platinum Phoenix | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Spartacus Colossal | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Spartacus Colossal | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Rainbow Riches Megaways | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Rainbow Riches Megaways | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Huff N Puff Storm Cellar | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pilot · Huff N Puff Storm Cellar | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · huff-puff.md | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · huff-puff.md | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · dragon-spin.json | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · dragon-spin.json | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · mega-cascade.json | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · mega-cascade.json | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · minimal-hnw.json | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · minimal-hnw.json | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · cluster-cosmic.txt | desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gdd · cluster-cosmic.txt | mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Tier distribution (averaged across fixtures & viewports)

| Tier | Count | Visible-freq |
|---|---:|---:|
| HP | 1014 | 11.27% |
| MP | 1635 | 18.17% |
| LP | 5764 | 64.04% |
| WILD | 247 | 2.74% |
| SCATTER | 206 | 2.29% |
| MULT | 134 | 1.49% |

Aggregate scatter trigger rate: **0.00%** across 600 spins (industry baseline 1–3%).

## Screenshots

`tools/_eyes/grid-coverage/` — one PNG per fixture × viewport (20 total).
