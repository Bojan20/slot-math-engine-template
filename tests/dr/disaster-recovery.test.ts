/**
 * W215 Faza 600.4 — Disaster recovery orchestrator specs.
 */
import { describe, it, expect } from 'vitest';
import {
  BackupOrchestrator,
  DEFAULT_DR_TIERS,
  buildDrillReport,
  getTargets,
  isValidChecksum,
  parseTs,
  scenarioProfile,
  scenarioTimeline,
  type BackupSnapshot,
  type DRTier,
  type FailoverScenario,
} from '../../server/lib/disaster-recovery.js';

const NOW = '2026-05-19T12:00:00Z';
const VALID_CHECKSUM = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function makeSnap(overrides: Partial<BackupSnapshot> = {}): BackupSnapshot {
  return {
    id: overrides.id ?? 's1',
    tier: overrides.tier ?? 'critical',
    createdAt: overrides.createdAt ?? NOW,
    sizeBytes: overrides.sizeBytes ?? 1024,
    checksum: overrides.checksum ?? VALID_CHECKSUM,
    storageLocation: overrides.storageLocation ?? 'primary',
  };
}

function chain(tier: DRTier, baseIso: string, stepMin: number, count: number): BackupSnapshot[] {
  const base = Date.parse(baseIso);
  const out: BackupSnapshot[] = [];
  for (let i = 0; i < count; i++) {
    const ts = new Date(base + i * stepMin * 60_000).toISOString();
    out.push(makeSnap({ id: `${tier}-${i}`, tier, createdAt: ts }));
  }
  return out;
}

describe('W215 DR · DEFAULT_DR_TIERS', () => {
  it('critical tier is 15/5', () => {
    expect(DEFAULT_DR_TIERS.critical).toEqual({ tier: 'critical', rto_minutes: 15, rpo_minutes: 5 });
  });

  it('high tier is 60/30', () => {
    expect(DEFAULT_DR_TIERS.high).toEqual({ tier: 'high', rto_minutes: 60, rpo_minutes: 30 });
  });

  it('medium tier is 240/240', () => {
    expect(DEFAULT_DR_TIERS.medium).toEqual({ tier: 'medium', rto_minutes: 240, rpo_minutes: 240 });
  });

  it('low tier is 1440/1440', () => {
    expect(DEFAULT_DR_TIERS.low).toEqual({ tier: 'low', rto_minutes: 1440, rpo_minutes: 1440 });
  });

  it('getTargets returns the tier object', () => {
    expect(getTargets('critical').rto_minutes).toBe(15);
    expect(getTargets('low').rpo_minutes).toBe(1440);
  });

  it('default tiers object is frozen', () => {
    expect(Object.isFrozen(DEFAULT_DR_TIERS)).toBe(true);
  });
});

describe('W215 DR · helpers', () => {
  it('isValidChecksum accepts 64-char lowercase hex', () => {
    expect(isValidChecksum(VALID_CHECKSUM)).toBe(true);
  });

  it('isValidChecksum rejects short strings', () => {
    expect(isValidChecksum('abc')).toBe(false);
  });

  it('isValidChecksum rejects uppercase hex', () => {
    expect(isValidChecksum(VALID_CHECKSUM.toUpperCase())).toBe(false);
  });

  it('parseTs rejects garbage', () => {
    expect(() => parseTs('not-a-ts')).toThrow(/invalid_timestamp/);
  });

  it('parseTs returns ms epoch', () => {
    expect(parseTs(NOW)).toBe(Date.parse(NOW));
  });
});

describe('W215 DR · scheduleBackup', () => {
  it('records a valid schedule within RPO', () => {
    const orch = new BackupOrchestrator();
    const entry = orch.scheduleBackup('critical', 4, NOW);
    expect(entry.tier).toBe('critical');
    expect(entry.intervalMinutes).toBe(4);
    expect(orch.listSchedule()).toHaveLength(1);
  });

  it('rejects interval exceeding RPO', () => {
    const orch = new BackupOrchestrator();
    expect(() => orch.scheduleBackup('critical', 10, NOW)).toThrow(/exceeds_rpo/);
  });

  it('rejects non-positive intervals', () => {
    const orch = new BackupOrchestrator();
    expect(() => orch.scheduleBackup('critical', 0, NOW)).toThrow(/invalid_interval/);
    expect(() => orch.scheduleBackup('critical', -1, NOW)).toThrow(/invalid_interval/);
  });

  it('allows multiple schedules across tiers', () => {
    const orch = new BackupOrchestrator();
    orch.scheduleBackup('critical', 4, NOW);
    orch.scheduleBackup('high', 20, NOW);
    orch.scheduleBackup('low', 720, NOW);
    expect(orch.listSchedule()).toHaveLength(3);
  });
});

