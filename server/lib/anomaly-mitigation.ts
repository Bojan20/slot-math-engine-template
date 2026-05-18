/**
 * W214 Faza 600.3 — Anomaly auto-mitigation engine.
 *
 * Wires automatic responses to common operational alerts. Each
 * mitigation is a pure function of an {@link AnomalyAlert} → a
 * {@link MitigationPlan}. The engine logs the plan via W208
 * observability + appends an audit entry; the actual side effects
 * (rollback, freeze, switch) are delegated to injected adapters so we
 * can fully unit-test the decisioning layer in isolation.
 *
 * Supported anomalies:
 *
 *   1. `rtp_drift`              — RTP drift > 1pp for 1h → auto-rollback
 *   2. `audit_chain_gap`        — freeze writes + alert + start re-sync
 *   3. `wallet_provider_down`   — > 5min outage → switch to backup provider
 *   4. `rate_limit_breach`      — pattern → temporary block + alert
 *   5. `hsm_rotation_incomplete`— fall back to previous key version
 *
 * Mitigations log via {@link MitigationLogger} so the W208 audit chain
 * + tenant audit log both receive a structured record.
 */

import type { RollbackEngine, RollbackReason } from './deployment/rollback.js';
import type { DeploymentManifest } from './deployment/manifest.js';

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface RtpDriftAlert {
  kind: 'rtp_drift';
  tenantId: string;
  gameId: string;
  deltaRtpPp: number;
  sustainedSec: number;
  observedAt: string;
}

export interface AuditChainGapAlert {
  kind: 'audit_chain_gap';
  tenantId: string;
  brokenAt: string;
  expectedHash: string;
  observedHash: string;
}

export interface WalletProviderDownAlert {
  kind: 'wallet_provider_down';
  tenantId: string;
  provider: string;
  outageSec: number;
  observedAt: string;
}

export interface RateLimitBreachAlert {
  kind: 'rate_limit_breach';
  tenantId: string;
  route: string;
  ip: string;
  hitsPerMinute: number;
}

export interface HsmRotationIncompleteAlert {
  kind: 'hsm_rotation_incomplete';
  tenantId: string;
  keyId: string;
  newVersion: string;
  previousVersion: string;
  attemptedAt: string;
}

export type AnomalyAlert =
  | RtpDriftAlert
  | AuditChainGapAlert
  | WalletProviderDownAlert
  | RateLimitBreachAlert
  | HsmRotationIncompleteAlert;

// ---------------------------------------------------------------------------
// Plans + thresholds
// ---------------------------------------------------------------------------

export const RTP_DRIFT_PP_THRESHOLD = 1.0;
export const RTP_DRIFT_SUSTAINED_SEC_THRESHOLD = 3600;
export const WALLET_OUTAGE_SEC_THRESHOLD = 300;
export const RATE_LIMIT_BREACH_THRESHOLD_PER_MIN = 600;

export type MitigationAction =
  | { kind: 'rollback'; reason: RollbackReason }
  | { kind: 'freeze_writes'; tenantId: string; reason: string }
  | { kind: 'start_audit_resync'; tenantId: string; fromHash: string }
  | { kind: 'switch_wallet_provider'; tenantId: string; from: string; to: string }
  | { kind: 'block_ip'; ip: string; tenantId: string; route: string; durationSec: number }
  | { kind: 'fallback_hsm_key'; tenantId: string; keyId: string; toVersion: string }
  | { kind: 'noop'; reason: string };

export interface MitigationPlan {
  alert: AnomalyAlert;
  actions: MitigationAction[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  decidedAt: string;
  trace: string;
}

// ---------------------------------------------------------------------------
// Adapters (injected — production wires real implementations)
// ---------------------------------------------------------------------------

export interface MitigationAdapters {
  rollback?: {
    /**
     * Snapshot-aware rollback wrapper. We pass through to the W210
     * {@link RollbackEngine}.
     */
    engine: RollbackEngine;
    currentManifest: (tenantId: string) => DeploymentManifest;
    previousManifest: (tenantId: string) => DeploymentManifest;
    snapshotTakenAtMs: () => number;
  };
  freezeWrites?: (tenantId: string, reason: string) => Promise<void> | void;
  startAuditResync?: (tenantId: string, fromHash: string) => Promise<void> | void;
  switchWalletProvider?: (tenantId: string, from: string, to: string) => Promise<void> | void;
  pickBackupProvider?: (tenantId: string, downProvider: string) => string | null;
  blockIp?: (ip: string, tenantId: string, route: string, durationSec: number) => Promise<void> | void;
  fallbackHsmKey?: (tenantId: string, keyId: string, toVersion: string) => Promise<void> | void;
  /** Optional structured-log sink — defaults to `logger.info`. */
  logger?: MitigationLogger;
}

export interface MitigationLogger {
  log: (record: MitigationLogRecord) => void;
}

export interface MitigationLogRecord {
  ts: string;
  tenantId: string;
  alertKind: AnomalyAlert['kind'];
  actions: MitigationAction[];
  severity: MitigationPlan['severity'];
  trace: string;
}

const noopLogger: MitigationLogger = { log: () => undefined };

// ---------------------------------------------------------------------------
// Plan engine
// ---------------------------------------------------------------------------

export class AnomalyMitigationEngine {
  private readonly adapters: MitigationAdapters;

