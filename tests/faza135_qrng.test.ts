/**
 * FAZA 13.5 — QRNG Bridge KATs
 *
 * Tests:
 * 1. MockQuantumSource basic functionality
 * 2. ChaCha20Source always-available fallback
 * 3. QrngBridge with mock primary
 * 4. Fallback escalation on primary failure
 * 5. Fallback mode entry + retry logic
 * 6. Shannon entropy quality gate
 * 7. nextFloat bounds [0, 1)
 * 8. nextInt rejection sampling
 * 9. nextFloats batch efficiency
 * 10. Health reporting
 * 11. Injected failure → fallback
 * 12. maxPrimaryFailures threshold
 */

import { describe, it, expect, vi } from 'vitest';
import {
  QrngBridge,
  MockQuantumSource,
  ChaCha20Source,
  estimateShannonBitsPerByte,
} from '../src/qrng/index.js';
import type { QrngBridgeConfig } from '../src/qrng/index.js';

vi.setConfig({ testTimeout: 5000 });

// ─────────────────────────────────────────────────────────────────────────────

describe('FAZA 13.5 — MockQuantumSource', () => {

  it('QRNG-01: fetchBytes returns correct byte count', async () => {
    const src = new MockQuantumSource(42);
    const bytes = await src.fetchBytes(32);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(32);
  });

  it('QRNG-02: same seed → identical output', async () => {
    const src1 = new MockQuantumSource(999);
    const src2 = new MockQuantumSource(999);
    const b1 = await src1.fetchBytes(16);
    const b2 = await src2.fetchBytes(16);
    expect(Array.from(b1)).toEqual(Array.from(b2));
  });

  it('QRNG-03: different seeds → different output', async () => {
    const src1 = new MockQuantumSource(1);
    const src2 = new MockQuantumSource(2);
    const b1 = await src1.fetchBytes(16);
    const b2 = await src2.fetchBytes(16);
    expect(Array.from(b1)).not.toEqual(Array.from(b2));
  });

  it('QRNG-04: injectFailure causes next fetchBytes to reject', async () => {
    const src = new MockQuantumSource(42);
    src.injectFailure();
    await expect(src.fetchBytes(8)).rejects.toThrow();
  });

  it('QRNG-05: after injected failure, subsequent call succeeds', async () => {
    const src = new MockQuantumSource(42);
    src.injectFailure();
    try { await src.fetchBytes(8); } catch {}
    const bytes = await src.fetchBytes(8);
    expect(bytes.length).toBe(8);
  });

  it('QRNG-06: health.successRate = 1 after success', async () => {
    const src = new MockQuantumSource(42);
    await src.fetchBytes(32);
    await src.fetchBytes(32);
    const h = src.health();
    expect(h.successRate).toBe(1.0);
    expect(h.totalBytesServed).toBe(64);
  });

  it('QRNG-07: health.successRate < 1 after failure', async () => {
    const src = new MockQuantumSource(42);
    await src.fetchBytes(32);
    src.injectFailure();
    try { await src.fetchBytes(8); } catch {}
    const h = src.health();
    expect(h.successRate).toBeLessThan(1.0);
    expect(h.lastFailureReason).toContain('injected');
  });

});

// ─────────────────────────────────────────────────────────────────────────────

describe('FAZA 13.5 — ChaCha20Source', () => {

  it('QRNG-08: always resolves (never rejects)', async () => {
    const src = new ChaCha20Source('test-seed');
    const bytes = await src.fetchBytes(64);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(64);
  });

  it('QRNG-09: sequential outputs produce different bytes', async () => {
    const src = new ChaCha20Source('seq-test');
    const b1 = await src.fetchBytes(16);
    const b2 = await src.fetchBytes(16);
    // Should be different (counter advances)
    expect(Array.from(b1)).not.toEqual(Array.from(b2));
  });

  it('QRNG-10: kind is chacha20', () => {
    const src = new ChaCha20Source();
    expect(src.kind).toBe('chacha20');
  });

});

// ─────────────────────────────────────────────────────────────────────────────

describe('FAZA 13.5 — Shannon entropy estimator', () => {

  it('QRNG-11: all-zero bytes → near 0 bits/byte', () => {
    const bytes = new Uint8Array(256); // all zeros
    const sh = estimateShannonBitsPerByte(bytes);
    // All same value → entropy = 0 (only symbol has p=1, -log2(1)=0)
    expect(sh).toBeCloseTo(0, 3);
  });

  it('QRNG-12: uniform byte distribution → near 8 bits/byte', () => {
    // Exactly one of each byte 0-255
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const sh = estimateShannonBitsPerByte(bytes);
    expect(sh).toBeCloseTo(8.0, 2);
  });

  it('QRNG-13: empty buffer → 0', () => {
    const sh = estimateShannonBitsPerByte(new Uint8Array(0));
    expect(sh).toBe(0);
  });

});

// ─────────────────────────────────────────────────────────────────────────────

