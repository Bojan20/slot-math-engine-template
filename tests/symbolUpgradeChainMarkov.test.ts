/**
 * W152 Wave 101 — Symbol Upgrade Chain Markov tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveSymbolUpgradeChain,
  simulateSymbolUpgradeChain,
  type SymbolUpgradeChainConfig,
} from '../src/features/symbolUpgradeChainMarkov.js';

const baseCfg = (overrides: Partial<SymbolUpgradeChainConfig> = {}): SymbolUpgradeChainConfig => ({
  freeSpinsK: 15,
  advanceProbabilityPerSpin: 0.25,
  payoutValuesPerState: [1, 2, 5, 10, 25, 100], // L=5 (6 states)
  ...overrides,
});

describe('validation', () => {
  it('rejects K < 1', () => {
    expect(() => solveSymbolUpgradeChain(baseCfg({ freeSpinsK: 0 }))).toThrow();
  });
  it('rejects non-integer K', () => {
    expect(() => solveSymbolUpgradeChain(baseCfg({ freeSpinsK: 1.5 }))).toThrow();
  });
  it('rejects p out of [0,1]', () => {
    expect(() => solveSymbolUpgradeChain(baseCfg({ advanceProbabilityPerSpin: 1.5 }))).toThrow();
    expect(() => solveSymbolUpgradeChain(baseCfg({ advanceProbabilityPerSpin: -0.1 }))).toThrow();
  });
  it('rejects too-short ladder', () => {
    expect(() => solveSymbolUpgradeChain(baseCfg({ payoutValuesPerState: [1] }))).toThrow();
  });
  it('rejects negative payout', () => {
    expect(() => solveSymbolUpgradeChain(baseCfg({ payoutValuesPerState: [1, -2] }))).toThrow();
  });
  it('rejects bad baseTrigger', () => {
    expect(() => solveSymbolUpgradeChain(baseCfg({ baseTriggerProbabilityPerSpin: 1.5 }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('E[A] = K · p', () => {
    const r = solveSymbolUpgradeChain(baseCfg());
    expect(r.expectedAdvances).toBeCloseTo(15 * 0.25, 8); // 3.75
  });
  it('Var[A] = K · p · (1-p)', () => {
    const r = solveSymbolUpgradeChain(baseCfg());
    expect(r.varianceAdvances).toBeCloseTo(15 * 0.25 * 0.75, 8);
  });
  it('state distribution sums to 1', () => {
    const r = solveSymbolUpgradeChain(baseCfg());
    const sum = r.finalStateDistribution.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 8);
  });
  it('P(F=0) = (1-p)^K', () => {
    const r = solveSymbolUpgradeChain(baseCfg());
    expect(r.finalStateDistribution[0]).toBeCloseTo(Math.pow(0.75, 15), 10);
  });
  it('P(F=L) when K=L → P(K successes in K trials) = p^K', () => {
    const r = solveSymbolUpgradeChain({
      freeSpinsK: 5,
      advanceProbabilityPerSpin: 0.5,
      payoutValuesPerState: [1, 2, 5, 10, 25, 100],
    });
    expect(r.finalStateDistribution[5]).toBeCloseTo(Math.pow(0.5, 5), 8);
  });
  it('p=0 → always stay at S_0', () => {
    const r = solveSymbolUpgradeChain(baseCfg({ advanceProbabilityPerSpin: 0 }));
    expect(r.finalStateDistribution[0]).toBeCloseTo(1, 10);
    expect(r.expectedPayoutX).toBeCloseTo(1, 8); // v_0 = 1
  });
  it('p=1 → guaranteed reach top in K ≥ L spins', () => {
    const r = solveSymbolUpgradeChain(baseCfg({ advanceProbabilityPerSpin: 1 }));
    expect(r.finalStateDistribution[5]).toBeCloseTo(1, 10); // all reach top
    expect(r.expectedPayoutX).toBeCloseTo(100, 8); // v_L = 100
  });
  it('p=1, K < L → guaranteed reach state K', () => {
    const r = solveSymbolUpgradeChain({
      freeSpinsK: 3,
      advanceProbabilityPerSpin: 1,
      payoutValuesPerState: [1, 2, 5, 10, 25, 100],
    });
    // After 3 advances, state = 3
    expect(r.finalStateDistribution[3]).toBeCloseTo(1, 10);
    expect(r.expectedPayoutX).toBeCloseTo(10, 8);
  });
  it('per-base-spin contribution if baseTrigger set', () => {
    const r = solveSymbolUpgradeChain(baseCfg({ baseTriggerProbabilityPerSpin: 0.01 }));
    expect(r.expectedFeaturePayoutPerBaseSpin).toBeCloseTo(0.01 * r.expectedPayoutX, 8);
  });
  it('no base trigger ⇒ null', () => {
    const r = solveSymbolUpgradeChain(baseCfg());
    expect(r.expectedFeaturePayoutPerBaseSpin).toBeNull();
  });
  it('variance non-negative', () => {
    const r = solveSymbolUpgradeChain(baseCfg());
    expect(r.variancePayoutX).toBeGreaterThanOrEqual(0);
  });
});

describe('monotonicity', () => {
  it('higher p ⇒ higher P(reach top)', () => {
    const a = solveSymbolUpgradeChain(baseCfg({ advanceProbabilityPerSpin: 0.1 }));
    const b = solveSymbolUpgradeChain(baseCfg({ advanceProbabilityPerSpin: 0.5 }));
    expect(b.probReachTopState).toBeGreaterThan(a.probReachTopState);
  });
  it('higher p ⇒ higher E[Y]', () => {
    const a = solveSymbolUpgradeChain(baseCfg({ advanceProbabilityPerSpin: 0.1 }));
    const b = solveSymbolUpgradeChain(baseCfg({ advanceProbabilityPerSpin: 0.5 }));
    expect(b.expectedPayoutX).toBeGreaterThan(a.expectedPayoutX);
  });
  it('larger K ⇒ higher P(reach top)', () => {
    const a = solveSymbolUpgradeChain(baseCfg({ freeSpinsK: 5 }));
    const b = solveSymbolUpgradeChain(baseCfg({ freeSpinsK: 30 }));
    expect(b.probReachTopState).toBeGreaterThan(a.probReachTopState);
  });
});

describe('MC cross-validation', () => {
  it('MC E[Y] matches CF (rel ≤ 3% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveSymbolUpgradeChain(cfg);
    const mc = simulateSymbolUpgradeChain(cfg, 50_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedPayoutX - mc.observedMeanPayoutX) / cf.expectedPayoutX;
    expect(rel).toBeLessThan(0.03);
  });
  it('MC Var[Y] matches CF (rel ≤ 15% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveSymbolUpgradeChain(cfg);
    const mc = simulateSymbolUpgradeChain(cfg, 50_000, 0xbeefbabe);
    const rel = Math.abs(cf.variancePayoutX - mc.observedVariancePayoutX) / cf.variancePayoutX;
    expect(rel).toBeLessThan(0.15);
  });
  it('MC state distribution matches CF (each entry rel ≤ 5%)', () => {
    const cfg = baseCfg();
    const cf = solveSymbolUpgradeChain(cfg);
    const mc = simulateSymbolUpgradeChain(cfg, 50_000, 0xfeedface);
    for (let i = 0; i < cf.finalStateDistribution.length; i++) {
      if (cf.finalStateDistribution[i] > 0.01) {
        // only check states with > 1% theoretical probability
        const rel = Math.abs(cf.finalStateDistribution[i] - mc.observedStateHistogram[i]) /
          cf.finalStateDistribution[i];
        expect(rel).toBeLessThan(0.05);
      }
    }
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveSymbolUpgradeChain(baseCfg());
    const b = solveSymbolUpgradeChain(baseCfg());
    expect(a.expectedPayoutX).toBe(b.expectedPayoutX);
  });
  it('MC same seed → identical', () => {
    const a = simulateSymbolUpgradeChain(baseCfg(), 1000, 42);
    const b = simulateSymbolUpgradeChain(baseCfg(), 1000, 42);
    expect(a.totalPayoutX).toBe(b.totalPayoutX);
  });
});

describe('industry use-cases', () => {
  it('Pragmatic-style 6-tier ladder, K=20 FS', () => {
    const r = solveSymbolUpgradeChain({
      freeSpinsK: 20,
      advanceProbabilityPerSpin: 0.15,
      payoutValuesPerState: [1, 3, 10, 25, 75, 250],
    });
    expect(r.expectedPayoutX).toBeGreaterThan(0);
    expect(r.probReachTopState).toBeGreaterThan(0);
    expect(r.probReachTopState).toBeLessThan(1);
  });
  it('BTG-style aggressive 3-tier ladder', () => {
    const r = solveSymbolUpgradeChain({
      freeSpinsK: 8,
      advanceProbabilityPerSpin: 0.4,
      payoutValuesPerState: [1, 5, 50],
    });
    expect(r.finalStateDistribution).toHaveLength(3);
    expect(r.expectedPayoutX).toBeGreaterThan(1);
  });
});
