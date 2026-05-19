/**
 * W232 — Multi-Currency FX Settlement Risk Analyzer tests.
 *
 * 32 specs covering:
 *   - validation (12)
 *   - portfolio variance (Markowitz quadratic) (4)
 *   - VaR computation (3)
 *   - Expected Shortfall (2)
 *   - hedging effectiveness (3)
 *   - IFRS 7 sensitivity (2)
 *   - concentration (HHI) (2)
 *   - UKGC RTS 16 compliance (2)
 *   - MC cross-validation (1)
 *   - determinism (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveMultiCurrencyFxRisk,
  simulateMultiCurrencyFxRisk,
} from '../src/features/multiCurrencyFxRisk.js';

const baseCfg = {
  currencies: ['GBP', 'EUR', 'USD'],
  dailyVolumes: [1_000_000, 600_000, 400_000],
  dailyVolatilities: [0.005, 0.006, 0.007],
  correlationMatrix: [
    [1.0, 0.6, 0.5],
    [0.6, 1.0, 0.7],
    [0.5, 0.7, 1.0],
  ],
  varConfidenceLevel: 0.99,
  varHorizonDays: 10,
  hedgeRatios: [0.3, 0.5, 0.4],
  basisRisk: 0.10,
  hedgingCostPerAnnum: 0.001,
  operatorOwnFunds: 10_000_000,
};

describe('multiCurrencyFx — validation', () => {
  it('rejects currencies length 0', () => {
    expect(() => solveMultiCurrencyFxRisk({ ...baseCfg, currencies: [], dailyVolumes: [], dailyVolatilities: [], correlationMatrix: [], hedgeRatios: [] })).toThrow();
  });
  it('rejects mismatched dailyVolumes length', () => {
    expect(() => solveMultiCurrencyFxRisk({ ...baseCfg, dailyVolumes: [1, 2] })).toThrow();
  });
  it('rejects negative volume', () => {
    expect(() =>
      solveMultiCurrencyFxRisk({ ...baseCfg, dailyVolumes: [1_000_000, -500_000, 400_000] }),
    ).toThrow();
  });
  it('rejects volatility ≤ 0 or > 1', () => {
    expect(() =>
      solveMultiCurrencyFxRisk({ ...baseCfg, dailyVolatilities: [0.005, 0, 0.007] }),
    ).toThrow();
    expect(() =>
      solveMultiCurrencyFxRisk({ ...baseCfg, dailyVolatilities: [0.005, 1.5, 0.007] }),
    ).toThrow();
  });
  it('rejects asymmetric correlation matrix', () => {
    const asym = [
      [1.0, 0.6, 0.5],
      [0.5, 1.0, 0.7], // asymmetric: ρ_01=0.6 but ρ_10=0.5
      [0.5, 0.7, 1.0],
    ];
    expect(() => solveMultiCurrencyFxRisk({ ...baseCfg, correlationMatrix: asym })).toThrow();
  });
  it('rejects non-1 diagonal', () => {
    const badDiag = [
      [0.9, 0.6, 0.5],
      [0.6, 1.0, 0.7],
      [0.5, 0.7, 1.0],
    ];
    expect(() => solveMultiCurrencyFxRisk({ ...baseCfg, correlationMatrix: badDiag })).toThrow();
  });
  it('rejects correlation entries out of [-1, 1]', () => {
    const badRange = [
      [1.0, 1.5, 0.5],
      [1.5, 1.0, 0.7],
      [0.5, 0.7, 1.0],
    ];
    expect(() => solveMultiCurrencyFxRisk({ ...baseCfg, correlationMatrix: badRange })).toThrow();
  });
  it('rejects varConfidenceLevel out of (0.5, 1)', () => {
    expect(() => solveMultiCurrencyFxRisk({ ...baseCfg, varConfidenceLevel: 0.4 })).toThrow();
  });
  it('rejects fractional varHorizonDays', () => {
    expect(() => solveMultiCurrencyFxRisk({ ...baseCfg, varHorizonDays: 5.5 })).toThrow();
  });
  it('rejects hedge ratios out of [0, 1]', () => {
    expect(() =>
      solveMultiCurrencyFxRisk({ ...baseCfg, hedgeRatios: [0.3, 1.5, 0.4] }),
    ).toThrow();
  });
  it('rejects basisRisk > 0.3', () => {
    expect(() => solveMultiCurrencyFxRisk({ ...baseCfg, basisRisk: 0.5 })).toThrow();
  });
  it('rejects negative hedgingCost', () => {
    expect(() => solveMultiCurrencyFxRisk({ ...baseCfg, hedgingCostPerAnnum: -0.001 })).toThrow();
  });
});

describe('multiCurrencyFx — portfolio variance', () => {
  it('totalPortfolioValue = Σ volumes', () => {
    const r = solveMultiCurrencyFxRisk(baseCfg);
    expect(r.totalPortfolioValue).toBeCloseTo(2_000_000, 4);
  });
  it('portfolioVariance > 0', () => {
    const r = solveMultiCurrencyFxRisk(baseCfg);
    expect(r.portfolioVariance).toBeGreaterThan(0);
  });
  it('hedgedVariance < unhedgedVariance (for positive h_i)', () => {
    const r = solveMultiCurrencyFxRisk(baseCfg);
    expect(r.hedgedPortfolioVariance).toBeLessThan(r.portfolioVariance);
  });
  it('zero correlations → Var = Σ (w·σ)² diagonal form', () => {
    const zeroCorr = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const r = solveMultiCurrencyFxRisk({ ...baseCfg, correlationMatrix: zeroCorr });
    let expected = 0;
    for (let i = 0; i < 3; i++) {
      expected += Math.pow(baseCfg.dailyVolumes[i] * baseCfg.dailyVolatilities[i], 2);
    }
    expect(r.portfolioVariance).toBeCloseTo(expected, 0);
  });
});

describe('multiCurrencyFx — VaR', () => {
  it('VaR hedged < VaR unhedged', () => {
    const r = solveMultiCurrencyFxRisk(baseCfg);
    expect(r.varAlphaTHorizonHedged).toBeLessThan(r.varAlphaTHorizonUnhedged);
  });
  it('higher confidence → higher VaR', () => {
    const a = solveMultiCurrencyFxRisk({ ...baseCfg, varConfidenceLevel: 0.95 });
    const b = solveMultiCurrencyFxRisk({ ...baseCfg, varConfidenceLevel: 0.999 });
    expect(b.varAlphaTHorizonHedged).toBeGreaterThan(a.varAlphaTHorizonHedged);
  });
  it('longer horizon → higher VaR (sqrt-T scaling)', () => {
    const a = solveMultiCurrencyFxRisk({ ...baseCfg, varHorizonDays: 1 });
    const b = solveMultiCurrencyFxRisk({ ...baseCfg, varHorizonDays: 100 });
    expect(b.varAlphaTHorizonHedged).toBeGreaterThan(a.varAlphaTHorizonHedged);
    // sqrt(100) = 10, sqrt(1) = 1 → ratio = 10
    expect(b.varAlphaTHorizonHedged / a.varAlphaTHorizonHedged).toBeCloseTo(10, 0);
  });
});

describe('multiCurrencyFx — Expected Shortfall', () => {
  it('ES ≥ VaR (coherent)', () => {
    const r = solveMultiCurrencyFxRisk(baseCfg);
    expect(r.expectedShortfallAlphaTHorizon).toBeGreaterThanOrEqual(r.varAlphaTHorizonHedged);
  });
  it('ES non-negative', () => {
    const r = solveMultiCurrencyFxRisk(baseCfg);
    expect(r.expectedShortfallAlphaTHorizon).toBeGreaterThanOrEqual(0);
  });
});

describe('multiCurrencyFx — hedging effectiveness', () => {
  it('zero hedging → hedgedVar = unhedgedVar', () => {
    const r = solveMultiCurrencyFxRisk({ ...baseCfg, hedgeRatios: [0, 0, 0] });
    expect(r.hedgedPortfolioVariance).toBeCloseTo(r.portfolioVariance, 0);
  });
  it('full hedging (h=1) sa basisRisk=0 → hedgedVar = 0', () => {
    const r = solveMultiCurrencyFxRisk({
      ...baseCfg,
      hedgeRatios: [1, 1, 1],
      basisRisk: 0,
    });
    expect(r.hedgedPortfolioVariance).toBeCloseTo(0, 0);
  });
  it('higher hedging cost → higher totalAnnualHedgingCost', () => {
    const a = solveMultiCurrencyFxRisk({ ...baseCfg, hedgingCostPerAnnum: 0.001 });
    const b = solveMultiCurrencyFxRisk({ ...baseCfg, hedgingCostPerAnnum: 0.005 });
    expect(b.totalAnnualHedgingCost).toBeGreaterThan(a.totalAnnualHedgingCost);
  });
});

describe('multiCurrencyFx — IFRS 7 sensitivity', () => {
  it('10% shock = 10% of volume per currency', () => {
    const r = solveMultiCurrencyFxRisk(baseCfg);
    expect(r.ifrs7SensitivityShock10pct[0]).toBeCloseTo(100_000, 4);
    expect(r.ifrs7SensitivityShock10pct[1]).toBeCloseTo(60_000, 4);
    expect(r.ifrs7SensitivityShock10pct[2]).toBeCloseTo(40_000, 4);
  });
  it('length matches currencies', () => {
    const r = solveMultiCurrencyFxRisk(baseCfg);
    expect(r.ifrs7SensitivityShock10pct.length).toBe(baseCfg.currencies.length);
  });
});

describe('multiCurrencyFx — concentration', () => {
  it('HHI = 1 for single currency', () => {
    const single = {
      ...baseCfg,
      currencies: ['GBP'],
      dailyVolumes: [2_000_000],
      dailyVolatilities: [0.005],
      correlationMatrix: [[1.0]],
      hedgeRatios: [0.3],
    };
    const r = solveMultiCurrencyFxRisk(single);
    expect(r.concentrationIndex).toBeCloseTo(1, 4);
  });
  it('HHI = 1/N for equal-weighted', () => {
    const equal = {
      ...baseCfg,
      dailyVolumes: [500_000, 500_000, 500_000],
    };
    const r = solveMultiCurrencyFxRisk(equal);
    expect(r.concentrationIndex).toBeCloseTo(1 / 3, 3);
  });
});

describe('multiCurrencyFx — UKGC RTS 16 compliance', () => {
  it('true when VaR < 50% ownFunds AND HHI < 0.7', () => {
    const r = solveMultiCurrencyFxRisk(baseCfg);
    expect(r.isCompliantUkgcRts16).toBe(true);
  });
  it('false when VaR > 50% ownFunds', () => {
    const r = solveMultiCurrencyFxRisk({ ...baseCfg, operatorOwnFunds: 10_000 });
    expect(r.isCompliantUkgcRts16).toBe(false);
  });
});

describe('multiCurrencyFx — MC cross-validation', () => {
  it('MC hedged portfolioStd within 10% of CF', () => {
    const cf = solveMultiCurrencyFxRisk(baseCfg);
    // MC simulates with hedged effective vols, so compare to sqrt(hedgedVar)
    const cfHedgedStd = Math.sqrt(cf.hedgedPortfolioVariance);
    const mc = simulateMultiCurrencyFxRisk(baseCfg, 12345, 5_000);
    const rel = Math.abs(mc.observedPortfolioStd - cfHedgedStd) / cfHedgedStd;
    expect(rel).toBeLessThan(0.10);
  });
});

describe('multiCurrencyFx — determinism', () => {
  it('same seed → identical MC', () => {
    const a = simulateMultiCurrencyFxRisk(baseCfg, 42, 500);
    const b = simulateMultiCurrencyFxRisk(baseCfg, 42, 500);
    expect(a.observedPortfolioStd).toBe(b.observedPortfolioStd);
  });
});
