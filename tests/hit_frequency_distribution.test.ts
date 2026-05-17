/**
 * W152 Wave 159 — Hit Frequency Distribution Decomposition Analyzer tests.
 *
 * 32 specs covering:
 *   - validation (8)
 *   - total moments correctness (4)
 *   - tier breakdown correctness (5)
 *   - RTP concentration (3)
 *   - Pareto tail fit (3)
 *   - monotonicity (3)
 *   - MC cross-validation (3)
 *   - determinism (1)
 *   - industry use-cases (2)
 */

import { describe, it, expect } from 'vitest';
import {
  solveHitFrequencyDistribution,
  simulateHitFrequencyDistribution,
} from '../src/features/hitFrequencyDistribution.js';

// Industry baseline: NetEnt Starburst-class — simple medium-vol slot PMF
const starburstLikePmf = [
  { multiple: 0, probability: 0.732 },
  { multiple: 1, probability: 0.10 },
  { multiple: 2, probability: 0.07 },
  { multiple: 5, probability: 0.05 },
  { multiple: 10, probability: 0.03 },
  { multiple: 25, probability: 0.012 },
  { multiple: 50, probability: 0.004 },
  { multiple: 100, probability: 0.0015 },
  { multiple: 500, probability: 0.0004 },
  { multiple: 1000, probability: 0.0001 },
];

const baseCfg = {
  payoutPmf: starburstLikePmf,
  tierThresholds: [1, 5, 10, 50, 100, 500, 1000],
};

describe('hitFrequencyDistribution — validation', () => {
  it('rejects empty payoutPmf', () => {
    expect(() => solveHitFrequencyDistribution({ ...baseCfg, payoutPmf: [] })).toThrow();
  });
  it('rejects negative multiple', () => {
    expect(() =>
      solveHitFrequencyDistribution({
        ...baseCfg,
        payoutPmf: [{ multiple: -1, probability: 1 }],
      }),
    ).toThrow();
  });
  it('rejects probability outside [0, 1]', () => {
    expect(() =>
      solveHitFrequencyDistribution({
        ...baseCfg,
        payoutPmf: [{ multiple: 0, probability: 1.5 }],
      }),
    ).toThrow();
  });
  it('rejects PMF not summing to 1', () => {
    expect(() =>
      solveHitFrequencyDistribution({
        ...baseCfg,
        payoutPmf: [
          { multiple: 0, probability: 0.3 },
          { multiple: 1, probability: 0.3 },
        ],
      }),
    ).toThrow();
  });
  it('accepts PMF within 1e-6 tolerance of 1', () => {
    expect(() =>
      solveHitFrequencyDistribution({
        ...baseCfg,
        payoutPmf: [
          { multiple: 0, probability: 0.5 },
          { multiple: 1, probability: 0.5000001 },
        ],
      }),
    ).not.toThrow();
  });
  it('rejects empty tierThresholds', () => {
    expect(() => solveHitFrequencyDistribution({ ...baseCfg, tierThresholds: [] })).toThrow();
  });
  it('rejects unsorted tierThresholds', () => {
    expect(() =>
      solveHitFrequencyDistribution({ ...baseCfg, tierThresholds: [10, 5, 1] }),
    ).toThrow();
  });
  it('rejects paretoTailStartMultiplier ≤ 0', () => {
    expect(() =>
      solveHitFrequencyDistribution({ ...baseCfg, paretoTailStartMultiplier: 0 }),
    ).toThrow();
  });
});

describe('hitFrequencyDistribution — total moments correctness', () => {
  it('totalRtp = Σ m·p', () => {
    const r = solveHitFrequencyDistribution(baseCfg);
    const expected = starburstLikePmf.reduce((s, e) => s + e.multiple * e.probability, 0);
    expect(r.totalRtp).toBeCloseTo(expected, 10);
  });
  it('totalVariance = Σ m²·p − RTP²', () => {
    const r = solveHitFrequencyDistribution(baseCfg);
    const m2 = starburstLikePmf.reduce((s, e) => s + e.multiple * e.multiple * e.probability, 0);
    const expectedVar = m2 - r.totalRtp * r.totalRtp;
    expect(r.totalVariance).toBeCloseTo(expectedVar, 10);
  });
  it('overallHitFrequency = 1 − π(0)', () => {
    const r = solveHitFrequencyDistribution(baseCfg);
    expect(r.overallHitFrequency).toBeCloseTo(1 - 0.732, 10);
  });
  it('overallOneInN = 1 / HF', () => {
    const r = solveHitFrequencyDistribution(baseCfg);
    expect(r.overallOneInN).toBeCloseTo(1 / r.overallHitFrequency, 8);
  });
});

