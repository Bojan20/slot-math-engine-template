/**
 * RNG Parity Test - TypeScript vs Rust
 *
 * Verifies that mulberry32 implementation in TypeScript produces
 * IDENTICAL values to Rust implementation.
 */

import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/engine/rng.js';
import { mulberry32 as mulberry32Utils } from '../src/utils/rng.js';

describe('RNG Parity - TypeScript Mulberry32', () => {
  // These are the known correct values from both TypeScript and Rust
  const EXPECTED_VALUES = [
    0.9797282677609473,
    0.3067522644996643,
    0.484205421525985,
    0.817934412509203,
    0.5094283693470061,
  ];

  it('should match expected values for seed 12345 (engine/rng)', () => {
    const rng = mulberry32(12345);

    for (let i = 0; i < EXPECTED_VALUES.length; i++) {
      const value = rng();
      const expected = EXPECTED_VALUES[i];
      const diff = Math.abs(value - expected);

      console.log(`v${i + 1}: TS=${value.toFixed(16)}, expected=${expected.toFixed(16)}, diff=${diff.toExponential(2)}`);

      expect(diff).toBeLessThan(1e-15);
    }
  });

  it('should match expected values for seed 12345 (utils/rng)', () => {
    const rng = mulberry32Utils(12345);

    for (let i = 0; i < EXPECTED_VALUES.length; i++) {
      const value = rng();
      const expected = EXPECTED_VALUES[i];
      const diff = Math.abs(value - expected);

      expect(diff).toBeLessThan(1e-15);
    }
  });

  it('should be deterministic - same seed = same sequence', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);

    for (let i = 0; i < 1000; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('should produce values in [0, 1)', () => {
    const rng = mulberry32(99999);

    for (let i = 0; i < 100000; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('should have good distribution (chi-squared rough check)', () => {
    const rng = mulberry32(777);
    const buckets = new Array(10).fill(0);
    const n = 100000;

    for (let i = 0; i < n; i++) {
      const bucket = Math.floor(rng() * 10);
      buckets[bucket]++;
    }

    const expected = n / 10;
    let chiSquared = 0;

    for (const count of buckets) {
      chiSquared += Math.pow(count - expected, 2) / expected;
    }

    // Chi-squared critical value for 9 degrees of freedom, p=0.05 is ~16.92
    // Allow some margin for randomness
    expect(chiSquared).toBeLessThan(30);
    console.log(`Chi-squared: ${chiSquared.toFixed(2)} (critical: 16.92)`);
  });

  it('both rng modules should produce identical output', () => {
    const rng1 = mulberry32(12345);
    const rng2 = mulberry32Utils(12345);

    for (let i = 0; i < 1000; i++) {
      const v1 = rng1();
      const v2 = rng2();
      expect(v1).toBe(v2);
    }
  });
});
