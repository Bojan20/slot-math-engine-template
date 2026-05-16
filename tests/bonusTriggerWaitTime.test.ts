/**
 * W152 Wave 110 — Bonus Trigger Wait Time Analyzer tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveBonusTriggerWaitTime,
  simulateBonusTriggerWaitTime,
  type BonusTriggerWaitTimeConfig,
} from '../src/features/bonusTriggerWaitTime.js';

const baseCfg = (overrides: Partial<BonusTriggerWaitTimeConfig> = {}): BonusTriggerWaitTimeConfig => ({
  features: [
    { label: 'free_spins',  triggerProbabilityPerSpin: 0.01 },
    { label: 'wheel_bonus', triggerProbabilityPerSpin: 0.005 },
    { label: 'pick_bonus',  triggerProbabilityPerSpin: 0.002 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects empty features', () => {
    expect(() => solveBonusTriggerWaitTime({ features: [] })).toThrow();
  });
  it('rejects p ≤ 0', () => {
    expect(() => solveBonusTriggerWaitTime({
      features: [{ label: 'x', triggerProbabilityPerSpin: 0 }],
    })).toThrow();
  });
  it('rejects p > 1', () => {
    expect(() => solveBonusTriggerWaitTime({
      features: [{ label: 'x', triggerProbabilityPerSpin: 1.5 }],
    })).toThrow();
  });
  it('rejects duplicate label', () => {
    expect(() => solveBonusTriggerWaitTime({
      features: [
        { label: 'a', triggerProbabilityPerSpin: 0.01 },
        { label: 'a', triggerProbabilityPerSpin: 0.02 },
      ],
    })).toThrow();
  });
  it('rejects bad percentile target', () => {
    expect(() => solveBonusTriggerWaitTime(baseCfg({ percentileTargets: [0] }))).toThrow();
    expect(() => solveBonusTriggerWaitTime(baseCfg({ percentileTargets: [1] }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('E[T_i] = 1/p_i', () => {
    const r = solveBonusTriggerWaitTime(baseCfg());
    expect(r.perFeature[0].expectedWaitTime).toBeCloseTo(100, 8);
    expect(r.perFeature[1].expectedWaitTime).toBeCloseTo(200, 8);
    expect(r.perFeature[2].expectedWaitTime).toBeCloseTo(500, 8);
  });
  it('Var[T_i] = (1-p)/p²', () => {
    const r = solveBonusTriggerWaitTime(baseCfg());
    expect(r.perFeature[0].varianceWaitTime).toBeCloseTo(0.99 / 0.0001, 4);
    expect(r.perFeature[1].varianceWaitTime).toBeCloseTo(0.995 / 0.000025, 4);
  });
  it('median = ⌈log(0.5)/log(1-p)⌉', () => {
    const r = solveBonusTriggerWaitTime(baseCfg());
    expect(r.perFeature[0].medianWaitTime).toBe(Math.ceil(Math.log(0.5) / Math.log(0.99))); // 69
    expect(r.perFeature[2].medianWaitTime).toBe(Math.ceil(Math.log(0.5) / Math.log(0.998))); // 347
  });
  it('95th percentile wait time', () => {
    const r = solveBonusTriggerWaitTime(baseCfg());
    const expected = Math.ceil(Math.log(0.05) / Math.log(0.99));
    expect(r.perFeature[0].percentileWaitTimes['0.95']).toBe(expected);
  });
  it('custom percentile targets', () => {
    const r = solveBonusTriggerWaitTime(baseCfg({ percentileTargets: [0.99] }));
    expect(r.perFeature[0].percentileWaitTimes['0.99']).toBe(Math.ceil(Math.log(0.01) / Math.log(0.99)));
  });
  it('any-feature p_any = 1 − Π (1-p_i)', () => {
    const r = solveBonusTriggerWaitTime(baseCfg());
    const expected = 1 - 0.99 * 0.995 * 0.998;
    expect(r.anyFeatureTriggerProbability).toBeCloseTo(expected, 8);
  });
  it('any-feature E[T] = 1/p_any', () => {
    const r = solveBonusTriggerWaitTime(baseCfg());
    expect(r.expectedAnyFeatureWaitTime).toBeCloseTo(1 / r.anyFeatureTriggerProbability, 8);
  });
  it('E[features triggered per spin] = Σ p_i', () => {
    const r = solveBonusTriggerWaitTime(baseCfg());
    expect(r.expectedFeaturesTriggeredPerSpin).toBeCloseTo(0.01 + 0.005 + 0.002, 10);
  });
  it('P(multiple features per spin) bounded by P(any feature)', () => {
    const r = solveBonusTriggerWaitTime(baseCfg());
    expect(r.probMultipleFeaturesPerSpin).toBeGreaterThanOrEqual(0);
    expect(r.probMultipleFeaturesPerSpin).toBeLessThan(r.anyFeatureTriggerProbability);
  });
  it('single-feature p=1 → E[T]=1, var=0', () => {
    const r = solveBonusTriggerWaitTime({ features: [{ label: 'always', triggerProbabilityPerSpin: 1 }] });
    expect(r.perFeature[0].expectedWaitTime).toBe(1);
    expect(r.perFeature[0].varianceWaitTime).toBe(0);
    expect(r.perFeature[0].medianWaitTime).toBe(1);
  });
});

describe('monotonicity', () => {
  it('higher p ⇒ lower E[T]', () => {
    const a = solveBonusTriggerWaitTime({ features: [{ label: 'x', triggerProbabilityPerSpin: 0.001 }] });
    const b = solveBonusTriggerWaitTime({ features: [{ label: 'x', triggerProbabilityPerSpin: 0.1 }] });
    expect(b.perFeature[0].expectedWaitTime).toBeLessThan(a.perFeature[0].expectedWaitTime);
  });
  it('more features ⇒ shorter any-feature wait time', () => {
    const a = solveBonusTriggerWaitTime({
      features: [{ label: 'x', triggerProbabilityPerSpin: 0.01 }],
    });
    const b = solveBonusTriggerWaitTime({
      features: [
        { label: 'x', triggerProbabilityPerSpin: 0.01 },
        { label: 'y', triggerProbabilityPerSpin: 0.01 },
      ],
    });
    expect(b.expectedAnyFeatureWaitTime).toBeLessThan(a.expectedAnyFeatureWaitTime);
  });
  it('higher quantile q ⇒ longer wait time', () => {
    const r = solveBonusTriggerWaitTime({
      features: [{ label: 'x', triggerProbabilityPerSpin: 0.01 }],
      percentileTargets: [0.5, 0.75, 0.95, 0.99],
    });
    const pcts = r.perFeature[0].percentileWaitTimes;
    expect(pcts['0.5']).toBeLessThanOrEqual(pcts['0.75']);
    expect(pcts['0.75']).toBeLessThanOrEqual(pcts['0.95']);
    expect(pcts['0.95']).toBeLessThanOrEqual(pcts['0.99']);
  });
});

describe('MC cross-validation', () => {
  it('MC E[T_i] matches CF (rel ≤ 5% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveBonusTriggerWaitTime(cfg);
    const mc = simulateBonusTriggerWaitTime(cfg, 50_000, 0xc0ffee);
    for (let i = 0; i < cf.perFeature.length; i++) {
      const rel = Math.abs(cf.perFeature[i].expectedWaitTime - mc.observedPerFeatureMeanWaitTime[i]) /
        cf.perFeature[i].expectedWaitTime;
      expect(rel).toBeLessThan(0.05);
    }
  });
  it('MC E[T_any] matches CF (rel ≤ 5% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveBonusTriggerWaitTime(cfg);
    const mc = simulateBonusTriggerWaitTime(cfg, 50_000, 0xbeefbabe);
    const rel = Math.abs(cf.expectedAnyFeatureWaitTime - mc.observedMeanAnyFeatureWaitTime) /
      cf.expectedAnyFeatureWaitTime;
    expect(rel).toBeLessThan(0.05);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveBonusTriggerWaitTime(baseCfg());
    const b = solveBonusTriggerWaitTime(baseCfg());
    expect(a.expectedAnyFeatureWaitTime).toBe(b.expectedAnyFeatureWaitTime);
  });
  it('MC same seed → identical', () => {
    const a = simulateBonusTriggerWaitTime(baseCfg(), 100, 42);
    const b = simulateBonusTriggerWaitTime(baseCfg(), 100, 42);
    expect(a.totalAnyFeatureWaitTime).toBe(b.totalAnyFeatureWaitTime);
  });
});

describe('industry use-cases', () => {
  it('typical slot: ~1/100 FS, ~1/500 wheel, ~1/2000 pick', () => {
    const r = solveBonusTriggerWaitTime({
      features: [
        { label: 'free_spins',  triggerProbabilityPerSpin: 0.01 },
        { label: 'wheel_bonus', triggerProbabilityPerSpin: 0.002 },
        { label: 'pick_bonus',  triggerProbabilityPerSpin: 0.0005 },
      ],
    });
    expect(r.perFeature[0].expectedWaitTime).toBeCloseTo(100, 4);
    expect(r.perFeature[1].expectedWaitTime).toBeCloseTo(500, 4);
    expect(r.perFeature[2].expectedWaitTime).toBeCloseTo(2000, 4);
    // 95th percentile FS wait time is around 300 spins
    expect(r.perFeature[0].percentileWaitTimes['0.95']).toBeGreaterThan(200);
    expect(r.perFeature[0].percentileWaitTimes['0.95']).toBeLessThan(400);
  });
  it('UKGC RTS 14 compliance: median + 95th percentile per feature', () => {
    const r = solveBonusTriggerWaitTime({
      features: [{ label: 'fs', triggerProbabilityPerSpin: 0.01 }],
      percentileTargets: [0.5, 0.95],
    });
    const pcts = r.perFeature[0].percentileWaitTimes;
    expect(pcts['0.5']).toBeDefined();
    expect(pcts['0.95']).toBeDefined();
    expect(pcts['0.95']).toBeGreaterThan(pcts['0.5']);
  });
});
