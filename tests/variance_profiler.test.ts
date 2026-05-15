/**
 * W152 Wave 19 — varianceProfiler tests (Faza 15.B.3).
 */

import { describe, it, expect } from 'vitest';
import {
  profileVariance,
  varianceGate,
  VARIANCE_GATE_BITS,
} from '../src/statistics/varianceProfiler.js';

function makeMoments(n: number, mean: number, sigma: number) {
  return { n, mean, m2: sigma * sigma * (n - 1) };
}

describe('profileVariance — basic', () => {
  it('returns observedSigma matching input sigma', () => {
    const r = profileVariance({
      moments: makeMoments(1000, 0.96, 0.02),
      targetRtp: 0.96,
    });
    expect(r.observedSigma).toBeCloseTo(0.02, 9);
  });
  it('within tolerance when mean = target', () => {
    const r = profileVariance({
      moments: makeMoments(1000, 0.96, 0.02),
      targetRtp: 0.96,
      toleranceHalfWidth: 0.005,
    });
    expect(r.withinTolerance).toBe(true);
  });
  it('out of tolerance when mean drifts beyond band', () => {
    const r = profileVariance({
      moments: makeMoments(1000, 0.99, 0.02),
      targetRtp: 0.96,
      toleranceHalfWidth: 0.005,
    });
    expect(r.withinTolerance).toBe(false);
  });
  it('vi95 < vi99 (wider CI is wider)', () => {
    const r = profileVariance({
      moments: makeMoments(1000, 0.96, 0.02),
      targetRtp: 0.96,
    });
    expect(r.vi99).toBeGreaterThan(r.vi95);
  });
  it('deviationSigma = 0 when mean exactly hits target', () => {
    const r = profileVariance({
      moments: makeMoments(1000, 0.96, 0.02),
      targetRtp: 0.96,
    });
    expect(r.deviationSigma).toBeCloseTo(0, 9);
  });
});

describe('profileVariance — guards', () => {
  it('rejects n < 2', () => {
    expect(() => profileVariance({ moments: { n: 1, mean: 0.96, m2: 0 }, targetRtp: 0.96 })).toThrow(RangeError);
  });
  it('rejects targetRtp out of range', () => {
    expect(() => profileVariance({ moments: makeMoments(10, 0.96, 0.01), targetRtp: -0.1 })).toThrow(RangeError);
    expect(() => profileVariance({ moments: makeMoments(10, 0.96, 0.01), targetRtp: 2.5 })).toThrow(RangeError);
  });
  it('rejects negative tolerance', () => {
    expect(() =>
      profileVariance({
        moments: makeMoments(10, 0.96, 0.01),
        targetRtp: 0.96,
        toleranceHalfWidth: -0.01,
      }),
    ).toThrow(RangeError);
  });
  it('rejects non-finite mean', () => {
    expect(() =>
      profileVariance({ moments: { n: 10, mean: Infinity, m2: 1 }, targetRtp: 0.96 }),
    ).toThrow(TypeError);
  });
  it('rejects negative m2', () => {
    expect(() =>
      profileVariance({ moments: { n: 10, mean: 0.96, m2: -1 }, targetRtp: 0.96 }),
    ).toThrow(RangeError);
  });
});

describe('profileVariance — analyticalSigma override', () => {
  it('uses caller-provided analyticalSigma', () => {
    const r = profileVariance({
      moments: makeMoments(1000, 0.96, 0.02),
      targetRtp: 0.96,
      analyticalSigma: 0.018,
    });
    expect(r.expectedSigma).toBe(0.018);
  });
  it('falls back to binomial approximation', () => {
    const r = profileVariance({
      moments: makeMoments(1000, 0.96, 0.02),
      targetRtp: 0.96,
    });
    // sqrt(0.96 * 0.04) ≈ 0.196
    expect(r.expectedSigma).toBeCloseTo(Math.sqrt(0.96 * 0.04), 6);
  });
});

describe('varianceGate', () => {
  it('passes on healthy stats', () => {
    const g = varianceGate({
      moments: makeMoments(10000, 0.96, 0.196),
      targetRtp: 0.96,
      toleranceHalfWidth: 0.01,
    });
    expect(g.passed).toBe(true);
    expect(g.failureBits).toBe(0);
  });
  it('fails on RTP out of tolerance', () => {
    const g = varianceGate({
      moments: makeMoments(10000, 0.99, 0.02),
      targetRtp: 0.96,
      toleranceHalfWidth: 0.005,
    });
    expect(g.passed).toBe(false);
    expect(g.failureBits & VARIANCE_GATE_BITS.RTP_OUT_OF_TOLERANCE).not.toBe(0);
  });
  it('fails on sigma out of tolerance', () => {
    const g = varianceGate({
      moments: makeMoments(10000, 0.96, 0.5), // way off binomial expected ~0.196
      targetRtp: 0.96,
      toleranceHalfWidth: 0.01,
      analyticalSigma: 0.196,
    });
    expect(g.failureBits & VARIANCE_GATE_BITS.SIGMA_OUT_OF_TOLERANCE).not.toBe(0);
  });
  it('exposes structured failure reasons', () => {
    const g = varianceGate({
      moments: makeMoments(10000, 0.99, 0.02),
      targetRtp: 0.96,
      toleranceHalfWidth: 0.005,
    });
    expect(g.failureReasons.length).toBeGreaterThan(0);
    expect(g.failureReasons[0]).toMatch(/outside band/);
  });
});
