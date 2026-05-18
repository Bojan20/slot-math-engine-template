/**
 * W214 Faza 600.3 — Anomaly auto-mitigation engine specs.
 */
import { describe, it, expect } from 'vitest';
import {
  AnomalyMitigationEngine,
  type AnomalyAlert,
  type MitigationAdapters,
  type MitigationLogRecord,
  RTP_DRIFT_PP_THRESHOLD,
  RTP_DRIFT_SUSTAINED_SEC_THRESHOLD,
  WALLET_OUTAGE_SEC_THRESHOLD,
  RATE_LIMIT_BREACH_THRESHOLD_PER_MIN,
} from '../lib/anomaly-mitigation.js';
import { RollbackEngine } from '../lib/deployment/rollback.js';
import { defaultManifest } from '../lib/deployment/manifest.js';

const NOW = '2026-05-18T08:00:00Z';

function makeEngine(adapters: MitigationAdapters = {}) {
  return new AnomalyMitigationEngine(adapters);
}

describe('W214 anomaly · plan() RTP drift', () => {
  it('triggers rollback when drift and duration are at/above threshold', () => {
    const engine = makeEngine();
    const alert: AnomalyAlert = {
      kind: 'rtp_drift',
      tenantId: 't-1',
      gameId: 'g-1',
      deltaRtpPp: RTP_DRIFT_PP_THRESHOLD,
      sustainedSec: RTP_DRIFT_SUSTAINED_SEC_THRESHOLD,
      observedAt: NOW,
    };
    const plan = engine.plan(alert, NOW);
    expect(plan.severity).toBe('critical');
    expect(plan.actions[0].kind).toBe('rollback');
    if (plan.actions[0].kind === 'rollback') {
      expect(plan.actions[0].reason.kind).toBe('anomaly_alert');
    }
  });

  it('does not trigger rollback below threshold', () => {
    const engine = makeEngine();
    const plan = engine.plan({
      kind: 'rtp_drift',
      tenantId: 't',
      gameId: 'g',
      deltaRtpPp: 0.5,
      sustainedSec: 100,
      observedAt: NOW,
    }, NOW);
    expect(plan.actions[0].kind).toBe('noop');
  });
});

describe('W214 anomaly · plan() audit chain gap', () => {
  it('freezes writes + starts resync', () => {
    const engine = makeEngine();
    const plan = engine.plan({
      kind: 'audit_chain_gap',
      tenantId: 't-2',
      brokenAt: NOW,
      expectedHash: 'aa',
      observedHash: 'bb',
    }, NOW);
    const kinds = plan.actions.map((a) => a.kind);
    expect(kinds).toContain('freeze_writes');
    expect(kinds).toContain('start_audit_resync');
    expect(plan.severity).toBe('critical');
  });
});

describe('W214 anomaly · plan() wallet provider down', () => {
  it('noop when outage < threshold', () => {
    const engine = makeEngine();
    const plan = engine.plan({
      kind: 'wallet_provider_down',
      tenantId: 't',
      provider: 'microgaming',
      outageSec: WALLET_OUTAGE_SEC_THRESHOLD - 1,
      observedAt: NOW,
    }, NOW);
    expect(plan.actions[0].kind).toBe('noop');
  });

  it('switches to backup when outage >= threshold and adapter resolves backup', () => {
    const engine = makeEngine({
      pickBackupProvider: () => 'generic-pam',
    });
    const plan = engine.plan({
      kind: 'wallet_provider_down',
      tenantId: 't',
      provider: 'microgaming',
      outageSec: WALLET_OUTAGE_SEC_THRESHOLD + 60,
      observedAt: NOW,
    }, NOW);
    expect(plan.actions[0].kind).toBe('switch_wallet_provider');
  });

  it('noops with no_backup_provider when adapter returns null', () => {
    const engine = makeEngine({ pickBackupProvider: () => null });
    const plan = engine.plan({
      kind: 'wallet_provider_down',
      tenantId: 't',
      provider: 'm',
      outageSec: 1000,
      observedAt: NOW,
    }, NOW);
    expect(plan.actions[0].kind).toBe('noop');
    expect(plan.trace).toContain('no_backup_provider');
  });
});

describe('W214 anomaly · plan() rate limit breach', () => {
  it('blocks IP for 15 min when hits >= threshold', () => {
    const engine = makeEngine();
    const plan = engine.plan({
      kind: 'rate_limit_breach',
      tenantId: 't',
      route: '/api/spin',
      ip: '203.0.113.1',
      hitsPerMinute: RATE_LIMIT_BREACH_THRESHOLD_PER_MIN + 10,
    }, NOW);
    expect(plan.actions[0]).toMatchObject({ kind: 'block_ip', durationSec: 900 });
  });

  it('noop when hits below threshold', () => {
    const engine = makeEngine();
    const plan = engine.plan({
      kind: 'rate_limit_breach',
      tenantId: 't',
      route: '/api/spin',
      ip: 'x',
      hitsPerMinute: 10,
    }, NOW);
    expect(plan.actions[0].kind).toBe('noop');
  });
});

