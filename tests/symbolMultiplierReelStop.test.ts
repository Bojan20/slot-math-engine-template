/**
 * W152 Wave 142 — Symbol Multiplier on Reel-Stop tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveSymbolMultiplierReelStop,
  simulateSymbolMultiplierReelStop,
  type SymbolMultiplierReelStopConfig,
} from '../src/features/symbolMultiplierReelStop.js';

const baseCfg = (overrides: Partial<SymbolMultiplierReelStopConfig> = {}): SymbolMultiplierReelStopConfig => ({
  positionCount: 30, // 5×6 grid
  multiplierLandingProbability: 0.05,
  aggregationMode: 'additive',
  multiplierValuePmf: [
    { value: 2,   probability: 0.50 },
    { value: 3,   probability: 0.25 },
    { value: 5,   probability: 0.15 },
    { value: 10,  probability: 0.07 },
    { value: 100, probability: 0.03 },
  ],
  baseWinPmf: [
    { value: 0, probability: 0.7 },
    { value: 1, probability: 0.2 },
    { value: 5, probability: 0.08 },
    { value: 50, probability: 0.02 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects positionCount < 1', () => {
    expect(() => solveSymbolMultiplierReelStop(baseCfg({ positionCount: 0 }))).toThrow();
  });
  it('rejects q ≤ 0', () => {
    expect(() => solveSymbolMultiplierReelStop(baseCfg({ multiplierLandingProbability: 0 }))).toThrow();
  });
  it('rejects q ≥ 1', () => {
    expect(() => solveSymbolMultiplierReelStop(baseCfg({ multiplierLandingProbability: 1 }))).toThrow();
  });
  it('rejects invalid aggregationMode', () => {
    expect(() => solveSymbolMultiplierReelStop(baseCfg({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      aggregationMode: 'bogus' as any,
    }))).toThrow();
  });
  it('rejects multiplierValuePmf not summing to 1', () => {
    expect(() => solveSymbolMultiplierReelStop(baseCfg({
      multiplierValuePmf: [{ value: 2, probability: 0.5 }, { value: 3, probability: 0.3 }],
    }))).toThrow();
  });
  it('rejects baseWinPmf not summing to 1', () => {
    expect(() => solveSymbolMultiplierReelStop(baseCfg({
      baseWinPmf: [{ value: 1, probability: 0.5 }],
    }))).toThrow();
  });
  it('rejects multiplier value ≤ 0', () => {
    expect(() => solveSymbolMultiplierReelStop(baseCfg({
      multiplierValuePmf: [{ value: 0, probability: 1 }],
    }))).toThrow();
  });
  it('rejects negative base win value', () => {
    expect(() => solveSymbolMultiplierReelStop(baseCfg({
      baseWinPmf: [{ value: -1, probability: 1 }],
    }))).toThrow();
  });
});

describe('additive mode closed form', () => {
  it('E[T] = (1-q)^N + N·q·μ_V', () => {
    const cfg = baseCfg();
    const r = solveSymbolMultiplierReelStop(cfg);
    // μ_V = 2·0.5 + 3·0.25 + 5·0.15 + 10·0.07 + 100·0.03 = 1+0.75+0.75+0.7+3 = 6.2
    const muV = 6.2;
    const expected = Math.pow(0.95, 30) + 30 * 0.05 * muV;
    expect(r.expectedTotalMultiplier).toBeCloseTo(expected, 8);
  });
  it('E[Y] = E[T] · μ_W', () => {
    const r = solveSymbolMultiplierReelStop(baseCfg());
    // μ_W = 0·0.7 + 1·0.2 + 5·0.08 + 50·0.02 = 0+0.2+0.4+1 = 1.6
    expect(r.expectedPayoutPerSpin).toBeCloseTo(r.expectedTotalMultiplier * 1.6, 6);
  });
  it('Var[T] ≥ 0', () => {
    const r = solveSymbolMultiplierReelStop(baseCfg());
    expect(r.varianceTotalMultiplier).toBeGreaterThanOrEqual(0);
  });
  it('Var[Y] ≥ 0', () => {
    const r = solveSymbolMultiplierReelStop(baseCfg());
    expect(r.variancePayoutPerSpin).toBeGreaterThanOrEqual(0);
  });
  it('P(any multiplier lands) = 1 - (1-q)^N', () => {
    const r = solveSymbolMultiplierReelStop(baseCfg());
    expect(r.probAnyMultiplierLands).toBeCloseTo(1 - Math.pow(0.95, 30), 8);
  });
});

describe('multiplicative mode closed form', () => {
  it('E[T] = (q·μ_V + (1-q))^N', () => {
    const cfg = baseCfg({ aggregationMode: 'multiplicative' });
    const r = solveSymbolMultiplierReelStop(cfg);
    const muV = 6.2;
    const expected = Math.pow(0.05 * muV + 0.95, 30);
    expect(r.expectedTotalMultiplier).toBeCloseTo(expected, 6);
  });
  it('Var[T] ≥ 0 in multiplicative mode', () => {
    const r = solveSymbolMultiplierReelStop(baseCfg({ aggregationMode: 'multiplicative' }));
    expect(r.varianceTotalMultiplier).toBeGreaterThanOrEqual(0);
  });
  it('multiplicative typically higher mean than additive for same params (small q)', () => {
    const add = solveSymbolMultiplierReelStop(baseCfg());
    const mul = solveSymbolMultiplierReelStop(baseCfg({ aggregationMode: 'multiplicative' }));
    // For small q and small N: (1+x)^N expansion ≈ 1 + N·x where x = q·(μ_V - 1)
    // Additive ≈ 1 + N·q·μ_V, multiplicative ≈ (1 + q·(μ_V-1))^N ≈ 1 + N·q·(μ_V-1)
    // For μ_V > 2: multiplicative grows slower at low N·q, but with N·q=1.5 and μ_V=6.2,
    // we'd expect multiplicative ≈ 1.31^30 = 1370.something. Definitely higher.
    expect(mul.expectedTotalMultiplier).toBeGreaterThan(add.expectedTotalMultiplier);
  });
});

describe('monotonicity', () => {
  it('higher q → higher E[T] additive', () => {
    const a = solveSymbolMultiplierReelStop(baseCfg({ multiplierLandingProbability: 0.02 }));
    const b = solveSymbolMultiplierReelStop(baseCfg({ multiplierLandingProbability: 0.10 }));
    expect(b.expectedTotalMultiplier).toBeGreaterThan(a.expectedTotalMultiplier);
  });
  it('higher μ_V → higher E[T] additive', () => {
    const a = solveSymbolMultiplierReelStop(baseCfg({
      multiplierValuePmf: [{ value: 2, probability: 1 }],
    }));
    const b = solveSymbolMultiplierReelStop(baseCfg({
      multiplierValuePmf: [{ value: 10, probability: 1 }],
    }));
    expect(b.expectedTotalMultiplier).toBeGreaterThan(a.expectedTotalMultiplier);
  });
  it('higher N → higher E[T] additive', () => {
    const a = solveSymbolMultiplierReelStop(baseCfg({ positionCount: 15 }));
    const b = solveSymbolMultiplierReelStop(baseCfg({ positionCount: 60 }));
    expect(b.expectedTotalMultiplier).toBeGreaterThan(a.expectedTotalMultiplier);
  });
});

describe('corner cases', () => {
  it('μ_V = 1, additive → E[T] ≈ 1 + (Nq - (1-q)^N)·1 ... but exactly: (1-q)^N + N·q·1', () => {
    const r = solveSymbolMultiplierReelStop(baseCfg({
      multiplierValuePmf: [{ value: 1, probability: 1 }],
    }));
    // For μ_V = 1: E[T] = (1-q)^N + N·q·1
    const expected = Math.pow(0.95, 30) + 30 * 0.05;
    expect(r.expectedTotalMultiplier).toBeCloseTo(expected, 8);
  });
  it('μ_V = 1, multiplicative → E[T] = (q·1 + (1-q))^N = 1', () => {
    const r = solveSymbolMultiplierReelStop(baseCfg({
      aggregationMode: 'multiplicative',
      multiplierValuePmf: [{ value: 1, probability: 1 }],
    }));
    expect(r.expectedTotalMultiplier).toBeCloseTo(1, 10);
  });
  it('zero base win → zero E[Y]', () => {
    const r = solveSymbolMultiplierReelStop(baseCfg({
      baseWinPmf: [{ value: 0, probability: 1 }],
    }));
    expect(r.expectedPayoutPerSpin).toBe(0);
  });
});

describe('industry parametrizations', () => {
  it('Sweet Bonanza-style: 5×6 grid, q≈0.025, additive', () => {
    const r = solveSymbolMultiplierReelStop({
      positionCount: 30,
      multiplierLandingProbability: 0.025,
      aggregationMode: 'additive',
      multiplierValuePmf: [
        { value: 2,   probability: 0.50 },
        { value: 5,   probability: 0.30 },
        { value: 25,  probability: 0.15 },
        { value: 100, probability: 0.04 },
        { value: 500, probability: 0.01 },
      ],
      baseWinPmf: [
        { value: 0,  probability: 0.75 },
        { value: 5,  probability: 0.20 },
        { value: 50, probability: 0.05 },
      ],
    });
    expect(r.expectedPayoutPerSpin).toBeGreaterThan(0);
    expect(r.expectedTotalMultiplier).toBeGreaterThan(1);
  });
  it('Bigger Bass Bonanza fish multipliers: 5×3 grid, q=0.02', () => {
    const r = solveSymbolMultiplierReelStop({
      positionCount: 15,
      multiplierLandingProbability: 0.02,
      aggregationMode: 'additive',
      multiplierValuePmf: [
        { value: 2,  probability: 0.6 },
        { value: 4,  probability: 0.25 },
        { value: 10, probability: 0.13 },
        { value: 50, probability: 0.02 },
      ],
      baseWinPmf: [
        { value: 0, probability: 0.85 },
        { value: 1, probability: 0.10 },
        { value: 10, probability: 0.05 },
      ],
    });
    expect(r.expectedPayoutPerSpin).toBeGreaterThan(0);
  });
  it('NetEnt Asgardian Stones avalanche multipliers (multiplicative chain)', () => {
    const r = solveSymbolMultiplierReelStop({
      positionCount: 15,
      multiplierLandingProbability: 0.10,
      aggregationMode: 'multiplicative',
      multiplierValuePmf: [
        { value: 2, probability: 0.7 },
        { value: 3, probability: 0.25 },
        { value: 5, probability: 0.05 },
      ],
      baseWinPmf: [
        { value: 0, probability: 0.8 },
        { value: 5, probability: 0.15 },
        { value: 50, probability: 0.05 },
      ],
    });
    expect(r.expectedPayoutPerSpin).toBeGreaterThan(0);
    expect(r.expectedTotalMultiplier).toBeGreaterThan(1);
  });
});

describe('MC cross-validation', () => {
  it('MC E[Y] matches CF additive (rel ≤ 6% at 200K spins)', () => {
    const cfg = baseCfg();
    const cf = solveSymbolMultiplierReelStop(cfg);
    const mc = simulateSymbolMultiplierReelStop(cfg, 200_000, 0xdeadbeef);
    const rel = Math.abs(cf.expectedPayoutPerSpin - mc.observedMeanPayoutPerSpin) /
      Math.max(cf.expectedPayoutPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.06);
  });
  it('MC E[T] matches CF additive (rel ≤ 3% at 200K)', () => {
    const cfg = baseCfg();
    const cf = solveSymbolMultiplierReelStop(cfg);
    const mc = simulateSymbolMultiplierReelStop(cfg, 200_000, 0xcafe1234);
    const rel = Math.abs(cf.expectedTotalMultiplier - mc.observedMeanTotalMultiplier) / cf.expectedTotalMultiplier;
    expect(rel).toBeLessThan(0.03);
  });
  it('MC E[landed count] matches N·q (rel ≤ 2% at 200K)', () => {
    const cfg = baseCfg();
    const cf = solveSymbolMultiplierReelStop(cfg);
    const mc = simulateSymbolMultiplierReelStop(cfg, 200_000, 0xbeefcafe);
    const rel = Math.abs(cf.expectedLandedCount - mc.observedMeanLandedCount) / cf.expectedLandedCount;
    expect(rel).toBeLessThan(0.02);
  });
  it('MC P(any landing) matches CF (abs ≤ 0.01)', () => {
    const cfg = baseCfg();
    const cf = solveSymbolMultiplierReelStop(cfg);
    const mc = simulateSymbolMultiplierReelStop(cfg, 200_000, 0x1234);
    expect(Math.abs(cf.probAnyMultiplierLands - mc.observedAnyMultiplierLandsFraction)).toBeLessThan(0.01);
  });
  it('MC E[Y] matches CF multiplicative low-variance config (rel ≤ 10% at 200K)', () => {
    // Multiplicative mode has explosive variance with heavy-tail PMFs.
    // Use modest config: small grid + small q + bounded V for tractable MC convergence.
    const cfg: SymbolMultiplierReelStopConfig = {
      positionCount: 8,
      multiplierLandingProbability: 0.10,
      aggregationMode: 'multiplicative',
      multiplierValuePmf: [
        { value: 2, probability: 0.7 },
        { value: 3, probability: 0.25 },
        { value: 5, probability: 0.05 },
      ],
      baseWinPmf: [
        { value: 0, probability: 0.8 },
        { value: 1, probability: 0.15 },
        { value: 5, probability: 0.05 },
      ],
    };
    const cf = solveSymbolMultiplierReelStop(cfg);
    const mc = simulateSymbolMultiplierReelStop(cfg, 200_000, 0xdead);
    const rel = Math.abs(cf.expectedPayoutPerSpin - mc.observedMeanPayoutPerSpin) /
      Math.max(cf.expectedPayoutPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.10);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveSymbolMultiplierReelStop(baseCfg());
    const b = solveSymbolMultiplierReelStop(baseCfg());
    expect(a.expectedPayoutPerSpin).toBe(b.expectedPayoutPerSpin);
  });
  it('MC same seed → identical', () => {
    const a = simulateSymbolMultiplierReelStop(baseCfg(), 1000, 42);
    const b = simulateSymbolMultiplierReelStop(baseCfg(), 1000, 42);
    expect(a.observedMeanPayoutPerSpin).toBe(b.observedMeanPayoutPerSpin);
  });
});

describe('distinctness vs W138', () => {
  it('no cascade chain — multiplier landing position random, not cascade-level driven', () => {
    // W138: M_k determined by cascade level k (deterministic).
    // W142: M random value at random POSITION per spin.
    // Therefore, increasing N (positions) increases E[T] in W142 (more chances to land),
    // but does not exist concept of "chain length" in W142.
    const r = solveSymbolMultiplierReelStop(baseCfg({ positionCount: 100 }));
    expect(r.expectedTotalMultiplier).toBeGreaterThan(baseCfg().positionCount * 0.05 * 6.2);
  });
});
