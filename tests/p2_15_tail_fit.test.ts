/**
 * W152 P2-15 — Max-win cap math + EVT tail fit.
 *
 * Validates the regulator-facing primitives in `src/statistics/tailFit.ts`:
 *   1. `clipDistribution` produces the three numbers a PAR sheet needs.
 *   2. `fitParetoTail` MLE recovers the true alpha on synthetic Pareto data.
 *   3. `evtTailQuantile` inverts the fit consistently.
 */

import { describe, expect, it } from 'vitest';
import {
  clipDistribution,
  fitParetoTail,
  evtTailQuantile,
  type TailWinEntry,
} from '../src/statistics/tailFit.js';

describe('P2-15 — clipDistribution', () => {
  it('returns RTP unchanged when cap is above the support', () => {
    const wins: TailWinEntry[] = [
      { value: 0, probability: 0.7 },
      { value: 1, probability: 0.2 },
      { value: 10, probability: 0.09 },
      { value: 100, probability: 0.01 },
    ];
    const cap = 1_000;
    const res = clipDistribution(wins, cap);
    expect(res.capActive).toBe(false);
    expect(res.probabilityMassAbove).toBe(0);
    expect(Number.isNaN(res.conditionalMeanAbove)).toBe(true);
    expect(res.rtpCapped).toBeCloseTo(res.rtpUncapped, 12);
    expect(res.rtpLost).toBeCloseTo(0, 12);
  });

  it('clips a single tail entry exactly at the cap value', () => {
    const wins: TailWinEntry[] = [
      { value: 0, probability: 0.5 },
      { value: 100, probability: 0.4 },
      { value: 10_000, probability: 0.1 },
    ];
    const cap = 5_000;
    const res = clipDistribution(wins, cap);
    expect(res.capActive).toBe(true);
    expect(res.probabilityMassAbove).toBeCloseTo(0.1, 12);
    expect(res.conditionalMeanAbove).toBeCloseTo(10_000, 12);
    // rtpUncapped = 0.5×0 + 0.4×100 + 0.1×10000 = 40 + 1000 = 1040
    expect(res.rtpUncapped).toBeCloseTo(1040, 9);
    // rtpCapped   = 0.5×0 + 0.4×100 + 0.1×5000 = 40 + 500 = 540
    expect(res.rtpCapped).toBeCloseTo(540, 9);
    expect(res.rtpLost).toBeCloseTo(500, 9);
  });

  it('normalises probability mass when input is un-normalised', () => {
    const wins: TailWinEntry[] = [
      { value: 0, probability: 7 }, // un-normalised counts
      { value: 100, probability: 3 },
    ];
    const res = clipDistribution(wins, 200);
    expect(res.rtpUncapped).toBeCloseTo(0.7 * 0 + 0.3 * 100, 9);
  });

  it('rejects negative cap', () => {
    expect(() => clipDistribution([], -5)).toThrow(/cap must be a non-negative/);
  });

  it('rejects negative probability', () => {
    expect(() =>
      clipDistribution([{ value: 1, probability: -0.1 }], 100),
    ).toThrow(/negative or NaN probability/);
  });

  it('empty distribution returns all-zero result', () => {
    const res = clipDistribution([], 1_000);
    expect(res.rtpCapped).toBe(0);
    expect(res.rtpUncapped).toBe(0);
    expect(res.probabilityMassAbove).toBe(0);
    expect(res.capActive).toBe(false);
  });

  it('uses strict inequality at the cap boundary (value === cap NOT clipped)', () => {
    const wins: TailWinEntry[] = [
      { value: 100, probability: 1 },
    ];
    const res = clipDistribution(wins, 100);
    expect(res.capActive).toBe(false);
    expect(res.rtpCapped).toBeCloseTo(100, 12);
  });
});

describe('P2-15 — fitParetoTail (POT MLE)', () => {
  function generatePareto(n: number, alpha: number, xm: number, seed: number): number[] {
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const samples = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const u = Math.max(1e-9, 1 - next());
      samples[i] = xm * Math.pow(u, -1 / alpha);
    }
    return samples;
  }

  it('recovers true alpha within 10 % on synthetic data (alpha=2.0, n=5000)', () => {
    const samples = generatePareto(5_000, 2.0, 10, 0xCAFEBABE);
    const fit = fitParetoTail(samples, 10);
    expect(Math.abs(fit.alpha - 2.0) / 2.0).toBeLessThan(0.1);
    expect(fit.xm).toBe(10);
    expect(fit.tailCount).toBe(5_000);
  });

  it('recovers true alpha within 15 % on heavier tail (alpha=1.2, n=3000)', () => {
    const samples = generatePareto(3_000, 1.2, 5, 0xDEADBEEF);
    const fit = fitParetoTail(samples, 5);
    expect(Math.abs(fit.alpha - 1.2) / 1.2).toBeLessThan(0.15);
  });

  it('throws when fewer than 5 samples survive the threshold', () => {
    expect(() => fitParetoTail([1, 2, 3, 4, 5], 10)).toThrow(
      /at least 5 samples above threshold/,
    );
  });

  it('throws on non-positive threshold', () => {
    expect(() => fitParetoTail([1, 2, 3, 10], 0)).toThrow(/threshold must be > 0/);
  });

  it('KS p-value is reported and in [0, 1]', () => {
    const samples = generatePareto(1_000, 2.0, 10, 0x1234_5678);
    const fit = fitParetoTail(samples, 10, { bootstrapReps: 100 });
    expect(fit.ksPValue).toBeGreaterThanOrEqual(0);
    expect(fit.ksPValue).toBeLessThanOrEqual(1);
    expect(fit.ksStatistic).toBeGreaterThan(0);
  });

  it('good-fit synthetic data produces non-rejecting p-value (>0.05)', () => {
    const samples = generatePareto(2_000, 2.0, 10, 0xABCD_EF01);
    const fit = fitParetoTail(samples, 10, { bootstrapReps: 200 });
    expect(fit.ksPValue).toBeGreaterThan(0.05);
  });
});

describe('P2-15 — evtTailQuantile', () => {
  it('inverts the fitted CDF: P(X > q(p)) = p', () => {
    // For Pareto, the quantile at exceedance probability p is xm × p^(-1/alpha).
    const x = evtTailQuantile(2.0, 10, 0.01);
    // alpha=2, xm=10, q=0.01 → 10 × 0.01^(-0.5) = 10 × 10 = 100
    expect(x).toBeCloseTo(100, 9);
  });

  it('returns xm for q > 1 (degenerate clamp)', () => {
    expect(evtTailQuantile(2.0, 50, 1.5)).toBe(50);
  });

  it('rejects non-positive alpha', () => {
    expect(() => evtTailQuantile(0, 1, 0.5)).toThrow(/alpha must be > 0/);
  });

  it('rejects non-positive xm', () => {
    expect(() => evtTailQuantile(2, 0, 0.5)).toThrow(/xm must be > 0/);
  });
});