  constructor(adapters: MitigationAdapters = {}) {
    this.adapters = adapters;
  }

  /** Pure decisioning step — no side effects, returns the plan only. */
  plan(alert: AnomalyAlert, now: string = new Date().toISOString()): MitigationPlan {
    switch (alert.kind) {
      case 'rtp_drift':
        return this.planRtpDrift(alert, now);
      case 'audit_chain_gap':
        return this.planAuditChainGap(alert, now);
      case 'wallet_provider_down':
        return this.planWalletProviderDown(alert, now);
      case 'rate_limit_breach':
        return this.planRateLimitBreach(alert, now);
      case 'hsm_rotation_incomplete':
        return this.planHsmRotationIncomplete(alert, now);
      default: {
        // Exhaustive-check pattern.
        const _: never = alert;
        return {
          alert: alert as AnomalyAlert,
          actions: [{ kind: 'noop', reason: 'unknown_alert_kind' }],
          severity: 'low',
          decidedAt: now,
          trace: `unknown:${String(_)}`,
        };
      }
    }
  }

  private planRtpDrift(a: RtpDriftAlert, now: string): MitigationPlan {
    if (a.deltaRtpPp >= RTP_DRIFT_PP_THRESHOLD && a.sustainedSec >= RTP_DRIFT_SUSTAINED_SEC_THRESHOLD) {
      return {
        alert: a,
        actions: [{
          kind: 'rollback',
          reason: {
            kind: 'anomaly_alert',
            deltaRtpPp: a.deltaRtpPp,
            sustainedSec: a.sustainedSec,
          },
        }],
        severity: 'critical',
        decidedAt: now,
        trace: `rtp_drift>=${RTP_DRIFT_PP_THRESHOLD}pp sustained>=${RTP_DRIFT_SUSTAINED_SEC_THRESHOLD}s`,
      };
    }
    return {
      alert: a,
      actions: [{ kind: 'noop', reason: 'below_threshold' }],
      severity: 'medium',
      decidedAt: now,
      trace: `rtp_drift below threshold (${a.deltaRtpPp}pp / ${a.sustainedSec}s)`,
    };
  }

  private planAuditChainGap(a: AuditChainGapAlert, now: string): MitigationPlan {
    return {
      alert: a,
      actions: [
        { kind: 'freeze_writes', tenantId: a.tenantId, reason: 'audit_chain_gap' },
        { kind: 'start_audit_resync', tenantId: a.tenantId, fromHash: a.expectedHash },
      ],
      severity: 'critical',
      decidedAt: now,
      trace: `chain_gap at=${a.brokenAt}`,
    };
  }

  private planWalletProviderDown(a: WalletProviderDownAlert, now: string): MitigationPlan {
    if (a.outageSec < WALLET_OUTAGE_SEC_THRESHOLD) {
      return {
        alert: a,
        actions: [{ kind: 'noop', reason: 'outage_below_5min' }],
        severity: 'medium',
        decidedAt: now,
        trace: `wallet_outage ${a.outageSec}s < ${WALLET_OUTAGE_SEC_THRESHOLD}s`,
      };
    }
    const backup = this.adapters.pickBackupProvider?.(a.tenantId, a.provider) ?? null;
    if (!backup) {
      return {
        alert: a,
        actions: [{ kind: 'noop', reason: 'no_backup_provider' }],
        severity: 'high',
        decidedAt: now,
        trace: 'no_backup_provider_configured',
      };
    }
    return {
      alert: a,
      actions: [{
        kind: 'switch_wallet_provider',
        tenantId: a.tenantId,
        from: a.provider,
        to: backup,
      }],
      severity: 'high',
      decidedAt: now,
      trace: `wallet_outage ${a.outageSec}s → switch ${a.provider}→${backup}`,
    };
  }

