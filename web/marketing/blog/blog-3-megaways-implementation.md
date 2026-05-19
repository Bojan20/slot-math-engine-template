---
title: "Implementing 117,649-Way Megaways Math in Config-Only Mode"
slug: megaways-implementation
publishDate: 2026-05-12
author: slot-math-engine team
tags: [megaways, ways-engine, config, math]
excerpt: "Megaways multiplies ways combinatorially. We show how to ship a 117,649-way title in config alone, no custom solver required."
readingTimeMinutes: 3
---

# Implementing 117,649-Way Megaways Math in Config-Only Mode

A 6-reel Megaways slot with up to 7 symbols per reel produces 7⁶ = 117,649 ways. The naive implementation enumerates every way per spin. The naive implementation is also slow enough to fail the lab's 100 ms per-spin timing budget.

Here's the config-only path.

## The combinatorial structure

For a Megaways spin with row counts (r₁, …, r₆), the number of ways is r₁·r₂·r₃·r₄·r₅·r₆. A "way" pays when symbol s appears on at least k consecutive reels starting from reel 1. The count of ways that pay symbol s, length k is:

```
ways(s, k) = (Π_{i=1..k} count(s on reel i)) · (Π_{j=k+1..6} r_j)
```

That's an O(6) computation per (s, k) pair, not O(117649). The slot-math-engine ways-engine kernel does this enumeration in closed form: zero per-spin Monte Carlo, zero custom code.

## What the config file looks like

```yaml
mechanic: megaways
reels:
  - { min_rows: 2, max_rows: 7, weights: { A: 1, B: 2, C: 3, D: 4, E: 5, W: 1 } }
  - { min_rows: 2, max_rows: 7, weights: { A: 1, B: 2, C: 3, D: 4, E: 5, W: 1 } }
  # … 4 more reels
paytable:
  A: { 3: 0.5, 4: 2.0, 5: 10.0, 6: 50.0 }
  B: { 3: 0.3, 4: 1.0, 5:  5.0, 6: 20.0 }
  # … other symbols
wild: W
features:
  cascading: true
  unlimited_multiplier_in_freespins: true
```

That's the entire math IR for a 117,649-way Megaways title. The ways-engine kernel takes it from there.

## RTP in closed form

For a Megaways title, the closed-form RTP is:

```
RTP = Σ_(rows) P(rows) · Σ_s Σ_k ways(s, k | rows) / total_ways(rows) · payout(s, k)
```

The outer sum is over the 6⁶ = 46,656 possible row-count vectors. That sounds intimidating, but it's a one-shot computation on title compile, not per-spin. The slot-math-engine solver returns RTP for our example 6-reel 117,649-way slot in 240 ms on a single core.

## Cascading + unlimited multiplier

The standard Megaways twist: after each win, the contributing symbols are removed and the column re-drops. In free spins, the multiplier increments by 1 on every cascade and never resets.

Both of those are still tractable in closed form because:

1. The cascade transition is a Markov chain on row-count vectors.
2. The unlimited multiplier converges in expectation under the cascade transition kernel.

The slot-math-engine ways-engine kernel handles both directly. The free-spin RTP contribution is a separate config block:

```yaml
free_spins:
  trigger: { symbol: S, count: 4, spins_awarded: { 4: 12, 5: 15, 6: 25 } }
  cascade_multiplier:
    increment: 1
    cap: null  # unlimited
```

## Performance numbers

* Title compile (closed-form RTP): 240 ms single core
* Per-spin ways enumeration: 0.4 ms median
* Operator-package build: 1.8 s including MC validator at 5e7 spins
* GLI-19 submission size: 38 MB tarball, deterministic across rebuilds

## Takeaway

Megaways is not a "you need a custom solver" mechanic. It's a "you need an O(reels) closed-form derivation" mechanic. Once the algebra is correct, the config file is short and the per-spin cost is fast enough for the lab's timing budget. Three of our W215 cohort case-study titles are Megaways-class; all three shipped in config alone.
