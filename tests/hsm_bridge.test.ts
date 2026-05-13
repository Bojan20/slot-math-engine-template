/**
 * HSM Bridge — Test Suite (P0 #10, RNG side)
 *
 * Covers the public surface of `src/crypto/hsm.ts`:
 *   - HSMProvider / HSMSession lifecycle (open → use → close)
 *   - generateRandomBytes byte-count & basic shape
 *   - healthCheck pass path
 *   - healthCheck fail path → RngFactory fallback
 *   - createRng kind='hsm_pkcs11' with missing provider → ChaCha20 fallback + warn
 *   - createRng kind='hsm_pkcs11' with `fallbackForbidden: true` → throws
 *   - createRngAsync happy path
 *   - RngBackend conformance: same mock seed → same nextU64 sequence
 *   - Buffer refill on underrun
 *   - HSMBackedRngBackend.split() yields an independent, deterministic stream
 *   - generateRandomBytes after close() throws
 *
 * Target: 10+ tests, all green.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MockHSMProvider,
  MockHSMSession,
  HSMBackedRngBackend,
  createHsmBackedRng,
  HSM_REFILL_BYTES,
  type HSMProvider,
  type HSMSession,
  type HSMOpenOptions,
} from '../src/crypto/hsm.js';
import {
  createRng,
  createRngAsync,
  type ExtendedRngKind,
} from '../src/rng/RngFactory.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TEST_SEED = 'hsm-bridge-test-seed';

async function openMock(seed = TEST_SEED): Promise<MockHSMSession> {
  const p = new MockHSMProvider(seed);
  const s = await p.open({});
  return s as MockHSMSession;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('HSM Bridge — MockHSMProvider lifecycle', () => {
  it('open() returns a session that is healthy and reports vendor=mock-pkcs11', async () => {
    const p = new MockHSMProvider();
    const s = await p.open({});
    const h = await s.healthCheck();
    expect(h.ok).toBe(true);
    expect(h.vendor).toBe('mock-pkcs11');
    expect(h.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof h.serialNo).toBe('string');
    await s.close();
  });

  it('close() is idempotent and subsequent generateRandomBytes throws', async () => {
    const s = await openMock();
    await s.close();
    await s.close(); // second close — no throw
    await expect(s.generateRandomBytes(8)).rejects.toThrow(/after close/);
  });
});

describe('HSM Bridge — generateRandomBytes shape', () => {
  it('returns exactly N bytes for N=1, 4, 7, 64, 4096', async () => {
    const s = await openMock();
    for (const n of [1, 4, 7, 64, 4096]) {
      const b = await s.generateRandomBytes(n);
      expect(b).toBeInstanceOf(Uint8Array);
      expect(b.length).toBe(n);
    }
    await s.close();
  });

  it('rejects negative and non-integer counts', async () => {
    const s = await openMock();
    await expect(s.generateRandomBytes(-1)).rejects.toThrow(/non-negative integer/);
    await expect(s.generateRandomBytes(1.5)).rejects.toThrow(/non-negative integer/);
    await s.close();
  });
});

describe('HSM Bridge — healthCheck pass / fail paths', () => {
  it('failHealth flag causes healthCheck.ok === false', async () => {
    const p = new MockHSMProvider(TEST_SEED, 'MOCK-FAIL', /*failHealth=*/ true);
    const s = await p.open({});
    const h = await s.healthCheck();
    expect(h.ok).toBe(false);
    expect(h.vendor).toBe('mock-pkcs11');
    await s.close();
  });

  it('healthy session can serve entropy then close cleanly', async () => {
    const s = await openMock();
    const a = await s.generateRandomBytes(16);
    const b = await s.generateRandomBytes(16);
    expect(a).not.toEqual(b); // distinct draws are almost surely different
    await s.close();
  });
});

describe('HSM Bridge — RngFactory fallback paths', () => {
  beforeEach(() => {
    delete process.env.HSM_FALLBACK_FORBIDDEN;
  });

  it('createRng kind=hsm_pkcs11 with NO provider → ChaCha20 fallback + console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rng = createRng('hsm_pkcs11' as ExtendedRngKind, 12345);
    expect(rng).toBeDefined();
    // exercise the backend to confirm it works
    const u = rng.nextU64();
    expect(Array.isArray(u)).toBe(true);
    expect(u.length).toBe(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/ChaCha20 fallback/));
    warnSpy.mockRestore();
  });

  it('createRng with fallbackForbidden:true throws on missing provider', () => {
    expect(() =>
      createRng('hsm_pkcs11' as ExtendedRngKind, 12345, { fallbackForbidden: true }),
    ).toThrow(/HSM fallback forbidden/);
  });

  it('createRng with MockHSMProvider + failHealth → falls back with warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = new MockHSMProvider(TEST_SEED, 'MOCK-FAIL', true);
    const rng = createRng('hsm_pkcs11' as ExtendedRngKind, 1, { provider });
    expect(rng).toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/healthCheck failed/));
    warnSpy.mockRestore();
  });

  it('createRngAsync with healthy MockHSMProvider → HSMBackedRngBackend, no warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = new MockHSMProvider(TEST_SEED);
    const rng = await createRngAsync('hsm_pkcs11' as ExtendedRngKind, 1, { provider });
    expect(rng).toBeInstanceOf(HSMBackedRngBackend);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('createRngAsync with no provider falls back (and warns) without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rng = await createRngAsync('hsm_pkcs11' as ExtendedRngKind, 1);
    expect(rng).toBeDefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('HSM_FALLBACK_FORBIDDEN=1 turns the warn into a throw', () => {
    process.env.HSM_FALLBACK_FORBIDDEN = '1';
    try {
      expect(() => createRng('hsm_pkcs11' as ExtendedRngKind, 1)).toThrow(
        /HSM fallback forbidden/,
      );
    } finally {
      delete process.env.HSM_FALLBACK_FORBIDDEN;
    }
  });
});

