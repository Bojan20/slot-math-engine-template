/**
 * W152 Wave 165 — Reverse Martingale (Paroli) Streak Cash-Out Analyzer tests.
 *
 * 30 specs covering:
 *   - validation (7)
 *   - effective target / bankroll cap (3)
 *   - probability correctness (4)
 *   - moments correctness (4)
 *   - risk/reward + chase score (3)
 *   - monotonicity invariants (3)
 *   - MC cross-validation (4)
 *   - determinism (1)
 *   - industry use-case (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveParoliStreakCashOut,
  simulateParoliStreakCashOut,
} from '../src/features/paroliStreakCashOut.js';

const baseCfg = {
  bankroll: 1000,
  baseBet: 1,
  probWinPerSpin: 0.48,
  targetStreak: 3,
};

describe('paroliStreakCashOut — validation', () => {
  it('rejects bankroll ≤ 0', () => {
    expect(() => solveParoliStreakCashOut({ ...baseCfg, bankroll: 0 })).toThrow();
  });
  it('rejects baseBet ≤ 0', () => {
    expect(() => solveParoliStreakCashOut({ ...baseCfg, baseBet: 0 })).toThrow();
  });
  it('rejects baseBet > bankroll', () => {
    expect(() => solveParoliStreakCashOut({ ...baseCfg, baseBet: 2000 })).toThrow();
  });
  it('rejects probWinPerSpin ≤ 0 or ≥ 1', () => {
    expect(() => solveParoliStreakCashOut({ ...baseCfg, probWinPerSpin: 0 })).toThrow();
    expect(() => solveParoliStreakCashOut({ ...baseCfg, probWinPerSpin: 1 })).toThrow();
  });
  it('rejects targetStreak < 1 or non-integer', () => {
    expect(() => solveParoliStreakCashOut({ ...baseCfg, targetStreak: 0 })).toThrow();
    expect(() => solveParoliStreakCashOut({ ...baseCfg, targetStreak: 2.5 })).toThrow();
  });
  it('rejects non-finite inputs', () => {
    expect(() => solveParoliStreakCashOut({ ...baseCfg, probWinPerSpin: NaN })).toThrow();
  });
  it('accepts targetStreak = 1 (degenerate single-win cash-out)', () => {
    expect(() => solveParoliStreakCashOut({ ...baseCfg, targetStreak: 1 })).not.toThrow();
  });
});

describe('paroliStreakCashOut — effective target / bankroll cap', () => {
  it('large bankroll: effectiveTargetStreak = targetStreak (no cap)', () => {
    const r = solveParoliStreakCashOut({ ...baseCfg, bankroll: 10000, targetStreak: 5 });
    expect(r.effectiveTargetStreak).toBe(5);
    expect(r.cappedByBankroll).toBe(false);
  });
  it('small bankroll: effective capped, cappedByBankroll=true', () => {
    // B=3, b=1 → ratio=3, log2(4)=2 → k_max=2
    const r = solveParoliStreakCashOut({ bankroll: 3, baseBet: 1, probWinPerSpin: 0.5, targetStreak: 10 });
    expect(r.effectiveTargetStreak).toBe(2);
    expect(r.cappedByBankroll).toBe(true);
  });
  it('cashOutPayout = b_0·(2^k − 1)', () => {
    const r = solveParoliStreakCashOut(baseCfg);
    expect(r.cashOutPayout).toBe(1 * (Math.pow(2, 3) - 1));
  });
});

describe('paroliStreakCashOut — probability correctness', () => {
  it('probReachStreak = p^k', () => {
    const r = solveParoliStreakCashOut(baseCfg);
    expect(r.probReachStreak).toBeCloseTo(Math.pow(0.48, 3), 10);
  });
  it('oneInNRoundsCashOut = 1 / probReachStreak', () => {
    const r = solveParoliStreakCashOut(baseCfg);
    expect(r.oneInNRoundsCashOut).toBeCloseTo(1 / r.probReachStreak, 6);
  });
  it('higher p → higher probReachStreak', () => {
    const r1 = solveParoliStreakCashOut({ ...baseCfg, probWinPerSpin: 0.30 });
    const r2 = solveParoliStreakCashOut({ ...baseCfg, probWinPerSpin: 0.55 });
    expect(r2.probReachStreak).toBeGreaterThan(r1.probReachStreak);
  });
  it('deeper streak → lower probReachStreak', () => {
    const r1 = solveParoliStreakCashOut({ ...baseCfg, targetStreak: 2 });
    const r2 = solveParoliStreakCashOut({ ...baseCfg, targetStreak: 5 });
    expect(r2.probReachStreak).toBeLessThan(r1.probReachStreak);
  });
});

describe('paroliStreakCashOut — moments correctness', () => {
  it('Var ≥ 0 always', () => {
    const r = solveParoliStreakCashOut(baseCfg);
    expect(r.varianceRoundProfit).toBeGreaterThanOrEqual(0);
    expect(r.stdDevRoundProfit).toBeGreaterThanOrEqual(0);
  });
  it('E[roundProfit] < 0 for house-edge config (p<0.5)', () => {
    const r = solveParoliStreakCashOut({ ...baseCfg, probWinPerSpin: 0.45 });
    expect(r.expectedRoundProfit).toBeLessThan(0);
  });
  it('E[roundProfit] > 0 for player-edge config (p>0.55)', () => {
    const r = solveParoliStreakCashOut({ ...baseCfg, probWinPerSpin: 0.60 });
    expect(r.expectedRoundProfit).toBeGreaterThan(0);
  });
  it('probRoundProfitNonNegative = probReachStreak', () => {
    const r = solveParoliStreakCashOut(baseCfg);
    expect(r.probRoundProfitNonNegative).toBeCloseTo(r.probReachStreak, 10);
  });
});

describe('paroliStreakCashOut — risk/reward + chase score', () => {
  it('riskRewardRatio > 0', () => {
    const r = solveParoliStreakCashOut(baseCfg);
    expect(r.riskRewardRatio).toBeGreaterThan(0);
  });
  it('chasePatternRiskScore ∈ [0, 1]', () => {
    const r = solveParoliStreakCashOut(baseCfg);
    expect(r.chasePatternRiskScore).toBeGreaterThanOrEqual(0);
    expect(r.chasePatternRiskScore).toBeLessThanOrEqual(1);
  });
  it('deeper streak + higher p → higher chase risk score', () => {
    const r1 = solveParoliStreakCashOut({ bankroll: 1000, baseBet: 1, probWinPerSpin: 0.45, targetStreak: 2 });
    const r2 = solveParoliStreakCashOut({ bankroll: 1000, baseBet: 1, probWinPerSpin: 0.60, targetStreak: 8 });
    expect(r2.chasePatternRiskScore).toBeGreaterThan(r1.chasePatternRiskScore);
  });
});

describe('paroliStreakCashOut — monotonicity invariants', () => {
  it('higher p → higher E[roundProfit]', () => {
    const r1 = solveParoliStreakCashOut({ ...baseCfg, probWinPerSpin: 0.40 });
    const r2 = solveParoliStreakCashOut({ ...baseCfg, probWinPerSpin: 0.55 });
    expect(r2.expectedRoundProfit).toBeGreaterThan(r1.expectedRoundProfit);
  });
  it('deeper streak → higher cashOutPayout', () => {
    const r1 = solveParoliStreakCashOut({ ...baseCfg, targetStreak: 2 });
    const r2 = solveParoliStreakCashOut({ ...baseCfg, targetStreak: 5 });
    expect(r2.cashOutPayout).toBeGreaterThan(r1.cashOutPayout);
  });
  it('larger baseBet → larger Var (variance scales b²)', () => {
    const r1 = solveParoliStreakCashOut({ ...baseCfg, baseBet: 1 });
    const r2 = solveParoliStreakCashOut({ ...baseCfg, baseBet: 5 });
    expect(r2.varianceRoundProfit).toBeGreaterThan(r1.varianceRoundProfit);
  });
});

describe('paroliStreakCashOut — MC cross-validation', () => {
  it('observed probReachStreak within ±2pp of CF', () => {
    const cf = solveParoliStreakCashOut(baseCfg);
    const mc = simulateParoliStreakCashOut(baseCfg, 5000, 12345);
    expect(Math.abs(mc.observedProbReachStreak - cf.probReachStreak)).toBeLessThan(0.02);
  });
  it('observed E[roundProfit] within ±25% of CF (player-edge config)', () => {
    const cfg = { ...baseCfg, probWinPerSpin: 0.55 };
    const cf = solveParoliStreakCashOut(cfg);
    const mc = simulateParoliStreakCashOut(cfg, 5000, 7);
    const rel = Math.abs(cf.expectedRoundProfit - mc.observedExpectedRoundProfit) /
      Math.max(Math.abs(cf.expectedRoundProfit), 0.1);
    expect(rel).toBeLessThan(0.30);
  });
  it('observed E[spins/round] within ±10% of CF', () => {
    const cf = solveParoliStreakCashOut(baseCfg);
    const mc = simulateParoliStreakCashOut(baseCfg, 5000, 31);
    const rel = Math.abs(cf.expectedSpinsPerRound - mc.observedExpectedSpinsPerRound) /
      cf.expectedSpinsPerRound;
    expect(rel).toBeLessThan(0.10);
  });
  it('observed stdDev > 0 (positive variance verified)', () => {
    const mc = simulateParoliStreakCashOut(baseCfg, 2000, 99);
    expect(mc.observedStdDevRoundProfit).toBeGreaterThan(0);
  });
});

describe('paroliStreakCashOut — determinism', () => {
  it('CF solver returns same result on repeated calls', () => {
    const r1 = solveParoliStreakCashOut(baseCfg);
    const r2 = solveParoliStreakCashOut(baseCfg);
    expect(r1).toEqual(r2);
  });
});

describe('paroliStreakCashOut — industry use-cases', () => {
  it('UKGC LCCP let-it-ride 3 wins target on roulette R/B (47.4%)', () => {
    const r = solveParoliStreakCashOut({
      bankroll: 100,
      baseBet: 1,
      probWinPerSpin: 18 / 38,
      targetStreak: 3,
    });
    expect(r.effectiveTargetStreak).toBe(3);
    expect(r.probReachStreak).toBeCloseTo(Math.pow(18 / 38, 3), 10);
    expect(r.probReachStreak).toBeGreaterThan(0.10);
    expect(r.probReachStreak).toBeLessThan(0.12);
    expect(r.cashOutPayout).toBe(7); // 2^3 - 1
    // House-edge → E[roundProfit] < 0
    expect(r.expectedRoundProfit).toBeLessThan(0);
  });
});
