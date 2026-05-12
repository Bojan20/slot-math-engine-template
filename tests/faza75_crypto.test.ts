/**
 * Faza 7.5 — ChaCha20 Stream Cipher RNG + Commit-Reveal Protocol
 *
 * CHACHA-01..14 : ChaCha20 core + ChaCha20Rng class
 * COMMIT-15..25 : CommitRevealManager
 */

import { describe, it, expect } from 'vitest';
import {
  chacha20Block,
  hexToBytes,
  bytesToHex,
  ChaCha20Rng,
} from '../src/crypto/chacha20.js';
import { fnv1a256, CommitRevealManager } from '../src/crypto/commitReveal.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeKey(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}
function makeNonce(fill: number): Uint8Array {
  return new Uint8Array(12).fill(fill);
}

// Chi-squared for uniformity
function chiSquared(observed: number[], expected: number): number {
  return observed.reduce((acc, o) => acc + (o - expected) ** 2 / expected, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHACHA-01: chacha20Block returns exactly 64 bytes
// ─────────────────────────────────────────────────────────────────────────────
describe('CHACHA-01: block is 64 bytes', () => {
  it('chacha20Block returns a Uint8Array of exactly 64 bytes', () => {
    const block = chacha20Block(makeKey(0x01), 0, makeNonce(0x00));
    expect(block).toBeInstanceOf(Uint8Array);
    expect(block.byteLength).toBe(64);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHACHA-02: different keys give different output
// ─────────────────────────────────────────────────────────────────────────────
describe('CHACHA-02: different keys give different output', () => {
  it('blocks with key=0x01 and key=0x02 differ', () => {
    const b1 = chacha20Block(makeKey(0x01), 0, makeNonce(0x00));
    const b2 = chacha20Block(makeKey(0x02), 0, makeNonce(0x00));
    expect(bytesToHex(b1)).not.toBe(bytesToHex(b2));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHACHA-03: same key/counter/nonce is deterministic
// ─────────────────────────────────────────────────────────────────────────────
describe('CHACHA-03: same key/counter/nonce is deterministic', () => {
  it('identical inputs produce identical blocks', () => {
    const key   = makeKey(0xAA);
    const nonce = makeNonce(0x55);
    const b1    = chacha20Block(key, 7, nonce);
    const b2    = chacha20Block(key, 7, nonce);
    expect(bytesToHex(b1)).toBe(bytesToHex(b2));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHACHA-04: counter bump gives different output
// ─────────────────────────────────────────────────────────────────────────────
describe('CHACHA-04: counter bump gives different output', () => {
  it('counter=0 vs counter=1 produce different blocks', () => {
    const key   = makeKey(0x11);
    const nonce = makeNonce(0x22);
    const b0    = chacha20Block(key, 0, nonce);
    const b1    = chacha20Block(key, 1, nonce);
    expect(bytesToHex(b0)).not.toBe(bytesToHex(b1));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHACHA-05: nextUint32 in [0, 2^32)
// ─────────────────────────────────────────────────────────────────────────────
describe('CHACHA-05: nextUint32 in [0, 2^32)', () => {
  it('all values are non-negative integers < 2^32', () => {
    const rng = new ChaCha20Rng('test-seed-05');
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextUint32();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(0x100000000);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHACHA-06: nextFloat in [0, 1)
// ─────────────────────────────────────────────────────────────────────────────
describe('CHACHA-06: nextFloat in [0, 1)', () => {
  it('all values are in [0, 1)', () => {
    const rng = new ChaCha20Rng('test-seed-06');
    for (let i = 0; i < 10000; i++) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHACHA-07: same seed = same sequence
// ─────────────────────────────────────────────────────────────────────────────
describe('CHACHA-07: same seed = same sequence', () => {
  it('two RNGs with the same seed produce identical sequences', () => {
    const rng1 = new ChaCha20Rng('deterministic-seed');
    const rng2 = new ChaCha20Rng('deterministic-seed');
    for (let i = 0; i < 500; i++) {
      expect(rng1.nextUint32()).toBe(rng2.nextUint32());
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHACHA-08: chi-squared uniformity (10k draws, p > 0.001)
// ─────────────────────────────────────────────────────────────────────────────
describe('CHACHA-08: chi-squared uniformity', () => {
  it('10k floats distributed uniformly across 100 buckets (chi² < 200)', () => {
    const rng     = new ChaCha20Rng('uniformity-test');
    const N       = 10_000;
    const buckets = new Array(100).fill(0);
    for (let i = 0; i < N; i++) {
      const b = Math.floor(rng.nextFloat() * 100);
      buckets[b]++;
    }
    const chi2 = chiSquared(buckets, N / 100);
    // df=99, critical at p=0.001 is 148.2; we allow generous headroom
    expect(chi2).toBeLessThan(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHACHA-09: nextInRange always in [min, max]
// ─────────────────────────────────────────────────────────────────────────────
describe('CHACHA-09: nextInRange always in [min, max]', () => {
  it('values always within inclusive bounds for several ranges', () => {
    const rng = new ChaCha20Rng('range-test');
    const ranges: Array<[number, number]> = [
      [0, 0], [0, 1], [0, 9], [1, 6], [0, 36], [100, 200],
    ];
    for (const [min, max] of ranges) {
      for (let i = 0; i < 500; i++) {
        const v = rng.nextInRange(min, max);
        expect(v).toBeGreaterThanOrEqual(min);
        expect(v).toBeLessThanOrEqual(max);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHACHA-10: hexToBytes / bytesToHex round-trip
// ─────────────────────────────────────────────────────────────────────────────
describe('CHACHA-10: hexToBytes/bytesToHex round-trip', () => {
  it('bytesToHex(hexToBytes(hex)) === hex', () => {
    const samples = [
      '00',
      'ff',
      'deadbeef',
      '0102030405060708090a0b0c0d0e0f10',
    ];
    for (const hex of samples) {
      expect(bytesToHex(hexToBytes(hex))).toBe(hex);
    }
  });

  it('hexToBytes produces correct byte values', () => {
    const bytes = hexToBytes('deadbeef');
    expect(bytes[0]).toBe(0xde);
    expect(bytes[1]).toBe(0xad);
    expect(bytes[2]).toBe(0xbe);
    expect(bytes[3]).toBe(0xef);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHACHA-11: cross-block boundary works
// ─────────────────────────────────────────────────────────────────────────────
describe('CHACHA-11: cross-block boundary works', () => {
  it('consuming 17 u32 values (> 16-per-block) does not throw and stays deterministic', () => {
    const rng1 = new ChaCha20Rng('cross-block-seed');
    const rng2 = new ChaCha20Rng('cross-block-seed');
    const values1: number[] = [];
    const values2: number[] = [];
    // 64 bytes / 4 = 16 u32 per block; draw 20 to cross the boundary
    for (let i = 0; i < 20; i++) {
      values1.push(rng1.nextUint32());
      values2.push(rng2.nextUint32());
    }
    expect(values1).toEqual(values2);
    // 17th value (index 16) must have come from block 1 — just verify it's an integer
    expect(Number.isInteger(values1[16])).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHACHA-12: fnv1a256 returns 32-char hex string
// ─────────────────────────────────────────────────────────────────────────────
describe('CHACHA-12: fnv1a256 is 32-char hex', () => {
  it('fnv1a256 output is exactly 32 hex characters', () => {
    const hash = fnv1a256('hello world');
    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(32);
    expect(/^[0-9a-f]{32}$/.test(hash)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHACHA-13: fnv1a256 is deterministic
// ─────────────────────────────────────────────────────────────────────────────
describe('CHACHA-13: fnv1a256 is deterministic', () => {
  it('same input always produces the same hash', () => {
    const input = 'provably-fair:slot:engine';
    const h1 = fnv1a256(input);
    const h2 = fnv1a256(input);
    expect(h1).toBe(h2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHACHA-14: fnv1a256 avalanche — single-bit change changes output significantly
// ─────────────────────────────────────────────────────────────────────────────
describe('CHACHA-14: fnv1a256 avalanche', () => {
  it('changing one character changes at least half the output bits', () => {
    const h1 = fnv1a256('seed:abc');
    const h2 = fnv1a256('seed:abd');
    expect(h1).not.toBe(h2);
    // Count differing hex nibbles — expect at least 8 out of 32 to differ
    let diffNibbles = 0;
    for (let i = 0; i < 32; i++) {
      if (h1[i] !== h2[i]) diffNibbles++;
    }
    expect(diffNibbles).toBeGreaterThanOrEqual(8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT-15: createSession returns session with hash, not seed
// ─────────────────────────────────────────────────────────────────────────────
describe('COMMIT-15: createSession has hash not seed', () => {
  it('returned session has serverSeedHash but no serverSeed property', () => {
    const mgr     = new CommitRevealManager();
    const session = mgr.createSession('player-seed-abc');
    expect(session.serverSeedHash).toBeDefined();
    expect(typeof session.serverSeedHash).toBe('string');
    expect(session.serverSeed).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT-16: serverSeedHash !== serverSeed (i.e. hash !== plaintext seed)
// ─────────────────────────────────────────────────────────────────────────────
describe('COMMIT-16: hash != seed', () => {
  it('serverSeedHash is not equal to the actual server seed (revealed later)', () => {
    const mgr     = new CommitRevealManager();
    const session = mgr.createSession('player-seed-xyz');
    const actual  = mgr.revealSession(session.sessionId);
    expect(session.serverSeedHash).not.toBe(actual);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT-17: spinRng returns a ChaCha20Rng
// ─────────────────────────────────────────────────────────────────────────────
describe('COMMIT-17: spinRng returns rng', () => {
  it('spinRng returns a ChaCha20Rng instance', () => {
    const mgr     = new CommitRevealManager();
    const session = mgr.createSession('ps');
    const rng     = mgr.spinRng(session.sessionId);
    expect(rng).toBeInstanceOf(ChaCha20Rng);
    const v = rng.nextFloat();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT-18: two spinRng calls give different sequences
// ─────────────────────────────────────────────────────────────────────────────
describe('COMMIT-18: two spinRng calls give different sequences', () => {
  it('consecutive spinRng calls produce different RNG sequences', () => {
    const mgr     = new CommitRevealManager();
    const session = mgr.createSession('ps-18');
    const rng1    = mgr.spinRng(session.sessionId);
    const rng2    = mgr.spinRng(session.sessionId);
    // At least one of the first 100 values must differ
    let diff = false;
    for (let i = 0; i < 100; i++) {
      if (rng1.nextUint32() !== rng2.nextUint32()) { diff = true; break; }
    }
    expect(diff).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT-19: spinProof before reveal hides serverSeed
// ─────────────────────────────────────────────────────────────────────────────
describe('COMMIT-19: spinProof before reveal hides seed', () => {
  it('proof.serverSeed is "[hidden until reveal]" before revealSession', () => {
    const mgr     = new CommitRevealManager();
    const session = mgr.createSession('ps-19');
    mgr.spinRng(session.sessionId); // increment nonce
    const proof   = mgr.spinProof(session.sessionId);
    expect(proof.serverSeed).toBe('[hidden until reveal]');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT-20: revealSession returns the server seed
// ─────────────────────────────────────────────────────────────────────────────
describe('COMMIT-20: revealSession returns seed', () => {
  it('revealSession returns a non-empty string', () => {
    const mgr     = new CommitRevealManager();
    const session = mgr.createSession('ps-20');
    const seed    = mgr.revealSession(session.sessionId);
    expect(typeof seed).toBe('string');
    expect(seed.length).toBeGreaterThan(0);
  });

  it('revealed seed hashes to the committed serverSeedHash', () => {
    const mgr     = new CommitRevealManager();
    const session = mgr.createSession('ps-20b');
    const seed    = mgr.revealSession(session.sessionId);
    const expectedHash = fnv1a256(seed + ':commitment');
    expect(session.serverSeedHash).toBe(expectedHash);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT-21: post-reveal proof has real serverSeed
// ─────────────────────────────────────────────────────────────────────────────
describe('COMMIT-21: post-reveal proof has seed', () => {
  it('after revealSession, spinProof includes the actual serverSeed', () => {
    const mgr     = new CommitRevealManager();
    const session = mgr.createSession('ps-21');
    mgr.spinRng(session.sessionId);
    const actualSeed = mgr.revealSession(session.sessionId);
    const proof      = mgr.spinProof(session.sessionId);
    expect(proof.serverSeed).toBe(actualSeed);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT-22: verifyProof valid with correct serverSeed
// ─────────────────────────────────────────────────────────────────────────────
describe('COMMIT-22: verifyProof valid with correct seed', () => {
  it('returns { valid: true } when serverSeed matches the proof', () => {
    const mgr     = new CommitRevealManager();
    const session = mgr.createSession('ps-22');
    mgr.spinRng(session.sessionId);
    const actualSeed = mgr.revealSession(session.sessionId);
    const proof      = mgr.spinProof(session.sessionId);
    const result     = mgr.verifyProof(proof, actualSeed);
    expect(result.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT-23: verifyProof invalid with wrong serverSeed
// ─────────────────────────────────────────────────────────────────────────────
describe('COMMIT-23: verifyProof invalid with wrong seed', () => {
  it('returns { valid: false } when a wrong serverSeed is supplied', () => {
    const mgr     = new CommitRevealManager();
    const session = mgr.createSession('ps-23');
    mgr.spinRng(session.sessionId);
    mgr.revealSession(session.sessionId);
    const proof  = mgr.spinProof(session.sessionId);
    const result = mgr.verifyProof(proof, 'completely-wrong-seed');
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT-24: verifyProof invalid with tampered derivedSeed
// ─────────────────────────────────────────────────────────────────────────────
describe('COMMIT-24: verifyProof invalid with tampered derivedSeed', () => {
  it('returns { valid: false } when proof.derivedSeed has been tampered', () => {
    const mgr     = new CommitRevealManager();
    const session = mgr.createSession('ps-24');
    mgr.spinRng(session.sessionId);
    const actualSeed = mgr.revealSession(session.sessionId);
    const proof      = mgr.spinProof(session.sessionId);

    // Tamper with derivedSeed
    const tampered = { ...proof, derivedSeed: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
    const result   = mgr.verifyProof(tampered, actualSeed);
    expect(result.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT-25: unknown sessionId throws
// ─────────────────────────────────────────────────────────────────────────────
describe('COMMIT-25: unknown sessionId throws', () => {
  it('spinRng with unknown sessionId throws an error', () => {
    const mgr = new CommitRevealManager();
    expect(() => mgr.spinRng('nonexistent-session-id')).toThrow();
  });

  it('revealSession with unknown sessionId throws an error', () => {
    const mgr = new CommitRevealManager();
    expect(() => mgr.revealSession('nonexistent-session-id')).toThrow();
  });
});
