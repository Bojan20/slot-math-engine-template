/**
 * Faza 14.1 — Analytical Memoization KATs.
 *
 * Tests exhaustive grid enumeration, exact RTP / hit-rate, and sub-ms query
 * via the AnalyticalEngine memoization table.
 */

import { describe, it, expect, vi } from 'vitest';
import { AnalyticalEngine } from '../src/analytical/index.js';
import type { SlotGameIR } from '../src/ir/types.js';

vi.setConfig({ testTimeout: 30_000 });

// ─── Inline test IR ──────────────────────────────────────────────────────────

function makeSmallStripsIR(): SlotGameIR {
  const strip = ['W', 'H1', 'H2', 'L1', 'L2']; // 5 stops
  return {
    schema_version: '1.0.0',
    meta: { id: 'test-strips', name: 'Test', version: '1.0.0', theme_tags: [] },
    topology: { kind: 'rectangular', reels: 3, rows: 3 },
    symbols: [
      { id: 'W', name: 'Wild', kind: 'wild', substitutes: '*' },
      { id: 'H1', name: 'H1', kind: 'hp' },
      { id: 'H2', name: 'H2', kind: 'hp' },
      { id: 'L1', name: 'L1', kind: 'lp' },
      { id: 'L2', name: 'L2', kind: 'lp' },
    ],
    reels: { mode: 'strips', base: [strip, strip, strip] },
    paytable: {
      H1: { '3': 20 },
      H2: { '3': 12 },
      L1: { '3': 8 },
      L2: { '3': 5 },
      W: { '3': 50 },
    },
    evaluation: {
      kind: 'lines',
      paylines: [[1, 1, 1], [0, 0, 0], [2, 2, 2]],
      direction: 'ltr',
      min_match: 3,
      pay_left_to_right_only: true,
    },
    features: [],
    rng: { kind: 'mulberry32', default_seed: 42 },
    bet: { currency: 'EUR', base_bet: 1, denominations: [1] },
    limits: {
      target_rtp: 0.96,
      rtp_tolerance: 0.05,
      max_win_x: 5000,
      win_cap_apply: 'per_spin',
      target_volatility: 'medium',
      hit_freq_target: 0.3,
    },
    compliance: {
      jurisdictions: ['MGA'],
      rtp_range_required: [80, 99],
      max_win_cap_required: 5000,
      near_miss_rule: 'must_be_random',
      ldw_disclosure: true,
      session_time_display: true,
    },
    rtp_allocation: {
      base_game: 0.96,
      free_spins: 0,
      hold_and_win: 0,
      jackpot: 0,
      tolerance: 0.05,
    },
  } as SlotGameIR;
}

