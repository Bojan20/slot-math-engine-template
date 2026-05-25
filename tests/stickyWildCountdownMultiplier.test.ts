/**
 * W152 Wave 114 — Sticky Wild Countdown Multiplier tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveStickyWildCountdownMultiplier,
  simulateStickyWildCountdownMultiplier,
  type StickyWildCountdownMultiplierConfig,
} from '../src/features/stickyWildCountdownMultiplier.js';

const baseCfg = (overrides: Partial<StickyWildCountdownMultiplierConfig> = {}): StickyWildCountdownMultiplierConfig => ({
  landProbability: 0.05,
  stickyDuration: 4,
  baseMultiplier: 1,
  growthMode: 'linear',
  linearStep: 1,
  baseWinPmf: [
    { value: 0, probability: 0.7 },
    { value: 1, probability: 0.2 },
    { value: 5, probability: 0.1 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects p ≤ 0', () => {
    expect(() => solveStickyWildCountdownMultiplier(baseCfg({ landProbability: 0 }))).toThrow();
  });
  it('rejects p > 1', () => {
    expect(() => solveStickyWildCountdownMultiplier(baseCfg({ landProbability: 1.5 }))).toThrow();
  });
  it('rejects non-positive stickyDuration', () => {
    expect(() => solveStickyWildCountdownMultiplier(baseCfg({ stickyDuration: 0 }))).toThrow();
  });
  it('rejects baseMultiplier < 1', () => {
    expect(() => solveStickyWildCountdownMultiplier(baseCfg({ baseMultiplier: 0.5 }))).toThrow();
  });
  it('rejects bad growthMode', () => {
    expect(() => solveStickyWildCountdownMultiplier({ ...baseCfg(), growthMode: 'cubic' as never })).toThrow();
  });
  it('rejects negative linearStep', () => {
    expect(() => solveStickyWildCountdownMultiplier(baseCfg({ linearStep: -1 }))).toThrow();
  });
  it('rejects geometricRatio < 1', () => {
    expect(() => solveStickyWildCountdownMultiplier(baseCfg({
      growthMode: 'geometric',
      geometricRatio: 0.5,
    }))).toThrow();
  });
  it('rejects baseWinPmf not summing to 1', () => {
    expect(() => solveStickyWildCountdownMultiplier(baseCfg({
      baseWinPmf: [{ value: 0, probability: 0.5 }, { value: 1, probability: 0.4 }],
    }))).toThrow();
  });
});

describe('stationary distribution', () => {
  it('π_0 = 1/(1 + N·p)', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg());
    expect(r.stationaryDistribution[0]).toBeCloseTo(1 / (1 + 4 * 0.05), 8);
  });
  it('π_k uniform across k = 1..N', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg());
    for (let k = 1; k <= 4; k++) {
      expect(r.stationaryDistribution[k]).toBeCloseTo(0.05 / (1 + 4 * 0.05), 8);
    }
  });
  it('Σ π = 1', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg());
    const s = r.stationaryDistribution.reduce((a, b) => a + b, 0);
    expect(s).toBeCloseTo(1, 8);
  });
  it('probSpinIsActive + probSpinIsIdle = 1', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg());
    expect(r.probSpinIsActive + r.probSpinIsIdle).toBeCloseTo(1, 8);
  });
  it('probSpinIsActive = N·p / (1 + N·p)', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg());
    expect(r.probSpinIsActive).toBeCloseTo(4 * 0.05 / (1 + 4 * 0.05), 8);
  });
});

describe('multiplier ladder', () => {
  it('linear: M_k = base + (k-1)·step', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg());
    // base=1, step=1 → M = [1, 2, 3, 4]
    expect(r.perActiveSpinMultipliers).toEqual([1, 2, 3, 4]);
    expect(r.maxMultiplier).toBe(4);
  });
  it('geometric: M_k = base · ratio^(k-1)', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg({
      growthMode: 'geometric',
      geometricRatio: 2,
    }));
    // base=1, ratio=2 → M = [1, 2, 4, 8]
    expect(r.perActiveSpinMultipliers).toEqual([1, 2, 4, 8]);
    expect(r.maxMultiplier).toBe(8);
  });
  it('linear step = 0 → constant multiplier', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg({
      baseMultiplier: 3,
      linearStep: 0,
    }));
    expect(r.perActiveSpinMultipliers).toEqual([3, 3, 3, 3]);
  });
});

describe('expected multiplier per spin', () => {
  it('E[M] = π_0 + π_1·ΣM (linear)', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg());
    // π_0 = 1/1.2 = 0.8333..., π_1 = 0.05/1.2 = 0.04166...
    // ΣM = 1+2+3+4 = 10
    // E[M] = 0.8333 + 0.04166·10 = 0.8333 + 0.4166 = 1.25
    expect(r.expectedMultiplierPerSpin).toBeCloseTo(1 / 1.2 + (0.05 / 1.2) * 10, 8);
  });
  it('E[M] ≥ 1 always (when active multipliers ≥ 1)', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg());
    expect(r.expectedMultiplierPerSpin).toBeGreaterThanOrEqual(1);
  });
  it('higher p_land → higher E[M]', () => {
    const a = solveStickyWildCountdownMultiplier(baseCfg({ landProbability: 0.01 }));
    const b = solveStickyWildCountdownMultiplier(baseCfg({ landProbability: 0.20 }));
    expect(b.expectedMultiplierPerSpin).toBeGreaterThan(a.expectedMultiplierPerSpin);
  });
  it('higher step → higher E[M]', () => {
    const a = solveStickyWildCountdownMultiplier(baseCfg({ linearStep: 0 }));
    const b = solveStickyWildCountdownMultiplier(baseCfg({ linearStep: 2 }));
    expect(b.expectedMultiplierPerSpin).toBeGreaterThan(a.expectedMultiplierPerSpin);
  });
});

describe('payout decomposition', () => {
  it('E[Y] = E[V] · E[M]', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg());
    expect(r.expectedPayoutPerSpin).toBeCloseTo(r.expectedBaseWin * r.expectedMultiplierPerSpin, 8);
  });
  it('Var[Y] = E[V²]·E[M²] − E[Y]² (independent)', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg());
    const expected = r.expectedBaseWinSquared * r.expectedMultiplierSquaredPerSpin -
      r.expectedPayoutPerSpin * r.expectedPayoutPerSpin;
    expect(r.variancePayoutPerSpin).toBeCloseTo(Math.max(0, expected), 6);
  });
  it('E[V] computed correctly from pmf', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg());
    // E[V] = 0·0.7 + 1·0.2 + 5·0.1 = 0.7
    expect(r.expectedBaseWin).toBeCloseTo(0.7, 8);
  });
});

describe('cycle metrics', () => {
  it('cycle length = 1/p + N', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg());
    expect(r.expectedCycleLength).toBeCloseTo(1 / 0.05 + 4, 8);
  });
  it('totalMultPerCycle = ΣM_k', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg());
    expect(r.totalMultiplierPerActiveCycle).toBe(10);
  });
  it('E[cycle payout] = E[V] · ΣM_k', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg());
    expect(r.expectedPayoutPerActiveCycle).toBeCloseTo(0.7 * 10, 8);
  });
});

describe('MC cross-validation', () => {
  it('MC E[M] matches CF (rel ≤ 5% at 200K spins)', () => {
    const cfg = baseCfg();
    const cf = solveStickyWildCountdownMultiplier(cfg);
    const mc = simulateStickyWildCountdownMultiplier(cfg, 200_000, 0xdeadbeef);
    const rel = Math.abs(cf.expectedMultiplierPerSpin - mc.observedMeanMultiplierPerSpin) / cf.expectedMultiplierPerSpin;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[Y] matches CF (rel ≤ 5% at 200K spins)', () => {
    const cfg = baseCfg();
    const cf = solveStickyWildCountdownMultiplier(cfg);
    const mc = simulateStickyWildCountdownMultiplier(cfg, 200_000, 0xcafe1234);
    const rel = Math.abs(cf.expectedPayoutPerSpin - mc.observedMeanPayoutPerSpin) / Math.max(cf.expectedPayoutPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.05);
  });
  it('MC active fraction matches CF (abs ≤ 0.02 at 200K)', () => {
    const cfg = baseCfg();
    const cf = solveStickyWildCountdownMultiplier(cfg);
    const mc = simulateStickyWildCountdownMultiplier(cfg, 200_000, 0xbeefcafe);
    expect(Math.abs(cf.probSpinIsActive - mc.observedActiveFraction)).toBeLessThan(0.02);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveStickyWildCountdownMultiplier(baseCfg());
    const b = solveStickyWildCountdownMultiplier(baseCfg());
    expect(a.expectedPayoutPerSpin).toBe(b.expectedPayoutPerSpin);
  });
  it('MC same seed → identical', () => {
    const a = simulateStickyWildCountdownMultiplier(baseCfg(), 1000, 42);
    const b = simulateStickyWildCountdownMultiplier(baseCfg(), 1000, 42);
    expect(a.observedMeanPayoutPerSpin).toBe(b.observedMeanPayoutPerSpin);
  });
});

describe('industry use-cases', () => {
  it('Pragmatic Hot Fiesta style: N=10, geometric ratio=1.5', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg({
      landProbability: 0.02,
      stickyDuration: 10,
      growthMode: 'geometric',
      geometricRatio: 1.5,
    }));
    // M_10 = 1.5^9 ≈ 38.44
    expect(r.maxMultiplier).toBeCloseTo(Math.pow(1.5, 9), 4);
  });
  it('Vendor D Vikings style: N=7, linear step=1', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg({
      stickyDuration: 7,
      linearStep: 1,
    }));
    // M = [1, 2, 3, 4, 5, 6, 7], max = 7
    expect(r.maxMultiplier).toBe(7);
    expect(r.perActiveSpinMultipliers).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('Degenerate: p=1 → always landing (never idle once started)', () => {
    const r = solveStickyWildCountdownMultiplier(baseCfg({ landProbability: 1 }));
    // π_0 = 1/(1+4) = 0.2
    expect(r.stationaryDistribution[0]).toBeCloseTo(0.2, 8);
  });
});