describe('W214 anomaly · plan() HSM rotation', () => {
  it('falls back to previous version always', () => {
    const engine = makeEngine();
    const plan = engine.plan({
      kind: 'hsm_rotation_incomplete',
      tenantId: 't',
      keyId: 'k-1',
      newVersion: 'v3',
      previousVersion: 'v2',
      attemptedAt: NOW,
    }, NOW);
    expect(plan.actions[0]).toMatchObject({
      kind: 'fallback_hsm_key',
      toVersion: 'v2',
    });
  });
});

describe('W214 anomaly · apply() side-effect dispatch', () => {
  it('invokes rollback adapter when action.kind === rollback', async () => {
    const cur = defaultManifest({ version: '2.0.0' });
    const prev = defaultManifest({ version: '1.0.0' });
    const calls: string[] = [];
    const rollbackEngine = new RollbackEngine({
      routeSwap: { swap: () => { calls.push('swap'); return Promise.resolve(); } },
    });
    const engine = makeEngine({
      rollback: {
        engine: rollbackEngine,
        currentManifest: () => cur,
        previousManifest: () => prev,
        snapshotTakenAtMs: () => Date.now(),
      },
    });
    const plan = engine.plan({
      kind: 'rtp_drift',
      tenantId: 't',
      gameId: 'g',
      deltaRtpPp: 1.5,
      sustainedSec: 7200,
      observedAt: NOW,
    }, NOW);
    const result = await engine.apply(plan);
    expect(result.ok).toBe(true);
    expect(result.applied).toContain('rollback');
    expect(calls).toContain('swap');
  });

  it('captures errors when an adapter is missing', async () => {
    const engine = makeEngine();
    const plan = engine.plan({
      kind: 'rate_limit_breach',
      tenantId: 't',
      route: '/r',
      ip: '1.1.1.1',
      hitsPerMinute: 10_000,
    }, NOW);
    const result = await engine.apply(plan);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('block_ip');
  });

  it('apply() invokes freeze + resync adapters in order', async () => {
    const order: string[] = [];
    const engine = makeEngine({
      freezeWrites: () => { order.push('freeze'); },
      startAuditResync: () => { order.push('resync'); },
    });
    const plan = engine.plan({
      kind: 'audit_chain_gap',
      tenantId: 't',
      brokenAt: NOW,
      expectedHash: 'a',
      observedHash: 'b',
    }, NOW);
    const r = await engine.apply(plan);
    expect(r.ok).toBe(true);
    expect(order).toEqual(['freeze', 'resync']);
  });

  it('apply() emits a single structured log record', async () => {
    const records: MitigationLogRecord[] = [];
    const engine = makeEngine({
      logger: { log: (r) => records.push(r) },
      pickBackupProvider: () => 'pam',
      switchWalletProvider: () => undefined,
    });
    const plan = engine.plan({
      kind: 'wallet_provider_down',
      tenantId: 't',
      provider: 'microgaming',
      outageSec: 600,
      observedAt: NOW,
    }, NOW);
    await engine.apply(plan);
    expect(records).toHaveLength(1);
    expect(records[0].alertKind).toBe('wallet_provider_down');
    expect(records[0].severity).toBe('high');
  });

  it('apply() handles noop actions without errors', async () => {
    const engine = makeEngine();
    const plan = engine.plan({
      kind: 'rtp_drift',
      tenantId: 't',
      gameId: 'g',
      deltaRtpPp: 0.1,
      sustainedSec: 60,
      observedAt: NOW,
    }, NOW);
    const r = await engine.apply(plan);
    expect(r.ok).toBe(true);
    expect(r.applied).toEqual(['noop']);
  });

  it('apply() reports HSM fallback errors when adapter throws', async () => {
    const engine = makeEngine({
      fallbackHsmKey: () => {
        throw new Error('hsm_offline');
      },
    });
    const plan = engine.plan({
      kind: 'hsm_rotation_incomplete',
      tenantId: 't',
      keyId: 'k',
      newVersion: 'v2',
      previousVersion: 'v1',
      attemptedAt: NOW,
    }, NOW);
    const r = await engine.apply(plan);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('hsm_offline');
  });
});

describe('W214 anomaly · severity classification', () => {
  it('audit_chain_gap is critical', () => {
    const engine = makeEngine();
    const plan = engine.plan({
      kind: 'audit_chain_gap',
      tenantId: 't',
      brokenAt: NOW,
      expectedHash: 'a',
      observedHash: 'b',
    }, NOW);
    expect(plan.severity).toBe('critical');
  });

  it('rate_limit_breach below threshold is low', () => {
    const engine = makeEngine();
    const plan = engine.plan({
      kind: 'rate_limit_breach',
      tenantId: 't',
      route: '/r',
      ip: '1.1.1.1',
      hitsPerMinute: 5,
    }, NOW);
    expect(plan.severity).toBe('low');
  });
});
