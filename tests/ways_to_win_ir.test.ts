/**
 * W152 Wave 19 — IR-native ways-to-win evaluator tests (Faza 15.B.1).
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateWaysToWin,
  closedFormWaysContribution,
  MAX_WAYS_PER_SYMBOL,
} from '../src/engine/waysToWinIR.js';
import type { SlotGameIR } from '../src/ir/types.js';

function buildIR(opts: {
  reels: number;
  rows: number;
  paytable: Record<string, Record<string, number>>;
  symbols?: Array<{ id: string; kind: 'lp' | 'hp' | 'wild'; substitutes?: string[] | '*' }>;
}): SlotGameIR {
  const symbols = opts.symbols ?? [
    { id: 'A', kind: 'lp' },
    { id: 'B', kind: 'lp' },
    { id: 'W', kind: 'wild', substitutes: '*' },
  ];
  return {
    schema_version: '1.0.0',
    meta: { id: 'g', name: 'G', version: '1.0.0', theme_tags: [] },
    topology: { kind: 'rectangular', reels: opts.reels, rows: opts.rows },
    symbols: symbols.map((s) => ({ id: s.id, name: s.id, kind: s.kind, substitutes: s.substitutes })),
    reels: { mode: 'weighted', base: Array.from({ length: opts.reels }, () => ({ A: 1 })) },
    paytable: opts.paytable,
    evaluation: { kind: 'ways', direction: 'ltr' },
    features: [],
    rng: { kind: 'pcg64', default_seed: 1 },
    bet: { currency: 'EUR', base_bet: 1, denominations: [1] },
    limits: {
      target_rtp: 0.96,
      rtp_tolerance: 0.01,
      max_win_x: 5000,
      win_cap_apply: 'per_spin',
      target_volatility: 'medium',
      hit_freq_target: 0.3,
    },
    compliance: {
      jurisdictions: ['MGA'],
      rtp_range_required: [0.92, 0.99],
      max_win_cap_required: 5000,
      near_miss_rule: 'must_be_random',
      ldw_disclosure: false,
      session_time_display: false,
    },
    rtp_allocation: { base_game: 1, free_spins: 0, hold_and_win: 0, jackpot: 0, tolerance: 0.01 },
  } as unknown as SlotGameIR;
}

describe('evaluateWaysToWin — basic match', () => {
  it('detects 3-of-a-kind on uniform window', () => {
    const ir = buildIR({ reels: 3, rows: 1, paytable: { A: { '3': 5 } } });
    const result = evaluateWaysToWin(ir, {
      symbols: [['A'], ['A'], ['A']],
    });
    expect(result.wins).toHaveLength(1);
    expect(result.wins[0].matchLength).toBe(3);
    expect(result.wins[0].ways).toBe(1);
    expect(result.wins[0].payoutX).toBe(5);
    expect(result.totalPayoutX).toBe(5);
  });
  it('multiplies ways across reels', () => {
    // 3-reel × 2-row, all A → 2 × 2 × 2 = 8 ways for 3-of-A
    const ir = buildIR({ reels: 3, rows: 2, paytable: { A: { '3': 5 } } });
    const result = evaluateWaysToWin(ir, {
      symbols: [
        ['A', 'A'],
        ['A', 'A'],
        ['A', 'A'],
      ],
    });
    expect(result.wins[0].ways).toBe(8);
    expect(result.wins[0].payoutX).toBe(40);
  });
  it('stops counting on first non-matching reel', () => {
    const ir = buildIR({ reels: 4, rows: 1, paytable: { A: { '2': 1, '3': 5, '4': 25 } } });
    const result = evaluateWaysToWin(ir, {
      symbols: [['A'], ['A'], ['A'], ['B']],
    });
    expect(result.wins[0].matchLength).toBe(3);
    expect(result.wins[0].payoutX).toBe(5);
  });
  it('wild substitutes for paying symbol', () => {
    const ir = buildIR({
      reels: 3,
      rows: 1,
      paytable: { A: { '3': 5 } },
      symbols: [
        { id: 'A', kind: 'lp' },
        { id: 'W', kind: 'wild', substitutes: '*' },
      ],
    });
    const result = evaluateWaysToWin(ir, { symbols: [['A'], ['W'], ['A']] });
    expect(result.wins[0].matchLength).toBe(3);
  });
  it('wild does NOT pay standalone (anchor only)', () => {
    const ir = buildIR({
      reels: 3,
      rows: 1,
      paytable: { W: { '3': 100 } },
      symbols: [{ id: 'W', kind: 'wild', substitutes: '*' }],
    });
    const result = evaluateWaysToWin(ir, { symbols: [['W'], ['W'], ['W']] });
    expect(result.wins).toHaveLength(0);
  });
  it('returns no wins on empty paytable match', () => {
    const ir = buildIR({ reels: 3, rows: 1, paytable: {} });
    const result = evaluateWaysToWin(ir, { symbols: [['A'], ['A'], ['A']] });
    expect(result.wins).toHaveLength(0);
    expect(result.totalPayoutX).toBe(0);
  });
});

describe('evaluateWaysToWin — guards', () => {
  it('rejects empty window', () => {
    const ir = buildIR({ reels: 0, rows: 0, paytable: {} });
    expect(() => evaluateWaysToWin(ir, { symbols: [] })).toThrow(/empty window/);
  });
  it('rejects unknown symbol on reel 0', () => {
    const ir = buildIR({ reels: 1, rows: 1, paytable: {} });
    expect(() => evaluateWaysToWin(ir, { symbols: [['UNKNOWN']] })).toThrow(/not present/);
  });
  it('rejects ways > MAX_WAYS_PER_SYMBOL', () => {
    // Build a config that would explode: 7 reels × 7 rows = 7^7 = 823_543 > 200_000
    const symbols = [{ id: 'A', kind: 'lp' as const }];
    const ir: SlotGameIR = {
      schema_version: '1.0.0',
      meta: { id: 'g', name: 'G', version: '1.0.0', theme_tags: [] },
      topology: { kind: 'rectangular', reels: 7, rows: 7 },
      symbols: symbols.map((s) => ({ id: s.id, name: s.id, kind: s.kind })),
      reels: { mode: 'weighted', base: Array.from({ length: 7 }, () => ({ A: 1 })) },
      paytable: { A: { '7': 1 } },
      evaluation: { kind: 'ways', direction: 'ltr' },
      features: [],
      rng: { kind: 'pcg64', default_seed: 1 },
      bet: { currency: 'EUR', base_bet: 1, denominations: [1] },
      limits: {
        target_rtp: 0.96,
        rtp_tolerance: 0.01,
        max_win_x: 5000,
        win_cap_apply: 'per_spin',
        target_volatility: 'medium',
        hit_freq_target: 0.3,
      },
      compliance: {
        jurisdictions: ['MGA'],
        rtp_range_required: [0.92, 0.99],
        max_win_cap_required: 5000,
        near_miss_rule: 'must_be_random',
        ldw_disclosure: false,
        session_time_display: false,
      },
      rtp_allocation: { base_game: 1, free_spins: 0, hold_and_win: 0, jackpot: 0, tolerance: 0.01 },
    } as unknown as SlotGameIR;
    const symRow: string[] = ['A', 'A', 'A', 'A', 'A', 'A', 'A'];
    expect(() =>
      evaluateWaysToWin(ir, { symbols: [symRow, symRow, symRow, symRow, symRow, symRow, symRow] }),
    ).toThrow(/exceeds MAX_WAYS_PER_SYMBOL/);
    expect(MAX_WAYS_PER_SYMBOL).toBe(200_000);
  });
});

describe('closedFormWaysContribution', () => {
  it('matches uniform-strip analytical for 3-reel 1-row', () => {
    const ir = buildIR({ reels: 3, rows: 1, paytable: { A: { '3': 10 } } });
    // p_A = 0.5 → P(3-of-A) = 0.5^3 = 0.125 → contribution = 10 × 1 × 0.125 × 1 = 1.25
    const c = closedFormWaysContribution(ir, 'A', 0.5, 3);
    expect(c).toBeCloseTo(1.25, 9);
  });
  it('rejects out-of-range probability', () => {
    const ir = buildIR({ reels: 3, rows: 1, paytable: { A: { '3': 10 } } });
    expect(() => closedFormWaysContribution(ir, 'A', -0.1, 3)).toThrow(RangeError);
    expect(() => closedFormWaysContribution(ir, 'A', 1.5, 3)).toThrow(RangeError);
  });
  it('rejects non-positive numReels', () => {
    const ir = buildIR({ reels: 1, rows: 1, paytable: { A: { '1': 1 } } });
    expect(() => closedFormWaysContribution(ir, 'A', 0.5, 0)).toThrow(RangeError);
  });
  it('returns 0 for unknown symbol', () => {
    const ir = buildIR({ reels: 3, rows: 1, paytable: { A: { '3': 10 } } });
    expect(closedFormWaysContribution(ir, 'UNKNOWN', 0.5, 3)).toBe(0);
  });
});
