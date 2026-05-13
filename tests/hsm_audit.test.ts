/**
 * HSM audit + health monitor — conformance tests.
 *
 * Covers: record/drain/eviction, PIN-leak refusal, JSONL export shape,
 * session/error/health filters, monitor threshold flip, monitor reset,
 * audited-provider transparent wrap, sanitization helper.
 */

import { describe, it, expect } from 'vitest';
import {
  HSMAuditLog,
  HSMHealthMonitor,
  HSMAuditedProvider,
  sanitizeErrorMessage,
  type HSMAuditEvent,
} from '../src/crypto/hsmAudit.js';
import { MockHSMProvider } from '../src/crypto/hsm.js';
import type { HSMSession, HSMHealth } from '../src/crypto/hsm.js';

// ─── Deterministic clock for timestamp assertions ───────────────────────────
function fakeClock(start = new Date('2026-05-13T12:00:00.000Z')): () => Date {
  let n = 0;
  return () => new Date(start.getTime() + n++ * 1000);
}

// ─── A tiny stub session for fine-grained probe testing ─────────────────────
class StubSession implements HSMSession {
  health: HSMHealth = {
    ok: true,
    latencyMs: 0.5,
    vendor: 'stub',
    serialNo: 'STUB-1',
  };
  shouldThrow = false;
  async generateRandomBytes(n: number): Promise<Uint8Array> {
    return new Uint8Array(n);
  }
  async close(): Promise<void> {}
  async healthCheck(): Promise<HSMHealth> {
    if (this.shouldThrow) {
      throw new Error('probe_failed_pin=1234 hex=deadbeefcafebabe1234567890abcdef');
    }
    return this.health;
  }
}

describe('HSMAuditLog basics', () => {
  it('assigns monotonic ids starting at 1', () => {
    const log = new HSMAuditLog(10, fakeClock());
    const id1 = log.record({ kind: 'session.open', sessionId: 's1', vendor: 'v' });
    const id2 = log.record({ kind: 'rng.generate', sessionId: 's1', vendor: 'v', byteCount: 32 });
    expect(id1).toBe(1);
    expect(id2).toBe(2);
    expect(log.size()).toBe(2);
  });

  it('rejects reserved context keys (PIN leakage)', () => {
    const log = new HSMAuditLog();
    expect(() =>
      log.record({
        kind: 'session.open',
        sessionId: 's',
        vendor: 'v',
        // @ts-expect-error — intentional bad input
        context: { pin: '1234' },
      }),
    ).toThrow(/reserved context key/);
    expect(log.size()).toBe(0);
  });

  it('FIFO-evicts beyond cap and counts drops', () => {
    const log = new HSMAuditLog(3, fakeClock());
    for (let i = 0; i < 5; i++) {
      log.record({ kind: 'rng.generate', sessionId: 's', vendor: 'v', byteCount: i });
    }
    expect(log.size()).toBe(3);
    expect(log.droppedCount()).toBe(2);
    // Oldest two should be gone
    const remainingBytes = log.events().map((e) => e.byteCount);
    expect(remainingBytes).toEqual([2, 3, 4]);
  });

  it('filters by kind and session', () => {
    const log = new HSMAuditLog();
    log.record({ kind: 'session.open', sessionId: 'a', vendor: 'v' });
    log.record({ kind: 'session.open', sessionId: 'b', vendor: 'v' });
    log.record({ kind: 'rng.generate', sessionId: 'a', vendor: 'v', byteCount: 64 });
    expect(log.ofKind('session.open')).toHaveLength(2);
    expect(log.forSession('a')).toHaveLength(2);
    expect(log.forSession('b')).toHaveLength(1);
  });

  it('drain returns events and clears buffer', () => {
    const log = new HSMAuditLog();
    log.record({ kind: 'session.open', sessionId: 's', vendor: 'v' });
    const drained = log.drain();
    expect(drained).toHaveLength(1);
    expect(log.size()).toBe(0);
  });

  it('toJsonl produces one parseable object per line', () => {
    const log = new HSMAuditLog(10, fakeClock());
    log.record({ kind: 'session.open', sessionId: 's', vendor: 'v' });
    log.record({ kind: 'rng.generate', sessionId: 's', vendor: 'v', byteCount: 4 });
    const jsonl = log.toJsonl();
    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(2);
    for (const l of lines) {
      const obj = JSON.parse(l);
      expect(obj.id).toBeTypeOf('number');
      expect(obj.kind).toMatch(/^(session\.open|rng\.generate)$/);
    }
  });

  it('rejects non-positive maxEvents', () => {
    expect(() => new HSMAuditLog(0)).toThrow(/positive int/);
    expect(() => new HSMAuditLog(-5)).toThrow(/positive int/);
    expect(() => new HSMAuditLog(1.5)).toThrow(/positive int/);
  });
});

