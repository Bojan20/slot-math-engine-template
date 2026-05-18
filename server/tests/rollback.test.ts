/**
 * W210 Faza 600.0 — Rollback automation behavior + RPO/RTO bounds.
 */
import { describe, it, expect } from 'vitest';
import {
  RollbackEngine,
  renderPostMortem,
  ROLLBACK_TRIGGERS,
  type RollbackReason,
  type AuditEntry,
  type NotificationEvent,
  type PostMortemTemplate,
} from '../lib/deployment/rollback.js';
import { defaultManifest } from '../lib/deployment/manifest.js';

function clockFromCounter(start = 1_000): { now: () => number; tick: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    tick: (ms) => {
      t += ms;
    },
  };
}

describe('rollback engine — basics', () => {
  it('returns ok=true when route swap succeeds', async () => {
    const clk = clockFromCounter();
    const engine = new RollbackEngine({ now: clk.now });
    const cur = defaultManifest({ version: '2.0.0' });
    const prev = defaultManifest({ version: '1.0.0' });
    const reason: RollbackReason = {
      kind: 'operator_manual',
      operatorId: 'op-1',
    };
    const r = await engine.rollback(cur, prev, reason, clk.now());
    expect(r.ok).toBe(true);
    expect(r.fromVersion).toBe('2.0.0');
    expect(r.toVersion).toBe('1.0.0');
  });

  it('records audit entry with from/to versions', async () => {
    const audits: AuditEntry[] = [];
    const engine = new RollbackEngine({
      audit: { write: (e) => audits.push(e) },
    });
    const reason: RollbackReason = {
      kind: 'canary_gate_failure',
      stage: 1,
      trigger: 'rtp_drift',
    };
    await engine.rollback(
      defaultManifest({ version: '2.0.0' }),
      defaultManifest({ version: '1.0.0' }),
      reason,
      Date.now()
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].fromVersion).toBe('2.0.0');
    expect(audits[0].toVersion).toBe('1.0.0');
    expect(audits[0].action).toBe('rollback');
  });

  it('sends critical notification', async () => {
    const events: NotificationEvent[] = [];
    const engine = new RollbackEngine({
      notifier: { notify: (e) => events.push(e) },
    });
    await engine.rollback(
      defaultManifest({ version: '2.0.0' }),
      defaultManifest({ version: '1.0.0' }),
      { kind: 'operator_manual', operatorId: 'op-1' },
      Date.now()
    );
    expect(events).toHaveLength(1);
    expect(events[0].severity).toBe('critical');
    expect(events[0].message).toContain('Rollback');
  });

  it('sends post-mortem template', async () => {
    const templates: PostMortemTemplate[] = [];
    const engine = new RollbackEngine({
      mailer: { send: (t) => templates.push(t) },
    });
    await engine.rollback(
      defaultManifest({ version: '2.0.0' }),
      defaultManifest({ version: '1.0.0' }),
      { kind: 'audit_corruption', chainBreakAt: 'evt-12345' },
      Date.now()
    );
    expect(templates).toHaveLength(1);
    expect(templates[0].reason.kind).toBe('audit_corruption');
  });

  it('route swap failure surfaces as ok=false but rest is best-effort', async () => {
    let audited = false;
    const engine = new RollbackEngine({
      routeSwap: {
        swap: () => {
          throw new Error('boom');
        },
      },
      audit: {
        write: () => {
          audited = true;
        },
      },
    });
    const r = await engine.rollback(
      defaultManifest({ version: '2.0.0' }),
      defaultManifest({ version: '1.0.0' }),
      { kind: 'operator_manual', operatorId: 'op-1' },
      Date.now()
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('route_swap'))).toBe(true);
    expect(audited).toBe(true);
  });

  it('audit failure does not abort rollback', async () => {
    const engine = new RollbackEngine({
      audit: {
        write: () => {
          throw new Error('audit-down');
        },
      },
    });
    const r = await engine.rollback(
      defaultManifest({ version: '2.0.0' }),
      defaultManifest({ version: '1.0.0' }),
      { kind: 'operator_manual', operatorId: 'op-1' },
      Date.now()
    );
    expect(r.ok).toBe(true);
    expect(r.errors.some((e) => e.includes('audit'))).toBe(true);
  });
});

