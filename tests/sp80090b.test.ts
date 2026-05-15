/**
 * W152 Wave 39 — SP 800-90B estimators + IID test (Kimi K3 acceptance).
 */

import { describe, it, expect } from 'vitest';
import {
  assessEntropy,
  collisionEstimator,
  compressionEstimator,
  markovEstimator,
  mostCommonValueEstimator,
} from '../src/rng/sp80090b/estimators.js';
import { runIidTest } from '../src/rng/sp80090b/iidTest.js';

// ─── Synthetic distributions ───────────────────────────────────────────────

/** Uniform u8 stream from a deterministic Mulberry32 PRNG. */
function uniformBytes(n: number, seed: number = 0xCAFEBABE): Uint8Array {
  const out = new Uint8Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = ((t ^ (t >>> 14)) >>> 0) & 0xFF;
  }
  return out;
}

/** Highly biased: 90% of bytes are 0x42, 10% other random. */
function biasedBytes(n: number, seed: number = 0xDEADBEEF): Uint8Array {
  const u = uniformBytes(n, seed);
  for (let i = 0; i < n; i++) {
    if ((u[i] / 255) < 0.9) u[i] = 0x42;
  }
  return u;
}

/** All same byte — zero entropy. */
function constantBytes(n: number, value: number = 0x55): Uint8Array {
  return new Uint8Array(n).fill(value);
}

// ─── Estimator tests ───────────────────────────────────────────────────────

describe('SP 800-90B Non-IID Estimators (Wave 39 / Kimi K3)', () => {
  describe('§6.3.1 mostCommonValueEstimator', () => {
    it('uniform u8 source yields high min-entropy (≥ 6.5 bits)', () => {
      const r = mostCommonValueEstimator(uniformBytes(10000));
      expect(r.minEntropyBits).toBeGreaterThanOrEqual(6.5);
      expect(r.estimator).toBe('most_common_value_6.3.1');
    });

    it('biased source (90% one byte) yields low min-entropy (< 1.5 bits)', () => {
      const r = mostCommonValueEstimator(biasedBytes(10000));
      expect(r.minEntropyBits).toBeLessThan(1.5);
    });

    it('constant source yields ≈ 0 bits', () => {
      const r = mostCommonValueEstimator(constantBytes(10000));
      expect(r.minEntropyBits).toBeLessThan(0.1);
    });

    it('rejects too-small sample (< 100)', () => {
      expect(() => mostCommonValueEstimator(new Uint8Array(50))).toThrow(/≥100/);
    });
  });

  describe('§6.3.2 collisionEstimator', () => {
    it('uniform u8 source yields reasonable min-entropy', () => {
      const r = collisionEstimator(uniformBytes(10000));
      expect(r.minEntropyBits).toBeGreaterThan(0);
      expect(r.estimator).toBe('collision_6.3.2');
    });

    it('biased source yields lower min-entropy than uniform', () => {
      const uniform = collisionEstimator(uniformBytes(10000));
      const biased = collisionEstimator(biasedBytes(10000));
      expect(biased.minEntropyBits).toBeLessThan(uniform.minEntropyBits);
    });

    it('rejects too-small sample (< 1000)', () => {
      expect(() => collisionEstimator(new Uint8Array(500))).toThrow(/≥1000/);
    });
  });

  describe('§6.3.3 markovEstimator', () => {
    it('uniform u8 source yields positive min-entropy (Markov is conservative)', () => {
      // Markov estimator is sensitive to finite-sample noise on large
      // alphabets — at N=10K with 256-byte alphabet, the largest observed
      // conditional probability is ~30/256 = 0.12 (noise floor), giving
      // -log₂(0.12) ≈ 3 bits. This is documented SP 800-90B behavior;
      // taking MIN across estimators is what makes the official claim
      // sound. Per Wave 39 K3 acceptance: Markov gates the floor, not
      // the ceiling.
      const r = markovEstimator(uniformBytes(10000));
      expect(r.minEntropyBits).toBeGreaterThan(2);
      expect(r.estimator).toBe('markov_6.3.3');
    });

    it('biased source yields low min-entropy', () => {
      const r = markovEstimator(biasedBytes(10000));
      expect(r.minEntropyBits).toBeLessThan(1.5);
    });

    it('constant source yields ≈ 0 bits', () => {
      const r = markovEstimator(constantBytes(10000));
      expect(r.minEntropyBits).toBeLessThan(0.1);
    });
  });

  describe('§6.3.4 compressionEstimator', () => {
    it('uniform u8 source yields high min-entropy (close to 8 bits)', () => {
      const r = compressionEstimator(uniformBytes(10000));
      expect(r.minEntropyBits).toBeGreaterThan(5);
      expect(r.minEntropyBits).toBeLessThanOrEqual(8);
      expect(r.estimator).toBe('compression_6.3.4');
    });

    it('biased source yields lower min-entropy than uniform', () => {
      const uniform = compressionEstimator(uniformBytes(10000));
      const biased = compressionEstimator(biasedBytes(10000));
      expect(biased.minEntropyBits).toBeLessThan(uniform.minEntropyBits);
    });

    it('rejects too-small sample (< 2000)', () => {
      expect(() => compressionEstimator(new Uint8Array(1500))).toThrow(/≥2000/);
    });
  });

  describe('assessEntropy aggregator', () => {
    it('uniform u8 source passes low bar; high min-entropy', () => {
      const r = assessEntropy(uniformBytes(10000));
      expect(r.passesLowBar).toBe(true);
      expect(r.minEntropyClaim).toBeGreaterThan(0.5);
      expect(r.estimators).toHaveLength(4);
      expect(r.alphabetSize).toBeGreaterThan(200); // close to 256
    });

    it('constant source fails low bar; min-entropy ≈ 0', () => {
      const r = assessEntropy(constantBytes(10000));
      expect(r.passesLowBar).toBe(false);
      expect(r.minEntropyClaim).toBeLessThan(0.1);
    });

    it('min-entropy claim is the MIN across all estimators (most conservative)', () => {
      const r = assessEntropy(biasedBytes(10000));
      const minPerEstimator = Math.min(...r.estimators.map((e) => e.minEntropyBits));
      expect(r.minEntropyClaim).toBeCloseTo(minPerEstimator, 6);
    });

    it('rejects sample < 2000', () => {
      expect(() => assessEntropy(new Uint8Array(1500))).toThrow(/≥2000/);
    });
  });
});

describe('SP 800-90B §5 IID Test (Wave 39 / Kimi K3)', () => {
  it('runs 4 statistical tests + returns isIid verdict', () => {
    const r = runIidTest(uniformBytes(2000), 200);
    expect(r.tests).toHaveLength(4);
    expect(r.tests.map((t) => t.test)).toEqual([
      'iid_excursion',
      'iid_num_directional_runs',
      'iid_longest_directional_run',
      'iid_chi_square_uniform',
    ]);
    expect(typeof r.isIid).toBe('boolean');
  });

  it('all p-values are in [0, 1]', () => {
    const r = runIidTest(uniformBytes(2000), 200);
    for (const t of r.tests) {
      expect(t.pValue).toBeGreaterThanOrEqual(0);
      expect(t.pValue).toBeLessThanOrEqual(1);
    }
  });

  it('rejects too-small sample (< 1000)', () => {
    expect(() => runIidTest(new Uint8Array(500))).toThrow(/≥1000/);
  });

  it('rejects too-few permutations (< 100)', () => {
    expect(() => runIidTest(uniformBytes(2000), 50)).toThrow(/≥100/);
  });
});
