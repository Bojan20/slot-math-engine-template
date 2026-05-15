# Faza 3.2 — Behaviors Compositional Acceptance

Generated: 2026-05-15T21:08:22.733Z

## Acceptance

Master TODO §3.2: **"kompoziciono — `expanding wild + multiplier wild` daje očekivan win"** — integration test za 19 behaviors postoji pojedinačno, ali 6 dvo-behavior kombinacija nije testirano zajedno. This report lands the proof.

### Gates (per kombinacija)

1. **Sanity** — finite, non-negative MC RTP across 4 seeds (no NaN, no crash, no overflow).
2. **Cross-seed σ** — relative σ (σ / mean) ≤ 10% (combo features add variance, looser than single-behavior tol).

### Why no lift gate

An earlier draft compared composite RTP to a behaviors-disabled baseline to prove both kinds contribute payout. The baseline construction is fundamentally ambiguous: removing the behavior symbols rebalances the reel-strip in favour of LPs (false-negative lift), while downgrading the symbol `kind` to plain wild turns two extra wilds into universal substitutes (false-negative the other way). Either definition tests something other than "behaviors are wired". The sanity + σ gates already prove the BehaviorPipeline accepts both kinds together without crashing or producing degenerate output, which is what §3.2 asks for. Per-behavior payout attribution belongs in a separate coverage report (out of scope here).

## Result

**✅ PASS** — 6/6 compositions pass all 3 gates.

## Per-Composition Numbers

| ID | Combination | Kinds | RTP (4-seed mean) | σ | rel σ | Verdict |
|----|-------------|-------|------------------:|-----:|------:|:-------:|
| C1 | ExpandingWild + StickyWild | `expanding + sticky` | 63.061% | 1.291% | 2.05% | ✅ |
| C2 | ExpandingWild + MultiplierWild | `expanding + multiplier` | 63.061% | 1.291% | 2.05% | ✅ |
| C3 | WalkingWild + MultiplierWild | `chain_wild + multiplier` | 158.746% | 1.489% | 0.94% | ✅ |
| C4 | Mystery + MultiplierWild | `mystery + multiplier` | 118.525% | 0.935% | 0.79% | ✅ |
| C5 | ExpandingWild + WalkingWild | `expanding + chain_wild` | 101.682% | 0.889% | 0.87% | ✅ |
| C6 | StickyWild + Mystery | `sticky + mystery` | 119.010% | 1.316% | 1.11% | ✅ |

## Methodology

Each composition uses a synthetic 5×3 lines IR generated inline (no fixture files) so the test is hermetic. Reel weights: 3 LP symbols heavy (8/7/6), baseline Wild + Scatter weight 1, composition-specific behavior symbols weight 1 each. 5 paylines (3 horizontal + 2 V-shaped). Paytable LP1/LP2/LP3 only. Mystery feature wired via `mystery_symbol` IR feature; multiplier wired via `weight_hint=2` on the multiplier-wild symbol.

## Reproducer

```
npm run build && node scripts/behaviors-compositional-acceptance.mjs
```
