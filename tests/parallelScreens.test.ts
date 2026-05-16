/**
 * W152 Wave 58 — Parallel Screens tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveParallelScreens,
  simulateParallelScreens,
  type ParallelScreensConfig,
} from '../src/features/parallelScreens.js';

const stdDist = [
  { valueX: 0, weight: 70 },
  { valueX: 1, weight: 20 },
  { valueX: 5, weight: 8 },
  { valueX: 25, weight: 2 },
];

const baseCfg = (overrides: Partial<ParallelScreensConfig> = {}): ParallelScreensConfig => ({
  numScreens: 3,
  shared: true,
  screenDistributions: [stdDist],
  ...overrides,
});

// ── Validation ─────────────────────────────────────────────────────────────

describe('validation', () => {
  it('rejects numScreens < 2', () => {
    expect(() => solveParallelScreens({ ...baseCfg(), numScreens: 1 })).toThrow();
  });
  it('rejects screenDistributions length mismatch when not shared', () => {
    expect(() => solveParallelScreens({
      numScreens: 3,
      shared: false,
      screenDistributions: [stdDist, stdDist],
    })).toThrow();
  });
  it('rejects empty distribution', () => {
    expect(() => solveParallelScreens({ ...baseCfg(), screenDistributions: [[]] })).toThrow();
  });
  it('rejects negative valueX', () => {
    expect(() => solveParallelScreens({
      ...baseCfg(),
      screenDistributions: [[{ valueX: -1, weight: 1 }]],
    })).toThrow();
  });
  it('rejects pSharedOutcome outside [0,1]', () => {
    expect(() => solveParallelScreens({ ...baseCfg(), pSharedOutcome: 1.5 })).toThrow();
    expect(() => solveParallelScreens({ ...baseCfg(), pSharedOutcome: -0.1 })).toThrow();
  });
});

// ── Independent mode ───────────────────────────────────────────────────────

describe('independent (pShared=0)', () => {
  it('E[Y] = Σ E[Y_i]', () => {
    const r = solveParallelScreens(baseCfg());
    const sum = r.perScreenExpected.reduce((a, b) => a + b, 0);
    expect(r.expectedPayoutPerSpin).toBeCloseTo(sum, 10);
  });
  it('Var[Y] = Σ Var[Y_i] (independent)', () => {
    const r = solveParallelScreens(baseCfg());
    const sum = r.perScreenVariance.reduce((a, b) => a + b, 0);
    expect(r.variancePayoutPerSpin).toBeCloseTo(sum, 8);
  });
  it('aggregatePmf sums to 1', () => {
    const r = solveParallelScreens(baseCfg());
    expect(r.aggregatePmf).not.toBeNull();
    const sum = r.aggregatePmf!.reduce((a, e) => a + e.probability, 0);
    expect(sum).toBeCloseTo(1, 8);
  });
  it('aggregatePmf includes value 0 with prob = Π P(Y_i = 0)', () => {
    const r = solveParallelScreens(baseCfg());
    const zero = r.aggregatePmf!.find((e) => e.valueX === 0);
    // P(all zero) = 0.7^3 = 0.343
    expect(zero?.probability).toBeCloseTo(0.343, 8);
  });
  it('heterogeneous screens: per-screen distributions differ', () => {
    const cfg: ParallelScreensConfig = {
      numScreens: 2,
      shared: false,
      screenDistributions: [
        [{ valueX: 0, weight: 50 }, { valueX: 10, weight: 50 }],
        [{ valueX: 0, weight: 90 }, { valueX: 100, weight: 10 }],
      ],
    };
    const r = solveParallelScreens(cfg);
    // E[Y_1] = 5, E[Y_2] = 10, E[Y] = 15
    expect(r.expectedPayoutPerSpin).toBeCloseTo(15, 10);
  });
});

// ── Correlated mode ───────────────────────────────────────────────────────

describe('correlated (pShared > 0)', () => {
  it('E[Y] = pShared × N × E[V] + (1−pShared) × Σ E[Y_i]', () => {
    const r = solveParallelScreens(baseCfg({ pSharedOutcome: 0.5 }));
    // Identical screens: shared = independent in E[Y]
    const sum = r.perScreenExpected.reduce((a, b) => a + b, 0);
    expect(r.expectedPayoutPerSpin).toBeCloseTo(sum, 10);
  });
  it('Var[Y] > Var[indep] when correlated', () => {
    const r0 = solveParallelScreens(baseCfg({ pSharedOutcome: 0 }));
    const r05 = solveParallelScreens(baseCfg({ pSharedOutcome: 0.5 }));
    expect(r05.variancePayoutPerSpin).toBeGreaterThan(r0.variancePayoutPerSpin);
  });
  it('Var[Y | pShared=1] = N² × Var[V]', () => {
    const r = solveParallelScreens(baseCfg({ pSharedOutcome: 1 }));
    // E[V] = 0.7×0 + 0.2×1 + 0.08×5 + 0.02×25 = 1.1
    // E[V²] = 0.7×0 + 0.2×1 + 0.08×25 + 0.02×625 = 14.7
    // Var[V] = 14.7 − 1.21 = 13.49
    // For N=3: Var[Y] = 9 × 13.49 = 121.41
    expect(r.variancePayoutPerSpin).toBeCloseTo(9 * 13.49, 4);
  });
  it('aggregatePmf is null in correlated mode', () => {
    const r = solveParallelScreens(baseCfg({ pSharedOutcome: 0.5 }));
    expect(r.aggregatePmf).toBeNull();
  });
});

// ── Probability of zero / hit rate ─────────────────────────────────────────

describe('P(Y=0) & hit rate', () => {
  it('P(Y=0) = (P(V=0))^N for independent shared screens', () => {
    const r = solveParallelScreens(baseCfg({ pSharedOutcome: 0 }));
    // P(V=0) = 0.7, N=3 → 0.343
    expect(r.probZeroPayout).toBeCloseTo(0.343, 8);
  });
  it('hitRate = 1 − P(Y=0)', () => {
    const r = solveParallelScreens(baseCfg());
    expect(r.hitRate).toBeCloseTo(1 - r.probZeroPayout, 10);
  });
  it('P(Y=0) larger in correlated mode (with pShared=1)', () => {
    const r1 = solveParallelScreens(baseCfg({ pSharedOutcome: 1 }));
    // P(Y=0) = P(V=0) = 0.7
    expect(r1.probZeroPayout).toBeCloseTo(0.7, 8);
  });
});

// ── MC cross-validation ─────────────────────────────────────────────────────

describe('MC cross-validation', () => {
  it('E[Y] independent matches MC at 200K spins (rel ≤ 2%)', () => {
    const cfg = baseCfg();
    const cf = solveParallelScreens(cfg);
    const mc = simulateParallelScreens(cfg, 200_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedPayoutPerSpin - mc.observedMeanPayout) / cf.expectedPayoutPerSpin;
    expect(rel).toBeLessThan(0.02);
  });
  it('Var[Y] independent matches MC (rel ≤ 10%)', () => {
    const cfg = baseCfg();
    const cf = solveParallelScreens(cfg);
    const mc = simulateParallelScreens(cfg, 200_000, 0xbeefbabe);
    const rel = Math.abs(cf.variancePayoutPerSpin - mc.observedVariancePayout) / cf.variancePayoutPerSpin;
    expect(rel).toBeLessThan(0.10);
  });
  it('correlated E[Y] matches MC', () => {
    const cfg = baseCfg({ pSharedOutcome: 0.3 });
    const cf = solveParallelScreens(cfg);
    const mc = simulateParallelScreens(cfg, 200_000, 0xdecafbad);
    const rel = Math.abs(cf.expectedPayoutPerSpin - mc.observedMeanPayout) / cf.expectedPayoutPerSpin;
    expect(rel).toBeLessThan(0.02);
  });
  it('P(Y=0) matches MC zero-payout fraction', () => {
    const cfg = baseCfg();
    const cf = solveParallelScreens(cfg);
    const mc = simulateParallelScreens(cfg, 200_000, 0xa55a55a);
    expect(Math.abs(cf.probZeroPayout - mc.observedZeroPayoutFraction)).toBeLessThan(0.01);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────

describe('edges', () => {
  it('2 screens with deterministic dist ⇒ E[Y] = 2v', () => {
    const r = solveParallelScreens({
      numScreens: 2,
      shared: true,
      screenDistributions: [[{ valueX: 7, weight: 1 }]],
    });
    expect(r.expectedPayoutPerSpin).toBe(14);
    expect(r.variancePayoutPerSpin).toBe(0);
  });
  it('all-zero dist ⇒ E[Y] = 0, P(Y=0) = 1', () => {
    const r = solveParallelScreens({
      numScreens: 4,
      shared: true,
      screenDistributions: [[{ valueX: 0, weight: 1 }]],
    });
    expect(r.expectedPayoutPerSpin).toBe(0);
    expect(r.probZeroPayout).toBe(1);
  });
  it('N=8 PMF: convolution still terminates', () => {
    const r = solveParallelScreens({
      numScreens: 8,
      shared: true,
      screenDistributions: [stdDist],
    });
    expect(r.aggregatePmf).not.toBeNull();
    expect(r.aggregatePmf!.length).toBeGreaterThan(0);
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('identical inputs ⇒ bit-exact', () => {
    const a = solveParallelScreens(baseCfg());
    const b = solveParallelScreens(baseCfg());
    expect(a.expectedPayoutPerSpin).toBe(b.expectedPayoutPerSpin);
    expect(a.variancePayoutPerSpin).toBe(b.variancePayoutPerSpin);
  });
  it('MC same seed ⇒ identical', () => {
    const a = simulateParallelScreens(baseCfg(), 1000, 42);
    const b = simulateParallelScreens(baseCfg(), 1000, 42);
    expect(a.observedMeanPayout).toBe(b.observedMeanPayout);
  });
});
