/**
 * W152 Wave 19 — IR-native cluster evaluator tests (Faza 15.B.2).
 */

import { describe, it, expect } from 'vitest';
import { evaluateCluster } from '../src/engine/clusterIR.js';
import type { SlotGameIR } from '../src/ir/types.js';

function buildIR(opts: {
  cols: number;
  rows: number;
  adjacency?: 'orthogonal' | 'diagonal' | 'hex';
  paytable: Record<string, Record<string, number>>;
  symbols?: Array<{ id: string; kind: 'lp' | 'wild' }>;
}): SlotGameIR {
  const symbols = opts.symbols ?? [
    { id: 'A', kind: 'lp' },
    { id: 'B', kind: 'lp' },
    { id: 'W', kind: 'wild' },
  ];
  return {
    schema_version: '1.0.0',
    meta: { id: 'g', name: 'G', version: '1.0.0', theme_tags: [] },
    topology: { kind: 'cluster_grid', columns: opts.cols, rows: opts.rows, adjacency: opts.adjacency ?? 'orthogonal' },
    symbols: symbols.map((s) => ({
      id: s.id,
      name: s.id,
      kind: s.kind,
      substitutes: s.kind === 'wild' ? '*' : undefined,
    })),
    reels: { mode: 'weighted', base: [{ A: 1 }] },
    paytable: opts.paytable,
    evaluation: { kind: 'cluster', min_count: 5 },
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

describe('evaluateCluster — orthogonal', () => {
  it('detects 5-cell L-shape cluster', () => {
    const ir = buildIR({ cols: 3, rows: 3, paytable: { A: { '5': 10 } } });
    // 5 A's in L-shape: top row + leftmost column
    const grid = {
      symbols: [
        ['A', 'A', 'A'], // col 0 (3 As)
        ['A', 'B', 'B'], // col 1 (1 A at row 0)
        ['A', 'B', 'B'], // col 2 (1 A at row 0)
      ],
    };
    const result = evaluateCluster(ir, grid);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].size).toBe(5);
    expect(result.clusters[0].payoutX).toBe(10);
  });
  it('rejects clusters smaller than minSize', () => {
    const ir = buildIR({ cols: 3, rows: 3, paytable: { A: { '4': 5, '5': 10 } } });
    const grid = {
      symbols: [
        ['A', 'A', 'B'],
        ['A', 'B', 'B'],
        ['B', 'B', 'B'],
      ],
    };
    const result = evaluateCluster(ir, grid, { minClusterSize: 5 });
    expect(result.clusters).toHaveLength(0);
  });
  it('multiple disjoint clusters', () => {
    const ir = buildIR({ cols: 3, rows: 3, paytable: { A: { '3': 5 }, B: { '3': 8 } } });
    const grid = {
      symbols: [
        ['A', 'A', 'A'],
        ['C', 'C', 'C'],
        ['B', 'B', 'B'],
      ],
    };
    const result = evaluateCluster(ir, grid, { minClusterSize: 3 });
    expect(result.clusters).toHaveLength(2);
    expect(result.totalPayoutX).toBe(13);
  });
  it('wild merges adjacent clusters', () => {
    const ir = buildIR({ cols: 3, rows: 1, paytable: { A: { '5': 10 } } });
    // A-A-W-A-A would form a 5-cluster across the wild bridge
    const grid = {
      symbols: [['A'], ['A'], ['W'], ['A'], ['A']],
    };
    const ir5 = buildIR({ cols: 5, rows: 1, paytable: { A: { '5': 10 } } });
    const result = evaluateCluster(ir5, grid, { minClusterSize: 5 });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].size).toBe(5);
  });
});

describe('evaluateCluster — diagonal', () => {
  it('connects cells across diagonals', () => {
    const ir = buildIR({ cols: 3, rows: 3, adjacency: 'diagonal', paytable: { A: { '5': 10 } } });
    // Diagonal A's would only be 3, but with diagonal adjacency every
    // 5+ A blob counts. Build a config where orth would be 4 but diag is 5.
    const grid = {
      symbols: [
        ['A', 'B', 'A'],
        ['B', 'A', 'B'],
        ['A', 'B', 'A'],
      ],
    };
    const result = evaluateCluster(ir, grid, { minClusterSize: 5 });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].size).toBe(5);
  });
});

describe('evaluateCluster — hex', () => {
  it('respects 6-way hex adjacency', () => {
    const ir = buildIR({ cols: 3, rows: 3, adjacency: 'hex', paytable: { A: { '5': 10, '6': 20 } } });
    const grid = {
      symbols: [
        ['A', 'A', 'A'],
        ['A', 'A', 'A'],
        ['A', 'A', 'A'],
      ],
    };
    const result = evaluateCluster(ir, grid, { minClusterSize: 5 });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].size).toBe(9);
  });
});

describe('evaluateCluster — guards', () => {
  it('rejects empty grid', () => {
    const ir = buildIR({ cols: 3, rows: 3, paytable: {} });
    expect(() => evaluateCluster(ir, { symbols: [] })).toThrow(/empty grid/);
  });
  it('rejects ragged grid', () => {
    const ir = buildIR({ cols: 2, rows: 2, paytable: {} });
    expect(() =>
      evaluateCluster(ir, { symbols: [['A', 'A'], ['A']] }),
    ).toThrow(/has \d+ rows but/);
  });
});

describe('evaluateCluster — payout fallback', () => {
  it('falls back to largest declared size', () => {
    const ir = buildIR({ cols: 4, rows: 4, paytable: { A: { '5': 10, '7': 25 } } });
    // Build a 8-cell cluster
    const grid = {
      symbols: [
        ['A', 'A', 'A', 'A'],
        ['A', 'A', 'A', 'A'],
        ['B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B'],
      ],
    };
    const result = evaluateCluster(ir, grid, { minClusterSize: 5 });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].size).toBe(8);
    expect(result.clusters[0].payoutX).toBe(25); // falls back to "7"
  });
});
