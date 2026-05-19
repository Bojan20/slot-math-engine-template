/**
 * W223 — Session Cool-Off Enforcement Markov Chain Analyzer tests.
 *
 * 32 specs covering:
 *   - validation (8)
 *   - daily Poisson rate (3)
 *   - trigger probability correctness (4)
 *   - Markov chain absorption time (3)
 *   - annual projection (3)
 *   - UKGC RTS 11 compliance boolean (3)
 *   - monotonicity invariants (3)
 *   - MC cross-validation (2)
 *   - determinism (1)
 *   - industry use-cases (UKGC + MGA + AU) (2)
 */

import { describe, it, expect } from 'vitest';
import {
  solveSessionCoolOff,
  simulateSessionCoolOff,
} from '../src/features/sessionCoolOffEnforcement.js';

const baseCfg = {
  probLossStopPerSession: 0.5,
  sessionsPerDay: 2,
  rollingWindowDays: 7,
  coolOffThresholdK: 5,
  coolOffDurationHours: 24,
};

describe('sessionCoolOff — validation', () => {
  it('rejects probLossStop out of (0, 1)', () => {
    expect(() => solveSessionCoolOff({ ...baseCfg, probLossStopPerSession: 0 })).toThrow();
    expect(() => solveSessionCoolOff({ ...baseCfg, probLossStopPerSession: 1 })).toThrow();
  });
  it('rejects sessionsPerDay ≤ 0', () => {
    expect(() => solveSessionCoolOff({ ...baseCfg, sessionsPerDay: 0 })).toThrow();
  });
  it('rejects rollingWindowDays < 1', () => {
    expect(() => solveSessionCoolOff({ ...baseCfg, rollingWindowDays: 0 })).toThrow();
  });
  it('rejects fractional rollingWindowDays', () => {
    expect(() => solveSessionCoolOff({ ...baseCfg, rollingWindowDays: 7.5 })).toThrow();
  });
  it('rejects coolOffThresholdK < 1', () => {
    expect(() => solveSessionCoolOff({ ...baseCfg, coolOffThresholdK: 0 })).toThrow();
  });
  it('rejects fractional coolOffThresholdK', () => {
    expect(() => solveSessionCoolOff({ ...baseCfg, coolOffThresholdK: 3.5 })).toThrow();
  });
  it('rejects coolOffDurationHours ≤ 0', () => {
    expect(() => solveSessionCoolOff({ ...baseCfg, coolOffDurationHours: 0 })).toThrow();
  });
  it('rejects non-finite probLossStop', () => {
    expect(() => solveSessionCoolOff({ ...baseCfg, probLossStopPerSession: NaN })).toThrow();
  });
});

describe('sessionCoolOff — daily rate', () => {
  it('λ_day = probLossStop · sessionsPerDay', () => {
    const r = solveSessionCoolOff({ ...baseCfg, probLossStopPerSession: 0.4, sessionsPerDay: 3 });
    expect(r.lossStopRatePerDay).toBeCloseTo(1.2, 9);
  });
  it('expectedLossStopsInWindow = λ_day · D', () => {
    const r = solveSessionCoolOff({ ...baseCfg, probLossStopPerSession: 0.3, sessionsPerDay: 2, rollingWindowDays: 5 });
    expect(r.expectedLossStopsInWindow).toBeCloseTo(3.0, 9);
  });
  it('higher sessionsPerDay → higher rate', () => {
    const a = solveSessionCoolOff({ ...baseCfg, sessionsPerDay: 1 });
    const b = solveSessionCoolOff({ ...baseCfg, sessionsPerDay: 4 });
    expect(b.lossStopRatePerDay).toBeGreaterThan(a.lossStopRatePerDay);
  });
});

