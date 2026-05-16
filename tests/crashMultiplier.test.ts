/**
 * W152 Wave 57 — Crash-style multiplier-only tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveCrashTarget,
  solveCrashHouseStatistics,
  simulateCrashTarget,
  probSurvive,
  probCrashBefore,
  type CrashGameConfig,
} from '../src/features/crashMultiplier.js';

const baseCfg = (overrides: Partial<CrashGameConfig> = {}): CrashGameConfig => ({
  houseEdge: 0.01,
  maxMultiplier: 10_000,
  ...overrides,
});

// ── Validation ─────────────────────────────────────────────────────────────

describe('validation', () => {
  it('rejects houseEdge < 0', () => {
    expect(() => solveCrashTarget(baseCfg({ houseEdge: -0.01 }), 2)).toThrow();
  });
  it('rejects houseEdge ≥ 1', () => {
    expect(() => solveCrashTarget(baseCfg({ houseEdge: 1 }), 2)).toThrow();
  });
  it('rejects maxMultiplier ≤ 1', () => {
    expect(() => solveCrashTarget(baseCfg({ maxMultiplier: 1 }), 2)).toThrow();
  });
  it('rejects targetMultiplier < 1', () => {
    expect(() => solveCrashTarget(baseCfg(), 0.5)).toThrow();
  });
});

// ── Closed-form correctness ────────────────────────────────────────────────

describe('probSurvive & probCrashBefore', () => {
  it('S(1) = 1 − HE (smallest target reaches 99%)', () => {
    expect(probSurvive(baseCfg(), 1)).toBeCloseTo(0.99, 10);
  });
  it('S(M) = (1−HE)/M for any target', () => {
    expect(probSurvive(baseCfg({ houseEdge: 0.02 }), 5)).toBeCloseTo(0.98 / 5, 10);
  });
  it('S(M) + F(M) = 1', () => {
    const cfg = baseCfg();
    expect(probSurvive(cfg, 3) + probCrashBefore(cfg, 3)).toBeCloseTo(1, 10);
  });
  it('S(M_max) at exact cap = (1−HE)/M_max', () => {
    const cfg = baseCfg({ maxMultiplier: 1000 });
    expect(probSurvive(cfg, 1000)).toBeCloseTo(0.99 / 1000, 10);
  });
  it('S(M > M_max) = 0', () => {
    const cfg = baseCfg({ maxMultiplier: 100 });
    expect(probSurvive(cfg, 1000)).toBe(0);
  });
});

describe('solveCrashTarget — RTP invariance', () => {
  // KEY THEOREM: RTP is independent of target in fair-crash model
  it('RTP same for M=1, M=10, M=100, M=1000 (within cap)', () => {
    const cfg = baseCfg();
    const r1 = solveCrashTarget(cfg, 1);
    const r10 = solveCrashTarget(cfg, 10);
    const r100 = solveCrashTarget(cfg, 100);
    const r1000 = solveCrashTarget(cfg, 1000);
    expect(r1.rtp).toBeCloseTo(0.99, 10);
    expect(r10.rtp).toBeCloseTo(0.99, 10);
    expect(r100.rtp).toBeCloseTo(0.99, 10);
    expect(r1000.rtp).toBeCloseTo(0.99, 10);
  });
  it('RTP = 1 − HE exactly for HE = 0', () => {
    const cfg = baseCfg({ houseEdge: 0 });
    expect(solveCrashTarget(cfg, 5).rtp).toBeCloseTo(1, 10);
  });
  it('RTP = 1 − HE for HE = 0.05', () => {
    const cfg = baseCfg({ houseEdge: 0.05 });
    expect(solveCrashTarget(cfg, 10).rtp).toBeCloseTo(0.95, 10);
  });
});

describe('solveCrashTarget — variance & volatility', () => {
  it('Var[Y | target M] = M² × S − (M × S)² = M × S(1−HE)/M × M² hmm', () => {
    const cfg = baseCfg();
    // Var = M² × S − (M × S)²
    //     = M² × S × (1 − S)
    // For M=2: S = 0.495, M²S = 1.98, (M·S)² = 0.99² = 0.9801
    // Var = 1.98 − 0.9801 = 1.0 (approx)
    const r = solveCrashTarget(cfg, 2);
    const M = 2;
    const S = 0.99 / 2;
    const expected = M * M * S - (M * S) ** 2;
    expect(r.variancePerSpin).toBeCloseTo(expected, 6);
  });
  it('higher target M ⇒ higher variance', () => {
    const cfg = baseCfg();
    const r2 = solveCrashTarget(cfg, 2);
    const r10 = solveCrashTarget(cfg, 10);
    const r100 = solveCrashTarget(cfg, 100);
    expect(r10.variancePerSpin).toBeGreaterThan(r2.variancePerSpin);
    expect(r100.variancePerSpin).toBeGreaterThan(r10.variancePerSpin);
  });
  it('volatility index increases with M (RTP constant ⇒ σ/μ grows)', () => {
    const cfg = baseCfg();
    const r2 = solveCrashTarget(cfg, 2);
    const r100 = solveCrashTarget(cfg, 100);
    expect(r100.volatilityIndex).toBeGreaterThan(r2.volatilityIndex);
  });
  it('hitFrequency decreases with M', () => {
    const cfg = baseCfg();
    const r2 = solveCrashTarget(cfg, 2);
    const r10 = solveCrashTarget(cfg, 10);
    expect(r10.hitFrequency).toBeLessThan(r2.hitFrequency);
  });
});

// ── House statistics ───────────────────────────────────────────────────────

describe('solveCrashHouseStatistics', () => {
  it('median = 2(1 − HE)', () => {
    expect(solveCrashHouseStatistics(baseCfg()).medianBust).toBeCloseTo(1.98, 10);
    expect(solveCrashHouseStatistics(baseCfg({ houseEdge: 0 })).medianBust).toBeCloseTo(2, 10);
    expect(solveCrashHouseStatistics(baseCfg({ houseEdge: 0.05 })).medianBust).toBeCloseTo(1.9, 10);
  });
  it('P(bust before 2×) = 1 − (1−HE)/2', () => {
    const r = solveCrashHouseStatistics(baseCfg());
    expect(r.probBustBefore2x).toBeCloseTo(1 - 0.99 / 2, 10);
  });
  it('P(bust before 10×) = 1 − (1−HE)/10', () => {
    const r = solveCrashHouseStatistics(baseCfg());
    expect(r.probBustBefore10x).toBeCloseTo(1 - 0.99 / 10, 10);
  });
  it('probReachCap = (1 − HE)/M_max', () => {
    const r = solveCrashHouseStatistics(baseCfg({ maxMultiplier: 1000 }));
    expect(r.probReachCap).toBeCloseTo(0.99 / 1000, 10);
  });
  it('expectedBustTruncated finite when M_max < ∞', () => {
    const r = solveCrashHouseStatistics(baseCfg({ maxMultiplier: 1000 }));
    expect(Number.isFinite(r.expectedBustTruncated)).toBe(true);
    expect(r.expectedBustTruncated).toBeGreaterThan(1);
  });
  it('larger M_max ⇒ larger E[B_trunc]', () => {
    const r1 = solveCrashHouseStatistics(baseCfg({ maxMultiplier: 100 }));
    const r2 = solveCrashHouseStatistics(baseCfg({ maxMultiplier: 10_000 }));
    expect(r2.expectedBustTruncated).toBeGreaterThan(r1.expectedBustTruncated);
  });
});

// ── MC cross-validation ─────────────────────────────────────────────────────

describe('solveCrashTarget — MC cross-validation', () => {
  it('RTP matches MC at 500K spins, target=2 (rel ≤ 2%)', () => {
    const cfg = baseCfg();
    const cf = solveCrashTarget(cfg, 2);
    const mc = simulateCrashTarget(cfg, 2, 500_000, 0xc0ffee);
    const rel = Math.abs(cf.rtp - mc.observedRtp) / cf.rtp;
    expect(rel).toBeLessThan(0.02);
  });
  it('RTP matches MC at 500K spins, target=10 (rel ≤ 5%)', () => {
    const cfg = baseCfg();
    const cf = solveCrashTarget(cfg, 10);
    const mc = simulateCrashTarget(cfg, 10, 500_000, 0xbeefbabe);
    const rel = Math.abs(cf.rtp - mc.observedRtp) / cf.rtp;
    expect(rel).toBeLessThan(0.05);
  });
  it('hitFrequency matches MC for target=2', () => {
    const cfg = baseCfg();
    const cf = solveCrashTarget(cfg, 2);
    const mc = simulateCrashTarget(cfg, 2, 500_000, 0xdecafbad);
    expect(Math.abs(cf.hitFrequency - mc.observedHitFrequency)).toBeLessThan(0.01);
  });
  it('hitFrequency matches MC for target=10', () => {
    const cfg = baseCfg();
    const cf = solveCrashTarget(cfg, 10);
    const mc = simulateCrashTarget(cfg, 10, 500_000, 0xa55a55a);
    expect(Math.abs(cf.hitFrequency - mc.observedHitFrequency)).toBeLessThan(0.005);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('HE = 0 (fair game) ⇒ RTP = 1', () => {
    const cfg = baseCfg({ houseEdge: 0 });
    expect(solveCrashTarget(cfg, 5).rtp).toBeCloseTo(1, 10);
  });
  it('target = maxMultiplier ⇒ valid, very low hitFreq', () => {
    const cfg = baseCfg({ maxMultiplier: 100 });
    const r = solveCrashTarget(cfg, 100);
    expect(r.rtp).toBeCloseTo(0.99, 10);
    expect(r.hitFrequency).toBeCloseTo(0.0099, 6);
  });
  it('target > maxMultiplier ⇒ clipped to cap', () => {
    const cfg = baseCfg({ maxMultiplier: 50 });
    const r = solveCrashTarget(cfg, 1000);
    expect(r.targetMultiplier).toBe(50);
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('same config + target ⇒ identical', () => {
    const a = solveCrashTarget(baseCfg(), 2);
    const b = solveCrashTarget(baseCfg(), 2);
    expect(a.rtp).toBe(b.rtp);
    expect(a.variancePerSpin).toBe(b.variancePerSpin);
  });
  it('MC same seed ⇒ identical', () => {
    const a = simulateCrashTarget(baseCfg(), 2, 1000, 42);
    const b = simulateCrashTarget(baseCfg(), 2, 1000, 42);
    expect(a.observedMeanPayout).toBe(b.observedMeanPayout);
    expect(a.observedMaxBust).toBe(b.observedMaxBust);
  });
});
