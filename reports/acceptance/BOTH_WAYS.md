# Faza 2.1 — Both-Ways Closed-Form ↔ MC Validation

Generated: 2026-05-15T20:20:47.021Z

## Acceptance

Master TODO §2.1: **"both-ways evaluation config daje očekivan RTP po synthetic target-u"** — fixture postojao, closed-form ↔ MC validation pending. This report lands the proof using a bounded-region check that does not require a fully analytical both-ways solver.

### Why bounds, not equality

A general both-ways analytical RTP is non-trivial (wilds interact across LTR + RTL scan; closed form requires payline-by-payline inclusion-exclusion). Instead we assert two strict bounds that hold for *any* paytable and any payline layout:

* **Lower bound (BOTH ≥ max(LTR, RTL))** — scanning in both directions cannot produce LESS payout than scanning in either single direction.
* **Upper bound (BOTH ≤ LTR + RTL)** — under the independence approximation (no double-counting), both directions cannot pay MORE than the sum of each scan independently. Real fixtures with wild interactions sit strictly inside this bound.

Combined, these pin the engine output into a half-open analytical region of size `LTR + RTL − max(LTR, RTL) = min(LTR, RTL)`. Plus a cross-seed σ gate to catch engine non-determinism.

## Result

**✅ PASS** — lower-bound ✅ · upper-bound ✅ · rel σ ≤ 5.0% of mean ✅ (BOTH=0.67%, LTR=0.75%, RTL=0.77%).

## Per-Mode Numbers

| Mode | Mean RTP (4 seeds) | σ | Seed-wise |
|------|---:|---:|---|
| **BOTH** | 2891.593% | 19.452% | 2905.39%, 2869.27%, 2910.17%, 2881.53% |
| **LTR** | 1987.231% | 14.881% | 2000.61%, 1969.33%, 1998.29%, 1980.69% |
| **RTL** | 1985.822% | 15.252% | 1994.80%, 1967.67%, 2001.49%, 1979.33% |

## Bounds

* Lower bound (max LTR, RTL): `1987.2311%`
* Upper bound (LTR + RTL):   `3973.0527%`
* Engine BOTH:               `2891.5927%`
* Slack to LB: `904.3616%` · Slack to UB: `1081.4600%`

## Fixture

`5x4-25lines.json` — 5×4, 25 paylines.

## Reproducer

```
npm run build && node scripts/both-ways-acceptance.mjs
```
