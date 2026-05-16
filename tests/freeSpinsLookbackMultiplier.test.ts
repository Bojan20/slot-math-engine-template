/**
 * W152 Wave 97 — Free Spins Lookback Multiplier Aggregator tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveFreeSpinsLookbackMultiplier,
  simulateFreeSpinsLookbackMultiplier,
  type FreeSpinsLookbackConfig,
} from '../src/features/freeSpinsLookbackMultiplier.js';

const baseCfg = (overrides: Partial<FreeSpinsLookbackConfig> = {}): FreeSpinsLookbackConfig => ({
  freeSpinsK: 10,
  meanBaseWinPerSpinX: 1.5,
  varianceBaseWinPerSpinX: 4,
  multiplierDistribution: [
    { label: 'x1', valueX: 1, weight: 50 },
    { label: 'x2', valueX: 2, weight: 30 },
    { label: 'x5', valueX: 5, weight: 15 },
    { label: 'x10', valueX: 10, weight: 5 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects K < 1', () => {
    expect(() => solveFreeSpinsLookbackMultiplier(baseCfg({ freeSpinsK: 0 }))).toThrow();
  });
  it('rejects negative mean win', () => {
    expect(() => solveFreeSpinsLookbackMultiplier(baseCfg({ meanBaseWinPerSpinX: -1 }))).toThrow();
  });
  it('rejects empty multiplier distribution', () => {
    expect(() => solveFreeSpinsLookbackMultiplier(baseCfg({ multiplierDistribution: [] }))).toThrow();
  });
  it('rejects non-positive multiplier value', () => {
    expect(() => solveFreeSpinsLookbackMultiplier(baseCfg({
      multiplierDistribution: [{ label: 'x', valueX: 0, weight: 1 }],
    }))).toThrow();
  });
  it('rejects duplicate label', () => {
    expect(() => solveFreeSpinsLookbackMultiplier(baseCfg({
      multiplierDistribution: [
        { label: 'a', valueX: 1, weight: 1 },
        { label: 'a', valueX: 2, weight: 1 },
      ],
    }))).toThrow();
  });
  it('rejects bad base trigger prob', () => {
    expect(() => solveFreeSpinsLookbackMultiplier(baseCfg({ baseTriggerProbabilityPerSpin: 1.5 }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('E[S_K] = K · μ_W', () => {
    const r = solveFreeSpinsLookbackMultiplier(baseCfg());
    expect(r.expectedSumOverK).toBeCloseTo(10 * 1.5, 8);
  });
  it('Var[S_K] = K · σ²_W', () => {
    const r = solveFreeSpinsLookbackMultiplier(baseCfg());
    expect(r.varianceSumOverK).toBeCloseTo(10 * 4, 8);
  });
  it('μ_M from distribution', () => {
    const r = solveFreeSpinsLookbackMultiplier(baseCfg());
    // weights 100; p=0.5,0.3,0.15,0.05
    // μ = 0.5·1 + 0.3·2 + 0.15·5 + 0.05·10 = 0.5+0.6+0.75+0.5 = 2.35
    expect(r.expectedMultiplier).toBeCloseTo(2.35, 8);
  });
  it('max multiplier identified', () => {
    const r = solveFreeSpinsLookbackMultiplier(baseCfg());
    expect(r.maxMultiplier).toBe(10);
    expect(r.probMaxMultiplier).toBeCloseTo(0.05, 8);
  });
  it('E[Y] = μ_M · K · μ_W (Wald)', () => {
    const r = solveFreeSpinsLookbackMultiplier(baseCfg());
    expect(r.expectedTotalPayoutX).toBeCloseTo(2.35 * 10 * 1.5, 8); // 35.25
  });
  it('Var[Y] = K·σ²_W·(σ²_M + μ²_M) + K²·μ²_W·σ²_M', () => {
    const r = solveFreeSpinsLookbackMultiplier(baseCfg());
    // E[V] = 2.35
    // E[V²] = 0.5·1 + 0.3·4 + 0.15·25 + 0.05·100 = 0.5+1.2+3.75+5 = 10.45
    // σ²_M = 10.45 − 2.35² = 10.45 − 5.5225 = 4.9275
    // Var[Y] = 10·4·10.45 + 100·2.25·4.9275 = 418 + 1108.6875 = 1526.6875
    const expected = 10 * 4 * 10.45 + 100 * 2.25 * 4.9275;
    expect(r.varianceTotalPayoutX).toBeCloseTo(expected, 4);
  });
  it('E[Y | M=max] = max · K · μ_W (peak case)', () => {
    const r = solveFreeSpinsLookbackMultiplier(baseCfg());
    expect(r.expectedTotalIfMaxMultiplier).toBeCloseTo(10 * 10 * 1.5, 6); // 150
  });
  it('per-base-spin contribution if baseTrigger set', () => {
    const r = solveFreeSpinsLookbackMultiplier(baseCfg({ baseTriggerProbabilityPerSpin: 0.01 }));
    expect(r.expectedFeaturePayoutPerBaseSpin).toBeCloseTo(0.01 * 35.25, 6);
  });
  it('no base trigger ⇒ null', () => {
    const r = solveFreeSpinsLookbackMultiplier(baseCfg());
    expect(r.expectedFeaturePayoutPerBaseSpin).toBeNull();
  });
  it('μ_W=0 → E[Y]=0', () => {
    const r = solveFreeSpinsLookbackMultiplier(baseCfg({ meanBaseWinPerSpinX: 0, varianceBaseWinPerSpinX: 0 }));
    expect(r.expectedTotalPayoutX).toBe(0);
  });
  it('single multiplier (deterministic) ⇒ Var[M]=0, Var[Y] = E[M²]·K·σ²_W only', () => {
    const r = solveFreeSpinsLookbackMultiplier(baseCfg({
      multiplierDistribution: [{ label: 'fixed', valueX: 5, weight: 1 }],
    }));
    expect(r.varianceMultiplier).toBe(0);
    // Var[Y] = K·σ²_W·(0 + 5²) + K²·μ²_W·0 = 10·4·25 = 1000
    expect(r.varianceTotalPayoutX).toBeCloseTo(10 * 4 * 25, 6);
  });
});

describe('monotonicity', () => {
  it('larger K ⇒ higher E[Y]', () => {
    const a = solveFreeSpinsLookbackMultiplier(baseCfg({ freeSpinsK: 5 }));
    const b = solveFreeSpinsLookbackMultiplier(baseCfg({ freeSpinsK: 20 }));
    expect(b.expectedTotalPayoutX).toBeCloseTo(a.expectedTotalPayoutX * 4, 6);
  });
  it('higher μ_M ⇒ proportional higher E[Y]', () => {
    const a = solveFreeSpinsLookbackMultiplier(baseCfg());
    const cfgB = baseCfg();
    cfgB.multiplierDistribution = [{ label: 'big', valueX: 100, weight: 1 }];
    const b = solveFreeSpinsLookbackMultiplier(cfgB);
    expect(b.expectedMultiplier).toBeGreaterThan(a.expectedMultiplier);
    expect(b.expectedTotalPayoutX).toBeGreaterThan(a.expectedTotalPayoutX);
  });
  it('higher μ_W ⇒ proportional higher E[Y]', () => {
    const a = solveFreeSpinsLookbackMultiplier(baseCfg());
    const b = solveFreeSpinsLookbackMultiplier(baseCfg({ meanBaseWinPerSpinX: 3 }));
    expect(b.expectedTotalPayoutX).toBeCloseTo(a.expectedTotalPayoutX * 2, 6);
  });
});

describe('MC cross-validation', () => {
  it('MC E[Y] matches CF (rel ≤ 5% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveFreeSpinsLookbackMultiplier(cfg);
    const mc = simulateFreeSpinsLookbackMultiplier(cfg, 50_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedTotalPayoutX - mc.observedMeanPayoutX) / cf.expectedTotalPayoutX;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[S_K] matches CF (rel ≤ 2% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveFreeSpinsLookbackMultiplier(cfg);
    const mc = simulateFreeSpinsLookbackMultiplier(cfg, 50_000, 0xbeefbabe);
    const rel = Math.abs(cf.expectedSumOverK - mc.observedMeanSumS) / cf.expectedSumOverK;
    expect(rel).toBeLessThan(0.02);
  });
  it('MC Var[Y] matches CF (rel ≤ 25% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveFreeSpinsLookbackMultiplier(cfg);
    const mc = simulateFreeSpinsLookbackMultiplier(cfg, 50_000, 0xfeedface);
    const rel = Math.abs(cf.varianceTotalPayoutX - mc.observedVariancePayoutX) / cf.varianceTotalPayoutX;
    expect(rel).toBeLessThan(0.25);
  });
  it('MC E[M] matches CF (rel ≤ 3% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveFreeSpinsLookbackMultiplier(cfg);
    const mc = simulateFreeSpinsLookbackMultiplier(cfg, 50_000, 0xdeadbeef);
    const rel = Math.abs(cf.expectedMultiplier - mc.observedMeanMultiplier) / cf.expectedMultiplier;
    expect(rel).toBeLessThan(0.03);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveFreeSpinsLookbackMultiplier(baseCfg());
    const b = solveFreeSpinsLookbackMultiplier(baseCfg());
    expect(a.expectedTotalPayoutX).toBe(b.expectedTotalPayoutX);
  });
  it('MC same seed → identical', () => {
    const a = simulateFreeSpinsLookbackMultiplier(baseCfg(), 1000, 42);
    const b = simulateFreeSpinsLookbackMultiplier(baseCfg(), 1000, 42);
    expect(a.totalPayoutX).toBe(b.totalPayoutX);
  });
});

describe('industry use-cases', () => {
  it('Money-Cart-4-style: 12 FS + lookback x1/x5/x10 weighted', () => {
    const r = solveFreeSpinsLookbackMultiplier({
      freeSpinsK: 12,
      meanBaseWinPerSpinX: 2,
      varianceBaseWinPerSpinX: 8,
      multiplierDistribution: [
        { label: 'x1', valueX: 1,  weight: 50 },
        { label: 'x5', valueX: 5,  weight: 30 },
        { label: 'x10', valueX: 10, weight: 15 },
        { label: 'x100', valueX: 100, weight: 5 },
      ],
    });
    expect(r.expectedTotalPayoutX).toBeGreaterThan(0);
    expect(r.maxMultiplier).toBe(100);
    expect(r.probMaxMultiplier).toBe(0.05);
  });
  it('Hacksaw-style: deterministic max win cap', () => {
    const r = solveFreeSpinsLookbackMultiplier({
      freeSpinsK: 8,
      meanBaseWinPerSpinX: 1,
      varianceBaseWinPerSpinX: 0,
      multiplierDistribution: [
        { label: 'x5', valueX: 5, weight: 1 },
      ],
    });
    // Deterministic K · μ · M = 8 · 1 · 5 = 40
    expect(r.expectedTotalPayoutX).toBe(40);
    expect(r.varianceTotalPayoutX).toBe(0);
  });
});
