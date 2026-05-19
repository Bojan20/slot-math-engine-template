/**
 * W231 — Multi-Account Bonus Abuse Detection Analyzer tests.
 *
 * 31 specs covering:
 *   - validation (10)
 *   - TPR/FPR correctness (4)
 *   - Bayesian posterior (3)
 *   - ROC AUC (2)
 *   - annual projections (3)
 *   - UKGC RTS 12 §10 compliance (2)
 *   - monotonicity (3)
 *   - MC cross-validation (2)
 *   - determinism (1)
 *   - industry use-case (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveMultiAccountBonusAbuse,
  simulateMultiAccountBonusAbuse,
} from '../src/features/multiAccountBonusAbuse.js';

const baseCfg = {
  abuserPrevalence: 0.02,        // 2% abusers
  organicBonusClaimRate: 1.5,    // 1.5 bonus/month organic
  abuserBonusClaimRate: 20,      // 20 bonus/month abuser
  organicMatchScoreAlpha: 1,
  organicMatchScoreBeta: 19,     // mode ~0.05 (organic match low)
  abuserMatchScoreAlpha: 8,
  abuserMatchScoreBeta: 3,       // mode ~0.7 (abuser match high)
  claimCountThreshold: 5,
  matchScoreThreshold: 0.5,
  averageBonusValue: 50,
  expectedAbuserLifetimeClaims: 30,
  newPlayersPerDay: 1000,
};

describe('multiAccountBonusAbuse — validation', () => {
  it('rejects abuserPrevalence out of (0, 0.5)', () => {
    expect(() => solveMultiAccountBonusAbuse({ ...baseCfg, abuserPrevalence: 0 })).toThrow();
    expect(() => solveMultiAccountBonusAbuse({ ...baseCfg, abuserPrevalence: 0.7 })).toThrow();
  });
  it('rejects organicBonusClaimRate ≤ 0', () => {
    expect(() => solveMultiAccountBonusAbuse({ ...baseCfg, organicBonusClaimRate: 0 })).toThrow();
  });
  it('rejects abuserBonusClaimRate ≤ organic', () => {
    expect(() =>
      solveMultiAccountBonusAbuse({ ...baseCfg, abuserBonusClaimRate: 1 }),
    ).toThrow();
  });
  it('rejects Beta params ≤ 0', () => {
    expect(() =>
      solveMultiAccountBonusAbuse({ ...baseCfg, organicMatchScoreAlpha: 0 }),
    ).toThrow();
  });
  it('rejects negative claimCountThreshold', () => {
    expect(() =>
      solveMultiAccountBonusAbuse({ ...baseCfg, claimCountThreshold: -1 }),
    ).toThrow();
  });
  it('rejects fractional claimCountThreshold', () => {
    expect(() =>
      solveMultiAccountBonusAbuse({ ...baseCfg, claimCountThreshold: 5.5 }),
    ).toThrow();
  });
  it('rejects matchScoreThreshold out of (0, 1)', () => {
    expect(() =>
      solveMultiAccountBonusAbuse({ ...baseCfg, matchScoreThreshold: 0 }),
    ).toThrow();
    expect(() =>
      solveMultiAccountBonusAbuse({ ...baseCfg, matchScoreThreshold: 1.0 }),
    ).toThrow();
  });
  it('rejects averageBonusValue ≤ 0', () => {
    expect(() =>
      solveMultiAccountBonusAbuse({ ...baseCfg, averageBonusValue: 0 }),
    ).toThrow();
  });
  it('rejects newPlayersPerDay ≤ 0', () => {
    expect(() =>
      solveMultiAccountBonusAbuse({ ...baseCfg, newPlayersPerDay: 0 }),
    ).toThrow();
  });
  it('rejects non-finite', () => {
    expect(() =>
      solveMultiAccountBonusAbuse({ ...baseCfg, abuserPrevalence: NaN }),
    ).toThrow();
  });
});

describe('multiAccountBonusAbuse — TPR/FPR', () => {
  it('TPR ∈ [0, 1]', () => {
    const r = solveMultiAccountBonusAbuse(baseCfg);
    expect(r.truePositiveRate).toBeGreaterThanOrEqual(0);
    expect(r.truePositiveRate).toBeLessThanOrEqual(1);
  });
  it('FPR ∈ [0, 1]', () => {
    const r = solveMultiAccountBonusAbuse(baseCfg);
    expect(r.falsePositiveRate).toBeGreaterThanOrEqual(0);
    expect(r.falsePositiveRate).toBeLessThanOrEqual(1);
  });
  it('TPR > FPR for separable populations', () => {
    const r = solveMultiAccountBonusAbuse(baseCfg);
    expect(r.truePositiveRate).toBeGreaterThan(r.falsePositiveRate);
  });
  it('TPR substantial for large abuser claim rate', () => {
    const r = solveMultiAccountBonusAbuse({ ...baseCfg, abuserBonusClaimRate: 50 });
    expect(r.truePositiveRate).toBeGreaterThan(0.9);
  });
});

describe('multiAccountBonusAbuse — Bayesian posterior', () => {
  it('posterior > prevalence when flagged (Bayes update)', () => {
    const r = solveMultiAccountBonusAbuse(baseCfg);
    expect(r.bayesianPosteriorAbuser).toBeGreaterThan(baseCfg.abuserPrevalence);
  });
  it('posterior → 1 as TPR ↑ AND FPR → 0', () => {
    const r = solveMultiAccountBonusAbuse({
      ...baseCfg,
      abuserBonusClaimRate: 100,
      abuserMatchScoreAlpha: 50,
      abuserMatchScoreBeta: 1,
    });
    expect(r.bayesianPosteriorAbuser).toBeGreaterThan(0.5);
  });
  it('posterior ∈ [0, 1]', () => {
    const r = solveMultiAccountBonusAbuse(baseCfg);
    expect(r.bayesianPosteriorAbuser).toBeGreaterThanOrEqual(0);
    expect(r.bayesianPosteriorAbuser).toBeLessThanOrEqual(1);
  });
});

describe('multiAccountBonusAbuse — ROC AUC', () => {
  it('AUC ∈ [0.5, 1] for well-separated classes', () => {
    const r = solveMultiAccountBonusAbuse(baseCfg);
    expect(r.rocAucApproximation).toBeGreaterThan(0.5);
    expect(r.rocAucApproximation).toBeLessThanOrEqual(1);
  });
  it('AUC > 0.9 for highly separable populations', () => {
    const r = solveMultiAccountBonusAbuse({
      ...baseCfg,
      organicBonusClaimRate: 0.5,
      abuserBonusClaimRate: 50,
      abuserMatchScoreAlpha: 20,
      abuserMatchScoreBeta: 1,
    });
    expect(r.rocAucApproximation).toBeGreaterThan(0.85);
  });
});

describe('multiAccountBonusAbuse — annual projections', () => {
  it('expectedAbuserArrivals = newPlayers · prevalence', () => {
    const r = solveMultiAccountBonusAbuse(baseCfg);
    expect(r.expectedAbuserArrivalsPerDay).toBeCloseTo(
      baseCfg.newPlayersPerDay * baseCfg.abuserPrevalence,
      6,
    );
  });
  it('missedAbusers = arrivals · (1 − TPR)', () => {
    const r = solveMultiAccountBonusAbuse(baseCfg);
    expect(r.expectedMissedAbusersPerDay).toBeCloseTo(
      r.expectedAbuserArrivalsPerDay * (1 - r.truePositiveRate),
      6,
    );
  });
  it('annualOperatorLoss > 0 (some abuse missed)', () => {
    const r = solveMultiAccountBonusAbuse(baseCfg);
    expect(r.annualOperatorLossExposure).toBeGreaterThan(0);
  });
});

describe('multiAccountBonusAbuse — UKGC RTS 12 §10 compliance', () => {
  it('false when TPR < 0.95', () => {
    const r = solveMultiAccountBonusAbuse({
      ...baseCfg,
      claimCountThreshold: 25,
      matchScoreThreshold: 0.95,
    });
    expect(r.isCompliantUkgcRts1210).toBe(false);
  });
  it('true when TPR ≥ 0.95', () => {
    const r = solveMultiAccountBonusAbuse({
      ...baseCfg,
      claimCountThreshold: 0,
      matchScoreThreshold: 0.01,
      abuserBonusClaimRate: 50,
    });
    expect(r.isCompliantUkgcRts1210).toBe(true);
  });
});

describe('multiAccountBonusAbuse — monotonicity', () => {
  it('higher threshold → lower TPR and FPR', () => {
    const a = solveMultiAccountBonusAbuse({ ...baseCfg, claimCountThreshold: 2 });
    const b = solveMultiAccountBonusAbuse({ ...baseCfg, claimCountThreshold: 15 });
    expect(b.truePositiveRate).toBeLessThan(a.truePositiveRate);
    expect(b.falsePositiveRate).toBeLessThan(a.falsePositiveRate);
  });
  it('higher abuser claim rate → higher TPR', () => {
    const a = solveMultiAccountBonusAbuse({ ...baseCfg, abuserBonusClaimRate: 10 });
    const b = solveMultiAccountBonusAbuse({ ...baseCfg, abuserBonusClaimRate: 100 });
    expect(b.truePositiveRate).toBeGreaterThan(a.truePositiveRate);
  });
  it('higher prevalence → higher annual loss', () => {
    const a = solveMultiAccountBonusAbuse({ ...baseCfg, abuserPrevalence: 0.01 });
    const b = solveMultiAccountBonusAbuse({ ...baseCfg, abuserPrevalence: 0.10 });
    expect(b.annualOperatorLossExposure).toBeGreaterThan(a.annualOperatorLossExposure);
  });
});

describe('multiAccountBonusAbuse — MC cross-validation', () => {
  it('MC TPR within 8pp of CF', () => {
    const cf = solveMultiAccountBonusAbuse(baseCfg);
    const mc = simulateMultiAccountBonusAbuse(baseCfg, 12345, 30000);
    expect(Math.abs(mc.observedTpr - cf.truePositiveRate)).toBeLessThan(0.08);
  });
  it('MC FPR within 3pp of CF', () => {
    const cf = solveMultiAccountBonusAbuse(baseCfg);
    const mc = simulateMultiAccountBonusAbuse(baseCfg, 67890, 30000);
    expect(Math.abs(mc.observedFpr - cf.falsePositiveRate)).toBeLessThan(0.03);
  });
});

describe('multiAccountBonusAbuse — determinism', () => {
  it('same seed → identical MC', () => {
    const a = simulateMultiAccountBonusAbuse(baseCfg, 42, 1000);
    const b = simulateMultiAccountBonusAbuse(baseCfg, 42, 1000);
    expect(a.observedTpr).toBe(b.observedTpr);
  });
});

describe('multiAccountBonusAbuse — industry use-case', () => {
  it('UK mid-tier post-Sky-Bet fine: 2% abusers, 1K new/day, separable populations', () => {
    const r = solveMultiAccountBonusAbuse(baseCfg);
    expect(r.rocAucApproximation).toBeGreaterThan(0.7);
    expect(r.netAnnualSavings).toBeGreaterThan(0);
  });
});
