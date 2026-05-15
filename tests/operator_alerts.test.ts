/**
 * W152 Wave 22 — operatorAlerts tests (Faza 13.3).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MemoryAlertSink,
  WebhookAlertSink,
  BufferedBatchAlertSink,
  MultiplexAlertSink,
  verdictToAlert,
  type FraudAlert,
} from '../src/fraud/operatorAlerts.js';

function makeAlert(severity: 'info' | 'warning' | 'critical' = 'warning', id = 'a1'): FraudAlert {
  return {
    alertId: id,
    emittedAtUtc: '2026-05-15T03:00:00Z',
    severity,
    category: 'velocity',
    playerId: 'p1',
    details: { score: 0.95 },
  };
}

describe('MemoryAlertSink', () => {
  it('collects alerts in order', () => {
    const s = new MemoryAlertSink();
    s.publish(makeAlert('info', 'a'));
    s.publish(makeAlert('critical', 'b'));
    expect(s.publishedCount()).toBe(2);
    expect(s.drained().map((a) => a.alertId)).toEqual(['a', 'b']);
  });
  it('bySeverity filters correctly', () => {
    const s = new MemoryAlertSink();
    s.publish(makeAlert('info', '1'));
    s.publish(makeAlert('critical', '2'));
    s.publish(makeAlert('critical', '3'));
    expect(s.bySeverity('critical')).toHaveLength(2);
    expect(s.bySeverity('info')).toHaveLength(1);
  });
  it('flush is no-op (sync)', () => {
    const s = new MemoryAlertSink();
    s.publish(makeAlert());
    expect(s.flush()).toBeUndefined();
  });
});

describe('WebhookAlertSink', () => {
  it('posts each alert via callback', async () => {
    const calls: string[] = [];
    const s = new WebhookAlertSink({
      poster: async (a) => {
        calls.push(a.alertId);
      },
    });
    await s.publish(makeAlert('warning', 'x'));
    expect(calls).toEqual(['x']);
    expect(s.publishedCount()).toBe(1);
  });
  it('keeps alerts in pending on failure (default swallow)', async () => {
    const s = new WebhookAlertSink({
      poster: async () => {
        throw new Error('network');
      },
    });
    await s.publish(makeAlert('warning', 'fail'));
    expect(s.publishedCount()).toBe(0);
    expect(s.pendingCount()).toBe(1);
  });
  it('rethrows on failure when configured', async () => {
    const s = new WebhookAlertSink({
      poster: async () => {
        throw new Error('boom');
      },
      rethrowOnFailure: true,
    });
    await expect(s.publish(makeAlert('warning', 'fail'))).rejects.toThrow(/POST failed/);
  });
  it('flush retries pending alerts', async () => {
    let fail = true;
    const s = new WebhookAlertSink({
      poster: async () => {
        if (fail) throw new Error('transient');
      },
    });
    await s.publish(makeAlert('warning', 'retry'));
    expect(s.pendingCount()).toBe(1);
    fail = false;
    await s.flush();
    expect(s.pendingCount()).toBe(0);
    expect(s.publishedCount()).toBe(1);
  });
});

describe('BufferedBatchAlertSink', () => {
  it('rejects non-positive flushBatchSize', () => {
    expect(() =>
      new BufferedBatchAlertSink({ flushBatchSize: 0, flushCallback: async () => {} }),
    ).toThrow(RangeError);
  });
  it('flushes when batch threshold hit', async () => {
    const batches: FraudAlert[][] = [];
    const s = new BufferedBatchAlertSink({
      flushBatchSize: 2,
      flushCallback: async (batch) => {
        batches.push(batch);
      },
    });
    s.publish(makeAlert('warning', 'a'));
    expect(s.pendingCount()).toBe(1);
    s.publish(makeAlert('warning', 'b'));
    // Async — wait for fire-and-forget flush
    await new Promise((r) => setTimeout(r, 10));
    expect(batches).toHaveLength(1);
    expect(s.publishedCount()).toBe(2);
  });
  it('explicit flush drains buffer', async () => {
    const batches: FraudAlert[][] = [];
    const s = new BufferedBatchAlertSink({
      flushBatchSize: 100,
      flushCallback: async (batch) => {
        batches.push(batch);
      },
    });
    s.publish(makeAlert('info', 'x'));
    await s.flush();
    expect(batches).toHaveLength(1);
    expect(s.pendingCount()).toBe(0);
  });
});

describe('MultiplexAlertSink', () => {
  it('rejects empty sinks', () => {
    expect(() => new MultiplexAlertSink([])).toThrow();
  });
  it('fans out to all sinks', () => {
    const s1 = new MemoryAlertSink();
    const s2 = new MemoryAlertSink();
    const m = new MultiplexAlertSink([s1, s2]);
    m.publish(makeAlert());
    expect(s1.publishedCount()).toBe(1);
    expect(s2.publishedCount()).toBe(1);
    expect(m.publishedCount()).toBe(2); // sum across sinks
  });
  it('one failing sink does not block others', () => {
    const s1 = new MemoryAlertSink();
    const failingSink = {
      publish: vi.fn(() => {
        throw new Error('plugin crashed');
      }),
      flush: vi.fn(),
      publishedCount: () => 0,
      pendingCount: () => 0,
    };
    const m = new MultiplexAlertSink([failingSink, s1]);
    expect(() => m.publish(makeAlert())).not.toThrow();
    expect(s1.publishedCount()).toBe(1);
  });
});

describe('verdictToAlert', () => {
  it('maps high score to critical', () => {
    const a = verdictToAlert(
      { classifier: 'velocity', score: 1.0, threshold: 0.5, features: {}, playerId: 'p1' },
      'seed-1',
      '2026-05-15T00:00:00Z',
    );
    expect(a.severity).toBe('critical');
  });
  it('maps mid score to warning', () => {
    const a = verdictToAlert(
      { classifier: 'velocity', score: 0.6, threshold: 0.5, features: {}, playerId: 'p1' },
      'seed-2',
      '2026-05-15T00:00:00Z',
    );
    expect(a.severity).toBe('warning');
  });
  it('maps below-threshold to info', () => {
    const a = verdictToAlert(
      { classifier: 'velocity', score: 0.3, threshold: 0.5, features: {}, playerId: 'p1' },
      'seed-3',
      '2026-05-15T00:00:00Z',
    );
    expect(a.severity).toBe('info');
  });
  it('alertId is deterministic via seed', () => {
    const a = verdictToAlert(
      { classifier: 'v', score: 1.0, threshold: 0.5, features: {}, playerId: 'p1' },
      'fixed-seed',
      '2026-05-15T00:00:00Z',
    );
    expect(a.alertId).toBe('fixed-seed');
  });
});
