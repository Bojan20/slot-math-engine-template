/**
 * W152 Wave 93 — Multiplicative Wild Stack Bonus tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveMultiplicativeWildStack,
  simulateMultiplicativeWildStack,
  type MultiplicativeWildStackConfig,
} from '../src/features/multiplicativeWildStack.js';

const baseCfg = (overrides: Partial<MultiplicativeWildStackConfig> = {}): MultiplicativeWildStackConfig => ({
  reelsR: 5,
  wildLandingProbabilityPerReel: 0.20,
  multiplierDistribution: [
    { label: 'x2', valueX: 2, weight: 60 },
    { label: 'x3', valueX: 3, weight: 25 },
    { label: 'x5', valueX: 5, weight: 12 },
    { label: 'x10', valueX: 10, weight: 3 },
  ],
  meanBaseWinX: 1.0,
  varianceBaseWinX: 2.0,
  ...overrides,
});

describe('validation', () => {
  it('rejects non-integer R', () => {
    expect(() => solveMultiplicativeWildStack(baseCfg({ reelsR: 1.5 }))).toThrow();
  });
  it('rejects R < 1', () => {
    expect(() => solveMultiplicativeWildStack(baseCfg({ reelsR: 0 }))).toThrow();
  });
  it('rejects p out of [0,1]', () => {
    expect(() => solveMultiplicativeWildStack(baseCfg({ wildLandingProbabilityPerReel: -0.1 }))).toThrow();
    expect(() => solveMultiplicativeWildStack(baseCfg({ wildLandingProbabilityPerReel: 1.1 }))).toThrow();
  });
  it('rejects empty multiplier distribution', () => {
    expect(() => solveMultiplicativeWildStack(baseCfg({ multiplierDistribution: [] }))).toThrow();
  });
  it('rejects non-positive multiplier value', () => {
    expect(() => solveMultiplicativeWildStack(baseCfg({
      multiplierDistribution: [{ label: 'x', valueX: 0, weight: 1 }],
    }))).toThrow();
  });
  it('rejects non-positive weight', () => {
    expect(() => solveMultiplicativeWildStack(baseCfg({
      multiplierDistribution: [{ label: 'x', valueX: 2, weight: 0 }],
    }))).toThrow();
  });
  it('rejects duplicate label', () => {
    expect(() => solveMultiplicativeWildStack(baseCfg({
      multiplierDistribution: [
        { label: 'a', valueX: 2, weight: 1 },
        { label: 'a', valueX: 3, weight: 1 },
      ],
    }))).toThrow();
  });
  it('rejects negative mean base win', () => {
    expect(() => solveMultiplicativeWildStack(baseCfg({ meanBaseWinX: -1 }))).toThrow();
  });
  it('rejects negative base variance', () => {
    expect(() => solveMultiplicativeWildStack(baseCfg({ varianceBaseWinX: -1 }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('E[N] = R · p', () => {
    const r = solveMultiplicativeWildStack(baseCfg());
    expect(r.expectedActiveWilds).toBeCloseTo(5 * 0.2, 10); // 1
  });
  it('Var[N] = R · p · (1-p)', () => {
    const r = solveMultiplicativeWildStack(baseCfg());
    expect(r.varianceActiveWilds).toBeCloseTo(5 * 0.2 * 0.8, 10); // 0.8
  });
  it('μ_M = Σ p_i · v_i', () => {
    const r = solveMultiplicativeWildStack(baseCfg());
    // weights sum=100; p=0.6,0.25,0.12,0.03
    // μ = 0.6·2 + 0.25·3 + 0.12·5 + 0.03·10 = 1.2+0.75+0.6+0.3 = 2.85
    expect(r.expectedMultiplierPerStack).toBeCloseTo(2.85, 8);
  });
  it('max multiplier per stack identified', () => {
    const r = solveMultiplicativeWildStack(baseCfg());
    expect(r.maxMultiplierPerStack).toBe(10);
  });
  it('E[W] = (p·μ_M + 1-p)^R', () => {
    const r = solveMultiplicativeWildStack(baseCfg());
    // 0.2 · 2.85 + 0.8 = 0.57 + 0.8 = 1.37
    // 1.37^5 ≈ 4.8276
    expect(r.expectedCombinedMultiplier).toBeCloseTo(Math.pow(1.37, 5), 6);
  });
  it('E[Y] = μ_B · E[W]', () => {
    const r = solveMultiplicativeWildStack(baseCfg());
    expect(r.expectedTotalPayoutX).toBeCloseTo(1 * Math.pow(1.37, 5), 6);
  });
  it('Var[Y] = E[B²]·E[W²] − E[Y]²', () => {
    const r = solveMultiplicativeWildStack(baseCfg());
    const eB2 = 2 + 1; // σ²_B + μ²_B
    const expectedVar = eB2 * r.expectedCombinedMultiplierSquared - r.expectedTotalPayoutX * r.expectedTotalPayoutX;
    expect(r.varianceTotalPayoutX).toBeCloseTo(Math.max(0, expectedVar), 6);
  });
  it('P(all wilds) = p^R', () => {
    const r = solveMultiplicativeWildStack(baseCfg());
    expect(r.probAllWilds).toBeCloseTo(Math.pow(0.2, 5), 10);
  });
  it('P(zero wilds) = (1-p)^R', () => {
    const r = solveMultiplicativeWildStack(baseCfg());
    expect(r.probZeroWilds).toBeCloseTo(Math.pow(0.8, 5), 10);
  });
  it('max combined multiplier = m_max^R', () => {
    const r = solveMultiplicativeWildStack(baseCfg());
    expect(r.maxCombinedMultiplier).toBe(Math.pow(10, 5)); // 100000
  });
  it('E[mult | all active] = μ_M^R', () => {
    const r = solveMultiplicativeWildStack(baseCfg());
    expect(r.expectedMultiplierIfAllActive).toBeCloseTo(Math.pow(2.85, 5), 8);
  });
  it('p=0 → E[W]=1, Var[W]=0', () => {
    const r = solveMultiplicativeWildStack(baseCfg({ wildLandingProbabilityPerReel: 0 }));
    expect(r.expectedCombinedMultiplier).toBe(1);
    expect(r.varianceCombinedMultiplier).toBe(0);
    expect(r.probZeroWilds).toBe(1);
  });
  it('p=1 → E[W] = μ_M^R, all wilds active', () => {
    const r = solveMultiplicativeWildStack(baseCfg({ wildLandingProbabilityPerReel: 1 }));
    expect(r.expectedCombinedMultiplier).toBeCloseTo(Math.pow(2.85, 5), 6);
    expect(r.probAllWilds).toBe(1);
  });
});

describe('monotonicity', () => {
  it('higher p ⇒ higher E[W] (more wilds active)', () => {
    const a = solveMultiplicativeWildStack(baseCfg({ wildLandingProbabilityPerReel: 0.1 }));
    const b = solveMultiplicativeWildStack(baseCfg({ wildLandingProbabilityPerReel: 0.4 }));
    expect(b.expectedCombinedMultiplier).toBeGreaterThan(a.expectedCombinedMultiplier);
  });
  it('larger R ⇒ higher E[W] (exponentially)', () => {
    const a = solveMultiplicativeWildStack(baseCfg({ reelsR: 3 }));
    const b = solveMultiplicativeWildStack(baseCfg({ reelsR: 7 }));
    expect(b.expectedCombinedMultiplier).toBeGreaterThan(a.expectedCombinedMultiplier);
  });
  it('higher μ_M ⇒ higher E[Y]', () => {
    const a = solveMultiplicativeWildStack(baseCfg());
    const cfgHigh = baseCfg();
    cfgHigh.multiplierDistribution = [{ label: 'big', valueX: 20, weight: 1 }];
    const b = solveMultiplicativeWildStack(cfgHigh);
    expect(b.expectedTotalPayoutX).toBeGreaterThan(a.expectedTotalPayoutX);
  });
});

describe('MC cross-validation', () => {
  it('MC E[N] matches CF (rel ≤ 5% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveMultiplicativeWildStack(cfg);
    const mc = simulateMultiplicativeWildStack(cfg, 50_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedActiveWilds - mc.observedMeanWilds) / cf.expectedActiveWilds;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[W] matches CF (rel ≤ 10% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveMultiplicativeWildStack(cfg);
    const mc = simulateMultiplicativeWildStack(cfg, 50_000, 0xbeefbabe);
    const rel = Math.abs(cf.expectedCombinedMultiplier - mc.observedMeanCombinedMultiplier) / cf.expectedCombinedMultiplier;
    expect(rel).toBeLessThan(0.10);
  });
  it('MC E[Y] matches CF (rel ≤ 10% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveMultiplicativeWildStack(cfg);
    const mc = simulateMultiplicativeWildStack(cfg, 50_000, 0xfeedface);
    const rel = Math.abs(cf.expectedTotalPayoutX - mc.observedMeanPayoutX) / cf.expectedTotalPayoutX;
    expect(rel).toBeLessThan(0.10);
  });
  it('MC Var[Y] matches CF (rel ≤ 40% at 50K episodes — heavy tail)', () => {
    const cfg = baseCfg();
    const cf = solveMultiplicativeWildStack(cfg);
    const mc = simulateMultiplicativeWildStack(cfg, 50_000, 0xdeadbeef);
    const rel = Math.abs(cf.varianceTotalPayoutX - mc.observedVariancePayoutX) / cf.varianceTotalPayoutX;
    expect(rel).toBeLessThan(0.40);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveMultiplicativeWildStack(baseCfg());
    const b = solveMultiplicativeWildStack(baseCfg());
    expect(a.expectedTotalPayoutX).toBe(b.expectedTotalPayoutX);
  });
  it('MC same seed → identical', () => {
    const a = simulateMultiplicativeWildStack(baseCfg(), 1000, 42);
    const b = simulateMultiplicativeWildStack(baseCfg(), 1000, 42);
    expect(a.totalPayoutX).toBe(b.totalPayoutX);
  });
});

describe('industry use-cases', () => {
  it('Vendor D-Hotline-style 5x sticky x2 wilds rare', () => {
    const r = solveMultiplicativeWildStack({
      reelsR: 5,
      wildLandingProbabilityPerReel: 0.10,
      multiplierDistribution: [
        { label: 'x2', valueX: 2, weight: 1 },
      ],
      meanBaseWinX: 0.5,
      varianceBaseWinX: 1,
    });
    // E[W] = (0.1·2 + 0.9)^5 = 1.1^5 ≈ 1.6105
    expect(r.expectedCombinedMultiplier).toBeCloseTo(Math.pow(1.1, 5), 6);
    expect(r.maxCombinedMultiplier).toBe(Math.pow(2, 5)); // 32
  });
  it('Wanted-Dead-style 6-reel large multipliers, rare drops', () => {
    const r = solveMultiplicativeWildStack({
      reelsR: 6,
      wildLandingProbabilityPerReel: 0.05,
      multiplierDistribution: [
        { label: 'x10', valueX: 10, weight: 70 },
        { label: 'x50', valueX: 50, weight: 25 },
        { label: 'x100', valueX: 100, weight: 5 },
      ],
      meanBaseWinX: 0.3,
      varianceBaseWinX: 0.5,
    });
    expect(r.expectedActiveWilds).toBeCloseTo(0.3, 6);
    expect(r.expectedTotalPayoutX).toBeGreaterThan(0);
    // Max combined = 100^6 = 1e12 — theoretical only
    expect(r.maxCombinedMultiplier).toBe(Math.pow(100, 6));
  });
});