describe('rollback engine — RPO/RTO bounds', () => {
  it('RTO ≤ 5s in test mode (target 5min in prod)', async () => {
    const engine = new RollbackEngine();
    const t0 = Date.now();
    const r = await engine.rollback(
      defaultManifest({ version: '2.0.0' }),
      defaultManifest({ version: '1.0.0' }),
      { kind: 'operator_manual', operatorId: 'op-1' },
      t0
    );
    expect(r.rtoMs).toBeLessThanOrEqual(5000);
  });

  it('RPO reflects gap between snapshot and rollback start', async () => {
    let t = 1_000_000;
    const engine = new RollbackEngine({ now: () => t });
    const snapshotAt = t;
    t += 30_000; // 30s elapse
    const r = await engine.rollback(
      defaultManifest({ version: '2.0.0' }),
      defaultManifest({ version: '1.0.0' }),
      { kind: 'operator_manual', operatorId: 'op-1' },
      snapshotAt
    );
    expect(r.rpoSeconds).toBe(30);
  });

  it('RPO is clamped at 0 if clock skew is negative', async () => {
    const engine = new RollbackEngine({ now: () => 1_000 });
    const r = await engine.rollback(
      defaultManifest({ version: '2.0.0' }),
      defaultManifest({ version: '1.0.0' }),
      { kind: 'operator_manual', operatorId: 'op-1' },
      2_000
    );
    expect(r.rpoSeconds).toBe(0);
  });
});

describe('rollback engine — snapshot + triggers', () => {
  it('snapshot is pure and stamps takenAt', () => {
    const engine = new RollbackEngine({
      now: () => 1_000_000,
      isoNow: () => '2026-01-01T00:00:00Z',
    });
    const snap = engine.snapshot(defaultManifest(), { k: 'v' }, 'digest-abc');
    expect(snap.takenAt).toBe('2026-01-01T00:00:00Z');
    expect(snap.tenantConfig).toEqual({ k: 'v' });
    expect(snap.gameStateDigest).toBe('digest-abc');
  });

  it('ROLLBACK_TRIGGERS enumerates 4 reasons', () => {
    expect(ROLLBACK_TRIGGERS).toHaveLength(4);
    expect(ROLLBACK_TRIGGERS).toContain('canary_gate_failure');
    expect(ROLLBACK_TRIGGERS).toContain('operator_manual');
    expect(ROLLBACK_TRIGGERS).toContain('anomaly_alert');
    expect(ROLLBACK_TRIGGERS).toContain('audit_corruption');
  });

  it('renderPostMortem produces a multi-line body with target lines', () => {
    const body = renderPostMortem({
      tenantId: 'acme',
      reason: { kind: 'operator_manual', operatorId: 'op-9' },
      fromVersion: '2.0.0',
      toVersion: '1.0.0',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:00:05Z',
      rtoMs: 5_000,
      rpoSeconds: 12,
    });
    expect(body).toContain('POST-MORTEM');
    expect(body).toContain('2.0.0 → 1.0.0');
    expect(body).toContain('RTO:');
    expect(body).toContain('RPO:');
    expect(body).toContain('Action items:');
  });

  it('post-mortem reason line covers all variants', () => {
    const cases: RollbackReason[] = [
      { kind: 'canary_gate_failure', stage: 1, trigger: 'rtp_drift' },
      { kind: 'operator_manual', operatorId: 'op-1', note: 'manual test' },
      { kind: 'anomaly_alert', deltaRtpPp: 1.2, sustainedSec: 3600 },
      { kind: 'audit_corruption', chainBreakAt: 'evt-9' },
    ];
    for (const c of cases) {
      const body = renderPostMortem({
        tenantId: 'acme',
        reason: c,
        fromVersion: '2.0.0',
        toVersion: '1.0.0',
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: '2026-01-01T00:00:05Z',
        rtoMs: 5_000,
        rpoSeconds: 0,
      });
      expect(body).toContain(c.kind);
    }
  });
});