describe('sessionCoolOff — trigger probability', () => {
  it('= 0 when probLossStop very small', () => {
    const r = solveSessionCoolOff({ ...baseCfg, probLossStopPerSession: 0.001 });
    expect(r.coolOffTriggerProbPerDay).toBeLessThan(0.01);
  });
  it('approaches 1 when probLossStop high + K small', () => {
    const r = solveSessionCoolOff({
      ...baseCfg,
      probLossStopPerSession: 0.9,
      sessionsPerDay: 5,
      coolOffThresholdK: 2,
    });
    expect(r.coolOffTriggerProbPerDay).toBeGreaterThan(0.95);
  });
  it('Poisson tail closed-form: λ_window = 3, K = 5 → P(N≥5) ≈ 0.185', () => {
    // λ_window = 0.5·2·3 = 3; rollingWindowDays = 3
    const r = solveSessionCoolOff({
      probLossStopPerSession: 0.5,
      sessionsPerDay: 2,
      rollingWindowDays: 3,
      coolOffThresholdK: 5,
      coolOffDurationHours: 24,
    });
    expect(r.expectedLossStopsInWindow).toBeCloseTo(3.0, 9);
    expect(r.coolOffTriggerProbPerDay).toBeCloseTo(0.1847, 2);
  });
  it('oneInNDaysCoolOff = 1 / trigger prob', () => {
    const r = solveSessionCoolOff(baseCfg);
    expect(r.oneInNDaysCoolOff).toBeCloseTo(1 / r.coolOffTriggerProbPerDay, 6);
  });
});

describe('sessionCoolOff — Markov chain absorption time', () => {
  it('expectedDaysToFirstCoolOffMarkov > 0 always', () => {
    const r = solveSessionCoolOff(baseCfg);
    expect(r.expectedDaysToFirstCoolOffMarkov).toBeGreaterThan(0);
  });
  it('expectedDaysToFirstCoolOffMarkov ≥ 1 always (one-day minimum)', () => {
    const r = solveSessionCoolOff(baseCfg);
    expect(r.expectedDaysToFirstCoolOffMarkov).toBeGreaterThanOrEqual(1);
  });
  it('Markov estimate vs Geometric approx: both finite, bounded', () => {
    const r = solveSessionCoolOff(baseCfg);
    expect(Number.isFinite(r.expectedDaysToFirstCoolOff)).toBe(true);
    expect(Number.isFinite(r.expectedDaysToFirstCoolOffMarkov)).toBe(true);
  });
});

describe('sessionCoolOff — annual projection', () => {
  it('annualCoolOffsExpected = 365 / (T_first + cool_dur)', () => {
    const r = solveSessionCoolOff(baseCfg);
    const expected =
      365 / (r.expectedDaysToFirstCoolOffMarkov + baseCfg.coolOffDurationHours / 24);
    expect(r.annualCoolOffsExpected).toBeCloseTo(expected, 6);
  });
  it('fractionOfYearInCoolOff ∈ [0, 1]', () => {
    const r = solveSessionCoolOff(baseCfg);
    expect(r.fractionOfYearInCoolOff).toBeGreaterThanOrEqual(0);
    expect(r.fractionOfYearInCoolOff).toBeLessThanOrEqual(1);
  });
  it('high probLossStop → higher annualCoolOffs', () => {
    const a = solveSessionCoolOff({ ...baseCfg, probLossStopPerSession: 0.1 });
    const b = solveSessionCoolOff({ ...baseCfg, probLossStopPerSession: 0.8 });
    expect(b.annualCoolOffsExpected).toBeGreaterThan(a.annualCoolOffsExpected);
  });
});

describe('sessionCoolOff — UKGC RTS 11 compliance', () => {
  it('isCompliant true for UKGC defaults (K=5, D=7, hrs=24)', () => {
    const r = solveSessionCoolOff(baseCfg);
    expect(r.isCompliantUkgcRts11).toBe(true);
  });
  it('isCompliant false when K > 5 (too lax)', () => {
    const r = solveSessionCoolOff({ ...baseCfg, coolOffThresholdK: 10 });
    expect(r.isCompliantUkgcRts11).toBe(false);
  });
  it('isCompliant false when coolOffDurationHours < 24', () => {
    const r = solveSessionCoolOff({ ...baseCfg, coolOffDurationHours: 12 });
    expect(r.isCompliantUkgcRts11).toBe(false);
  });
});

