# Optimizer Mass-Validation Report

> **W152 Wave 21 — Faza 13.1 acceptance proof.** Generated 2026-05-15T03:53:33.835Z.

**Headline:** ✅ PASS — 50/50 synthetic targets converged within ±0.50% (100.0% pass rate vs 95% threshold).

## Aggregate stats

- Mean tuner iterations: 2.00
- Mean wall-clock per tune: 206 ms
- Total time: 10291 ms

## Failed targets (top 10)

_(all targets converged — no failures)_

## Methodology

- **N targets**: 50 synthetic IRs (3-reel × 1-row, 4 symbols, variable weights, target_rtp ∈ [0.88, 0.97]).
- **Tuner**: `tunePaytableToTarget` (paytable bisection from `src/solver/parTuner.ts`).
- **Pass criterion**: ≥ 95% targets converge within ±0.50% RTP.
- **Determinism**: LCG seed=7777 for IR generation; tuner seed=12345.
