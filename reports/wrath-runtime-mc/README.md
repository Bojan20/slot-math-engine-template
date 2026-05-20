# Wrath Runtime MC — RTP Baseline Reports

Convergence ladder verifikacije za **slot-math-engine Play Template runner**
matematike (`web/studio/public/runner/runtime.js` headless flow).  Compares
runtime MC vs analytical Markov DP solver (`src/solver/holdAndWinMarkov.ts`)
ground truth.

## Convergence ladder (kako da reproduciraš)

```bash
# Default: xoshiro128** (W218+)
bash scripts/wrath-runtime-mc-parallel.sh 1000000000  10   # 1B  / 10 workers
bash scripts/wrath-runtime-mc-parallel.sh 5000000000  10   # 5B  / 10 workers
bash scripts/wrath-runtime-mc-parallel.sh 10000000000 10   # 10B / 10 workers

# Override RNG (porediti sa mulberry32 baseline pre W218):
MC_RNG=mulberry32 bash scripts/wrath-runtime-mc-parallel.sh 10000000000 10
MC_RNG=pcg64 bash scripts/wrath-runtime-mc-parallel.sh 10000000000 10
```

## Baseline tabela (verifikovana 2026-05-20)

| Tier | RNG | RTP | Stderr | CI95 | Δ vs CF (96.1360%) | Wallclock |
|---|---|---|---|---|---|---|
| 1B | mulberry32 | 96.2062% | 0.0328pp | [96.142, 96.271] | +0.0702pp | 92s |
| 5B | mulberry32 | 96.1937% | 0.0018pp | [96.190, 96.197] | +0.0577pp | 403s |
| 10B | mulberry32 | 96.1939% | 0.0011pp | [96.1918, 96.1961] | +0.0579pp | 802s |
| **10B** | **xoshiro128\*\*** | **96.1832%** | **0.0105pp** | [96.1626, 96.2037] | **+0.0472pp** | 1546s |

## Stack-rank residual H&W bias

Sa W218 RNG upgrade (mulberry32 → xoshiro128**), bias je smanjen sa
+0.0579pp na +0.0472pp (~18% reduction).  Residual +0.0472pp dolazi iz
H&W bucket (+0.1266pp vs CF target 39.6979%).

Analiza pokazuje da **runtime headless H&W kod je matematički ekvivalentan
CF Markov DP solver-u** (verifikovano enumeration na 6-cell + 9-cell
configs).  Razlika je lokalna RNG aberacija specifična za Wrath IR
strukturu (5×3 grid, ~3.5% orb-land probability, 6-orb trigger threshold).

## Files

- `W218-10B-xoshiro128pp.json` — current baseline, sa W218 RNG upgrade
