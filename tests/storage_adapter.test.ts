/**
 * W152 Wave 16 — StorageAdapter family tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  MemoryStorageAdapter,
  ShardedFsStorageAdapter,
  PluggableUploaderAdapter,
  AdapterBackedSink,
} from '../src/recall/storageAdapter.js';
import type { SpinJournalEntry } from '../src/recall/types.js';

function makeEntry(seq: number, hashSeed: string): SpinJournalEntry {
  return {
    schema_version: '1.0.0',
    seq,
    timestamp_utc: '2026-05-15T00:00:00.000Z',
    bet: { stake: 100, currency: 'EUR' },
    bet_meta: { gameId: 'g', version: '1.0.0' },
    pre_state: { balance: 1000, jackpotPool: {} },
    config_hash: 'a'.repeat(64),
    rng: { kind: 'pcg64', seed: '12345', stream_id: 0 },
    result: { gridHash: 'b'.repeat(64), totalWin: 0, currency: 'EUR' },
    compliance: {},
    prev_hash: '0'.repeat(64),
    entry_hash: hashSeed.repeat(64).slice(0, 64),
  };
}

describe('MemoryStorageAdapter (W152 Wave 16)', () => {
  it('stores and reads back entries', () => {
    const a = new MemoryStorageAdapter();
    a.store(makeEntry(0, '1'));
    a.store(makeEntry(1, '2'));
    expect(a.storedCount()).toBe(2);
    expect(a.readAll()).toHaveLength(2);
  });

  it('reports zero pending (synchronous)', () => {
    const a = new MemoryStorageAdapter();
    a.store(makeEntry(0, '1'));
    expect(a.pendingCount()).toBe(0);
  });

  it('storeManifest tracks last manifest', () => {
    const a = new MemoryStorageAdapter();
    a.storeManifest({
      schema_version: '1.0.0',
      engine_version: '1.0.0',
      journal_file: '<memory>',
      first_seq: 0,
      last_seq: 0,
      first_timestamp_utc: '2026-05-15T00:00:00.000Z',
      last_timestamp_utc: '2026-05-15T00:00:00.000Z',
      last_entry_hash: 'a'.repeat(64),
      manifest_hash: 'm'.repeat(64),
    });
    expect(a.lastManifest()).not.toBeNull();
  });
});

describe('ShardedFsStorageAdapter (W152 Wave 16)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shard-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates date-based shard dir on first write', () => {
    const adapter = new ShardedFsStorageAdapter({
      baseDir: dir,
      clock: () => new Date('2026-05-15T10:00:00Z'),
    });
    adapter.store(makeEntry(0, '1'));
    expect(existsSync(join(dir, '2026-05-15'))).toBe(true);
    expect(adapter.listShards()).toEqual(['2026-05-15/000.ndjson']);
  });

  it('rotates shard within the same day when maxEntriesPerShard exceeded', () => {
    const adapter = new ShardedFsStorageAdapter({
      baseDir: dir,
      clock: () => new Date('2026-05-15T10:00:00Z'),
      maxEntriesPerShard: 2,
    });
    adapter.store(makeEntry(0, '1'));
    adapter.store(makeEntry(1, '2'));
    adapter.store(makeEntry(2, '3'));
    expect(adapter.listShards()).toEqual(['2026-05-15/000.ndjson', '2026-05-15/001.ndjson']);
  });

  it('opens a new date dir when clock rolls over', () => {
    let day = new Date('2026-05-15T23:59:00Z');
    const adapter = new ShardedFsStorageAdapter({
      baseDir: dir,
      clock: () => day,
    });
    adapter.store(makeEntry(0, '1'));
    day = new Date('2026-05-16T00:01:00Z');
    adapter.store(makeEntry(1, '2'));
    expect(adapter.listShards()).toEqual([
      '2026-05-15/000.ndjson',
      '2026-05-16/000.ndjson',
    ]);
  });

  it('readAll reads back entries in chronological order across shards', () => {
    let day = new Date('2026-05-15T10:00:00Z');
    const adapter = new ShardedFsStorageAdapter({ baseDir: dir, clock: () => day });
    adapter.store(makeEntry(0, '1'));
    day = new Date('2026-05-16T10:00:00Z');
    adapter.store(makeEntry(1, '2'));
    const all = adapter.readAll();
    expect(all.map((e) => e.seq)).toEqual([0, 1]);
  });

  it('storeManifest writes MANIFEST.json append-only', () => {
    const adapter = new ShardedFsStorageAdapter({
      baseDir: dir,
      clock: () => new Date('2026-05-15T10:00:00Z'),
    });
    adapter.storeManifest({
      schema_version: '1.0.0',
      engine_version: '1.0.0',
      journal_file: '<sharded>',
      first_seq: 0,
      last_seq: 0,
      first_timestamp_utc: '2026-05-15T00:00:00.000Z',
      last_timestamp_utc: '2026-05-15T00:00:00.000Z',
      last_entry_hash: 'a'.repeat(64),
      manifest_hash: 'm'.repeat(64),
    });
    expect(existsSync(join(dir, 'MANIFEST.json'))).toBe(true);
  });
});

describe('PluggableUploaderAdapter (W152 Wave 16)', () => {
  it('buffers entries up to batchSize and flushes once', async () => {
    const calls: { key: string; size: number }[] = [];
    const adapter = new PluggableUploaderAdapter({
      batchSize: 3,
      upload: async (bytes, key) => {
        calls.push({ key, size: bytes.length });
      },
      clock: () => new Date('2026-05-15T10:00:00Z'),
    });
    adapter.store(makeEntry(0, '1'));
    adapter.store(makeEntry(1, '2'));
    expect(adapter.pendingCount()).toBe(2); // still buffering
    expect(calls).toHaveLength(0);
    adapter.store(makeEntry(2, '3')); // hits batchSize → queued for flush
    expect(adapter.pendingCount()).toBe(3);
    await adapter.flush();
    expect(calls).toHaveLength(1);
    expect(adapter.storedCount()).toBe(3);
    expect(adapter.pendingCount()).toBe(0);
  });

  it('retains pending entries on transient upload failure', async () => {
    let failOnce = true;
    const adapter = new PluggableUploaderAdapter({
      batchSize: 2,
      upload: async () => {
        if (failOnce) {
          failOnce = false;
          throw new Error('transient network error');
        }
      },
      clock: () => new Date('2026-05-15T10:00:00Z'),
    });
    adapter.store(makeEntry(0, '1'));
    adapter.store(makeEntry(1, '2'));
    await expect(adapter.flush()).rejects.toThrow(/transient network error/);
    expect(adapter.storedCount()).toBe(0);
    expect(adapter.pendingCount()).toBe(2);
    // Retry succeeds
    await adapter.flush();
    expect(adapter.storedCount()).toBe(2);
    expect(adapter.pendingCount()).toBe(0);
  });

  it('records attempts + lastError per pending batch', async () => {
    const adapter = new PluggableUploaderAdapter({
      batchSize: 1,
      upload: async () => {
        throw new Error('boom');
      },
      clock: () => new Date('2026-05-15T10:00:00Z'),
    });
    adapter.store(makeEntry(0, '1'));
    await expect(adapter.flush()).rejects.toThrow();
    const pending = adapter.inspectPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].attempts).toBe(1);
    expect(pending[0].lastError).toBe('boom');
  });

  it('storeManifest uploads under expected key prefix', async () => {
    const calls: { key: string }[] = [];
    const adapter = new PluggableUploaderAdapter({
      keyPrefix: 'audit/',
      upload: async (_bytes, key) => {
        calls.push({ key });
      },
      clock: () => new Date('2026-05-15T10:00:00Z'),
    });
    await adapter.storeManifest({
      schema_version: '1.0.0',
      engine_version: '1.0.0',
      journal_file: '<plug>',
      first_seq: 0,
      last_seq: 0,
      first_timestamp_utc: '2026-05-15T00:00:00.000Z',
      last_timestamp_utc: '2026-05-15T00:00:00.000Z',
      last_entry_hash: 'a'.repeat(64),
      manifest_hash: 'm'.repeat(64),
    });
    expect(calls[0].key).toMatch(/^audit\/2026-05-15\/MANIFEST-/);
  });

  it('readAll throws — write-only adapter', () => {
    const adapter = new PluggableUploaderAdapter({
      upload: async () => {},
    });
    expect(() => adapter.readAll()).toThrow(/write-through/);
  });
});

describe('AdapterBackedSink (W152 Wave 16)', () => {
  it('tracks head + seq across pushes', () => {
    const adapter = new MemoryStorageAdapter();
    const sink = new AdapterBackedSink(adapter);
    expect(sink.head()).toBeNull();
    sink.pushSealed(makeEntry(0, '1'));
    sink.pushSealed(makeEntry(1, '2'));
    expect(sink.size()).toBe(2);
    // Head tracks the most-recently-sealed entry — second push wins.
    expect(sink.head()).toBe('2'.repeat(64));
  });

  it('rejects out-of-order seq', () => {
    const sink = new AdapterBackedSink(new MemoryStorageAdapter());
    sink.pushSealed(makeEntry(0, '1'));
    expect(() => sink.pushSealed(makeEntry(2, '3'))).toThrow(/expected seq 1/);
  });

  it('flush propagates to underlying adapter', async () => {
    let flushed = false;
    const adapter = new PluggableUploaderAdapter({
      batchSize: 100,
      upload: async () => {
        flushed = true;
      },
    });
    const sink = new AdapterBackedSink(adapter);
    sink.pushSealed(makeEntry(0, '1'));
    await sink.flush();
    expect(flushed).toBe(true);
  });
});
