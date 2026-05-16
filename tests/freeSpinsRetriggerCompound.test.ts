/**
 * W152 Wave 84 — Free Spins Retrigger Compound Variance tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveFreeSpinsRetrigger,
  simulateFreeSpinsRetrigger,
  freeSpinsTotalPMF,
  type FreeSpinsRetriggerConfig,
} from '../src/features/freeSpinsRetriggerCompound.js';

const baseCfg = (overrides: Partial<FreeSpinsRetriggerConfig> = {}): FreeSpinsRetriggerConfig => ({
  spinsPerBatchK: 10,
  retriggerProbability: 0.20,
  meanPayoutPerFreeSpinX: 1.5,
  variancePayoutPerFreeSpinX: 25,
  ...overrides,
});

describe('validation', () => {
  it('rejects non-integer K', () => {
    expect(() => solveFreeSpinsRetrigger(baseCfg({ spinsPerBatchK: 1.5 }))).toThrow();
  });
  it('rejects K < 1', () => {
    expect(() => solveFreeSpinsRetrigger(baseCfg({ spinsPerBatchK: 0 }))).toThrow();
  });
  it('rejects p = 1 (infinite retrigger)', () => {
    expect(() => solveFreeSpinsRetrigger(baseCfg({ retriggerProbability: 1 }))).toThrow();
  });
  it('rejects p < 0', () => {
    expect(() => solveFreeSpinsRetrigger(baseCfg({ retriggerProbability: -0.1 }))).toThrow();
  });
  it('rejects negative mean', () => {
    expect(() => solveFreeSpinsRetrigger(baseCfg({ meanPayoutPerFreeSpinX: -1 }))).toThrow();
  });
  it('rejects negative variance', () => {
    expect(() => solveFreeSpinsRetrigger(baseCfg({ variancePayoutPerFreeSpinX: -1 }))).toThrow();
  });
  it('rejects bad base trigger prob', () => {
    expect(() => solveFreeSpinsRetrigger(baseCfg({ baseTriggerProbabilityPerSpin: 1.5 }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('E[N] = 1/(1-p)', () => {
    const r = solveFreeSpinsRetrigger(baseCfg({ retriggerProbability: 0.2 }));
    expect(r.expectedBatches).toBeCloseTo(1 / 0.8, 10); // 1.25
  });
  it('Var[N] = p/(1-p)²', () => {
    const r = solveFreeSpinsRetrigger(baseCfg({ retriggerProbability: 0.2 }));
    expect(r.varianceBatches).toBeCloseTo(0.2 / (0.8 * 0.8), 10); // 0.3125
  });
  it('E[T] = K/(1-p)', () => {
    const r = solveFreeSpinsRetrigger(baseCfg());
    expect(r.expectedTotalFreeSpins).toBeCloseTo(10 / 0.8, 8); // 12.5
  });
  it('Var[T] = K²·p/(1-p)²', () => {
    const r = solveFreeSpinsRetrigger(baseCfg());
    expect(r.varianceTotalFreeSpins).toBeCloseTo(100 * 0.2 / (0.8 * 0.8), 6); // 31.25
  });
  it('E[Y] = E[T]·μ (Wald)', () => {
    const r = solveFreeSpinsRetrigger(baseCfg());
    // E[T] = 12.5, μ = 1.5 → E[Y] = 18.75
    expect(r.expectedTotalPayoutX).toBeCloseTo(12.5 * 1.5, 8);
  });
  it('Var[Y] = E[T]·σ² + Var[T]·μ²', () => {
    const r = solveFreeSpinsRetrigger(baseCfg());
    // 12.5 * 25 + 31.25 * 2.25 = 312.5 + 70.3125 = 382.8125
    expect(r.varianceTotalPayoutX).toBeCloseTo(312.5 + 70.3125, 6);
  });
  it('tail prob P(N ≥ 2) = p', () => {
    const r = solveFreeSpinsRetrigger(baseCfg({ retriggerProbability: 0.30 }));
    expect(r.probAtLeastTwoBatches).toBeCloseTo(0.30, 10);
  });
  it('tail prob P(N ≥ 5) = p⁴', () => {
    const r = solveFreeSpinsRetrigger(baseCfg({ retriggerProbability: 0.30 }));
    expect(r.probAtLeastFiveBatches).toBeCloseTo(Math.pow(0.30, 4), 10);
  });
  it('tail prob P(N ≥ 10) = p⁹', () => {
    const r = solveFreeSpinsRetrigger(baseCfg({ retriggerProbability: 0.5 }));
    expect(r.probAtLeastTenBatches).toBeCloseTo(Math.pow(0.5, 9), 10);
  });
  it('no retrigger (p=0) → E[T] = K, Var[T] = 0', () => {
    const r = solveFreeSpinsRetrigger(baseCfg({ retriggerProbability: 0 }));
    expect(r.expectedTotalFreeSpins).toBe(10);
    expect(r.varianceTotalFreeSpins).toBe(0);
    expect(r.expectedBatches).toBe(1);
    expect(r.probAtLeastTwoBatches).toBe(0);
  });
  it('feature-per-base-spin contribution', () => {
    const r = solveFreeSpinsRetrigger(baseCfg({ baseTriggerProbabilityPerSpin: 0.01 }));
    expect(r.expectedFeaturePayoutPerBaseSpin).toBeCloseTo(0.01 * 18.75, 8);
  });
  it('no base trigger ⇒ feature-per-base-spin is null', () => {
    const r = solveFreeSpinsRetrigger(baseCfg());
    expect(r.expectedFeaturePayoutPerBaseSpin).toBeNull();
  });
});

describe('PMF helper', () => {
  it('PMF sums to 1 − p^maxBatches over k ≤ maxBatches (geometric truncation)', () => {
    const pmf = freeSpinsTotalPMF(baseCfg({ retriggerProbability: 0.3 }), 20);
    const sum = pmf.reduce((a, b) => a + b.probability, 0);
    // P(N ≤ 20) = 1 − p^20 ≈ 0.9999999988
    expect(sum).toBeCloseTo(1 - Math.pow(0.3, 20), 8);
  });
  it('PMF totalSpins = K · k', () => {
    const pmf = freeSpinsTotalPMF(baseCfg({ spinsPerBatchK: 8 }), 5);
    expect(pmf[0].totalSpins).toBe(8);
    expect(pmf[1].totalSpins).toBe(16);
    expect(pmf[4].totalSpins).toBe(40);
  });
  it('PMF probability ratio P(N=k+1)/P(N=k) = p', () => {
    const pmf = freeSpinsTotalPMF(baseCfg({ retriggerProbability: 0.25 }), 5);
    for (let i = 0; i < pmf.length - 1; i++) {
      expect(pmf[i + 1].probability / pmf[i].probability).toBeCloseTo(0.25, 8);
    }
  });
  it('rejects bad maxBatches', () => {
    expect(() => freeSpinsTotalPMF(baseCfg(), 0)).toThrow();
    expect(() => freeSpinsTotalPMF(baseCfg(), 1.5)).toThrow();
  });
});

describe('monotonicity', () => {
  it('higher p ⇒ higher E[T] and Var[T]', () => {
    const a = solveFreeSpinsRetrigger(baseCfg({ retriggerProbability: 0.10 }));
    const b = solveFreeSpinsRetrigger(baseCfg({ retriggerProbability: 0.40 }));
    expect(b.expectedTotalFreeSpins).toBeGreaterThan(a.expectedTotalFreeSpins);
    expect(b.varianceTotalFreeSpins).toBeGreaterThan(a.varianceTotalFreeSpins);
  });
  it('larger K ⇒ proportional E[T]', () => {
    const a = solveFreeSpinsRetrigger(baseCfg({ spinsPerBatchK: 10 }));
    const b = solveFreeSpinsRetrigger(baseCfg({ spinsPerBatchK: 20 }));
    expect(b.expectedTotalFreeSpins).toBeCloseTo(a.expectedTotalFreeSpins * 2, 8);
  });
  it('higher μ ⇒ higher E[Y]', () => {
    const a = solveFreeSpinsRetrigger(baseCfg({ meanPayoutPerFreeSpinX: 1 }));
    const b = solveFreeSpinsRetrigger(baseCfg({ meanPayoutPerFreeSpinX: 2 }));
    expect(b.expectedTotalPayoutX).toBeCloseTo(a.expectedTotalPayoutX * 2, 8);
  });
});

describe('MC cross-validation', () => {
  it('MC observed E[T] matches CF (rel ≤ 5% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveFreeSpinsRetrigger(cfg);
    const mc = simulateFreeSpinsRetrigger(cfg, 50_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedTotalFreeSpins - mc.observedMeanFreeSpins) / cf.expectedTotalFreeSpins;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC observed E[Y] matches CF (rel ≤ 5% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveFreeSpinsRetrigger(cfg);
    const mc = simulateFreeSpinsRetrigger(cfg, 50_000, 0xbeefbabe);
    const rel = Math.abs(cf.expectedTotalPayoutX - mc.observedMeanPayoutX) / cf.expectedTotalPayoutX;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC observed Var[Y] matches CF (rel ≤ 15% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveFreeSpinsRetrigger(cfg);
    const mc = simulateFreeSpinsRetrigger(cfg, 50_000, 0xfeedface);
    const rel = Math.abs(cf.varianceTotalPayoutX - mc.observedVariancePayoutX) / cf.varianceTotalPayoutX;
    expect(rel).toBeLessThan(0.15);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveFreeSpinsRetrigger(baseCfg());
    const b = solveFreeSpinsRetrigger(baseCfg());
    expect(a.expectedTotalPayoutX).toBe(b.expectedTotalPayoutX);
  });
  it('MC same seed → identical', () => {
    const a = simulateFreeSpinsRetrigger(baseCfg(), 1000, 42);
    const b = simulateFreeSpinsRetrigger(baseCfg(), 1000, 42);
    expect(a.totalPayoutX).toBe(b.totalPayoutX);
  });
});

describe('industry use-cases', () => {
  it('typical 10-FS feature w/ p=0.20 retrigger', () => {
    const r = solveFreeSpinsRetrigger({
      spinsPerBatchK: 10,
      retriggerProbability: 0.20,
      meanPayoutPerFreeSpinX: 1.5,
      variancePayoutPerFreeSpinX: 25,
      baseTriggerProbabilityPerSpin: 0.008, // ~1 in 125 spins
    });
    expect(r.expectedTotalFreeSpins).toBeCloseTo(12.5, 4);
    expect(r.expectedTotalPayoutX).toBeCloseTo(18.75, 4);
    expect(r.expectedFeaturePayoutPerBaseSpin).toBeCloseTo(0.15, 4); // ~15% RTP from FS
  });
  it('high-vol big-K rare feature', () => {
    const r = solveFreeSpinsRetrigger({
      spinsPerBatchK: 20,
      retriggerProbability: 0.10,
      meanPayoutPerFreeSpinX: 3,
      variancePayoutPerFreeSpinX: 400,
    });
    expect(r.expectedTotalFreeSpins).toBeCloseTo(20 / 0.9, 4);
    expect(r.probAtLeastFiveBatches).toBeCloseTo(Math.pow(0.10, 4), 10);
  });
});