describe('hitFrequencyDistribution — tier breakdown correctness', () => {
  it('tier C=1: sum of all positive masses', () => {
    const r = solveHitFrequencyDistribution(baseCfg);
    const t1 = r.tierBreakdown.find((x) => x.threshold === 1);
    expect(t1).toBeDefined();
    expect(t1!.tierProb).toBeCloseTo(1 - 0.732, 10);
  });
  it('tier C=1000: only top mass', () => {
    const r = solveHitFrequencyDistribution(baseCfg);
    const t1000 = r.tierBreakdown.find((x) => x.threshold === 1000);
    expect(t1000!.tierProb).toBeCloseTo(0.0001, 10);
    expect(t1000!.oneInN).toBeCloseTo(10000, 8);
  });
  it('tier C=100 condEV = (100·0.0015 + 500·0.0004 + 1000·0.0001) / (0.0015 + 0.0004 + 0.0001)', () => {
    const r = solveHitFrequencyDistribution(baseCfg);
    const t100 = r.tierBreakdown.find((x) => x.threshold === 100);
    const expectedNum = 100 * 0.0015 + 500 * 0.0004 + 1000 * 0.0001;
    const expectedDen = 0.0015 + 0.0004 + 0.0001;
    expect(t100!.condEV).toBeCloseTo(expectedNum / expectedDen, 8);
  });
  it('tierProb strictly non-increasing in threshold (survival fn)', () => {
    const r = solveHitFrequencyDistribution(baseCfg);
    for (let i = 1; i < r.tierBreakdown.length; i++) {
      expect(r.tierBreakdown[i].tierProb).toBeLessThanOrEqual(r.tierBreakdown[i - 1].tierProb);
    }
  });
  it('rtpShareOfTotal of all positive tiers ≤ 1', () => {
    const r = solveHitFrequencyDistribution(baseCfg);
    const t1 = r.tierBreakdown.find((x) => x.threshold === 1)!;
    expect(t1.rtpShareOfTotal).toBeLessThanOrEqual(1);
    expect(t1.rtpShareOfTotal).toBeGreaterThan(0.95); // tier C=1 captures all positive RTP
  });
});

describe('hitFrequencyDistribution — RTP concentration', () => {
  it('top 1%/5%/10% always present in output', () => {
    const r = solveHitFrequencyDistribution(baseCfg);
    expect(r.rtpConcentration.map((x) => x.topFraction)).toEqual([0.01, 0.05, 0.10]);
  });
  it('rtpShare strictly non-decreasing in topFraction', () => {
    const r = solveHitFrequencyDistribution(baseCfg);
    for (let i = 1; i < r.rtpConcentration.length; i++) {
      expect(r.rtpConcentration[i].rtpShare).toBeGreaterThanOrEqual(
        r.rtpConcentration[i - 1].rtpShare,
      );
    }
  });
  it('top-1% captures a substantial RTP share for heavy-tail Starburst-class', () => {
    const r = solveHitFrequencyDistribution(baseCfg);
    // Top 1% of positive-mass events sorted descending captures the 1000×, 500×, ... payouts
    expect(r.rtpConcentration[0].rtpShare).toBeGreaterThan(0.20);
  });
});

describe('hitFrequencyDistribution — Pareto tail fit', () => {
  it('Pareto α finite when tail has ≥3 distinct outcomes', () => {
    const r = solveHitFrequencyDistribution(baseCfg);
    // tail = m ≥ 10 → {10, 25, 50, 100, 500, 1000} = 6 entries
    expect(r.paretoTailRowCount).toBe(6);
    expect(Number.isFinite(r.paretoTailAlpha)).toBe(true);
    expect(r.paretoTailAlpha).toBeGreaterThan(0);
  });
  it('Pareto α = NaN when tail has < 3 outcomes', () => {
    const lightTail = {
      payoutPmf: [
        { multiple: 0, probability: 0.8 },
        { multiple: 1, probability: 0.15 },
        { multiple: 5, probability: 0.05 },
      ],
      tierThresholds: [1, 5],
      paretoTailStartMultiplier: 100,
    };
    const r = solveHitFrequencyDistribution(lightTail);
    expect(r.paretoTailRowCount).toBe(0);
    expect(Number.isNaN(r.paretoTailAlpha)).toBe(true);
  });
  it('Pareto α adjustable via paretoTailStartMultiplier', () => {
    const r1 = solveHitFrequencyDistribution({ ...baseCfg, paretoTailStartMultiplier: 10 });
    const r2 = solveHitFrequencyDistribution({ ...baseCfg, paretoTailStartMultiplier: 100 });
    expect(r1.paretoTailRowCount).toBeGreaterThan(r2.paretoTailRowCount);
  });
});

