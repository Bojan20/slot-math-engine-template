/**
 * W152 Wave 112 — Variable Reel Height Ways tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveVariableReelHeightWays,
  simulateVariableReelHeightWays,
  type VariableReelHeightWaysConfig,
} from '../src/features/variableReelHeightWays.js';

const baseCfg = (overrides: Partial<VariableReelHeightWaysConfig> = {}): VariableReelHeightWaysConfig => ({
  reels: [
    { label: 'r1', pmf: [{ height: 2, probability: 0.2 }, { height: 3, probability: 0.3 }, { height: 4, probability: 0.5 }] },
    { label: 'r2', pmf: [{ height: 2, probability: 0.2 }, { height: 3, probability: 0.3 }, { height: 4, probability: 0.5 }] },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects empty reels', () => {
    expect(() => solveVariableReelHeightWays({ reels: [] })).toThrow();
  });
  it('rejects duplicate reel label', () => {
    expect(() => solveVariableReelHeightWays({
      reels: [
        { label: 'r', pmf: [{ height: 2, probability: 1 }] },
        { label: 'r', pmf: [{ height: 3, probability: 1 }] },
      ],
    })).toThrow();
  });
  it('rejects empty pmf', () => {
    expect(() => solveVariableReelHeightWays({
      reels: [{ label: 'r', pmf: [] }],
    })).toThrow();
  });
  it('rejects non-integer height', () => {
    expect(() => solveVariableReelHeightWays({
      reels: [{ label: 'r', pmf: [{ height: 2.5, probability: 1 }] }],
    })).toThrow();
  });
  it('rejects height < 1', () => {
    expect(() => solveVariableReelHeightWays({
      reels: [{ label: 'r', pmf: [{ height: 0, probability: 1 }] }],
    })).toThrow();
  });
  it('rejects pmf not summing to 1', () => {
    expect(() => solveVariableReelHeightWays({
      reels: [{ label: 'r', pmf: [{ height: 2, probability: 0.5 }, { height: 3, probability: 0.3 }] }],
    })).toThrow();
  });
  it('rejects duplicate height in pmf', () => {
    expect(() => solveVariableReelHeightWays({
      reels: [{ label: 'r', pmf: [{ height: 2, probability: 0.5 }, { height: 2, probability: 0.5 }] }],
    })).toThrow();
  });
  it('rejects bad threshold', () => {
    expect(() => solveVariableReelHeightWays(baseCfg({ waysThresholds: [0] }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('E[H_i] computed correctly per reel', () => {
    const r = solveVariableReelHeightWays(baseCfg());
    // E[H] = 2*0.2 + 3*0.3 + 4*0.5 = 0.4 + 0.9 + 2.0 = 3.3
    expect(r.reelStats[0].expectedHeight).toBeCloseTo(3.3, 8);
    expect(r.reelStats[1].expectedHeight).toBeCloseTo(3.3, 8);
  });
  it('E[W] = Π E[H_i]', () => {
    const r = solveVariableReelHeightWays(baseCfg());
    expect(r.expectedWays).toBeCloseTo(3.3 * 3.3, 8);
  });
  it('Var[H] computed correctly per reel', () => {
    const r = solveVariableReelHeightWays(baseCfg());
    // E[H²] = 4*0.2 + 9*0.3 + 16*0.5 = 0.8 + 2.7 + 8 = 11.5
    // Var[H] = 11.5 − 3.3² = 11.5 − 10.89 = 0.61
    expect(r.reelStats[0].varianceHeight).toBeCloseTo(0.61, 8);
  });
  it('Var[W] = Π E[H_i²] − (Π E[H_i])²', () => {
    const r = solveVariableReelHeightWays(baseCfg());
    // E[W²] = 11.5 * 11.5 = 132.25
    // E[W] = 10.89, E[W]² = 118.5921
    // Var[W] = 132.25 − 118.5921 = 13.6579
    expect(r.varianceWays).toBeCloseTo(132.25 - 10.89 * 10.89, 6);
  });
  it('min/max ways = Π min/max heights', () => {
    const r = solveVariableReelHeightWays(baseCfg());
    expect(r.minWays).toBe(4); // 2*2
    expect(r.maxWays).toBe(16); // 4*4
  });
  it('P(min ways) = Π P(min height)', () => {
    const r = solveVariableReelHeightWays(baseCfg());
    expect(r.probMinWays).toBeCloseTo(0.2 * 0.2, 8); // 0.04
  });
  it('P(max ways) = Π P(max height)', () => {
    const r = solveVariableReelHeightWays(baseCfg());
    expect(r.probMaxWays).toBeCloseTo(0.5 * 0.5, 8); // 0.25
  });
  it('single-reel deterministic h=1 → E[W]=1, Var=0', () => {
    const r = solveVariableReelHeightWays({
      reels: [{ label: 'only', pmf: [{ height: 1, probability: 1 }] }],
    });
    expect(r.expectedWays).toBe(1);
    expect(r.varianceWays).toBe(0);
    expect(r.minWays).toBe(1);
    expect(r.maxWays).toBe(1);
  });
  it('computePmf produces valid PMF (sums to 1)', () => {
    const r = solveVariableReelHeightWays(baseCfg({ computePmf: true }));
    expect(r.waysPmf).toBeDefined();
    let total = 0;
    for (const [, p] of r.waysPmf!) total += p;
    expect(total).toBeCloseTo(1, 8);
  });
  it('PMF support covers [min, max] ways', () => {
    const r = solveVariableReelHeightWays(baseCfg({ computePmf: true }));
    const keys = Array.from(r.waysPmf!.keys()).sort((a, b) => a - b);
    expect(keys[0]).toBe(r.minWays);
    expect(keys[keys.length - 1]).toBe(r.maxWays);
  });
});

describe('tail probabilities', () => {
  it('P(W ≥ 1) = 1', () => {
    const r = solveVariableReelHeightWays(baseCfg({ waysThresholds: [1] }));
    expect(r.tailProbabilities['1']).toBeCloseTo(1, 8);
  });
  it('P(W ≥ maxWays) = P(max on every reel)', () => {
    const r = solveVariableReelHeightWays(baseCfg({ waysThresholds: [16] }));
    expect(r.tailProbabilities['16']).toBeCloseTo(0.25, 8);
  });
  it('P(W ≥ t) > P(W ≥ t+1) monotone', () => {
    const r = solveVariableReelHeightWays(baseCfg({ waysThresholds: [4, 9, 16] }));
    expect(r.tailProbabilities['4']).toBeGreaterThanOrEqual(r.tailProbabilities['9']);
    expect(r.tailProbabilities['9']).toBeGreaterThanOrEqual(r.tailProbabilities['16']);
  });
  it('P(W ≥ maxWays + 1) = 0', () => {
    const r = solveVariableReelHeightWays(baseCfg({ waysThresholds: [17] }));
    expect(r.tailProbabilities['17']).toBeCloseTo(0, 8);
  });
});

describe('monotonicity', () => {
  it('higher per-reel E[H] ⇒ higher E[W]', () => {
    const a = solveVariableReelHeightWays(baseCfg());
    const b = solveVariableReelHeightWays({
      reels: [
        { label: 'r1', pmf: [{ height: 2, probability: 0.1 }, { height: 4, probability: 0.9 }] },
        { label: 'r2', pmf: [{ height: 2, probability: 0.1 }, { height: 4, probability: 0.9 }] },
      ],
    });
    expect(b.expectedWays).toBeGreaterThan(a.expectedWays);
  });
  it('more reels ⇒ higher E[W]', () => {
    const a = solveVariableReelHeightWays({
      reels: [
        { label: 'r1', pmf: [{ height: 2, probability: 0.5 }, { height: 4, probability: 0.5 }] },
      ],
    });
    const b = solveVariableReelHeightWays({
      reels: [
        { label: 'r1', pmf: [{ height: 2, probability: 0.5 }, { height: 4, probability: 0.5 }] },
        { label: 'r2', pmf: [{ height: 2, probability: 0.5 }, { height: 4, probability: 0.5 }] },
      ],
    });
    expect(b.expectedWays).toBeGreaterThan(a.expectedWays);
  });
});

describe('MC cross-validation', () => {
  it('MC E[W] matches CF (rel ≤ 2% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveVariableReelHeightWays(cfg);
    const mc = simulateVariableReelHeightWays(cfg, 50_000, 0xdeadbeef);
    const rel = Math.abs(cf.expectedWays - mc.observedMeanWays) / cf.expectedWays;
    expect(rel).toBeLessThan(0.02);
  });
  it('MC Var[W] matches CF (rel ≤ 10% at 100K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveVariableReelHeightWays(cfg);
    const mc = simulateVariableReelHeightWays(cfg, 100_000, 0xcafe1234);
    const rel = Math.abs(cf.varianceWays - mc.observedVarianceWays) / cf.varianceWays;
    expect(rel).toBeLessThan(0.10);
  });
  it('MC tail P(W ≥ t) matches CF (abs ≤ 0.01 at 100K)', () => {
    const cfg = baseCfg({ waysThresholds: [9] });
    const cf = solveVariableReelHeightWays(cfg);
    const mc = simulateVariableReelHeightWays(cfg, 100_000, 0xbeefcafe);
    const cfTail = cf.tailProbabilities['9'];
    const mcTail = mc.observedTailHits['9'] / mc.episodes;
    expect(Math.abs(cfTail - mcTail)).toBeLessThan(0.01);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveVariableReelHeightWays(baseCfg());
    const b = solveVariableReelHeightWays(baseCfg());
    expect(a.expectedWays).toBe(b.expectedWays);
    expect(a.varianceWays).toBe(b.varianceWays);
  });
  it('MC same seed → identical', () => {
    const a = simulateVariableReelHeightWays(baseCfg(), 1000, 42);
    const b = simulateVariableReelHeightWays(baseCfg(), 1000, 42);
    expect(a.observedMeanWays).toBe(b.observedMeanWays);
  });
});

describe('industry use-cases', () => {
  it('6-reel "Megaways-style" {2..7}, uniform pmf', () => {
    const reels: VariableReelHeightWaysConfig['reels'] = [];
    for (let i = 0; i < 6; i++) {
      reels.push({
        label: `r${i + 1}`,
        pmf: [
          { height: 2, probability: 1 / 6 },
          { height: 3, probability: 1 / 6 },
          { height: 4, probability: 1 / 6 },
          { height: 5, probability: 1 / 6 },
          { height: 6, probability: 1 / 6 },
          { height: 7, probability: 1 / 6 },
        ],
      });
    }
    const r = solveVariableReelHeightWays({ reels });
    // E[H] = 4.5 per reel, E[W] = 4.5^6 ≈ 8303.77
    expect(r.expectedWays).toBeCloseTo(Math.pow(4.5, 6), 4);
    expect(r.maxWays).toBe(Math.pow(7, 6)); // 117649
    expect(r.minWays).toBe(Math.pow(2, 6)); // 64
  });
  it('Asymmetric reels (different distributions per reel)', () => {
    const r = solveVariableReelHeightWays({
      reels: [
        { label: 'r1', pmf: [{ height: 3, probability: 1 }] },
        { label: 'r2', pmf: [{ height: 4, probability: 0.5 }, { height: 6, probability: 0.5 }] },
        { label: 'r3', pmf: [{ height: 5, probability: 1 }] },
      ],
    });
    // E[W] = 3 * 5 * 5 = 75
    expect(r.expectedWays).toBeCloseTo(75, 8);
    expect(r.minWays).toBe(60);
    expect(r.maxWays).toBe(90);
  });
});
