/**
 * W215 Faza 600.4 — Disaster recovery orchestration.
 *
 * This module captures the platform's RTO/RPO posture and the
 * machinery to verify it: tiered backup orchestration, chain
 * integrity checks, restore-point selection, and a deterministic
 * failover simulator. All decisions are pure functions; the caller
 * injects `now` so we can run the same drill against synthetic
 * timelines (CI) or live wall-clock data (production).
 *
 * Tier ladder (default — `DEFAULT_DR_TIERS`):
 *
 *   - `critical` — payment/wallet ledgers, audit chain, HSM material
 *     (RTO 15min / RPO 5min)
 *   - `high`     — gameplay state, session tokens, RNG seeds
 *     (RTO 60min / RPO 30min)
 *   - `medium`   — analytics, ML features, dashboards
 *     (RTO 240min / RPO 240min)
 *   - `low`      — long-term archives, reporting snapshots
 *     (RTO 1440min / RPO 1440min)
 *
 * Compliance touchpoints: GLI-19 §6, UKGC RTS 1B.6, MGA Ch.6.
 */

// ---------------------------------------------------------------------------
// Types + tier ladder
// ---------------------------------------------------------------------------

export type DRTier = 'critical' | 'high' | 'medium' | 'low';

export interface DRTargets {
  readonly rto_minutes: number;
  readonly rpo_minutes: number;
  readonly tier: DRTier;
}

export interface BackupSnapshot {
  readonly id: string;
  readonly tier: DRTier;
  readonly createdAt: string; // ISO-8601 UTC
  readonly sizeBytes: number;
  readonly checksum: string; // sha256 hex, 64 chars lowercase
  readonly storageLocation: 'primary' | 'replica' | 'archive';
}

export interface ScheduledBackup {
  readonly tier: DRTier;
  readonly intervalMinutes: number;
  readonly scheduledAt: string;
}

export interface SnapshotFilter {
  readonly tier?: DRTier;
  readonly from?: string; // ISO inclusive
  readonly to?: string;   // ISO inclusive
  readonly storageLocation?: BackupSnapshot['storageLocation'];
}

export interface ChainVerification {
  readonly tier: DRTier;
  readonly ok: boolean;
  readonly snapshots: number;
  readonly maxGapMinutes: number;
  readonly rpoTargetMinutes: number;
  readonly firstAt: string | null;
  readonly lastAt: string | null;
  readonly gapAt: string | null;
}

export type FailoverScenario =
  | 'regional-outage'
  | 'db-corruption'
  | 'ransomware'
  | 'hsm-loss';

export interface FailoverSimulation {
  readonly scenario: FailoverScenario;
  readonly tier: DRTier;
  readonly rto_target_minutes: number;
  readonly rpo_target_minutes: number;
  readonly rto_achieved_minutes: number;
  readonly data_loss_minutes: number;
  readonly pass: boolean;
  readonly notes: string;
}

export const DEFAULT_DR_TIERS: Readonly<Record<DRTier, DRTargets>> = Object.freeze({
  critical: { tier: 'critical', rto_minutes: 15, rpo_minutes: 5 },
  high: { tier: 'high', rto_minutes: 60, rpo_minutes: 30 },
  medium: { tier: 'medium', rto_minutes: 240, rpo_minutes: 240 },
  low: { tier: 'low', rto_minutes: 1440, rpo_minutes: 1440 },
});

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function getTargets(tier: DRTier, tiers: Readonly<Record<DRTier, DRTargets>> = DEFAULT_DR_TIERS): DRTargets {
  return tiers[tier];
}

export function isValidChecksum(checksum: string): boolean {
  return SHA256_HEX_RE.test(checksum);
}

export function parseTs(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`invalid_timestamp: ${iso}`);
  return t;
}