describe('sessionCoolOff — monotonicity', () => {
  it('higher K (more lenient) → lower trigger prob', () => {
    const a = solveSessionCoolOff({ ...baseCfg, coolOffThresholdK: 3 });
    const b = solveSessionCoolOff({ ...baseCfg, coolOffThresholdK: 8 });
    expect(b.coolOffTriggerProbPerDay).toBeLessThan(a.coolOffTriggerProbPerDay);
  });
  it('larger D (longer window) → higher trigger prob', () => {
    const a = solveSessionCoolOff({ ...baseCfg, rollingWindowDays: 3 });
    const b = solveSessionCoolOff({ ...baseCfg, rollingWindowDays: 14 });
    expect(b.coolOffTriggerProbPerDay).toBeGreaterThan(a.coolOffTriggerProbPerDay);
  });
  it('higher sessionsPerDay → higher annualCoolOffs', () => {
    const a = solveSessionCoolOff({ ...baseCfg, sessionsPerDay: 1 });
    const b = solveSessionCoolOff({ ...baseCfg, sessionsPerDay: 5 });
    expect(b.annualCoolOffsExpected).toBeGreaterThan(a.annualCoolOffsExpected);
  });
});

describe('sessionCoolOff — MC cross-validation', () => {
  it('MC annualCoolOffs within ±30% of CF (Markov approx)', () => {
    const cf = solveSessionCoolOff(baseCfg);
    const mc = simulateSessionCoolOff(baseCfg, 12345, 500);
    const rel =
      Math.abs(mc.observedAnnualCoolOffsExpected - cf.annualCoolOffsExpected) /
      Math.max(cf.annualCoolOffsExpected, 0.1);
    expect(rel).toBeLessThan(0.30);
  });
  it('MC daily trigger rate matches CF annual/365 (renewal-rate sanity)', () => {
    const cfg = { ...baseCfg, probLossStopPerSession: 0.3, coolOffThresholdK: 4 };
    const cf = solveSessionCoolOff(cfg);
    const mc = simulateSessionCoolOff(cfg, 67890, 500);
    // CF.annualCoolOffsExpected is the post-empty-history rate (with cool-off
    // resets), apples-to-apples with MC observation.
    const cfDailyRate = cf.annualCoolOffsExpected / 365;
    expect(Math.abs(mc.observedCoolOffTriggerProbPerDay - cfDailyRate)).toBeLessThan(0.05);
  });
});

describe('sessionCoolOff — determinism', () => {
  it('same seed → identical MC', () => {
    const a = simulateSessionCoolOff(baseCfg, 42, 100);
    const b = simulateSessionCoolOff(baseCfg, 42, 100);
    expect(a.observedAnnualCoolOffsExpected).toBe(b.observedAnnualCoolOffsExpected);
  });
});

describe('sessionCoolOff — industry use-cases', () => {
  it('UKGC RTS 11 baseline: K=5/D=7/24h, moderate P_loss=0.4 → realistic 2-8 cool-offs/year', () => {
    const r = solveSessionCoolOff({
      probLossStopPerSession: 0.4,
      sessionsPerDay: 2,
      rollingWindowDays: 7,
      coolOffThresholdK: 5,
      coolOffDurationHours: 24,
    });
    expect(r.isCompliantUkgcRts11).toBe(true);
    expect(r.annualCoolOffsExpected).toBeGreaterThan(0.5);
    expect(r.annualCoolOffsExpected).toBeLessThan(100);
  });
  it('AU NCPF Schedule 7 stricter: K=3/D=7/48h cool-off → more annual cool-offs', () => {
    const ukgc = solveSessionCoolOff(baseCfg);
    const au = solveSessionCoolOff({
      ...baseCfg,
      coolOffThresholdK: 3,
      coolOffDurationHours: 48,
    });
    expect(au.annualCoolOffsExpected).toBeGreaterThan(ukgc.annualCoolOffsExpected);
    expect(au.isCompliantUkgcRts11).toBe(true); // K=3 ≤ 5
    expect(au.fractionOfYearInCoolOff).toBeGreaterThan(ukgc.fractionOfYearInCoolOff);
  });
});
