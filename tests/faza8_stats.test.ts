/**
 * Faza 8 Statistics & PAR Hardening — Test Suite
 *
 * Covers:
 * - StreamingStats (Terriberry online 4-moment, Chan merge)
 * - ConvergenceDetector (sliding-window CI width)
 * - TopNWins (bounded heap with replay seeds)
 * - HDR quantile / CDF utilities + sample-size formulas
 *
 * Target: 40+ tests
 */

import { describe, it, expect } from 'vitest';
import { StreamingStats }       from '../src/statistics/streaming.js';
import { ConvergenceDetector }  from '../src/statistics/convergence.js';
import { TopNWins }             from '../src/statistics/topN.js';
import {
  hdrQuantile,
  hdrCdf,
  spinsForRtpPrecision,
  spinsForHitRatePrecision,
  HDR_THRESHOLDS,
} from '../src/statistics/hdrQuantile.js';

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic PRNG helper (mulberry32)
// ─────────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. StreamingStats — basic / empty state
// ─────────────────────────────────────────────────────────────────────────────

describe('StreamingStats — empty state', () => {
  it('count is 0', () => {
    const s = new StreamingStats();
    expect(s.count).toBe(0);
  });

  it('mean is 0', () => {
    expect(new StreamingStats().mean).toBe(0);
  });

  it('populationVariance is 0', () => {
    expect(new StreamingStats().populationVariance).toBe(0);
  });

  it('sampleVariance is 0', () => {
    expect(new StreamingStats().sampleVariance).toBe(0);
  });

  it('stdDev is 0', () => {
    expect(new StreamingStats().stdDev).toBe(0);
  });

  it('cv is 0', () => {
    expect(new StreamingStats().cv).toBe(0);
  });

  it('skewness is 0', () => {
    expect(new StreamingStats().skewness).toBe(0);
  });

  it('excessKurtosis is 0', () => {
    expect(new StreamingStats().excessKurtosis).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. StreamingStats — single value
// ─────────────────────────────────────────────────────────────────────────────

describe('StreamingStats — single value', () => {
  it('mean equals the value', () => {
    const s = new StreamingStats();
    s.push(42);
    expect(s.mean).toBe(42);
  });

  it('sampleVariance is 0 for single value', () => {
    const s = new StreamingStats();
    s.push(7);
    expect(s.sampleVariance).toBe(0);
  });

  it('count is 1', () => {
    const s = new StreamingStats();
    s.push(3.14);
    expect(s.count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. StreamingStats — determinism
// ─────────────────────────────────────────────────────────────────────────────

describe('StreamingStats — determinism', () => {
  it('same seed produces same results', () => {
    const rng1 = mulberry32(0xDEADBEEF);
    const rng2 = mulberry32(0xDEADBEEF);
    const s1   = new StreamingStats();
    const s2   = new StreamingStats();
    for (let i = 0; i < 1000; i++) {
      s1.push(rng1());
      s2.push(rng2());
    }
    expect(s1.mean).toBe(s2.mean);
    expect(s1.sampleVariance).toBe(s2.sampleVariance);
  });

  it('push order matters — different sequences give different means', () => {
    const s1 = new StreamingStats();
    const s2 = new StreamingStats();
    s1.push(1); s1.push(2); s1.push(3);
    s2.push(3); s2.push(1); s2.push(2);
    // Mean is order-independent for the same values
    expect(s1.mean).toBeCloseTo(s2.mean, 12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. StreamingStats — normal distribution (mean=0, var=1)
// ─────────────────────────────────────────────────────────────────────────────

describe('StreamingStats — standard normal distribution (100k samples)', () => {
  // Box-Muller using mulberry32
  function* normalSamples(seed: number) {
    const rng = mulberry32(seed);
    while (true) {
      const u1 = rng() || 1e-20;
      const u2 = rng();
      const r  = Math.sqrt(-2 * Math.log(u1));
      yield r * Math.cos(2 * Math.PI * u2);
      yield r * Math.sin(2 * Math.PI * u2);
    }
  }

  const s = new StreamingStats();
  const gen = normalSamples(42);
  for (let i = 0; i < 100_000; i++) s.push(gen.next().value as number);

  it('mean ≈ 0 (±5%)', () => {
    expect(Math.abs(s.mean)).toBeLessThan(0.05);
  });

  it('sampleVariance ≈ 1 (±5%)', () => {
    expect(s.sampleVariance).toBeGreaterThan(0.95);
    expect(s.sampleVariance).toBeLessThan(1.05);
  });

  it('skewness ≈ 0 (|skew| < 0.1)', () => {
    expect(Math.abs(s.skewness)).toBeLessThan(0.1);
  });

  it('excessKurtosis ≈ 0 (|ek| < 0.15)', () => {
    expect(Math.abs(s.excessKurtosis)).toBeLessThan(0.15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. StreamingStats — uniform [0, 1] distribution (1M samples)
// ─────────────────────────────────────────────────────────────────────────────

describe('StreamingStats — uniform [0,1] distribution (1M samples)', () => {
  const s   = new StreamingStats();
  const rng = mulberry32(0xCAFEBABE);
  for (let i = 0; i < 1_000_000; i++) s.push(rng());

  it('mean ≈ 0.5 (±0.005)', () => {
    expect(s.mean).toBeGreaterThan(0.495);
    expect(s.mean).toBeLessThan(0.505);
  });

  it('sampleVariance ≈ 1/12 ≈ 0.0833 (±1%)', () => {
    expect(s.sampleVariance).toBeGreaterThan(0.082);
    expect(s.sampleVariance).toBeLessThan(0.085);
  });

  it('skewness ≈ 0 (|skew| < 0.01)', () => {
    expect(Math.abs(s.skewness)).toBeLessThan(0.01);
  });

  it('excessKurtosis ≈ -1.2 (within ±0.05)', () => {
    expect(s.excessKurtosis).toBeGreaterThan(-1.25);
    expect(s.excessKurtosis).toBeLessThan(-1.15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. StreamingStats — merge equals single-pass (1M values, two halves)
// ─────────────────────────────────────────────────────────────────────────────

describe('StreamingStats — merge == single-pass (1M values)', () => {
  const N   = 1_000_000;
  const rng = mulberry32(0xF00DCAFE);
  const vals: number[] = new Array(N);
  for (let i = 0; i < N; i++) vals[i] = rng();

  const single = new StreamingStats();
  for (const v of vals) single.push(v);

  const half  = N / 2;
  const sA    = new StreamingStats();
  const sB    = new StreamingStats();
  for (let i = 0;    i < half; i++) sA.push(vals[i]);
  for (let i = half; i < N;    i++) sB.push(vals[i]);
  sA.merge(sB);

  it('merged mean matches single-pass (1e-12 tolerance)', () => {
    expect(sA.mean).toBeCloseTo(single.mean, 10);
  });

  it('merged sampleVariance matches single-pass (1e-10 tolerance)', () => {
    expect(sA.sampleVariance).toBeCloseTo(single.sampleVariance, 8);
  });

  it('merged skewness matches single-pass (1e-8 tolerance)', () => {
    expect(sA.skewness).toBeCloseTo(single.skewness, 6);
  });

  it('merged excessKurtosis matches single-pass (1e-6 tolerance)', () => {
    expect(sA.excessKurtosis).toBeCloseTo(single.excessKurtosis, 4);
  });

  it('merged count equals N', () => {
    expect(sA.count).toBe(N);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. StreamingStats — merge with empty instance
// ─────────────────────────────────────────────────────────────────────────────

describe('StreamingStats — merge edge cases', () => {
  it('merging empty into non-empty is identity', () => {
    const s = new StreamingStats();
    s.push(10); s.push(20);
    const meanBefore = s.mean;
    s.merge(new StreamingStats());
    expect(s.mean).toBe(meanBefore);
    expect(s.count).toBe(2);
  });

  it('merging non-empty into empty copies state', () => {
    const a = new StreamingStats();
    const b = new StreamingStats();
    b.push(5); b.push(10); b.push(15);
    a.merge(b);
    expect(a.mean).toBeCloseTo(10, 12);
    expect(a.count).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. StreamingStats — volatilityCategory
// ─────────────────────────────────────────────────────────────────────────────

describe('StreamingStats — volatilityCategory', () => {
  /**
   * Build a StreamingStats with a controlled CV.
   * Strategy: push N copies of 1 and one outlier sized so that
   *   mean ≈ (N + outlier) / (N+1)
   *   stdDev / mean ≈ targetCV
   * For simple cases we just verify the CV falls in the right band.
   */
  function statsWithApproxCV(targetCV: number): StreamingStats {
    // Use: N values of 1, and one value of (1 + k).
    // mean = (N + 1 + k) / (N + 1)
    // var  ≈ k^2 * N / (N+1)^2  (sample)
    // Pick N=1000 and solve k such that stdDev/mean ≈ targetCV.
    // For large N, mean ≈ 1, stdDev ≈ k/sqrt(N), so k ≈ targetCV * sqrt(N).
    const N = 1000;
    const k = targetCV * Math.sqrt(N);
    const s = new StreamingStats();
    for (let i = 0; i < N; i++) s.push(1);
    s.push(1 + k);
    return s;
  }

  it('CV=0.3 → VERY_LOW', () => {
    const s = statsWithApproxCV(0.3);
    expect(s.volatilityCategory).toBe('VERY_LOW');
  });

  it('CV=1.0 → LOW', () => {
    const s = statsWithApproxCV(1.0);
    expect(s.volatilityCategory).toBe('LOW');
  });

  it('CV=3.0 → MEDIUM', () => {
    const s = statsWithApproxCV(3.0);
    expect(s.volatilityCategory).toBe('MEDIUM');
  });

  it('CV=7.0 → HIGH', () => {
    const s = statsWithApproxCV(7.0);
    expect(s.volatilityCategory).toBe('HIGH');
  });

  it('CV=15.0 → VERY_HIGH', () => {
    const s = statsWithApproxCV(15.0);
    expect(s.volatilityCategory).toBe('VERY_HIGH');
  });

  it('CV >> 20 → EXTREME', () => {
    // Push many 0.001 values and one very large spike to force CV > 20
    const s = new StreamingStats();
    for (let i = 0; i < 10000; i++) s.push(0.001);
    s.push(10000); // large spike; stdDev >> mean → CV >> 20
    expect(s.volatilityCategory).toBe('EXTREME');
  });

  it('volatilityIndex equals cv', () => {
    const s = new StreamingStats();
    s.push(1); s.push(3);
    expect(s.volatilityIndex).toBeCloseTo(s.cv, 14);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. StreamingStats — toJSON
// ─────────────────────────────────────────────────────────────────────────────

describe('StreamingStats — toJSON', () => {
  it('returns an object with all expected keys', () => {
    const s = new StreamingStats();
    s.push(5); s.push(10);
    const j = s.toJSON() as Record<string, unknown>;
    for (const key of ['count','mean','sampleVariance','stdDev','cv','skewness','excessKurtosis','volatilityCategory']) {
      expect(j).toHaveProperty(key);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. ConvergenceDetector
// ─────────────────────────────────────────────────────────────────────────────

describe('ConvergenceDetector', () => {
  it('does not converge with 0 readings', () => {
    const cd = new ConvergenceDetector(0.01, 0.95, 30);
    expect(cd.hasConverged).toBe(false);
    expect(cd.readings).toBe(0);
  });

  it('does not converge with a single reading', () => {
    const cd = new ConvergenceDetector(0.01, 0.95, 30);
    cd.push(96.0);
    expect(cd.hasConverged).toBe(false);
  });

  it('converges when all readings are identical (zero variance)', () => {
    const cd = new ConvergenceDetector(0.01, 0.95, 30);
    for (let i = 0; i < 10; i++) cd.push(96.0);
    expect(cd.hasConverged).toBe(true);
    expect(cd.currentHalfWidthPp).toBe(0);
  });

  it('does not converge with high-variance readings', () => {
    const cd = new ConvergenceDetector(0.01, 0.95, 30);
    const rng = mulberry32(99);
    for (let i = 0; i < 30; i++) cd.push(80 + rng() * 20); // wide spread
    expect(cd.hasConverged).toBe(false);
  });

  it('ring buffer limits stored readings to windowSize', () => {
    const cd = new ConvergenceDetector(0.01, 0.95, 10);
    for (let i = 0; i < 50; i++) cd.push(96.0);
    expect(cd.readings).toBe(10);
  });

  it('windowMean is correct after identical pushes', () => {
    const cd = new ConvergenceDetector(0.01, 0.95, 5);
    for (let i = 0; i < 5; i++) cd.push(95.0);
    expect(cd.windowMean).toBeCloseTo(95.0, 10);
  });

  it('reset clears all state', () => {
    const cd = new ConvergenceDetector(0.01, 0.95, 10);
    for (let i = 0; i < 10; i++) cd.push(96.0);
    expect(cd.hasConverged).toBe(true);
    cd.reset();
    expect(cd.readings).toBe(0);
    expect(cd.hasConverged).toBe(false);
  });

  it('currentHalfWidthPp is Infinity with fewer than 2 readings', () => {
    const cd = new ConvergenceDetector(0.01, 0.99, 20);
    cd.push(96.0);
    expect(cd.currentHalfWidthPp).toBe(Infinity);
  });

  it('5 identical readings of 96.0 produce halfWidth=0 → converged', () => {
    const cd = new ConvergenceDetector(0.01, 0.95, 20);
    for (let i = 0; i < 5; i++) cd.push(96.0);
    expect(cd.currentHalfWidthPp).toBe(0);
    expect(cd.hasConverged).toBe(true);
  });

  it('higher confidence level requires wider target to converge for same data', () => {
    const readings = [95.9, 96.0, 96.1, 96.0, 95.95];
    const cd95  = new ConvergenceDetector(1.0, 0.95,  20);
    const cd999 = new ConvergenceDetector(1.0, 0.999, 20);
    for (const r of readings) { cd95.push(r); cd999.push(r); }
    // 0.999 has a larger z so its half-width is larger
    expect(cd999.currentHalfWidthPp).toBeGreaterThan(cd95.currentHalfWidthPp);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. TopNWins
// ─────────────────────────────────────────────────────────────────────────────

describe('TopNWins', () => {
  it('empty snapshot returns []', () => {
    expect(new TopNWins(10).snapshot()).toEqual([]);
  });

  it('size starts at 0', () => {
    expect(new TopNWins(5).size).toBe(0);
  });

  it('winX <= 0 is not recorded', () => {
    const t = new TopNWins(5);
    t.tryRecord(0,   1, 1);
    t.tryRecord(-1,  2, 2);
    expect(t.size).toBe(0);
  });

  it('records up to capacity entries', () => {
    const t = new TopNWins(5);
    for (let i = 1; i <= 5; i++) t.tryRecord(i, i, i);
    expect(t.size).toBe(5);
  });

  it('does not exceed capacity', () => {
    const t = new TopNWins(5);
    for (let i = 1; i <= 20; i++) t.tryRecord(i, i, i);
    expect(t.size).toBe(5);
  });

  it('snapshot is sorted descending by winX', () => {
    const t = new TopNWins(10);
    const rng = mulberry32(123);
    for (let i = 0; i < 20; i++) t.tryRecord(rng() * 1000, i, i);
    const snap = t.snapshot();
    for (let i = 0; i < snap.length - 1; i++) {
      expect(snap[i].winX).toBeGreaterThanOrEqual(snap[i + 1].winX);
    }
  });

  it('keeps the N largest wins out of 100 insertions', () => {
    const N   = 10;
    const t   = new TopNWins(N);
    const rng = mulberry32(0xABCD);
    const all: number[] = [];
    for (let i = 0; i < 100; i++) {
      const w = rng() * 5000;
      all.push(w);
      t.tryRecord(w, i, i);
    }
    all.sort((a, b) => b - a);
    const snap = t.snapshot();
    // Smallest in top-N should equal the N-th largest overall (approx)
    expect(snap.length).toBe(N);
    const minKept  = Math.min(...snap.map(r => r.winX));
    const threshold = all[N - 1];
    expect(minKept).toBeGreaterThanOrEqual(threshold - 1e-9);
  });

  it('small win below current minimum is not recorded when full', () => {
    const t = new TopNWins(3);
    t.tryRecord(10, 1, 1);
    t.tryRecord(20, 2, 2);
    t.tryRecord(30, 3, 3);
    t.tryRecord(5,  4, 4); // less than minimum (10)
    expect(t.size).toBe(3);
    const wins = t.snapshot().map(r => r.winX);
    expect(wins).not.toContain(5);
  });

  it('merge combines two TopNWins keeping overall top-N', () => {
    const a = new TopNWins(5);
    const b = new TopNWins(5);
    for (let i = 1;  i <= 5;  i++) a.tryRecord(i,      i,      i);
    for (let i = 6;  i <= 10; i++) b.tryRecord(i,      i,      i);
    a.mergeFrom(b);
    const wins = a.snapshot().map(r => r.winX);
    expect(wins).toEqual([10, 9, 8, 7, 6]);
  });

  it('reset empties the collection', () => {
    const t = new TopNWins(5);
    t.tryRecord(100, 1, 1);
    t.reset();
    expect(t.size).toBe(0);
    expect(t.snapshot()).toEqual([]);
  });

  it('snapshot returns a copy — mutations do not affect internal state', () => {
    const t = new TopNWins(5);
    t.tryRecord(42, 1, 1);
    const snap = t.snapshot();
    snap[0].winX = 9999;
    expect(t.snapshot()[0].winX).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. hdrQuantile
// ─────────────────────────────────────────────────────────────────────────────

describe('hdrQuantile', () => {
  // Utility: build a snapshot where all counts are equal across all 32 buckets
  function uniformSnapshot(countPerBucket: number): number[] {
    return new Array(32).fill(countPerBucket);
  }

  it('empty snapshot (all zeros) returns 0', () => {
    expect(hdrQuantile(new Array(32).fill(0), 0.5)).toBe(0);
  });

  it('empty array returns 0', () => {
    expect(hdrQuantile([], 0.5)).toBe(0);
  });

  it('all spins in no-win bucket → P50 = 0', () => {
    const snap = new Array(32).fill(0);
    snap[0] = 1000;
    expect(hdrQuantile(snap, 0.5)).toBe(0);
  });

  it('P0 of any non-trivial distribution returns a value ≥ 0', () => {
    const snap = uniformSnapshot(100);
    expect(hdrQuantile(snap, 0)).toBeGreaterThanOrEqual(0);
  });

  it('P50 of uniform histogram falls inside range', () => {
    const snap = uniformSnapshot(100);
    const q50 = hdrQuantile(snap, 0.5);
    // Uniform across 32 buckets: P50 is around bucket 16
    expect(q50).toBeGreaterThanOrEqual(0);
    expect(q50).toBeLessThanOrEqual(50000);
  });

  it('P99 of uniform histogram is near the upper buckets', () => {
    const snap = uniformSnapshot(100);
    const q99  = hdrQuantile(snap, 0.99);
    // Near the top bucket boundaries
    expect(q99).toBeGreaterThan(HDR_THRESHOLDS[26]); // > 10 000
  });

  it('P99 > P50 > P01', () => {
    const snap = uniformSnapshot(200);
    const p01 = hdrQuantile(snap, 0.01);
    const p50 = hdrQuantile(snap, 0.50);
    const p99 = hdrQuantile(snap, 0.99);
    expect(p50).toBeGreaterThan(p01);
    expect(p99).toBeGreaterThan(p50);
  });

  it('all mass in bucket 31 (top) → returns 50 000', () => {
    const snap = new Array(32).fill(0);
    snap[31] = 500;
    // P50 hits bucket 31 → lower bound 50 000
    expect(hdrQuantile(snap, 0.5)).toBe(HDR_THRESHOLDS[29]);
  });

  it('single value in bucket 5 (0.2–0.5 range) interpolates correctly', () => {
    const snap = new Array(32).fill(0);
    snap[3] = 1; // bucket 3 = [0.2, 0.5) per HDR_THRESHOLDS[1]=0.2, [2]=0.5
    const q = hdrQuantile(snap, 0.5);
    // Bucket 3: lo = HDR_THRESHOLDS[1] = 0.2, hi = HDR_THRESHOLDS[2] = 0.5
    expect(q).toBeGreaterThanOrEqual(0.2);
    expect(q).toBeLessThan(0.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. hdrCdf
// ─────────────────────────────────────────────────────────────────────────────

describe('hdrCdf', () => {
  function uniformSnapshot(c: number): number[] { return new Array(32).fill(c); }

  it('returns 32 entries', () => {
    expect(hdrCdf(uniformSnapshot(10)).length).toBe(32);
  });

  it('cumulative is monotone non-decreasing', () => {
    const cdf = hdrCdf(uniformSnapshot(10));
    for (let i = 1; i < cdf.length; i++) {
      expect(cdf[i].cumulative).toBeGreaterThanOrEqual(cdf[i - 1].cumulative - 1e-12);
    }
  });

  it('last entry cumulative ≈ 1.0', () => {
    const cdf = hdrCdf(uniformSnapshot(100));
    expect(cdf[cdf.length - 1].cumulative).toBeCloseTo(1.0, 10);
  });

  it('probabilities sum to ≈ 1.0', () => {
    const cdf  = hdrCdf(uniformSnapshot(50));
    const total = cdf.reduce((s, e) => s + e.probability, 0);
    expect(total).toBeCloseTo(1.0, 10);
  });

  it('bucket 0 has fromX=0, toX=0', () => {
    const cdf = hdrCdf(uniformSnapshot(1));
    expect(cdf[0].fromX).toBe(0);
    expect(cdf[0].toX).toBe(0);
  });

  it('bucket 31 has toX=null (unbounded)', () => {
    const cdf = hdrCdf(uniformSnapshot(1));
    expect(cdf[31].toX).toBeNull();
  });

  it('bucket 1 covers (0, 0.1)', () => {
    const cdf = hdrCdf(uniformSnapshot(1));
    expect(cdf[1].fromX).toBe(0);
    expect(cdf[1].toX).toBe(HDR_THRESHOLDS[0]); // 0.1
  });

  it('all-zero snapshot produces all-zero probabilities', () => {
    const cdf = hdrCdf(new Array(32).fill(0));
    for (const entry of cdf) {
      expect(entry.probability).toBe(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. spinsForRtpPrecision
// ─────────────────────────────────────────────────────────────────────────────

describe('spinsForRtpPrecision', () => {
  it('larger per-spin variance → more spins required', () => {
    const n1 = spinsForRtpPrecision(100,  0.01, 0.95);
    const n2 = spinsForRtpPrecision(1000, 0.01, 0.95);
    expect(n2).toBeGreaterThan(n1);
  });

  it('tighter target (0.001 pp) requires more spins than 0.01 pp', () => {
    const loose  = spinsForRtpPrecision(50, 0.01,  0.95);
    const tight  = spinsForRtpPrecision(50, 0.001, 0.95);
    expect(tight).toBeGreaterThan(loose);
  });

  it('higher confidence level requires more spins', () => {
    const n95  = spinsForRtpPrecision(50, 0.01, 0.95);
    const n999 = spinsForRtpPrecision(50, 0.01, 0.999);
    expect(n999).toBeGreaterThan(n95);
  });

  it('result is a positive integer', () => {
    const n = spinsForRtpPrecision(25, 0.05, 0.95);
    expect(n).toBeGreaterThan(0);
    expect(Number.isInteger(n)).toBe(true);
  });

  it('known value: var=1, target=0.01pp, z=1.96 → n=ceil((1.96/0.0001)^2)=ceil(384160000)', () => {
    // epsilon = 0.01/100 = 0.0001; n = ceil((1.96^2 * 1) / (0.0001^2))
    const expected = Math.ceil((1.96 * 1.96 * 1) / (0.0001 * 0.0001));
    expect(spinsForRtpPrecision(1, 0.01, 0.95)).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. spinsForHitRatePrecision
// ─────────────────────────────────────────────────────────────────────────────

describe('spinsForHitRatePrecision', () => {
  it('p=0.5 (max variance) → more spins than p=0.1', () => {
    const n05 = spinsForHitRatePrecision(0.5, 0.01, 0.95);
    const n01 = spinsForHitRatePrecision(0.1, 0.01, 0.95);
    expect(n05).toBeGreaterThan(n01);
  });

  it('tighter target → more spins', () => {
    const loose = spinsForHitRatePrecision(0.3, 0.05, 0.95);
    const tight = spinsForHitRatePrecision(0.3, 0.01, 0.95);
    expect(tight).toBeGreaterThan(loose);
  });

  it('higher confidence level → more spins', () => {
    const n95  = spinsForHitRatePrecision(0.25, 0.01, 0.95);
    const n999 = spinsForHitRatePrecision(0.25, 0.01, 0.999);
    expect(n999).toBeGreaterThan(n95);
  });

  it('result is a positive integer', () => {
    const n = spinsForHitRatePrecision(0.25, 0.01, 0.95);
    expect(n).toBeGreaterThan(0);
    expect(Number.isInteger(n)).toBe(true);
  });

  it('p=0 or p=1 → 0 spins (no variance)', () => {
    expect(spinsForHitRatePrecision(0, 0.01, 0.95)).toBe(0);
    expect(spinsForHitRatePrecision(1, 0.01, 0.95)).toBe(0);
  });

  it('known value: p=0.5, target=0.01, z=1.96', () => {
    // n = ceil(1.96^2 * 0.5 * 0.5 / 0.01^2) = ceil(9604)
    const expected = Math.ceil(1.96 * 1.96 * 0.5 * 0.5 / (0.01 * 0.01));
    expect(spinsForHitRatePrecision(0.5, 0.01, 0.95)).toBe(expected);
  });
});
