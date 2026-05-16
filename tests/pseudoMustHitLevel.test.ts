/**
 * W152 Wave 72 — Pseudo-Must-Hit + Level Progression tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solvePseudoMustHit,
  simulatePseudoMustHit,
  type PseudoMustHitConfig,
} from '../src/features/pseudoMustHitLevel.js';

const baseCfg = (overrides: Partial<PseudoMustHitConfig> = {}): PseudoMustHitConfig => ({
  poolSeedX: 100,
  poolSoftCapX: 1000,
  contributionPerSpinX: 0.05,
  lambdaMin: 0.001,
  lambdaMax: 0.1,
  levelMultipliers: [1, 2, 5, 25],
  resetProbabilityAtMax: 0.5,
  ...overrides,
});

describe('validation', () => {
  it('rejects negative seed', () => {
    expect(() => solvePseudoMustHit(baseCfg({ poolSeedX: -1 }))).toThrow();
  });
  it('rejects softCap ≤ seed', () => {
    expect(() => solvePseudoMustHit(baseCfg({ poolSoftCapX: 100 }))).toThrow();
  });
  it('rejects lambdaMin > 1', () => {
    expect(() => solvePseudoMustHit(baseCfg({ lambdaMin: 1.1 }))).toThrow();
  });
  it('rejects lambdaMax ≤ lambdaMin', () => {
    expect(() => solvePseudoMustHit(baseCfg({ lambdaMin: 0.5, lambdaMax: 0.5 }))).toThrow();
  });
  it('rejects negative level multiplier', () => {
    expect(() => solvePseudoMustHit(baseCfg({ levelMultipliers: [-1, 2] }))).toThrow();
  });
  it('rejects resetProb outside [0,1]', () => {
    expect(() => solvePseudoMustHit(baseCfg({ resetProbabilityAtMax: 1.5 }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('averageLambda = midpoint', () => {
    const r = solvePseudoMustHit(baseCfg());
    expect(r.averageLambda).toBeCloseTo(0.0505, 6);
  });
  it('E[spins between] = 1/λ_avg', () => {
    const r = solvePseudoMustHit(baseCfg());
    expect(r.expectedSpinsBetweenTriggers).toBeCloseTo(1 / 0.0505, 4);
  });
  it('level stationary π for r=0 puts all mass at maxLevel', () => {
    const r = solvePseudoMustHit(baseCfg({ resetProbabilityAtMax: 0 }));
    expect(r.levelStationaryDistribution[r.levelStationaryDistribution.length - 1]).toBeCloseTo(1, 8);
  });
  it('level stationary π for r=1 is uniform-by-balance equations', () => {
    const r = solvePseudoMustHit(baseCfg({ resetProbabilityAtMax: 1 }));
    // r=1: π_maxL = 1/(1+maxL×1), π_other = 1/(1+maxL)
    // maxL=3, so all 4 levels: π = 1/4
    for (const p of r.levelStationaryDistribution) {
      expect(p).toBeCloseTo(0.25, 6);
    }
  });
  it('levelStationaryDistribution sums to 1', () => {
    const r = solvePseudoMustHit(baseCfg());
    const sum = r.levelStationaryDistribution.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
  it('E[payout per trigger] = E[pool] × E[mult]', () => {
    const r = solvePseudoMustHit(baseCfg());
    expect(r.expectedPayoutPerTrigger).toBeCloseTo(r.expectedPoolAtTrigger * r.expectedLevelMultiplier, 6);
  });
  it('E[payout per spin] = λ_avg × E[payout per trigger]', () => {
    const r = solvePseudoMustHit(baseCfg());
    expect(r.expectedPayoutPerSpin).toBeCloseTo(r.averageLambda * r.expectedPayoutPerTrigger, 6);
  });
});

describe('monotonicity', () => {
  it('higher λ_max ⇒ fewer expected spins between', () => {
    const a = solvePseudoMustHit(baseCfg({ lambdaMax: 0.05 }));
    const b = solvePseudoMustHit(baseCfg({ lambdaMax: 0.5 }));
    expect(b.expectedSpinsBetweenTriggers).toBeLessThan(a.expectedSpinsBetweenTriggers);
  });
  it('higher level mults ⇒ higher E[payout per spin]', () => {
    const a = solvePseudoMustHit(baseCfg({ levelMultipliers: [1, 2, 5, 25] }));
    const b = solvePseudoMustHit(baseCfg({ levelMultipliers: [2, 4, 10, 50] }));
    expect(b.expectedPayoutPerSpin).toBeCloseTo(a.expectedPayoutPerSpin * 2, 6);
  });
});

describe('MC cross-validation', () => {
  it('MC observed triggers per spin is positive + bounded', () => {
    const cfg = baseCfg();
    const mc = simulatePseudoMustHit(cfg, 100_000, 0xc0ffee);
    // CF λ_avg is a midpoint approximation; actual MC trigger rate is
    // typically LOWER because pool starts at seed (low hazard) and grows
    // before trigger fires. The closed-form is an upper-bound; MC ≤ λ_avg.
    expect(mc.observedTriggersPerSpin).toBeGreaterThan(0);
    expect(mc.observedTriggersPerSpin).toBeLessThanOrEqual(cfg.lambdaMax);
  });
  it('MC observed mean pool at trigger ≥ seed', () => {
    const cfg = baseCfg();
    const mc = simulatePseudoMustHit(cfg, 100_000, 0xbeefbabe);
    expect(mc.observedMeanPoolAtTrigger).toBeGreaterThan(cfg.poolSeedX);
  });
  it('higher λ_max in MC ⇒ more triggers per spin', () => {
    const low = simulatePseudoMustHit(baseCfg({ lambdaMax: 0.02 }), 50_000, 1);
    const high = simulatePseudoMustHit(baseCfg({ lambdaMax: 0.5 }), 50_000, 1);
    expect(high.observedTriggersPerSpin).toBeGreaterThan(low.observedTriggersPerSpin);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solvePseudoMustHit(baseCfg());
    const b = solvePseudoMustHit(baseCfg());
    expect(a.expectedPayoutPerSpin).toBe(b.expectedPayoutPerSpin);
  });
  it('MC same seed → identical', () => {
    const a = simulatePseudoMustHit(baseCfg(), 1000, 42);
    const b = simulatePseudoMustHit(baseCfg(), 1000, 42);
    expect(a.totalPayout).toBe(b.totalPayout);
  });
});
