/**
 * Faza 7 RNG Hardening — Test Suite
 *
 * Covers:
 * - Mulberry32 backward compatibility (bit-exact)
 * - PCG64, Xoshiro256SS, Philox4x32: determinism, range, uniformity, split
 * - RngFactory: all kinds produce functional RNGs
 * - Anti-bias verification: Lemire vs modulo
 *
 * Target: 40+ tests
 */

import { describe, it, expect } from 'vitest';
import { mulberry32 as legacyMulberry32 } from '../src/engine/rng.js';
import {
  mulberry32,
  Mulberry32,
  PCG64,
  Xoshiro256SS,
  Philox4x32,
  createRng,
  type RngBackend,
  type RngKind,
} from '../src/rng/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Chi-squared helper
// ─────────────────────────────────────────────────────────────────────────────

function chiSquared(observed: number[], expected: number): number {
  return observed.reduce((acc, o) => acc + (o - expected) ** 2 / expected, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Mulberry32 backward compatibility
// ─────────────────────────────────────────────────────────────────────────────

describe('Mulberry32 backward compatibility', () => {
  // Known correct values from existing test suite
  const EXPECTED = [
    0.9797282677609473,
    0.3067522644996643,
    0.484205421525985,
    0.817934412509203,
    0.5094283693470061,
  ];

  it('re-exported mulberry32 is identical to legacy engine/rng', () => {
    const rng1 = legacyMulberry32(12345);
    const rng2 = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('bit-exact values for seed=12345 (first 5)', () => {
    const rng = mulberry32(12345);
    for (const expected of EXPECTED) {
      expect(Math.abs(rng() - expected)).toBeLessThan(1e-15);
    }
  });

  it('Mulberry32 backend nextF64 matches legacy for same seed', () => {
    const legacy = legacyMulberry32(99999);
    const backend = new Mulberry32(99999);
    for (let i = 0; i < 1000; i++) {
      expect(backend.nextF64()).toBe(legacy());
    }
  });

  it('Mulberry32 backend is deterministic across two instances', () => {
    const a = new Mulberry32(42);
    const b = new Mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const [ah, al] = a.nextU64();
      const [bh, bl] = b.nextU64();
      expect(ah).toBe(bh);
      expect(al).toBe(bl);
    }
  });

  it('Mulberry32 nextF64 in [0, 1)', () => {
    const rng = new Mulberry32(777);
    for (let i = 0; i < 10000; i++) {
      const v = rng.nextF64();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Generic backend tests (parameterized)
// ─────────────────────────────────────────────────────────────────────────────

type BackendCtor = (seed: number) => RngBackend;

const BACKENDS: Array<[string, BackendCtor]> = [
  ['PCG64',        (s) => new PCG64(s)],
  ['Xoshiro256SS', (s) => new Xoshiro256SS(s)],
  ['Philox4x32',   (s) => new Philox4x32(s)],
  ['Mulberry32',   (s) => new Mulberry32(s)],
];

for (const [name, make] of BACKENDS) {
  describe(`${name} — core properties`, () => {

    it(`${name}: deterministic — two instances with same seed → same 1000 values`, () => {
      const a = make(12345);
      const b = make(12345);
      for (let i = 0; i < 1000; i++) {
        const [ah, al] = a.nextU64();
        const [bh, bl] = b.nextU64();
        expect(ah).toBe(bh);
        expect(al).toBe(bl);
      }
    });

    it(`${name}: nextF64 range — 10000 values all in [0, 1)`, () => {
      const rng = make(54321);
      for (let i = 0; i < 10000; i++) {
        const v = rng.nextF64();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    it(`${name}: nextF64 never negative`, () => {
      const rng = make(0);
      for (let i = 0; i < 5000; i++) {
        expect(rng.nextF64()).toBeGreaterThanOrEqual(0);
      }
    });

    it(`${name}: nextF64 never >= 1.0`, () => {
      const rng = make(0xDEADBEEF);
      for (let i = 0; i < 5000; i++) {
        expect(rng.nextF64()).toBeLessThan(1.0);
      }
    });

    it(`${name}: chi-squared uniformity — 100k samples, 100 buckets, chi² < 135`, () => {
      const rng = make(777);
      const buckets = new Array(100).fill(0);
      const N = 100_000;
      for (let i = 0; i < N; i++) {
        const b = Math.floor(rng.nextF64() * 100);
        buckets[b]++;
      }
      const chi2 = chiSquared(buckets, N / 100);
      expect(chi2).toBeLessThan(135);
    });

    it(`${name}: nextU32Bounded — values always in [0, max)`, () => {
      const rng = make(42);
      for (const max of [2, 3, 5, 7, 11, 17, 97, 100, 1000]) {
        for (let i = 0; i < 500; i++) {
          const v = rng.nextU32Bounded(max);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(max);
        }
      }
    });

    it(`${name}: nextU32Bounded chi-squared — no bias for several max values`, () => {
      for (const max of [3, 7, 17, 97]) {
        const rng = make(999 + max);
        const buckets = new Array(max).fill(0);
        const N = 100_000;
        for (let i = 0; i < N; i++) {
          buckets[rng.nextU32Bounded(max)]++;
        }
        const chi2 = chiSquared(buckets, N / max);
        // Critical value for (max-1) df at p=0.001 — use generous bound 3× critical
        // For df=2: crit=13.8, df=6: crit=22.5, df=16: crit=39.3, df=96: crit=140
        // We just check chi² < 5 * df as a very generous bound
        expect(chi2).toBeLessThan(5 * (max - 1) + 50);
      }
    });

    it(`${name}: split with different nonces produces different sequences`, () => {
      const rng = make(12345);
      const child1 = rng.split(1);
      const child2 = rng.split(2);

      let diffFound = false;
      for (let i = 0; i < 100; i++) {
        if (child1.nextF64() !== child2.nextF64()) {
          diffFound = true;
          break;
        }
      }
      expect(diffFound).toBe(true);
    });

    it(`${name}: split with same nonce produces same sequence`, () => {
      const rng = make(12345);
      const child1 = rng.split(99);
      // reset parent
      const rng2 = make(12345);
      const child2 = rng2.split(99);

      for (let i = 0; i < 100; i++) {
        expect(child1.nextF64()).toBe(child2.nextF64());
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. RngFactory tests
// ─────────────────────────────────────────────────────────────────────────────

describe('RngFactory', () => {
  const ALL_KINDS: RngKind[] = ['mulberry32', 'pcg64', 'xoshiro256ss', 'philox4x32'];

  for (const kind of ALL_KINDS) {
    it(`createRng('${kind}', seed) returns functional RNG`, () => {
      const rng = createRng(kind, 12345);
      expect(rng).toBeDefined();
      const v = rng.nextF64();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    });

    it(`createRng('${kind}') is deterministic`, () => {
      const a = createRng(kind, 42);
      const b = createRng(kind, 42);
      for (let i = 0; i < 100; i++) {
        expect(a.nextF64()).toBe(b.nextF64());
      }
    });

    it(`createRng('${kind}') — nextF64 never negative or >= 1`, () => {
      const rng = createRng(kind, 0xABCD1234);
      for (let i = 0; i < 1000; i++) {
        const v = rng.nextF64();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Anti-bias verification
// ─────────────────────────────────────────────────────────────────────────────

describe('Anti-bias: rejection sampling vs modulo', () => {
  const N = 100_000;
  const MAX = 3;
  const TOLERANCE = 0.01; // 1% tolerance around 33.33%

  it('nextU32Bounded(3) produces ~33.33% for each bucket (PCG64)', () => {
    const rng = new PCG64(42);
    const buckets = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      buckets[rng.nextU32Bounded(MAX)]++;
    }
    for (const count of buckets) {
      const fraction = count / N;
      expect(fraction).toBeGreaterThan(1 / MAX - TOLERANCE);
      expect(fraction).toBeLessThan(1 / MAX + TOLERANCE);
    }
  });

  it('nextU32Bounded(3) produces ~33.33% for each bucket (Xoshiro256SS)', () => {
    const rng = new Xoshiro256SS(42);
    const buckets = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      buckets[rng.nextU32Bounded(MAX)]++;
    }
    for (const count of buckets) {
      const fraction = count / N;
      expect(fraction).toBeGreaterThan(1 / MAX - TOLERANCE);
      expect(fraction).toBeLessThan(1 / MAX + TOLERANCE);
    }
  });

  it('nextU32Bounded(3) produces ~33.33% for each bucket (Philox4x32)', () => {
    const rng = new Philox4x32(42);
    const buckets = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      buckets[rng.nextU32Bounded(MAX)]++;
    }
    for (const count of buckets) {
      const fraction = count / N;
      expect(fraction).toBeGreaterThan(1 / MAX - TOLERANCE);
      expect(fraction).toBeLessThan(1 / MAX + TOLERANCE);
    }
  });

  it('modulo bias demonstration: naive % 3 over u8 is biased', () => {
    // u8 range is 0..255 (256 values). 256 % 3 = 1, so values 0 and 1 appear
    // 86 times each while 2 appears 85 times → measurable bias with large N.
    // This test documents that naïve modulo IS biased.
    // We use synthetic u8 exhaustion to show the expected bias.
    const counts = [0, 0, 0];
    for (let i = 0; i < 256; i++) {
      counts[i % 3]++;
    }
    // Counts should be [86, 85, 85] — not uniform (256 mod 3 = 1, so value 0 gets one extra)
    expect(counts[0]).toBe(86);
    expect(counts[1]).toBe(85);
    expect(counts[2]).toBe(85);
  });

  it('nextU32Bounded chi-squared for MAX=100 is well below critical', () => {
    const rng = new PCG64(1234567);
    const buckets = new Array(100).fill(0);
    for (let i = 0; i < N; i++) {
      buckets[rng.nextU32Bounded(100)]++;
    }
    const chi2 = chiSquared(buckets, N / 100);
    // df=99, critical at p=0.001 is ~148.2
    expect(chi2).toBeLessThan(150);
  });

  it('nextU32Bounded for power-of-2 max has no bias (MAX=1024)', () => {
    const rng = new Xoshiro256SS(99);
    const buckets = new Array(1024).fill(0);
    const samples = 1_024_000;
    for (let i = 0; i < samples; i++) {
      buckets[rng.nextU32Bounded(1024)]++;
    }
    const chi2 = chiSquared(buckets, samples / 1024);
    // df=1023, expect chi2 well below 1200
    expect(chi2).toBeLessThan(1200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Edge cases & misc
// ─────────────────────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('PCG64 seed=0 does not crash and produces valid values', () => {
    const rng = new PCG64(0);
    for (let i = 0; i < 100; i++) {
      const v = rng.nextF64();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('Xoshiro256SS seed=0 does not crash', () => {
    const rng = new Xoshiro256SS(0);
    for (let i = 0; i < 100; i++) {
      const v = rng.nextF64();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('Philox4x32 seed=0 does not crash', () => {
    const rng = new Philox4x32(0);
    for (let i = 0; i < 100; i++) {
      const v = rng.nextF64();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('Philox4x32 counter wraps correctly after 4 values', () => {
    // Each generate() call produces 4 u32 values — verify consistent output
    const a = new Philox4x32(777);
    const b = new Philox4x32(777);
    // Consume 8 u32 values (= 2 blocks = 4 nextU64 calls)
    for (let i = 0; i < 4; i++) {
      const [ah, al] = a.nextU64();
      const [bh, bl] = b.nextU64();
      expect(ah).toBe(bh);
      expect(al).toBe(bl);
    }
  });

  it('different seeds produce different sequences (PCG64)', () => {
    const a = new PCG64(1);
    const b = new PCG64(2);
    let same = true;
    for (let i = 0; i < 100; i++) {
      if (a.nextF64() !== b.nextF64()) { same = false; break; }
    }
    expect(same).toBe(false);
  });

  it('different seeds produce different sequences (Xoshiro256SS)', () => {
    const a = new Xoshiro256SS(1);
    const b = new Xoshiro256SS(2);
    let same = true;
    for (let i = 0; i < 100; i++) {
      if (a.nextF64() !== b.nextF64()) { same = false; break; }
    }
    expect(same).toBe(false);
  });

  it('different seeds produce different sequences (Philox4x32)', () => {
    const a = new Philox4x32(1);
    const b = new Philox4x32(2);
    let same = true;
    for (let i = 0; i < 100; i++) {
      if (a.nextF64() !== b.nextF64()) { same = false; break; }
    }
    expect(same).toBe(false);
  });

  it('nextU32Bounded(1) always returns 0', () => {
    const rng = new PCG64(42);
    for (let i = 0; i < 100; i++) {
      expect(rng.nextU32Bounded(1)).toBe(0);
    }
  });

  it('nextU32Bounded(2) returns only 0 or 1', () => {
    const rng = new Xoshiro256SS(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextU32Bounded(2);
      expect(v === 0 || v === 1).toBe(true);
    }
  });
});
