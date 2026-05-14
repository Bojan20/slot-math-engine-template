/**
 * W152 P0-1 + P0-5 — ChaCha20 TS↔Rust parity & functional suite.
 *
 * The Rust `ChaCha20Backend` and TS `ChaCha20` backend share the same
 * RFC 8439 keystream and the same `deriveKeyAndNonce` seed derivation,
 * so they must emit bit-identical u32 sequences for any string seed.
 *
 * The Known-Answer-Test (KAT) vector below was captured from the Rust
 * test `chacha20_parity_kat_vector` on 2026-05-14. If either side
 * drifts, this test will fail; do **not** "fix" by updating one side —
 * investigate which implementation diverged from the spec.
 */

import { describe, it, expect } from 'vitest';
import { ChaCha20, createRng } from '../src/rng/index.js';
import { ChaCha20Rng } from '../src/crypto/chacha20.js';

// W152 P0-5 cross-impl parity vector. Captured from
// `cargo test chacha20_parity_kat_vector` on 2026-05-14. Seed:
// "w152-parity-vector". Must equal first 16 u32 from Rust ChaCha20.
const KAT_SEED = 'w152-parity-vector';
const KAT_EXPECTED_U32 = [
  0xa3aa6981, 0x8e8dd060, 0x03a52300, 0x666121af,
  0xed6475ba, 0x22d1f7a6, 0xbe166391, 0x96d9ebfa,
  0x0d79069e, 0xa5992dc6, 0x52e1fb03, 0x25304233,
  0xa4118a13, 0x3abfb7b0, 0xc0eaaa73, 0xf719eb96,
] as const;

describe('W152 P0-1 ChaCha20 backend — first-class', () => {
  it('createRng("chacha20", seed) returns a working backend', () => {
    const rng = createRng('chacha20', 12345);
    const v = rng.nextF64();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it('deterministic for the same numeric seed', () => {
    const a = createRng('chacha20', 0xdeadbeef);
    const b = createRng('chacha20', 0xdeadbeef);
    for (let i = 0; i < 256; i++) {
      const [aHi, aLo] = a.nextU64();
      const [bHi, bLo] = b.nextU64();
      expect(aHi).toBe(bHi);
      expect(aLo).toBe(bLo);
    }
  });

  it('different seeds diverge within the first u64', () => {
    const a = createRng('chacha20', 1);
    const b = createRng('chacha20', 2);
    expect(a.nextU64()).not.toEqual(b.nextU64());
  });

  it('split(nonce) produces independent streams', () => {
    const parent = new ChaCha20(42);
    const c1 = parent.split(1);
    const c2 = parent.split(2);
    expect(c1.nextU64()).not.toEqual(c2.nextU64());
  });

  it('nextU32Bounded stays in range', () => {
    const rng = new ChaCha20(99);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.nextU32Bounded(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('chi-squared uniformity across 100 buckets / 100k samples', () => {
    const rng = new ChaCha20(0xcafebabe);
    const buckets = 100;
    const samples = 100_000;
    const counts = new Array<number>(buckets).fill(0);
    for (let i = 0; i < samples; i++) {
      counts[rng.nextU32Bounded(buckets)]++;
    }
    const expected = samples / buckets;
    const chi2 = counts.reduce(
      (acc, c) => acc + ((c - expected) ** 2) / expected,
      0,
    );
    // Critical for χ²(df=99, α=0.001) ≈ 148.2; allow generous buffer.
    expect(chi2).toBeLessThan(200);
  });
});

describe('W152 P0-5 TS↔Rust parity (RFC 8439 + deriveKeyAndNonce)', () => {
  it('TS ChaCha20 (via Rng wrapper) matches Rust KAT for fromSeedString', () => {
    const rng = ChaCha20.fromSeedString(KAT_SEED);
    const actual: number[] = [];
    for (let i = 0; i < KAT_EXPECTED_U32.length; i++) {
      // We have to drain the same way as Rust: each call to next_u32 in
      // Rust pulls 4 keystream bytes. Easiest in TS is to talk to the
      // underlying ChaCha20Rng for raw u32 access.
      // The public RngBackend interface emits u32s through nextU64, but
      // the order is (lo, hi) for parity with Rust next_u64 — see
      // ChaCha20.ts. For the raw KAT we instead reach through the
      // ChaCha20Rng directly to verify keystream byte order matches.
      actual.push(0);
    }
    // Use the raw stream cipher directly — bit-for-bit comparison point.
    const raw = new ChaCha20Rng(KAT_SEED);
    for (let i = 0; i < KAT_EXPECTED_U32.length; i++) {
      const v = raw.nextUint32();
      expect(v).toBe(KAT_EXPECTED_U32[i]);
    }
    // Sanity: the wrapped backend must also yield the same bytes when
    // unfolded as little-endian u32 pairs through nextU64.
    const wrapped = ChaCha20.fromSeedString(KAT_SEED);
    for (let i = 0; i < 8; i++) {
      const [hi, lo] = wrapped.nextU64();
      // Rust next_u64 = (next_u32() as u64) | ((next_u32() as u64) << 32),
      // i.e. lo = first u32 of the pair, hi = second u32.
      expect(lo).toBe(KAT_EXPECTED_U32[i * 2]);
      expect(hi).toBe(KAT_EXPECTED_U32[i * 2 + 1]);
    }
  });

  it('createRng numeric seed yields the same stream as Rust create_rng(ChaCha20, seed)', () => {
    // Both sides render the u64 as "u64:<016x>". For a 32-bit number
    // like 0x12345678 the top half is "00000000".
    const seed = 0x12345678;
    const expectedSeedStr = `u64:${seed.toString(16).padStart(16, '0')}`;
    const a = createRng('chacha20', seed);
    const b = ChaCha20.fromSeedString(expectedSeedStr);
    for (let i = 0; i < 128; i++) {
      expect(a.nextU64()).toEqual(b.nextU64());
    }
  });
});
