/**
 * W224 — Customer Affordability Stratification Analyzer tests.
 *
 * 33 specs covering:
 *   - validation (9)
 *   - distribution summaries (4)
 *   - tier distribution sums to 1 (2)
 *   - threshold-crossing probabilities (4)
 *   - annual projections (3)
 *   - rolling K-of-M trigger (3)
 *   - financial vulnerability score (3)
 *   - UKGC RTS 14E compliance (2)
 *   - MC cross-validation (2)
 *   - determinism (1)
 *   - industry use-case (UK regulator-baseline player) (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveCustomerAffordability,
  simulateCustomerAffordability,
} from '../src/features/customerAffordabilityStratification.js';

const baseCfg = {
  monthlySpendLogMean: 4.5, // median ≈ £90
  monthlySpendLogStd: 1.5,
  currency: '£',
  lowHarmThreshold: 100,
  enhancedThreshold: 500,
  fullCheckThreshold: 2000,
  rollingWindowMonths: 6,
  rollingTriggerK: 3,
};

describe('customerAffordability — validation', () => {
  it('rejects non-finite monthlySpendLogMean', () => {
    expect(() => solveCustomerAffordability({ ...baseCfg, monthlySpendLogMean: NaN })).toThrow();
  });
  it('rejects monthlySpendLogStd ≤ 0', () => {
    expect(() => solveCustomerAffordability({ ...baseCfg, monthlySpendLogStd: 0 })).toThrow();
  });
  it('rejects empty currency', () => {
    expect(() => solveCustomerAffordability({ ...baseCfg, currency: '' })).toThrow();
  });
  it('rejects thresholds with lowHarm ≥ enhanced', () => {
    expect(() =>
      solveCustomerAffordability({ ...baseCfg, lowHarmThreshold: 500, enhancedThreshold: 500 }),
    ).toThrow();
  });
  it('rejects thresholds with enhanced ≥ fullCheck', () => {
    expect(() =>
      solveCustomerAffordability({ ...baseCfg, enhancedThreshold: 2000 }),
    ).toThrow();
  });
  it('rejects rollingWindowMonths > 24', () => {
    expect(() =>
      solveCustomerAffordability({ ...baseCfg, rollingWindowMonths: 30 }),
    ).toThrow();
  });
  it('rejects fractional rollingWindowMonths', () => {
    expect(() =>
      solveCustomerAffordability({ ...baseCfg, rollingWindowMonths: 6.5 }),
    ).toThrow();
  });
  it('rejects rollingTriggerK > rollingWindowMonths', () => {
    expect(() =>
      solveCustomerAffordability({ ...baseCfg, rollingTriggerK: 8 }),
    ).toThrow();
  });
  it('rejects rollingTriggerK < 1', () => {
    expect(() =>
      solveCustomerAffordability({ ...baseCfg, rollingTriggerK: 0 }),
    ).toThrow();
  });
});

describe('customerAffordability — distribution summaries', () => {
  it('mean = exp(μ + σ²/2)', () => {
    const r = solveCustomerAffordability({ ...baseCfg, monthlySpendLogMean: 4.5, monthlySpendLogStd: 1.5 });
    const expected = Math.exp(4.5 + 1.5 * 1.5 / 2);
    expect(r.meanMonthlySpend).toBeCloseTo(expected, 4);
  });
  it('median = exp(μ)', () => {
    const r = solveCustomerAffordability({ ...baseCfg, monthlySpendLogMean: 4.5 });
    expect(r.medianMonthlySpend).toBeCloseTo(Math.exp(4.5), 4);
  });
  it('CoeffVar = sqrt(exp(σ²) - 1)', () => {
    const r = solveCustomerAffordability({ ...baseCfg, monthlySpendLogStd: 1.0 });
    expect(r.monthlySpendCoeffVar).toBeCloseTo(Math.sqrt(Math.exp(1) - 1), 3);
  });
  it('p99 > p95 > p90 > p75 > median', () => {
    const r = solveCustomerAffordability(baseCfg);
    expect(r.monthlySpendP99).toBeGreaterThan(r.monthlySpendP95);
    expect(r.monthlySpendP95).toBeGreaterThan(r.monthlySpendP90);
    expect(r.monthlySpendP90).toBeGreaterThan(r.monthlySpendP75);
    expect(r.monthlySpendP75).toBeGreaterThan(r.medianMonthlySpend);
  });
});

describe('customerAffordability — tier distribution', () => {
  it('tier probabilities sum to 1', () => {
    const r = solveCustomerAffordability(baseCfg);
    const sum =
      r.tierDistribution.T0_noCheck +
      r.tierDistribution.T1_lightCheck +
      r.tierDistribution.T2_lowHarmReview +
      r.tierDistribution.T3_enhancedCheck +
      r.tierDistribution.T4_fullFinancialReview;
    expect(sum).toBeCloseTo(1, 9);
  });
  it('higher tiers monotonically smaller for typical Log-Normal user', () => {
    const r = solveCustomerAffordability(baseCfg);
    // T4 < T3 (right-tail heavier-than-normal but still decreasing for large thresholds)
    expect(r.tierDistribution.T4_fullFinancialReview).toBeLessThan(r.tierDistribution.T3_enhancedCheck);
  });
});

describe('customerAffordability — threshold crossings', () => {
  it('probAbove decreases as threshold increases', () => {
    const r = solveCustomerAffordability(baseCfg);
    expect(r.probAboveLowHarmThreshold).toBeGreaterThan(r.probAboveEnhancedThreshold);
    expect(r.probAboveEnhancedThreshold).toBeGreaterThan(r.probAboveFullCheckThreshold);
  });
  it('all probAbove in [0, 1]', () => {
    const r = solveCustomerAffordability(baseCfg);
    expect(r.probAboveLowHarmThreshold).toBeGreaterThanOrEqual(0);
    expect(r.probAboveLowHarmThreshold).toBeLessThanOrEqual(1);
    expect(r.probAboveFullCheckThreshold).toBeGreaterThanOrEqual(0);
    expect(r.probAboveFullCheckThreshold).toBeLessThanOrEqual(1);
  });
  it('low-spender (μ = 3 → median £20): probAbove £100 small', () => {
    const r = solveCustomerAffordability({ ...baseCfg, monthlySpendLogMean: 3, monthlySpendLogStd: 0.8 });
    expect(r.probAboveLowHarmThreshold).toBeLessThan(0.1);
  });
  it('high-roller (μ = 7 → median £1100): probAbove £500 high', () => {
    const r = solveCustomerAffordability({ ...baseCfg, monthlySpendLogMean: 7, monthlySpendLogStd: 1.0 });
    expect(r.probAboveEnhancedThreshold).toBeGreaterThan(0.7);
  });
});

describe('customerAffordability — annual projections', () => {
  it('expectedMonthsAboveLowHarm = 12 · probAboveLowHarm', () => {
    const r = solveCustomerAffordability(baseCfg);
    expect(r.expectedMonthsAboveLowHarm).toBeCloseTo(12 * r.probAboveLowHarmThreshold, 6);
  });
  it('annual checks correspond directly to expected-months values', () => {
    const r = solveCustomerAffordability(baseCfg);
    expect(r.annualLowHarmReviewsExpected).toBeCloseTo(r.expectedMonthsAboveLowHarm, 6);
    expect(r.annualEnhancedChecksExpected).toBeCloseTo(r.expectedMonthsAboveEnhanced, 6);
    expect(r.annualFullFinancialReviewsExpected).toBeCloseTo(r.expectedMonthsAboveFullCheck, 6);
  });
  it('annualLowHarm ≥ annualEnhanced ≥ annualFull', () => {
    const r = solveCustomerAffordability(baseCfg);
    expect(r.annualLowHarmReviewsExpected).toBeGreaterThanOrEqual(r.annualEnhancedChecksExpected);
    expect(r.annualEnhancedChecksExpected).toBeGreaterThanOrEqual(r.annualFullFinancialReviewsExpected);
  });
});

describe('customerAffordability — rolling K-of-M trigger', () => {
  it('rollingTriggerProbPerWindow ∈ [0, 1]', () => {
    const r = solveCustomerAffordability(baseCfg);
    expect(r.rollingTriggerProbPerWindow).toBeGreaterThanOrEqual(0);
    expect(r.rollingTriggerProbPerWindow).toBeLessThanOrEqual(1);
  });
  it('higher K → lower trigger prob (ceteris paribus)', () => {
    const a = solveCustomerAffordability({ ...baseCfg, rollingTriggerK: 2 });
    const b = solveCustomerAffordability({ ...baseCfg, rollingTriggerK: 6 });
    expect(b.rollingTriggerProbPerWindow).toBeLessThan(a.rollingTriggerProbPerWindow);
  });
  it('expectedRollingTriggersPerYear = (12 − M + 1) · rollingTriggerProbPerWindow', () => {
    const r = solveCustomerAffordability(baseCfg);
    const expected = (12 - baseCfg.rollingWindowMonths + 1) * r.rollingTriggerProbPerWindow;
    expect(r.expectedRollingTriggersPerYear).toBeCloseTo(expected, 9);
  });
});

describe('customerAffordability — vulnerability score', () => {
  it('∈ [0, 1]', () => {
    const r = solveCustomerAffordability(baseCfg);
    expect(r.financialVulnerabilityScore).toBeGreaterThanOrEqual(0);
    expect(r.financialVulnerabilityScore).toBeLessThanOrEqual(1);
  });
  it('low spender → low vulnerability', () => {
    const r = solveCustomerAffordability({ ...baseCfg, monthlySpendLogMean: 2, monthlySpendLogStd: 0.5 });
    expect(r.financialVulnerabilityScore).toBeLessThan(0.05);
  });
  it('high roller → high vulnerability', () => {
    const r = solveCustomerAffordability({ ...baseCfg, monthlySpendLogMean: 8, monthlySpendLogStd: 1.5 });
    expect(r.financialVulnerabilityScore).toBeGreaterThan(0.7);
  });
});

describe('customerAffordability — UKGC RTS 14E compliance', () => {
  it('true for UKGC defaults', () => {
    const r = solveCustomerAffordability(baseCfg);
    expect(r.isCompliantUkgcRts14e).toBe(true);
  });
  it('false when lowHarmThreshold > £100', () => {
    const r = solveCustomerAffordability({ ...baseCfg, lowHarmThreshold: 200, enhancedThreshold: 600 });
    expect(r.isCompliantUkgcRts14e).toBe(false);
  });
});

describe('customerAffordability — MC cross-validation', () => {
  it('MC mean within 5% of CF', () => {
    const cf = solveCustomerAffordability(baseCfg);
    const mc = simulateCustomerAffordability(baseCfg, 12345, 3000);
    const rel = Math.abs(cf.meanMonthlySpend - mc.observedMeanMonthlySpend) / cf.meanMonthlySpend;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC P_above_enhanced within 2pp of CF', () => {
    const cf = solveCustomerAffordability(baseCfg);
    const mc = simulateCustomerAffordability(baseCfg, 67890, 3000);
    expect(
      Math.abs(cf.probAboveEnhancedThreshold - mc.observedProbAboveEnhanced),
    ).toBeLessThan(0.02);
  });
});

describe('customerAffordability — determinism', () => {
  it('same seed → identical MC', () => {
    const a = simulateCustomerAffordability(baseCfg, 42, 500);
    const b = simulateCustomerAffordability(baseCfg, 42, 500);
    expect(a.observedMeanMonthlySpend).toBe(b.observedMeanMonthlySpend);
  });
});

describe('customerAffordability — industry use-case', () => {
  it('UK regulator-baseline (median £85, σ=1.5) — realistic annual check counts', () => {
    const r = solveCustomerAffordability(baseCfg);
    expect(r.isCompliantUkgcRts14e).toBe(true);
    expect(r.medianMonthlySpend).toBeGreaterThan(50);
    expect(r.medianMonthlySpend).toBeLessThan(150);
    expect(r.annualLowHarmReviewsExpected).toBeGreaterThan(0);
    expect(r.annualLowHarmReviewsExpected).toBeLessThan(12);
  });
});
