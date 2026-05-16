/**
 * W152 Wave 89 — Persistent Multiplier Accumulator tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solvePersistentMultiplier,
  simulatePersistentMultiplier,
  type PersistentMultiplierConfig,
} from '../src/features/persistentMultiplierAccumulator.js';

const baseCfg = (overrides: Partial<PersistentMultiplierConfig> = {}): PersistentMultiplierConfig => ({
  freeSpinsK: 10,
  multiplierInit: 1,
  multiplierDropIncrement: 1,
  dropProbabilityPerSpin: 0.30,
  meanBaseWinPerSpinX: 0.5,
  varianceBaseWinPerSpinX: 1.0,
  ...overrides,
});

describe('validation', () => {
  it('rejects non-integer K', () => {
    expect(() => solvePersistentMultiplier(baseCfg({ freeSpinsK: 1.5 }))).toThrow();
  });
  it('rejects K < 1', () => {
    expect(() => solvePersistentMultiplier(baseCfg({ freeSpinsK: 0 }))).toThrow();
  });
  it('rejects negative initial', () => {
    expect(() => solvePersistentMultiplier(baseCfg({ multiplierInit: -1 }))).toThrow();
  });
  it('rejects non-positive drop increment', () => {
    expect(() => solvePersistentMultiplier(baseCfg({ multiplierDropIncrement: 0 }))).toThrow();
  });
  it('rejects q out of [0,1]', () => {
    expect(() => solvePersistentMultiplier(baseCfg({ dropProbabilityPerSpin: -0.1 }))).toThrow();
    expect(() => solvePersistentMultiplier(baseCfg({ dropProbabilityPerSpin: 1.1 }))).toThrow();
  });
  it('rejects negative mean win', () => {
    expect(() => solvePersistentMultiplier(baseCfg({ meanBaseWinPerSpinX: -1 }))).toThrow();
  });
  it('rejects negative variance', () => {
    expect(() => solvePersistentMultiplier(baseCfg({ varianceBaseWinPerSpinX: -1 }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('E[M_K] = m_init + K·q·m_drop', () => {
    const r = solvePersistentMultiplier(baseCfg());
    expect(r.expectedFinalMultiplier).toBeCloseTo(1 + 10 * 0.3 * 1, 10); // 4
  });
  it('Var[M_K] = K·q·(1-q)·m_drop²', () => {
    const r = solvePersistentMultiplier(baseCfg());
    expect(r.varianceFinalMultiplier).toBeCloseTo(10 * 0.3 * 0.7 * 1, 10); // 2.1
  });
  it('E[Y] = μ_W · (K·m_init + q·m_drop · K(K+1)/2)', () => {
    const r = solvePersistentMultiplier(baseCfg());
    // = 0.5 · (10·1 + 0.3·1 · 10·11/2)
    // = 0.5 · (10 + 0.3 · 55)
    // = 0.5 · (10 + 16.5) = 0.5 · 26.5 = 13.25
    expect(r.expectedTotalPayoutX).toBeCloseTo(13.25, 8);
  });
  it('P(no drops) = (1-q)^K', () => {
    const r = solvePersistentMultiplier(baseCfg());
    expect(r.probNoDrops).toBeCloseTo(Math.pow(0.7, 10), 10);
  });
  it('P(all drops) = q^K', () => {
    const r = solvePersistentMultiplier(baseCfg());
    expect(r.probAllDrops).toBeCloseTo(Math.pow(0.3, 10), 10);
  });
  it('E[drops] = K·q', () => {
    const r = solvePersistentMultiplier(baseCfg());
    expect(r.expectedDropsTotal).toBeCloseTo(3, 10);
  });
  it('q=0 → no drops, M_K = m_init', () => {
    const r = solvePersistentMultiplier(baseCfg({ dropProbabilityPerSpin: 0 }));
    expect(r.expectedFinalMultiplier).toBe(1);
    expect(r.varianceFinalMultiplier).toBe(0);
    expect(r.probNoDrops).toBe(1);
    expect(r.probAllDrops).toBe(0);
  });
  it('q=1 → guaranteed K drops, M_K = m_init + K·m_drop', () => {
    const r = solvePersistentMultiplier(baseCfg({ dropProbabilityPerSpin: 1 }));
    expect(r.expectedFinalMultiplier).toBe(1 + 10 * 1);
    expect(r.varianceFinalMultiplier).toBe(0);
    expect(r.probAllDrops).toBe(1);
  });
  it('variance is non-negative', () => {
    const r = solvePersistentMultiplier(baseCfg());
    expect(r.varianceTotalPayoutX).toBeGreaterThanOrEqual(0);
  });
  it('K=1 → trivial single FS, E[Y] = μ_W · (m_init + q·m_drop)', () => {
    const r = solvePersistentMultiplier({
      freeSpinsK: 1,
      multiplierInit: 1,
      multiplierDropIncrement: 2,
      dropProbabilityPerSpin: 0.5,
      meanBaseWinPerSpinX: 3,
      varianceBaseWinPerSpinX: 0,
    });
    // E[M_1] = 1 + 0.5·2 = 2; E[Y] = 3·2 = 6
    expect(r.expectedTotalPayoutX).toBeCloseTo(6, 8);
  });
});

describe('monotonicity', () => {
  it('higher q ⇒ higher E[M_K] and higher E[Y]', () => {
    const a = solvePersistentMultiplier(baseCfg({ dropProbabilityPerSpin: 0.1 }));
    const b = solvePersistentMultiplier(baseCfg({ dropProbabilityPerSpin: 0.7 }));
    expect(b.expectedFinalMultiplier).toBeGreaterThan(a.expectedFinalMultiplier);
    expect(b.expectedTotalPayoutX).toBeGreaterThan(a.expectedTotalPayoutX);
  });
  it('larger K ⇒ higher E[M_K] and higher E[Y]', () => {
    const a = solvePersistentMultiplier(baseCfg({ freeSpinsK: 5 }));
    const b = solvePersistentMultiplier(baseCfg({ freeSpinsK: 20 }));
    expect(b.expectedFinalMultiplier).toBeGreaterThan(a.expectedFinalMultiplier);
    expect(b.expectedTotalPayoutX).toBeGreaterThan(a.expectedTotalPayoutX);
  });
  it('higher m_drop ⇒ higher E[Y]', () => {
    const a = solvePersistentMultiplier(baseCfg({ multiplierDropIncrement: 1 }));
    const b = solvePersistentMultiplier(baseCfg({ multiplierDropIncrement: 3 }));
    expect(b.expectedTotalPayoutX).toBeGreaterThan(a.expectedTotalPayoutX);
  });
});

describe('MC cross-validation', () => {
  it('MC E[M_K] matches CF (rel ≤ 5% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solvePersistentMultiplier(cfg);
    const mc = simulatePersistentMultiplier(cfg, 50_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedFinalMultiplier - mc.observedMeanFinalMult) / cf.expectedFinalMultiplier;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC Var[M_K] matches CF (rel ≤ 10% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solvePersistentMultiplier(cfg);
    const mc = simulatePersistentMultiplier(cfg, 50_000, 0xfeedface);
    const rel = Math.abs(cf.varianceFinalMultiplier - mc.observedVarianceFinalMult) / cf.varianceFinalMultiplier;
    expect(rel).toBeLessThan(0.1);
  });
  it('MC E[Y] matches CF (rel ≤ 5% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solvePersistentMultiplier(cfg);
    const mc = simulatePersistentMultiplier(cfg, 50_000, 0xbeefbabe);
    const rel = Math.abs(cf.expectedTotalPayoutX - mc.observedMeanPayoutX) / cf.expectedTotalPayoutX;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC Var[Y] matches CF (rel ≤ 15% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solvePersistentMultiplier(cfg);
    const mc = simulatePersistentMultiplier(cfg, 50_000, 0xdeadbeef);
    const rel = Math.abs(cf.varianceTotalPayoutX - mc.observedVariancePayoutX) / cf.varianceTotalPayoutX;
    expect(rel).toBeLessThan(0.15);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solvePersistentMultiplier(baseCfg());
    const b = solvePersistentMultiplier(baseCfg());
    expect(a.expectedTotalPayoutX).toBe(b.expectedTotalPayoutX);
  });
  it('MC same seed → identical', () => {
    const a = simulatePersistentMultiplier(baseCfg(), 1000, 42);
    const b = simulatePersistentMultiplier(baseCfg(), 1000, 42);
    expect(a.totalPayoutX).toBe(b.totalPayoutX);
  });
});

describe('industry use-cases', () => {
  it('Pragmatic-style 15 FS sticky multiplier', () => {
    const r = solvePersistentMultiplier({
      freeSpinsK: 15,
      multiplierInit: 1,
      multiplierDropIncrement: 1,
      dropProbabilityPerSpin: 0.25,
      meanBaseWinPerSpinX: 0.6,
      varianceBaseWinPerSpinX: 2,
    });
    expect(r.expectedFinalMultiplier).toBeCloseTo(1 + 15 * 0.25, 8); // 4.75
    expect(r.expectedTotalPayoutX).toBeGreaterThan(0);
  });
  it('BTG-Megaways-style 12 FS with x10 increment, rare drops', () => {
    const r = solvePersistentMultiplier({
      freeSpinsK: 12,
      multiplierInit: 1,
      multiplierDropIncrement: 10,
      dropProbabilityPerSpin: 0.08,
      meanBaseWinPerSpinX: 0.4,
      varianceBaseWinPerSpinX: 3,
    });
    expect(r.expectedFinalMultiplier).toBeCloseTo(1 + 12 * 0.08 * 10, 6); // 10.6
    // High variance regime — std should be much larger than mean payout
    expect(r.stdTotalPayoutX).toBeGreaterThan(0);
  });
});
