/**
 * W152 Wave 123 — Mega Symbol Multi-Cell Expansion Aggregator tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveMegaSymbolExpansion,
  simulateMegaSymbolExpansion,
  type MegaSymbolExpansionConfig,
} from '../src/features/megaSymbolExpansion.js';

const baseCfg = (overrides: Partial<MegaSymbolExpansionConfig> = {}): MegaSymbolExpansionConfig => ({
  countPmf: [
    { count: 0, probability: 0.6 },
    { count: 1, probability: 0.3 },
    { count: 2, probability: 0.1 },
  ],
  sizePmf: [
    { size: 1, probability: 0.5 },
    { size: 2, probability: 0.3 },
    { size: 3, probability: 0.2 },
  ],
  targetPmf: [
    { label: 'low',    payoutX: 5,   probability: 0.6 },
    { label: 'mid',    payoutX: 25,  probability: 0.3 },
    { label: 'mega',   payoutX: 200, probability: 0.1 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects empty countPmf', () => {
    expect(() => solveMegaSymbolExpansion({ ...baseCfg(), countPmf: [] })).toThrow();
  });
  it('rejects empty sizePmf', () => {
    expect(() => solveMegaSymbolExpansion({ ...baseCfg(), sizePmf: [] })).toThrow();
  });
  it('rejects empty targetPmf', () => {
    expect(() => solveMegaSymbolExpansion({ ...baseCfg(), targetPmf: [] })).toThrow();
  });
  it('rejects negative count', () => {
    expect(() => solveMegaSymbolExpansion(baseCfg({
      countPmf: [{ count: -1, probability: 1 }],
    }))).toThrow();
  });
  it('rejects size < 1', () => {
    expect(() => solveMegaSymbolExpansion(baseCfg({
      sizePmf: [{ size: 0, probability: 1 }],
    }))).toThrow();
  });
  it('rejects negative payoutX', () => {
    expect(() => solveMegaSymbolExpansion(baseCfg({
      targetPmf: [{ label: 'x', payoutX: -1, probability: 1 }],
    }))).toThrow();
  });
  it('rejects pmf not summing to 1', () => {
    expect(() => solveMegaSymbolExpansion(baseCfg({
      countPmf: [{ count: 0, probability: 0.5 }, { count: 1, probability: 0.3 }],
    }))).toThrow();
  });
  it('rejects duplicate count', () => {
    expect(() => solveMegaSymbolExpansion(baseCfg({
      countPmf: [{ count: 1, probability: 0.5 }, { count: 1, probability: 0.5 }],
    }))).toThrow();
  });
  it('rejects duplicate size', () => {
    expect(() => solveMegaSymbolExpansion(baseCfg({
      sizePmf: [{ size: 2, probability: 0.5 }, { size: 2, probability: 0.5 }],
    }))).toThrow();
  });
  it('rejects duplicate target label', () => {
    expect(() => solveMegaSymbolExpansion(baseCfg({
      targetPmf: [
        { label: 'a', payoutX: 1, probability: 0.5 },
        { label: 'a', payoutX: 2, probability: 0.5 },
      ],
    }))).toThrow();
  });
});

describe('count moments', () => {
  it('E[K] computed correctly', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    // E[K] = 0·0.6 + 1·0.3 + 2·0.1 = 0.5
    expect(r.expectedDropCount).toBeCloseTo(0.5, 8);
  });
  it('Var[K] computed correctly', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    // E[K²] = 0 + 1·0.3 + 4·0.1 = 0.7
    // Var = 0.7 - 0.25 = 0.45
    expect(r.varianceDropCount).toBeCloseTo(0.45, 6);
  });
  it('probZeroDropCount = P(K=0)', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    expect(r.probZeroDropCount).toBe(0.6);
  });
  it('maxDropCount = max(supp)', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    expect(r.maxDropCount).toBe(2);
  });
});

describe('size moments', () => {
  it('E[S] computed correctly', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    // E[S] = 1·0.5 + 2·0.3 + 3·0.2 = 0.5 + 0.6 + 0.6 = 1.7
    expect(r.expectedSize).toBeCloseTo(1.7, 8);
  });
  it('E[S²] computed correctly', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    // E[S²] = 1·0.5 + 4·0.3 + 9·0.2 = 0.5 + 1.2 + 1.8 = 3.5
    expect(r.expectedSizeSquared).toBeCloseTo(3.5, 8);
  });
  it('E[S⁴] computed correctly', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    // E[S⁴] = 1·0.5 + 16·0.3 + 81·0.2 = 0.5 + 4.8 + 16.2 = 21.5
    expect(r.expectedSizeFourth).toBeCloseTo(21.5, 8);
  });
  it('maxSize and maxArea', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    expect(r.maxSize).toBe(3);
    expect(r.maxArea).toBe(9);
  });
  it('probHitMaxSize = P(S=maxSize)', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    expect(r.probHitMaxSize).toBe(0.2);
  });
});

describe('target symbol moments', () => {
  it('E[paytable[T]] computed correctly', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    // E[T] = 5·0.6 + 25·0.3 + 200·0.1 = 3 + 7.5 + 20 = 30.5
    expect(r.expectedPayoutPerCell).toBeCloseTo(30.5, 8);
  });
  it('E[paytable²] computed correctly', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    // E[T²] = 25·0.6 + 625·0.3 + 40000·0.1 = 15 + 187.5 + 4000 = 4202.5
    expect(r.expectedPayoutPerCellSquared).toBeCloseTo(4202.5, 4);
  });
  it('maxSymbolPayout = 200, probHitMaxSymbol = 0.1', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    expect(r.maxSymbolPayout).toBe(200);
    expect(r.probHitMaxSymbol).toBe(0.1);
  });
});

describe('payout decomposition', () => {
  it('E[Y] = E[K] · E[S²] · E[paytable[T]]', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    // E[Y] = 0.5 · 3.5 · 30.5 = 53.375
    expect(r.expectedPayoutPerSpin).toBeCloseTo(0.5 * 3.5 * 30.5, 6);
  });
  it('Var[Y] ≥ 0', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    expect(r.variancePayoutPerSpin).toBeGreaterThan(0);
  });
  it('Var[Y] correctness via E[Y²] − E[Y]²', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    // E[Y²] = E[K]·E[S⁴]·E[T²] + (E[K²]−E[K])·(E[S²]·E[T])²
    // = 0.5·21.5·4202.5 + (0.7-0.5)·(3.5·30.5)²
    // = 45176.875 + 0.2·11395.5625 = 45176.875 + 2279.1125 = 47455.9875
    // Var[Y] = 47455.9875 - 53.375² = 47455.9875 - 2848.9... = 44607.09...
    const eY = 0.5 * 3.5 * 30.5;
    const eY2 = 0.5 * 21.5 * 4202.5 + (0.7 - 0.5) * Math.pow(3.5 * 30.5, 2);
    expect(r.variancePayoutPerSpin).toBeCloseTo(eY2 - eY * eY, 2);
  });
});

describe('degenerate corners', () => {
  it('K=0 always → E[Y] = 0', () => {
    const r = solveMegaSymbolExpansion(baseCfg({
      countPmf: [{ count: 0, probability: 1 }],
    }));
    expect(r.expectedPayoutPerSpin).toBe(0);
    expect(r.variancePayoutPerSpin).toBe(0);
  });
  it('S=1 always → reduces to 1×1 cells (S²=1)', () => {
    const r = solveMegaSymbolExpansion(baseCfg({
      sizePmf: [{ size: 1, probability: 1 }],
    }));
    expect(r.expectedSizeSquared).toBe(1);
    expect(r.expectedPayoutPerSpin).toBeCloseTo(0.5 * 1 * 30.5, 6);
  });
  it('single target → no variance from T', () => {
    const r = solveMegaSymbolExpansion(baseCfg({
      targetPmf: [{ label: 'only', payoutX: 10, probability: 1 }],
    }));
    expect(r.expectedPayoutPerCell).toBe(10);
    expect(r.expectedPayoutPerCellSquared).toBe(100);
  });
});

describe('joint extreme', () => {
  it('probMaxConfig = P(K=K_max)·(P(S=max)·P(T=max))^K_max', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    // = P(K=2)·(P(S=3)·P(T=mega))² = 0.1·(0.2·0.1)² = 0.1·0.0004 = 4e-5
    expect(r.probMaxConfig).toBeCloseTo(0.1 * Math.pow(0.2 * 0.1, 2), 10);
  });
  it('maxPossibleCellsCovered = K_max · maxSize²', () => {
    const r = solveMegaSymbolExpansion(baseCfg());
    expect(r.maxPossibleCellsCovered).toBe(2 * 9); // 18
  });
});

describe('monotonicity', () => {
  it('higher E[K] → higher E[Y]', () => {
    const a = solveMegaSymbolExpansion(baseCfg());
    const b = solveMegaSymbolExpansion(baseCfg({
      countPmf: [
        { count: 0, probability: 0.2 },
        { count: 2, probability: 0.8 },
      ],
    }));
    expect(b.expectedPayoutPerSpin).toBeGreaterThan(a.expectedPayoutPerSpin);
  });
  it('larger sizes → higher E[Y]', () => {
    const a = solveMegaSymbolExpansion(baseCfg({
      sizePmf: [{ size: 1, probability: 1 }],
    }));
    const b = solveMegaSymbolExpansion(baseCfg({
      sizePmf: [{ size: 5, probability: 1 }],
    }));
    expect(b.expectedPayoutPerSpin).toBeCloseTo(25 * a.expectedPayoutPerSpin, 6);
  });
});

describe('MC cross-validation', () => {
  it('MC E[Y] matches CF (rel ≤ 5% at 200K spins)', () => {
    const cfg = baseCfg();
    const cf = solveMegaSymbolExpansion(cfg);
    const mc = simulateMegaSymbolExpansion(cfg, 200_000, 0xdeadbeef);
    const rel = Math.abs(cf.expectedPayoutPerSpin - mc.observedMeanPayoutPerSpin) /
      Math.max(cf.expectedPayoutPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[K] matches CF (rel ≤ 3% at 200K)', () => {
    const cfg = baseCfg();
    const cf = solveMegaSymbolExpansion(cfg);
    const mc = simulateMegaSymbolExpansion(cfg, 200_000, 0xcafe1234);
    const rel = Math.abs(cf.expectedDropCount - mc.observedMeanDropCount) / cf.expectedDropCount;
    expect(rel).toBeLessThan(0.03);
  });
  it('MC P(K=0) matches CF (abs ≤ 0.01 at 200K)', () => {
    const cfg = baseCfg();
    const cf = solveMegaSymbolExpansion(cfg);
    const mc = simulateMegaSymbolExpansion(cfg, 200_000, 0xbeefcafe);
    expect(Math.abs(cf.probZeroDropCount - mc.observedZeroDropFraction)).toBeLessThan(0.01);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveMegaSymbolExpansion(baseCfg());
    const b = solveMegaSymbolExpansion(baseCfg());
    expect(a.expectedPayoutPerSpin).toBe(b.expectedPayoutPerSpin);
  });
  it('MC same seed → identical', () => {
    const a = simulateMegaSymbolExpansion(baseCfg(), 1000, 42);
    const b = simulateMegaSymbolExpansion(baseCfg(), 1000, 42);
    expect(a.observedMeanPayoutPerSpin).toBe(b.observedMeanPayoutPerSpin);
  });
});

describe('industry use-cases', () => {
  it('Sweet Bonanza super-symbol style: 1×1 + 2×2 + 3×3 + 4×4', () => {
    const r = solveMegaSymbolExpansion(baseCfg({
      sizePmf: [
        { size: 1, probability: 0.70 },
        { size: 2, probability: 0.20 },
        { size: 3, probability: 0.08 },
        { size: 4, probability: 0.02 },
      ],
    }));
    expect(r.maxSize).toBe(4);
    expect(r.maxArea).toBe(16);
  });
  it('Razor Shark jumbo block: rare giant 5×5', () => {
    const r = solveMegaSymbolExpansion({
      countPmf: [
        { count: 0, probability: 0.95 },
        { count: 1, probability: 0.05 },
      ],
      sizePmf: [
        { size: 1, probability: 0.7 },
        { size: 2, probability: 0.2 },
        { size: 3, probability: 0.07 },
        { size: 5, probability: 0.03 },
      ],
      targetPmf: [
        { label: 'wild', payoutX: 10, probability: 0.8 },
        { label: 'jackpot', payoutX: 500, probability: 0.2 },
      ],
    });
    expect(r.maxSize).toBe(5);
    expect(r.maxArea).toBe(25);
  });
});
