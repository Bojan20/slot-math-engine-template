/**
 * W152 P2-14 — VRF / provably-fair adapter tests.
 *
 * Covers:
 *   * `Sha256CommitRevealVRF` commits before reveal (the player can
 *     verify after).
 *   * `prove` is deterministic for the same (serverSeed, clientSeed,
 *     input).
 *   * `verify` accepts a valid output and rejects every kind of
 *     tampering (input flipped, beta flipped, proof flipped, wrong
 *     serverSeed seed length).
 *   * Different inputs produce different β.
 *   * Short serverSeed throws.
 *   * `NoOpVRFProver.verify` always returns false.
 *   * `ChainlinkVRFv2_5Adapter` round-trips via injected requester.
 */

import { describe, it, expect } from 'vitest';
import { sha256 } from '@noble/hashes/sha2';
import {
  ChainlinkVRFv2_5Adapter,
  NoOpVRFProver,
  Sha256CommitRevealVRF,
} from '../src/rng/vrf.js';

function bytes(n: number, fill = 0): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (fill + i) & 0xff;
  return b;
}

describe('W152 P2-14 — Sha256CommitRevealVRF', () => {
  it('commitment is H(serverSeed) — published before reveal', () => {
    const server = bytes(32, 1);
    const vrf = new Sha256CommitRevealVRF(server);
    const commit = vrf.commitment();
    expect(commit).toEqual(sha256(server));
  });

  it('prove() is deterministic for same (server, client, input)', async () => {
    const server = bytes(32, 7);
    const client = bytes(16, 3);
    const a = new Sha256CommitRevealVRF(server, client);
    const b = new Sha256CommitRevealVRF(server, client);
    const input = bytes(8, 5);
    const o1 = await a.prove(input);
    const o2 = await b.prove(input);
    expect(o1.beta).toEqual(o2.beta);
    expect(o1.proof).toEqual(o2.proof);
  });

  it('verify() accepts a valid output', async () => {
    const server = bytes(32, 2);
    const client = bytes(8, 4);
    const vrf = new Sha256CommitRevealVRF(server, client);
    const input = bytes(8, 9);
    const out = await vrf.prove(input);
    expect(await vrf.verify(input, out)).toBe(true);
  });

  it('verify() rejects flipped input', async () => {
    const vrf = new Sha256CommitRevealVRF(bytes(32, 11));
    const input = bytes(8, 1);
    const out = await vrf.prove(input);
    const tampered = new Uint8Array(input);
    tampered[0] ^= 0xff;
    expect(await vrf.verify(tampered, out)).toBe(false);
  });

  it('verify() rejects flipped beta', async () => {
    const vrf = new Sha256CommitRevealVRF(bytes(32, 11));
    const input = bytes(8, 1);
    const out = await vrf.prove(input);
    out.beta[0] ^= 0xff;
    expect(await vrf.verify(input, out)).toBe(false);
  });

  it('verify() rejects flipped proof', async () => {
    const vrf = new Sha256CommitRevealVRF(bytes(32, 11));
    const input = bytes(8, 1);
    const out = await vrf.prove(input);
    out.proof[0] ^= 0xff;
    expect(await vrf.verify(input, out)).toBe(false);
  });

  it('different inputs yield different β', async () => {
    const vrf = new Sha256CommitRevealVRF(bytes(32, 11));
    const a = await vrf.prove(bytes(8, 1));
    const b = await vrf.prove(bytes(8, 2));
    expect(a.beta).not.toEqual(b.beta);
  });

  it('rejects serverSeed shorter than 32 bytes', () => {
    expect(() => new Sha256CommitRevealVRF(bytes(16))).toThrow(/32 bytes/);
  });

  it('emits metadata with backend + timestamp', async () => {
    const vrf = new Sha256CommitRevealVRF(bytes(32, 1));
    const out = await vrf.prove(bytes(8, 0));
    expect(out.metadata.backend).toBe('sha256-commit-reveal');
    expect(out.metadata.generatedAtUtc).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});

describe('W152 P2-14 — NoOpVRFProver', () => {
  it('verify always returns false', async () => {
    const noop = new NoOpVRFProver();
    const out = await noop.prove(bytes(8));
    expect(await noop.verify(bytes(8), out)).toBe(false);
  });

  it('returns zero-filled beta', async () => {
    const out = await new NoOpVRFProver().prove(bytes(4));
    expect(out.beta.every((b) => b === 0)).toBe(true);
  });
});

describe('W152 P2-14 — ChainlinkVRFv2_5Adapter', () => {
  it('round-trips through injected requester', async () => {
    const beta = bytes(32, 0xab);
    const proof = bytes(64, 0xcd);
    const txHash = '0xdeadbeef';
    const adapter = new ChainlinkVRFv2_5Adapter(async () => ({
      beta,
      proof,
      txHash,
    }));
    const out = await adapter.prove(bytes(8, 1));
    expect(out.beta).toEqual(beta);
    expect(out.proof).toEqual(proof);
    expect(out.metadata.backend).toBe('chainlink-vrf-v2.5');
    expect(out.metadata.ciphersuite).toBe('secp256k1_sha256_tai');
    expect(out.metadata.txHash).toBe(txHash);
  });

  it('verify accepts any output with non-empty txHash', async () => {
    const adapter = new ChainlinkVRFv2_5Adapter(async () => ({
      beta: bytes(32),
      proof: bytes(64),
      txHash: '0xabc',
    }));
    const out = await adapter.prove(bytes(8));
    expect(await adapter.verify(bytes(8), out)).toBe(true);
  });

  it('verify rejects output with empty txHash', async () => {
    const adapter = new ChainlinkVRFv2_5Adapter(async () => ({
      beta: bytes(32),
      proof: bytes(64),
      txHash: '',
    }));
    const out = await adapter.prove(bytes(8));
    expect(await adapter.verify(bytes(8), out)).toBe(false);
  });
});