describe('HSMHealthMonitor', () => {
  it('isHealthy true initially and after successful probes', async () => {
    const sess = new StubSession();
    const mon = new HSMHealthMonitor(sess);
    expect(mon.isHealthy()).toBe(true);
    const r = await mon.runOnce();
    expect(r?.ok).toBe(true);
    expect(mon.consecutiveFailures()).toBe(0);
    expect(mon.isHealthy()).toBe(true);
  });

  it('flips to unhealthy after threshold consecutive failures', async () => {
    const sess = new StubSession();
    const mon = new HSMHealthMonitor(sess, { consecutiveFailureThreshold: 2 });
    sess.health = { ok: false, latencyMs: 99, vendor: 'stub' };
    await mon.runOnce();
    expect(mon.isHealthy()).toBe(true); // 1 failure < threshold 2
    await mon.runOnce();
    expect(mon.isHealthy()).toBe(false); // 2 failures = threshold
  });

  it('single success resets consecutive counter', async () => {
    const sess = new StubSession();
    const mon = new HSMHealthMonitor(sess, { consecutiveFailureThreshold: 2 });
    sess.health = { ok: false, latencyMs: 99, vendor: 'stub' };
    await mon.runOnce();
    await mon.runOnce();
    expect(mon.isHealthy()).toBe(false);
    sess.health = { ok: true, latencyMs: 0.5, vendor: 'stub' };
    await mon.runOnce();
    expect(mon.consecutiveFailures()).toBe(0);
    expect(mon.isHealthy()).toBe(true);
  });

  it('records throwing healthCheck as error event with sanitization', async () => {
    const log = new HSMAuditLog();
    const sess = new StubSession();
    sess.shouldThrow = true;
    const mon = new HSMHealthMonitor(sess, {
      auditLog: log,
      vendorHint: 'stub',
      serialHint: 'STUB-1',
      consecutiveFailureThreshold: 1,
    });
    const r = await mon.runOnce();
    expect(r).toBeNull();
    expect(mon.consecutiveFailures()).toBe(1);
    expect(mon.totalFailures()).toBe(1);
    expect(mon.lastError()).toBeDefined();
    const errs = log.ofKind('error');
    expect(errs).toHaveLength(1);
    // PIN + hex must be redacted
    expect(errs[0]!.errorMessage).not.toContain('1234');
    expect(errs[0]!.errorMessage).not.toContain('deadbeefcafebabe');
    expect(errs[0]!.errorMessage).toContain('[REDACTED');
  });

  it('reset() clears counters', async () => {
    const sess = new StubSession();
    const mon = new HSMHealthMonitor(sess);
    sess.health = { ok: false, latencyMs: 0, vendor: 'stub' };
    await mon.runOnce();
    await mon.runOnce();
    await mon.runOnce();
    expect(mon.isHealthy()).toBe(false);
    mon.reset();
    expect(mon.consecutiveFailures()).toBe(0);
    expect(mon.isHealthy()).toBe(true);
  });

  it('records ok=true health probes with latency', async () => {
    const log = new HSMAuditLog();
    const sess = new StubSession();
    const mon = new HSMHealthMonitor(sess, { auditLog: log });
    await mon.runOnce();
    const hs = log.ofKind('health.check');
    expect(hs).toHaveLength(1);
    expect(hs[0]!.context?.ok).toBe(true);
    expect(hs[0]!.latencyMs).toBe(0.5);
    expect(hs[0]!.vendor).toBe('stub');
  });

  it('start without stop on already-running throws', () => {
    const sess = new StubSession();
    const mon = new HSMHealthMonitor(sess);
    mon.start(60_000);
    expect(() => mon.start(60_000)).toThrow(/already running/);
    mon.stop();
  });

  it('stop is idempotent', () => {
    const sess = new StubSession();
    const mon = new HSMHealthMonitor(sess);
    expect(() => mon.stop()).not.toThrow();
    mon.start(60_000);
    mon.stop();
    expect(() => mon.stop()).not.toThrow();
  });

  it('rejects bad threshold', () => {
    const sess = new StubSession();
    expect(
      () => new HSMHealthMonitor(sess, { consecutiveFailureThreshold: 0 }),
    ).toThrow(/positive int/);
    expect(
      () => new HSMHealthMonitor(sess, { consecutiveFailureThreshold: -1 }),
    ).toThrow(/positive int/);
  });
});

