/**
 * W152 Wave 130 — Free Spins Buy + Tier Escalation Trade-Off Analyzer tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveFreeSpinsBuyTierTradeOff,
  simulateFreeSpinsBuyTierTradeOff,
  type FreeSpinsBuyTierTradeOffConfig,
} from '../src/features/freeSpinsBuyTierTradeOff.js';

const baseCfg = (overrides: Partial<FreeSpinsBuyTierTradeOffConfig> = {}): FreeSpinsBuyTierTradeOffConfig => ({
  baseRtp: 0.96,
  baseVariance: 50,
  tiers: [
    { label: 'basic',  buyCostX: 100, expectedReturnX: 95,  varianceReturnX: 12000 },
    { label: 'super',  buyCostX: 200, expectedReturnX: 192, varianceReturnX: 50000 },
    { label: 'mega',   buyCostX: 500, expectedReturnX: 488, varianceReturnX: 200000, maxPayoutX: 5000 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects baseRtp ≤ 0', () => {
    expect(() => solveFreeSpinsBuyTierTradeOff(baseCfg({ baseRtp: 0 }))).toThrow();
  });
  it('rejects baseRtp > 2', () => {
    expect(() => solveFreeSpinsBuyTierTradeOff(baseCfg({ baseRtp: 2.5 }))).toThrow();
  });
  it('rejects negative baseVariance', () => {
    expect(() => solveFreeSpinsBuyTierTradeOff(baseCfg({ baseVariance: -1 }))).toThrow();
  });
  it('rejects empty tiers', () => {
    expect(() => solveFreeSpinsBuyTierTradeOff(baseCfg({ tiers: [] }))).toThrow();
  });
  it('rejects tier buyCostX ≤ 0', () => {
    expect(() => solveFreeSpinsBuyTierTradeOff(baseCfg({
      tiers: [{ label: 'x', buyCostX: 0, expectedReturnX: 10, varianceReturnX: 100 }],
    }))).toThrow();
  });
  it('rejects tier negative expectedReturnX', () => {
    expect(() => solveFreeSpinsBuyTierTradeOff(baseCfg({
      tiers: [{ label: 'x', buyCostX: 100, expectedReturnX: -5, varianceReturnX: 100 }],
    }))).toThrow();
  });
  it('rejects duplicate tier label', () => {
    expect(() => solveFreeSpinsBuyTierTradeOff(baseCfg({
      tiers: [
        { label: 'a', buyCostX: 100, expectedReturnX: 95, varianceReturnX: 100 },
        { label: 'a', buyCostX: 200, expectedReturnX: 190, varianceReturnX: 100 },
      ],
    }))).toThrow();
  });
  it('rejects adoptionFractions sum != 1', () => {
    expect(() => solveFreeSpinsBuyTierTradeOff(baseCfg({
      adoptionFractions: { base: 0.5, tiers: [0.2, 0.2, 0.0] }, // sum 0.9
    }))).toThrow();
  });
});

describe('per-tier metrics', () => {
  it('RTP_t = expectedReturnX / buyCostX', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg());
    expect(r.perTier[0].rtp).toBeCloseTo(95 / 100, 8);    // basic: 0.95
    expect(r.perTier[1].rtp).toBeCloseTo(192 / 200, 8);   // super: 0.96
    expect(r.perTier[2].rtp).toBeCloseTo(488 / 500, 8);   // mega: 0.976
  });
  it('netEdge = RTP - 1', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg());
    expect(r.perTier[0].netEdge).toBeCloseTo(-0.05, 8);   // basic: -5%
    expect(r.perTier[2].netEdge).toBeCloseTo(-0.024, 6);  // mega: -2.4%
  });
  it('stdRelative = σ / buyCostX', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg());
    expect(r.perTier[0].stdRelative).toBeCloseTo(Math.sqrt(12000) / 100, 6);
  });
  it('upliftVsBase = (RTP_t - baseRtp) · buyCostX', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg());
    // basic: (0.95 - 0.96)·100 = -1
    expect(r.perTier[0].upliftVsBase).toBeCloseTo(-1, 6);
    // super: (0.96 - 0.96)·200 = 0
    expect(r.perTier[1].upliftVsBase).toBeCloseTo(0, 6);
    // mega: (0.976 - 0.96)·500 = 8
    expect(r.perTier[2].upliftVsBase).toBeCloseTo(8, 4);
  });
  it('isPositiveEvVsBase correct flag', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg());
    expect(r.perTier[0].isPositiveEvVsBase).toBe(false); // 0.95 < 0.96
    expect(r.perTier[1].isPositiveEvVsBase).toBe(false); // 0.96 ≤ 0.96
    expect(r.perTier[2].isPositiveEvVsBase).toBe(true);  // 0.976 > 0.96
  });
});

describe('decision-mode picks', () => {
  it('argmaxRtpTier picks highest RTP', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg());
    expect(r.argmaxRtpTier).toBe('mega'); // 0.976 highest
  });
  it('argmaxVolatilityTier picks highest σ/cost', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg());
    // basic σ_rel = √12000/100 ≈ 1.095
    // super σ_rel = √50000/200 ≈ 1.118
    // mega σ_rel = √200000/500 ≈ 0.894
    expect(r.argmaxVolatilityTier).toBe('super');
  });
  it('argmaxPayoutTier picks highest maxPayoutX', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg());
    expect(r.argmaxPayoutTier).toBe('mega'); // only one sa maxPayoutX
  });
  it('Sharpe ratio finite when edge != 0', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg());
    for (const t of r.perTier) {
      expect(Number.isFinite(t.sharpeRatio)).toBe(true);
    }
  });
});

describe('two-sigma crossover N*', () => {
  it('N* finite for non-zero edge', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg());
    for (const t of r.perTier) {
      expect(Number.isFinite(t.twoSigmaCrossoverN)).toBe(true);
    }
  });
  it('N* = ∞ when RTP = 1.0', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg({
      tiers: [{ label: 'fair', buyCostX: 100, expectedReturnX: 100, varianceReturnX: 10000 }],
    }));
    expect(r.perTier[0].twoSigmaCrossoverN).toBe(Infinity);
  });
  it('higher edge → smaller N* (faster dominance)', () => {
    const a = solveFreeSpinsBuyTierTradeOff(baseCfg({
      tiers: [{ label: 'a', buyCostX: 100, expectedReturnX: 99, varianceReturnX: 10000 }],
    }));
    const b = solveFreeSpinsBuyTierTradeOff(baseCfg({
      tiers: [{ label: 'b', buyCostX: 100, expectedReturnX: 80, varianceReturnX: 10000 }],
    }));
    expect(b.perTier[0].twoSigmaCrossoverN).toBeLessThan(a.perTier[0].twoSigmaCrossoverN);
  });
});

describe('adoption-weighted aggregate', () => {
  it('weightedRtp computed when adoptionFractions provided', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg({
      adoptionFractions: { base: 0.5, tiers: [0.3, 0.15, 0.05] },
    }));
    // = 0.5·0.96 + 0.3·0.95 + 0.15·0.96 + 0.05·0.976
    const expected = 0.5 * 0.96 + 0.3 * 0.95 + 0.15 * 0.96 + 0.05 * 0.976;
    expect(r.weightedRtp).toBeCloseTo(expected, 6);
  });
  it('weightedRevenue computed correctly', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg({
      adoptionFractions: { base: 0.5, tiers: [0.3, 0.15, 0.05] },
    }));
    // = 0.5·1 + 0.3·100 + 0.15·200 + 0.05·500 = 0.5 + 30 + 30 + 25 = 85.5
    expect(r.weightedRevenuePerUnit).toBeCloseTo(85.5, 4);
  });
  it('no adoption → undefined weighted', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg());
    expect(r.weightedRtp).toBeUndefined();
    expect(r.weightedRevenuePerUnit).toBeUndefined();
  });
});

describe('Bonus Buy ban impact (regulator disclosure)', () => {
  it('compute counterfactual: max-EV tier RTP vs base, expressed as % change', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg());
    // Max RTP tier is mega @ 0.976. Ban impact = (0.976 - 0.96)/0.96 · 100 = 1.6667%
    expect(r.bonusBuyBanImpactPercent).toBeCloseTo((0.976 - 0.96) / 0.96 * 100, 4);
  });
  it('with adoption: weighted-average tier RTP loss', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg({
      adoptionFractions: { base: 0.5, tiers: [0.3, 0.15, 0.05] },
    }));
    // Sum buyer fracs = 0.5, weighted buy RTP = (0.3·0.95 + 0.15·0.96 + 0.05·0.976)/0.5
    //                                        = (0.285 + 0.144 + 0.0488)/0.5 = 0.4778/0.5 = 0.9556
    // Ban impact = (0.9556 - 0.96)/0.96 · 100 ≈ -0.4583%
    const wAvgBuy = (0.3 * 0.95 + 0.15 * 0.96 + 0.05 * 0.976) / 0.5;
    expect(r.bonusBuyBanImpactPercent).toBeCloseTo((wAvgBuy - 0.96) / 0.96 * 100, 4);
  });
});

describe('monotonicity', () => {
  it('higher expectedReturnX → higher RTP_t', () => {
    const a = solveFreeSpinsBuyTierTradeOff(baseCfg({
      tiers: [{ label: 't', buyCostX: 100, expectedReturnX: 90, varianceReturnX: 10000 }],
    }));
    const b = solveFreeSpinsBuyTierTradeOff(baseCfg({
      tiers: [{ label: 't', buyCostX: 100, expectedReturnX: 99, varianceReturnX: 10000 }],
    }));
    expect(b.perTier[0].rtp).toBeGreaterThan(a.perTier[0].rtp);
  });
  it('higher buyCost → lower RTP_t (for same expected return)', () => {
    const a = solveFreeSpinsBuyTierTradeOff(baseCfg({
      tiers: [{ label: 't', buyCostX: 100, expectedReturnX: 95, varianceReturnX: 10000 }],
    }));
    const b = solveFreeSpinsBuyTierTradeOff(baseCfg({
      tiers: [{ label: 't', buyCostX: 200, expectedReturnX: 95, varianceReturnX: 10000 }],
    }));
    expect(b.perTier[0].rtp).toBeLessThan(a.perTier[0].rtp);
  });
});

describe('MC cross-validation', () => {
  // MC uses Gaussian approximation with max(0,x) clipping. For high σ/μ ratio
  // (heavy-tail tiers), the clipping inflates the empirical mean. MC is only
  // a sanity check on CF moment computations, not exact distribution match.
  it('MC tier RTP matches CF (rel ≤ 20% at 50K trials — Gaussian-approx limit)', () => {
    const cfg = baseCfg();
    const cf = solveFreeSpinsBuyTierTradeOff(cfg);
    const mc = simulateFreeSpinsBuyTierTradeOff(cfg, 50_000, 0xdeadbeef);
    for (let i = 0; i < cf.perTier.length; i++) {
      const rel = Math.abs(cf.perTier[i].rtp - mc.perTierObservedRtp[i]) / cf.perTier[i].rtp;
      expect(rel).toBeLessThan(0.20);
    }
  });
  it('MC RTP-ordering directionally consistent (low-variance tiers)', () => {
    // Use low-σ config za stabilan MC vs CF rank
    const cfg = baseCfg({
      tiers: [
        { label: 'low_rtp',  buyCostX: 100, expectedReturnX: 80,  varianceReturnX: 200 },
        { label: 'high_rtp', buyCostX: 100, expectedReturnX: 99,  varianceReturnX: 200 },
      ],
    });
    const cf = solveFreeSpinsBuyTierTradeOff(cfg);
    const mc = simulateFreeSpinsBuyTierTradeOff(cfg, 100_000, 0xcafe1234);
    expect(mc.bestTierObservedRtp.tier).toBe(cf.argmaxRtpTier);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveFreeSpinsBuyTierTradeOff(baseCfg());
    const b = solveFreeSpinsBuyTierTradeOff(baseCfg());
    expect(a.bonusBuyBanImpactPercent).toBe(b.bonusBuyBanImpactPercent);
  });
  it('MC same seed → identical', () => {
    const a = simulateFreeSpinsBuyTierTradeOff(baseCfg(), 1000, 42);
    const b = simulateFreeSpinsBuyTierTradeOff(baseCfg(), 1000, 42);
    expect(a.perTierObservedRtp).toEqual(b.perTierObservedRtp);
  });
});

describe('industry use-cases', () => {
  it('Pragmatic Bigger Bass family: 100x basic + Super 200x', () => {
    const r = solveFreeSpinsBuyTierTradeOff({
      baseRtp: 0.9650,
      baseVariance: 80,
      tiers: [
        { label: 'basic_buy', buyCostX: 100, expectedReturnX: 96.5, varianceReturnX: 15000 },
        { label: 'super_buy', buyCostX: 200, expectedReturnX: 195,  varianceReturnX: 60000, maxPayoutX: 2500 },
      ],
    });
    expect(r.perTier[1].rtp).toBeCloseTo(0.975, 4);
    expect(r.argmaxRtpTier).toBe('super_buy');
  });
  it('Hacksaw Money Hunt: 66x / 100x / 150x tiers', () => {
    const r = solveFreeSpinsBuyTierTradeOff({
      baseRtp: 0.9620,
      baseVariance: 100,
      tiers: [
        { label: 'cheap',  buyCostX: 66,  expectedReturnX: 63.4, varianceReturnX: 10000 },
        { label: 'mid',    buyCostX: 100, expectedReturnX: 96.5, varianceReturnX: 20000 },
        { label: 'expensive', buyCostX: 150, expectedReturnX: 146, varianceReturnX: 50000 },
      ],
    });
    expect(r.argmaxRtpTier).toBeDefined();
    expect(r.bonusBuyBanImpactPercent).toBeGreaterThan(0); // bonus buy is +EV
  });
  it('Australian NCRG / Belgian regulator: Bonus Buy ban impact disclosure', () => {
    const r = solveFreeSpinsBuyTierTradeOff(baseCfg({
      adoptionFractions: { base: 0.7, tiers: [0.15, 0.10, 0.05] },
    }));
    // bonusBuyBanImpactPercent should be valid (positive or negative depending on tier mix)
    expect(Number.isFinite(r.bonusBuyBanImpactPercent)).toBe(true);
  });
});