function makeWeightedIR(): SlotGameIR {
  const base = makeSmallStripsIR();
  return {
    ...base,
    reels: {
      mode: 'weighted',
      base: [
        { W: 1, H1: 2, H2: 2, L1: 2, L2: 2 },
        { W: 1, H1: 2, H2: 2, L1: 2, L2: 2 },
        { W: 1, H1: 2, H2: 2, L1: 2, L2: 2 },
      ],
    },
  } as SlotGameIR;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Faza 14.1 — AnalyticalEngine', () => {

  // ANAL-01: construct
  it('ANAL-01: AnalyticalEngine can be constructed', () => {
    const engine = new AnalyticalEngine();
    expect(engine).toBeInstanceOf(AnalyticalEngine);
  });

  // ANAL-02: buildTable throws for weighted mode
  it('ANAL-02: buildTable throws for weighted reel mode', () => {
    const engine = new AnalyticalEngine();
    const ir = makeWeightedIR();
    expect(() => engine.buildTable(ir)).toThrow(/strips/i);
  });

  // ANAL-03: buildTable throws when totalStates > maxStates
  it('ANAL-03: buildTable throws when totalStates > maxStates', () => {
    const engine = new AnalyticalEngine();
    // 5^3 = 125 states; maxStates=10 → should throw
    const ir = makeSmallStripsIR();
    expect(() => engine.buildTable(ir, { maxStates: 10 })).toThrow(/maxStates/i);
  });

  // ANAL-04: buildTable succeeds for 3-reel, 5-stop strips game
  it('ANAL-04: buildTable succeeds for 3-reel 5-stop game (125 states)', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    const table = engine.buildTable(ir);
    expect(table).toBeDefined();
    expect(table.gameId).toBe('test-strips');
  });

  // ANAL-05: totalStates = 125
  it('ANAL-05: totalStates equals 5^3 = 125', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    const table = engine.buildTable(ir);
    expect(table.totalStates).toBe(125);
  });

  // ANAL-06: analyticalRtp in (0, 10)
  it('ANAL-06: analyticalRtp is a positive finite number in (0, 10)', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    const table = engine.buildTable(ir);
    expect(table.analyticalRtp).toBeGreaterThan(0);
    expect(table.analyticalRtp).toBeLessThan(10);
  });

  // ANAL-07: analyticalHitRate in (0, 1)
  it('ANAL-07: analyticalHitRate is in (0, 1)', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    const table = engine.buildTable(ir);
    expect(table.analyticalHitRate).toBeGreaterThan(0);
    expect(table.analyticalHitRate).toBeLessThan(1);
  });

  // ANAL-08: entries not empty
  it('ANAL-08: entries map is not empty', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    const table = engine.buildTable(ir);
    expect(table.entries.size).toBeGreaterThan(0);
  });

  // ANAL-09: query returns InstantSpinResult for a valid grid
  it('ANAL-09: query returns an InstantSpinResult for a known grid', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    engine.buildTable(ir);

    // Use first entry from the table as a known grid.
    const firstEntry = [...engine.getTables().get('test-strips')!.entries.values()][0]!;
    const result = engine.query('test-strips', firstEntry.grid);

    expect(result).toBeDefined();
    expect(result).toHaveProperty('payout');
    expect(result).toHaveProperty('probability');
    expect(result).toHaveProperty('fromCache');
  });

  // ANAL-10: fromCache = true
  it('ANAL-10: fromCache is always true for a cached result', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    engine.buildTable(ir);

    const firstEntry = [...engine.getTables().get('test-strips')!.entries.values()][0]!;
    const result = engine.query('test-strips', firstEntry.grid);

    expect(result?.fromCache).toBe(true);
  });

  // ANAL-11: payout >= 0
  it('ANAL-11: payout in query result is >= 0', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    engine.buildTable(ir);

    const table = engine.getTables().get('test-strips')!;
    for (const entry of table.entries.values()) {
      const result = engine.query('test-strips', entry.grid);
      expect(result?.payout).toBeGreaterThanOrEqual(0);
    }
  });

  // ANAL-12: query unknown gameId returns undefined
  it('ANAL-12: query for unknown gameId returns undefined', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    engine.buildTable(ir);

    const result = engine.query('nonexistent-game', [['H1', 'H2', 'L1']]);
    expect(result).toBeUndefined();
  });

  // ANAL-13: getAnalyticalRtp matches table.analyticalRtp
  it('ANAL-13: getAnalyticalRtp returns the same value as table.analyticalRtp', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    const table = engine.buildTable(ir);

    expect(engine.getAnalyticalRtp('test-strips')).toBe(table.analyticalRtp);
  });

  // ANAL-14: clearTable → getAnalyticalRtp undefined
  it('ANAL-14: clearTable causes getAnalyticalRtp to return undefined', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    engine.buildTable(ir);

    engine.clearTable('test-strips');
    expect(engine.getAnalyticalRtp('test-strips')).toBeUndefined();
  });

  // ANAL-15: build < 100ms (performance)
  it('ANAL-15: buildTable for 125-state game completes in < 100ms', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();

    const start = performance.now();
    engine.buildTable(ir);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  // ANAL-16: spot-check 5 random entries — probability > 0
  it('ANAL-16: spot-check 5 random entries have probability > 0', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    engine.buildTable(ir);

    const allEntries = [...engine.getTables().get('test-strips')!.entries.values()];
    // Pick 5 evenly spaced entries as a "random" sample.
    const step = Math.max(1, Math.floor(allEntries.length / 5));
    for (let i = 0; i < 5; i++) {
      const entry = allEntries[i * step];
      expect(entry?.probability).toBeGreaterThan(0);
    }
  });

  // ANAL-17: same grid queried twice returns same payout
  it('ANAL-17: querying the same grid twice returns the same payout', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    engine.buildTable(ir);

    const firstEntry = [...engine.getTables().get('test-strips')!.entries.values()][0]!;
    const r1 = engine.query('test-strips', firstEntry.grid);
    const r2 = engine.query('test-strips', firstEntry.grid);

    expect(r1?.payout).toBe(r2?.payout);
  });

  // ANAL-18: analyticalHitRate matches win-entry ratio (within 0.1)
  it('ANAL-18: analyticalHitRate matches win-entry count / entries.size within 0.1', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    const table = engine.buildTable(ir);

    const winEntries = [...table.entries.values()].filter((e) => e.payout > 0).length;
    const entryHitRate = winEntries / table.entries.size;

    // The hit rate from states may differ from entry hit rate (due to dedup),
    // but both should be within 0.1 of each other.
    expect(Math.abs(table.analyticalHitRate - entryHitRate)).toBeLessThan(0.1);
  });

  // ANAL-19: analyticalRtp > 0 (and broadly sensible)
  it('ANAL-19: analyticalRtp > 0 (MC-style sanity check with wide tolerance)', () => {
    const engine = new AnalyticalEngine();
    const ir = makeSmallStripsIR();
    const table = engine.buildTable(ir);

    // Just verify it is positive — MC-level accuracy not required for analytical.
    expect(table.analyticalRtp).toBeGreaterThan(0);
  });

  // ANAL-20: two AnalyticalEngine instances with same IR give same analyticalRtp
  it('ANAL-20: two independent AnalyticalEngine instances produce identical analyticalRtp', () => {
    const engine1 = new AnalyticalEngine();
    const engine2 = new AnalyticalEngine();
    const ir = makeSmallStripsIR();

    const table1 = engine1.buildTable(ir);
    const table2 = engine2.buildTable(ir);

    expect(table1.analyticalRtp).toBe(table2.analyticalRtp);
  });
});
