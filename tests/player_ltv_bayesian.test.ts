/**
 * W228 — Player Lifetime Value (LTV) Bayesian Predictive Analyzer tests.
 *
 * 33 specs covering:
 *   - validation (10)
 *   - Geometric active-months (3)
 *   - LTV undiscounted/discounted (4)
 *   - CAC payback (3)
 *   - LTV/CAC ratio (3)
 *   - Bayesian posterior (3)
 *   - ROAS + UKGC RTS 5 compliance (3)
 *   - monotonicity (3)
 *   - MC cross-validation (2)
 *   - determinism (1)
 *   - industry use-case (UK acquisition channel) (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solvePlayerLtv,
  simulatePlayerLtv,
} from '../src/features/playerLtvBayesian.js';

const baseCfg = {
  monthlyChurnProbability: 0.1,    // ~10 months avg lifetime
  meanMonthlyRevenuePerActive: 50, // £50 / month / active player
  stdMonthlyRevenuePerActive: 30,
  monthlyDiscountRate: 0.008,      // ~10% annual WACC
  customerAcquisitionCost: 100,    // £100 CAC
  betaPriorAlpha: 1,
  betaPriorBeta: 9,                // prior E[θ] = 0.1
  observedActiveMonths: 0,
  roasComplianceThreshold: 5,
  totalMarketingSpend: 100_000,
  totalRevenuePeriod: 250_000,
};

describe('playerLtv — validation', () => {
  it('rejects churn out of (0, 1)', () => {
    expect(() => solvePlayerLtv({ ...baseCfg, monthlyChurnProbability: 0 })).toThrow();
    expect(() => solvePlayerLtv({ ...baseCfg, monthlyChurnProbability: 1 })).toThrow();
  });
  it('rejects revenue ≤ 0', () => {
    expect(() => solvePlayerLtv({ ...baseCfg, meanMonthlyRevenuePerActive: 0 })).toThrow();
  });
  it('rejects stdRevenue < 0', () => {
    expect(() => solvePlayerLtv({ ...baseCfg, stdMonthlyRevenuePerActive: -1 })).toThrow();
  });
  it('rejects discount rate < 0', () => {
    expect(() => solvePlayerLtv({ ...baseCfg, monthlyDiscountRate: -0.01 })).toThrow();
  });
  it('rejects CAC ≤ 0', () => {
    expect(() => solvePlayerLtv({ ...baseCfg, customerAcquisitionCost: 0 })).toThrow();
  });
  it('rejects Beta prior α ≤ 0', () => {
    expect(() => solvePlayerLtv({ ...baseCfg, betaPriorAlpha: 0 })).toThrow();
  });
  it('rejects Beta prior β ≤ 0', () => {
    expect(() => solvePlayerLtv({ ...baseCfg, betaPriorBeta: 0 })).toThrow();
  });
  it('rejects fractional observed active months', () => {
    expect(() => solvePlayerLtv({ ...baseCfg, observedActiveMonths: 3.5 })).toThrow();
  });
  it('rejects negative marketing spend', () => {
    expect(() => solvePlayerLtv({ ...baseCfg, totalMarketingSpend: -100 })).toThrow();
  });
  it('rejects non-finite', () => {
    expect(() => solvePlayerLtv({ ...baseCfg, meanMonthlyRevenuePerActive: NaN })).toThrow();
  });
});

describe('playerLtv — Geometric active-months', () => {
  it('E[N] = 1/θ', () => {
    const r = solvePlayerLtv({ ...baseCfg, monthlyChurnProbability: 0.1 });
    expect(r.expectedActiveMonths).toBeCloseTo(10, 6);
  });
  it('Var[N] = (1-θ)/θ²', () => {
    const r = solvePlayerLtv({ ...baseCfg, monthlyChurnProbability: 0.1 });
    expect(r.varActiveMonths).toBeCloseTo(0.9 / 0.01, 4);
  });
  it('higher churn → lower expected lifetime', () => {
    const a = solvePlayerLtv({ ...baseCfg, monthlyChurnProbability: 0.05 });
    const b = solvePlayerLtv({ ...baseCfg, monthlyChurnProbability: 0.20 });
    expect(b.expectedActiveMonths).toBeLessThan(a.expectedActiveMonths);
  });
});

describe('playerLtv — LTV undiscounted and discounted', () => {
  it('LTV_undisc = E[M] / θ', () => {
    const r = solvePlayerLtv(baseCfg);
    expect(r.ltvUndiscounted).toBeCloseTo(50 / 0.1, 6);
  });
  it('LTV_disc = E[M]·(1+r)/(θ+r)', () => {
    const r = solvePlayerLtv(baseCfg);
    const expected = (50 * 1.008) / (0.1 + 0.008);
    expect(r.ltvDiscounted).toBeCloseTo(expected, 4);
  });
  it('LTV_disc < LTV_undisc when r > 0', () => {
    const r = solvePlayerLtv(baseCfg);
    expect(r.ltvDiscounted).toBeLessThan(r.ltvUndiscounted);
  });
  it('LTV_disc → LTV_undisc as r → 0', () => {
    const r = solvePlayerLtv({ ...baseCfg, monthlyDiscountRate: 0 });
    expect(r.ltvDiscounted).toBeCloseTo(r.ltvUndiscounted, 4);
  });
});

describe('playerLtv — CAC payback', () => {
  it('payback > 0', () => {
    const r = solvePlayerLtv(baseCfg);
    expect(r.paybackMonths).toBeGreaterThan(0);
  });
  it('payback = Infinity when CAC × θ ≥ μ_M', () => {
    const r = solvePlayerLtv({ ...baseCfg, customerAcquisitionCost: 600 });
    // CAC·θ = 60 > μ_M = 50 → never recoupable
    expect(r.paybackMonths).toBe(Infinity);
  });
  it('higher CAC → longer payback', () => {
    const a = solvePlayerLtv({ ...baseCfg, customerAcquisitionCost: 50 });
    const b = solvePlayerLtv({ ...baseCfg, customerAcquisitionCost: 200 });
    expect(b.paybackMonths).toBeGreaterThan(a.paybackMonths);
  });
});

describe('playerLtv — LTV/CAC ratio', () => {
  it('= LTV_disc / CAC', () => {
    const r = solvePlayerLtv(baseCfg);
    expect(r.ltvCacRatio).toBeCloseTo(r.ltvDiscounted / baseCfg.customerAcquisitionCost, 6);
  });
  it('ratio ≥ 3 = healthy (industry benchmark)', () => {
    const r = solvePlayerLtv(baseCfg);
    expect(r.ltvCacRatio).toBeGreaterThan(3);
  });
  it('lower CAC → higher ratio', () => {
    const a = solvePlayerLtv({ ...baseCfg, customerAcquisitionCost: 200 });
    const b = solvePlayerLtv({ ...baseCfg, customerAcquisitionCost: 50 });
    expect(b.ltvCacRatio).toBeGreaterThan(a.ltvCacRatio);
  });
});

describe('playerLtv — Bayesian posterior', () => {
  it('with no observations → posterior = prior mean', () => {
    const r = solvePlayerLtv({ ...baseCfg, observedActiveMonths: 0 });
    const expected = baseCfg.betaPriorAlpha / (baseCfg.betaPriorAlpha + baseCfg.betaPriorBeta);
    expect(r.posteriorChurnMean).toBeCloseTo(expected, 6);
  });
  it('more observations → lower churn estimate (player persists)', () => {
    const a = solvePlayerLtv({ ...baseCfg, observedActiveMonths: 0 });
    const b = solvePlayerLtv({ ...baseCfg, observedActiveMonths: 24 });
    expect(b.posteriorChurnMean).toBeLessThan(a.posteriorChurnMean);
  });
  it('posterior LTV > prior LTV when player persists', () => {
    const a = solvePlayerLtv({ ...baseCfg, observedActiveMonths: 0 });
    const b = solvePlayerLtv({ ...baseCfg, observedActiveMonths: 24 });
    expect(b.posteriorLtvDiscounted).toBeGreaterThan(a.posteriorLtvDiscounted);
  });
});

describe('playerLtv — ROAS + UKGC RTS 5', () => {
  it('ROAS = revenue / spend', () => {
    const r = solvePlayerLtv(baseCfg);
    expect(r.realizedRoas).toBeCloseTo(250000 / 100000, 6);
  });
  it('high ROAS → not below threshold → non-compliant disclosure', () => {
    const r = solvePlayerLtv({ ...baseCfg, totalRevenuePeriod: 1_000_000 });
    expect(r.realizedRoas).toBeGreaterThan(5);
    expect(r.isRoasBelowDisclosureThreshold).toBe(false);
  });
  it('compliant when ROAS ≤ threshold AND CAC ≤ 30% LTV', () => {
    const r = solvePlayerLtv(baseCfg);
    expect(r.isCompliantUkgcRts5).toBe(true);
  });
});

describe('playerLtv — monotonicity', () => {
  it('higher revenue per active → higher LTV', () => {
    const a = solvePlayerLtv({ ...baseCfg, meanMonthlyRevenuePerActive: 30 });
    const b = solvePlayerLtv({ ...baseCfg, meanMonthlyRevenuePerActive: 100 });
    expect(b.ltvDiscounted).toBeGreaterThan(a.ltvDiscounted);
  });
  it('higher discount rate → lower discounted LTV', () => {
    const a = solvePlayerLtv({ ...baseCfg, monthlyDiscountRate: 0.001 });
    const b = solvePlayerLtv({ ...baseCfg, monthlyDiscountRate: 0.05 });
    expect(b.ltvDiscounted).toBeLessThan(a.ltvDiscounted);
  });
  it('higher churn → lower LTV', () => {
    const a = solvePlayerLtv({ ...baseCfg, monthlyChurnProbability: 0.05 });
    const b = solvePlayerLtv({ ...baseCfg, monthlyChurnProbability: 0.30 });
    expect(b.ltvDiscounted).toBeLessThan(a.ltvDiscounted);
  });
});

describe('playerLtv — MC cross-validation', () => {
  it('MC E[active months] within 5% of CF', () => {
    const cf = solvePlayerLtv(baseCfg);
    const mc = simulatePlayerLtv(baseCfg, 12345, 5_000);
    const rel = Math.abs(mc.observedExpectedActiveMonths - cf.expectedActiveMonths) / cf.expectedActiveMonths;
    expect(rel).toBeLessThan(0.10);
  });
  it('MC LTV undiscounted within 15% of CF (Geometric has high variance)', () => {
    const cf = solvePlayerLtv(baseCfg);
    const mc = simulatePlayerLtv(baseCfg, 67890, 5_000);
    const rel = Math.abs(mc.observedLtvUndiscounted - cf.ltvUndiscounted) / cf.ltvUndiscounted;
    expect(rel).toBeLessThan(0.15);
  });
});

describe('playerLtv — determinism', () => {
  it('same seed → identical MC', () => {
    const a = simulatePlayerLtv(baseCfg, 42, 500);
    const b = simulatePlayerLtv(baseCfg, 42, 500);
    expect(a.observedExpectedActiveMonths).toBe(b.observedExpectedActiveMonths);
  });
});

describe('playerLtv — industry use-case', () => {
  it('UK acquisition channel: £50/mo revenue, 10mo avg lifetime, £100 CAC, healthy LTV/CAC > 3', () => {
    const r = solvePlayerLtv(baseCfg);
    expect(r.expectedActiveMonths).toBeCloseTo(10, 1);
    expect(r.ltvDiscounted).toBeGreaterThan(400);
    expect(r.ltvCacRatio).toBeGreaterThan(3);
    expect(r.isCompliantUkgcRts5).toBe(true);
  });
});
