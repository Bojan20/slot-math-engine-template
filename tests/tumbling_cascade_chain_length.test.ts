/**
 * W152 Wave 171 — Tumbling Cascade Chain Length Analyzer tests.
 *
 * 30 specs:
 *   validation 7 / Geometric moments 4 / survival prob 3 / Wald 4 /
 *   monotonicity 3 / MC cross-val 4 / determinism 2 / industry 3
 */

import { describe, it, expect } from 'vitest';
import {
  solveTumblingCascadeChainLength,
  simulateTumblingCascadeChainLength,
} from '../src/features/tumblingCascadeChainLength.js';

// Sweet Bonanza-class baseline: p=0.30, E[Y]=2, Var[Y]=10
const baseCfg = {
  probCascadeWin: 0.30,
  expectedPayoutPerCascade: 2,
  variancePayoutPerCascade: 10,
};

describe('tumblingCascadeChainLength — validation', () => {
  it('rejects probCascadeWin ≤ 0 or ≥ 1', () => {
    expect(() => solveTumblingCascadeChainLength({ ...baseCfg, probCascadeWin: 0 })).toThrow();
    expect(() => solveTumblingCascadeChainLength({ ...baseCfg, probCascadeWin: 1 })).toThrow();
  });
  it('rejects expectedPayoutPerCascade < 0', () => {
    expect(() => solveTumblingCascadeChainLength({ ...baseCfg, expectedPayoutPerCascade: -1 })).toThrow();
  });
  it('rejects variancePayoutPerCascade < 0', () => {
    expect(() => solveTumblingCascadeChainLength({ ...baseCfg, variancePayoutPerCascade: -1 })).toThrow();
  });
  it('rejects non-finite inputs', () => {
    expect(() => solveTumblingCascadeChainLength({ ...baseCfg, probCascadeWin: NaN })).toThrow();
  });
  it('rejects empty disclosureChainThresholds', () => {
    expect(() => solveTumblingCascadeChainLength({ ...baseCfg, disclosureChainThresholds: [] })).toThrow();
  });
  it('rejects non-integer or non-positive thresholds', () => {
    expect(() => solveTumblingCascadeChainLength({ ...baseCfg, disclosureChainThresholds: [0] })).toThrow();
    expect(() => solveTumblingCascadeChainLength({ ...baseCfg, disclosureChainThresholds: [1.5] })).toThrow();
  });
  it('accepts E[Y]=0 and Var[Y]=0 (degenerate paytable)', () => {
    expect(() =>
      solveTumblingCascadeChainLength({ ...baseCfg, expectedPayoutPerCascade: 0, variancePayoutPerCascade: 0 }),
    ).not.toThrow();
  });
});

describe('tumblingCascadeChainLength — Geometric moments correctness', () => {
  it('E[C] = p/(1−p)', () => {
    const r = solveTumblingCascadeChainLength(baseCfg);
    expect(r.expectedChainLength).toBeCloseTo(0.30 / 0.70, 10);
  });
  it('Var[C] = p/(1−p)²', () => {
    const r = solveTumblingCascadeChainLength(baseCfg);
    expect(r.varianceChainLength).toBeCloseTo(0.30 / 0.49, 10);
  });
  it('stdDev[C] = √Var[C]', () => {
    const r = solveTumblingCascadeChainLength(baseCfg);
    expect(r.stdDevChainLength).toBeCloseTo(Math.sqrt(r.varianceChainLength), 10);
  });
  it('higher p → higher E[C] (longer chains)', () => {
    const r1 = solveTumblingCascadeChainLength({ ...baseCfg, probCascadeWin: 0.20 });
    const r2 = solveTumblingCascadeChainLength({ ...baseCfg, probCascadeWin: 0.60 });
    expect(r2.expectedChainLength).toBeGreaterThan(r1.expectedChainLength);
  });
});

describe('tumblingCascadeChainLength — survival probabilities', () => {
  it('P(C ≥ k) = p^k', () => {
    const r = solveTumblingCascadeChainLength(baseCfg);
    const k3 = r.chainSurvivalProbabilities.find((x) => x.threshold === 3);
    expect(k3!.survivalProb).toBeCloseTo(Math.pow(0.30, 3), 10);
  });
  it('survival strictly decreasing in threshold', () => {
    const r = solveTumblingCascadeChainLength(baseCfg);
    for (let i = 1; i < r.chainSurvivalProbabilities.length; i++) {
      expect(r.chainSurvivalProbabilities[i].survivalProb)
        .toBeLessThan(r.chainSurvivalProbabilities[i - 1].survivalProb);
    }
  });
  it('oneInN = 1/survivalProb', () => {
    const r = solveTumblingCascadeChainLength(baseCfg);
    for (const tier of r.chainSurvivalProbabilities) {
      if (Number.isFinite(tier.oneInN)) {
        expect(tier.oneInN).toBeCloseTo(1 / tier.survivalProb, 6);
      }
    }
  });
});

describe('tumblingCascadeChainLength — Wald identity', () => {
  it('E[total] = E[C] · E[Y]', () => {
    const r = solveTumblingCascadeChainLength(baseCfg);
    expect(r.expectedTotalPayoutPerSpin).toBeCloseTo(r.expectedChainLength * 2, 10);
  });
  it('Var[total] = E[C]·Var[Y] + Var[C]·(E[Y])²', () => {
    const r = solveTumblingCascadeChainLength(baseCfg);
    const expected = r.expectedChainLength * 10 + r.varianceChainLength * 2 * 2;
    expect(r.varianceTotalPayoutPerSpin).toBeCloseTo(expected, 10);
  });
  it('E[total]=0 when E[Y]=0', () => {
    const r = solveTumblingCascadeChainLength({ ...baseCfg, expectedPayoutPerCascade: 0 });
    expect(r.expectedTotalPayoutPerSpin).toBe(0);
  });
  it('probAtLeastOneWinPerSpin = p, oneInNSpinsAnyWin = 1/p', () => {
    const r = solveTumblingCascadeChainLength(baseCfg);
    expect(r.probAtLeastOneWinPerSpin).toBeCloseTo(0.30, 10);
    expect(r.oneInNSpinsAnyWin).toBeCloseTo(1 / 0.30, 8);
  });
});

