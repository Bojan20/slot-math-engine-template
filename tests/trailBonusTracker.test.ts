/**
 * W152 Wave 144 — Trail/Board Bonus Progression Tracker tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveTrailBonusTracker,
  simulateTrailBonusTracker,
  type TrailBonusTrackerConfig,
} from '../src/features/trailBonusTracker.js';

const baseCfg = (overrides: Partial<TrailBonusTrackerConfig> = {}): TrailBonusTrackerConfig => ({
  trailLength: 10,
  maxPicks: 15,
  stepPmf: [
    { step: 1, probability: 0.5 },
    { step: 2, probability: 0.3 },
    { step: 3, probability: 0.2 },
  ],
  positionRewardX: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 0], // last (end) handled by endBonusX
  endBonusX: 100,
  bustPositions: [4, 7],
  ...overrides,
});

describe('validation', () => {
  it('rejects trailLength < 2', () => {
    expect(() => solveTrailBonusTracker(baseCfg({ trailLength: 1 }))).toThrow();
  });
  it('rejects maxPicks < 1', () => {
    expect(() => solveTrailBonusTracker(baseCfg({ maxPicks: 0 }))).toThrow();
  });
  it('rejects empty stepPmf', () => {
    expect(() => solveTrailBonusTracker(baseCfg({ stepPmf: [] }))).toThrow();
  });
  it('rejects step < 1', () => {
    expect(() => solveTrailBonusTracker(baseCfg({
      stepPmf: [{ step: 0, probability: 1 }],
    }))).toThrow();
  });
  it('rejects stepPmf not summing to 1', () => {
    expect(() => solveTrailBonusTracker(baseCfg({
      stepPmf: [{ step: 1, probability: 0.4 }, { step: 2, probability: 0.4 }],
    }))).toThrow();
  });
  it('rejects positionRewardX wrong length', () => {
    expect(() => solveTrailBonusTracker(baseCfg({ positionRewardX: [0, 1, 2] }))).toThrow();
  });
  it('rejects negative positionRewardX entry', () => {
    expect(() => solveTrailBonusTracker(baseCfg({
      positionRewardX: [0, -1, 2, 3, 5, 8, 13, 21, 34, 55, 0],
    }))).toThrow();
  });
  it('rejects negative endBonusX', () => {
    expect(() => solveTrailBonusTracker(baseCfg({ endBonusX: -10 }))).toThrow();
  });
  it('rejects bustPosition out of bounds', () => {
    expect(() => solveTrailBonusTracker(baseCfg({ bustPositions: [0] }))).toThrow();
    expect(() => solveTrailBonusTracker(baseCfg({ bustPositions: [10] }))).toThrow();
    expect(() => solveTrailBonusTracker(baseCfg({ bustPositions: [11] }))).toThrow();
  });
});

describe('probability conservation', () => {
  it('P_reach + P_bust + P_timeout = 1', () => {
    const r = solveTrailBonusTracker(baseCfg());
    expect(r.probReachEnd + r.probBust + r.probTimeout).toBeCloseTo(1, 8);
  });
  it('All probs non-negative', () => {
    const r = solveTrailBonusTracker(baseCfg());
    expect(r.probReachEnd).toBeGreaterThanOrEqual(0);
    expect(r.probBust).toBeGreaterThanOrEqual(0);
    expect(r.probTimeout).toBeGreaterThanOrEqual(0);
  });
  it('No bust positions → P_bust = 0', () => {
    const r = solveTrailBonusTracker(baseCfg({ bustPositions: [] }));
    expect(r.probBust).toBeCloseTo(0, 10);
  });
});

describe('reward correctness', () => {
  it('E[reward] > 0 with positive paytable', () => {
    const r = solveTrailBonusTracker(baseCfg());
    expect(r.expectedTotalRewardX).toBeGreaterThan(0);
  });
  it('Var ≥ 0', () => {
    const r = solveTrailBonusTracker(baseCfg());
    expect(r.varianceTotalRewardX).toBeGreaterThanOrEqual(0);
  });
  it('zero rewards everywhere → E[reward] = endBonusX · P_reach', () => {
    const r = solveTrailBonusTracker(baseCfg({
      positionRewardX: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      bustPositions: [], // no busts
    }));
    expect(r.expectedTotalRewardX).toBeCloseTo(100 * r.probReachEnd, 6);
  });
  it('higher endBonusX → higher E[reward]', () => {
    const a = solveTrailBonusTracker(baseCfg({ endBonusX: 50 }));
    const b = solveTrailBonusTracker(baseCfg({ endBonusX: 500 }));
    expect(b.expectedTotalRewardX).toBeGreaterThan(a.expectedTotalRewardX);
  });
});

describe('monotonicity', () => {
  it('more maxPicks → higher (or equal) E[reward]', () => {
    const a = solveTrailBonusTracker(baseCfg({ maxPicks: 5 }));
    const b = solveTrailBonusTracker(baseCfg({ maxPicks: 20 }));
    expect(b.expectedTotalRewardX).toBeGreaterThanOrEqual(a.expectedTotalRewardX);
  });
  it('more bust positions → higher P_bust, lower E[reward]', () => {
    const a = solveTrailBonusTracker(baseCfg({ bustPositions: [4] }));
    const b = solveTrailBonusTracker(baseCfg({ bustPositions: [4, 7, 8] }));
    expect(b.probBust).toBeGreaterThan(a.probBust);
    expect(b.expectedTotalRewardX).toBeLessThan(a.expectedTotalRewardX);
  });
  it('longer trail → lower P_reach (for same picks)', () => {
    const a = solveTrailBonusTracker(baseCfg({
      trailLength: 5,
      positionRewardX: [0, 1, 2, 3, 5, 0],
      bustPositions: [],
    }));
    const b = solveTrailBonusTracker(baseCfg({
      trailLength: 20,
      positionRewardX: Array.from({ length: 21 }, (_, i) => i),
      bustPositions: [],
    }));
    expect(b.probReachEnd).toBeLessThan(a.probReachEnd);
  });
});

describe('corner cases', () => {
  it('step=N w.p. 1 → reach end in 1 pick (P_reach=1)', () => {
    const r = solveTrailBonusTracker(baseCfg({
      stepPmf: [{ step: 10, probability: 1 }],
      bustPositions: [],
    }));
    expect(r.probReachEnd).toBeCloseTo(1, 8);
    expect(r.expectedPicksUsed).toBeCloseTo(1, 8);
  });
  it('step=1 w.p. 1, no bust, maxPicks=N → P_reach=1, exactly N picks', () => {
    const r = solveTrailBonusTracker(baseCfg({
      stepPmf: [{ step: 1, probability: 1 }],
      bustPositions: [],
      maxPicks: 10,
    }));
    expect(r.probReachEnd).toBeCloseTo(1, 8);
    expect(r.expectedPicksUsed).toBeCloseTo(10, 8);
  });
  it('step=1 w.p. 1, maxPicks=N-1 → P_timeout=1, no reach', () => {
    const r = solveTrailBonusTracker(baseCfg({
      stepPmf: [{ step: 1, probability: 1 }],
      bustPositions: [],
      maxPicks: 9,
    }));
    expect(r.probReachEnd).toBeCloseTo(0, 8);
    expect(r.probTimeout).toBeCloseTo(1, 8);
  });
  it('all positions are bust except 0 and end → P_bust = 1 for step < N', () => {
    const r = solveTrailBonusTracker(baseCfg({
      stepPmf: [{ step: 1, probability: 1 }],
      bustPositions: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    }));
    expect(r.probBust).toBeCloseTo(1, 8);
  });
});

describe('industry parametrizations', () => {
  it('Konami Stairway 12-step short trail', () => {
    const r = solveTrailBonusTracker({
      trailLength: 12,
      maxPicks: 8,
      stepPmf: [
        { step: 1, probability: 0.6 },
        { step: 2, probability: 0.3 },
        { step: 3, probability: 0.1 },
      ],
      positionRewardX: [0, 2, 5, 10, 20, 50, 0, 100, 250, 500, 1000, 2000, 0],
      endBonusX: 5000,
      bustPositions: [6],
    });
    expect(r.expectedTotalRewardX).toBeGreaterThan(0);
  });
  it("IGT Wheel of Fortune Multi-Tier Trail 20-step", () => {
    const r = solveTrailBonusTracker({
      trailLength: 20,
      maxPicks: 12,
      stepPmf: [
        { step: 1, probability: 0.7 },
        { step: 3, probability: 0.2 },
        { step: 5, probability: 0.1 },
      ],
      positionRewardX: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765, 0],
      endBonusX: 10000,
      bustPositions: [],
    });
    expect(r.expectedTotalRewardX).toBeGreaterThan(0);
    expect(r.probReachEnd + r.probBust + r.probTimeout).toBeCloseTo(1, 8);
  });
  it('Microgaming Lord of the Rings Trail 30-step deep', () => {
    const r = solveTrailBonusTracker({
      trailLength: 30,
      maxPicks: 20,
      stepPmf: [
        { step: 1, probability: 0.4 },
        { step: 2, probability: 0.3 },
        { step: 3, probability: 0.2 },
        { step: 5, probability: 0.1 },
      ],
      positionRewardX: Array.from({ length: 31 }, (_, i) => i * 5),
      endBonusX: 50000,
      bustPositions: [10, 20],
    });
    expect(r.expectedTotalRewardX).toBeGreaterThan(0);
  });
});

describe('MC cross-validation', () => {
  it('MC E[reward] matches CF (rel ≤ 4% at 100K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveTrailBonusTracker(cfg);
    const mc = simulateTrailBonusTracker(cfg, 100_000, 0xdeadbeef);
    const rel = Math.abs(cf.expectedTotalRewardX - mc.observedMeanTotalRewardX) /
      Math.max(cf.expectedTotalRewardX, 1e-9);
    expect(rel).toBeLessThan(0.04);
  });
  it('MC P_reach matches CF (abs ≤ 0.01 at 100K)', () => {
    const cfg = baseCfg();
    const cf = solveTrailBonusTracker(cfg);
    const mc = simulateTrailBonusTracker(cfg, 100_000, 0xcafe1234);
    expect(Math.abs(cf.probReachEnd - mc.observedReachEndFraction)).toBeLessThan(0.01);
  });
  it('MC P_bust matches CF (abs ≤ 0.01 at 100K)', () => {
    const cfg = baseCfg();
    const cf = solveTrailBonusTracker(cfg);
    const mc = simulateTrailBonusTracker(cfg, 100_000, 0xbeefcafe);
    expect(Math.abs(cf.probBust - mc.observedBustFraction)).toBeLessThan(0.01);
  });
  it('MC E[final position] matches CF (rel ≤ 3% at 100K)', () => {
    const cfg = baseCfg();
    const cf = solveTrailBonusTracker(cfg);
    const mc = simulateTrailBonusTracker(cfg, 100_000, 0x1234);
    const rel = Math.abs(cf.expectedFinalPosition - mc.observedMeanFinalPosition) /
      Math.max(cf.expectedFinalPosition, 1e-9);
    expect(rel).toBeLessThan(0.03);
  });
  it('MC E[picks used] matches CF (rel ≤ 3% at 100K)', () => {
    const cfg = baseCfg();
    const cf = solveTrailBonusTracker(cfg);
    const mc = simulateTrailBonusTracker(cfg, 100_000, 0x5678);
    const rel = Math.abs(cf.expectedPicksUsed - mc.observedMeanPicksUsed) /
      Math.max(cf.expectedPicksUsed, 1e-9);
    expect(rel).toBeLessThan(0.03);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveTrailBonusTracker(baseCfg());
    const b = solveTrailBonusTracker(baseCfg());
    expect(a.expectedTotalRewardX).toBe(b.expectedTotalRewardX);
  });
  it('MC same seed → identical', () => {
    const a = simulateTrailBonusTracker(baseCfg(), 1000, 42);
    const b = simulateTrailBonusTracker(baseCfg(), 1000, 42);
    expect(a.observedMeanTotalRewardX).toBe(b.observedMeanTotalRewardX);
  });
});

describe('distinctness vs prior Wxx', () => {
  it('linear advance (W144) vs count-based (W101 Symbol Upgrade)', () => {
    // W101: count-based k upgrades, no position state, no bust.
    // W144: position-state DP sa step-PMF + bust positions.
    const r = solveTrailBonusTracker(baseCfg());
    // Bust positions present → can fail
    expect(r.probBust).toBeGreaterThan(0);
  });
});
