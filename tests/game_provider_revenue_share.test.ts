import { describe, it, expect } from 'vitest';
import { solveRevenueShare, simulateRevenueShare } from '../src/features/gameProviderRevenueShareOptimizer.js';

const baseCfg = {
  providers: [
    { providerName: 'Pragmatic', revenueSharePct: 0.20, engagementMultiplier: 1.4, annualGgrPotential: 5_000_000, minimumMonthlyFee: 10_000, annualContentRefreshRequired: 20, isTier1Premium: true },
    { providerName: 'Vendor D', revenueSharePct: 0.22, engagementMultiplier: 1.3, annualGgrPotential: 3_000_000, minimumMonthlyFee: 8_000, annualContentRefreshRequired: 15, isTier1Premium: true },
    { providerName: 'Hacksaw', revenueSharePct: 0.25, engagementMultiplier: 1.1, annualGgrPotential: 2_000_000, minimumMonthlyFee: 5_000, annualContentRefreshRequired: 10, isTier1Premium: false },
    { providerName: 'Smaller', revenueSharePct: 0.30, engagementMultiplier: 0.9, annualGgrPotential: 1_000_000, minimumMonthlyFee: 2_000, annualContentRefreshRequired: 5, isTier1Premium: false },
  ],
  operatorTotalGgrCapacity: 20_000_000,
  marketingBudgetPerProvider: 50_000,
  tier1MinimumSharePct: 0.30,
};

describe('revenueShare — validation', () => {
  it('rejects empty providers', () => {
    expect(() => solveRevenueShare({ ...baseCfg, providers: [] })).toThrow();
  });
  it('rejects too many providers', () => {
    const tooMany = Array.from({ length: 60 }, (_, i) => ({ ...baseCfg.providers[0], providerName: `P${i}` }));
    expect(() => solveRevenueShare({ ...baseCfg, providers: tooMany })).toThrow();
  });
  it('rejects bad share %', () => {
    const bad = [{ ...baseCfg.providers[0], revenueSharePct: 0.05 }];
    expect(() => solveRevenueShare({ ...baseCfg, providers: bad })).toThrow();
  });
  it('rejects bad engagement', () => {
    const bad = [{ ...baseCfg.providers[0], engagementMultiplier: 3.0 }];
    expect(() => solveRevenueShare({ ...baseCfg, providers: bad })).toThrow();
  });
  it('rejects negative GGR', () => {
    const bad = [{ ...baseCfg.providers[0], annualGgrPotential: -100 }];
    expect(() => solveRevenueShare({ ...baseCfg, providers: bad })).toThrow();
  });
});

describe('revenueShare — math', () => {
  it('positive net revenue for healthy portfolio', () => {
    const r = solveRevenueShare(baseCfg);
    expect(r.totalOperatorNetRevenue).toBeGreaterThan(0);
  });
  it('supplier payment includes minFee × 12', () => {
    const r = solveRevenueShare(baseCfg);
    // First provider: 20% of GGR + 10K × 12 = 120K minFee
    const expectedSupplierPayment_0 = r.perProviderEffectiveGgr[0] * 0.20 + 120000;
    expect(r.perProviderSupplierPayment[0]).toBeCloseTo(expectedSupplierPayment_0, 0);
  });
  it('operator margin = effective GGR − supplier payment', () => {
    const r = solveRevenueShare(baseCfg);
    for (let i = 0; i < r.perProviderEffectiveGgr.length; i++) {
      expect(r.perProviderOperatorMargin[i]).toBeCloseTo(
        r.perProviderEffectiveGgr[i] - r.perProviderSupplierPayment[i],
        0
      );
    }
  });
  it('tier1 share > 0 for tier1 providers', () => {
    const r = solveRevenueShare(baseCfg);
    expect(r.tier1PortfolioShare).toBeGreaterThan(0);
  });
});

describe('revenueShare — UKGC SMS 5.2', () => {
  it('compliant when tier1 ≥ 30% AND margin positive', () => {
    const r = solveRevenueShare(baseCfg);
    expect(r.isCompliantUkgcSms52).toBe(true);
  });
  it('non-compliant when tier1 < 30%', () => {
    const noTier1 = baseCfg.providers.map(p => ({ ...p, isTier1Premium: false }));
    const r = solveRevenueShare({ ...baseCfg, providers: noTier1 });
    expect(r.isCompliantUkgcSms52).toBe(false);
  });
});

describe('revenueShare — MC', () => {
  it('MC mean exists and positive', () => {
    const mc = simulateRevenueShare(baseCfg, 12345, 300);
    expect(mc.observedTotalNetRevenueMean).toBeGreaterThan(0);
  });
  it('determinism', () => {
    const a = simulateRevenueShare(baseCfg, 42, 100);
    const b = simulateRevenueShare(baseCfg, 42, 100);
    expect(a.observedTotalNetRevenueMean).toBe(b.observedTotalNetRevenueMean);
  });
});

describe('revenueShare — 100. solver milestone', () => {
  it('🎯 portfolio score ∈ [0, 1]', () => {
    const r = solveRevenueShare(baseCfg);
    expect(r.supplierPortfolioScore).toBeGreaterThanOrEqual(0);
    expect(r.supplierPortfolioScore).toBeLessThanOrEqual(1);
  });
});
