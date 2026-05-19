/**
 * W229 — Operator KYC/AML Sanction-Screening Risk Analyzer tests.
 *
 * 33 specs covering:
 *   - validation (12)
 *   - FP/FN per day correctness (4)
 *   - annual projections (3)
 *   - Bayesian posterior (3)
 *   - regulator detection + fine exposure (3)
 *   - AML risk score (2)
 *   - UKGC LCCP 3.5.5 compliance (3)
 *   - monotonicity (2)
 *   - MC cross-validation (2)
 *   - determinism (1)
 *   - industry use-case (UK mid-tier post-Entain-fine baseline) (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveKycAml,
  simulateKycAml,
} from '../src/features/kycAmlSanctionScreening.js';

const baseCfg = {
  expectedNewPlayersPerDay: 500,
  sanctionsBaseMatchRate: 0.0005,    // 1 in 2000 — industry typical
  screeningSensitivity: 0.99,        // UKGC minimum
  screeningSpecificity: 0.98,
  costPerFalsePositive: 50,
  costPerFalseNegative: 500_000,     // £500K average regulator fine per missed sanction
  annualScreeningOverhead: 100_000,  // vendor cost
  betaPriorAlpha: 1,
  betaPriorBeta: 1999,               // E[θ] = 1/2000 = 0.0005 prior
  observedSanctionHits: 0,
  totalScreeningsObserved: 0,
  regulatorAuditProbabilityPerYear: 0.20,
  expectedFinePerViolation: 5_000_000,
  screeningCadenceDays: 1,
};

describe('kycAml — validation', () => {
  it('rejects expectedNewPlayersPerDay ≤ 0', () => {
    expect(() => solveKycAml({ ...baseCfg, expectedNewPlayersPerDay: 0 })).toThrow();
  });
  it('rejects sanctionsBaseMatchRate out of (0, 0.1)', () => {
    expect(() => solveKycAml({ ...baseCfg, sanctionsBaseMatchRate: 0 })).toThrow();
    expect(() => solveKycAml({ ...baseCfg, sanctionsBaseMatchRate: 0.5 })).toThrow();
  });
  it('rejects screeningSensitivity out of (0, 1]', () => {
    expect(() => solveKycAml({ ...baseCfg, screeningSensitivity: 0 })).toThrow();
    expect(() => solveKycAml({ ...baseCfg, screeningSensitivity: 1.5 })).toThrow();
  });
  it('rejects screeningSpecificity out of (0, 1]', () => {
    expect(() => solveKycAml({ ...baseCfg, screeningSpecificity: 0 })).toThrow();
  });
  it('rejects negative costPerFalsePositive', () => {
    expect(() => solveKycAml({ ...baseCfg, costPerFalsePositive: -10 })).toThrow();
  });
  it('rejects negative costPerFalseNegative', () => {
    expect(() => solveKycAml({ ...baseCfg, costPerFalseNegative: -10 })).toThrow();
  });
  it('rejects negative annualScreeningOverhead', () => {
    expect(() => solveKycAml({ ...baseCfg, annualScreeningOverhead: -100 })).toThrow();
  });
  it('rejects Beta prior α ≤ 0', () => {
    expect(() => solveKycAml({ ...baseCfg, betaPriorAlpha: 0 })).toThrow();
  });
  it('rejects fractional observedSanctionHits', () => {
    expect(() => solveKycAml({ ...baseCfg, observedSanctionHits: 1.5 })).toThrow();
  });
  it('rejects totalScreeningsObserved < observedSanctionHits', () => {
    expect(() =>
      solveKycAml({ ...baseCfg, observedSanctionHits: 10, totalScreeningsObserved: 5 }),
    ).toThrow();
  });
  it('rejects regulatorAuditProbability out of (0, 1]', () => {
    expect(() => solveKycAml({ ...baseCfg, regulatorAuditProbabilityPerYear: 0 })).toThrow();
    expect(() => solveKycAml({ ...baseCfg, regulatorAuditProbabilityPerYear: 1.5 })).toThrow();
  });
  it('rejects non-finite', () => {
    expect(() => solveKycAml({ ...baseCfg, expectedFinePerViolation: NaN })).toThrow();
  });
});

describe('kycAml — FP/FN per day', () => {
  it('FP = λ · (1-p) · (1-spec)', () => {
    const r = solveKycAml(baseCfg);
    const expected = 500 * (1 - 0.0005) * (1 - 0.98);
    expect(r.falsePositivesPerDay).toBeCloseTo(expected, 4);
  });
  it('FN = λ · p · (1-sens)', () => {
    const r = solveKycAml(baseCfg);
    const expected = 500 * 0.0005 * (1 - 0.99);
    expect(r.falseNegativesPerDay).toBeCloseTo(expected, 6);
  });
  it('higher sensitivity → lower FN', () => {
    const a = solveKycAml({ ...baseCfg, screeningSensitivity: 0.9 });
    const b = solveKycAml({ ...baseCfg, screeningSensitivity: 0.999 });
    expect(b.falseNegativesPerDay).toBeLessThan(a.falseNegativesPerDay);
  });
  it('higher specificity → lower FP', () => {
    const a = solveKycAml({ ...baseCfg, screeningSpecificity: 0.9 });
    const b = solveKycAml({ ...baseCfg, screeningSpecificity: 0.99 });
    expect(b.falsePositivesPerDay).toBeLessThan(a.falsePositivesPerDay);
  });
});

describe('kycAml — annual projections', () => {
  it('annualFP = 365 · daily', () => {
    const r = solveKycAml(baseCfg);
    expect(r.annualFalsePositives).toBeCloseTo(365 * r.falsePositivesPerDay, 6);
  });
  it('annualFN = 365 · daily', () => {
    const r = solveKycAml(baseCfg);
    expect(r.annualFalseNegatives).toBeCloseTo(365 * r.falseNegativesPerDay, 6);
  });
  it('total cost = FP_cost + FN_cost + overhead', () => {
    const r = solveKycAml(baseCfg);
    expect(r.totalAnnualComplianceCost).toBeCloseTo(
      r.annualFalsePositiveCost + r.annualFalseNegativeCost + baseCfg.annualScreeningOverhead,
      4,
    );
  });
});

describe('kycAml — Bayesian posterior', () => {
  it('no observations → posterior ≈ prior', () => {
    const r = solveKycAml(baseCfg);
    const priorMean = baseCfg.betaPriorAlpha / (baseCfg.betaPriorAlpha + baseCfg.betaPriorBeta);
    expect(r.posteriorMatchRateMean).toBeCloseTo(priorMean, 6);
  });
  it('many positive observations → posterior shifts up', () => {
    const r = solveKycAml({
      ...baseCfg,
      observedSanctionHits: 50,
      totalScreeningsObserved: 10000,
    });
    expect(r.posteriorMatchRateMean).toBeGreaterThan(baseCfg.sanctionsBaseMatchRate);
  });
  it('large clean sample → posterior shifts down', () => {
    const r = solveKycAml({
      ...baseCfg,
      observedSanctionHits: 0,
      totalScreeningsObserved: 100000,
    });
    const priorMean = baseCfg.betaPriorAlpha / (baseCfg.betaPriorAlpha + baseCfg.betaPriorBeta);
    expect(r.posteriorMatchRateMean).toBeLessThan(priorMean);
  });
});

describe('kycAml — regulator detection + fine', () => {
  it('higher expected missed → higher detection prob', () => {
    const a = solveKycAml({ ...baseCfg, screeningSensitivity: 0.999 });
    const b = solveKycAml({ ...baseCfg, screeningSensitivity: 0.9 });
    expect(b.probRegulatorDetectionPerYear).toBeGreaterThan(a.probRegulatorDetectionPerYear);
  });
  it('detection prob ∈ [0, 1]', () => {
    const r = solveKycAml(baseCfg);
    expect(r.probRegulatorDetectionPerYear).toBeGreaterThanOrEqual(0);
    expect(r.probRegulatorDetectionPerYear).toBeLessThanOrEqual(1);
  });
  it('expectedAnnualFineExposure = detectionProb · finePerViolation', () => {
    const r = solveKycAml(baseCfg);
    expect(r.expectedAnnualFineExposure).toBeCloseTo(
      r.probRegulatorDetectionPerYear * baseCfg.expectedFinePerViolation,
      4,
    );
  });
});

describe('kycAml — risk score', () => {
  it('∈ [0, 1]', () => {
    const r = solveKycAml(baseCfg);
    expect(r.amlRiskScore).toBeGreaterThanOrEqual(0);
    expect(r.amlRiskScore).toBeLessThanOrEqual(1);
  });
  it('higher fine exposure → higher risk score', () => {
    const a = solveKycAml({ ...baseCfg, expectedFinePerViolation: 100_000 });
    const b = solveKycAml({ ...baseCfg, expectedFinePerViolation: 10_000_000 });
    expect(b.amlRiskScore).toBeGreaterThanOrEqual(a.amlRiskScore);
  });
});

describe('kycAml — UKGC LCCP 3.5.5 compliance', () => {
  it('true for UKGC defaults (sens=0.99, spec=0.98, cadence=1d)', () => {
    const r = solveKycAml(baseCfg);
    expect(r.isCompliantUkgcLccp35).toBe(true);
  });
  it('false when sensitivity < 0.99', () => {
    const r = solveKycAml({ ...baseCfg, screeningSensitivity: 0.95 });
    expect(r.isCompliantUkgcLccp35).toBe(false);
  });
  it('false when cadence > 1 day', () => {
    const r = solveKycAml({ ...baseCfg, screeningCadenceDays: 7 });
    expect(r.isCompliantUkgcLccp35).toBe(false);
  });
});

describe('kycAml — monotonicity', () => {
  it('higher λ_new → higher FP and FN volumes', () => {
    const a = solveKycAml({ ...baseCfg, expectedNewPlayersPerDay: 100 });
    const b = solveKycAml({ ...baseCfg, expectedNewPlayersPerDay: 5000 });
    expect(b.annualFalsePositives).toBeGreaterThan(a.annualFalsePositives);
    expect(b.annualFalseNegatives).toBeGreaterThan(a.annualFalseNegatives);
  });
  it('higher costPerFP → higher total cost', () => {
    const a = solveKycAml({ ...baseCfg, costPerFalsePositive: 10 });
    const b = solveKycAml({ ...baseCfg, costPerFalsePositive: 200 });
    expect(b.totalAnnualComplianceCost).toBeGreaterThan(a.totalAnnualComplianceCost);
  });
});

describe('kycAml — MC cross-validation', () => {
  it('MC annual FP within 15% of CF', () => {
    const cf = solveKycAml(baseCfg);
    const mc = simulateKycAml(baseCfg, 12345, 200);
    if (cf.annualFalsePositives > 100) {
      const rel = Math.abs(mc.observedAnnualFalsePositives - cf.annualFalsePositives) / cf.annualFalsePositives;
      expect(rel).toBeLessThan(0.15);
    }
  });
  it('MC annual FN within 50% of CF (rare events, high variance)', () => {
    const cf = solveKycAml(baseCfg);
    const mc = simulateKycAml(baseCfg, 67890, 200);
    if (cf.annualFalseNegatives > 0.5) {
      const rel = Math.abs(mc.observedAnnualFalseNegatives - cf.annualFalseNegatives) / cf.annualFalseNegatives;
      expect(rel).toBeLessThan(0.50);
    }
  });
});

describe('kycAml — determinism', () => {
  it('same seed → identical MC', () => {
    const a = simulateKycAml(baseCfg, 42, 100);
    const b = simulateKycAml(baseCfg, 42, 100);
    expect(a.observedAnnualFalsePositives).toBe(b.observedAnnualFalsePositives);
  });
});

describe('kycAml — industry use-case', () => {
  it('UK mid-tier post-Entain-fine: 500 new/day, 1-in-2000 base rate, healthy compliance', () => {
    const r = solveKycAml(baseCfg);
    expect(r.isCompliantUkgcLccp35).toBe(true);
    expect(r.annualFalsePositives).toBeGreaterThan(0);
    expect(r.totalAnnualComplianceCost).toBeGreaterThan(baseCfg.annualScreeningOverhead);
  });
});
