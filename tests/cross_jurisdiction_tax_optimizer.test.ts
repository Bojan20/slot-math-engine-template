/**
 * W233 — Cross-Jurisdiction Tax & Compliance Net-Margin Optimizer tests.
 *
 * 30 specs covering:
 *   - validation (12)
 *   - per-jurisdiction net margin (3)
 *   - greedy allocation (3)
 *   - net revenue aggregate (2)
 *   - HHI concentration (2)
 *   - Pillar 2 top-up (2)
 *   - tax elasticity (1)
 *   - UKGC RTS 17 compliance (2)
 *   - MC sensitivity (1)
 *   - determinism (1)
 *   - industry use-case (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveCrossJurisdictionTax,
  simulateCrossJurisdictionTax,
} from '../src/features/crossJurisdictionTaxOptimizer.js';

const baseCfg = {
  jurisdictions: ['UK', 'MT', 'DE', 'ON', 'AU'],
  jurisdictionGgrCapacity: [1_000_000, 800_000, 600_000, 500_000, 400_000],
  taxRates: [0.21, 0.05, 0.053, 0.20, 0.15],
  complianceOverheads: [0.10, 0.05, 0.08, 0.10, 0.12],
  houseEdges: [0.04, 0.04, 0.04, 0.04, 0.04],
  growthCaps: [0.90, 1.00, 0.85, 0.90, 0.80],
  minimumRevenues: [100_000, 50_000, 50_000, 50_000, 50_000],
  totalRevenueCap: 2_500_000,
  pillar2MinTaxRate: 0.15,
  hhiComplianceThreshold: 0.5,
};

describe('crossJurisdictionTax — validation', () => {
  it('rejects empty jurisdictions', () => {
    expect(() => solveCrossJurisdictionTax({ ...baseCfg, jurisdictions: [], jurisdictionGgrCapacity: [], taxRates: [], complianceOverheads: [], houseEdges: [], growthCaps: [], minimumRevenues: [] })).toThrow();
  });
  it('rejects array length mismatch', () => {
    expect(() => solveCrossJurisdictionTax({ ...baseCfg, taxRates: [0.21, 0.05] })).toThrow();
  });
  it('rejects negative GGR capacity', () => {
    expect(() =>
      solveCrossJurisdictionTax({ ...baseCfg, jurisdictionGgrCapacity: [-100, 800_000, 600_000, 500_000, 400_000] }),
    ).toThrow();
  });
  it('rejects tax rate > 1', () => {
    expect(() => solveCrossJurisdictionTax({ ...baseCfg, taxRates: [1.5, 0.05, 0.053, 0.20, 0.15] })).toThrow();
  });
  it('rejects houseEdge > 0.5', () => {
    expect(() =>
      solveCrossJurisdictionTax({ ...baseCfg, houseEdges: [0.04, 0.04, 0.04, 0.04, 0.8] }),
    ).toThrow();
  });
  it('rejects growthCap > 1', () => {
    expect(() =>
      solveCrossJurisdictionTax({ ...baseCfg, growthCaps: [1.5, 1.0, 0.85, 0.9, 0.8] }),
    ).toThrow();
  });
  it('rejects tax + overhead > 1', () => {
    expect(() =>
      solveCrossJurisdictionTax({
        ...baseCfg,
        taxRates: [0.21, 0.05, 0.053, 0.20, 0.95],
        complianceOverheads: [0.10, 0.05, 0.08, 0.10, 0.15],
      }),
    ).toThrow();
  });
  it('rejects totalRevenueCap < 0', () => {
    expect(() => solveCrossJurisdictionTax({ ...baseCfg, totalRevenueCap: -100 })).toThrow();
  });
  it('rejects Pillar 2 rate out of [0, 1]', () => {
    expect(() => solveCrossJurisdictionTax({ ...baseCfg, pillar2MinTaxRate: 1.5 })).toThrow();
  });
  it('rejects HHI threshold out of (0, 1]', () => {
    expect(() => solveCrossJurisdictionTax({ ...baseCfg, hhiComplianceThreshold: 0 })).toThrow();
  });
  it('rejects non-finite', () => {
    expect(() => solveCrossJurisdictionTax({ ...baseCfg, totalRevenueCap: NaN })).toThrow();
  });
  it('rejects too many jurisdictions', () => {
    const tooMany = Array.from({ length: 35 }, (_, i) => `J${i}`);
    expect(() => solveCrossJurisdictionTax({
      ...baseCfg,
      jurisdictions: tooMany,
      jurisdictionGgrCapacity: tooMany.map(() => 1000),
      taxRates: tooMany.map(() => 0.1),
      complianceOverheads: tooMany.map(() => 0.05),
      houseEdges: tooMany.map(() => 0.04),
      growthCaps: tooMany.map(() => 0.5),
      minimumRevenues: tooMany.map(() => 0),
    })).toThrow();
  });
});

describe('crossJurisdictionTax — per-jurisdiction net margin', () => {
  it('m_j = h_j · (1 − τ_j − β_j)', () => {
    const r = solveCrossJurisdictionTax(baseCfg);
    // UK: 0.04 · (1 − 0.21 − 0.10) = 0.04 · 0.69 = 0.0276
    expect(r.perJurisdictionNetMargin[0]).toBeCloseTo(0.0276, 5);
    // MT: 0.04 · (1 − 0.05 − 0.05) = 0.04 · 0.90 = 0.036
    expect(r.perJurisdictionNetMargin[1]).toBeCloseTo(0.036, 5);
  });
  it('MT has highest margin (lowest tax+overhead)', () => {
    const r = solveCrossJurisdictionTax(baseCfg);
    const mtMargin = r.perJurisdictionNetMargin[1];
    for (let i = 0; i < r.perJurisdictionNetMargin.length; i++) {
      if (i !== 1) {
        expect(mtMargin).toBeGreaterThanOrEqual(r.perJurisdictionNetMargin[i]);
      }
    }
  });
  it('ranking puts MT first', () => {
    const r = solveCrossJurisdictionTax(baseCfg);
    expect(r.jurisdictionRanking[0]).toBe(1);
  });
});

describe('crossJurisdictionTax — greedy allocation', () => {
  it('totalGgr ≤ totalRevenueCap', () => {
    const r = solveCrossJurisdictionTax(baseCfg);
    expect(r.totalGgr).toBeLessThanOrEqual(baseCfg.totalRevenueCap + 1e-6);
  });
  it('each jurisdiction GGR ≤ capacity · growthCap', () => {
    const r = solveCrossJurisdictionTax(baseCfg);
    for (let i = 0; i < r.effectiveGgr.length; i++) {
      const cap = baseCfg.jurisdictionGgrCapacity[i] * baseCfg.growthCaps[i];
      expect(r.effectiveGgr[i]).toBeLessThanOrEqual(cap + 1e-6);
    }
  });
  it('allocations a_j ∈ [0, growthCap]', () => {
    const r = solveCrossJurisdictionTax(baseCfg);
    for (let i = 0; i < r.optimalAllocations.length; i++) {
      expect(r.optimalAllocations[i]).toBeGreaterThanOrEqual(0);
      expect(r.optimalAllocations[i]).toBeLessThanOrEqual(baseCfg.growthCaps[i] + 1e-9);
    }
  });
});

describe('crossJurisdictionTax — net revenue', () => {
  it('totalNetRevenue = Σ effectiveGgr · m_j', () => {
    const r = solveCrossJurisdictionTax(baseCfg);
    let expected = 0;
    for (let i = 0; i < r.effectiveGgr.length; i++) {
      expected += r.effectiveGgr[i] * r.perJurisdictionNetMargin[i];
    }
    expect(r.totalNetRevenue).toBeCloseTo(expected, 4);
  });
  it('higher tax → lower netRevenue', () => {
    const a = solveCrossJurisdictionTax(baseCfg);
    const b = solveCrossJurisdictionTax({
      ...baseCfg,
      taxRates: [0.40, 0.30, 0.30, 0.40, 0.40],
    });
    expect(b.totalNetRevenue).toBeLessThan(a.totalNetRevenue);
  });
});

describe('crossJurisdictionTax — HHI concentration', () => {
  it('HHI ∈ [1/N, 1]', () => {
    const r = solveCrossJurisdictionTax(baseCfg);
    expect(r.hhiConcentration).toBeGreaterThanOrEqual(1 / 5 - 1e-6);
    expect(r.hhiConcentration).toBeLessThanOrEqual(1);
  });
  it('single-jurisdiction config → HHI = 1', () => {
    const single = {
      ...baseCfg,
      jurisdictions: ['UK'],
      jurisdictionGgrCapacity: [1_000_000],
      taxRates: [0.21],
      complianceOverheads: [0.10],
      houseEdges: [0.04],
      growthCaps: [0.90],
      minimumRevenues: [0],
      totalRevenueCap: 1_000_000,
    };
    const r = solveCrossJurisdictionTax(single);
    expect(r.hhiConcentration).toBeCloseTo(1, 4);
  });
});

describe('crossJurisdictionTax — Pillar 2 top-up', () => {
  it('MT (τ=5%) has positive Pillar 2 top-up (below 15%)', () => {
    const r = solveCrossJurisdictionTax(baseCfg);
    if (r.effectiveGgr[1] > 0) {
      expect(r.pillar2TopUpTaxes[1]).toBeGreaterThan(0);
    }
  });
  it('UK (τ=21%) has zero Pillar 2 top-up (above 15%)', () => {
    const r = solveCrossJurisdictionTax(baseCfg);
    expect(r.pillar2TopUpTaxes[0]).toBe(0);
  });
});

describe('crossJurisdictionTax — tax elasticity', () => {
  it('elasticity ≤ 0 (negative — higher tax reduces net)', () => {
    const r = solveCrossJurisdictionTax(baseCfg);
    for (const e of r.taxRateElasticities) {
      expect(e).toBeLessThanOrEqual(0);
    }
  });
});

describe('crossJurisdictionTax — UKGC RTS 17 compliance', () => {
  it('true for diversified portfolio sa low HHI', () => {
    const r = solveCrossJurisdictionTax(baseCfg);
    expect(r.isCompliantUkgcRts17).toBe(true);
  });
  it('false when blended tax rate excessive', () => {
    const r = solveCrossJurisdictionTax({
      ...baseCfg,
      taxRates: [0.55, 0.55, 0.55, 0.55, 0.55],
      complianceOverheads: [0.05, 0.05, 0.05, 0.05, 0.05],
    });
    expect(r.blendedEffectiveTaxRate).toBeGreaterThan(0.5);
    expect(r.isCompliantUkgcRts17).toBe(false);
  });
});

describe('crossJurisdictionTax — MC sensitivity', () => {
  it('MC observedTotalGgr within 20% of CF', () => {
    const cf = solveCrossJurisdictionTax(baseCfg);
    const mc = simulateCrossJurisdictionTax(baseCfg, 12345, 200);
    const rel = Math.abs(mc.observedTotalGgr - cf.totalGgr) / cf.totalGgr;
    expect(rel).toBeLessThan(0.20);
  });
});

describe('crossJurisdictionTax — determinism', () => {
  it('same seed → identical MC', () => {
    const a = simulateCrossJurisdictionTax(baseCfg, 42, 100);
    const b = simulateCrossJurisdictionTax(baseCfg, 42, 100);
    expect(a.observedTotalNetRevenue).toBe(b.observedTotalNetRevenue);
  });
});

describe('crossJurisdictionTax — industry use-case', () => {
  it('UK-MT-DE-ON-AU portfolio: MT prioritized, HHI < 0.5, compliant', () => {
    const r = solveCrossJurisdictionTax(baseCfg);
    // MT (idx 1) should rank #1
    expect(r.jurisdictionRanking[0]).toBe(1);
    // HHI compliant
    expect(r.hhiConcentration).toBeLessThan(0.5);
    expect(r.isCompliantUkgcRts17).toBe(true);
    // Total net > 0
    expect(r.totalNetRevenue).toBeGreaterThan(0);
  });
});
