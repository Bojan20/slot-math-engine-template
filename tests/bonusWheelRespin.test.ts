/**
 * W152 Wave 105 — Bonus Wheel + Respin Markov tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveBonusWheelRespin,
  simulateBonusWheelRespin,
  type BonusWheelRespinConfig,
} from '../src/features/bonusWheelRespin.js';

const baseCfg = (overrides: Partial<BonusWheelRespinConfig> = {}): BonusWheelRespinConfig => ({
  paySegments: [
    { label: 'cash_low', probability: 0.40, payoutX: 1 },
    { label: 'cash_mid', probability: 0.20, payoutX: 5 },
    { label: 'major',    probability: 0.08, payoutX: 25 },
    { label: 'grand',    probability: 0.02, payoutX: 250 },
  ],
  respinProbability: 0.30,
  ...overrides,
});

describe('validation', () => {
  it('rejects empty paySegments', () => {
    expect(() => solveBonusWheelRespin(baseCfg({ paySegments: [] }))).toThrow();
  });
  it('rejects respin probability ≥ 1', () => {
    expect(() => solveBonusWheelRespin(baseCfg({ respinProbability: 1 }))).toThrow();
  });
  it('rejects negative respin', () => {
    expect(() => solveBonusWheelRespin(baseCfg({ respinProbability: -0.1 }))).toThrow();
  });
  it('rejects probabilities not summing to 1', () => {
    expect(() => solveBonusWheelRespin({
      paySegments: [{ label: 'x', probability: 0.4, payoutX: 1 }],
      respinProbability: 0.3,
    })).toThrow();
  });
  it('rejects duplicate label', () => {
    expect(() => solveBonusWheelRespin({
      paySegments: [
        { label: 'a', probability: 0.3, payoutX: 1 },
        { label: 'a', probability: 0.4, payoutX: 5 },
      ],
      respinProbability: 0.3,
    })).toThrow();
  });
  it('rejects negative payout', () => {
    expect(() => solveBonusWheelRespin({
      paySegments: [{ label: 'x', probability: 0.7, payoutX: -1 }],
      respinProbability: 0.3,
    })).toThrow();
  });
  it('rejects bad baseTrigger', () => {
    expect(() => solveBonusWheelRespin(baseCfg({ baseTriggerProbabilityPerSpin: 1.5 }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('E[N] = 1/(1−p_respin)', () => {
    const r = solveBonusWheelRespin(baseCfg());
    expect(r.expectedSpinsUntilTerminate).toBeCloseTo(1 / 0.7, 8);
  });
  it('Var[N] = p_respin / (1−p_respin)²', () => {
    const r = solveBonusWheelRespin(baseCfg());
    expect(r.varianceSpinsUntilTerminate).toBeCloseTo(0.3 / (0.7 * 0.7), 8);
  });
  it('E[V] = Σ p_i·v_i / (1−p_respin)', () => {
    const r = solveBonusWheelRespin(baseCfg());
    // (0.4·1 + 0.2·5 + 0.08·25 + 0.02·250) / 0.7
    // = (0.4 + 1 + 2 + 5) / 0.7 = 8.4 / 0.7 = 12
    expect(r.expectedFinalPayoutX).toBeCloseTo(12, 8);
  });
  it('Var[V] = E[V²] − E[V]²', () => {
    const r = solveBonusWheelRespin(baseCfg());
    // E[V²] = (0.4·1 + 0.2·25 + 0.08·625 + 0.02·62500) / 0.7
    //       = (0.4 + 5 + 50 + 1250) / 0.7 = 1305.4 / 0.7 ≈ 1864.857
    // Var = 1864.857 − 144 ≈ 1720.857
    const expectedEV2 = (0.4 + 5 + 50 + 1250) / 0.7;
    const expectedVar = expectedEV2 - 144;
    expect(r.varianceFinalPayoutX).toBeCloseTo(expectedVar, 4);
  });
  it('tail P(N ≥ 2) = p_respin', () => {
    const r = solveBonusWheelRespin(baseCfg());
    expect(r.probAtLeastTwoSpins).toBeCloseTo(0.30, 10);
  });
  it('tail P(N ≥ 5) = p_respin^4', () => {
    const r = solveBonusWheelRespin(baseCfg());
    expect(r.probAtLeastFiveSpins).toBeCloseTo(Math.pow(0.30, 4), 10);
  });
  it('max payout identified', () => {
    const r = solveBonusWheelRespin(baseCfg());
    expect(r.maxPayoutX).toBe(250);
    expect(r.probHitMax).toBeCloseTo(0.02 / 0.7, 8);
  });
  it('p_respin=0 → E[N]=1, all spins terminate', () => {
    const r = solveBonusWheelRespin(baseCfg({ respinProbability: 0, paySegments: [
      { label: 'a', probability: 0.5, payoutX: 10 },
      { label: 'b', probability: 0.5, payoutX: 20 },
    ] }));
    expect(r.expectedSpinsUntilTerminate).toBe(1);
    expect(r.varianceSpinsUntilTerminate).toBe(0);
    expect(r.probAtLeastTwoSpins).toBe(0);
  });
  it('per-base-spin contribution if baseTrigger set', () => {
    const r = solveBonusWheelRespin(baseCfg({ baseTriggerProbabilityPerSpin: 0.01 }));
    expect(r.expectedFeaturePayoutPerBaseSpin).toBeCloseTo(0.01 * 12, 8);
  });
  it('no base trigger ⇒ null', () => {
    const r = solveBonusWheelRespin(baseCfg());
    expect(r.expectedFeaturePayoutPerBaseSpin).toBeNull();
  });
});

describe('monotonicity', () => {
  it('higher p_respin ⇒ higher E[N]', () => {
    const a = solveBonusWheelRespin(baseCfg({
      paySegments: [{ label: 'x', probability: 0.9, payoutX: 10 }],
      respinProbability: 0.1,
    }));
    const b = solveBonusWheelRespin(baseCfg({
      paySegments: [{ label: 'x', probability: 0.3, payoutX: 10 }],
      respinProbability: 0.7,
    }));
    expect(b.expectedSpinsUntilTerminate).toBeGreaterThan(a.expectedSpinsUntilTerminate);
  });
  it('uniform doubling of pay segments doubles E[V]', () => {
    const a = solveBonusWheelRespin(baseCfg());
    const cfgDouble = baseCfg();
    cfgDouble.paySegments = cfgDouble.paySegments.map((s) => ({ ...s, payoutX: s.payoutX * 2 }));
    const b = solveBonusWheelRespin(cfgDouble);
    expect(b.expectedFinalPayoutX).toBeCloseTo(a.expectedFinalPayoutX * 2, 6);
  });
});

describe('MC cross-validation', () => {
  it('MC E[N] matches CF (rel ≤ 3% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveBonusWheelRespin(cfg);
    const mc = simulateBonusWheelRespin(cfg, 50_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedSpinsUntilTerminate - mc.observedMeanSpins) / cf.expectedSpinsUntilTerminate;
    expect(rel).toBeLessThan(0.03);
  });
  it('MC E[V] matches CF (rel ≤ 10% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveBonusWheelRespin(cfg);
    const mc = simulateBonusWheelRespin(cfg, 50_000, 0xbeefbabe);
    const rel = Math.abs(cf.expectedFinalPayoutX - mc.observedMeanFinalPayoutX) / cf.expectedFinalPayoutX;
    expect(rel).toBeLessThan(0.10);
  });
  it('MC Var[V] matches CF (rel ≤ 20% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveBonusWheelRespin(cfg);
    const mc = simulateBonusWheelRespin(cfg, 50_000, 0xfeedface);
    const rel = Math.abs(cf.varianceFinalPayoutX - mc.observedVarianceFinalPayoutX) / cf.varianceFinalPayoutX;
    expect(rel).toBeLessThan(0.20);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveBonusWheelRespin(baseCfg());
    const b = solveBonusWheelRespin(baseCfg());
    expect(a.expectedFinalPayoutX).toBe(b.expectedFinalPayoutX);
  });
  it('MC same seed → identical', () => {
    const a = simulateBonusWheelRespin(baseCfg(), 1000, 42);
    const b = simulateBonusWheelRespin(baseCfg(), 1000, 42);
    expect(a.totalPayoutX).toBe(b.totalPayoutX);
  });
});

describe('industry use-cases', () => {
  it('NetEnt-style wheel: 30% respin, 4-tier cash + grand', () => {
    const r = solveBonusWheelRespin({
      paySegments: [
        { label: 'mini',  probability: 0.30, payoutX: 5 },
        { label: 'minor', probability: 0.25, payoutX: 25 },
        { label: 'major', probability: 0.10, payoutX: 100 },
        { label: 'grand', probability: 0.05, payoutX: 1000 },
      ],
      respinProbability: 0.30,
    });
    expect(r.expectedSpinsUntilTerminate).toBeCloseTo(1 / 0.7, 6);
    expect(r.maxPayoutX).toBe(1000);
    expect(r.probHitMax).toBeCloseTo(0.05 / 0.7, 8);
  });
  it('High-respin aggressive wheel p=0.6', () => {
    const r = solveBonusWheelRespin({
      paySegments: [
        { label: 'x', probability: 0.35, payoutX: 10 },
        { label: 'y', probability: 0.05, payoutX: 500 },
      ],
      respinProbability: 0.60,
    });
    expect(r.expectedSpinsUntilTerminate).toBeCloseTo(1 / 0.4, 6); // 2.5
    expect(r.probAtLeastFiveSpins).toBeCloseTo(Math.pow(0.6, 4), 10);
  });
});