describe('W215 DR · recordSnapshot', () => {
  it('appends a valid snapshot', () => {
    const orch = new BackupOrchestrator();
    orch.recordSnapshot(makeSnap());
    expect(orch.listSnapshots()).toHaveLength(1);
  });

  it('rejects bad checksum', () => {
    const orch = new BackupOrchestrator();
    expect(() => orch.recordSnapshot(makeSnap({ checksum: 'badchk' }))).toThrow(/invalid_checksum/);
  });

  it('rejects negative size', () => {
    const orch = new BackupOrchestrator();
    expect(() => orch.recordSnapshot(makeSnap({ sizeBytes: -10 }))).toThrow(/invalid_size/);
  });

  it('rejects duplicate id', () => {
    const orch = new BackupOrchestrator();
    orch.recordSnapshot(makeSnap({ id: 'dup' }));
    expect(() => orch.recordSnapshot(makeSnap({ id: 'dup' }))).toThrow(/duplicate_snapshot_id/);
  });

  it('rejects invalid ISO timestamp', () => {
    const orch = new BackupOrchestrator();
    expect(() => orch.recordSnapshot(makeSnap({ createdAt: 'yesterday' }))).toThrow(/invalid_timestamp/);
  });

  it('rejects unknown storage location', () => {
    const orch = new BackupOrchestrator();
    // @ts-expect-error — exercising runtime guard
    expect(() => orch.recordSnapshot(makeSnap({ storageLocation: 'tape' }))).toThrow(/invalid_storage_location/);
  });
});

describe('W215 DR · listSnapshots filters', () => {
  it('filters by tier', () => {
    const orch = new BackupOrchestrator();
    chain('critical', NOW, 4, 3).forEach(s => orch.recordSnapshot(s));
    chain('high', NOW, 20, 2).forEach(s => orch.recordSnapshot(s));
    expect(orch.listSnapshots({ tier: 'critical' })).toHaveLength(3);
    expect(orch.listSnapshots({ tier: 'high' })).toHaveLength(2);
  });

  it('filters by storage location', () => {
    const orch = new BackupOrchestrator();
    orch.recordSnapshot(makeSnap({ id: 'a', storageLocation: 'primary' }));
    orch.recordSnapshot(makeSnap({ id: 'b', storageLocation: 'replica' }));
    orch.recordSnapshot(makeSnap({ id: 'c', storageLocation: 'archive' }));
    expect(orch.listSnapshots({ storageLocation: 'replica' })).toHaveLength(1);
  });

  it('filters by time window', () => {
    const orch = new BackupOrchestrator();
    chain('critical', '2026-05-19T00:00:00Z', 4, 10).forEach(s => orch.recordSnapshot(s));
    const inWindow = orch.listSnapshots({
      from: '2026-05-19T00:10:00Z',
      to: '2026-05-19T00:25:00Z',
    });
    expect(inWindow.length).toBeGreaterThan(0);
    expect(inWindow.length).toBeLessThan(10);
  });

  it('returns sorted by createdAt', () => {
    const orch = new BackupOrchestrator();
    orch.recordSnapshot(makeSnap({ id: 'late', createdAt: '2026-05-19T01:00:00Z' }));
    orch.recordSnapshot(makeSnap({ id: 'early', createdAt: '2026-05-19T00:00:00Z' }));
    const result = orch.listSnapshots();
    expect(result[0].id).toBe('early');
    expect(result[1].id).toBe('late');
  });
});

describe('W215 DR · verifyChain', () => {
  it('passes a tight chain within RPO', () => {
    const orch = new BackupOrchestrator();
    chain('critical', NOW, 4, 5).forEach(s => orch.recordSnapshot(s));
    const v = orch.verifyChain('critical');
    expect(v.ok).toBe(true);
    expect(v.maxGapMinutes).toBeLessThanOrEqual(5);
    expect(v.snapshots).toBe(5);
  });

  it('fails when gap exceeds RPO', () => {
    const orch = new BackupOrchestrator();
    chain('critical', NOW, 10, 3).forEach(s => orch.recordSnapshot(s)); // 10min > 5min RPO
    const v = orch.verifyChain('critical');
    expect(v.ok).toBe(false);
    expect(v.gapAt).not.toBeNull();
  });

  it('reports infinite gap when empty', () => {
    const orch = new BackupOrchestrator();
    const v = orch.verifyChain('critical');
    expect(v.ok).toBe(false);
    expect(v.snapshots).toBe(0);
    expect(v.maxGapMinutes).toBe(Infinity);
  });

  it('factors in tail gap when `now` is passed', () => {
    const orch = new BackupOrchestrator();
    chain('critical', '2026-05-19T00:00:00Z', 4, 3).forEach(s => orch.recordSnapshot(s));
    // last snap at 00:08, now is 1 hour later — tail gap busts RPO
    const v = orch.verifyChain('critical', '2026-05-19T01:00:00Z');
    expect(v.ok).toBe(false);
    expect(v.maxGapMinutes).toBeGreaterThan(5);
  });
});

