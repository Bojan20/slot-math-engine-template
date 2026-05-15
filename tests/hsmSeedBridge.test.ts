/**
 * W152 Wave 38 — HsmSeedBridge tests (Kimi K10 acceptance).
 */

import { describe, it, expect } from 'vitest';
import {
  HsmSeedBridge,
  HsmSeedHealthFailure,
  HsmSeedUnavailable,
  runApt,
  runRct,
} from '../src/rng/hsmSeedBridge.js';
import { MockHsmAdapter } from '../src/hsm/adapters/mock.js';

function makeBridge(clusterId = 'cluster-A', seed = 0xCAFEBABE) {
  const adapter = new MockHsmAdapter({ seed });
  const handle = adapter.createKey('seed-key', 'ECDSA_SHA_256');
  return new HsmSeedBridge({ adapter, keyHandle: handle, clusterId });
}

describe('HsmSeedBridge — Wave 38 / Kimi K10', () => {
  describe('deriveSeed', () => {
    it('produces a 32-byte seed for a valid epoch', async () => {
      const bridge = makeBridge();
      const r = await bridge.deriveSeed(0);
      expect(r.seed).toBeInstanceOf(Uint8Array);
      expect(r.seed.length).toBe(32);
      expect(r.seedHash).toMatch(/^[a-f0-9]{12}$/);
      expect(r.epoch).toBe(0);
      expect(r.derivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('different epochs produce different seeds', async () => {
      const bridge = makeBridge();
      const a = await bridge.deriveSeed(0);
      const b = await bridge.deriveSeed(1);
      expect(a.seed).not.toEqual(b.seed);
      expect(a.seedHash).not.toBe(b.seedHash);
    });

    it('different clusters produce different seeds for the same epoch', async () => {
      const bridgeA = makeBridge('cluster-A');
      const bridgeB = makeBridge('cluster-B');
      const a = await bridgeA.deriveSeed(42);
      const b = await bridgeB.deriveSeed(42);
      expect(a.seed).not.toEqual(b.seed);
    });

    it('rejects negative or non-integer epoch', async () => {
      const bridge = makeBridge();
      await expect(bridge.deriveSeed(-1)).rejects.toThrow(/non-negative/);
      await expect(bridge.deriveSeed(1.5)).rejects.toThrow(/non-negative/);
    });

    it('throws HsmSeedUnavailable when adapter is offline', async () => {
      const offline = new MockHsmAdapter({ forceUnavailable: true });
      const bridge = new HsmSeedBridge({
        adapter: offline,
        keyHandle: { id: 'mock-key:seed', algorithm: 'ECDSA_SHA_256', publicKeyExportable: true },
        clusterId: 'X',
      });
      await expect(bridge.deriveSeed(0)).rejects.toBeInstanceOf(HsmSeedUnavailable);
    });

    it('clusterId is required (empty string rejected)', () => {
      const adapter = new MockHsmAdapter();
      const handle = adapter.createKey('k', 'ECDSA_SHA_256');
      expect(() => new HsmSeedBridge({ adapter, keyHandle: handle, clusterId: '' })).toThrow(/clusterId/);
    });
  });

  describe('Multi-instance broadcast', () => {
    it('two bridges with same (cluster, key seed) produce identical seeds for the same epoch', async () => {
      // RSA mock keys are non-deterministic by design; use ECDSA which is
      // deterministic when MockHsmAdapter is constructed with a fixed seed.
      const a = makeBridge('cluster-prod', 0xDEADBEEF);
      const b = makeBridge('cluster-prod', 0xDEADBEEF);
      const seedA = await a.deriveSeed(7);
      const seedB = await b.deriveSeed(7);
      // Same HSM seed + same cluster + same epoch → identical derived seed.
      // This is the multi-instance broadcast property: every node converges
      // on identical RNG state without coordination.
      expect(seedA.seed).toEqual(seedB.seed);
      expect(seedA.seedHash).toBe(seedB.seedHash);
    });
  });

  describe('deriveU64Seed', () => {
    it('returns a u64 BigInt usable for engine PRNG seeds', async () => {
      const bridge = makeBridge();
      const r = await bridge.deriveU64Seed(0);
      expect(typeof r.u64).toBe('bigint');
      expect(r.u64).toBeGreaterThanOrEqual(0n);
      expect(r.u64).toBeLessThan(1n << 64n);
      expect(r.meta.seed.length).toBe(32);
    });
  });

  describe('deriveChaCha20Seed', () => {
    it('returns 32-byte key + 12-byte nonce for the CSPRNG backend', async () => {
      const bridge = makeBridge();
      const r = await bridge.deriveChaCha20Seed(0);
      expect(r.key.length).toBe(32);
      expect(r.nonce.length).toBe(12);
      // Nonce is deterministic from key (sha256(seed)[:12])
      const r2 = await bridge.deriveChaCha20Seed(0);
      expect(r.nonce).toEqual(r2.nonce);
    });
  });

  describe('Continuous health tests (FIPS 140-3 IG D.K)', () => {
    it('runRct accepts uniform random bytes', () => {
      const bytes = new Uint8Array(256);
      for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
      expect(() => runRct(bytes)).not.toThrow();
    });

    it('runRct rejects long runs (> 32 consecutive)', () => {
      const bytes = new Uint8Array(64).fill(0x42);
      expect(() => runRct(bytes, 32)).toThrow(HsmSeedHealthFailure);
    });

    it('runApt accepts uniform random bytes', () => {
      const bytes = new Uint8Array(128);
      for (let i = 0; i < bytes.length; i++) bytes[i] = i;
      expect(() => runApt(bytes)).not.toThrow();
    });

    it('runApt rejects byte-skewed window > 80%', () => {
      const bytes = new Uint8Array(64).fill(0x55); // 100% same byte
      expect(() => runApt(bytes, 64, 0.8)).toThrow(HsmSeedHealthFailure);
    });

    it('disableHealthTests bypasses RCT/APT', async () => {
      // Health tests should pass on real HSM signatures; this just verifies
      // the bypass flag is honored.
      const adapter = new MockHsmAdapter({ seed: 0xC0FFEE });
      const handle = adapter.createKey('k', 'ECDSA_SHA_256');
      const bridge = new HsmSeedBridge({
        adapter, keyHandle: handle, clusterId: 'X',
        disableHealthTests: true,
      });
      const r = await bridge.deriveSeed(0);
      expect(r.seed.length).toBe(32);
    });
  });

  describe('Audit hash truncation (forward-secrecy hygiene)', () => {
    it('seedHash is exactly 12 chars (truncated SHA-256), never the full seed', async () => {
      const bridge = makeBridge();
      const r = await bridge.deriveSeed(0);
      expect(r.seedHash.length).toBe(12);
      expect(r.seedHash.length).toBeLessThan(64); // not full SHA-256 hex
    });
  });
});
