/**
 * W152 Wave 60 — Sticky-Cash Collector tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveStickyCashCollectorSteadyState,
  solveStickyCashCollectorFiniteHorizon,
  simulateStickyCashCollector,
  type StickyCashCollectorConfig,
} from '../src/features/stickyCashCollector.js';

const baseCfg = (overrides: Partial<StickyCashCollectorConfig> = {}): StickyCashCollectorConfig => ({
  pCash: 0.15,
  pCollect: 0.05,
  cashDistribution: [
    { valueX: 1, weight: 6 },
    { valueX: 2, weight: 3 },
    { valueX: 5, weight: 1 },
  ],
  multDistribution: [
    { multiplier: 1, weight: 60 },
    { multiplier: 2, weight: 25 },
    { multiplier: 5, weight: 10 },
    { multiplier: 10, weight: 5 },
  ],
  ...overrides,
});

// ── Validation ─────────────────────────────────────────────────────────────

describe('validation', () => {
  it('rejects pCash outside [0,1]', () => {
    expect(() => solveStickyCashCollectorSteadyState(baseCfg({ pCash: -0.1 }))).toThrow();
    expect(() => solveStickyCashCollectorSteadyState(baseCfg({ pCash: 1.1 }))).toThrow();
  });
  it('rejects pCollect ≤ 0 or > 1', () => {
    expect(() => solveStickyCashCollectorSteadyState(baseCfg({ pCollect: 0 }))).toThrow();
    expect(() => solveStickyCashCollectorSteadyState(baseCfg({ pCollect: 1.5 }))).toThrow();
  });
  it('rejects pCash + pCollect > 1', () => {
    expect(() => solveStickyCashCollectorSteadyState(baseCfg({ pCash: 0.6, pCollect: 0.5 }))).toThrow();
  });
  it('rejects empty cashDistribution', () => {
    expect(() => solveStickyCashCollectorSteadyState(baseCfg({ cashDistribution: [] }))).toThrow();
  });
  it('rejects empty multDistribution', () => {
    expect(() => solveStickyCashCollectorSteadyState(baseCfg({ multDistribution: [] }))).toThrow();
  });
  it('rejects negative cash value', () => {
    expect(() =>
      solveStickyCashCollectorSteadyState(baseCfg({ cashDistribution: [{ valueX: -1, weight: 1 }] })),
    ).toThrow();
  });
  it('rejects negative multiplier', () => {
    expect(() =>
      solveStickyCashCollectorSteadyState(baseCfg({ multDistribution: [{ multiplier: -1, weight: 1 }] })),
    ).toThrow();
  });
});

// ── Steady-state correctness ────────────────────────────────────────────────

describe('steady state', () => {
  it('long-run RTP = p_cash × E[V] × E[M]', () => {
    const r = solveStickyCashCollectorSteadyState(baseCfg());
    // E[V] = (6·1 + 3·2 + 1·5)/10 = 1.7
    // E[M] = (60·1 + 25·2 + 10·5 + 5·10)/100 = (60+50+50+50)/100 = 2.1
    // RTP = 0.15 × 1.7 × 2.1 = 0.5355
    expect(r.longRunRtpPerSpin).toBeCloseTo(0.5355, 4);
  });
  it('E[T at collector] = p_cash × E[V] / p_collect', () => {
    const r = solveStickyCashCollectorSteadyState(baseCfg());
    // = 0.15 × 1.7 / 0.05 = 5.1
    expect(r.expectedStickyTotalAtCollector).toBeCloseTo(5.1, 6);
  });
  it('E[payout per collector] = E[M] × E[T at collector]', () => {
    const r = solveStickyCashCollectorSteadyState(baseCfg());
    expect(r.expectedPayoutPerCollector).toBeCloseTo(2.1 * 5.1, 4);
  });
  it('long-run RTP independent of p_collect (only steady-state)', () => {
    const a = solveStickyCashCollectorSteadyState(baseCfg({ pCollect: 0.02 }));
    const b = solveStickyCashCollectorSteadyState(baseCfg({ pCollect: 0.10 }));
    expect(a.longRunRtpPerSpin).toBeCloseTo(b.longRunRtpPerSpin, 10);
  });
});

// ── Finite horizon ─────────────────────────────────────────────────────────

describe('finite horizon', () => {
  it('E[Y]/N converges to long-run RTP for large N', () => {
    const ss = solveStickyCashCollectorSteadyState(baseCfg());
    const fh = solveStickyCashCollectorFiniteHorizon(baseCfg(), 10_000);
    const rel = Math.abs(fh.expectedPayoutPerSpinInN - ss.longRunRtpPerSpin) / ss.longRunRtpPerSpin;
    expect(rel).toBeLessThan(0.005); // 0.5% transient effect
  });
  it('small N has lower E[Y]/N than asymptotic (stranded cash effect)', () => {
    const ss = solveStickyCashCollectorSteadyState(baseCfg());
    const fh = solveStickyCashCollectorFiniteHorizon(baseCfg(), 50);
    expect(fh.expectedPayoutPerSpinInN).toBeLessThan(ss.longRunRtpPerSpin);
  });
  it('expectedStickyTotalTrace length = N + 1', () => {
    const fh = solveStickyCashCollectorFiniteHorizon(baseCfg(), 100);
    expect(fh.expectedStickyTotalTrace.length).toBe(101);
    expect(fh.expectedStickyTotalTrace[0]).toBe(0);
  });
  it('expected sticky converges to steady state', () => {
    const ss = solveStickyCashCollectorSteadyState(baseCfg());
    const fh = solveStickyCashCollectorFiniteHorizon(baseCfg(), 1000);
    const final = fh.expectedStickyTotalTrace[1000];
    expect(Math.abs(final - ss.expectedStickyTotalAtCollector)).toBeLessThan(0.01);
  });
  it('larger N ⇒ larger E[Y] (monotonic)', () => {
    const a = solveStickyCashCollectorFiniteHorizon(baseCfg(), 100);
    const b = solveStickyCashCollectorFiniteHorizon(baseCfg(), 200);
    expect(b.expectedPayoutInN).toBeGreaterThan(a.expectedPayoutInN);
  });
  it('efficiency increases with N (1 − transient/N)', () => {
    const a = solveStickyCashCollectorFiniteHorizon(baseCfg(), 50);
    const b = solveStickyCashCollectorFiniteHorizon(baseCfg(), 500);
    expect(b.efficiencyVsAsymptotic).toBeGreaterThan(a.efficiencyVsAsymptotic);
  });
});

// ── MC cross-validation ─────────────────────────────────────────────────────

describe('MC cross-validation', () => {
  it('E[Y_N] for N=200 matches MC over 10K episodes (rel ≤ 5%)', () => {
    const cfg = baseCfg();
    const N = 200;
    const cf = solveStickyCashCollectorFiniteHorizon(cfg, N);
    const mc = simulateStickyCashCollector(cfg, N, 10_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedPayoutInN - mc.observedMeanPayoutInN) / cf.expectedPayoutInN;
    expect(rel).toBeLessThan(0.05);
  });
  it('mean collectors ≈ N × p_collect', () => {
    const cfg = baseCfg();
    const N = 500;
    const mc = simulateStickyCashCollector(cfg, N, 5000, 0xbeefbabe);
    const expected = N * cfg.pCollect;
    const rel = Math.abs(mc.observedMeanCollectors - expected) / expected;
    expect(rel).toBeLessThan(0.05);
  });
  it('E[stranded at end] matches CF E[T_N]', () => {
    const cfg = baseCfg();
    const N = 100;
    const cf = solveStickyCashCollectorFiniteHorizon(cfg, N);
    const mc = simulateStickyCashCollector(cfg, N, 10_000, 0xdecafbad);
    const rel = Math.abs(cf.expectedStrandedAtEnd - mc.observedMeanStrandedAtEnd) /
      Math.max(cf.expectedStrandedAtEnd, 1e-9);
    expect(rel).toBeLessThan(0.10);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────

describe('edges', () => {
  it('pCash = 0 ⇒ RTP = 0', () => {
    const r = solveStickyCashCollectorSteadyState(baseCfg({ pCash: 0 }));
    expect(r.longRunRtpPerSpin).toBe(0);
  });
  it('mult = 1 (no boost) ⇒ RTP = p_cash × E[V]', () => {
    const r = solveStickyCashCollectorSteadyState(baseCfg({
      multDistribution: [{ multiplier: 1, weight: 1 }],
    }));
    expect(r.longRunRtpPerSpin).toBeCloseTo(0.15 * 1.7, 6);
  });
  it('very high p_collect ⇒ many small collections', () => {
    const r = solveStickyCashCollectorSteadyState(baseCfg({ pCollect: 0.5 }));
    expect(r.expectedStickyTotalAtCollector).toBeLessThan(1); // small accumulation
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('identical CF ⇒ bit-exact', () => {
    const a = solveStickyCashCollectorSteadyState(baseCfg());
    const b = solveStickyCashCollectorSteadyState(baseCfg());
    expect(a.longRunRtpPerSpin).toBe(b.longRunRtpPerSpin);
  });
  it('MC same seed ⇒ identical', () => {
    const a = simulateStickyCashCollector(baseCfg(), 100, 100, 42);
    const b = simulateStickyCashCollector(baseCfg(), 100, 100, 42);
    expect(a.observedMeanPayoutInN).toBe(b.observedMeanPayoutInN);
  });
});
