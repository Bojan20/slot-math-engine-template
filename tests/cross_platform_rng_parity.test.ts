// Cross-Platform RNG Byte-Parity Tests — Wave 48 (Faza 7.3)
//
// In-process vitest cousin of scripts/cross-platform-rng-parity.mjs. The
// CI workflow (.github/workflows/cross-platform-rng-parity.yml) runs the
// script on a 4-OS matrix and asserts no drift from the committed golden.
// These vitest tests assert the SAME guarantees inside the standard test
// suite so any local `npm test` run catches an RNG-algorithm regression
// even before CI fires.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { Mulberry32 } from '../src/rng/backends/Mulberry32.js';
import { PCG64 } from '../src/rng/backends/PCG64.js';
import { Xoshiro256SS } from '../src/rng/backends/Xoshiro256SS.js';
import { Philox4x32 } from '../src/rng/backends/Philox4x32.js';
import { ChaCha20 } from '../src/rng/backends/ChaCha20.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN_PATH = join(ROOT, 'reports', 'parity', 'CROSS_PLATFORM_GOLDEN.json');

const SEED = 12345;
const SAMPLES = 100_000;

function hashMulberry32(): string {
  const rng = new Mulberry32(SEED);
  const hash = createHash('sha256');
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  for (let i = 0; i < SAMPLES; i++) {
    const f = rng.nextF64();
    const u32 = Math.floor(f * 4294967296) >>> 0;
    view.setUint32(0, u32, true);
    hash.update(Buffer.from(buf));
  }
  return hash.digest('hex');
}

function hashU64Backend(rng: { nextU64: () => [number, number] }): string {
  const hash = createHash('sha256');
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  for (let i = 0; i < SAMPLES; i++) {
    const [hi, lo] = rng.nextU64();
    view.setUint32(0, hi >>> 0, true);
    view.setUint32(4, lo >>> 0, true);
    hash.update(Buffer.from(buf));
  }
  return hash.digest('hex');
}

describe('Cross-Platform RNG byte-parity (Wave 48 / Faza 7.3)', () => {
  it('golden snapshot file exists in repo', () => {
    expect(existsSync(GOLDEN_PATH)).toBe(true);
  });

  it('golden snapshot has all 5 backends + seed=12345 + samples=100000', () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    expect(golden.seed).toBe(SEED);
    expect(golden.samples).toBe(SAMPLES);
    expect(Object.keys(golden.backends).sort()).toEqual(
      ['chacha20', 'mulberry32', 'pcg64', 'philox4x32', 'xoshiro256ss'],
    );
    for (const b of Object.values(golden.backends) as Array<{ sha256: string }>) {
      expect(b.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('Mulberry32 100k SHA-256 matches golden', () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    const actual = hashMulberry32();
    expect(actual).toBe(golden.backends.mulberry32.sha256);
  });

  it('PCG-64 100k SHA-256 matches golden', () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    const rng = new PCG64(SEED);
    const actual = hashU64Backend(rng);
    expect(actual).toBe(golden.backends.pcg64.sha256);
  });

  it('Xoshiro256** 100k SHA-256 matches golden', () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    const rng = new Xoshiro256SS(SEED);
    const actual = hashU64Backend(rng);
    expect(actual).toBe(golden.backends.xoshiro256ss.sha256);
  });

  it('Philox4x32 100k SHA-256 matches golden', () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    const rng = new Philox4x32(SEED);
    const actual = hashU64Backend(rng);
    expect(actual).toBe(golden.backends.philox4x32.sha256);
  });

  it('ChaCha20 100k SHA-256 matches golden', () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    const rng = new ChaCha20(SEED);
    const actual = hashU64Backend(rng);
    expect(actual).toBe(golden.backends.chacha20.sha256);
  });

  it('every backend produces a distinct hash (collision sanity)', () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    const hashes = Object.values(golden.backends).map((b: any) => b.sha256);
    const distinct = new Set(hashes);
    expect(distinct.size).toBe(hashes.length);
  });

  it('rerun produces identical hash (within-process determinism)', () => {
    const h1 = hashMulberry32();
    const h2 = hashMulberry32();
    expect(h1).toBe(h2);
  });
});
