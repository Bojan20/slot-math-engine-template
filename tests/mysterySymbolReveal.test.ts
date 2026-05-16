/**
 * W152 Wave 116 — Mystery Symbol Reveal Aggregator tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveMysterySymbolReveal,
  simulateMysterySymbolReveal,
  type MysterySymbolRevealConfig,
} from '../src/features/mysterySymbolReveal.js';

const baseCfg = (overrides: Partial<MysterySymbolRevealConfig> = {}): MysterySymbolRevealConfig => ({
  countPmf: [
    { count: 0, probability: 0.5 },
    { count: 1, probability: 0.2 },
    { count: 2, probability: 0.15 },
    { count: 3, probability: 0.1 },
    { count: 5, probability: 0.05 },
  ],
  symbolPmf: [
    { label: 'low',    payoutX: 2,    probability: 0.5 },
    { label: 'mid',    payoutX: 10,   probability: 0.3 },
    { label: 'high',   payoutX: 50,   probability: 0.15 },
    { label: 'jackpot', payoutX: 500,  probability: 0.05 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects empty countPmf', () => {
    expect(() => solveMysterySymbolReveal({
      countPmf: [],
      symbolPmf: [{ label: 's', payoutX: 1, probability: 1 }],
    })).toThrow();
  });
  it('rejects negative count', () => {
    expect(() => solveMysterySymbolReveal(baseCfg({
      countPmf: [{ count: -1, probability: 1 }],
    }))).toThrow();
  });
  it('rejects non-integer count', () => {
    expect(() => solveMysterySymbolReveal(baseCfg({
      countPmf: [{ count: 1.5, probability: 1 }],
    }))).toThrow();
  });
  it('rejects countPmf not summing to 1', () => {
    expect(() => solveMysterySymbolReveal(baseCfg({
      countPmf: [{ count: 0, probability: 0.3 }, { count: 1, probability: 0.3 }],
    }))).toThrow();
  });
  it('rejects duplicate count', () => {
    expect(() => solveMysterySymbolReveal(baseCfg({
      countPmf: [{ count: 1, probability: 0.5 }, { count: 1, probability: 0.5 }],
    }))).toThrow();
  });
  it('rejects empty symbolPmf', () => {
    expect(() => solveMysterySymbolReveal(baseCfg({ symbolPmf: [] }))).toThrow();
  });
  it('rejects empty symbol label', () => {
    expect(() => solveMysterySymbolReveal(baseCfg({
      symbolPmf: [{ label: '', payoutX: 1, probability: 1 }],
    }))).toThrow();
  });
  it('rejects negative payoutX', () => {
    expect(() => solveMysterySymbolReveal(baseCfg({
      symbolPmf: [{ label: 's', payoutX: -1, probability: 1 }],
    }))).toThrow();
  });
  it('rejects duplicate symbol label', () => {
    expect(() => solveMysterySymbolReveal(baseCfg({
      symbolPmf: [
        { label: 'a', payoutX: 1, probability: 0.5 },
        { label: 'a', payoutX: 2, probability: 0.5 },
      ],
    }))).toThrow();
  });
  it('rejects symbolPmf not summing to 1', () => {
    expect(() => solveMysterySymbolReveal(baseCfg({
      symbolPmf: [{ label: 's', payoutX: 1, probability: 0.7 }],
    }))).toThrow();
  });
});

describe('count moments', () => {
  it('E[K] computed correctly', () => {
    const r = solveMysterySymbolReveal(baseCfg());
    // E[K] = 0*0.5 + 1*0.2 + 2*0.15 + 3*0.1 + 5*0.05 = 0 + 0.2 + 0.3 + 0.3 + 0.25 = 1.05
    expect(r.expectedCount).toBeCloseTo(1.05, 8);
  });
  it('Var[K] computed correctly', () => {
    const r = solveMysterySymbolReveal(baseCfg());
    // E[K²] = 0*0.5 + 1*0.2 + 4*0.15 + 9*0.1 + 25*0.05 = 0 + 0.2 + 0.6 + 0.9 + 1.25 = 2.95
    // Var[K] = 2.95 − 1.05² = 2.95 − 1.1025 = 1.8475
    expect(r.varianceCount).toBeCloseTo(1.8475, 6);
  });
  it('maxCount = highest count in pmf', () => {
    const r = solveMysterySymbolReveal(baseCfg());
    expect(r.maxCount).toBe(5);
  });
  it('probZeroCount = P(K=0)', () => {
    const r = solveMysterySymbolReveal(baseCfg());
    expect(r.probZeroCount).toBe(0.5);
  });
  it('probMaxCount = P(K=K_max)', () => {
    const r = solveMysterySymbolReveal(baseCfg());
    expect(r.probMaxCount).toBe(0.05);
  });
});

describe('symbol moments', () => {
  it('E[paytable[S]] computed correctly', () => {
    const r = solveMysterySymbolReveal(baseCfg());
    // E[P] = 2·0.5 + 10·0.3 + 50·0.15 + 500·0.05 = 1 + 3 + 7.5 + 25 = 36.5
    expect(r.expectedPayoutPerPosition).toBeCloseTo(36.5, 8);
  });
  it('maxSymbolPayout = max paytable', () => {
    const r = solveMysterySymbolReveal(baseCfg());
    expect(r.maxSymbolPayout).toBe(500);
  });
  it('probHitMaxSymbol = P(S = jackpot)', () => {
    const r = solveMysterySymbolReveal(baseCfg());
    expect(r.probHitMaxSymbol).toBe(0.05);
  });
});

describe('joint payout moments', () => {
  it('E[Y] = E[K] · E[paytable[S]] (independence)', () => {
    const r = solveMysterySymbolReveal(baseCfg());
    expect(r.expectedPayoutPerSpin).toBeCloseTo(1.05 * 36.5, 6);
  });
  it('E[Y²] = E[K²] · E[paytable²]', () => {
    const r = solveMysterySymbolReveal(baseCfg());
    // E[paytable²] = 4·0.5 + 100·0.3 + 2500·0.15 + 250000·0.05 = 2 + 30 + 375 + 12500 = 12907
    // E[Y²] = E[K²]·E[paytable²] = 2.95·12907 = 38075.65
    expect(r.expectedPayoutPerSpinSquared).toBeCloseTo(2.95 * 12907, 4);
  });
  it('Var[Y] = E[Y²] − E[Y]²', () => {
    const r = solveMysterySymbolReveal(baseCfg());
    const expected = r.expectedPayoutPerSpinSquared - r.expectedPayoutPerSpin * r.expectedPayoutPerSpin;
    expect(r.variancePayoutPerSpin).toBeCloseTo(Math.max(0, expected), 4);
  });
  it('probFullGridMaxSymbol = P(K=max) · P(S=max)', () => {
    const r = solveMysterySymbolReveal(baseCfg());
    expect(r.probFullGridMaxSymbol).toBeCloseTo(0.05 * 0.05, 8);
  });
  it('conditional E[Y | S=s] = E[K] · paytable[s]', () => {
    const r = solveMysterySymbolReveal(baseCfg());
    expect(r.conditionalExpectedPayoutBySymbol['jackpot']).toBeCloseTo(1.05 * 500, 6);
    expect(r.conditionalExpectedPayoutBySymbol['low']).toBeCloseTo(1.05 * 2, 8);
  });
});

describe('degenerate corners', () => {
  it('K=0 always → E[Y] = 0', () => {
    const r = solveMysterySymbolReveal(baseCfg({
      countPmf: [{ count: 0, probability: 1 }],
    }));
    expect(r.expectedPayoutPerSpin).toBe(0);
    expect(r.variancePayoutPerSpin).toBe(0);
  });
  it('K=k deterministic → E[Y] = k · E[paytable]', () => {
    const r = solveMysterySymbolReveal(baseCfg({
      countPmf: [{ count: 3, probability: 1 }],
    }));
    expect(r.expectedPayoutPerSpin).toBeCloseTo(3 * 36.5, 6);
  });
  it('single symbol → no variance contribution from S', () => {
    const r = solveMysterySymbolReveal(baseCfg({
      symbolPmf: [{ label: 'only', payoutX: 10, probability: 1 }],
    }));
    expect(r.variancePayoutPerPosition).toBe(0);
    // Var[Y] should reduce to E[K²]·100 − E[K]²·100 = 100·Var[K]
    expect(r.variancePayoutPerSpin).toBeCloseTo(100 * 1.8475, 4);
  });
});

describe('monotonicity', () => {
  it('higher E[K] → higher E[Y]', () => {
    const a = solveMysterySymbolReveal(baseCfg());
    const b = solveMysterySymbolReveal(baseCfg({
      countPmf: [
        { count: 0, probability: 0.1 },
        { count: 5, probability: 0.9 },
      ],
    }));
    expect(b.expectedPayoutPerSpin).toBeGreaterThan(a.expectedPayoutPerSpin);
  });
  it('richer symbolPmf (higher E[paytable]) → higher E[Y]', () => {
    const a = solveMysterySymbolReveal(baseCfg());
    const b = solveMysterySymbolReveal(baseCfg({
      symbolPmf: [
        { label: 'high', payoutX: 50, probability: 0.5 },
        { label: 'jackpot', payoutX: 500, probability: 0.5 },
      ],
    }));
    expect(b.expectedPayoutPerSpin).toBeGreaterThan(a.expectedPayoutPerSpin);
  });
});

describe('MC cross-validation', () => {
  it('MC E[Y] matches CF (rel ≤ 5% at 200K spins)', () => {
    const cfg = baseCfg();
    const cf = solveMysterySymbolReveal(cfg);
    const mc = simulateMysterySymbolReveal(cfg, 200_000, 0xdeadbeef);
    const rel = Math.abs(cf.expectedPayoutPerSpin - mc.observedMeanPayoutPerSpin) /
      Math.max(cf.expectedPayoutPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[K] matches CF (rel ≤ 3% at 200K)', () => {
    const cfg = baseCfg();
    const cf = solveMysterySymbolReveal(cfg);
    const mc = simulateMysterySymbolReveal(cfg, 200_000, 0xcafe1234);
    const rel = Math.abs(cf.expectedCount - mc.observedMeanCount) / cf.expectedCount;
    expect(rel).toBeLessThan(0.03);
  });
  it('MC P(K=0) matches CF (abs ≤ 0.01 at 200K)', () => {
    const cfg = baseCfg();
    const cf = solveMysterySymbolReveal(cfg);
    const mc = simulateMysterySymbolReveal(cfg, 200_000, 0xbeefcafe);
    expect(Math.abs(cf.probZeroCount - mc.observedZeroCountFraction)).toBeLessThan(0.01);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveMysterySymbolReveal(baseCfg());
    const b = solveMysterySymbolReveal(baseCfg());
    expect(a.expectedPayoutPerSpin).toBe(b.expectedPayoutPerSpin);
  });
  it('MC same seed → identical', () => {
    const a = simulateMysterySymbolReveal(baseCfg(), 1000, 42);
    const b = simulateMysterySymbolReveal(baseCfg(), 1000, 42);
    expect(a.observedMeanPayoutPerSpin).toBe(b.observedMeanPayoutPerSpin);
  });
});

describe('industry use-cases', () => {
  it('Pragmatic Big Bass style: 0..10 fish symbols with money values', () => {
    const r = solveMysterySymbolReveal({
      countPmf: [
        { count: 0, probability: 0.40 },
        { count: 1, probability: 0.25 },
        { count: 2, probability: 0.15 },
        { count: 3, probability: 0.10 },
        { count: 4, probability: 0.05 },
        { count: 5, probability: 0.03 },
        { count: 8, probability: 0.015 },
        { count: 10, probability: 0.005 },
      ],
      symbolPmf: [
        { label: '2x',    payoutX: 2,    probability: 0.50 },
        { label: '5x',    payoutX: 5,    probability: 0.25 },
        { label: '10x',   payoutX: 10,   probability: 0.15 },
        { label: '25x',   payoutX: 25,   probability: 0.07 },
        { label: '100x',  payoutX: 100,  probability: 0.025 },
        { label: '2000x', payoutX: 2000, probability: 0.005 },
      ],
    });
    expect(r.maxCount).toBe(10);
    expect(r.maxSymbolPayout).toBe(2000);
    expect(r.probFullGridMaxSymbol).toBeCloseTo(0.005 * 0.005, 10);
  });
  it('Wolf Gold style: 3-tier mystery (Mini/Major/Mega) + 5-position max', () => {
    const r = solveMysterySymbolReveal({
      countPmf: [
        { count: 0, probability: 0.7 },
        { count: 3, probability: 0.2 },
        { count: 5, probability: 0.1 },
      ],
      symbolPmf: [
        { label: 'mini',  payoutX: 50,   probability: 0.85 },
        { label: 'major', payoutX: 200,  probability: 0.12 },
        { label: 'mega',  payoutX: 1000, probability: 0.03 },
      ],
    });
    expect(r.probZeroCount).toBe(0.7);
    expect(r.probMaxCount).toBe(0.1);
    expect(r.conditionalExpectedPayoutBySymbol['mega']).toBeCloseTo(r.expectedCount * 1000, 6);
  });
});
