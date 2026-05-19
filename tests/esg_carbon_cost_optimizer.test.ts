/**
 * W235 — ESG Compliance Score & Carbon-Cost Optimizer tests.
 *
 * 30 specs covering:
 *   - validation (12)
 *   - emissions calc (3)
 *   - carbon cost (2)
 *   - PPA economics (3)
 *   - ESG scores (3)
 *   - optimal PPA share (2)
 *   - EU CSRD + UK FCA compliance (3)
 *   - MC sensitivity (1)
 *   - determinism (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveEsgCarbon,
  simulateEsgCarbon,
} from '../src/features/esgCarbonCostOptimizer.js';

const baseCfg = {
  annualElectricityKwh: 5_000_000,    // 5 GWh/year (mid-size operator)
  gridCarbonIntensity: 0.25,           // UK grid 2024 ~ 0.21-0.30 kg/kWh
  scope1Emissions: 50,                 // 50 tCO₂ (small office gas + vehicles)
  scope3Emissions: 200,                // 200 tCO₂ (value chain)
  renewableShare: 0.50,                // 50% PPA
  ppaPremiumPerKwh: 0.005,             // £0.005/kWh premium
  carbonPricePerTonne: 75,             // £75/tCO₂ EU ETS
  operatorAnnualRevenue: 100_000_000,
  taxonomyAlignedRevenueShare: 0.45,
  socialScore: 0.70,
  governanceScore: 0.75,
  scope12ReductionTarget2030: 0.50,    // Paris-aligned
  sbtiAligned: true,
  transitionPlanPublished: true,
};

describe('esgCarbon — validation', () => {
  it('rejects negative kWh', () => {
    expect(() => solveEsgCarbon({ ...baseCfg, annualElectricityKwh: -100 })).toThrow();
  });
  it('rejects negative carbon intensity', () => {
    expect(() => solveEsgCarbon({ ...baseCfg, gridCarbonIntensity: -0.1 })).toThrow();
  });
  it('rejects negative scope1', () => {
    expect(() => solveEsgCarbon({ ...baseCfg, scope1Emissions: -10 })).toThrow();
  });
  it('rejects renewableShare out of [0, 1]', () => {
    expect(() => solveEsgCarbon({ ...baseCfg, renewableShare: 1.5 })).toThrow();
  });
  it('rejects negative ppaPremium', () => {
    expect(() => solveEsgCarbon({ ...baseCfg, ppaPremiumPerKwh: -0.01 })).toThrow();
  });
  it('rejects negative carbon price', () => {
    expect(() => solveEsgCarbon({ ...baseCfg, carbonPricePerTonne: -10 })).toThrow();
  });
  it('rejects revenue ≤ 0', () => {
    expect(() => solveEsgCarbon({ ...baseCfg, operatorAnnualRevenue: 0 })).toThrow();
  });
  it('rejects taxonomy share out of [0, 1]', () => {
    expect(() => solveEsgCarbon({ ...baseCfg, taxonomyAlignedRevenueShare: 1.5 })).toThrow();
  });
  it('rejects socialScore out of [0, 1]', () => {
    expect(() => solveEsgCarbon({ ...baseCfg, socialScore: 1.2 })).toThrow();
  });
  it('rejects governanceScore out of [0, 1]', () => {
    expect(() => solveEsgCarbon({ ...baseCfg, governanceScore: -0.1 })).toThrow();
  });
  it('rejects scope12 target out of [0, 1]', () => {
    expect(() => solveEsgCarbon({ ...baseCfg, scope12ReductionTarget2030: 1.5 })).toThrow();
  });
  it('rejects non-finite', () => {
    expect(() => solveEsgCarbon({ ...baseCfg, carbonPricePerTonne: NaN })).toThrow();
  });
});

describe('esgCarbon — emissions calc', () => {
  it('scope2 = kWh · (1−r) · intensity / 1000', () => {
    const r = solveEsgCarbon(baseCfg);
    const expected = (5_000_000 * 0.50 * 0.25) / 1000; // = 625 tCO₂
    expect(r.scope2TonnesPostPpa).toBeCloseTo(expected, 2);
  });
  it('total = scope1 + scope2 + scope3', () => {
    const r = solveEsgCarbon(baseCfg);
    expect(r.totalEmissionsTonnes).toBeCloseTo(
      r.scope1Tonnes + r.scope2TonnesPostPpa + r.scope3Tonnes,
      4,
    );
  });
  it('higher renewable share → lower scope2', () => {
    const a = solveEsgCarbon({ ...baseCfg, renewableShare: 0.2 });
    const b = solveEsgCarbon({ ...baseCfg, renewableShare: 0.9 });
    expect(b.scope2TonnesPostPpa).toBeLessThan(a.scope2TonnesPostPpa);
  });
});

describe('esgCarbon — carbon cost', () => {
  it('carbonCost = totalTonnes · price', () => {
    const r = solveEsgCarbon(baseCfg);
    expect(r.annualCarbonCost).toBeCloseTo(r.totalEmissionsTonnes * 75, 4);
  });
  it('higher carbon price → higher cost', () => {
    const a = solveEsgCarbon({ ...baseCfg, carbonPricePerTonne: 50 });
    const b = solveEsgCarbon({ ...baseCfg, carbonPricePerTonne: 150 });
    expect(b.annualCarbonCost).toBeGreaterThan(a.annualCarbonCost);
  });
});

describe('esgCarbon — PPA economics', () => {
  it('ppaPremium = kWh · r · premium_per_kWh', () => {
    const r = solveEsgCarbon(baseCfg);
    expect(r.annualPpaPremiumCost).toBeCloseTo(5_000_000 * 0.5 * 0.005, 2);
  });
  it('ppaCarbonSavings = kWh · r · intensity · price / 1000', () => {
    const r = solveEsgCarbon(baseCfg);
    expect(r.annualPpaCarbonSavings).toBeCloseTo(
      (5_000_000 * 0.5 * 0.25 * 75) / 1000,
      2,
    );
  });
  it('netPpaBenefit = savings − premium', () => {
    const r = solveEsgCarbon(baseCfg);
    expect(r.netPpaBenefit).toBeCloseTo(
      r.annualPpaCarbonSavings - r.annualPpaPremiumCost,
      4,
    );
  });
});

describe('esgCarbon — ESG scores', () => {
  it('all scores in [0, 1]', () => {
    const r = solveEsgCarbon(baseCfg);
    expect(r.environmentalScore).toBeGreaterThanOrEqual(0);
    expect(r.environmentalScore).toBeLessThanOrEqual(1);
    expect(r.esgCompositeScore).toBeGreaterThanOrEqual(0);
    expect(r.esgCompositeScore).toBeLessThanOrEqual(1);
  });
  it('composite = 0.4·E + 0.3·S + 0.3·G', () => {
    const r = solveEsgCarbon(baseCfg);
    const expected =
      0.4 * r.environmentalScore + 0.3 * baseCfg.socialScore + 0.3 * baseCfg.governanceScore;
    expect(r.esgCompositeScore).toBeCloseTo(expected, 4);
  });
  it('lower emissions intensity → higher E score', () => {
    const a = solveEsgCarbon({ ...baseCfg, scope3Emissions: 2000 });
    const b = solveEsgCarbon({ ...baseCfg, scope3Emissions: 50 });
    expect(b.environmentalScore).toBeGreaterThan(a.environmentalScore);
  });
});

describe('esgCarbon — optimal PPA share', () => {
  it('optimal r=1 when carbon savings > PPA premium', () => {
    // carbonValuePerKwh = intensity · price / 1000 = 0.25 · 75 / 1000 = £0.01875/kWh
    // ppaPremium = £0.005/kWh
    // 0.01875 > 0.005 → optimal = 1.0
    const r = solveEsgCarbon(baseCfg);
    expect(r.optimalRenewableShare).toBe(1.0);
  });
  it('optimal r=0 when PPA premium > carbon savings', () => {
    const r = solveEsgCarbon({ ...baseCfg, ppaPremiumPerKwh: 0.1, carbonPricePerTonne: 10 });
    // carbonValue = 0.25 · 10 / 1000 = £0.0025/kWh, premium = £0.1
    // 0.1 >> 0.0025 → optimal = 0
    expect(r.optimalRenewableShare).toBe(0);
  });
});

describe('esgCarbon — EU CSRD + UK FCA compliance', () => {
  it('CSRD compliant when target ≥ 0.42 + SBTi + transition plan', () => {
    const r = solveEsgCarbon(baseCfg);
    expect(r.isCompliantEuCsrd).toBe(true);
  });
  it('CSRD non-compliant when scope12 target < 0.42 (not Paris-aligned)', () => {
    const r = solveEsgCarbon({ ...baseCfg, scope12ReductionTarget2030: 0.30 });
    expect(r.isCompliantEuCsrd).toBe(false);
  });
  it('FCA TCFD compliant when transition plan published + targets set', () => {
    const r = solveEsgCarbon(baseCfg);
    expect(r.isCompliantUkFcaTcfd).toBe(true);
  });
});

describe('esgCarbon — MC sensitivity', () => {
  it('MC carbon cost mean within 15% of CF', () => {
    const cf = solveEsgCarbon(baseCfg);
    const mc = simulateEsgCarbon(baseCfg, 12345, 1000);
    const rel = Math.abs(mc.observedAnnualCarbonCostMean - cf.annualCarbonCost) / cf.annualCarbonCost;
    expect(rel).toBeLessThan(0.15);
  });
});

describe('esgCarbon — determinism', () => {
  it('same seed → identical MC', () => {
    const a = simulateEsgCarbon(baseCfg, 42, 500);
    const b = simulateEsgCarbon(baseCfg, 42, 500);
    expect(a.observedAnnualCarbonCostMean).toBe(b.observedAnnualCarbonCostMean);
  });
});
