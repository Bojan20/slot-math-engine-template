/**
 * W152 Wave 53 — Walking-Wild Respin variant tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveWalkingWildRespin,
  simulateWalkingWildRespin,
  meanReward,
  varianceReward,
  type WalkingWildRespinConfig,
} from '../src/features/walkingWildRespin.js';

const uniformStart = (G: number): number[] => new Array<number>(G).fill(1 / G);

const baseCfg = (overrides: Partial<WalkingWildRespinConfig> = {}): WalkingWildRespinConfig => ({
  gridCols: 5,
  startColumnPmf: uniformStart(5),
  stepPmf: { left: 0.5, stay: 0, right: 0.5 },
  rewardDistribution: [
    { rewardX: 1, weight: 6 },
    { rewardX: 2, weight: 3 },
    { rewardX: 5, weight: 1 },
  ],
  ...overrides,
});

// ── Helpers ───────────────────────────────────────────────────────────────

describe('meanReward / varianceReward', () => {
  it('mean = weighted average', () => {
    expect(meanReward([
      { rewardX: 1, weight: 6 },
      { rewardX: 2, weight: 3 },
      { rewardX: 5, weight: 1 },
    ])).toBeCloseTo(1.7, 10);
  });
  it('variance ≥ 0', () => {
    expect(varianceReward([{ rewardX: 5, weight: 1 }])).toBeCloseTo(0, 10);
  });
});

// ── Validation ─────────────────────────────────────────────────────────────

describe('validate', () => {
  it('rejects gridCols < 2', () => {
    expect(() => solveWalkingWildRespin(baseCfg({ gridCols: 1, startColumnPmf: [1] }))).toThrow();
  });
  it('rejects startColumnPmf with wrong length', () => {
    expect(() => solveWalkingWildRespin(baseCfg({ startColumnPmf: [0.5, 0.5] }))).toThrow();
  });
  it('rejects startColumnPmf not summing to 1', () => {
    expect(() =>
      solveWalkingWildRespin(baseCfg({ startColumnPmf: [0.5, 0.2, 0.1, 0.1, 0.05] })),
    ).toThrow();
  });
  it('rejects negative startColumnPmf entries', () => {
    expect(() =>
      solveWalkingWildRespin(baseCfg({ startColumnPmf: [-0.1, 0.3, 0.3, 0.3, 0.2] })),
    ).toThrow();
  });
  it('rejects stepPmf not summing to 1', () => {
    expect(() => solveWalkingWildRespin(baseCfg({ stepPmf: { left: 0.4, stay: 0.4, right: 0.4 } }))).toThrow();
  });
  it('rejects stepPmf.stay = 1 (non-absorbing)', () => {
    expect(() => solveWalkingWildRespin(baseCfg({ stepPmf: { left: 0, stay: 1, right: 0 } }))).toThrow();
  });
  it('rejects empty rewardDistribution', () => {
    expect(() => solveWalkingWildRespin(baseCfg({ rewardDistribution: [] }))).toThrow();
  });
  it('rejects negative rewardX', () => {
    expect(() =>
      solveWalkingWildRespin(baseCfg({ rewardDistribution: [{ rewardX: -1, weight: 1 }] })),
    ).toThrow();
  });
});

// ── Symmetric closed-form check ────────────────────────────────────────────

describe('solveWalkingWildRespin — symmetric walk closed-form', () => {
  it('strict-right walk: starting at col c ⇒ K = G − c', () => {
    // Walker always steps RIGHT. From col c, takes G−c steps to exit.
    const G = 5;
    const r = solveWalkingWildRespin({
      gridCols: G,
      startColumnPmf: [1, 0, 0, 0, 0], // start at col 0
      stepPmf: { left: 0, stay: 0, right: 1 },
      rewardDistribution: [{ rewardX: 1, weight: 1 }],
    });
    expect(r.expectedRespins).toBeCloseTo(G, 10); // start at 0 → 5 steps to exit
  });
  it('strict-left walk: starting at col c ⇒ K = c+1', () => {
    const G = 5;
    const r = solveWalkingWildRespin({
      gridCols: G,
      startColumnPmf: [0, 0, 0, 0, 1], // start at col 4
      stepPmf: { left: 1, stay: 0, right: 0 },
      rewardDistribution: [{ rewardX: 1, weight: 1 }],
    });
    expect(r.expectedRespins).toBeCloseTo(G, 10); // 4 → 3 → 2 → 1 → 0 → OUT: 5 steps
  });
  it('symmetric random walk: starting at center has highest E[K]', () => {
    const r = solveWalkingWildRespin(baseCfg({
      gridCols: 7,
      startColumnPmf: [0, 0, 0, 1, 0, 0, 0], // center
      stepPmf: { left: 0.5, stay: 0, right: 0.5 },
      rewardDistribution: [{ rewardX: 1, weight: 1 }],
    }));
    const rEdge = solveWalkingWildRespin(baseCfg({
      gridCols: 7,
      startColumnPmf: [1, 0, 0, 0, 0, 0, 0], // edge
      stepPmf: { left: 0.5, stay: 0, right: 0.5 },
      rewardDistribution: [{ rewardX: 1, weight: 1 }],
    }));
    expect(r.expectedRespins).toBeGreaterThan(rEdge.expectedRespins);
  });
});

// ── Structural correctness ─────────────────────────────────────────────────

describe('solveWalkingWildRespin — structural', () => {
  it('E[Y] = E[K] × E[V] (Wald)', () => {
    const r = solveWalkingWildRespin(baseCfg());
    expect(r.expectedPayoutPerEpisode).toBeCloseTo(r.expectedRespins * r.expectedRewardPerRespin, 10);
  });
  it('Var[Y] = E[K]·Var[V] + Var[K]·E[V]²', () => {
    const r = solveWalkingWildRespin(baseCfg());
    const expected = r.expectedRespins * r.varianceRewardPerRespin +
      r.varianceRespins * r.expectedRewardPerRespin ** 2;
    expect(r.variancePayoutPerEpisode).toBeCloseTo(expected, 10);
  });
  it('σ[Y] = sqrt(Var[Y])', () => {
    const r = solveWalkingWildRespin(baseCfg());
    expect(r.stdDevPayoutPerEpisode).toBeCloseTo(Math.sqrt(r.variancePayoutPerEpisode), 10);
  });
  it('respinCountPmf sums to ≈ 1', () => {
    const r = solveWalkingWildRespin(baseCfg());
    const sum = r.respinCountPmf.reduce((a, e) => a + e.probability, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
  it('expectedRespinsByStart has G entries', () => {
    const r = solveWalkingWildRespin(baseCfg());
    expect(r.expectedRespinsByStart.length).toBe(5);
  });
  it('varianceRespins ≥ 0', () => {
    const r = solveWalkingWildRespin(baseCfg());
    expect(r.varianceRespins).toBeGreaterThanOrEqual(0);
  });
});

// ── Monotonicity ─────────────────────────────────────────────────────────

describe('solveWalkingWildRespin — monotonicity', () => {
  it('larger grid ⇒ larger E[K] (symmetric random walk)', () => {
    const small = solveWalkingWildRespin(baseCfg({ gridCols: 3, startColumnPmf: uniformStart(3) }));
    const large = solveWalkingWildRespin(baseCfg({ gridCols: 9, startColumnPmf: uniformStart(9) }));
    expect(large.expectedRespins).toBeGreaterThan(small.expectedRespins);
  });
  it('higher stay probability ⇒ larger E[K]', () => {
    const noStay = solveWalkingWildRespin(baseCfg({ stepPmf: { left: 0.5, stay: 0, right: 0.5 } }));
    const stay = solveWalkingWildRespin(baseCfg({ stepPmf: { left: 0.25, stay: 0.5, right: 0.25 } }));
    expect(stay.expectedRespins).toBeGreaterThan(noStay.expectedRespins);
  });
  it('reward scaled 2× ⇒ E[Y] scaled 2×', () => {
    const r1 = solveWalkingWildRespin(baseCfg());
    const r2 = solveWalkingWildRespin(baseCfg({
      rewardDistribution: [
        { rewardX: 2, weight: 6 },
        { rewardX: 4, weight: 3 },
        { rewardX: 10, weight: 1 },
      ],
    }));
    expect(r2.expectedPayoutPerEpisode).toBeCloseTo(r1.expectedPayoutPerEpisode * 2, 8);
  });
});

// ── MC cross-validation ─────────────────────────────────────────────────────

describe('solveWalkingWildRespin — MC cross-validation', () => {
  it('E[Y] matches MC at 50K episodes (rel ≤ 3%)', () => {
    const cfg = baseCfg();
    const cf = solveWalkingWildRespin(cfg);
    const mc = simulateWalkingWildRespin(cfg, 50_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedPayoutPerEpisode - mc.observedMeanPayout) / cf.expectedPayoutPerEpisode;
    expect(rel).toBeLessThan(0.03);
  });
  it('E[K] matches MC closely (rel ≤ 2%)', () => {
    const cfg = baseCfg();
    const cf = solveWalkingWildRespin(cfg);
    const mc = simulateWalkingWildRespin(cfg, 50_000, 0xbeefbabe);
    const rel = Math.abs(cf.expectedRespins - mc.observedMeanRespins) / cf.expectedRespins;
    expect(rel).toBeLessThan(0.02);
  });
  it('Var[K] matches MC at 50K (rel ≤ 10%)', () => {
    const cfg = baseCfg();
    const cf = solveWalkingWildRespin(cfg);
    const mc = simulateWalkingWildRespin(cfg, 50_000, 0xdecafbad);
    const rel = Math.abs(cf.varianceRespins - mc.observedVarianceRespins) / Math.max(cf.varianceRespins, 1e-9);
    expect(rel).toBeLessThan(0.10);
  });
  it('strict-right walk: MC mean K matches expected G−c for fixed start', () => {
    const cfg: WalkingWildRespinConfig = {
      gridCols: 7,
      startColumnPmf: [0, 0, 1, 0, 0, 0, 0], // start at col 2
      stepPmf: { left: 0, stay: 0, right: 1 },
      rewardDistribution: [{ rewardX: 1, weight: 1 }],
    };
    const cf = solveWalkingWildRespin(cfg);
    expect(cf.expectedRespins).toBeCloseTo(5, 10); // 2 → 3 → 4 → 5 → 6 → OUT: 5 steps
    const mc = simulateWalkingWildRespin(cfg, 100, 1);
    expect(mc.observedMeanRespins).toBe(5);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────

describe('solveWalkingWildRespin — edges', () => {
  it('high stay (p=0.99) ⇒ very large E[K]', () => {
    const r = solveWalkingWildRespin(baseCfg({
      stepPmf: { left: 0.005, stay: 0.99, right: 0.005 },
    }));
    expect(r.expectedRespins).toBeGreaterThan(50);
  });
  it('zero reward ⇒ E[Y] = 0 but E[K] > 0', () => {
    const r = solveWalkingWildRespin(baseCfg({
      rewardDistribution: [{ rewardX: 0, weight: 1 }],
    }));
    expect(r.expectedPayoutPerEpisode).toBe(0);
    expect(r.expectedRespins).toBeGreaterThan(0);
  });
  it('PMF first term k=1 corresponds to immediate exit', () => {
    // Strict-right walk from col=0 in G=2: 1 step → at col 1 → out
    const cfg: WalkingWildRespinConfig = {
      gridCols: 2,
      startColumnPmf: [0, 1], // start at col 1 (rightmost)
      stepPmf: { left: 0, stay: 0, right: 1 },
      rewardDistribution: [{ rewardX: 1, weight: 1 }],
    };
    const r = solveWalkingWildRespin(cfg);
    // From col 1, RIGHT step → OUT after 1 step
    expect(r.expectedRespins).toBeCloseTo(1, 10);
    expect(r.respinCountPmf[0].k).toBe(1);
    expect(r.respinCountPmf[0].probability).toBeCloseTo(1, 10);
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe('solveWalkingWildRespin — determinism', () => {
  it('identical inputs ⇒ bit-exact outputs', () => {
    const a = solveWalkingWildRespin(baseCfg());
    const b = solveWalkingWildRespin(baseCfg());
    expect(a.expectedPayoutPerEpisode).toBe(b.expectedPayoutPerEpisode);
    expect(a.expectedRespins).toBe(b.expectedRespins);
    expect(a.varianceRespins).toBe(b.varianceRespins);
  });
  it('MC same seed ⇒ identical', () => {
    const cfg = baseCfg();
    const a = simulateWalkingWildRespin(cfg, 1000, 42);
    const b = simulateWalkingWildRespin(cfg, 1000, 42);
    expect(a.observedMeanRespins).toBe(b.observedMeanRespins);
    expect(a.observedMeanPayout).toBe(b.observedMeanPayout);
  });
});
