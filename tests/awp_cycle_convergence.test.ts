/**
 * W152 Wave 167 — AWP Cycle Convergence Analyzer tests.
 *
 * 30 specs covering:
 *   - validation (8)
 *   - cycle progress + RTP correctness (4)
 *   - deviation moments (4)
 *   - tolerance probability + 1-in-N (3)
 *   - compensation hint + max deviation envelope (3)
 *   - monotonicity invariants (3)
 *   - MC cross-validation (3)
 *   - determinism (1)
 *   - industry use-case (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveAwpCycleConvergence,
  simulateAwpCycleConvergence,
} from '../src/features/awpCycleConvergence.js';

// UK B3 AWP baseline: N=10000, b=£1, R*=70%, tolerance 4pp, σ=3, mid-cycle
const baseCfg = {
  cycleLengthSpins: 10000,
  baseBet: 1,
  targetRtp: 0.70,
  toleranceAbs: 0.04,
  payoutStdDevPerBet: 3,
  spinsPlayed: 5000,
  cumulativePayout: 3450, // realised RTP = 69% so far (slightly under target)
};

describe('awpCycleConvergence — validation', () => {
  it('rejects cycleLengthSpins ≤ 0 or non-integer', () => {
    expect(() => solveAwpCycleConvergence({ ...baseCfg, cycleLengthSpins: 0 })).toThrow();
    expect(() => solveAwpCycleConvergence({ ...baseCfg, cycleLengthSpins: 1.5 })).toThrow();
  });
  it('rejects baseBet ≤ 0', () => {
    expect(() => solveAwpCycleConvergence({ ...baseCfg, baseBet: 0 })).toThrow();
  });
  it('rejects targetRtp outside [0, 1.5]', () => {
    expect(() => solveAwpCycleConvergence({ ...baseCfg, targetRtp: -0.1 })).toThrow();
    expect(() => solveAwpCycleConvergence({ ...baseCfg, targetRtp: 2 })).toThrow();
  });
  it('rejects toleranceAbs ≤ 0 or > 1', () => {
    expect(() => solveAwpCycleConvergence({ ...baseCfg, toleranceAbs: 0 })).toThrow();
    expect(() => solveAwpCycleConvergence({ ...baseCfg, toleranceAbs: 1.5 })).toThrow();
  });
  it('rejects payoutStdDevPerBet < 0', () => {
    expect(() => solveAwpCycleConvergence({ ...baseCfg, payoutStdDevPerBet: -1 })).toThrow();
  });
  it('rejects spinsPlayed > cycleLengthSpins', () => {
    expect(() => solveAwpCycleConvergence({ ...baseCfg, spinsPlayed: 20000 })).toThrow();
  });
  it('rejects cumulativePayout < 0', () => {
    expect(() => solveAwpCycleConvergence({ ...baseCfg, cumulativePayout: -1 })).toThrow();
  });
  it('accepts spinsPlayed=0 (cycle start)', () => {
    const r = solveAwpCycleConvergence({ ...baseCfg, spinsPlayed: 0, cumulativePayout: 0 });
    expect(Number.isNaN(r.realisedRtpCurrent)).toBe(true);
    expect(r.deviationCurrent).toBe(0);
    expect(r.cycleProgressFraction).toBe(0);
  });
});

describe('awpCycleConvergence — cycle progress + RTP correctness', () => {
  it('cycleProgressFraction = n/N', () => {
    const r = solveAwpCycleConvergence(baseCfg);
    expect(r.cycleProgressFraction).toBeCloseTo(0.5, 10);
  });
  it('spinsRemaining = N − n', () => {
    const r = solveAwpCycleConvergence(baseCfg);
    expect(r.spinsRemaining).toBe(5000);
  });
  it('realisedRtpCurrent = P_n / B_n', () => {
    const r = solveAwpCycleConvergence(baseCfg);
    expect(r.realisedRtpCurrent).toBeCloseTo(3450 / 5000, 10);
  });
  it('expectedFinalRtp = (P_n + m·R*·b) / (N·b)', () => {
    const r = solveAwpCycleConvergence(baseCfg);
    const expected = (3450 + 5000 * 0.70 * 1) / (10000 * 1);
    expect(r.expectedFinalRtp).toBeCloseTo(expected, 10);
  });
});

describe('awpCycleConvergence — deviation moments', () => {
  it('stdDevFinalRtp = σ·√m / N', () => {
    const r = solveAwpCycleConvergence(baseCfg);
    const expected = (3 * Math.sqrt(5000)) / 10000;
    expect(r.stdDevFinalRtp).toBeCloseTo(expected, 10);
  });
  it('stdDevFinalRtp shrinks as cycle progresses', () => {
    const r1 = solveAwpCycleConvergence({ ...baseCfg, spinsPlayed: 1000, cumulativePayout: 700 });
    const r2 = solveAwpCycleConvergence({ ...baseCfg, spinsPlayed: 9000, cumulativePayout: 6300 });
    expect(r2.stdDevFinalRtp).toBeLessThan(r1.stdDevFinalRtp);
  });
  it('stdDevFinalRtp = 0 at cycle end (n=N)', () => {
    const r = solveAwpCycleConvergence({ ...baseCfg, spinsPlayed: 10000, cumulativePayout: 7000 });
    expect(r.stdDevFinalRtp).toBe(0);
  });
  it('meanDeviationFinal = expectedFinalRtp − targetRtp', () => {
    const r = solveAwpCycleConvergence(baseCfg);
    expect(r.meanDeviationFinal).toBeCloseTo(r.expectedFinalRtp - 0.70, 10);
  });
});

describe('awpCycleConvergence — tolerance probability', () => {
  it('probExceedsToleranceAtEnd ∈ [0, 1]', () => {
    const r = solveAwpCycleConvergence(baseCfg);
    expect(r.probExceedsToleranceAtEnd).toBeGreaterThanOrEqual(0);
    expect(r.probExceedsToleranceAtEnd).toBeLessThanOrEqual(1);
  });
  it('oneInNCyclesExceeds = 1 / probExceeds', () => {
    const r = solveAwpCycleConvergence(baseCfg);
    expect(r.oneInNCyclesExceeds).toBeCloseTo(1 / r.probExceedsToleranceAtEnd, 6);
  });
  it('probExceeds = 1 at cycle end if outside band', () => {
    const r = solveAwpCycleConvergence({
      ...baseCfg,
      spinsPlayed: 10000,
      cumulativePayout: 1000, // realised RTP = 10%, way below 70% target ± 4%
    });
    expect(r.probExceedsToleranceAtEnd).toBe(1);
  });
});

describe('awpCycleConvergence — compensation hint + max deviation', () => {
  it('compensationHintRecommended = −meanDeviationFinal', () => {
    const r = solveAwpCycleConvergence(baseCfg);
    expect(r.compensationHintRecommended).toBeCloseTo(-r.meanDeviationFinal, 10);
  });
  it('maxAchievableDeviationNoCompensation = |mean| + 3·std', () => {
    const r = solveAwpCycleConvergence(baseCfg);
    const expected = Math.abs(r.meanDeviationFinal) + 3 * r.stdDevFinalRtp;
    expect(r.maxAchievableDeviationNoCompensation).toBeCloseTo(expected, 10);
  });
  it('cycleHealthScore = 1 − probExceeds', () => {
    const r = solveAwpCycleConvergence(baseCfg);
    expect(r.cycleHealthScore).toBeCloseTo(1 - r.probExceedsToleranceAtEnd, 10);
  });
});

describe('awpCycleConvergence — monotonicity', () => {
  it('larger σ → larger stdDevFinalRtp', () => {
    const r1 = solveAwpCycleConvergence({ ...baseCfg, payoutStdDevPerBet: 2 });
    const r2 = solveAwpCycleConvergence({ ...baseCfg, payoutStdDevPerBet: 6 });
    expect(r2.stdDevFinalRtp).toBeGreaterThan(r1.stdDevFinalRtp);
  });
  it('tighter tolerance → higher probExceeds', () => {
    const r1 = solveAwpCycleConvergence({ ...baseCfg, toleranceAbs: 0.05 });
    const r2 = solveAwpCycleConvergence({ ...baseCfg, toleranceAbs: 0.01 });
    expect(r2.probExceedsToleranceAtEnd).toBeGreaterThan(r1.probExceedsToleranceAtEnd);
  });
  it('larger deviation → larger compensation hint magnitude', () => {
    const r1 = solveAwpCycleConvergence({ ...baseCfg, cumulativePayout: 3500 }); // RTP=70%, no deviation
    const r2 = solveAwpCycleConvergence({ ...baseCfg, cumulativePayout: 2500 }); // RTP=50%, big drift
    expect(Math.abs(r2.compensationHintRecommended)).toBeGreaterThan(Math.abs(r1.compensationHintRecommended));
  });
});

describe('awpCycleConvergence — MC cross-validation', () => {
  it('observed E[finalRTP] within ±0.5pp of CF (5K cycles)', () => {
    const cf = solveAwpCycleConvergence(baseCfg);
    const mc = simulateAwpCycleConvergence(baseCfg, 5000, 12345);
    expect(Math.abs(cf.expectedFinalRtp - mc.observedExpectedFinalRtp)).toBeLessThan(0.005);
  });
  it('observed stdDev within ±20% of CF', () => {
    const cf = solveAwpCycleConvergence(baseCfg);
    const mc = simulateAwpCycleConvergence(baseCfg, 5000, 7);
    const rel = Math.abs(cf.stdDevFinalRtp - mc.observedStdDevFinalRtp) / cf.stdDevFinalRtp;
    expect(rel).toBeLessThan(0.20);
  });
  it('observed probExceeds within ±3pp of CF', () => {
    const cf = solveAwpCycleConvergence(baseCfg);
    const mc = simulateAwpCycleConvergence(baseCfg, 5000, 31);
    expect(Math.abs(cf.probExceedsToleranceAtEnd - mc.observedProbExceedsToleranceAtEnd)).toBeLessThan(0.03);
  });
});

describe('awpCycleConvergence — determinism', () => {
  it('CF solver returns same result on repeated calls', () => {
    const r1 = solveAwpCycleConvergence(baseCfg);
    const r2 = solveAwpCycleConvergence(baseCfg);
    expect(r1).toEqual(r2);
  });
});

describe('awpCycleConvergence — industry use-case', () => {
  it('UK B3 AWP mid-cycle: target 70%, currently 69%, project to end', () => {
    const r = solveAwpCycleConvergence(baseCfg);
    // realised 69% so far, target 70% → small drift, small projected deviation
    expect(r.realisedRtpCurrent).toBeCloseTo(0.69, 4);
    expect(Math.abs(r.meanDeviationFinal)).toBeLessThan(0.01);
    expect(r.withinToleranceCurrent).toBe(true);
    // With σ=3 and m=5000, std ≈ 3·√5000/10000 ≈ 0.0212 → P(|D|>0.04) modest
    expect(r.probExceedsToleranceAtEnd).toBeGreaterThan(0);
    expect(r.probExceedsToleranceAtEnd).toBeLessThan(0.5);
  });
});