describe('W215 DR · selectRestorePoint', () => {
  it('returns the latest snapshot before ts', () => {
    const orch = new BackupOrchestrator();
    chain('critical', '2026-05-19T00:00:00Z', 4, 5).forEach(s => orch.recordSnapshot(s));
    const pick = orch.selectRestorePoint('critical', '2026-05-19T00:09:00Z');
    expect(pick).not.toBeNull();
    expect(Date.parse(pick!.createdAt)).toBe(Date.parse('2026-05-19T00:08:00Z'));
  });

  it('returns null when no snapshot is old enough', () => {
    const orch = new BackupOrchestrator();
    chain('critical', '2026-05-19T01:00:00Z', 4, 5).forEach(s => orch.recordSnapshot(s));
    expect(orch.selectRestorePoint('critical', '2026-05-19T00:00:00Z')).toBeNull();
  });

  it('respects tier scope', () => {
    const orch = new BackupOrchestrator();
    chain('critical', '2026-05-19T00:00:00Z', 4, 2).forEach(s => orch.recordSnapshot(s));
    chain('high', '2026-05-19T00:00:00Z', 20, 2).forEach(s => orch.recordSnapshot(s));
    const pick = orch.selectRestorePoint('high', '2026-05-19T00:25:00Z');
    expect(pick!.tier).toBe('high');
  });
});

describe('W215 DR · simulateFailover', () => {
  const scenarios: FailoverScenario[] = ['regional-outage', 'db-corruption', 'ransomware', 'hsm-loss'];

  it.each(scenarios)('%s returns deterministic profile', (scenario) => {
    const orch = new BackupOrchestrator();
    const a = orch.simulateFailover(scenario);
    const b = orch.simulateFailover(scenario);
    expect(a).toEqual(b);
  });

  it('hsm-loss passes critical tier with zero data loss', () => {
    const orch = new BackupOrchestrator();
    const r = orch.simulateFailover('hsm-loss', 'critical');
    expect(r.pass).toBe(true);
    expect(r.data_loss_minutes).toBe(0);
  });

  it('regional-outage passes critical tier (12min RTO < 15min budget)', () => {
    const orch = new BackupOrchestrator();
    const r = orch.simulateFailover('regional-outage', 'critical');
    expect(r.pass).toBe(true);
    expect(r.rto_achieved_minutes).toBeLessThanOrEqual(r.rto_target_minutes);
  });

  it('db-corruption is too slow for critical but ok at high', () => {
    const orch = new BackupOrchestrator();
    expect(orch.simulateFailover('db-corruption', 'critical').pass).toBe(false);
    expect(orch.simulateFailover('db-corruption', 'high').pass).toBe(true);
  });

  it('ransomware passes medium tier', () => {
    const orch = new BackupOrchestrator();
    expect(orch.simulateFailover('ransomware', 'medium').pass).toBe(true);
  });
});

describe('W215 DR · scenarioProfile + timeline', () => {
  it('every scenario has at least 5 timeline events', () => {
    for (const s of ['regional-outage', 'db-corruption', 'ransomware', 'hsm-loss'] as const) {
      expect(scenarioTimeline(s).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('timeline minutes are monotonically non-decreasing', () => {
    for (const s of ['regional-outage', 'db-corruption', 'ransomware', 'hsm-loss'] as const) {
      const tl = scenarioTimeline(s);
      for (let i = 1; i < tl.length; i++) {
        expect(tl[i].atMinute).toBeGreaterThanOrEqual(tl[i - 1].atMinute);
      }
    }
  });

  it('scenarioProfile matches the RTO reported by timeline final event', () => {
    for (const s of ['regional-outage', 'db-corruption', 'ransomware', 'hsm-loss'] as const) {
      const profile = scenarioProfile(s);
      const tl = scenarioTimeline(s);
      expect(profile.rto_minutes).toBe(tl[tl.length - 1].atMinute);
    }
  });
});

describe('W215 DR · buildDrillReport', () => {
  it('returns a full report shape', () => {
    const orch = new BackupOrchestrator();
    const rep = buildDrillReport('hsm-loss', NOW, orch);
    expect(rep.scenario).toBe('hsm-loss');
    expect(rep.tier).toBe('critical');
    expect(rep.generatedAt).toBe(NOW);
    expect(rep.simulation.pass).toBe(true);
    expect(rep.timeline.length).toBeGreaterThan(0);
  });

  it('respects tier override', () => {
    const orch = new BackupOrchestrator();
    const rep = buildDrillReport('db-corruption', NOW, orch, 'high');
    expect(rep.tier).toBe('high');
    expect(rep.simulation.pass).toBe(true);
  });
});