  private planRateLimitBreach(a: RateLimitBreachAlert, now: string): MitigationPlan {
    if (a.hitsPerMinute < RATE_LIMIT_BREACH_THRESHOLD_PER_MIN) {
      return {
        alert: a,
        actions: [{ kind: 'noop', reason: 'below_block_threshold' }],
        severity: 'low',
        decidedAt: now,
        trace: `rate_breach ${a.hitsPerMinute}/min below ${RATE_LIMIT_BREACH_THRESHOLD_PER_MIN}`,
      };
    }
    return {
      alert: a,
      actions: [{
        kind: 'block_ip',
        ip: a.ip,
        tenantId: a.tenantId,
        route: a.route,
        durationSec: 900,
      }],
      severity: 'high',
      decidedAt: now,
      trace: `rate_breach ${a.hitsPerMinute}/min → block 15min`,
    };
  }

  private planHsmRotationIncomplete(a: HsmRotationIncompleteAlert, now: string): MitigationPlan {
    return {
      alert: a,
      actions: [{
        kind: 'fallback_hsm_key',
        tenantId: a.tenantId,
        keyId: a.keyId,
        toVersion: a.previousVersion,
      }],
      severity: 'high',
      decidedAt: now,
      trace: `hsm_rotation_incomplete keyId=${a.keyId} fallback→${a.previousVersion}`,
    };
  }

  /** Execute a plan. Each action is best-effort — errors are aggregated. */
  async apply(plan: MitigationPlan): Promise<MitigationApplyResult> {
    const errors: string[] = [];
    const applied: MitigationAction['kind'][] = [];
    for (const action of plan.actions) {
      try {
        await this.dispatch(action, plan);
        applied.push(action.kind);
      } catch (e) {
        errors.push(`${action.kind}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const logger = this.adapters.logger ?? noopLogger;
    const tenantId = extractTenantId(plan.alert);
    logger.log({
      ts: plan.decidedAt,
      tenantId,
      alertKind: plan.alert.kind,
      actions: plan.actions,
      severity: plan.severity,
      trace: plan.trace,
    });
    return { plan, applied, errors, ok: errors.length === 0 };
  }

  private async dispatch(action: MitigationAction, plan: MitigationPlan): Promise<void> {
    switch (action.kind) {
      case 'rollback': {
        const r = this.adapters.rollback;
        if (!r) throw new Error('no_rollback_adapter');
        const tenantId = extractTenantId(plan.alert);
        const cur = r.currentManifest(tenantId);
        const prev = r.previousManifest(tenantId);
        await r.engine.rollback(cur, prev, action.reason, r.snapshotTakenAtMs());
        return;
      }
      case 'freeze_writes':
        if (!this.adapters.freezeWrites) throw new Error('no_freeze_adapter');
        await this.adapters.freezeWrites(action.tenantId, action.reason);
        return;
      case 'start_audit_resync':
        if (!this.adapters.startAuditResync) throw new Error('no_resync_adapter');
        await this.adapters.startAuditResync(action.tenantId, action.fromHash);
        return;
      case 'switch_wallet_provider':
        if (!this.adapters.switchWalletProvider) throw new Error('no_wallet_switch_adapter');
        await this.adapters.switchWalletProvider(action.tenantId, action.from, action.to);
        return;
      case 'block_ip':
        if (!this.adapters.blockIp) throw new Error('no_block_adapter');
        await this.adapters.blockIp(action.ip, action.tenantId, action.route, action.durationSec);
        return;
      case 'fallback_hsm_key':
        if (!this.adapters.fallbackHsmKey) throw new Error('no_hsm_adapter');
        await this.adapters.fallbackHsmKey(action.tenantId, action.keyId, action.toVersion);
        return;
      case 'noop':
        return;
      default: {
        const _: never = action;
        throw new Error(`unhandled_action: ${String(_)}`);
      }
    }
  }
}

export interface MitigationApplyResult {
  plan: MitigationPlan;
  applied: MitigationAction['kind'][];
  errors: string[];
  ok: boolean;
}

function extractTenantId(alert: AnomalyAlert): string {
  return alert.tenantId;
}
