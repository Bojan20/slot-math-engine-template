/**
 * W210 Faza 600.0 — Rollback automation.
 *
 * A rollback restores a previous {@link DeploymentManifest} as the
 * active deployment for a tenant. It is invoked in four scenarios:
 *
 *  1. Health gate failure during canary (from {@link CanaryController}).
 *  2. Operator clicks "rollback" in the console.
 *  3. Anomaly detector emits an RTP-drift > 1pp alert on live traffic
 *     sustained over 1h.
 *  4. Audit-log integrity check reports corruption.
 *
 * Recovery objectives:
 *   - RPO ≤ 60s: at most 60 seconds of writes can be lost (we snapshot
 *     state at the moment rollback is initiated).
 *   - RTO ≤ 5min: rollback completes within 5 minutes wall-clock.
 *
 * The {@link RollbackEngine} is fully synchronous in test mode, with
 * pluggable side-effects (route swap, audit log writer, notifier,
 * post-mortem mailer). All side-effects are best-effort but their
 * failures do not block the actual swap, which must be atomic.
 */
import type { DeploymentManifest } from './manifest.js';
import type { RollbackTrigger } from './canary.js';

export type RollbackReason =
  | { kind: 'canary_gate_failure'; trigger: RollbackTrigger; stage: number }
  | { kind: 'operator_manual'; operatorId: string; note?: string }
  | { kind: 'anomaly_alert'; deltaRtpPp: number; sustainedSec: number }
  | { kind: 'audit_corruption'; chainBreakAt: string };

export interface DeploymentSnapshot {
  /** Manifest currently active. */
  manifest: DeploymentManifest;
  /** Tenant configuration JSON (opaque). */
  tenantConfig: Record<string, unknown>;
  /** Game state digest (e.g. balance / cert hashes). */
  gameStateDigest: string;
  /** ISO-8601 snapshot timestamp. */
  takenAt: string;
}

export interface RouteSwap {
  swap: (from: DeploymentManifest, to: DeploymentManifest) => Promise<void> | void;
}

export interface AuditWriter {
  write: (entry: AuditEntry) => Promise<void> | void;
}

export interface Notifier {
  notify: (event: NotificationEvent) => Promise<void> | void;
}

export interface PostMortemMailer {
  send: (template: PostMortemTemplate) => Promise<void> | void;
}

export interface AuditEntry {
  tenantId: string;
  action: 'rollback';
  reason: RollbackReason;
  fromVersion: string;
  toVersion: string;
  initiatedAt: string;
  completedAt: string;
}

export interface NotificationEvent {
  tenantId: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  meta: Record<string, unknown>;
}

export interface PostMortemTemplate {
  tenantId: string;
  reason: RollbackReason;
  fromVersion: string;
  toVersion: string;
  startedAt: string;
  completedAt: string;
  rtoMs: number;
  rpoSeconds: number;
}

export interface RollbackOptions {
  routeSwap?: RouteSwap;
  audit?: AuditWriter;
  notifier?: Notifier;
  mailer?: PostMortemMailer;
  /** Override clock (ms-since-epoch). Defaults to Date.now. */
  now?: () => number;
  /** Override clock (ISO string). Defaults to new Date(now()).toISOString. */
  isoNow?: () => string;
}

export interface RollbackResult {
  ok: boolean;
  fromVersion: string;
  toVersion: string;
  reason: RollbackReason;
  rtoMs: number;
  rpoSeconds: number;
  errors: string[];
}

export class RollbackEngine {
  private readonly routeSwap: RouteSwap;
  private readonly audit: AuditWriter;
  private readonly notifier: Notifier;
  private readonly mailer: PostMortemMailer;
  private readonly now: () => number;
  private readonly isoNow: () => string;

  constructor(opts: RollbackOptions = {}) {
    this.routeSwap = opts.routeSwap ?? { swap: () => Promise.resolve() };
    this.audit = opts.audit ?? { write: () => Promise.resolve() };
    this.notifier = opts.notifier ?? { notify: () => Promise.resolve() };
    this.mailer = opts.mailer ?? { send: () => Promise.resolve() };
    this.now = opts.now ?? (() => Date.now());
    this.isoNow = opts.isoNow ?? (() => new Date(this.now()).toISOString());
  }

