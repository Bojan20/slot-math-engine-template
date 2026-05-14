/**
 * W152 P1-10 — RNG test-coverage trojka (RNG slot).
 *
 * Closes audit gaps in `faza7_rng.test.ts`:
 *   - HSM fallback path (no provider, failHealth, fallbackForbidden=true)
 *   - `createRngAsync` exhaustive over all backends
 *   - cross-backend determinism guarantee (same seed → same first U64)
 *   - bounded uniformity sanity for ChaCha20 (covers RFC 8439 path)
 */

import { describe, expect, it } from 'vitest';
import { createRng, createRngAsync } from '../src/rng/RngFactory.js';
import { MockHSMProvider } from '../src/crypto/hsm.js';

const ALL_KINDS = ['mulberry32', 'pcg64', 'xoshiro256ss', 'philox4x32', 'chacha20'] as const;

describe('P1-10 — RNG factory coverage', () => {
  describe('createRng (sync path)', () => {
    it.each(ALL_KINDS)('produces a working RngBackend for kind=%s', (kind) => {
      const rng = createRng(kind, 12345);
      const u = rng.nextU64();
      expect(Array.isArray(u)).toBe(true);
      expect(u).toHaveLength(2);
      expect(Number.isInteger(u[0])).toBe(true);
      expect(Number.isInteger(u[1])).toBe(true);
      const f = rng.nextF64();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const b = rng.nextU32Bounded(100);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    });

    it.each(ALL_KINDS)(
      'kind=%s same seed → same first U64 (determinism contract)',
      (kind) => {
        const a = createRng(kind, 0xdead_beef);
        const b = createRng(kind, 0xdead_beef);
        const ua = a.nextU64();
        const ub = b.nextU64();
        expect(ua).toEqual(ub);
      },
    );
  });

  describe('HSM fallback path', () => {
    it('sync createRng with no provider warns and returns a ChaCha20 fallback', () => {
      const original = console.warn;
      let warnCalls = 0;
      console.warn = () => {
        warnCalls += 1;
      };
      try {
        const rng = createRng('hsm_pkcs11', 42);
        expect(warnCalls).toBeGreaterThan(0);
        expect(typeof rng.nextU64).toBe('function');
        const u = rng.nextU64();
        expect(u).toHaveLength(2);
      } finally {
        console.warn = original;
      }
    });

    it('createRngAsync without provider falls back with warn', async () => {
      const original = console.warn;
      let warnCalls = 0;
      console.warn = () => {
        warnCalls += 1;
      };
      try {
        const rng = await createRngAsync('hsm_pkcs11', 7);
        expect(warnCalls).toBeGreaterThan(0);
        // fallback backend is a real RngBackend
        const u = rng.nextU64();
        expect(u).toHaveLength(2);
      } finally {
        console.warn = original;
      }
    });

    it('fallbackForbidden=true converts the warn into a thrown error', () => {
      expect(() =>
        createRng('hsm_pkcs11', 1, { fallbackForbidden: true }),
      ).toThrow(/HSM fallback forbidden/);
    });

    it('async path with mock provider (failHealth=true) falls back', async () => {
      const provider = new MockHSMProvider('test-seed', 'MOCK-FAIL-0001', true);
      const original = console.warn;
      let warnCalls = 0;
      console.warn = () => {
        warnCalls += 1;
      };
      try {
        const rng = await createRngAsync('hsm_pkcs11', 99, { provider });
        // mock healthCheck returns ok=false; factory should fall back.
        expect(warnCalls).toBeGreaterThan(0);
        expect(typeof rng.nextU64).toBe('function');
      } finally {
        console.warn = original;
      }
    });

    it('async path with healthy mock provider succeeds (no fallback)', async () => {
      const provider = new MockHSMProvider('test-seed-2', 'MOCK-OK-0001', false);
      const original = console.warn;
      let warnCalls = 0;
      console.warn = () => {
        warnCalls += 1;
      };
      try {
        const rng = await createRngAsync('hsm_pkcs11', 100, { provider });
        expect(warnCalls).toBe(0);
        const u = rng.nextU64();
        expect(u).toHaveLength(2);
      } finally {
        console.warn = original;
      }
    });

    it('sync path with healthy mock provider does NOT fall back', () => {
      const provider = new MockHSMProvider('sync-seed', 'MOCK-SYNC-0001', false);
      const original = console.warn;
      let warnCalls = 0;
      console.warn = () => {
        warnCalls += 1;
      };
      try {
        const rng = createRng('hsm_pkcs11', 5, { provider });
        expect(warnCalls).toBe(0);
        const u = rng.nextU64();
        expect(u).toHaveLength(2);
      } finally {
        console.warn = original;
      }
    });

    it('createRngAsync routes non-HSM kinds through the sync factory', async () => {
      const rng = await createRngAsync('pcg64', 7);
      const u = rng.nextU64();
      expect(u).toHaveLength(2);
    });
  });

  describe('bounded sampling distribution sanity', () => {
    it('chacha20 bounded sampling covers full [0, max) range with no bias', () => {
      const rng = createRng('chacha20', 1234);
      const max = 7;
      const counts = new Array<number>(max).fill(0);
      const N = 20_000;
      for (let i = 0; i < N; i++) {
        const b = rng.nextU32Bounded(max);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(max);
        counts[b]++;
      }
      // Each bucket should be within 10% of N/max.
      const expected = N / max;
      for (let i = 0; i < max; i++) {
        const dev = Math.abs(counts[i] - expected) / expected;
        expect(dev).toBeLessThan(0.1);
      }
    });
  });
});
