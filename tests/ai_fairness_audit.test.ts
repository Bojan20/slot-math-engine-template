/**
 * W236 — AI/ML Player Profiling Fairness Audit Analyzer tests.
 *
 * 28 specs covering:
 *   - validation (10)
 *   - DP / EO / DI calculation (6)
 *   - pass/fail logic (4)
 *   - composite score (2)
 *   - EU AI Act + UKGC compliance (3)
 *   - MC sensitivity (1)
 *   - determinism (1)
 *   - industry use-case (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveAiFairness,
  simulateAiFairness,
} from '../src/features/aiFairnessAudit.js';

const baseCfg = {
  positiveRateGroupA: 0.30,    // protected group
  positiveRateGroupB: 0.35,    // unprotected group
  truePositiveRateA: 0.85,
  truePositiveRateB: 0.87,
  falsePositiveRateA: 0.10,
  falsePositiveRateB: 0.09,
  ppvGroupA: 0.75,
  ppvGroupB: 0.78,
  demographicParityTolerance: 0.10,
  equalizedOddsTolerance: 0.05,
  disparateImpactLower: 0.80,
  disparateImpactUpper: 1.25,
  documentationComplete: true,
  humanOversightEnabled: true,
};

describe('aiFairness — validation', () => {
  it('rejects rate > 1', () => {
    expect(() => solveAiFairness({ ...baseCfg, positiveRateGroupA: 1.5 })).toThrow();
  });
  it('rejects rate < 0', () => {
    expect(() => solveAiFairness({ ...baseCfg, truePositiveRateB: -0.1 })).toThrow();
  });
  it('rejects non-finite', () => {
    expect(() => solveAiFairness({ ...baseCfg, falsePositiveRateA: NaN })).toThrow();
  });
  it('rejects DP tolerance > 0.5', () => {
    expect(() => solveAiFairness({ ...baseCfg, demographicParityTolerance: 0.7 })).toThrow();
  });
  it('rejects EO tolerance > 0.5', () => {
    expect(() => solveAiFairness({ ...baseCfg, equalizedOddsTolerance: 0.6 })).toThrow();
  });
  it('rejects DI lower ≥ 1', () => {
    expect(() => solveAiFairness({ ...baseCfg, disparateImpactLower: 1.0 })).toThrow();
  });
  it('rejects DI upper ≤ 1', () => {
    expect(() => solveAiFairness({ ...baseCfg, disparateImpactUpper: 0.9 })).toThrow();
  });
  it('rejects PPV out of [0,1]', () => {
    expect(() => solveAiFairness({ ...baseCfg, ppvGroupA: 1.2 })).toThrow();
  });
  it('rejects negative DP tolerance', () => {
    expect(() => solveAiFairness({ ...baseCfg, demographicParityTolerance: -0.1 })).toThrow();
  });
  it('rejects negative EO tolerance', () => {
    expect(() => solveAiFairness({ ...baseCfg, equalizedOddsTolerance: -0.05 })).toThrow();
  });
});

describe('aiFairness — metric calculations', () => {
  it('DP_diff = posRate_A − posRate_B', () => {
    const r = solveAiFairness(baseCfg);
    expect(r.demographicParityDifference).toBeCloseTo(0.30 - 0.35, 6);
  });
  it('DP_abs = |DP_diff|', () => {
    const r = solveAiFairness(baseCfg);
    expect(r.demographicParityAbs).toBeCloseTo(0.05, 6);
  });
  it('EO_TPR = |TPR_A − TPR_B|', () => {
    const r = solveAiFairness(baseCfg);
    expect(r.equalizedOddsTprDiff).toBeCloseTo(0.02, 6);
  });
  it('EO_FPR = |FPR_A − FPR_B|', () => {
    const r = solveAiFairness(baseCfg);
    expect(r.equalizedOddsFprDiff).toBeCloseTo(0.01, 6);
  });
  it('DI = posRate_A / posRate_B', () => {
    const r = solveAiFairness(baseCfg);
    expect(r.disparateImpactRatio).toBeCloseTo(0.30 / 0.35, 4);
  });
  it('predictiveParityDiff = |PPV_A − PPV_B|', () => {
    const r = solveAiFairness(baseCfg);
    expect(r.predictiveParityDiff).toBeCloseTo(0.03, 6);
  });
});

describe('aiFairness — pass/fail logic', () => {
  it('passes DP when |diff| ≤ tolerance', () => {
    const r = solveAiFairness(baseCfg);
    expect(r.passesDemographicParity).toBe(true);
  });
  it('fails DP when diff > tolerance', () => {
    const r = solveAiFairness({ ...baseCfg, positiveRateGroupA: 0.10 });
    expect(r.passesDemographicParity).toBe(false);
  });
  it('passes EO when both TPR + FPR diffs ≤ tolerance', () => {
    const r = solveAiFairness(baseCfg);
    expect(r.passesEqualizedOdds).toBe(true);
  });
  it('passes DI 4/5 rule when ratio ∈ [0.80, 1.25]', () => {
    const r = solveAiFairness(baseCfg);
    expect(r.passesDisparateImpact).toBe(true);
  });
});

describe('aiFairness — composite score', () => {
  it('∈ [0, 1]', () => {
    const r = solveAiFairness(baseCfg);
    expect(r.fairnessCompositeScore).toBeGreaterThanOrEqual(0);
    expect(r.fairnessCompositeScore).toBeLessThanOrEqual(1);
  });
  it('perfect fairness (zero diffs) → score ≈ 1', () => {
    const r = solveAiFairness({
      ...baseCfg,
      positiveRateGroupA: 0.30,
      positiveRateGroupB: 0.30,
      truePositiveRateA: 0.85,
      truePositiveRateB: 0.85,
      falsePositiveRateA: 0.10,
      falsePositiveRateB: 0.10,
    });
    expect(r.fairnessCompositeScore).toBeGreaterThan(0.95);
  });
});

describe('aiFairness — EU AI Act + UKGC compliance', () => {
  it('compliant for fair model + documentation + human oversight', () => {
    const r = solveAiFairness(baseCfg);
    expect(r.isCompliantEuAiAct).toBe(true);
  });
  it('non-compliant when documentation incomplete (EU AI Act Art. 11)', () => {
    const r = solveAiFairness({ ...baseCfg, documentationComplete: false });
    expect(r.isCompliantEuAiAct).toBe(false);
  });
  it('UKGC RTS 12 §11 weaker than EU AI Act (no equalized odds required)', () => {
    const r = solveAiFairness({
      ...baseCfg,
      truePositiveRateA: 0.5,  // fails equalized odds (large diff)
      humanOversightEnabled: false, // fails EU AI Act
    });
    expect(r.isCompliantEuAiAct).toBe(false);
    // But UKGC RTS 12 §11 may still pass if DP + DI pass + documentation
    if (r.passesDemographicParity && r.passesDisparateImpact) {
      expect(r.isCompliantUkgcRts1211).toBe(true);
    }
  });
});

describe('aiFairness — MC sensitivity', () => {
  it('MC mean DP within 2pp of theoretical', () => {
    const cf = solveAiFairness(baseCfg);
    const mc = simulateAiFairness(baseCfg, 12345, 500, 1000);
    expect(
      Math.abs(mc.observedDemographicParityMean - cf.demographicParityDifference),
    ).toBeLessThan(0.02);
  });
});

describe('aiFairness — determinism', () => {
  it('same seed → identical MC', () => {
    const a = simulateAiFairness(baseCfg, 42, 200);
    const b = simulateAiFairness(baseCfg, 42, 200);
    expect(a.observedDemographicParityMean).toBe(b.observedDemographicParityMean);
  });
});

describe('aiFairness — industry use-case', () => {
  it('Sky-Bet-class bonus-targeting AI: pass DP + DI for tight thresholds', () => {
    const r = solveAiFairness(baseCfg);
    expect(r.isCompliantEuAiAct).toBe(true);
    expect(r.fairnessCompositeScore).toBeGreaterThan(0.4);
  });
});