  /**
   * Snapshot current state. Pure data — does not mutate anything.
   * Implementations would persist this to durable storage; here we
   * return it so the caller can decide.
   */
  snapshot(
    manifest: DeploymentManifest,
    tenantConfig: Record<string, unknown>,
    gameStateDigest: string
  ): DeploymentSnapshot {
    return {
      manifest,
      tenantConfig,
      gameStateDigest,
      takenAt: this.isoNow(),
    };
  }

  /**
   * Execute rollback: swap route, write audit, notify, mail post-mortem.
   * Returns a result describing the outcome including RTO/RPO. Errors
   * from side-effects are collected but do not fail the swap itself.
   */
  async rollback(
    current: DeploymentManifest,
    previous: DeploymentManifest,
    reason: RollbackReason,
    snapshotTakenAtMs: number
  ): Promise<RollbackResult> {
    const startedMs = this.now();
    const startedAt = new Date(startedMs).toISOString();
    const errors: string[] = [];

    // Atomic route swap is the load-bearing step; failure here means
    // the rollback itself failed.
    let swapOk = true;
    try {
      await this.routeSwap.swap(current, previous);
    } catch (e) {
      swapOk = false;
      errors.push(`route_swap: ${e instanceof Error ? e.message : String(e)}`);
    }

    const completedMs = this.now();
    const completedAt = new Date(completedMs).toISOString();
    const rtoMs = completedMs - startedMs;
    const rpoSeconds = Math.max(
      0,
      Math.floor((startedMs - snapshotTakenAtMs) / 1000)
    );

    try {
      await this.audit.write({
        tenantId: current.tenantId,
        action: 'rollback',
        reason,
        fromVersion: current.version,
        toVersion: previous.version,
        initiatedAt: startedAt,
        completedAt,
      });
    } catch (e) {
      errors.push(`audit: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      await this.notifier.notify({
        tenantId: current.tenantId,
        severity: 'critical',
        message: `Rollback ${current.version} → ${previous.version} (${reason.kind})`,
        meta: { reason, rtoMs, rpoSeconds },
      });
    } catch (e) {
      errors.push(`notifier: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      await this.mailer.send({
        tenantId: current.tenantId,
        reason,
        fromVersion: current.version,
        toVersion: previous.version,
        startedAt,
        completedAt,
        rtoMs,
        rpoSeconds,
      });
    } catch (e) {
      errors.push(`mailer: ${e instanceof Error ? e.message : String(e)}`);
    }

    return {
      ok: swapOk,
      fromVersion: current.version,
      toVersion: previous.version,
      reason,
      rtoMs,
      rpoSeconds,
      errors,
    };
  }
}

/** Render a post-mortem template into a plain-text body. */
export function renderPostMortem(t: PostMortemTemplate): string {
  const reason = postMortemReasonLine(t.reason);
  const lines = [
    `Subject: [POST-MORTEM] Rollback for tenant ${t.tenantId}`,
    '',
    `Tenant:     ${t.tenantId}`,
    `Rollback:   ${t.fromVersion} → ${t.toVersion}`,
    `Reason:     ${reason}`,
    `Started:    ${t.startedAt}`,
    `Completed:  ${t.completedAt}`,
    `RTO:        ${t.rtoMs}ms (target ≤ 300000ms / 5min)`,
    `RPO:        ${t.rpoSeconds}s (target ≤ 60s)`,
    '',
    'Action items:',
    '  1. Confirm restored deployment is healthy.',
    '  2. File ticket for the underlying trigger.',
    '  3. Schedule blameless review within 48h.',
    '',
  ];
  return lines.join('\n');
}

function postMortemReasonLine(r: RollbackReason): string {
  switch (r.kind) {
    case 'canary_gate_failure':
      return `canary_gate_failure (stage=s${r.stage}, trigger=${r.trigger})`;
    case 'operator_manual':
      return `operator_manual (by=${r.operatorId}${r.note ? `, note=${r.note}` : ''})`;
    case 'anomaly_alert':
      return `anomaly_alert (ΔRTP=${r.deltaRtpPp}pp sustained ${r.sustainedSec}s)`;
    case 'audit_corruption':
      return `audit_corruption (chain break at ${r.chainBreakAt})`;
  }
}

/**
 * Enumerate all defined trigger reasons so the operator runbook and
 * tests stay in sync.
 */
export const ROLLBACK_TRIGGERS = [
  'canary_gate_failure',
  'operator_manual',
  'anomaly_alert',
  'audit_corruption',
] as const;
