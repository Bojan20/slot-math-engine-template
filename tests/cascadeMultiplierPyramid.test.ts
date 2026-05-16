/**
 * W152 Wave 86 — Cascade Sequential Multiplier Pyramid tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveCascadeMultiplierPyramid,
  simulateCascadeMultiplierPyramid,
  type CascadeMultiplierConfig,
} from '../src/features/cascadeMultiplierPyramid.js';

const baseCfg = (overrides: Partial<CascadeMultiplierConfig> = {}): CascadeMultiplierConfig => ({
  cascadeContinuationProbability: 0.40,
  multiplierLadder: [1, 2, 4, 8, 16, 32],
  meanBaseWinPerStepX: 1.0,
  varianceBaseWinPerStepX: 4.0,
  ...overrides,
});

describe('validation', () => {
  it('rejects q = 1', () => {
    expect(() => solveCascadeMultiplierPyramid(baseCfg({ cascadeContinuationProbability: 1 }))).toThrow();
  });
  it('rejects q < 0', () => {
    expect(() => solveCascadeMultiplierPyramid(baseCfg({ cascadeContinuationProbability: -0.1 }))).toThrow();
  });
  it('rejects empty ladder', () => {
    expect(() => solveCascadeMultiplierPyramid(baseCfg({ multiplierLadder: [] }))).toThrow();
  });
  it('rejects negative ladder entry', () => {
    expect(() => solveCascadeMultiplierPyramid(baseCfg({ multiplierLadder: [1, -1, 2] }))).toThrow();
  });
  it('rejects negative meanBaseWin', () => {
    expect(() => solveCascadeMultiplierPyramid(baseCfg({ meanBaseWinPerStepX: -1 }))).toThrow();
  });
  it('rejects negative variance', () => {
    expect(() => solveCascadeMultiplierPyramid(baseCfg({ varianceBaseWinPerStepX: -1 }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('E[N] = 1/(1-q)', () => {
    const r = solveCascadeMultiplierPyramid(baseCfg({ cascadeContinuationProbability: 0.4 }));
    expect(r.expectedCascades).toBeCloseTo(1 / 0.6, 10);
  });
  it('Var[N] = q/(1-q)²', () => {
    const r = solveCascadeMultiplierPyramid(baseCfg({ cascadeContinuationProbability: 0.4 }));
    expect(r.varianceCascades).toBeCloseTo(0.4 / (0.6 * 0.6), 10);
  });
  it('E[Y] computed correctly for known ladder + q', () => {
    // ladder [1,2,4], q=0.5, μ=1
    // E[Y] = μ · [Σ_{k=1..3} q^(k-1)·m_k + m_max·q^3/(1-q)]
    //      = 1 · [0.5⁰·1 + 0.5¹·2 + 0.5²·4 + 4·0.5³/0.5]
    //      = 1 · [1 + 1 + 1 + 1] = 4
    const r = solveCascadeMultiplierPyramid({
      cascadeContinuationProbability: 0.5,
      multiplierLadder: [1, 2, 4],
      meanBaseWinPerStepX: 1,
      varianceBaseWinPerStepX: 0,
    });
    expect(r.expectedTotalPayoutX).toBeCloseTo(4, 6);
  });
  it('q=0 → only first cascade fires, E[Y] = μ·m_1', () => {
    const r = solveCascadeMultiplierPyramid(baseCfg({
      cascadeContinuationProbability: 0,
      multiplierLadder: [3],
      meanBaseWinPerStepX: 2,
    }));
    expect(r.expectedCascades).toBe(1);
    expect(r.expectedTotalPayoutX).toBeCloseTo(2 * 3, 8);
  });
  it('tail probabilities P(N ≥ k) = q^(k-1)', () => {
    const r = solveCascadeMultiplierPyramid(baseCfg({ cascadeContinuationProbability: 0.30 }));
    expect(r.probAtLeastFiveCascades).toBeCloseTo(Math.pow(0.30, 4), 10);
    expect(r.probAtLeastTenCascades).toBeCloseTo(Math.pow(0.30, 9), 10);
  });
  it('P(reach max ladder) = q^(L-1)', () => {
    const r = solveCascadeMultiplierPyramid(baseCfg({ cascadeContinuationProbability: 0.3, multiplierLadder: [1, 2, 4, 8] }));
    expect(r.probReachMaxLadder).toBeCloseTo(Math.pow(0.3, 3), 10);
  });
  it('mega-hit contribution = μ_W · m_max · q^(L-1)', () => {
    const r = solveCascadeMultiplierPyramid(baseCfg({
      cascadeContinuationProbability: 0.5,
      multiplierLadder: [1, 2, 4, 8, 16],
      meanBaseWinPerStepX: 1,
    }));
    expect(r.expectedMegaHitContribution).toBeCloseTo(1 * 16 * Math.pow(0.5, 4), 8);
  });
  it('E[final multiplier] bounded by m_max', () => {
    const r = solveCascadeMultiplierPyramid(baseCfg());
    const lastMult = baseCfg().multiplierLadder.slice(-1)[0];
    expect(r.expectedFinalMultiplier).toBeLessThanOrEqual(lastMult);
    expect(r.expectedFinalMultiplier).toBeGreaterThanOrEqual(1);
  });
  it('variance is non-negative', () => {
    const r = solveCascadeMultiplierPyramid(baseCfg());
    expect(r.varianceTotalPayoutX).toBeGreaterThanOrEqual(0);
    expect(r.stdTotalPayoutX).toBeGreaterThanOrEqual(0);
  });
});

describe('monotonicity', () => {
  it('higher q ⇒ higher E[N] and E[Y]', () => {
    const a = solveCascadeMultiplierPyramid(baseCfg({ cascadeContinuationProbability: 0.20 }));
    const b = solveCascadeMultiplierPyramid(baseCfg({ cascadeContinuationProbability: 0.60 }));
    expect(b.expectedCascades).toBeGreaterThan(a.expectedCascades);
    expect(b.expectedTotalPayoutX).toBeGreaterThan(a.expectedTotalPayoutX);
  });
  it('higher μ_W ⇒ proportional E[Y]', () => {
    const a = solveCascadeMultiplierPyramid(baseCfg({ meanBaseWinPerStepX: 1 }));
    const b = solveCascadeMultiplierPyramid(baseCfg({ meanBaseWinPerStepX: 3 }));
    expect(b.expectedTotalPayoutX).toBeCloseTo(a.expectedTotalPayoutX * 3, 6);
  });
  it('higher m_max at same ladder length ⇒ higher mega-hit contribution', () => {
    const a = solveCascadeMultiplierPyramid(baseCfg({ multiplierLadder: [1, 2, 4] }));
    const b = solveCascadeMultiplierPyramid(baseCfg({ multiplierLadder: [1, 2, 8] }));
    expect(b.expectedMegaHitContribution).toBeGreaterThan(a.expectedMegaHitContribution);
  });
});

describe('MC cross-validation', () => {
  it('MC E[N] matches CF (rel ≤ 5% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveCascadeMultiplierPyramid(cfg);
    const mc = simulateCascadeMultiplierPyramid(cfg, 50_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedCascades - mc.observedMeanCascades) / cf.expectedCascades;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[Y] matches CF (rel ≤ 5% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveCascadeMultiplierPyramid(cfg);
    const mc = simulateCascadeMultiplierPyramid(cfg, 50_000, 0xbeefbabe);
    const rel = Math.abs(cf.expectedTotalPayoutX - mc.observedMeanPayoutX) / cf.expectedTotalPayoutX;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC Var[Y] matches CF (rel ≤ 25% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveCascadeMultiplierPyramid(cfg);
    const mc = simulateCascadeMultiplierPyramid(cfg, 50_000, 0xfeedface);
    const rel = Math.abs(cf.varianceTotalPayoutX - mc.observedVariancePayoutX) / cf.varianceTotalPayoutX;
    expect(rel).toBeLessThan(0.25);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveCascadeMultiplierPyramid(baseCfg());
    const b = solveCascadeMultiplierPyramid(baseCfg());
    expect(a.expectedTotalPayoutX).toBe(b.expectedTotalPayoutX);
  });
  it('MC same seed → identical', () => {
    const a = simulateCascadeMultiplierPyramid(baseCfg(), 500, 42);
    const b = simulateCascadeMultiplierPyramid(baseCfg(), 500, 42);
    expect(a.totalPayoutX).toBe(b.totalPayoutX);
  });
});

describe('industry use-cases', () => {
  it('Sweet-Bonanza-style: ladder [2,4,6,8,10] q=0.5', () => {
    const r = solveCascadeMultiplierPyramid({
      cascadeContinuationProbability: 0.5,
      multiplierLadder: [2, 4, 6, 8, 10],
      meanBaseWinPerStepX: 0.5,
      varianceBaseWinPerStepX: 1,
    });
    expect(r.expectedCascades).toBeCloseTo(2, 6);
    expect(r.expectedTotalPayoutX).toBeGreaterThan(0);
  });
  it('Sugar-Rush-style: 64-tier ladder doubling q=0.45', () => {
    const ladder = [1, 2, 4, 8, 16, 32, 64];
    const r = solveCascadeMultiplierPyramid({
      cascadeContinuationProbability: 0.45,
      multiplierLadder: ladder,
      meanBaseWinPerStepX: 0.3,
      varianceBaseWinPerStepX: 0.5,
    });
    expect(r.probReachMaxLadder).toBeCloseTo(Math.pow(0.45, 6), 10);
    expect(r.expectedFinalMultiplier).toBeLessThanOrEqual(64);
    expect(r.expectedTotalPayoutX).toBeGreaterThan(0);
  });
});
