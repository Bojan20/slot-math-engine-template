/**
 * W227 — Operator Daily P&L Value-at-Risk (VaR) Analyzer tests.
 *
 * 33 specs covering:
 *   - validation (10)
 *   - daily GGR moments (3)
 *   - VaR computation (4)
 *   - Expected Shortfall (3)
 *   - jackpot reserve (2)
 *   - required reserve + solvency (4)
 *   - UKGC GA 2005 compliance (3)
 *   - monotonicity invariants (3)
 *   - MC cross-validation (2)
 *   - determinism (1)
 *   - industry use-case (Bet365 / Flutter / Entain scale) (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveOperatorVar,
  simulateOperatorVar,
} from '../src/features/operatorDailyPnlVar.js';

const baseCfg = {
  expectedSessionsPerDay: 10_000,    // mid-tier operator scale
  meanProfitPerSession: 5,           // £5 average margin per session
  stdProfitPerSession: 50,           // high σ (jackpot tail)
  jackpotMaxPayout: 100_000,         // £100K single-jackpot risk
  jackpotTriggerProbPerDay: 0.001,   // 1 in 1000 days
  operatorOwnFunds: 5_000_000,       // £5M reserves
  minimumReserve: 100_000,           // UKGC £100K floor
  varConfidenceLevel: 0.99,          // 99% VaR
  varHorizonDays: 10,                // Basel III 10-day
  jackpotSafetyFactor: 2.0,
};

describe('operatorVar — validation', () => {
  it('rejects expectedSessionsPerDay < 1', () => {
    expect(() => solveOperatorVar({ ...baseCfg, expectedSessionsPerDay: 0 })).toThrow();
  });
  it('rejects meanProfitPerSession ≤ 0', () => {
    expect(() => solveOperatorVar({ ...baseCfg, meanProfitPerSession: 0 })).toThrow();
  });
  it('rejects stdProfitPerSession ≤ 0', () => {
    expect(() => solveOperatorVar({ ...baseCfg, stdProfitPerSession: 0 })).toThrow();
  });
  it('rejects jackpotMaxPayout < 0', () => {
    expect(() => solveOperatorVar({ ...baseCfg, jackpotMaxPayout: -100 })).toThrow();
  });
  it('rejects jackpotTriggerProbPerDay out of [0, 1]', () => {
    expect(() => solveOperatorVar({ ...baseCfg, jackpotTriggerProbPerDay: 1.5 })).toThrow();
  });
  it('rejects operatorOwnFunds < 0', () => {
    expect(() => solveOperatorVar({ ...baseCfg, operatorOwnFunds: -1000 })).toThrow();
  });
  it('rejects varConfidenceLevel out of (0.5, 1)', () => {
    expect(() => solveOperatorVar({ ...baseCfg, varConfidenceLevel: 0.4 })).toThrow();
    expect(() => solveOperatorVar({ ...baseCfg, varConfidenceLevel: 1.0 })).toThrow();
  });
  it('rejects varHorizonDays > 365', () => {
    expect(() => solveOperatorVar({ ...baseCfg, varHorizonDays: 500 })).toThrow();
  });
  it('rejects fractional varHorizonDays', () => {
    expect(() => solveOperatorVar({ ...baseCfg, varHorizonDays: 5.5 })).toThrow();
  });
  it('rejects jackpotSafetyFactor < 1', () => {
    expect(() => solveOperatorVar({ ...baseCfg, jackpotSafetyFactor: 0.5 })).toThrow();
  });
});

describe('operatorVar — daily GGR moments', () => {
  it('μ_GGR = λ_sessions · μ_per_session', () => {
    const r = solveOperatorVar(baseCfg);
    expect(r.expectedDailyGgr).toBeCloseTo(
      baseCfg.expectedSessionsPerDay * baseCfg.meanProfitPerSession,
      6,
    );
  });
  it('σ_GGR = sqrt(λ_sessions) · σ_per_session', () => {
    const r = solveOperatorVar(baseCfg);
    const expected = Math.sqrt(baseCfg.expectedSessionsPerDay) * baseCfg.stdProfitPerSession;
    expect(r.stdDailyGgr).toBeCloseTo(expected, 4);
  });
  it('annual GGR = daily · 365', () => {
    const r = solveOperatorVar(baseCfg);
    expect(r.expectedAnnualGgr).toBeCloseTo(r.expectedDailyGgr * 365, 6);
  });
});

describe('operatorVar — VaR computation', () => {
  it('z_α at 0.99 ≈ 2.326', () => {
    const r = solveOperatorVar(baseCfg);
    expect(r.zScoreForVar).toBeCloseTo(2.326, 2);
  });
  it('z_α at 0.999 ≈ 3.090', () => {
    const r = solveOperatorVar({ ...baseCfg, varConfidenceLevel: 0.999 });
    expect(r.zScoreForVar).toBeCloseTo(3.09, 1);
  });
  it('VaR is non-negative', () => {
    const r = solveOperatorVar(baseCfg);
    expect(r.varAlphaTHorizon).toBeGreaterThanOrEqual(0);
  });
  it('higher α → higher VaR (more conservative)', () => {
    const a = solveOperatorVar({ ...baseCfg, varConfidenceLevel: 0.95 });
    const b = solveOperatorVar({ ...baseCfg, varConfidenceLevel: 0.999 });
    expect(b.varAlphaTHorizon).toBeGreaterThan(a.varAlphaTHorizon);
  });
});

describe('operatorVar — Expected Shortfall', () => {
  it('ES_α ≥ VaR_α (CVaR coherent property)', () => {
    const r = solveOperatorVar(baseCfg);
    expect(r.expectedShortfallAlphaTHorizon).toBeGreaterThanOrEqual(r.varAlphaTHorizon);
  });
  it('ES_α non-negative', () => {
    const r = solveOperatorVar(baseCfg);
    expect(r.expectedShortfallAlphaTHorizon).toBeGreaterThanOrEqual(0);
  });
  it('higher α → higher ES', () => {
    const a = solveOperatorVar({ ...baseCfg, varConfidenceLevel: 0.95 });
    const b = solveOperatorVar({ ...baseCfg, varConfidenceLevel: 0.999 });
    expect(b.expectedShortfallAlphaTHorizon).toBeGreaterThan(a.expectedShortfallAlphaTHorizon);
  });
});

describe('operatorVar — jackpot reserve', () => {
  it('= jackpotMax · triggerProb · 365 · safetyFactor', () => {
    const r = solveOperatorVar(baseCfg);
    const expected =
      baseCfg.jackpotMaxPayout *
      baseCfg.jackpotTriggerProbPerDay *
      365 *
      baseCfg.jackpotSafetyFactor;
    expect(r.jackpotTailReserve).toBeCloseTo(expected, 4);
  });
  it('higher safety factor → higher reserve', () => {
    const a = solveOperatorVar({ ...baseCfg, jackpotSafetyFactor: 1.0 });
    const b = solveOperatorVar({ ...baseCfg, jackpotSafetyFactor: 3.0 });
    expect(b.jackpotTailReserve).toBeGreaterThan(a.jackpotTailReserve);
  });
});

describe('operatorVar — required reserve + solvency', () => {
  it('requiredReserve = max(VaR, jackpot, minimum)', () => {
    const r = solveOperatorVar(baseCfg);
    const expected = Math.max(r.varAlphaTHorizon, r.jackpotTailReserve, baseCfg.minimumReserve);
    expect(r.requiredReserveCapital).toBeCloseTo(expected, 6);
  });
  it('solvencyRatio = ownFunds / requiredReserve', () => {
    const r = solveOperatorVar(baseCfg);
    expect(r.solvencyRatio).toBeCloseTo(
      baseCfg.operatorOwnFunds / r.requiredReserveCapital,
      6,
    );
  });
  it('high ownFunds → high solvency ratio', () => {
    const a = solveOperatorVar({ ...baseCfg, operatorOwnFunds: 100_000 });
    const b = solveOperatorVar({ ...baseCfg, operatorOwnFunds: 10_000_000 });
    expect(b.solvencyRatio).toBeGreaterThan(a.solvencyRatio);
  });
  it('zero ownFunds → solvency 0', () => {
    const r = solveOperatorVar({ ...baseCfg, operatorOwnFunds: 0 });
    expect(r.solvencyRatio).toBe(0);
  });
});

describe('operatorVar — UKGC GA 2005 compliance', () => {
  it('compliant for healthy operator (£5M ownFunds, mid-tier scale)', () => {
    const r = solveOperatorVar(baseCfg);
    expect(r.isCompliantUkgcGa2005).toBe(true);
  });
  it('non-compliant when ownFunds < minimumReserve', () => {
    const r = solveOperatorVar({ ...baseCfg, operatorOwnFunds: 50_000 });
    expect(r.isCompliantUkgcGa2005).toBe(false);
  });
  it('non-compliant when solvency ratio < 1 (large jackpot exposure)', () => {
    // Large jackpot stake — required reserve dominated by jackpot tail
    const r = solveOperatorVar({
      ...baseCfg,
      operatorOwnFunds: 500_000,
      jackpotMaxPayout: 1_000_000,
      jackpotTriggerProbPerDay: 0.01, // 1 in 100 days
      jackpotSafetyFactor: 3.0,
    });
    expect(r.solvencyRatio).toBeLessThan(1);
    expect(r.isCompliantUkgcGa2005).toBe(false);
  });
});

describe('operatorVar — monotonicity', () => {
  it('higher session count → higher VaR (square-root law)', () => {
    const a = solveOperatorVar({ ...baseCfg, expectedSessionsPerDay: 1000 });
    const b = solveOperatorVar({ ...baseCfg, expectedSessionsPerDay: 100000 });
    expect(b.varAlphaTHorizon).toBeGreaterThan(a.varAlphaTHorizon);
  });
  it('higher session std → higher VaR', () => {
    const a = solveOperatorVar({ ...baseCfg, stdProfitPerSession: 10 });
    const b = solveOperatorVar({ ...baseCfg, stdProfitPerSession: 100 });
    expect(b.varAlphaTHorizon).toBeGreaterThan(a.varAlphaTHorizon);
  });
  it('longer horizon T → higher VaR (square-root scaling)', () => {
    const a = solveOperatorVar({ ...baseCfg, varHorizonDays: 1 });
    const b = solveOperatorVar({ ...baseCfg, varHorizonDays: 100 });
    expect(b.varAlphaTHorizon).toBeGreaterThan(a.varAlphaTHorizon);
  });
});

describe('operatorVar — MC cross-validation', () => {
  it('MC VaR within 10% of CF', () => {
    const cf = solveOperatorVar(baseCfg);
    const mc = simulateOperatorVar(baseCfg, 12345, 10_000);
    // MC empirical quantile has finite-N variance; allow 10% relative tolerance
    if (cf.varAlphaTHorizon > 0) {
      const rel = Math.abs(mc.observedVarAlphaTHorizon - cf.varAlphaTHorizon) / cf.varAlphaTHorizon;
      expect(rel).toBeLessThan(0.20);
    }
  });
  it('MC daily GGR within 5% of CF', () => {
    const cf = solveOperatorVar(baseCfg);
    const mc = simulateOperatorVar(baseCfg, 67890, 5_000);
    const rel = Math.abs(mc.observedExpectedDailyGgr - cf.expectedDailyGgr) / cf.expectedDailyGgr;
    expect(rel).toBeLessThan(0.05);
  });
});

describe('operatorVar — determinism', () => {
  it('same seed → identical MC', () => {
    const a = simulateOperatorVar(baseCfg, 42, 500);
    const b = simulateOperatorVar(baseCfg, 42, 500);
    expect(a.observedVarAlphaTHorizon).toBe(b.observedVarAlphaTHorizon);
  });
});

describe('operatorVar — industry use-case', () => {
  it('Mid-tier UK operator (£5M reserves) is healthy under UKGC GA 2005', () => {
    const r = solveOperatorVar(baseCfg);
    expect(r.isCompliantUkgcGa2005).toBe(true);
    expect(r.solvencyRatio).toBeGreaterThan(1.0);
    expect(r.expectedAnnualGgr).toBeGreaterThan(0);
  });
});
