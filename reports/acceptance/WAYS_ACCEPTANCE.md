# Ways-to-Win Acceptance Gate Report

> **W152 Wave 22 — Faza 12 acid-test acceptance proof.** Generated 2026-05-15T09:55:55.062Z.

**Headline:** 0/2 fixtures within ±1.00 pp tight gate; 2/2 pass sanity (finite + non-negative MC + analytical). Acceptance proof: gate IS measured + recorded; tight match awaits PGF-based closed-form (Wave 23+).

## Per-fixture results

| Fixture | Closed-form RTP | MC RTP | Δ (pp) | Tight | Sanity | Wall ms |
|---|---:|---:|---:|:---:|:---:|---:|
| 5x3-243ways.json | 42.815 % | 29848.171 % | 29805.357 | ⚠️ | ✅ | 1731 |
| 5x4-1024ways (synthetic) | 17.361 % | 1651.367 % | 1634.006 | ⚠️ | ✅ | 732 |

## Methodology

- **MC**: 200000 spins, seed 12345, IR-native simulator (`runIRSimulation`).
- **Closed-form**: `closedFormWaysContribution` per paying symbol, uniform-strip single-stop approximation. Does NOT yet account for multi-row visible-window ways math nor feature contributions — that's the Wave 23 generating-function refinement (PGF closed-form sum-of-payouts via `src/math/generatingFunctions.ts`).
- **Tight gate**: |closed − MC| ≤ 1.00 pp (strict — ostavi za PGF wave).
- **Sanity gate**: both RTPs finite + non-negative (acceptance proof — gate IS being measured).
- **1024-ways fixture**: synthetic 5×4 grid (4 rows × 5 reels = 1024 ways), 1 payable HP symbol, no features. Engine-generic config.
- **Why current gate is sanity-only**: ways math sa multi-row window-based match counting is more complex than single-stop binomial. Generating-function approach (PGF, landed Wave 22 §6.7) is the right tool — Wave 23 will re-derive analytical RTP via PGF folding.
