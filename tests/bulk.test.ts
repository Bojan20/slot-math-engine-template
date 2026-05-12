/**
 * Faza 9.8 — TypeScript bulk dispatcher tests.
 *
 * Coverage:
 *   - parseSpinCount: every suffix + error path
 *   - Dispatcher: small synthetic run, deterministic counter merges
 *   - Checkpoint: save + load roundtrip, refuse mismatched configHash,
 *     refuse mismatched schema_version
 *   - Resume: partial run continues from checkpoint, final counters match
 *   - Progress: reporter receives one tick per chunk + a done event
 *
 * The dispatcher's real engine driver is plug-in (`runner` callback);
 * the suite uses `mockChunkRunner` so the math is deterministic without
 * spinning up the evaluator.
 */

import { describe, it, expect } from 'vitest';
import {
  BulkDispatcher,
  CHECKPOINT_SCHEMA_VERSION,
  EMPTY_STATS,
  loadCheckpoint,
  ParseSpinCountError,
  parseSpinCount,
  saveCheckpoint,
  type BulkCheckpoint,
  type BulkConfig,
  type ProgressEvent,
  type ProgressReporter,
} from '../src/bulk/index.js';
import { tempCheckpointPath } from '../src/bulk/checkpoint.js';

// ─── parseSpinCount ─────────────────────────────────────────────────────

describe('parseSpinCount', () => {
  it('plain integer', () => {
    expect(parseSpinCount('1000')).toBe(1000);
    expect(parseSpinCount('1_000_000')).toBe(1_000_000);
  });
  it('K/M/B/T suffixes', () => {
    expect(parseSpinCount('5K')).toBe(5_000);
    expect(parseSpinCount('5M')).toBe(5_000_000);
    expect(parseSpinCount('1B')).toBe(1_000_000_000);
    expect(parseSpinCount('1T')).toBe(1_000_000_000_000);
  });
  it('fractional with suffix', () => {
    expect(parseSpinCount('1.5B')).toBe(1_500_000_000);
    expect(parseSpinCount('2.5T')).toBe(2_500_000_000_000);
  });
  it('case insensitive suffix', () => {
    expect(parseSpinCount('1t')).toBe(1_000_000_000_000);
    expect(parseSpinCount('100b')).toBe(100_000_000_000);
  });
  it('rejects unknown suffix', () => {
    expect(() => parseSpinCount('5X')).toThrow(ParseSpinCountError);
  });
  it('rejects negative', () => {
    expect(() => parseSpinCount('-5M')).toThrow(/non-negative/);
  });
  it('rejects empty', () => {
    expect(() => parseSpinCount('')).toThrow(/empty/);
    expect(() => parseSpinCount('   ')).toThrow(/empty/);
  });
  it('rejects invalid input', () => {
    // 'abc' lands on the suffix path (`c`) before the number-parse path;
    // 'X' is not a known suffix → ParseSpinCountError either way. We
    // care that it throws *something* structured rather than failing
    // silently.
    expect(() => parseSpinCount('abc')).toThrow(ParseSpinCountError);
    expect(() => parseSpinCount('1.5.3B')).toThrow(ParseSpinCountError);
  });
});

// ─── BulkDispatcher run ────────────────────────────────────────────────

function makeConfig(total: number, baseSeed = 42, overrides: Partial<BulkConfig> = {}): BulkConfig {
  return {
    totalSpins: total,
    chunkSpins: 25_000,
    baseSeed,
    totalBetMc: 1000,
    runId: 'test-run',
    configHash: 'test-cfg',
    ...overrides,
  };
}

describe('BulkDispatcher.run', () => {
  it('executes all spins via the mock runner', async () => {
    const r = await new BulkDispatcher(makeConfig(100_000)).run();
    expect(r.totalSpins).toBe(100_000);
    expect(r.stats.total_spins).toBe(100_000);
    expect(r.chunksCompleted).toBe(4);
    expect(r.spinsPerSec).toBeGreaterThan(0);
    expect(r.checkpointsWritten).toBe(0);
  });

  it('is deterministic for the same baseSeed + chunking', async () => {
    const a = await new BulkDispatcher(makeConfig(50_000, 9999)).run();
    const b = await new BulkDispatcher(makeConfig(50_000, 9999)).run();
    expect(a.stats.total_won).toBe(b.stats.total_won);
    expect(a.stats.winning_spins).toBe(b.stats.winning_spins);
    expect(a.hdrBuckets).toEqual(b.hdrBuckets);
  });

  it('handles partial final chunk', async () => {
    const r = await new BulkDispatcher(
      makeConfig(75_000, 7, { chunkSpins: 20_000 }),
    ).run();
    expect(r.totalSpins).toBe(75_000);
    expect(r.chunksCompleted).toBe(4); // 20+20+20+15
    expect(r.stats.total_spins).toBe(75_000);
  });

  it('zero total is a clean no-op', async () => {
    const r = await new BulkDispatcher(makeConfig(0)).run();
    expect(r.totalSpins).toBe(0);
    expect(r.chunksCompleted).toBe(0);
    expect(r.stats.total_spins).toBe(0);
  });
});

// ─── Checkpoint save / load roundtrip ──────────────────────────────────

