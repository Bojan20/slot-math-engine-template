import { describe, it, expect } from 'vitest';
import {
  antitheticUniforms,
  vanDerCorputBase2,
  sobol1d,
  controlVariateBeta,
  applyControlVariate,
} from '../src/sim/varianceReduction.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function mean(xs: number[]): number {
  let s = 0;
  for (const v of xs) s += v;
  return s / xs.length;
}

function variance(xs: number[]): number {
  const m = mean(xs);
  let s = 0;
  for (const v of xs) s += (v - m) ** 2;
  return s / (xs.length - 1);
}

// ─── antithetic ───────────────────────────────────────────────────────────────

describe('antitheticUniforms', () => {
  it('produces 2n samples, each pair summing to 1', () => {
    const samples = antitheticUniforms(100, makeLcg(1));
    expect(samples.length).toBe(200);
    for (let i = 0; i < 100; i++) {
      const u = samples[2 * i];
      const v = samples[2 * i + 1];
      expect(u + v).toBeCloseTo(1, 12);
    }
  });

  it('reduces variance for a monotone integrand vs naive sampling', () => {
    const N = 10_000;
    const f = (u: number) => Math.exp(u); // monotone in u

    const rngA = makeLcg(99);
    const rngB = makeLcg(99);
    const antithetic = antitheticUniforms(N, rngA);
    const antiF = antithetic.map(f);
    // Pair-mean for fair comparison.
    const antiPairMeans: number[] = [];
    for (let i = 0; i < N; i++) {
      antiPairMeans.push((antiF[2 * i] + antiF[2 * i + 1]) / 2);
    }
    const naiveF: number[] = [];
    for (let i = 0; i < N; i++) naiveF.push(f(rngB()));

    expect(variance(antiPairMeans)).toBeLessThan(variance(naiveF) * 0.5);
  });

  it('rejects non-integer / negative n', () => {
    expect(() => antitheticUniforms(-1, makeLcg(1))).toThrow(/non-negative integer/);
    expect(() => antitheticUniforms(1.5, makeLcg(1))).toThrow(/non-negative integer/);
  });

  it('n=0 returns empty array', () => {
    expect(antitheticUniforms(0, makeLcg(1))).toEqual([]);
  });
});

// ─── van der Corput ───────────────────────────────────────────────────────────

describe('vanDerCorputBase2', () => {
  it('produces the canonical first few values', () => {
    // For i=0..7, the base-2 van der Corput sequence is
    // 0, 0.5, 0.25, 0.75, 0.125, 0.625, 0.375, 0.875
    expect(vanDerCorputBase2(0)).toBe(0);
    expect(vanDerCorputBase2(1)).toBe(0.5);
    expect(vanDerCorputBase2(2)).toBe(0.25);
    expect(vanDerCorputBase2(3)).toBe(0.75);
    expect(vanDerCorputBase2(4)).toBe(0.125);
    expect(vanDerCorputBase2(5)).toBe(0.625);
  });

  it('output is in [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const v = vanDerCorputBase2(i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('rejects negative / non-integer input', () => {
    expect(() => vanDerCorputBase2(-1)).toThrow(/non-negative integer/);
    expect(() => vanDerCorputBase2(0.5)).toThrow(/non-negative integer/);
  });

  it('determinism', () => {
    expect(vanDerCorputBase2(42)).toBe(vanDerCorputBase2(42));
  });
});

// ─── sobol1d ──────────────────────────────────────────────────────────────────

describe('sobol1d', () => {
  it('returns n elements', () => {
    expect(sobol1d(10).length).toBe(10);
  });

  it('default skip is 1 (skips zero)', () => {
    expect(sobol1d(1)[0]).toBe(0.5);
  });

  it('explicit skip 0 yields the raw sequence including 0', () => {
    expect(sobol1d(3, 0)).toEqual([0, 0.5, 0.25]);
  });

  it('rejects negative n / skip', () => {
    expect(() => sobol1d(-1)).toThrow(/non-negative integer/);
    expect(() => sobol1d(1, -1)).toThrow(/skip must be a non-negative integer/);
  });

  it('mean across N=1024 Sobol points ≈ 0.5 (uniform distribution)', () => {
    const xs = sobol1d(1024);
    expect(Math.abs(mean(xs) - 0.5)).toBeLessThan(0.01);
  });

  it('Sobol estimator has lower discrepancy than pseudo-random for smooth integrand', () => {
    // ∫₀¹ f(u) du = 1/3 for f(u)=u². Sobol should converge faster.
    const N = 256;
    const f = (u: number) => u * u;
    const sobolMean = mean(sobol1d(N).map(f));
    const rng = makeLcg(1);
    const prMean = mean(Array.from({ length: N }, () => f(rng())));
    expect(Math.abs(sobolMean - 1 / 3)).toBeLessThan(Math.abs(prMean - 1 / 3));
  });
});

// ─── control variate ──────────────────────────────────────────────────────────

describe('controlVariateBeta', () => {
  it('returns 0 for perfectly anti-correlated arrays where var(x)=0', () => {
    expect(controlVariateBeta([1, 2, 3], [5, 5, 5])).toBe(0);
  });

  it('returns 0 for n<2 input', () => {
    expect(controlVariateBeta([1], [2])).toBe(0);
  });

  it('returns 1 for y === x (identical)', () => {
    expect(controlVariateBeta([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1, 12);
  });

  it('throws on length mismatch', () => {
    expect(() => controlVariateBeta([1, 2], [1])).toThrow(/same length/);
  });
});

describe('applyControlVariate', () => {
  it('reduces variance when y is strongly correlated with known x', () => {
    // y_i = 2x_i + noise — control variate should remove most variance.
    const N = 5000;
    const rng = makeLcg(7);
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < N; i++) {
      const xi = rng();
      x.push(xi);
      y.push(2 * xi + rng() * 0.01); // small i.i.d noise
    }
    const r = applyControlVariate({ y, x, expectedX: 0.5 });
    expect(r.varianceReductionPct).toBeGreaterThan(0.95);
    expect(r.beta).toBeCloseTo(2, 1);
  });

  it('adjusted mean equals raw mean when E[X] is the true mean of x', () => {
    const rng = makeLcg(1);
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const xi = rng();
      x.push(xi);
      y.push(3 * xi);
    }
    const eX = mean(x); // perfectly known
    const r = applyControlVariate({ y, x, expectedX: eX });
    expect(mean(y)).toBeCloseTo(mean([...r.adjustedY]), 5);
  });

  it('returns 0 reduction for empty input', () => {
    const r = applyControlVariate({ y: [], x: [], expectedX: 0 });
    expect(r.adjustedY).toEqual([]);
    expect(r.varianceReductionPct).toBe(0);
    expect(r.beta).toBe(0);
  });

  it('throws on length mismatch', () => {
    expect(() =>
      applyControlVariate({ y: [1], x: [1, 2], expectedX: 0 })
    ).toThrow(/same length/);
  });

  it('varianceReductionPct is in [0, 1]', () => {
    // Random uncorrelated arrays — reduction should be ≈ 0, not negative.
    const rng = makeLcg(33);
    const x = Array.from({ length: 500 }, () => rng());
    const y = Array.from({ length: 500 }, () => rng());
    const r = applyControlVariate({ y, x, expectedX: 0.5 });
    expect(r.varianceReductionPct).toBeGreaterThanOrEqual(0);
    expect(r.varianceReductionPct).toBeLessThanOrEqual(1);
  });
});
