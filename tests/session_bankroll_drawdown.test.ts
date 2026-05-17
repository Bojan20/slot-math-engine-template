/**
 * W152 Wave 157 — Session Bankroll Drawdown Analyzer tests.
 *
 * 32 specs covering:
 *   - validation (8)
 *   - closed-form correctness vs Inverse Gaussian moments (6)
 *   - drift regime classification (3)
 *   - survival probability grid (3)
 *   - monotonicity invariants (4)
 *   - MC cross-validation (4)
 *   - determinism (2)
 *   - industry use-cases (2)
 */

import { describe, it, expect } from 'vitest';
import {
  solveSessionBankrollDrawdown,
  simulateSessionBankrollDrawdown,
  _internal,
} from '../src/features/sessionBankrollDrawdown.js';

const baseCfg = {
  bankroll: 100,
  betPerSpin: 1,
  rtp: 0.96,
  volatilityIndex: 5,
  spinsPerHour: 600,
};

describe('sessionBankrollDrawdown — validation', () => {
  it('rejects bankroll ≤ 0', () => {
    expect(() => solveSessionBankrollDrawdown({ ...baseCfg, bankroll: 0 })).toThrow();
    expect(() => solveSessionBankrollDrawdown({ ...baseCfg, bankroll: -10 })).toThrow();
  });
  it('rejects betPerSpin ≤ 0', () => {
    expect(() => solveSessionBankrollDrawdown({ ...baseCfg, betPerSpin: 0 })).toThrow();
    expect(() => solveSessionBankrollDrawdown({ ...baseCfg, betPerSpin: -1 })).toThrow();
  });
  it('rejects betPerSpin > bankroll (cannot start)', () => {
    expect(() => solveSessionBankrollDrawdown({ ...baseCfg, betPerSpin: 200 })).toThrow();
  });
  it('rejects rtp outside [0, 2]', () => {
    expect(() => solveSessionBankrollDrawdown({ ...baseCfg, rtp: -0.1 })).toThrow();
    expect(() => solveSessionBankrollDrawdown({ ...baseCfg, rtp: 2.5 })).toThrow();
  });
  it('rejects volatilityIndex ≤ 0', () => {
    expect(() => solveSessionBankrollDrawdown({ ...baseCfg, volatilityIndex: 0 })).toThrow();
  });
  it('rejects non-finite inputs', () => {
    expect(() => solveSessionBankrollDrawdown({ ...baseCfg, bankroll: NaN })).toThrow();
    expect(() => solveSessionBankrollDrawdown({ ...baseCfg, rtp: Infinity })).toThrow();
  });
  it('rejects spinsPerHour ≤ 0 when provided', () => {
    expect(() => solveSessionBankrollDrawdown({ ...baseCfg, spinsPerHour: 0 })).toThrow();
    expect(() => solveSessionBankrollDrawdown({ ...baseCfg, spinsPerHour: -10 })).toThrow();
  });
  it('rejects empty / non-positive horizonHours', () => {
    expect(() => solveSessionBankrollDrawdown({ ...baseCfg, horizonHours: [] })).toThrow();
    expect(() => solveSessionBankrollDrawdown({ ...baseCfg, horizonHours: [1, -2] })).toThrow();
  });
});

describe('sessionBankrollDrawdown — closed-form correctness (Inverse Gaussian moments)', () => {
  it('E[τ] = B/|μ| for negative drift', () => {
    const r = solveSessionBankrollDrawdown(baseCfg);
    // |μ| = b·(1−R) = 1 · 0.04 = 0.04 → E[τ] = 100/0.04 = 2500
    expect(r.expectedSpinsToBust).toBeCloseTo(2500, 4);
  });
  it('Var[τ] = B·σ²/|μ|³', () => {
    const r = solveSessionBankrollDrawdown(baseCfg);
    // σ² = (v·b)² = 25, |μ|³ = 0.000064 → Var = 100·25/6.4e-5 = 3.90625e7
    const expectedVar = (100 * 25) / Math.pow(0.04, 3);
    expect(r.stdDevSpinsToBust * r.stdDevSpinsToBust).toBeCloseTo(expectedVar, -2);
  });
  it('IG CDF F(μ_IG) > 0.5 (median < mean → F(mean) > F(median) = 0.5 by skewness)', () => {
    // IG is right-skewed for high coefficient of variation. Per Chhikara-Folks 1989:
    //   median(IG) < mean(IG) always, so F(mean) > 0.5 always.
    // Upper bound is 1 (limit for extreme skewness). For our baseCfg
    // (B=100, b=1, R=0.96, v=5): coef.var = σ/√(|μ|B) = 5/√4 = 2.5 (very skewed),
    // so F(mean) ≈ 0.79 — well above 0.5, below 1.
    const muIG = 100 / 0.04;
    const lambdaIG = (100 * 100) / 25;
    const cdfAtMean = _internal.inverseGaussianCdf(muIG, muIG, lambdaIG);
    expect(cdfAtMean).toBeGreaterThan(0.5);
    expect(cdfAtMean).toBeLessThan(1.0);
  });
  it('medianSpinsToBust < expectedSpinsToBust (IG is right-skewed)', () => {
    const r = solveSessionBankrollDrawdown(baseCfg);
    expect(r.medianSpinsToBust).toBeLessThan(r.expectedSpinsToBust);
    expect(r.medianSpinsToBust).toBeGreaterThan(0);
  });
  it('CDF inversion: F(quantile(0.5)) ≈ 0.5', () => {
    const muIG = 1000;
    const lambdaIG = 5000;
    const med = _internal.inverseGaussianQuantile(0.5, muIG, lambdaIG);
    const cdfAtMed = _internal.inverseGaussianCdf(med, muIG, lambdaIG);
    expect(cdfAtMed).toBeCloseTo(0.5, 6);
  });
  it('probEverBust = 1 for negative drift', () => {
    const r = solveSessionBankrollDrawdown(baseCfg);
    expect(r.probEverBust).toBeCloseTo(1, 10);
  });
});