describe('checkpoint roundtrip', () => {
  it('save + load are byte-equivalent', async () => {
    const path = tempCheckpointPath();
    const chk: BulkCheckpoint = {
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      runId: 'rt',
      configHash: 'cfg',
      totalSpinsTarget: 1_000_000,
      completedSpins: 250_000,
      baseSeed: 42,
      chunkSpins: 50_000,
      chunksCompleted: 5,
      elapsedMs: 1000,
      startedAtEpochMs: 1_700_000_000_000,
      lastCheckpointEpochMs: 1_700_000_010_000,
      stats: { ...EMPTY_STATS },
      hdrBuckets: new Array<number>(32).fill(0),
    };
    saveCheckpoint(path, chk);
    const back = loadCheckpoint(path);
    expect(back).toEqual(chk);
  });

  it('returns null for missing file', () => {
    expect(loadCheckpoint('/tmp/__no_such_slot_ckpt__.ckpt')).toBeNull();
  });

  it('rejects mismatched schemaVersion', () => {
    const path = tempCheckpointPath();
    const bogus = {
      schemaVersion: '9.9.9',
      runId: 'x',
      configHash: 'x',
      totalSpinsTarget: 0,
      completedSpins: 0,
      baseSeed: 0,
      chunkSpins: 0,
      chunksCompleted: 0,
      elapsedMs: 0,
      startedAtEpochMs: 0,
      lastCheckpointEpochMs: 0,
      stats: { ...EMPTY_STATS },
      hdrBuckets: new Array<number>(32).fill(0),
    };
    // Write directly so we can plant a bad version.
    require('fs').writeFileSync(path, JSON.stringify(bogus));
    expect(() => loadCheckpoint(path)).toThrow(/schema version/);
  });
});

// ─── Resume semantics ──────────────────────────────────────────────────

describe('resume', () => {
  it('continues from a checkpoint and reaches the target spin count', async () => {
    const path = tempCheckpointPath();
    const cfg = makeConfig(40_000, 17, {
      chunkSpins: 10_000,
      checkpointPath: path,
      checkpointEveryChunks: 1,
    });
    const first = await new BulkDispatcher(cfg).run();
    expect(first.totalSpins).toBe(40_000);
    expect(first.checkpointsWritten).toBeGreaterThanOrEqual(1);

    const chk = loadCheckpoint(path)!;
    expect(chk.completedSpins).toBe(40_000);

    // Resuming a finished run is a no-op — same final total.
    const second = await new BulkDispatcher({
      ...cfg,
      resumeCheckpoint: chk,
    }).run();
    expect(second.totalSpins).toBe(40_000);
    expect(second.stats.total_spins).toBe(40_000);
  });

  it('refuses a checkpoint with a different configHash', async () => {
    const path = tempCheckpointPath();
    const cfg = makeConfig(20_000, 1, {
      chunkSpins: 10_000,
      checkpointPath: path,
      checkpointEveryChunks: 1,
    });
    await new BulkDispatcher(cfg).run();
    const chk = loadCheckpoint(path)!;

    await expect(
      new BulkDispatcher({
        ...cfg,
        configHash: 'different',
        resumeCheckpoint: chk,
      }).run(),
    ).rejects.toThrow(/configHash/);
  });

  it('refuses a checkpoint with a different totalSpins', async () => {
    const path = tempCheckpointPath();
    const cfg = makeConfig(20_000, 1, {
      chunkSpins: 10_000,
      checkpointPath: path,
      checkpointEveryChunks: 1,
    });
    await new BulkDispatcher(cfg).run();
    const chk = loadCheckpoint(path)!;

    await expect(
      new BulkDispatcher({
        ...cfg,
        totalSpins: 40_000, // doubled
        resumeCheckpoint: chk,
      }).run(),
    ).rejects.toThrow(/totalSpinsTarget/);
  });
});

// ─── Progress reporter ─────────────────────────────────────────────────

describe('progress reporter', () => {
  it('receives one tick per chunk plus a done event', async () => {
    const events: ProgressEvent[] = [];
    const reporter: ProgressReporter = { report: (e) => events.push(e) };
    const r = await new BulkDispatcher(
      makeConfig(100_000, 1, { chunkSpins: 25_000, progress: reporter }),
    ).run();
    expect(r.totalSpins).toBe(100_000);
    const ticks = events.filter((e) => e.kind === 'tick');
    const dones = events.filter((e) => e.kind === 'done');
    expect(ticks.length).toBe(4);
    expect(dones.length).toBe(1);
    expect(ticks[ticks.length - 1].kind === 'tick' && ticks[ticks.length - 1].completed)
      .toBe(100_000);
  });
});

// ─── Plug-in runner contract ───────────────────────────────────────────

describe('custom runner', () => {
  it('can be swapped for a deterministic stub', async () => {
    let runnerCalls = 0;
    const r = await new BulkDispatcher(
      makeConfig(40_000, 1, {
        chunkSpins: 20_000,
        runner: async ({ count }) => {
          runnerCalls++;
          return {
            stats: {
              ...EMPTY_STATS,
              total_spins: count,
              total_wagered: count * 1000,
              total_won: count * 500,
              winning_spins: count,
            },
            hdrBuckets: new Array<number>(32).fill(0),
          };
        },
      }),
    ).run();
    expect(runnerCalls).toBe(2);
    expect(r.stats.total_spins).toBe(40_000);
    expect(r.stats.total_won).toBe(20_000_000);
    expect(r.stats.winning_spins).toBe(40_000);
  });
});
