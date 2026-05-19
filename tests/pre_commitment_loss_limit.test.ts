/**
 * W226 — Pre-Commitment Loss-Limit Effectiveness Analyzer tests.
 *
 * 33 specs covering:
 *   - validation (9)
 *   - truncated-Normal expectation (4)
 *   - adherence blending (3)
 *   - probability hits limit (3)
 *   - harm reduction score (3)
 *   - annual projections (3)
 *   - AU NCPF §5.2 compliance (3)
 *   - monotonicity (3)
 *   - MC cross-validation (2)
 *   - determinism (1)
 *   - industry use-case (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solvePreCommitmentLossLimit,
  simulatePreCommitmentLossLimit,
} from '../src/features/preCommitmentLossLimit.js';

const baseCfg = {
  sessionLossMean: 30,    // £30 typical session loss
  sessionLossStd: 25,
  playerLossLimit: 50,    // £50 pre-commitment
  adherenceRate: 0.7,     // 70% respect limit
  limitEscalationFactor: 1.5,
  sessionsPerYear: 300,
  defaultDailyLimit: 50,
  coolingPeriodHours: 24,
};

describe('preCommitmentLossLimit — validation', () => {
  it('rejects sessionLossMean ≤ 0', () => {
    expect(() => solvePreCommitmentLossLimit({ ...baseCfg, sessionLossMean: 0 })).toThrow();
  });
  it('rejects sessionLossStd ≤ 0', () => {
    expect(() => solvePreCommitmentLossLimit({ ...baseCfg, sessionLossStd: 0 })).toThrow();
  });
  it('rejects playerLossLimit ≤ 0', () => {
    expect(() => solvePreCommitmentLossLimit({ ...baseCfg, playerLossLimit: 0 })).toThrow();
  });
  it('rejects adherenceRate out of (0, 1]', () => {
    expect(() => solvePreCommitmentLossLimit({ ...baseCfg, adherenceRate: 0 })).toThrow();
    expect(() => solvePreCommitmentLossLimit({ ...baseCfg, adherenceRate: 1.5 })).toThrow();
  });
  it('rejects limitEscalationFactor < 1', () => {
    expect(() =>
      solvePreCommitmentLossLimit({ ...baseCfg, limitEscalationFactor: 0.5 }),
    ).toThrow();
  });
  it('rejects sessionsPerYear ≤ 0', () => {
    expect(() => solvePreCommitmentLossLimit({ ...baseCfg, sessionsPerYear: 0 })).toThrow();
  });
  it('rejects defaultDailyLimit ≤ 0', () => {
    expect(() => solvePreCommitmentLossLimit({ ...baseCfg, defaultDailyLimit: 0 })).toThrow();
  });
  it('rejects coolingPeriodHours ≤ 0', () => {
    expect(() => solvePreCommitmentLossLimit({ ...baseCfg, coolingPeriodHours: 0 })).toThrow();
  });
  it('rejects non-finite values', () => {
    expect(() => solvePreCommitmentLossLimit({ ...baseCfg, sessionLossMean: NaN })).toThrow();
    expect(() => solvePreCommitmentLossLimit({ ...baseCfg, adherenceRate: Infinity })).toThrow();
  });
});

describe('preCommitmentLossLimit — truncated-Normal expectation', () => {
  it('limit → ∞: E[min(X, L)] → μ', () => {
    const r = solvePreCommitmentLossLimit({ ...baseCfg, playerLossLimit: 1e6 });
    expect(r.expectedLossWithLimit).toBeCloseTo(baseCfg.sessionLossMean, 0);
  });
  it('limit → 0: E[min(X, L)] → 0', () => {
    const r = solvePreCommitmentLossLimit({ ...baseCfg, playerLossLimit: 1e-6 });
    expect(r.expectedLossWithLimit).toBeLessThan(1e-3);
  });
  it('limit at μ: E[min(X, μ)] < μ (clipping reduces mean)', () => {
    const r = solvePreCommitmentLossLimit({ ...baseCfg, playerLossLimit: baseCfg.sessionLossMean });
    expect(r.expectedLossWithLimit).toBeLessThan(baseCfg.sessionLossMean);
  });
  it('escalated limit > original limit → larger E[min(X, γL)]', () => {
    const r = solvePreCommitmentLossLimit(baseCfg);
    expect(r.expectedLossEscalatedLimit).toBeGreaterThan(r.expectedLossWithLimit);
  });
});

describe('preCommitmentLossLimit — adherence blending', () => {
  it('α = 1: effective = expectedLossWithLimit', () => {
    const r = solvePreCommitmentLossLimit({ ...baseCfg, adherenceRate: 1 });
    expect(r.expectedLossEffective).toBeCloseTo(r.expectedLossWithLimit, 6);
  });
  it('α → 0: effective ≈ expectedLossEscalatedLimit', () => {
    const r = solvePreCommitmentLossLimit({ ...baseCfg, adherenceRate: 0.001 });
    expect(r.expectedLossEffective).toBeCloseTo(r.expectedLossEscalatedLimit, 1);
  });
  it('intermediate α: effective is α-blend', () => {
    const r = solvePreCommitmentLossLimit({ ...baseCfg, adherenceRate: 0.5 });
    const expected = 0.5 * r.expectedLossWithLimit + 0.5 * r.expectedLossEscalatedLimit;
    expect(r.expectedLossEffective).toBeCloseTo(expected, 6);
  });
});

describe('preCommitmentLossLimit — probability hits limit', () => {
  it('limit = μ: P ≈ 0.5', () => {
    const r = solvePreCommitmentLossLimit({ ...baseCfg, playerLossLimit: baseCfg.sessionLossMean });
    expect(r.probSessionHitsLimit).toBeCloseTo(0.5, 1);
  });
  it('limit >> μ: P → 0', () => {
    const r = solvePreCommitmentLossLimit({ ...baseCfg, playerLossLimit: 500 });
    expect(r.probSessionHitsLimit).toBeLessThan(0.01);
  });
  it('limit << μ: P → 1', () => {
    const r = solvePreCommitmentLossLimit({ ...baseCfg, playerLossLimit: 1 });
    expect(r.probSessionHitsLimit).toBeGreaterThan(0.85);
  });
});

describe('preCommitmentLossLimit — harm reduction', () => {
  it('∈ [0, 1]', () => {
    const r = solvePreCommitmentLossLimit(baseCfg);
    expect(r.harmReductionFromLimit).toBeGreaterThanOrEqual(0);
    expect(r.harmReductionFromLimit).toBeLessThanOrEqual(1);
  });
  it('no limit (large): harm reduction near 0', () => {
    const r = solvePreCommitmentLossLimit({ ...baseCfg, playerLossLimit: 1000 });
    expect(r.harmReductionFromLimit).toBeLessThan(0.1);
  });
  it('tight limit: substantial harm reduction', () => {
    const r = solvePreCommitmentLossLimit({ ...baseCfg, playerLossLimit: 10 });
    expect(r.harmReductionFromLimit).toBeGreaterThan(0.4);
  });
});

describe('preCommitmentLossLimit — annual projections', () => {
  it('expectedAnnualLossNoLimit = sessions · μ', () => {
    const r = solvePreCommitmentLossLimit(baseCfg);
    expect(r.expectedAnnualLossNoLimit).toBeCloseTo(
      baseCfg.sessionsPerYear * baseCfg.sessionLossMean,
      6,
    );
  });
  it('absoluteAnnualHarmReduction = noLimit − withLimit', () => {
    const r = solvePreCommitmentLossLimit(baseCfg);
    expect(r.absoluteAnnualHarmReduction).toBeCloseTo(
      r.expectedAnnualLossNoLimit - r.expectedAnnualLossWithLimit,
      6,
    );
  });
  it('expectedAnnualLimitBreachAttempts = sessions · (1 − α)', () => {
    const r = solvePreCommitmentLossLimit(baseCfg);
    expect(r.expectedAnnualLimitBreachAttempts).toBeCloseTo(
      baseCfg.sessionsPerYear * (1 - baseCfg.adherenceRate),
      6,
    );
  });
});

describe('preCommitmentLossLimit — AU NCPF §5.2 compliance', () => {
  it('true for AU defaults (A$50 limit, α≥0.5, 24h cooling)', () => {
    const r = solvePreCommitmentLossLimit(baseCfg);
    expect(r.isCompliantAuNcpfSection5).toBe(true);
  });
  it('false when default limit > A$50', () => {
    const r = solvePreCommitmentLossLimit({ ...baseCfg, defaultDailyLimit: 100 });
    expect(r.isCompliantAuNcpfSection5).toBe(false);
  });
  it('false when α < 0.5', () => {
    const r = solvePreCommitmentLossLimit({ ...baseCfg, adherenceRate: 0.3 });
    expect(r.isCompliantAuNcpfSection5).toBe(false);
  });
});

describe('preCommitmentLossLimit — monotonicity', () => {
  it('higher α → lower effective loss', () => {
    const a = solvePreCommitmentLossLimit({ ...baseCfg, adherenceRate: 0.3 });
    const b = solvePreCommitmentLossLimit({ ...baseCfg, adherenceRate: 0.9 });
    expect(b.expectedLossEffective).toBeLessThan(a.expectedLossEffective);
  });
  it('higher limit → higher effective loss (closer to μ)', () => {
    const a = solvePreCommitmentLossLimit({ ...baseCfg, playerLossLimit: 20 });
    const b = solvePreCommitmentLossLimit({ ...baseCfg, playerLossLimit: 200 });
    expect(b.expectedLossEffective).toBeGreaterThan(a.expectedLossEffective);
  });
  it('higher γ (escalation) → higher effective when α < 1', () => {
    const a = solvePreCommitmentLossLimit({ ...baseCfg, limitEscalationFactor: 1.0 });
    const b = solvePreCommitmentLossLimit({ ...baseCfg, limitEscalationFactor: 2.0 });
    expect(b.expectedLossEffective).toBeGreaterThan(a.expectedLossEffective);
  });
});

describe('preCommitmentLossLimit — MC cross-validation', () => {
  it('MC effective loss within 5% of CF', () => {
    const cf = solvePreCommitmentLossLimit(baseCfg);
    const mc = simulatePreCommitmentLossLimit(baseCfg, 12345, 20_000);
    const rel =
      Math.abs(mc.observedExpectedLossEffective - cf.expectedLossEffective) /
      cf.expectedLossEffective;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC P(hits limit) within 2pp of CF', () => {
    const cf = solvePreCommitmentLossLimit(baseCfg);
    const mc = simulatePreCommitmentLossLimit(baseCfg, 67890, 20_000);
    expect(Math.abs(mc.observedProbSessionHitsLimit - cf.probSessionHitsLimit)).toBeLessThan(0.02);
  });
});

describe('preCommitmentLossLimit — determinism', () => {
  it('same seed → identical MC', () => {
    const a = simulatePreCommitmentLossLimit(baseCfg, 42, 1000);
    const b = simulatePreCommitmentLossLimit(baseCfg, 42, 1000);
    expect(a.observedExpectedLossEffective).toBe(b.observedExpectedLossEffective);
  });
});

describe('preCommitmentLossLimit — industry use-case', () => {
  it('AU NCPF baseline + UK LCCP comparison', () => {
    const au = solvePreCommitmentLossLimit({
      ...baseCfg,
      defaultDailyLimit: 50,
      adherenceRate: 0.75,
    });
    expect(au.isCompliantAuNcpfSection5).toBe(true);
    expect(au.harmReductionFromLimit).toBeGreaterThan(0);
    expect(au.absoluteAnnualHarmReduction).toBeGreaterThan(0);
  });
});