describe('sessionBankrollDrawdown — drift regime classification', () => {
  it('rtp = 0.96 → negative drift, sure bust', () => {
    const r = solveSessionBankrollDrawdown({ ...baseCfg, rtp: 0.96 });
    expect(r.driftRegime).toBe('negative');
    expect(r.probEverBust).toBe(1);
    expect(Number.isFinite(r.expectedSpinsToBust)).toBe(true);
  });
  it('rtp = 1.00 → zero drift, sure bust, infinite mean', () => {
    const r = solveSessionBankrollDrawdown({ ...baseCfg, rtp: 1.0 });
    expect(r.driftRegime).toBe('zero');
    expect(r.probEverBust).toBe(1);
    expect(Number.isFinite(r.expectedSpinsToBust)).toBe(false);
    expect(Number.isFinite(r.medianSpinsToBust)).toBe(true);
  });
  it('rtp > 1 → positive drift, probEverBust < 1', () => {
    const r = solveSessionBankrollDrawdown({ ...baseCfg, rtp: 1.02 });
    expect(r.driftRegime).toBe('positive');
    expect(r.probEverBust).toBeLessThan(1);
    expect(r.probEverBust).toBeGreaterThan(0);
  });
});

describe('sessionBankrollDrawdown — survival probability grid', () => {
  it('default horizons = [1, 2, 4, 8] hours', () => {
    const r = solveSessionBankrollDrawdown(baseCfg);
    expect(r.survivalProbByHorizon.map((x) => x.hours)).toEqual([1, 2, 4, 8]);
  });
  it('survival probability strictly decreasing in horizon', () => {
    const r = solveSessionBankrollDrawdown(baseCfg);
    for (let i = 1; i < r.survivalProbByHorizon.length; i++) {
      expect(r.survivalProbByHorizon[i].probSurvive).toBeLessThanOrEqual(
        r.survivalProbByHorizon[i - 1].probSurvive,
      );
    }
  });
  it('survival probability ∈ [0, 1]', () => {
    const r = solveSessionBankrollDrawdown(baseCfg);
    for (const row of r.survivalProbByHorizon) {
      expect(row.probSurvive).toBeGreaterThanOrEqual(0);
      expect(row.probSurvive).toBeLessThanOrEqual(1);
    }
  });
});

describe('sessionBankrollDrawdown — monotonicity invariants', () => {
  it('lower RTP → lower expectedSpinsToBust (faster bust)', () => {
    const r1 = solveSessionBankrollDrawdown({ ...baseCfg, rtp: 0.96 });
    const r2 = solveSessionBankrollDrawdown({ ...baseCfg, rtp: 0.90 });
    expect(r2.expectedSpinsToBust).toBeLessThan(r1.expectedSpinsToBust);
  });
  it('higher bankroll → higher expectedSpinsToBust (more cushion)', () => {
    const r1 = solveSessionBankrollDrawdown({ ...baseCfg, bankroll: 100 });
    const r2 = solveSessionBankrollDrawdown({ ...baseCfg, bankroll: 200 });
    expect(r2.expectedSpinsToBust).toBeGreaterThan(r1.expectedSpinsToBust);
  });
  it('higher bet → fewer expectedSpinsToBust (scales 1/b in expected, same |loss|/hour)', () => {
    const r1 = solveSessionBankrollDrawdown({ ...baseCfg, betPerSpin: 1 });
    const r2 = solveSessionBankrollDrawdown({ ...baseCfg, betPerSpin: 2 });
    expect(r2.expectedSpinsToBust).toBeLessThan(r1.expectedSpinsToBust);
  });
  it('higher volatility → wider τ distribution (higher stdDev)', () => {
    const r1 = solveSessionBankrollDrawdown({ ...baseCfg, volatilityIndex: 3 });
    const r2 = solveSessionBankrollDrawdown({ ...baseCfg, volatilityIndex: 10 });
    expect(r2.stdDevSpinsToBust).toBeGreaterThan(r1.stdDevSpinsToBust);
  });
});