function diffMinutes(aIso: string, bIso: string): number {
  return Math.abs(parseTs(aIso) - parseTs(bIso)) / 60_000;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class BackupOrchestrator {
  private readonly tiers: Readonly<Record<DRTier, DRTargets>>;
  private readonly snapshots: BackupSnapshot[] = [];
  private readonly schedule: ScheduledBackup[] = [];

  constructor(tiers: Readonly<Record<DRTier, DRTargets>> = DEFAULT_DR_TIERS) {
    this.tiers = tiers;
  }

  /**
   * Schedule a backup cadence for a tier. We reject intervals that
   * exceed the RPO target — otherwise the chain will fail verification
   * by construction.
   */
  scheduleBackup(tier: DRTier, intervalMinutes: number, now: string): ScheduledBackup {
    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
      throw new Error(`invalid_interval: ${intervalMinutes}`);
    }
    const target = this.tiers[tier];
    if (intervalMinutes > target.rpo_minutes) {
      throw new Error(
        `interval_${intervalMinutes}min_exceeds_rpo_${target.rpo_minutes}min_for_tier_${tier}`,
      );
    }
    const entry: ScheduledBackup = { tier, intervalMinutes, scheduledAt: now };
    this.schedule.push(entry);
    return entry;
  }

  listSchedule(): ReadonlyArray<ScheduledBackup> {
    return [...this.schedule];
  }

  /** Append a snapshot. Validates checksum + tier + storage. */
  recordSnapshot(snapshot: BackupSnapshot): void {
    if (!(snapshot.tier in this.tiers)) {
      throw new Error(`unknown_tier: ${snapshot.tier}`);
    }
    if (!isValidChecksum(snapshot.checksum)) {
      throw new Error(`invalid_checksum: ${snapshot.checksum}`);
    }
    if (snapshot.sizeBytes < 0 || !Number.isFinite(snapshot.sizeBytes)) {
      throw new Error(`invalid_size: ${snapshot.sizeBytes}`);
    }
    parseTs(snapshot.createdAt); // throws on bad ISO
    if (
      snapshot.storageLocation !== 'primary'
      && snapshot.storageLocation !== 'replica'
      && snapshot.storageLocation !== 'archive'
    ) {
      throw new Error(`invalid_storage_location: ${snapshot.storageLocation}`);
    }
    if (this.snapshots.some(s => s.id === snapshot.id)) {
      throw new Error(`duplicate_snapshot_id: ${snapshot.id}`);
    }
    this.snapshots.push({ ...snapshot });
  }

  listSnapshots(filter: SnapshotFilter = {}): BackupSnapshot[] {
    const fromTs = filter.from ? parseTs(filter.from) : null;
    const toTs = filter.to ? parseTs(filter.to) : null;
    return this.snapshots
      .filter(s => (filter.tier ? s.tier === filter.tier : true))
      .filter(s => (filter.storageLocation ? s.storageLocation === filter.storageLocation : true))
      .filter(s => (fromTs === null ? true : parseTs(s.createdAt) >= fromTs))
      .filter(s => (toTs === null ? true : parseTs(s.createdAt) <= toTs))
      .sort((a, b) => parseTs(a.createdAt) - parseTs(b.createdAt));
  }

  /**
   * Verify there is no RPO gap larger than the tier's RPO target.
   * Returns the first offending gap (if any) plus aggregate metrics.
   */
  verifyChain(tier: DRTier, now?: string): ChainVerification {
    const target = this.tiers[tier];
    const chain = this.listSnapshots({ tier });
    if (chain.length === 0) {
      return {
        tier,
        ok: false,
        snapshots: 0,
        maxGapMinutes: Infinity,
        rpoTargetMinutes: target.rpo_minutes,
        firstAt: null,
        lastAt: null,
        gapAt: null,
      };
    }
    let maxGap = 0;
    let gapAt: string | null = null;
    for (let i = 1; i < chain.length; i++) {
      const gap = diffMinutes(chain[i - 1].createdAt, chain[i].createdAt);
      if (gap > maxGap) {
        maxGap = gap;
        if (gap > target.rpo_minutes && gapAt === null) {
          gapAt = chain[i].createdAt;
        }
      }
    }
    // Tail gap — between last snapshot and `now`.
    if (now) {
      const tailGap = diffMinutes(chain[chain.length - 1].createdAt, now);
      if (tailGap > maxGap) maxGap = tailGap;
      if (tailGap > target.rpo_minutes && gapAt === null) gapAt = now;
    }
    const ok = maxGap <= target.rpo_minutes;
    return {
      tier,
      ok,
      snapshots: chain.length,
      maxGapMinutes: maxGap,
      rpoTargetMinutes: target.rpo_minutes,
      firstAt: chain[0].createdAt,
      lastAt: chain[chain.length - 1].createdAt,
      gapAt,
    };
  }

  /**
   * Select the latest snapshot at or before `beforeTs` for the tier.
   * Returns null if no valid restore point exists.
   */
  selectRestorePoint(tier: DRTier, beforeTs: string): BackupSnapshot | null {
    const limit = parseTs(beforeTs);
    const candidates = this.listSnapshots({ tier }).filter(
      s => parseTs(s.createdAt) <= limit,
    );
    if (candidates.length === 0) return null;
    return candidates[candidates.length - 1];
  }

  /**
   * Simulate failover for a given scenario. Each scenario has a
   * canonical RTO + data-loss profile baked in; the simulator weights
   * them against the requested tier's targets and returns a pass/fail
   * decision.
   */
  simulateFailover(scenario: FailoverScenario, tier: DRTier = 'critical'): FailoverSimulation {
    const target = this.tiers[tier];
    const profile = scenarioProfile(scenario);
    const rtoAchieved = profile.rto_minutes;
    const dataLoss = profile.data_loss_minutes;
    const pass = rtoAchieved <= target.rto_minutes && dataLoss <= target.rpo_minutes;
    return {
      scenario,
      tier,
      rto_target_minutes: target.rto_minutes,
      rpo_target_minutes: target.rpo_minutes,
      rto_achieved_minutes: rtoAchieved,
      data_loss_minutes: dataLoss,
      pass,
      notes: profile.notes,
    };
  }
}

