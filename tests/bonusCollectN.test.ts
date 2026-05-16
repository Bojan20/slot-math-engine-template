/**
 * W152 Wave 118 — Bonus Collect-N Trigger Tracker tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveBonusCollectN,
  simulateBonusCollectN,
  type BonusCollectNConfig,
} from '../src/features/bonusCollectN.js';

const baseCfg = (overrides: Partial<BonusCollectNConfig> = {}): BonusCollectNConfig => ({
  collectProbabilityPerSpin: 0.05,
  triggerThreshold: 10,
  ...overrides,
});

describe('validation', () => {
  it('rejects p ≤ 0', () => {
    expect(() => solveBonusCollectN(baseCfg({ collectProbabilityPerSpin: 0 }))).toThrow();
  });
  it('rejects p > 1', () => {
    expect(() => solveBonusCollectN(baseCfg({ collectProbabilityPerSpin: 1.5 }))).toThrow();
  });
  it('rejects non-integer threshold', () => {
    expect(() => solveBonusCollectN(baseCfg({ triggerThreshold: 2.5 }))).toThrow();
  });
  it('rejects threshold < 1', () => {
    expect(() => solveBonusCollectN(baseCfg({ triggerThreshold: 0 }))).toThrow();
  });
  it('rejects bad percentile target', () => {
    expect(() => solveBonusCollectN(baseCfg({ percentileTargets: [0] }))).toThrow();
    expect(() => solveBonusCollectN(baseCfg({ percentileTargets: [1] }))).toThrow();
  });
  it('rejects bad horizon', () => {
    expect(() => solveBonusCollectN(baseCfg({ horizonSpins: 0 }))).toThrow();
    expect(() => solveBonusCollectN(baseCfg({ horizonSpins: -5 }))).toThrow();
  });
});

describe('closed-form moments', () => {
  it('E[T_N] = N/p', () => {
    const r = solveBonusCollectN(baseCfg());
    expect(r.expectedWaitTime).toBeCloseTo(10 / 0.05, 8); // = 200
  });
  it('Var[T_N] = N(1-p)/p²', () => {
    const r = solveBonusCollectN(baseCfg());
    // Var = 10 · 0.95 / 0.0025 = 9.5 / 0.0025 = 3800
    expect(r.varianceWaitTime).toBeCloseTo(3800, 4);
  });
  it('std = √Var', () => {
    const r = solveBonusCollectN(baseCfg());
    expect(r.stdWaitTime).toBeCloseTo(Math.sqrt(3800), 6);
  });
  it('triggerRatePerSpin = p/N', () => {
    const r = solveBonusCollectN(baseCfg());
    expect(r.triggerRatePerSpin).toBeCloseTo(0.05 / 10, 8); // = 0.005
  });
  it('reduces to Geometric when N=1', () => {
    const r = solveBonusCollectN(baseCfg({ triggerThreshold: 1 }));
    // NB(1, p) = shifted Geometric(p): E = 1/p, Var = (1-p)/p²
    expect(r.expectedWaitTime).toBe(20);
    expect(r.varianceWaitTime).toBeCloseTo(0.95 / 0.0025, 6); // = 380
  });
});

describe('percentile / median', () => {
  it('median is between mean − std and mean + std (sanity)', () => {
    const r = solveBonusCollectN(baseCfg());
    expect(r.medianWaitTime).toBeGreaterThan(r.expectedWaitTime - r.stdWaitTime);
    expect(r.medianWaitTime).toBeLessThan(r.expectedWaitTime + r.stdWaitTime);
  });
  it('median ≥ N (cannot trigger faster than N spins)', () => {
    const r = solveBonusCollectN(baseCfg());
    expect(r.medianWaitTime).toBeGreaterThanOrEqual(10);
  });
  it('percentile monotone: P50 ≤ P75 ≤ P95', () => {
    const r = solveBonusCollectN(baseCfg({ percentileTargets: [0.5, 0.75, 0.95] }));
    const pcts = r.percentileWaitTimes;
    expect(pcts['0.5']).toBeLessThanOrEqual(pcts['0.75']);
    expect(pcts['0.75']).toBeLessThanOrEqual(pcts['0.95']);
  });
  it('custom percentile 0.99 returns valid integer', () => {
    const r = solveBonusCollectN(baseCfg({ percentileTargets: [0.99] }));
    const p99 = r.percentileWaitTimes['0.99'];
    expect(Number.isInteger(p99)).toBe(true);
    expect(p99).toBeGreaterThan(r.expectedWaitTime);
  });
  it('N=1, p=0.5 median = 1 (geometric, ceil(log0.5/log0.5)=1)', () => {
    const r = solveBonusCollectN({ collectProbabilityPerSpin: 0.5, triggerThreshold: 1 });
    expect(r.medianWaitTime).toBe(1);
  });
});

describe('horizon disclosure', () => {
  it('P(trigger within horizon) defined when horizonSpins set', () => {
    const r = solveBonusCollectN(baseCfg({ horizonSpins: 500 }));
    expect(r.probTriggerWithinHorizon).toBeDefined();
    expect(r.probTriggerWithinHorizon).toBeGreaterThan(0);
    expect(r.probTriggerWithinHorizon).toBeLessThanOrEqual(1);
  });
  it('horizonSpins = N (minimum) → P = p^N', () => {
    const r = solveBonusCollectN({ collectProbabilityPerSpin: 0.5, triggerThreshold: 3, horizonSpins: 3 });
    // P(T_3 ≤ 3) = P(all 3 succeed in 3 spins) = 0.5^3 = 0.125
    expect(r.probTriggerWithinHorizon).toBeCloseTo(0.125, 6);
  });
  it('horizonSpins → infinity → P → 1', () => {
    const r = solveBonusCollectN(baseCfg({ horizonSpins: 100_000 }));
    expect(r.probTriggerWithinHorizon).toBeCloseTo(1, 4);
  });
  it('E[triggers in horizon] = K · p / N', () => {
    const r = solveBonusCollectN(baseCfg({ horizonSpins: 1000 }));
    expect(r.expectedTriggersInHorizon).toBeCloseTo(1000 * 0.05 / 10, 8); // = 5
  });
  it('horizon not provided → trigger fields undefined', () => {
    const r = solveBonusCollectN(baseCfg());
    expect(r.probTriggerWithinHorizon).toBeUndefined();
    expect(r.expectedTriggersInHorizon).toBeUndefined();
  });
});

describe('monotonicity', () => {
  it('higher p → lower E[T_N]', () => {
    const a = solveBonusCollectN({ collectProbabilityPerSpin: 0.01, triggerThreshold: 10 });
    const b = solveBonusCollectN({ collectProbabilityPerSpin: 0.10, triggerThreshold: 10 });
    expect(b.expectedWaitTime).toBeLessThan(a.expectedWaitTime);
  });
  it('higher N → higher E[T_N]', () => {
    const a = solveBonusCollectN({ collectProbabilityPerSpin: 0.05, triggerThreshold: 5 });
    const b = solveBonusCollectN({ collectProbabilityPerSpin: 0.05, triggerThreshold: 20 });
    expect(b.expectedWaitTime).toBeGreaterThan(a.expectedWaitTime);
  });
  it('higher horizon → higher P(trigger within)', () => {
    const a = solveBonusCollectN(baseCfg({ horizonSpins: 100 }));
    const b = solveBonusCollectN(baseCfg({ horizonSpins: 500 }));
    expect(b.probTriggerWithinHorizon!).toBeGreaterThan(a.probTriggerWithinHorizon!);
  });
});

describe('MC cross-validation', () => {
  it('MC E[T_N] matches CF (rel ≤ 3% at 20K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveBonusCollectN(cfg);
    const mc = simulateBonusCollectN(cfg, 20_000, 0xdeadbeef);
    const rel = Math.abs(cf.expectedWaitTime - mc.observedMeanWaitTime) / cf.expectedWaitTime;
    expect(rel).toBeLessThan(0.03);
  });
  it('MC Var[T_N] matches CF (rel ≤ 15% at 50K)', () => {
    const cfg = baseCfg();
    const cf = solveBonusCollectN(cfg);
    const mc = simulateBonusCollectN(cfg, 50_000, 0xcafe1234);
    const rel = Math.abs(cf.varianceWaitTime - mc.observedVarianceWaitTime) / cf.varianceWaitTime;
    expect(rel).toBeLessThan(0.15);
  });
  it('MC P(trigger within horizon) matches CF (abs ≤ 0.02 at 20K)', () => {
    const cfg = baseCfg({ horizonSpins: 200 });
    const cf = solveBonusCollectN(cfg);
    const mc = simulateBonusCollectN(cfg, 20_000, 0xbeefcafe);
    expect(Math.abs(cf.probTriggerWithinHorizon! - mc.observedTriggerWithinHorizonFraction!)).toBeLessThan(0.02);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveBonusCollectN(baseCfg());
    const b = solveBonusCollectN(baseCfg());
    expect(a.expectedWaitTime).toBe(b.expectedWaitTime);
    expect(a.medianWaitTime).toBe(b.medianWaitTime);
  });
  it('MC same seed → identical', () => {
    const a = simulateBonusCollectN(baseCfg(), 1000, 42);
    const b = simulateBonusCollectN(baseCfg(), 1000, 42);
    expect(a.observedMeanWaitTime).toBe(b.observedMeanWaitTime);
  });
});

describe('industry use-cases', () => {
  it('Money Cart style: collect 6 coins, p=0.03', () => {
    const r = solveBonusCollectN({
      collectProbabilityPerSpin: 0.03,
      triggerThreshold: 6,
      percentileTargets: [0.5, 0.95],
      horizonSpins: 500,
    });
    expect(r.expectedWaitTime).toBeCloseTo(200, 4); // 6/0.03
    expect(r.probTriggerWithinHorizon).toBeGreaterThan(0.5);
  });
  it('Money Train style: collect 12 coins for re-trigger', () => {
    const r = solveBonusCollectN({
      collectProbabilityPerSpin: 0.04,
      triggerThreshold: 12,
    });
    expect(r.expectedWaitTime).toBeCloseTo(300, 4); // 12/0.04
  });
  it('high-threshold rare-trigger: N=20 collects @ p=0.01', () => {
    const r = solveBonusCollectN({
      collectProbabilityPerSpin: 0.01,
      triggerThreshold: 20,
      horizonSpins: 5000,
    });
    expect(r.expectedWaitTime).toBe(2000);
    expect(r.probTriggerWithinHorizon).toBeGreaterThan(0.5); // should hit ~88% by 5000
  });
});