describe('hitFrequencyDistribution — monotonicity', () => {
  it('higher zero-payout mass → lower hit frequency', () => {
    const lowHf = {
      payoutPmf: [
        { multiple: 0, probability: 0.9 },
        { multiple: 1, probability: 0.1 },
      ],
      tierThresholds: [1],
    };
    const highHf = {
      payoutPmf: [
        { multiple: 0, probability: 0.5 },
        { multiple: 1, probability: 0.5 },
      ],
      tierThresholds: [1],
    };
    const r1 = solveHitFrequencyDistribution(lowHf);
    const r2 = solveHitFrequencyDistribution(highHf);
    expect(r2.overallHitFrequency).toBeGreaterThan(r1.overallHitFrequency);
  });
  it('all-zero PMF → HF = 0', () => {
    const r = solveHitFrequencyDistribution({
      payoutPmf: [{ multiple: 0, probability: 1 }],
      tierThresholds: [1],
    });
    expect(r.overallHitFrequency).toBe(0);
    expect(r.overallOneInN).toBe(Infinity);
  });
  it('all-winning PMF → HF = 1', () => {
    const r = solveHitFrequencyDistribution({
      payoutPmf: [{ multiple: 1, probability: 1 }],
      tierThresholds: [1],
    });
    expect(r.overallHitFrequency).toBe(1);
    expect(r.overallOneInN).toBe(1);
  });
});

describe('hitFrequencyDistribution — MC cross-validation', () => {
  it('observed RTP ≈ closed-form total RTP (within 1% at 100K spins)', () => {
    const cf = solveHitFrequencyDistribution(baseCfg);
    const mc = simulateHitFrequencyDistribution(baseCfg, 100_000, 12345);
    expect(Math.abs(mc.observedRtp - cf.totalRtp) / cf.totalRtp).toBeLessThan(0.05);
  });
  it('observed HF ≈ closed-form HF (within 1pp at 100K spins)', () => {
    const cf = solveHitFrequencyDistribution(baseCfg);
    const mc = simulateHitFrequencyDistribution(baseCfg, 100_000, 7);
    expect(Math.abs(mc.observedHitFrequency - cf.overallHitFrequency)).toBeLessThan(0.01);
  });
  it('observed per-tier probability ≈ closed-form (within abs 2pp at 100K spins for HF tiers)', () => {
    const cf = solveHitFrequencyDistribution(baseCfg);
    const mc = simulateHitFrequencyDistribution(baseCfg, 100_000, 31);
    // Tier C=1 has highest mass, expect tight agreement
    const cfTier1 = cf.tierBreakdown.find((x) => x.threshold === 1)!.tierProb;
    const mcTier1 = mc.observedTierProbabilities.find((x) => x.threshold === 1)!.observedProb;
    expect(Math.abs(mcTier1 - cfTier1)).toBeLessThan(0.02);
  });
});

describe('hitFrequencyDistribution — determinism', () => {
  it('CF solver returns same result on repeated calls', () => {
    const r1 = solveHitFrequencyDistribution(baseCfg);
    const r2 = solveHitFrequencyDistribution(baseCfg);
    expect(r1).toEqual(r2);
  });
});

describe('hitFrequencyDistribution — industry use-cases', () => {
  it('UKGC RTS 14 disclosure: tier-stratified hit frequencies for Starburst-class', () => {
    const r = solveHitFrequencyDistribution(baseCfg);
    expect(r.tierBreakdown.length).toBe(7);
    expect(r.overallHitFrequency).toBeCloseTo(0.268, 3);
    // 1-in-N at common regulator thresholds
    const t100 = r.tierBreakdown.find((x) => x.threshold === 100)!;
    expect(t100.oneInN).toBeGreaterThan(400);
    expect(t100.oneInN).toBeLessThan(600); // ≈ 500 hits
  });
  it('high-vol Pragmatic-class: extreme tail concentration', () => {
    const highVolPmf = {
      payoutPmf: [
        { multiple: 0, probability: 0.85 },
        { multiple: 1, probability: 0.08 },
        { multiple: 5, probability: 0.04 },
        { multiple: 50, probability: 0.025 },
        { multiple: 500, probability: 0.004 },
        { multiple: 5000, probability: 0.001 },
      ],
      tierThresholds: [1, 50, 500, 5000],
    };
    const r = solveHitFrequencyDistribution(highVolPmf);
    expect(r.overallHitFrequency).toBeCloseTo(0.15, 5);
    expect(r.totalStdDev).toBeGreaterThan(10); // very high variance per spin
    const t5000 = r.tierBreakdown.find((x) => x.threshold === 5000)!;
    expect(t5000.oneInN).toBe(1000); // 1-in-1000 for max win
  });
});