// ---------------------------------------------------------------------------
// Deterministic scenario profiles
// ---------------------------------------------------------------------------

interface ScenarioProfile {
  readonly rto_minutes: number;
  readonly data_loss_minutes: number;
  readonly notes: string;
}

export function scenarioProfile(scenario: FailoverScenario): ScenarioProfile {
  switch (scenario) {
    case 'regional-outage':
      return {
        rto_minutes: 12,
        data_loss_minutes: 4,
        notes: 'DNS failover + replica promote, last streaming WAL replayed',
      };
    case 'db-corruption':
      return {
        rto_minutes: 22,
        data_loss_minutes: 3,
        notes: 'Point-in-time recovery from base + WAL within RPO',
      };
    case 'ransomware':
      return {
        rto_minutes: 55,
        data_loss_minutes: 15,
        notes: 'Restore from offline archive, rebuild AZ from gold AMI',
      };
    case 'hsm-loss':
      return {
        rto_minutes: 8,
        data_loss_minutes: 0,
        notes: 'KMS multi-region key, no plaintext lost, app re-bound to secondary',
      };
    default: {
      // Exhaustive-check pattern.
      const _: never = scenario;
      throw new Error(`unknown_scenario: ${String(_)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Drill report shape (used by scripts/dr/restore-drill.mjs)
// ---------------------------------------------------------------------------

export interface DrillReport {
  readonly scenario: FailoverScenario;
  readonly tier: DRTier;
  readonly generatedAt: string;
  readonly simulation: FailoverSimulation;
  readonly timeline: ReadonlyArray<{ atMinute: number; event: string }>;
}

/**
 * Deterministic synthetic timeline per scenario. Used by the restore
 * drill script to render markdown + json reports without any RNG.
 */
export function scenarioTimeline(scenario: FailoverScenario): ReadonlyArray<{
  atMinute: number;
  event: string;
}> {
  switch (scenario) {
    case 'regional-outage':
      return [
        { atMinute: 0, event: 'Primary region health-check fails (3 consecutive)' },
        { atMinute: 1, event: 'Route53 health policy flips to replica region' },
        { atMinute: 3, event: 'Replica DB promoted to primary, write traffic re-routed' },
        { atMinute: 7, event: 'Auto-scaling group warms compute in replica AZ' },
        { atMinute: 10, event: 'Wallet provider re-bound to replica wallet endpoint' },
        { atMinute: 12, event: 'Synthetic spin/payout transaction succeeds — RTO met' },
      ];
    case 'db-corruption':
      return [
        { atMinute: 0, event: 'Audit-chain integrity check fails on tenant slice' },
        { atMinute: 2, event: 'Writes frozen for affected tenant' },
        { atMinute: 5, event: 'Base backup restored to recovery instance' },
        { atMinute: 14, event: 'WAL replayed up to corruption marker' },
        { atMinute: 20, event: 'Validation harness re-runs PAR sample — green' },
        { atMinute: 22, event: 'Tenant writes thawed, RTO met' },
      ];
    case 'ransomware':
      return [
        { atMinute: 0, event: 'Anomaly auto-mitigation detects mass crypto-locker pattern' },
        { atMinute: 1, event: 'Network segmentation isolates affected AZ' },
        { atMinute: 5, event: 'Gold AMI redeploys clean compute fleet' },
        { atMinute: 20, event: 'Offline-archive snapshot restored to clean DB' },
        { atMinute: 40, event: 'Forensic snapshot of compromised volumes captured' },
        { atMinute: 50, event: 'KMS keys rotated, all sessions invalidated' },
        { atMinute: 55, event: 'Tenant onboarding flow validated, RTO met' },
      ];
    case 'hsm-loss':
      return [
        { atMinute: 0, event: 'Primary KMS region API errors > SLO budget' },
        { atMinute: 1, event: 'Multi-region replica key handles inbound encrypt/decrypt' },
        { atMinute: 4, event: 'RNG provider re-attests secondary key fingerprint' },
        { atMinute: 6, event: 'PAR snapshot signed with secondary key' },
        { atMinute: 8, event: 'End-to-end attestation chain validated, RTO met' },
      ];
    default: {
      const _: never = scenario;
      throw new Error(`unknown_scenario: ${String(_)}`);
    }
  }
}

export function buildDrillReport(
  scenario: FailoverScenario,
  now: string,
  orchestrator: BackupOrchestrator,
  tier: DRTier = 'critical',
): DrillReport {
  return {
    scenario,
    tier,
    generatedAt: now,
    simulation: orchestrator.simulateFailover(scenario, tier),
    timeline: scenarioTimeline(scenario),
  };
}
