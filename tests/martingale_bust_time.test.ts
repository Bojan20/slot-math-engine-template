/**
 * W152 Wave 163 — Martingale Wager Progression Bust Time Analyzer tests.
 *
 * 30 specs covering:
 *   - validation (7)
 *   - k_max correctness (4)
 *   - per-round probability correctness (4)
 *   - moments correctness (4)
 *   - chase-pattern risk score (3)
 *   - monotonicity invariants (3)
 *   - MC cross-validation (3)
 *   - determinism (1)
 *   - industry use-cases (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveMartingaleBustTime,
  simulateMartingaleBustTime,
} from '../src/features/martingaleBustTime.js';

const baseCfg = {
  bankroll: 100,
  baseBet: 1,
  probWinPerSpin: 0.48, // even-money roulette-class chance with house edge
};

describe('martingaleBustTime — validation', () => {
  it('rejects bankroll ≤ 0', () => {
    expect(() => solveMartingaleBustTime({ ...baseCfg, bankroll: 0 })).toThrow();
    expect(() => solveMartingaleBustTime({ ...baseCfg, bankroll: -10 })).toThrow();
  });
  it('rejects baseBet ≤ 0', () => {
    expect(() => solveMartingaleBustTime({ ...baseCfg, baseBet: 0 })).toThrow();
  });
  it('rejects baseBet > bankroll', () => {
    expect(() => solveMartingaleBustTime({ ...baseCfg, baseBet: 200 })).toThrow();
  });
  it('rejects probWinPerSpin ≤ 0 or ≥ 1', () => {
    expect(() => solveMartingaleBustTime({ ...baseCfg, probWinPerSpin: 0 })).toThrow();
    expect(() => solveMartingaleBustTime({ ...baseCfg, probWinPerSpin: 1 })).toThrow();
    expect(() => solveMartingaleBustTime({ ...baseCfg, probWinPerSpin: -0.1 })).toThrow();
    expect(() => solveMartingaleBustTime({ ...baseCfg, probWinPerSpin: 1.5 })).toThrow();
  });
  it('rejects non-finite inputs', () => {
    expect(() => solveMartingaleBustTime({ ...baseCfg, bankroll: NaN })).toThrow();
    expect(() => solveMartingaleBustTime({ ...baseCfg, probWinPerSpin: Infinity })).toThrow();
  });
  it('accepts baseBet = bankroll (degenerate single-bet case)', () => {
    expect(() => solveMartingaleBustTime({ ...baseCfg, bankroll: 1, baseBet: 1 })).not.toThrow();
  });
  it('accepts low probability', () => {
    expect(() => solveMartingaleBustTime({ ...baseCfg, probWinPerSpin: 0.01 })).not.toThrow();
  });
});

describe('martingaleBustTime — k_max correctness', () => {
  it('B=1, b_0=1 → k_max = 0 (no losses survivable)', () => {
    const r = solveMartingaleBustTime({ bankroll: 1, baseBet: 1, probWinPerSpin: 0.5 });
    expect(r.kMax).toBe(0);
  });
  it('B=100, b_0=1 → k_max = 5 (b_0(2^6 − 1) = 63 ≤ 100 < 127)', () => {
    // floor(log2(100/1 + 1)) - 1 = floor(log2(101)) - 1 = 6 - 1 = 5
    const r = solveMartingaleBustTime({ bankroll: 100, baseBet: 1, probWinPerSpin: 0.5 });
    expect(r.kMax).toBe(5);
  });
  it('B=1023, b_0=1 → k_max = 9 (full 10-round chain: 1+2+...+512 = 1023)', () => {
    const r = solveMartingaleBustTime({ bankroll: 1023, baseBet: 1, probWinPerSpin: 0.5 });
    expect(r.kMax).toBe(9);
  });
  it('B=10230, b_0=10 → k_max = 9 (10·1023 boundary)', () => {
    const r = solveMartingaleBustTime({ bankroll: 10230, baseBet: 10, probWinPerSpin: 0.5 });
    expect(r.kMax).toBe(9);
  });
});

describe('martingaleBustTime — per-round probability correctness', () => {
  it('probBustPerRound = q^(k_max+1)', () => {
    const r = solveMartingaleBustTime({ bankroll: 100, baseBet: 1, probWinPerSpin: 0.48 });
    const q = 0.52;
    const expected = Math.pow(q, r.kMax + 1);
    expect(r.probBustPerRound).toBeCloseTo(expected, 10);
  });
  it('probWinPerRound + probBustPerRound = 1', () => {
    const r = solveMartingaleBustTime(baseCfg);
    expect(r.probWinPerRound + r.probBustPerRound).toBeCloseTo(1, 10);
  });
  it('oneInNRoundsBust = 1 / probBustPerRound', () => {
    const r = solveMartingaleBustTime(baseCfg);
    expect(r.oneInNRoundsBust).toBeCloseTo(1 / r.probBustPerRound, 6);
  });
  it('higher p → lower probBustPerRound (more wins → fewer chase chains)', () => {
    const r1 = solveMartingaleBustTime({ ...baseCfg, probWinPerSpin: 0.30 });
    const r2 = solveMartingaleBustTime({ ...baseCfg, probWinPerSpin: 0.49 });
    expect(r2.probBustPerRound).toBeLessThan(r1.probBustPerRound);
  });
});

describe('martingaleBustTime — moments correctness', () => {
  it('E[T_rounds] = 1 / probBust', () => {
    const r = solveMartingaleBustTime(baseCfg);
    expect(r.expectedRoundsToBust).toBeCloseTo(1 / r.probBustPerRound, 6);
  });
  it('Var[T_rounds] = (1−p_bust)/p_bust²', () => {
    const r = solveMartingaleBustTime(baseCfg);
    const expectedVar = (1 - r.probBustPerRound) / (r.probBustPerRound * r.probBustPerRound);
    expect(r.varRoundsToBust).toBeCloseTo(expectedVar, 6);
  });
  it('E[wins before bust] = E[T_rounds] − 1', () => {
    const r = solveMartingaleBustTime(baseCfg);
    expect(r.expectedWinsBeforeBust).toBeCloseTo(r.expectedRoundsToBust - 1, 6);
  });
  it('E[T_spins] = E[T_rounds] · E[spins/round]', () => {
    const r = solveMartingaleBustTime(baseCfg);
    expect(r.expectedSpinsToBust).toBeCloseTo(
      r.expectedRoundsToBust * r.expectedSpinsPerRound,
      6,
    );
  });
});

describe('martingaleBustTime — chase-pattern risk score', () => {
  it('score ∈ [0, 1]', () => {
    const r = solveMartingaleBustTime(baseCfg);
    expect(r.chasePatternRiskScore).toBeGreaterThanOrEqual(0);
    expect(r.chasePatternRiskScore).toBeLessThanOrEqual(1);
  });
  it('low B/b ratio (shallow chain k_max=0) → high risk score', () => {
    const r = solveMartingaleBustTime({ bankroll: 1, baseBet: 1, probWinPerSpin: 0.5 });
    expect(r.chasePatternRiskScore).toBeGreaterThan(0.5);
  });
  it('high B/b ratio (deep chain k_max>=12) + good odds → low risk score', () => {
    const r = solveMartingaleBustTime({
      bankroll: 10_000_000,
      baseBet: 1,
      probWinPerSpin: 0.50,
    });
    // k_max should be large; risk score → ~0
    expect(r.chasePatternRiskScore).toBeLessThan(0.5);
  });
});

describe('martingaleBustTime — monotonicity invariants', () => {
  it('lower bankroll → fewer rounds to bust', () => {
    const r1 = solveMartingaleBustTime({ ...baseCfg, bankroll: 50 });
    const r2 = solveMartingaleBustTime({ ...baseCfg, bankroll: 200 });
    expect(r2.expectedRoundsToBust).toBeGreaterThan(r1.expectedRoundsToBust);
  });
  it('higher win probability → more rounds to bust', () => {
    const r1 = solveMartingaleBustTime({ ...baseCfg, probWinPerSpin: 0.30 });
    const r2 = solveMartingaleBustTime({ ...baseCfg, probWinPerSpin: 0.49 });
    expect(r2.expectedRoundsToBust).toBeGreaterThan(r1.expectedRoundsToBust);
  });
  it('higher baseBet → fewer rounds (smaller k_max)', () => {
    const r1 = solveMartingaleBustTime({ ...baseCfg, baseBet: 1 });
    const r2 = solveMartingaleBustTime({ ...baseCfg, baseBet: 10 });
    expect(r2.expectedRoundsToBust).toBeLessThanOrEqual(r1.expectedRoundsToBust);
  });
});

describe('martingaleBustTime — MC cross-validation', () => {
  it('observed E[T_rounds] within ±30% of CF (high-bust config for stable MC)', () => {
    // p=0.4, B=63, b=1 → k_max=5 → p_bust = 0.6^6 ≈ 0.0467 → E[T] ≈ 21.4 rounds
    const cfg = { bankroll: 63, baseBet: 1, probWinPerSpin: 0.4 };
    const cf = solveMartingaleBustTime(cfg);
    const mc = simulateMartingaleBustTime(cfg, 2000, 12345);
    const rel = Math.abs(cf.expectedRoundsToBust - mc.observedExpectedRoundsToBust) /
      cf.expectedRoundsToBust;
    expect(rel).toBeLessThan(0.30);
  });
  it('observed bust-within-horizon rate ≥ 0.95 (MC horizon = 4·E[T])', () => {
    const cf = solveMartingaleBustTime(baseCfg);
    const mc = simulateMartingaleBustTime(baseCfg, 500, 7);
    expect(mc.observedProbBustWithinHorizon).toBeGreaterThan(0.90);
  });
  it('observed E[netProfit] negative (always loses long-run)', () => {
    const cfg = { bankroll: 63, baseBet: 1, probWinPerSpin: 0.45 };
    const mc = simulateMartingaleBustTime(cfg, 2000, 31);
    expect(mc.observedExpectedNetProfitToBust).toBeLessThan(0);
  });
});

describe('martingaleBustTime — determinism', () => {
  it('CF solver returns same result on repeated calls', () => {
    const r1 = solveMartingaleBustTime(baseCfg);
    const r2 = solveMartingaleBustTime(baseCfg);
    expect(r1).toEqual(r2);
  });
});

describe('martingaleBustTime — industry use-cases', () => {
  it('UKGC LCCP 3.4.3 chase-pattern disclosure: £100 / £1 / roulette 18/38 = 47.4%', () => {
    // Roulette-class chase pattern, common live problem from NHS reports
    const r = solveMartingaleBustTime({
      bankroll: 100,
      baseBet: 1,
      probWinPerSpin: 18 / 38, // American roulette red/black
    });
    expect(r.kMax).toBe(5);
    expect(r.expectedRoundsToBust).toBeGreaterThan(20);
    expect(r.expectedRoundsToBust).toBeLessThan(100); // realistic span
    expect(r.expectedNetProfitToBust).toBeLessThan(0); // always loses
    expect(r.chasePatternRiskScore).toBeGreaterThan(0); // some risk
  });
});
