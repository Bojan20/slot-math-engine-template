/**
 * Faza 8.5 — Spin Recall & Replay test suite.
 *
 * Coverage:
 *   - Canonical JSON: stable key ordering, NaN refusal.
 *   - Hash chain: sealEntry chains correctly, verifyChain detects every
 *     class of corruption (prev mismatch, hash mismatch, seq jump,
 *     genesis prev, schema mismatch).
 *   - MemoryJournal: append/read/head/size/manifest.
 *   - NdjsonFileJournal: write → reopen → recover head + seq, refuse
 *     corrupt tail.
 *   - replaySpin: ok path, config hash mismatch, version mismatch,
 *     result mismatch, feature trace hash mismatch, engine_error.
 *   - Cross-platform KAT: hash a known entry, compare against fixture.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';

import {
  MemoryJournal,
  NdjsonFileJournal,
  RECALL_SCHEMA_VERSION,
  ZERO_HASH,
  canonicalJson,
  computeEntryHash,
  computeManifestHash,
  readManifest,
  replaySpin,
  sealEntry,
  sealManifest,
  verifyChain,
  writeManifest,
  type ReplayDriver,
  type SpinJournalEntry,
} from '../src/recall/index.js';

// ─── Fixture builders ──────────────────────────────────────────────────

function makeDraft(seq: number, overrides: Partial<SpinJournalEntry> = {}): Omit<SpinJournalEntry, 'prev_hash' | 'entry_hash'> {
  return {
    schema_version: RECALL_SCHEMA_VERSION,
    seq,
    session_id: 's_abc',
    player_pseudonym: 'p_anon_42a',
    spin_index: seq,
    timestamp_utc: `2024-07-15T12:34:56.${String(seq).padStart(3, '0')}Z`,
    config_hash: '9af3e2c1' + '0'.repeat(56),
    engine_version: '0.5.0',
    engine_build: 'g833c040',
    rng_kind: 'pcg64',
    rng_seed_hex: '12345678abcdef00',
    rng_step: seq * 4,
    bet_total_mc: 1000,
    bet_currency: 'EUR',
    bet_meta: { ante: false, buy_feature: null },
    pre_state: {
      in_free_spins: false,
      fs_remaining: 0,
      fs_global_multiplier: 1,
      in_hold_and_win: false,
      hnw_respins_remaining: 0,
      jackpot_pools_mc: { MINI: 50000, GRAND: 1234567 },
    },
    result: {
      total_win_mc: seq === 0 ? 0 : seq * 100,
      line_wins_count: seq === 0 ? 0 : 1,
      scatter_count: 0,
      bonus_count: 0,
      triggered_features: [],
      feature_trace_hash: '0'.repeat(64),
    },
    compliance: { win_cap_applied: false, near_miss_flagged: false },
    ...overrides,
  };
}

// ─── canonicalJson ─────────────────────────────────────────────────────

describe('canonicalJson', () => {
  it('orders keys lexicographically at every level', () => {
    const a = canonicalJson({ b: 1, a: { d: 2, c: 3 } });
    expect(a).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
  it('refuses NaN / Infinity', () => {
    expect(() => canonicalJson({ x: NaN })).toThrow(/non-finite/);
    expect(() => canonicalJson({ x: Infinity })).toThrow(/non-finite/);
  });
  it('escapes strings the same way JSON does', () => {
    expect(canonicalJson('a"b')).toBe('"a\\"b"');
    expect(canonicalJson(['x', null, true, false, 42])).toBe('["x",null,true,false,42]');
  });
});

// ─── Hash chain ─────────────────────────────────────────────────────────

describe('hash chain — sealEntry / verifyChain', () => {
  it('first entry has prev_hash = ZERO_HASH and valid entry_hash', () => {
    const sealed = sealEntry(makeDraft(0), null);
    expect(sealed.prev_hash).toBe(ZERO_HASH);
    const { entry_hash: _h, ...rest } = sealed;
    expect(sealed.entry_hash).toBe(computeEntryHash(rest));
  });

  it('verifyChain accepts a well-formed 3-entry chain', () => {
    const journal = new MemoryJournal();
    journal.append(makeDraft(0));
    journal.append(makeDraft(1));
    journal.append(makeDraft(2));
    const v = verifyChain(journal.readAll());
    expect(v.ok).toBe(true);
  });

  it('detects prev_hash tampering', () => {
    const journal = new MemoryJournal();
    journal.append(makeDraft(0));
    journal.append(makeDraft(1));
    const entries = journal.readAll();
    entries[1] = { ...entries[1], prev_hash: 'ff'.repeat(32) };
    const v = verifyChain(entries);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('prev_hash_mismatch');
  });

  it('detects entry_hash tampering (payload edit)', () => {
    const journal = new MemoryJournal();
    journal.append(makeDraft(0));
    journal.append(makeDraft(1));
    const entries = journal.readAll();
    // Edit a payload field but leave the hash alone → recomputed hash differs.
    entries[1] = { ...entries[1], result: { ...entries[1].result, total_win_mc: 999_999 } };
    const v = verifyChain(entries);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('entry_hash_mismatch');
  });

  it('detects seq non-monotonic', () => {
    const journal = new MemoryJournal();
    journal.append(makeDraft(0));
    journal.append(makeDraft(1));
    const entries = journal.readAll();
    entries[1] = sealEntry(makeDraft(0, { spin_index: 99 }), entries[0].entry_hash);
    const v = verifyChain(entries);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('seq_not_monotonic');
  });

  it('detects schema_version mismatch', () => {
    const draft = makeDraft(0, { schema_version: '0.9.0' as SpinJournalEntry['schema_version'] });
    const e = sealEntry(draft, null);
    const v = verifyChain([e]);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('schema_version_mismatch');
  });

  it('refuses to verify an empty chain', () => {
    const v = verifyChain([]);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('empty_chain');
  });
});

// ─── MemoryJournal ──────────────────────────────────────────────────────

describe('MemoryJournal', () => {
  it('appends entries with monotonic seq and stamped hashes', () => {
    const j = new MemoryJournal();
    const a = j.append(makeDraft(0));
    const b = j.append(makeDraft(1));
    expect(a.seq).toBe(0);
    expect(b.seq).toBe(1);
    expect(b.prev_hash).toBe(a.entry_hash);
    expect(j.size()).toBe(2);
    expect(j.head()).toBe(b.entry_hash);
  });

  it('rejects seq out of order', () => {
    const j = new MemoryJournal();
    j.append(makeDraft(0));
    expect(() => j.append(makeDraft(2))).toThrow(/expected seq 1/);
  });

  it('buildManifest pins the chain head and verifies', () => {
    const j = new MemoryJournal();
    j.append(makeDraft(0));
    const last = j.append(makeDraft(1));
    const m = j.buildManifest();
    expect(m.last_entry_hash).toBe(last.entry_hash);
    expect(m.first_seq).toBe(0);
    expect(m.last_seq).toBe(1);
    // Manifest hash is sha256 of the manifest minus that field
    const { manifest_hash: _h, ...rest } = m;
    expect(m.manifest_hash).toBe(computeManifestHash(rest));
  });
});

// ─── NdjsonFileJournal ──────────────────────────────────────────────────

describe('NdjsonFileJournal', () => {
  function tempPath(): string {
    const dir = mkdtempSync(join(tmpdir(), 'slot-recall-'));
    return join(dir, 'journal.ndjson');
  }

  it('appends to disk and reopens with intact chain', () => {
    const p = tempPath();
    {
      const j = new NdjsonFileJournal(p);
      j.append(makeDraft(0));
      j.append(makeDraft(1));
    }
    const j2 = new NdjsonFileJournal(p);
    expect(j2.size()).toBe(2);
    expect(j2.head()).not.toBeNull();
    const entries = j2.readAll();
    expect(entries).toHaveLength(2);
    expect(verifyChain(entries).ok).toBe(true);
  });

  it('reopen refuses a tampered tail', () => {
    const p = tempPath();
    const j = new NdjsonFileJournal(p);
    j.append(makeDraft(0));
    j.append(makeDraft(1));
    // Manually corrupt the file's last line.
    const raw = readFileSync(p, 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    const last = JSON.parse(lines[1]) as SpinJournalEntry;
    last.prev_hash = 'ff'.repeat(32); // chain break
    writeFileSync(p, lines[0] + '\n' + JSON.stringify(last) + '\n');
    expect(() => new NdjsonFileJournal(p)).toThrow(/chain break/);
  });

  it('continues seq across two journal instances', () => {
    const p = tempPath();
    const j1 = new NdjsonFileJournal(p);
    j1.append(makeDraft(0));
    const j2 = new NdjsonFileJournal(p);
    const next = j2.append(makeDraft(1));
    expect(next.seq).toBe(1);
    expect(next.prev_hash).not.toBe(ZERO_HASH);
  });

  it('writeManifest + readManifest round-trip', () => {
    const p = tempPath();
    const j = new NdjsonFileJournal(p);
    j.append(makeDraft(0));
    const m = j.buildManifest();
    const mPath = p + '.manifest.json';
    writeManifest(mPath, m);
    expect(existsSync(mPath)).toBe(true);
    const back = readManifest(mPath);
    expect(back).toEqual(m);
  });
});

// ─── replaySpin ─────────────────────────────────────────────────────────

describe('replaySpin', () => {
  const expectedConfigHash = '9af3e2c1' + '0'.repeat(56);

  function buildEntryWithTrace(trace: unknown): SpinJournalEntry {
    const traceHash = createHash('sha256')
      .update(canonicalJson(trace), 'utf8')
      .digest('hex');
    const draft = makeDraft(0, {
      result: {
        total_win_mc: 12500,
        line_wins_count: 3,
        scatter_count: 0,
        bonus_count: 0,
        triggered_features: [],
        feature_trace_hash: traceHash,
      },
    });
    return sealEntry(draft, null);
  }

  it('ok path: matching summary + trace hash → ok=true', () => {
    const trace = { wins: [{ line: 1, count: 3 }], events: [] };
    const entry = buildEntryWithTrace(trace);
    const driver: ReplayDriver = () => ({
      summary: entry.result,
      feature_trace: trace,
    });
    const r = replaySpin(entry, driver, {
      engine_version: '0.5.0',
      expected_config_hash: expectedConfigHash,
    });
    expect(r.ok).toBe(true);
  });

  it('detects config_hash mismatch', () => {
    const entry = buildEntryWithTrace({});
    const driver: ReplayDriver = () => ({ summary: entry.result, feature_trace: {} });
    const r = replaySpin(entry, driver, {
      engine_version: '0.5.0',
      expected_config_hash: 'aa'.repeat(32),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('config_hash_mismatch');
  });

  it('detects engine_version mismatch (major)', () => {
    const entry = buildEntryWithTrace({});
    const driver: ReplayDriver = () => ({ summary: entry.result, feature_trace: {} });
    const r = replaySpin(entry, driver, {
      engine_version: '1.0.0',
      expected_config_hash: expectedConfigHash,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('version_mismatch');
  });

  it('minor drift accepted when allow_minor_drift=true', () => {
    const entry = buildEntryWithTrace({ ev: 1 });
    const driver: ReplayDriver = () => ({ summary: entry.result, feature_trace: { ev: 1 } });
    const r = replaySpin(entry, driver, {
      engine_version: '0.6.0',
      expected_config_hash: expectedConfigHash,
      allow_minor_drift: true,
    });
    expect(r.ok).toBe(true);
  });

  it('detects feature_trace_hash mismatch', () => {
    const trace = { v: 1 };
    const entry = buildEntryWithTrace(trace);
    const driver: ReplayDriver = () => ({ summary: entry.result, feature_trace: { v: 2 } });
    const r = replaySpin(entry, driver, {
      engine_version: '0.5.0',
      expected_config_hash: expectedConfigHash,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('result_mismatch');
      expect(r.detail).toMatch(/feature_trace_hash/);
    }
  });

  it('detects total_win mismatch', () => {
    const trace = { v: 1 };
    const entry = buildEntryWithTrace(trace);
    const driver: ReplayDriver = () => ({
      summary: { ...entry.result, total_win_mc: entry.result.total_win_mc + 1 },
      feature_trace: trace,
    });
    const r = replaySpin(entry, driver, {
      engine_version: '0.5.0',
      expected_config_hash: expectedConfigHash,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('result_mismatch');
      expect(r.detail).toMatch(/total_win_mc/);
    }
  });

  it('surfaces engine_error when driver throws', () => {
    const entry = buildEntryWithTrace({});
    const driver: ReplayDriver = () => {
      throw new Error('rng out of stream');
    };
    const r = replaySpin(entry, driver, {
      engine_version: '0.5.0',
      expected_config_hash: expectedConfigHash,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('engine_error');
      expect(r.detail).toBe('rng out of stream');
    }
  });
});

// ─── Cross-platform KAT ────────────────────────────────────────────────

describe('cross-platform KAT', () => {
  it('canonical hash of a fixed entry matches expected', () => {
    const fixed: Omit<SpinJournalEntry, 'entry_hash'> = {
      schema_version: '1.0.0',
      seq: 0,
      prev_hash: ZERO_HASH,
      session_id: 'kat',
      player_pseudonym: 'p',
      spin_index: 0,
      timestamp_utc: '2024-01-01T00:00:00.000Z',
      config_hash: 'a'.repeat(64),
      engine_version: '0.5.0',
      engine_build: 'g0',
      rng_kind: 'pcg64',
      rng_seed_hex: '0',
      rng_step: 0,
      bet_total_mc: 1000,
      bet_currency: 'EUR',
      bet_meta: { ante: false, buy_feature: null },
      pre_state: {
        in_free_spins: false,
        fs_remaining: 0,
        fs_global_multiplier: 1,
        in_hold_and_win: false,
        hnw_respins_remaining: 0,
        jackpot_pools_mc: {},
      },
      result: {
        total_win_mc: 0,
        line_wins_count: 0,
        scatter_count: 0,
        bonus_count: 0,
        triggered_features: [],
        feature_trace_hash: '0'.repeat(64),
      },
      compliance: { win_cap_applied: false, near_miss_flagged: false },
    };
    // Pin: hash of the canonical-JSON of `fixed` (keys sorted, no
    // whitespace). The Rust mirror test in `rust-sim/tests/recall_kat.rs`
    // computes the same value — if either engine drifts, both fail.
    const PINNED = 'd278123a93461184a3ecb95aaa3a43ba1e8a6e0fb4ae109c6b52073cf7a2a3ed';
    const hash = computeEntryHash(fixed);
    expect(hash).toBe(PINNED);
  });
});
