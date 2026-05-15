/**
 * W152 Wave 43 — ENT statistics tests (Kimi K1 partial acceptance).
 */

import { describe, it, expect } from 'vitest';
import { entAssess } from '../src/rng/ent/entStats.js';

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

function constantBytes(n: number, value: number = 0x55): Uint8Array {
  return new Uint8Array(n).fill(value);
}

function biasedBytes(n: number): Uint8Array {
  const u = uniformBytes(n);
  for (let i = 0; i < n; i++) {
    if ((u[i] / 255) < 0.5) u[i] = 0x42;
  }
  return u;
}

describe('ENT entropy battery — Wave 43 / Kimi K1 partial', () => {
  describe('Uniform u8 source — should pass all 5 stats', () => {
    const r = entAssess(uniformBytes(50_000));

    it('entropy ≥ 7.95 bits/byte', () => {
      expect(r.entropyBitsPerByte).toBeGreaterThanOrEqual(7.95);
      expect(r.pass.entropy).toBe(true);
    });

    it('chi-square p-value in [0.01, 0.99]', () => {
      expect(r.chiSquarePValue).toBeGreaterThanOrEqual(0.01);
      expect(r.chiSquarePValue).toBeLessThanOrEqual(0.99);
      expect(r.pass.chiSquare).toBe(true);
    });

    it('arithmetic mean within ±1.0 of 127.5', () => {
      expect(Math.abs(r.arithmeticMean - 127.5)).toBeLessThan(1.0);
      expect(r.pass.arithmeticMean).toBe(true);
    });

    it('Monte Carlo π within 1% of true π', () => {
      expect(r.monteCarloPiErrorPct).toBeLessThan(1.0);
      expect(r.pass.monteCarloPi).toBe(true);
    });

    it('serial correlation |ρ| < 0.05', () => {
      expect(Math.abs(r.serialCorrelation)).toBeLessThan(0.05);
      expect(r.pass.serialCorrelation).toBe(true);
    });

    it('overall PASS', () => {
      expect(r.overallPass).toBe(true);
    });
  });

  describe('Constant source — should fail every stat', () => {
    const r = entAssess(constantBytes(50_000));

    it('entropy ≈ 0 bits/byte (constant carries zero info)', () => {
      expect(r.entropyBitsPerByte).toBeLessThan(0.01);
      expect(r.pass.entropy).toBe(false);
    });

    it('chi-square fails (extreme value, p ≈ 0)', () => {
      expect(r.pass.chiSquare).toBe(false);
    });

    it('overall FAIL', () => {
      expect(r.overallPass).toBe(false);
    });
  });

  describe('Biased source (50% one value) — should fail entropy + chi²', () => {
    const r = entAssess(biasedBytes(50_000));
    it('entropy < 7.95 (biased toward 0x42)', () => {
      expect(r.entropyBitsPerByte).toBeLessThan(7.95);
      expect(r.pass.entropy).toBe(false);
    });
    it('chi-square fails (huge skew)', () => {
      expect(r.pass.chiSquare).toBe(false);
    });
    it('overall FAIL', () => {
      expect(r.overallPass).toBe(false);
    });
  });

  describe('Boundary checks', () => {
    it('rejects sample < 1024', () => {
      expect(() => entAssess(new Uint8Array(500))).toThrow(/≥1024/);
    });

    it('returns valid shape for minimum size 1024', () => {
      const r = entAssess(uniformBytes(1024));
      expect(r.sampleBytes).toBe(1024);
      expect(typeof r.entropyBitsPerByte).toBe('number');
      expect(typeof r.chiSquarePValue).toBe('number');
    });
  });

  describe('Determinism', () => {
    it('same input → identical output', () => {
      const a = entAssess(uniformBytes(10000));
      const b = entAssess(uniformBytes(10000));
      expect(a.entropyBitsPerByte).toBe(b.entropyBitsPerByte);
      expect(a.chiSquare).toBe(b.chiSquare);
      expect(a.arithmeticMean).toBe(b.arithmeticMean);
      expect(a.monteCarloPi).toBe(b.monteCarloPi);
      expect(a.serialCorrelation).toBe(b.serialCorrelation);
    });
  });
});
