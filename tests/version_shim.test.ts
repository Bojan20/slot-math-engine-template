/**
 * W152 Wave 16 — Cross-version replay shim tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerMigration,
  migrateEntry,
  compareVersions,
  currentSchema,
  supportedSourceVersions,
  UnknownSchemaVersionError,
  BrokenMigrationLadderError,
  _resetMigrations,
} from '../src/recall/versionShim.js';
import type { SpinJournalEntry, SchemaVersion } from '../src/recall/types.js';
import { RECALL_SCHEMA_VERSION } from '../src/recall/types.js';

function fakeEntry(version: SchemaVersion): SpinJournalEntry {
  return {
    schema_version: version,
    seq: 0,
    timestamp_utc: '2026-05-15T00:00:00.000Z',
    bet: { stake: 100, currency: 'EUR' },
    bet_meta: { gameId: 'g', version: '1.0.0' },
    pre_state: { balance: 1000, jackpotPool: {} },
    config_hash: 'a'.repeat(64),
    rng: { kind: 'pcg64', seed: '12345', stream_id: 0 },
    result: { gridHash: 'b'.repeat(64), totalWin: 0, currency: 'EUR' },
    compliance: {},
    prev_hash: '0'.repeat(64),
    entry_hash: 'c'.repeat(64),
  };
}

describe('compareVersions', () => {
  it('orders semver tuples correctly', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.10.0', '1.2.0')).toBeGreaterThan(0); // semantic ordering
  });
  it('throws on malformed version', () => {
    expect(() => compareVersions('1.0' as SchemaVersion, '1.0.0')).toThrow();
  });
});

describe('migrateEntry — current schema', () => {
  beforeEach(_resetMigrations);

  it('returns entry unchanged when schema_version matches current', () => {
    const e = fakeEntry(RECALL_SCHEMA_VERSION);
    expect(migrateEntry(e)).toBe(e); // same instance
  });

  it('throws UnknownSchemaVersionError on a future version', () => {
    const future: SchemaVersion = '99.0.0';
    const e = fakeEntry(future);
    expect(() => migrateEntry(e)).toThrow(UnknownSchemaVersionError);
  });

  it('throws BrokenMigrationLadderError when no migration registered', () => {
    const e = fakeEntry('0.9.0');
    expect(() => migrateEntry(e)).toThrow(BrokenMigrationLadderError);
  });
});

describe('migrateEntry — single registered step', () => {
  beforeEach(_resetMigrations);

  it('walks one migration to current', () => {
    registerMigration('0.9.0', RECALL_SCHEMA_VERSION, (e) => ({
      ...e,
      schema_version: RECALL_SCHEMA_VERSION,
    }));
    const e = fakeEntry('0.9.0');
    const out = migrateEntry(e);
    expect(out.schema_version).toBe(RECALL_SCHEMA_VERSION);
  });

  it('preserves entry_hash and prev_hash through migration', () => {
    registerMigration('0.9.0', RECALL_SCHEMA_VERSION, (e) => ({
      ...e,
      schema_version: RECALL_SCHEMA_VERSION,
    }));
    const e = fakeEntry('0.9.0');
    const out = migrateEntry(e);
    expect(out.entry_hash).toBe(e.entry_hash);
    expect(out.prev_hash).toBe(e.prev_hash);
  });
});

describe('registerMigration — guards', () => {
  beforeEach(_resetMigrations);

  it('rejects backward migration', () => {
    expect(() =>
      registerMigration('1.0.0', '0.9.0', (e) => e),
    ).toThrow(/strictly greater/);
  });

  it('rejects same-version migration', () => {
    expect(() => registerMigration('1.0.0', '1.0.0', (e) => e)).toThrow();
  });

  it('rejects duplicate registration', () => {
    registerMigration('0.5.0', '0.6.0', (e) => ({ ...e, schema_version: '0.6.0' }));
    expect(() => registerMigration('0.5.0', '0.6.0', (e) => e)).toThrow(/duplicate/);
  });
});

describe('currentSchema + supportedSourceVersions', () => {
  beforeEach(_resetMigrations);

  it('currentSchema matches RECALL_SCHEMA_VERSION', () => {
    expect(currentSchema()).toBe(RECALL_SCHEMA_VERSION);
  });

  it('supportedSourceVersions always includes current schema', () => {
    expect(supportedSourceVersions()).toContain(RECALL_SCHEMA_VERSION);
  });

  it('supportedSourceVersions enumerates registered froms', () => {
    registerMigration('0.9.0', RECALL_SCHEMA_VERSION, (e) => ({
      ...e,
      schema_version: RECALL_SCHEMA_VERSION,
    }));
    registerMigration('0.8.0', '0.9.0', (e) => ({ ...e, schema_version: '0.9.0' }));
    const supported = supportedSourceVersions();
    expect(supported).toContain('0.8.0');
    expect(supported).toContain('0.9.0');
    expect(supported).toContain(RECALL_SCHEMA_VERSION);
    // Sorted ascending.
    expect(supported).toEqual([...supported].sort(compareVersions));
  });
});

describe('migrateEntry — multi-step ladder', () => {
  beforeEach(_resetMigrations);

  it('walks two consecutive migrations to current', () => {
    let step1Called = false;
    let step2Called = false;
    registerMigration('0.8.0', '0.9.0', (e) => {
      step1Called = true;
      return { ...e, schema_version: '0.9.0' };
    });
    registerMigration('0.9.0', RECALL_SCHEMA_VERSION, (e) => {
      step2Called = true;
      return { ...e, schema_version: RECALL_SCHEMA_VERSION };
    });
    const e = fakeEntry('0.8.0');
    const out = migrateEntry(e);
    expect(step1Called).toBe(true);
    expect(step2Called).toBe(true);
    expect(out.schema_version).toBe(RECALL_SCHEMA_VERSION);
  });
});