describe('tumblingCascadeChainLength — monotonicity', () => {
  it('higher p → higher E[total]', () => {
    const r1 = solveTumblingCascadeChainLength({ ...baseCfg, probCascadeWin: 0.20 });
    const r2 = solveTumblingCascadeChainLength({ ...baseCfg, probCascadeWin: 0.60 });
    expect(r2.expectedTotalPayoutPerSpin).toBeGreaterThan(r1.expectedTotalPayoutPerSpin);
  });
  it('higher E[Y] → higher E[total]', () => {
    const r1 = solveTumblingCascadeChainLength({ ...baseCfg, expectedPayoutPerCascade: 1 });
    const r2 = solveTumblingCascadeChainLength({ ...baseCfg, expectedPayoutPerCascade: 10 });
    expect(r2.expectedTotalPayoutPerSpin).toBeGreaterThan(r1.expectedTotalPayoutPerSpin);
  });
  it('higher Var[Y] → higher Var[total]', () => {
    const r1 = solveTumblingCascadeChainLength({ ...baseCfg, variancePayoutPerCascade: 1 });
    const r2 = solveTumblingCascadeChainLength({ ...baseCfg, variancePayoutPerCascade: 100 });
    expect(r2.varianceTotalPayoutPerSpin).toBeGreaterThan(r1.varianceTotalPayoutPerSpin);
  });
});

describe('tumblingCascadeChainLength — MC cross-validation', () => {
  it('observed E[C] within ±5% of CF', () => {
    const cf = solveTumblingCascadeChainLength(baseCfg);
    const mc = simulateTumblingCascadeChainLength(baseCfg, 20_000, 12345);
    const rel = Math.abs(cf.expectedChainLength - mc.observedExpectedChainLength) /
      cf.expectedChainLength;
    expect(rel).toBeLessThan(0.05);
  });
  it('observed E[total] within ±5% of CF', () => {
    const cf = solveTumblingCascadeChainLength(baseCfg);
    const mc = simulateTumblingCascadeChainLength(baseCfg, 20_000, 7);
    const rel = Math.abs(cf.expectedTotalPayoutPerSpin - mc.observedExpectedTotalPayoutPerSpin) /
      cf.expectedTotalPayoutPerSpin;
    expect(rel).toBeLessThan(0.05);
  });
  it('observed stdDev[total] within ±15% of CF', () => {
    const cf = solveTumblingCascadeChainLength(baseCfg);
    const mc = simulateTumblingCascadeChainLength(baseCfg, 20_000, 31);
    const rel = Math.abs(cf.stdDevTotalPayoutPerSpin - mc.observedStdDevTotalPayoutPerSpin) /
      cf.stdDevTotalPayoutPerSpin;
    expect(rel).toBeLessThan(0.15);
  });
  it('observed P(C≥3) within ±1pp of CF', () => {
    const cf = solveTumblingCascadeChainLength(baseCfg);
    const mc = simulateTumblingCascadeChainLength(baseCfg, 20_000, 99);
    const cfTier3 = cf.chainSurvivalProbabilities.find((x) => x.threshold === 3)!.survivalProb;
    const mcTier3 = mc.observedChainSurvivalProbabilities.find((x) => x.threshold === 3)!.observedSurvivalProb;
    expect(Math.abs(cfTier3 - mcTier3)).toBeLessThan(0.01);
  });
});

describe('tumblingCascadeChainLength — determinism', () => {
  it('CF solver returns same result on repeated calls', () => {
    const r1 = solveTumblingCascadeChainLength(baseCfg);
    const r2 = solveTumblingCascadeChainLength(baseCfg);
    expect(r1).toEqual(r2);
  });
  it('MC with same seed returns same observation', () => {
    const r1 = simulateTumblingCascadeChainLength(baseCfg, 1000, 42);
    const r2 = simulateTumblingCascadeChainLength(baseCfg, 1000, 42);
    expect(r1).toEqual(r2);
  });
});

describe('tumblingCascadeChainLength — industry use-cases', () => {
  it('Sweet Bonanza-class: p=0.30, E[C]=0.43, P(≥10)≈6e-6 (1-in-170K)', () => {
    const r = solveTumblingCascadeChainLength(baseCfg);
    expect(r.expectedChainLength).toBeCloseTo(0.30 / 0.70, 4);
    const tier10 = r.chainSurvivalProbabilities.find((x) => x.threshold === 10)!;
    expect(tier10.survivalProb).toBeCloseTo(Math.pow(0.30, 10), 8);
    expect(tier10.oneInN).toBeGreaterThan(100_000);
  });
  it('Gonzo Quest-class (lower p=0.20): shorter chains', () => {
    const r = solveTumblingCascadeChainLength({ ...baseCfg, probCascadeWin: 0.20 });
    expect(r.expectedChainLength).toBeCloseTo(0.20 / 0.80, 4);
    expect(r.expectedChainLength).toBeLessThan(0.4);
  });
  it('Reactoonz-class (higher p=0.50): longer chains, high variance', () => {
    const r = solveTumblingCascadeChainLength({ ...baseCfg, probCascadeWin: 0.50 });
    expect(r.expectedChainLength).toBeCloseTo(1.0, 4);
    expect(r.varianceChainLength).toBeCloseTo(2.0, 4);
  });
});
