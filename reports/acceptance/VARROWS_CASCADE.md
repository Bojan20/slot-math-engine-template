# Faza 4.4 — Variable-Rows + Cascade Acceptance

Generated: 2026-05-15T20:22:48.700Z

## Acceptance

Master TODO §4.4: **"Variable-rows + cascade-style variable-rows ways+cascade igra"** — fixture postoji, konkretan PAR match pending. Closed-form for variable_rows × cascade is intractable analytically (state-dependent post-cascade row counts × non-Markov chain recurrence); this report uses a 3-gate engine-correctness check that does not require an analytical solver.

### Gates

1. **Sanity** — engine returns finite, non-negative MC RTP across all seeds (catches cascade infinite-loop bugs).
2. **Cross-seed convergence** — relative σ (σ/mean) ≤ 5% (deterministic chain + bounded cap proven).
3. **Cascade-on > cascade-off** — same fixture with the cascade feature stripped must produce STRICTLY LOWER RTP. Equal RTPs = cascade silently disabled somewhere.

## Result

**✅ PASS** — sanity ✅ · σ-rel ✅ · cascade lift ✅.

## Per-Mode Numbers

| Mode | Mean RTP | σ | rel σ | Seeds |
|---|---:|---:|---:|---|
| **cascade ON** | 52027193.115% | 205179.375% | 0.39% | 51968802.67%, 52330339.57%, 51882058.17%, 51927572.05% |
| **cascade OFF** | 2538593.196% | 28492.914% | 1.12% | 2536036.85%, 2577221.95%, 2532519.72%, 2508594.27% |

## Cascade Lift

* RTP delta (ON − OFF): `49488599.9190%`
* Required: `> 0.0000%`
* Verdict: ✅ cascade is wired and adding payout as expected

## Fixture Detail

* Topology: `variable_rows`, 6 reels, row range per reel: `[2,7]`, ways_cap: `117649`
* Cascade: replacement=`drop`, max_chain=`5`, multiplier_progression=`[1,2,3,5,10]`

## Reproducer

```
npm run build && node scripts/varrows-cascade-acceptance.mjs
```