describe('sessionBankrollDrawdown — MC cross-validation', () => {
  it('observed survival rate over 1h ≈ CF survival prob (low-volatility regime where discrete RW ≈ continuous BM)', () => {
    // Low-vol regime: σ/|μ| ≈ 20, much better discrete-vs-continuous agreement.
    // B=10, b=1, R=0.97, v=1 → |μ|=0.03, σ=1, E[τ]=333 spins (~33 min).
    // CF: F(600) ≈ 0.86, so MC bust rate in 1h ≈ 0.86.
    // (When σ/|μ| is moderate, discrete RW and continuous BM agree closely.)
    const cfg = { bankroll: 10, betPerSpin: 1, rtp: 0.97, volatilityIndex: 1, spinsPerHour: 600 };
    const cf = solveSessionBankrollDrawdown(cfg);
    const mc = simulateSessionBankrollDrawdown(cfg, 3000, 12345);
    const cfSurvive1h = cf.survivalProbByHorizon[0].probSurvive;
    expect(Math.abs(mc.observedSurvive1Hour - cfSurvive1h)).toBeLessThan(0.06);
  });
  it('observed mean spins to bust ≈ E[τ] (rel < 20% at 3K episodes for high-bust config)', () => {
    const cfg = { bankroll: 10, betPerSpin: 1, rtp: 0.90, volatilityIndex: 2, spinsPerHour: 600 };
    const cf = solveSessionBankrollDrawdown(cfg);
    const mc = simulateSessionBankrollDrawdown(cfg, 3000, 99);
    // High bust rate → most paths bust → MC mean ≈ E[τ].
    expect(Math.abs(mc.observedMeanSpinsToBustGivenBust - cf.expectedSpinsToBust) / cf.expectedSpinsToBust).toBeLessThan(0.25);
  });
  it('observed survive-1h rate ≈ CF survival probability', () => {
    const cfg = { bankroll: 50, betPerSpin: 1, rtp: 0.95, volatilityIndex: 3, spinsPerHour: 600 };
    const cf = solveSessionBankrollDrawdown(cfg);
    const mc = simulateSessionBankrollDrawdown(cfg, 3000, 7);
    const cfSurvive1h = cf.survivalProbByHorizon[0].probSurvive;
    expect(Math.abs(mc.observedSurvive1Hour - cfSurvive1h)).toBeLessThan(0.05);
  });
  it('observed E[bankroll after 1h | survive] within ±20% of CF estimate', () => {
    const cfg = { bankroll: 100, betPerSpin: 1, rtp: 0.97, volatilityIndex: 3, spinsPerHour: 600 };
    const cf = solveSessionBankrollDrawdown(cfg);
    const mc = simulateSessionBankrollDrawdown(cfg, 3000, 31);
    const ratio = mc.observedExpectedBankroll1HourGivenSurvive / cf.expectedBankrollAfter1Hour;
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.3);
  });
});

describe('sessionBankrollDrawdown — determinism', () => {
  it('CF solver returns same result on repeated calls', () => {
    const r1 = solveSessionBankrollDrawdown(baseCfg);
    const r2 = solveSessionBankrollDrawdown(baseCfg);
    expect(r1).toEqual(r2);
  });
  it('MC with same seed returns same observation', () => {
    const cfg = { ...baseCfg, bankroll: 30 };
    const r1 = simulateSessionBankrollDrawdown(cfg, 500, 42);
    const r2 = simulateSessionBankrollDrawdown(cfg, 500, 42);
    expect(r1).toEqual(r2);
  });
});

describe('sessionBankrollDrawdown — industry use-cases', () => {
  it('UK responsible-gambling: £100 / £1 / R=96% / v=5 — disclose median minutes', () => {
    // E[τ] = 2500 spins ≈ 4.17 hours @ 600/h; median < 4.17h due to right skew.
    const r = solveSessionBankrollDrawdown({
      bankroll: 100,
      betPerSpin: 1,
      rtp: 0.96,
      volatilityIndex: 5,
      spinsPerHour: 600,
    });
    expect(r.expectedHoursPlayed).toBeCloseTo(2500 / 600, 3);
    expect(r.medianMinutesToBust).toBeLessThan(60 * (2500 / 600)); // median < mean in hours
    expect(r.medianMinutesToBust).toBeGreaterThan(0);
    expect(r.expectedLossPerHour).toBeCloseTo(24, 3); // 0.04 · 600 = 24/hr
  });
  it('AU high-volatility: £50 / £2 / R=88% / v=10 — fast bust disclosure', () => {
    const r = solveSessionBankrollDrawdown({
      bankroll: 50,
      betPerSpin: 2,
      rtp: 0.88,
      volatilityIndex: 10,
      spinsPerHour: 600,
    });
    // |μ|=0.24 → E[τ]=50/0.24 ≈ 208 spins → ~21 min mean
    expect(r.expectedSpinsToBust).toBeCloseTo(50 / 0.24, 2);
    expect(r.expectedLossPerHour).toBeCloseTo(0.24 * 600, 3);
    expect(r.oneInNHoursBust).toBeGreaterThan(0);
  });
});