describe('HSM Bridge — RngBackend conformance', () => {
  it('same mock seed → identical nextU64 sequence (determinism)', async () => {
    const a = await createHsmBackedRng(new MockHSMProvider('det-seed-A'), {});
    const b = await createHsmBackedRng(new MockHSMProvider('det-seed-A'), {});
    const seqA: [number, number][] = [];
    const seqB: [number, number][] = [];
    for (let i = 0; i < 1000; i++) {
      seqA.push(a.nextU64());
      seqB.push(b.nextU64());
    }
    expect(seqA).toEqual(seqB);
  });

  it('different seeds → different sequences', async () => {
    const a = await createHsmBackedRng(new MockHSMProvider('seed-X'), {});
    const b = await createHsmBackedRng(new MockHSMProvider('seed-Y'), {});
    let differences = 0;
    for (let i = 0; i < 100; i++) {
      const va = a.nextU64();
      const vb = b.nextU64();
      if (va[0] !== vb[0] || va[1] !== vb[1]) differences++;
    }
    expect(differences).toBeGreaterThan(90);
  });

  it('nextF64() yields values in [0, 1)', async () => {
    const rng = await createHsmBackedRng(new MockHSMProvider(), {});
    for (let i = 0; i < 256; i++) {
      const f = rng.nextF64();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('nextU32Bounded(max) yields values in [0, max) with no values out of range', async () => {
    const rng = await createHsmBackedRng(new MockHSMProvider(), {});
    const MAX = 37;
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.nextU32Bounded(MAX);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(MAX);
      seen.add(v);
    }
    // Every bucket should have been hit at least once
    expect(seen.size).toBe(MAX);
  });

  it('split(nonce) produces an independent, deterministic child stream', async () => {
    const parentA = await createHsmBackedRng(new MockHSMProvider('split-parent'), {});
    const parentB = await createHsmBackedRng(new MockHSMProvider('split-parent'), {});
    const childA = parentA.split(7);
    const childB = parentB.split(7);
    const seqA: [number, number][] = [];
    const seqB: [number, number][] = [];
    for (let i = 0; i < 100; i++) {
      seqA.push(childA.nextU64());
      seqB.push(childB.nextU64());
    }
    expect(seqA).toEqual(seqB);
    // Different nonce → different stream
    const childB2 = parentB.split(8);
    const v0 = childA.nextU64();
    const v1 = childB2.nextU64();
    expect(v0[0] !== v1[0] || v0[1] !== v1[1]).toBe(true);
  });
});

describe('HSM Bridge — buffer refill on underrun', () => {
  it('refills synchronously when buffered bytes are exhausted', async () => {
    const rng = await createHsmBackedRng(new MockHSMProvider('refill-test'), {});
    // Initial buffer = HSM_REFILL_BYTES (4096).  Drain it.
    expect(rng.bufferedBytes).toBe(HSM_REFILL_BYTES);
    const drainCount = HSM_REFILL_BYTES / 8; // each nextU64 consumes 8 bytes
    for (let i = 0; i < drainCount; i++) {
      rng.nextU64();
    }
    expect(rng.bufferedBytes).toBe(0);
    // Next call MUST trigger a sync refill (mock is in-process)
    const v = rng.nextU64();
    expect(v[0]).toBeGreaterThanOrEqual(0);
    expect(v[1]).toBeGreaterThanOrEqual(0);
    expect(rng.bufferedBytes).toBeGreaterThan(0);
  });

  it('refill() async path returns >= requested bytes', async () => {
    const rng = await createHsmBackedRng(new MockHSMProvider('refill-async'), {});
    const before = rng.bufferedBytes;
    const added = await rng.refill(1024);
    expect(added).toBe(1024);
    expect(rng.bufferedBytes).toBe(before + 1024);
  });
});

describe('HSM Bridge — provider contract', () => {
  it('a custom async-only provider works with createHsmBackedRng', async () => {
    // Minimal provider that delegates to MockHSMSession but does NOT
    // expose the sync brand.  Exercises the pure async path.
    class AsyncOnlyProvider implements HSMProvider {
      async open(opts: HSMOpenOptions): Promise<HSMSession> {
        const seed = opts.seed ?? 'async-only';
        const inner = new MockHSMSession(seed, 'ASYNC-1', false);
        // Strip the sync brand so callers must use the async path
        const wrapper: HSMSession = {
          async generateRandomBytes(n: number) {
            return inner.generateRandomBytes(n);
          },
          async close() {
            return inner.close();
          },
          async healthCheck() {
            return inner.healthCheck();
          },
        };
        return wrapper;
      }
    }
    const rng = await createHsmBackedRng(new AsyncOnlyProvider(), {});
    // First 4096 bytes were prefetched; serving from buffer should work
    const v = rng.nextU64();
    expect(typeof v[0]).toBe('number');
    // After draining we expect a *sync underrun* throw because the
    // session isn't sync-capable.
    while (rng.bufferedBytes >= 8) rng.nextU64();
    expect(() => rng.nextU64()).toThrow(/synchronous underrun/);
  });
});
