/**
 * W152 Wave 22 — generatingFunctions tests (Faza 6.7).
 */

import { describe, it, expect } from 'vitest';
import {
  validateDistribution,
  pgf,
  mgf,
  moments,
  convolve,
  sumNCopies,
  buildFromPayoutMap,
} from '../src/math/generatingFunctions.js';

const FAIR_COIN = { payouts: [0, 1], probabilities: [0.5, 0.5] };
const TRIPLE = { payouts: [0, 1, 2], probabilities: [0.5, 0.3, 0.2] };

describe('validateDistribution', () => {
  it('accepts valid distribution', () => {
    expect(() => validateDistribution(FAIR_COIN)).not.toThrow();
  });
  it('rejects mismatched lengths', () => {
    expect(() => validateDistribution({ payouts: [0, 1], probabilities: [0.5] })).toThrow();
  });
  it('rejects empty', () => {
    expect(() => validateDistribution({ payouts: [], probabilities: [] })).toThrow();
  });
  it('rejects negative payout', () => {
    expect(() => validateDistribution({ payouts: [-1], probabilities: [1] })).toThrow(RangeError);
  });
  it('rejects negative probability', () => {
    expect(() => validateDistribution({ payouts: [0], probabilities: [-0.5] })).toThrow(RangeError);
  });
  it('rejects probabilities not summing to 1', () => {
    expect(() => validateDistribution({ payouts: [0, 1], probabilities: [0.5, 0.3] })).toThrow(RangeError);
  });
});

describe('pgf + mgf', () => {
  it('PGF at z=1 equals 1 for valid distribution', () => {
    expect(pgf(FAIR_COIN, 1)).toBeCloseTo(1, 9);
    expect(pgf(TRIPLE, 1)).toBeCloseTo(1, 9);
  });
  it('PGF at z=0 equals P(X=0)', () => {
    expect(pgf(FAIR_COIN, 0)).toBeCloseTo(0.5, 9);
    expect(pgf(TRIPLE, 0)).toBeCloseTo(0.5, 9);
  });
  it('MGF at t=0 equals 1', () => {
    expect(mgf(FAIR_COIN, 0)).toBeCloseTo(1, 9);
  });
});

describe('moments — fair coin', () => {
  it('mean = 0.5, variance = 0.25', () => {
    const m = moments(FAIR_COIN);
    expect(m.mean).toBeCloseTo(0.5, 9);
    expect(m.variance).toBeCloseTo(0.25, 9);
    expect(m.stdDev).toBeCloseTo(0.5, 9);
  });
  it('skewness = 0 (symmetric)', () => {
    expect(moments(FAIR_COIN).skewness).toBeCloseTo(0, 9);
  });
});

describe('moments — TRIPLE', () => {
  it('mean = 0.7', () => {
    expect(moments(TRIPLE).mean).toBeCloseTo(0.7, 9);
  });
  it('variance > 0', () => {
    expect(moments(TRIPLE).variance).toBeGreaterThan(0);
  });
  it('rawMoments has 4 entries', () => {
    expect(moments(TRIPLE).rawMoments).toHaveLength(4);
  });
});

describe('convolve', () => {
  it('convolution of 2 fair coins gives expected sum distribution', () => {
    const c = convolve(FAIR_COIN, FAIR_COIN);
    // Sum of two fair coins: P(0)=0.25, P(1)=0.5, P(2)=0.25
    expect(c.payouts).toEqual([0, 1, 2]);
    expect(c.probabilities[0]).toBeCloseTo(0.25, 9);
    expect(c.probabilities[1]).toBeCloseTo(0.5, 9);
    expect(c.probabilities[2]).toBeCloseTo(0.25, 9);
  });
  it('convolution preserves probability mass = 1', () => {
    const c = convolve(TRIPLE, TRIPLE);
    const sum = c.probabilities.reduce((s, p) => s + p, 0);
    expect(sum).toBeCloseTo(1, 9);
  });
});

describe('sumNCopies', () => {
  it('N=0 returns identity (mass at 0)', () => {
    const r = sumNCopies(FAIR_COIN, 0);
    expect(r.payouts).toEqual([0]);
    expect(r.probabilities).toEqual([1]);
  });
  it('N=1 returns input', () => {
    const r = sumNCopies(FAIR_COIN, 1);
    expect(r.payouts).toEqual(FAIR_COIN.payouts);
  });
  it('N=3 fair coins gives binomial-like distribution', () => {
    const r = sumNCopies(FAIR_COIN, 3);
    // Sum of 3 fair coins: binomial(3, 0.5)
    // P(0)=0.125, P(1)=0.375, P(2)=0.375, P(3)=0.125
    expect(r.payouts).toEqual([0, 1, 2, 3]);
    expect(r.probabilities[0]).toBeCloseTo(0.125, 9);
    expect(r.probabilities[3]).toBeCloseTo(0.125, 9);
  });
  it('rejects negative N', () => {
    expect(() => sumNCopies(FAIR_COIN, -1)).toThrow(RangeError);
  });
  it('rejects non-integer N', () => {
    expect(() => sumNCopies(FAIR_COIN, 1.5)).toThrow(RangeError);
  });
});

describe('buildFromPayoutMap', () => {
  it('produces probabilities summing to 1', () => {
    const d = buildFromPayoutMap({ '3': 5, '4': 25, '5': 100 }, 0.05);
    const sum = d.probabilities.reduce((s, p) => s + p, 0);
    expect(sum).toBeCloseTo(1, 9);
  });
  it('rejects out-of-range probability', () => {
    expect(() => buildFromPayoutMap({ '3': 5 }, -0.1)).toThrow(RangeError);
    expect(() => buildFromPayoutMap({ '3': 5 }, 1.5)).toThrow(RangeError);
  });
  it('empty map returns identity', () => {
    const d = buildFromPayoutMap({}, 0.5);
    expect(d.payouts).toEqual([0]);
    expect(d.probabilities).toEqual([1]);
  });
});

describe('Cross-check: moments vs MC', () => {
  it('moments of TRIPLE match analytical Σ p×x', () => {
    const m = moments(TRIPLE);
    // E[X] = 0×0.5 + 1×0.3 + 2×0.2 = 0.7
    expect(m.mean).toBeCloseTo(0.7, 9);
    // E[X²] = 0×0.5 + 1×0.3 + 4×0.2 = 1.1
    expect(m.rawMoments[1]).toBeCloseTo(1.1, 9);
    // Variance = 1.1 - 0.49 = 0.61
    expect(m.variance).toBeCloseTo(0.61, 9);
  });
});