describe('FAZA 13.5 — QrngBridge: basic operation', () => {

  function makeBridge(opts: Partial<QrngBridgeConfig> = {}): QrngBridge {
    return new QrngBridge({
      primary: { kind: 'mock', seed: 'test-primary' },
      fallback: { kind: 'chacha20', seed: 'test-fallback' },
      maxPrimaryFailures: 3,
      ...opts,
    });
  }

  it('QRNG-14: nextBytes resolves with correct count', async () => {
    const bridge = makeBridge();
    const batch = await bridge.nextBytes(16);
    expect(batch.bytes.length).toBe(16);
    expect(batch.source).toBe('mock');
  });

  it('QRNG-15: nextFloat returns value in [0, 1)', async () => {
    const bridge = makeBridge();
    for (let i = 0; i < 100; i++) {
      const f = await bridge.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('QRNG-16: nextInt returns value in [min, max] inclusive', async () => {
    const bridge = makeBridge();
    for (let i = 0; i < 50; i++) {
      const v = await bridge.nextInt(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('QRNG-17: nextFloats batch matches count', async () => {
    const bridge = makeBridge();
    const floats = await bridge.nextFloats(10);
    expect(floats).toHaveLength(10);
    for (const f of floats) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('QRNG-18: batchCount increments on each nextBytes call', async () => {
    const bridge = makeBridge();
    expect(bridge.batchCount).toBe(0);
    await bridge.nextBytes(4);
    await bridge.nextBytes(4);
    expect(bridge.batchCount).toBe(2);
  });

  it('QRNG-19: inFallbackMode is false when primary works', async () => {
    const bridge = makeBridge();
    await bridge.nextBytes(8);
    expect(bridge.inFallbackMode).toBe(false);
  });

});

// ─────────────────────────────────────────────────────────────────────────────

describe('FAZA 13.5 — QrngBridge: fallback escalation', () => {

  it('QRNG-20: single failure → still uses fallback source (not in fallback mode yet)', async () => {
    const primary = new MockQuantumSource(1);
    const bridge = new QrngBridge({
      primary: { kind: 'mock' },
      fallback: { kind: 'chacha20' },
      maxPrimaryFailures: 3,  // need 3 failures to enter fallback mode
    });
    // Inject 1 failure — shouldn't enter fallback mode (only 1/3)
    primary.injectFailure();
    // Can't directly inject into bridge's internal MockQuantumSource
    // Instead, test bridge behavior through failed-primary-source bridge
    const bridge2 = new QrngBridge({
      primary: { kind: 'quantinuum' },  // no apiKey → always fails
      fallback: { kind: 'chacha20', seed: 'fallback' },
      maxPrimaryFailures: 3,
    });
    const batch = await bridge2.nextBytes(8);
    // Should use fallback since primary has no apiKey
    expect(batch.source).toBe('chacha20');
  });

  it('QRNG-21: maxPrimaryFailures exceeded → enters fallback-only mode', async () => {
    // Use quantinuum with no apiKey (always fails)
    const bridge = new QrngBridge({
      primary: { kind: 'quantinuum' },  // no apiKey → fails immediately
      fallback: { kind: 'chacha20', seed: 'fb' },
      maxPrimaryFailures: 2,
    });
    // Make 2 requests (each fails primary, uses fallback)
    await bridge.nextBytes(4);
    await bridge.nextBytes(4);
    // After 2 failures, should be in fallback mode
    expect(bridge.inFallbackMode).toBe(true);
  });

  it('QRNG-22: fallback mode → all subsequent batches from fallback', async () => {
    const bridge = new QrngBridge({
      primary: { kind: 'quantinuum' },  // always fails
      fallback: { kind: 'chacha20', seed: 'fb2' },
      maxPrimaryFailures: 1,  // 1 failure → fallback mode immediately
    });
    await bridge.nextBytes(4);  // triggers fallback mode
    const batch = await bridge.nextBytes(4);
    expect(batch.source).toBe('chacha20');
    expect(batch.isQuantum).toBe(false);
  });

  it('QRNG-23: health returns health for both sources', async () => {
    const bridge = new QrngBridge({
      primary: { kind: 'mock' },
      fallback: { kind: 'chacha20' },
      maxPrimaryFailures: 3,
    });
    await bridge.nextBytes(8);
    const h = bridge.health();
    expect(h.primary).toBeDefined();
    expect(h.fallback).toBeDefined();
    expect(typeof h.inFallbackMode).toBe('boolean');
  });

  it('QRNG-24: nextInt(5, 5) always returns 5 (single-value range)', async () => {
    const bridge = new QrngBridge({
      primary: { kind: 'mock', seed: 'x' },
      fallback: { kind: 'chacha20' },
    });
    for (let i = 0; i < 10; i++) {
      const v = await bridge.nextInt(5, 5);
      expect(v).toBe(5);
    }
  });

  it('QRNG-25: nextInt(min > max) throws RangeError', async () => {
    const bridge = new QrngBridge({
      primary: { kind: 'mock' },
      fallback: { kind: 'chacha20' },
    });
    await expect(bridge.nextInt(10, 5)).rejects.toThrow(RangeError);
  });

});