describe('HSMAuditedProvider', () => {
  it('records open/generate/close lifecycle', async () => {
    const log = new HSMAuditLog();
    const wrapped = new HSMAuditedProvider(new MockHSMProvider(), log);
    const session = await wrapped.open({});
    await session.generateRandomBytes(16);
    await session.healthCheck();
    await session.close();

    const kinds = log.events().map((e) => e.kind);
    expect(kinds).toEqual([
      'session.open',
      'rng.generate',
      'health.check',
      'session.close',
    ]);
    const gen = log.ofKind('rng.generate')[0]!;
    expect(gen.byteCount).toBe(16);
    expect(gen.vendor).toBe('mock-pkcs11');
  });

  it('preserves session id across all events of a single open', async () => {
    const log = new HSMAuditLog();
    const wrapped = new HSMAuditedProvider(new MockHSMProvider(), log);
    const session = await wrapped.open({});
    await session.generateRandomBytes(8);
    await session.close();
    const ids = new Set(log.events().map((e) => e.sessionId));
    expect(ids.size).toBe(1);
  });

  it('different opens get different session ids', async () => {
    const log = new HSMAuditLog();
    const wrapped = new HSMAuditedProvider(new MockHSMProvider(), log);
    const s1 = await wrapped.open({});
    await s1.generateRandomBytes(1);
    await s1.close();
    const s2 = await wrapped.open({});
    await s2.generateRandomBytes(1);
    await s2.close();
    const sessionIds = log
      .events()
      .filter((e) => e.kind === 'rng.generate')
      .map((e) => e.sessionId);
    expect(new Set(sessionIds).size).toBe(2);
  });

  it('audit log captures byte counts cumulatively across calls', async () => {
    const log = new HSMAuditLog();
    const wrapped = new HSMAuditedProvider(new MockHSMProvider(), log);
    const s = await wrapped.open({});
    await s.generateRandomBytes(4);
    await s.generateRandomBytes(8);
    await s.generateRandomBytes(16);
    await s.close();
    const totalBytes = log
      .ofKind('rng.generate')
      .reduce((sum, e) => sum + (e.byteCount ?? 0), 0);
    expect(totalBytes).toBe(28);
  });
});

describe('sanitizeErrorMessage', () => {
  it('redacts numeric pin-likes', () => {
    expect(sanitizeErrorMessage('pin=1234 failed')).toContain('pin=[REDACTED]');
    expect(sanitizeErrorMessage('numeric 12345 leaked')).toContain('[REDACTED-NUMERIC]');
  });

  it('redacts hex blobs', () => {
    const msg = sanitizeErrorMessage('key=deadbeefcafebabe1122334455667788');
    expect(msg).not.toContain('deadbeefcafebabe');
    expect(msg).toMatch(/REDACTED/);
  });

  it('preserves non-secret content', () => {
    const msg = sanitizeErrorMessage('Cannot open slot 0 — vendor returned CKR_DEVICE_ERROR');
    expect(msg).toContain('slot 0'); // 1 digit → not redacted
    expect(msg).toContain('CKR_DEVICE_ERROR');
  });

  it('redacts password=... clauses', () => {
    const msg = sanitizeErrorMessage('Auth failed password=hunter2 slot=0');
    expect(msg).toContain('password=[REDACTED]');
    expect(msg).not.toContain('hunter2');
  });
});

describe('integration — audited provider + monitor over MockHSMProvider', () => {
  it('end-to-end: open through monitor with audit, normal traffic stays healthy', async () => {
    const log = new HSMAuditLog();
    const provider = new HSMAuditedProvider(new MockHSMProvider(), log);
    const session = await provider.open({});
    const monitor = new HSMHealthMonitor(session, { auditLog: log });
    await monitor.runOnce();
    await monitor.runOnce();
    await monitor.runOnce();
    expect(monitor.isHealthy()).toBe(true);
    expect(monitor.totalFailures()).toBe(0);
    await session.close();
    // Verify mixed event types in the log
    const types = new Set<HSMAuditEvent['kind']>(log.events().map((e) => e.kind));
    expect(types.has('session.open')).toBe(true);
    expect(types.has('health.check')).toBe(true);
    expect(types.has('session.close')).toBe(true);
  });
});
