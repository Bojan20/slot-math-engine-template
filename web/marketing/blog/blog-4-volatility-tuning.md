---
title: "Tuning Slot Volatility: σ Targeting Without Breaking Hit Rate"
slug: volatility-tuning
publishDate: 2026-05-12
author: slot-math-engine team
tags: [volatility, sigma, hit-rate, math]
excerpt: "Volatility (σ) and hit-rate are usually traded against each other. The trade is sharper than studios realise — here's the algebra."
readingTimeMinutes: 3
---

# Tuning Slot Volatility: σ Targeting Without Breaking Hit Rate

Every game designer eventually gets the brief: "make it more volatile but keep the hit-rate the same". This is a hard constraint — and most studios solve it by trial and error. There's a cleaner path.

## Volatility, defined

Volatility on a slot is the standard deviation σ of the per-spin payout distribution. For a finite paytable:

```
σ² = Σ_i p_i · (payout_i - RTP)²
```

If you scale every payout by a constant c, RTP scales by c and σ scales by c. That's the trivial knob — and it doesn't help you because you can't ship a 200% RTP title.

## The real knob: skewing the paytable

Two paytables can produce the same RTP with very different σ:

| Paytable | RTP | σ | Hit-rate |
| --- | --- | --- | --- |
| A: many small wins | 96.0% | 3.1 | 32% |
| B: mostly big wins | 96.0% | 9.4 | 18% |
| C: bimodal | 96.0% | 12.7 | 22% |

The lever is how the win mass is distributed across pay-tiers. Concentrate mass in the top tier and σ goes up. Spread it across many tiers and σ comes down. Hit-rate (fraction of spins with payout > 0) moves separately — driven by how often the lowest-tier pays land, not by their size.

## Pinning σ and hit-rate simultaneously

This is the constraint most designers miss: σ and hit-rate are two equations on the paytable, but a typical slot has dozens of pay-cells (symbol × line-length × wild-state). The system is heavily under-determined. So there's almost always a paytable that hits both targets — you just need a solver.

The slot-math-engine volatility kernel takes (target RTP, target σ, target hit-rate) as input and returns a feasible paytable. The optimization is convex (linear constraints + quadratic objective on σ), so it's fast and the result is unique once you fix the symbol weights on the reel strips.

## Worked example

Target: RTP = 96.20%, σ = 7.5, hit-rate = 24%. Starting from an A-class paytable with σ = 4.1:

```
$ slot-math tune volatility \
    --target-rtp 0.962 \
    --target-sigma 7.5 \
    --target-hit-rate 0.24 \
    game.ir > tuned.ir
{
  "rtp":      0.96200,
  "sigma":    7.49,
  "hit_rate": 0.2401,
  "iterations": 27,
  "converged": true,
  "paytable_delta": "shifted 4.2 pp of win mass from tier-3 to tier-5"
}
```

The kernel converges in ~25 iterations on a typical title. You get a re-derived paytable, a delta summary you can hand to the game designer, and the original IR is left untouched.

## When the constraint is infeasible

Sometimes the brief is impossible: (RTP 96%, σ 15, hit-rate 35%) has no solution because high σ requires a heavy top-tier and a heavy top-tier kills hit-rate. The kernel reports infeasibility with the closest achievable point on the σ-vs-hit-rate frontier:

```
{
  "converged": false,
  "reason": "infeasible",
  "frontier_point": { "sigma": 10.2, "hit_rate": 0.35 }
}
```

That's much more useful than a stuck simulation — the designer knows the Pareto trade and can negotiate with product.

## Takeaway

Volatility tuning is a convex problem. Most studios solve it heuristically and end up with paytables that drift after the first GLI submission. The closed-form solver path gives you a stable answer that survives audit.
