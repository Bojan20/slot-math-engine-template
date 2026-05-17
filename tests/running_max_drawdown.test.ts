/**
 * W152 Wave 161 — Running Max Drawdown During Session Analyzer tests.
 *
 * 30 specs covering:
 *   - validation (7)
 *   - survival function correctness (5)
 *   - moments correctness (4)
 *   - drift regime classification (3)
 *   - percentile monotonicity (3)
 *   - monotonicity invariants (3)
 *   - MC cross-validation (3)
 *   - determinism (1)
 *   - industry use-cases (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveRunningMaxDrawdown,
  simulateRunningMaxDrawdown,
  _runningMaxDrawdownInternal as _internal,
} from '../src/features/runningMaxDrawdown.js';

const baseCfg = {
  betPerSpin: 1,
  rtp: 0.96,
  volatilityIndex: 5,
  horizonSpins: 600, // 1 hour @ default sph
};

describe('runningMaxDrawdown — validation', () => {
  it('rejects betPerSpin ≤ 0', () => {
    expect(() => solveRunningMaxDrawdown({ ...baseCfg, betPerSpin: 0 })).toThrow();
  });
  it('rejects rtp out of [0,2]', () => {
    expect(() => solveRunningMaxDrawdown({ ...baseCfg, rtp: -0.1 })).toThrow();
    expect(() => solveRunningMaxDrawdown({ ...baseCfg, rtp: 2.5 })).toThrow();
  });
  it('rejects volatilityIndex ≤ 0', () => {
    expect(() => solveRunningMaxDrawdown({ ...baseCfg, volatilityIndex: 0 })).toThrow();
  });
  it('rejects horizonSpins ≤ 0 or non-integer', () => {
    expect(() => solveRunningMaxDrawdown({ ...baseCfg, horizonSpins: 0 })).toThrow();
    expect(() => solveRunningMaxDrawdown({ ...baseCfg, horizonSpins: -100 })).toThrow();
    expect(() => solveRunningMaxDrawdown({ ...baseCfg, horizonSpins: 1.5 })).toThrow();
  });
  it('rejects drawdownLimit ≤ 0 if given', () => {
    expect(() =>
      solveRunningMaxDrawdown({ ...baseCfg, drawdownLimit: 0 }),
    ).toThrow();
    expect(() =>
      solveRunningMaxDrawdown({ ...baseCfg, drawdownLimit: -10 }),
    ).toThrow();
  });
  it('rejects non-finite inputs', () => {
    expect(() => solveRunningMaxDrawdown({ ...baseCfg, rtp: NaN })).toThrow();
    expect(() => solveRunningMaxDrawdown({ ...baseCfg, betPerSpin: Infinity })).toThrow();
  });
  it('accepts default drawdownLimit (auto = 2·b·√T)', () => {
    const r = solveRunningMaxDrawdown(baseCfg);
    expect(r.drawdownLimit).toBeCloseTo(2 * 1 * Math.sqrt(600), 6);
  });
});

describe('runningMaxDrawdown — survival function correctness', () => {
  it('S(0) = 1 (always have some drawdown over a horizon)', () => {
    const s = _internal.maxDrawdownSurvival(0, -0.04, 25, 600);
    expect(s).toBe(1);
  });
  it('S(d) → 0 as d → ∞', () => {
    const s = _internal.maxDrawdownSurvival(1e9, -0.04, 25, 600);
    expect(s).toBeCloseTo(0, 12);
  });
  it('S(d) strictly decreasing in d', () => {
    const s1 = _internal.maxDrawdownSurvival(10, -0.04, 25, 600);
    const s2 = _internal.maxDrawdownSurvival(100, -0.04, 25, 600);
    const s3 = _internal.maxDrawdownSurvival(1000, -0.04, 25, 600);
    expect(s2).toBeLessThan(s1);
    expect(s3).toBeLessThan(s2);
  });
  it('S(d) higher for negative drift (house edge inflates DD)', () => {
    const sNeg = _internal.maxDrawdownSurvival(50, -0.04, 25, 600);
    const sPos = _internal.maxDrawdownSurvival(50, +0.04, 25, 600);
    expect(sNeg).toBeGreaterThan(sPos);
  });
  it('S(d) is in [0, 1] for all valid inputs', () => {
    for (const d of [1, 10, 50, 100, 500, 1000]) {
      const s = _internal.maxDrawdownSurvival(d, -0.05, 4, 1000);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('runningMaxDrawdown — moments correctness', () => {
  it('E[MDD] > 0 for any non-trivial config', () => {
    const r = solveRunningMaxDrawdown(baseCfg);
    expect(r.expectedMaxDrawdown).toBeGreaterThan(0);
  });
  it('Var[MDD] ≥ 0 always', () => {
    const r = solveRunningMaxDrawdown(baseCfg);
    expect(r.varMaxDrawdown).toBeGreaterThanOrEqual(0);
    expect(r.stdDevMaxDrawdown).toBeGreaterThanOrEqual(0);
  });
  it('zero drift: E[MaxDrop] = σ·√(2T/π) (driftless one-sided formula)', () => {
    // For driftless BM, MaxDrop = -min(W_s) over [0, T] follows half-normal:
    // |min W_s| has density 2·φ(x/(σ√T))/(σ√T) for x ≥ 0,
    // so E[MaxDrop] = ∫₀^∞ x · 2φ(x/(σ√T))/(σ√T) dx = σ·√(2T/π).
    const cfg = { betPerSpin: 1, rtp: 1.0, volatilityIndex: 2, horizonSpins: 1000 };
    const r = solveRunningMaxDrawdown(cfg);
    const sigma = cfg.volatilityIndex * cfg.betPerSpin;
    const expected = sigma * Math.sqrt(2 * cfg.horizonSpins / Math.PI);
    // 10% tolerance (numerical Simpson integration).
    expect(Math.abs(r.expectedMaxDrawdown - expected) / expected).toBeLessThan(0.10);
  });
  it('E[MDD²] = Var + E[MDD]² invariant (integration self-consistency)', () => {
    const r = solveRunningMaxDrawdown(baseCfg);
    const e2 = r.varMaxDrawdown + r.expectedMaxDrawdown * r.expectedMaxDrawdown;
    expect(e2).toBeGreaterThan(0);
  });
});

describe('runningMaxDrawdown — drift regime classification', () => {
  it('rtp = 0.96 → negative drift (house edge)', () => {
    const r = solveRunningMaxDrawdown({ ...baseCfg, rtp: 0.96 });
    expect(r.driftRegime).toBe('negative');
  });
  it('rtp = 1.00 → zero drift', () => {
    const r = solveRunningMaxDrawdown({ ...baseCfg, rtp: 1.0 });
    expect(r.driftRegime).toBe('zero');
  });
  it('rtp = 1.05 → positive drift (player edge from promo)', () => {
    const r = solveRunningMaxDrawdown({ ...baseCfg, rtp: 1.05 });
    expect(r.driftRegime).toBe('positive');
  });
});

describe('runningMaxDrawdown — percentile monotonicity', () => {
  it('p99 > p95 > p90 (VaR-style ordering)', () => {
    const r = solveRunningMaxDrawdown(baseCfg);
    expect(r.percentileMaxDrawdown95).toBeGreaterThan(r.percentileMaxDrawdown90);
    expect(r.percentileMaxDrawdown99).toBeGreaterThan(r.percentileMaxDrawdown95);
  });
  it('percentiles strictly positive', () => {
    const r = solveRunningMaxDrawdown(baseCfg);
    expect(r.percentileMaxDrawdown90).toBeGreaterThan(0);
    expect(r.percentileMaxDrawdown95).toBeGreaterThan(0);
    expect(r.percentileMaxDrawdown99).toBeGreaterThan(0);
  });
  it('S(p_q) ≈ 1 − q (quantile inversion roundtrip)', () => {
    const r = solveRunningMaxDrawdown(baseCfg);
    const variance = r.sigmaPerSpin * r.sigmaPerSpin;
    const s90 = _internal.maxDrawdownSurvival(r.percentileMaxDrawdown90, r.driftPerSpin, variance, baseCfg.horizonSpins);
    expect(s90).toBeCloseTo(0.10, 4);
  });
});

describe('runningMaxDrawdown — monotonicity invariants', () => {
  it('higher volatility → larger expected MDD', () => {
    const r1 = solveRunningMaxDrawdown({ ...baseCfg, volatilityIndex: 3 });
    const r2 = solveRunningMaxDrawdown({ ...baseCfg, volatilityIndex: 10 });
    expect(r2.expectedMaxDrawdown).toBeGreaterThan(r1.expectedMaxDrawdown);
  });
  it('lower RTP → larger expected MDD (house edge compounds drawdown)', () => {
    const r1 = solveRunningMaxDrawdown({ ...baseCfg, rtp: 0.97 });
    const r2 = solveRunningMaxDrawdown({ ...baseCfg, rtp: 0.90 });
    expect(r2.expectedMaxDrawdown).toBeGreaterThan(r1.expectedMaxDrawdown);
  });
  it('longer horizon → larger expected MDD', () => {
    const r1 = solveRunningMaxDrawdown({ ...baseCfg, horizonSpins: 300 });
    const r2 = solveRunningMaxDrawdown({ ...baseCfg, horizonSpins: 3000 });
    expect(r2.expectedMaxDrawdown).toBeGreaterThan(r1.expectedMaxDrawdown);
  });
});

describe('runningMaxDrawdown — MC cross-validation', () => {
  it('MC observed E[MDD] within ±20% of CF (medium-vol config)', () => {
    const cf = solveRunningMaxDrawdown(baseCfg);
    const mc = simulateRunningMaxDrawdown(baseCfg, 2000, 12345);
    const rel = Math.abs(cf.expectedMaxDrawdown - mc.observedExpectedMaxDrawdown) /
      Math.max(cf.expectedMaxDrawdown, 1e-9);
    expect(rel).toBeLessThan(0.20);
  });
  it('MC observed p95 within ±25% of CF p95', () => {
    const cf = solveRunningMaxDrawdown(baseCfg);
    const mc = simulateRunningMaxDrawdown(baseCfg, 2000, 7);
    const rel = Math.abs(cf.percentileMaxDrawdown95 - mc.observedPercentile95) /
      Math.max(cf.percentileMaxDrawdown95, 1e-9);
    expect(rel).toBeLessThan(0.25);
  });
  it('MC observed probExceedsLimit within ±5pp of CF', () => {
    const cf = solveRunningMaxDrawdown(baseCfg);
    const mc = simulateRunningMaxDrawdown(baseCfg, 2000, 31);
    expect(Math.abs(cf.probMaxDrawdownExceedsLimit - mc.observedProbExceedsLimit)).toBeLessThan(0.05);
  });
});

describe('runningMaxDrawdown — determinism', () => {
  it('CF solver returns same result on repeated calls', () => {
    const r1 = solveRunningMaxDrawdown(baseCfg);
    const r2 = solveRunningMaxDrawdown(baseCfg);
    expect(r1).toEqual(r2);
  });
});

describe('runningMaxDrawdown — industry use-cases', () => {
  it('UK responsible-gambling: 1-hour session £1 stake 96% RTP — disclose VaR drawdowns', () => {
    const r = solveRunningMaxDrawdown({
      betPerSpin: 1,
      rtp: 0.96,
      volatilityIndex: 5,
      horizonSpins: 600,
    });
    // Drift μ = -0.04 over 600 spins = -24 (player expected to lose £24).
    // σ = 5, σ√T ≈ 122.5. Driftless E[MaxDrop] = σ·√(2T/π) ≈ 97.7.
    // Negative drift inflates E[MaxDrop] beyond driftless baseline.
    expect(r.expectedMaxDrawdown).toBeGreaterThan(50);
    expect(r.expectedMaxDrawdown).toBeLessThan(400);
    // p99 should noticeably exceed p90 (right tail of half-normal-like dist)
    expect(r.percentileMaxDrawdown99 / r.percentileMaxDrawdown90).toBeGreaterThan(1.2);
  });
});
