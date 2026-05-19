/**
 * W234 — Cybersecurity Breach Cost Quantification Analyzer tests.
 *
 * 30 specs covering:
 *   - validation (12)
 *   - breach rate + investment effect (3)
 *   - Pareto moments (3)
 *   - compound Poisson aggregate (3)
 *   - VaR (2)
 *   - ROI (2)
 *   - fine exposure (2)
 *   - NIS2 compliance (2)
 *   - MC cross-validation (1)
 *   - determinism (1)
 *   - industry use-case (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveCybersecurityBreach,
  simulateCybersecurityBreach,
} from '../src/features/cybersecurityBreachCost.js';

const baseCfg = {
  annualBreachRate: 0.08,             // lower so effectiveRate ≤ 0.10 for NIS2 compliance
  paretoAlpha: 2.5,
  paretoScale: 1_000_000,             // $1M scale
  annualSecurityInvestment: 500_000,
  investmentEffectivenessCoeff: 1e-7,
  operatorAnnualRevenue: 50_000_000,
  gdprFineCapFraction: 0.04,
  probFineGivenBreach: 0.40,
  expectedFineWhenFined: 2_000_000,
  horizonYears: 3,
  varConfidenceLevel: 0.99,
  breachResponseTimeHours: 48,
};

describe('cybersecurityBreach — validation', () => {
  it('rejects annualBreachRate ≤ 0', () => {
    expect(() => solveCybersecurityBreach({ ...baseCfg, annualBreachRate: 0 })).toThrow();
  });
  it('rejects paretoAlpha out of (1.1, 5]', () => {
    expect(() => solveCybersecurityBreach({ ...baseCfg, paretoAlpha: 0.5 })).toThrow();
    expect(() => solveCybersecurityBreach({ ...baseCfg, paretoAlpha: 10 })).toThrow();
  });
  it('rejects paretoScale ≤ 0', () => {
    expect(() => solveCybersecurityBreach({ ...baseCfg, paretoScale: 0 })).toThrow();
  });
  it('rejects negative investment', () => {
    expect(() =>
      solveCybersecurityBreach({ ...baseCfg, annualSecurityInvestment: -100 }),
    ).toThrow();
  });
  it('rejects negative effectiveness coeff', () => {
    expect(() =>
      solveCybersecurityBreach({ ...baseCfg, investmentEffectivenessCoeff: -1e-7 }),
    ).toThrow();
  });
  it('rejects operator revenue ≤ 0', () => {
    expect(() => solveCybersecurityBreach({ ...baseCfg, operatorAnnualRevenue: 0 })).toThrow();
  });
  it('rejects GDPR fine cap > 0.1', () => {
    expect(() => solveCybersecurityBreach({ ...baseCfg, gdprFineCapFraction: 0.5 })).toThrow();
  });
  it('rejects probFineGivenBreach out of (0, 1]', () => {
    expect(() => solveCybersecurityBreach({ ...baseCfg, probFineGivenBreach: 0 })).toThrow();
    expect(() => solveCybersecurityBreach({ ...baseCfg, probFineGivenBreach: 1.5 })).toThrow();
  });
  it('rejects negative expectedFineWhenFined', () => {
    expect(() => solveCybersecurityBreach({ ...baseCfg, expectedFineWhenFined: -100 })).toThrow();
  });
  it('rejects horizonYears ≤ 0', () => {
    expect(() => solveCybersecurityBreach({ ...baseCfg, horizonYears: 0 })).toThrow();
  });
  it('rejects varConfidenceLevel out of (0.5, 1)', () => {
    expect(() => solveCybersecurityBreach({ ...baseCfg, varConfidenceLevel: 0.4 })).toThrow();
  });
  it('rejects non-finite', () => {
    expect(() => solveCybersecurityBreach({ ...baseCfg, annualBreachRate: NaN })).toThrow();
  });
});

describe('cybersecurityBreach — investment effect', () => {
  it('zero investment → effectiveRate = baseline', () => {
    const r = solveCybersecurityBreach({ ...baseCfg, annualSecurityInvestment: 0 });
    expect(r.effectiveBreachRate).toBeCloseTo(baseCfg.annualBreachRate, 6);
  });
  it('higher investment → lower effectiveRate', () => {
    const a = solveCybersecurityBreach({ ...baseCfg, annualSecurityInvestment: 100_000 });
    const b = solveCybersecurityBreach({ ...baseCfg, annualSecurityInvestment: 5_000_000 });
    expect(b.effectiveBreachRate).toBeLessThan(a.effectiveBreachRate);
  });
  it('effectiveRate = baseline · exp(−k·I)', () => {
    const r = solveCybersecurityBreach(baseCfg);
    const expected =
      baseCfg.annualBreachRate * Math.exp(-baseCfg.investmentEffectivenessCoeff * baseCfg.annualSecurityInvestment);
    expect(r.effectiveBreachRate).toBeCloseTo(expected, 6);
  });
});

describe('cybersecurityBreach — Pareto moments', () => {
  it('E[C] = α·xm/(α−1)', () => {
    const r = solveCybersecurityBreach(baseCfg);
    expect(r.expectedCostPerBreach).toBeCloseTo((2.5 * 1_000_000) / 1.5, 0);
  });
  it('Var[C] defined when α > 2', () => {
    const r = solveCybersecurityBreach({ ...baseCfg, paretoAlpha: 3 });
    expect(r.varianceCostPerBreach).toBeGreaterThan(0);
    expect(Number.isFinite(r.varianceCostPerBreach)).toBe(true);
  });
  it('higher α → lower E[C]', () => {
    const a = solveCybersecurityBreach({ ...baseCfg, paretoAlpha: 1.5 });
    const b = solveCybersecurityBreach({ ...baseCfg, paretoAlpha: 3.0 });
    expect(b.expectedCostPerBreach).toBeLessThan(a.expectedCostPerBreach);
  });
});

describe('cybersecurityBreach — compound Poisson', () => {
  it('E[S_T] = λ · T · E[C]', () => {
    const r = solveCybersecurityBreach(baseCfg);
    const expected = r.effectiveBreachRate * baseCfg.horizonYears * r.expectedCostPerBreach;
    expect(r.expectedAnnualLoss).toBeCloseTo(expected, 0);
  });
  it('higher rate → higher expected loss', () => {
    const a = solveCybersecurityBreach({ ...baseCfg, annualBreachRate: 0.1 });
    const b = solveCybersecurityBreach({ ...baseCfg, annualBreachRate: 0.5 });
    expect(b.expectedAnnualLoss).toBeGreaterThan(a.expectedAnnualLoss);
  });
  it('std > 0', () => {
    const r = solveCybersecurityBreach(baseCfg);
    expect(r.stdAnnualLoss).toBeGreaterThan(0);
  });
});

describe('cybersecurityBreach — VaR', () => {
  it('VaR > expectedLoss (right tail)', () => {
    const r = solveCybersecurityBreach(baseCfg);
    expect(r.varAlphaTHorizon).toBeGreaterThan(r.expectedAnnualLoss);
  });
  it('higher confidence → higher VaR', () => {
    const a = solveCybersecurityBreach({ ...baseCfg, varConfidenceLevel: 0.95 });
    const b = solveCybersecurityBreach({ ...baseCfg, varConfidenceLevel: 0.999 });
    expect(b.varAlphaTHorizon).toBeGreaterThan(a.varAlphaTHorizon);
  });
});

describe('cybersecurityBreach — ROI', () => {
  it('zero investment → ROI = 0', () => {
    const r = solveCybersecurityBreach({ ...baseCfg, annualSecurityInvestment: 0 });
    expect(r.securityInvestmentROI).toBeCloseTo(0, 6);
  });
  it('positive ROI for high-impact investment in high-breach baseline', () => {
    const r = solveCybersecurityBreach({
      ...baseCfg,
      annualBreachRate: 1.0,           // very high baseline
      annualSecurityInvestment: 100_000,
      investmentEffectivenessCoeff: 1e-5, // very effective
      horizonYears: 5,
    });
    expect(r.securityInvestmentROI).toBeGreaterThan(0);
  });
});

describe('cybersecurityBreach — fine exposure', () => {
  it('fine = effRate · P_fine · E[fine]', () => {
    const r = solveCybersecurityBreach(baseCfg);
    const expected =
      r.effectiveBreachRate * baseCfg.probFineGivenBreach * baseCfg.expectedFineWhenFined;
    expect(r.expectedAnnualFineExposure).toBeCloseTo(expected, 4);
  });
  it('capped at GDPR 4% revenue', () => {
    const r = solveCybersecurityBreach({
      ...baseCfg,
      probFineGivenBreach: 1.0,
      expectedFineWhenFined: 100_000_000_000, // huge
      operatorAnnualRevenue: 1_000_000_000,
      gdprFineCapFraction: 0.04,
    });
    expect(r.cappedAnnualFineExposure).toBeCloseTo(40_000_000, 0);
  });
});

describe('cybersecurityBreach — NIS2 compliance', () => {
  it('true for compliant operator (low breach rate + 1% investment + 72h SLA)', () => {
    const r = solveCybersecurityBreach(baseCfg);
    expect(r.isCompliantNis2).toBe(true);
  });
  it('false when breach response > 72h', () => {
    const r = solveCybersecurityBreach({ ...baseCfg, breachResponseTimeHours: 168 });
    expect(r.isCompliantNis2).toBe(false);
  });
});

describe('cybersecurityBreach — MC cross-validation', () => {
  it('MC mean within 20% of CF', () => {
    const cf = solveCybersecurityBreach(baseCfg);
    const mc = simulateCybersecurityBreach(baseCfg, 12345, 3000);
    const rel = Math.abs(mc.observedAnnualLossMean - cf.expectedAnnualLoss) / Math.max(cf.expectedAnnualLoss, 1);
    expect(rel).toBeLessThan(0.20);
  });
});

describe('cybersecurityBreach — determinism', () => {
  it('same seed → identical MC', () => {
    const a = simulateCybersecurityBreach(baseCfg, 42, 500);
    const b = simulateCybersecurityBreach(baseCfg, 42, 500);
    expect(a.observedAnnualLossMean).toBe(b.observedAnnualLossMean);
  });
});

describe('cybersecurityBreach — industry use-case', () => {
  it('UK gambling operator post-Marriott-fine baseline', () => {
    const r = solveCybersecurityBreach(baseCfg);
    expect(r.isCompliantNis2).toBe(true);
    expect(r.expectedAnnualLoss).toBeGreaterThan(0);
    expect(r.cyberResilienceScore).toBeGreaterThan(0);
    expect(r.cyberResilienceScore).toBeLessThanOrEqual(1);
  });
});
