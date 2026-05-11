/**
 * IR-native evaluator — Faza 2 acceptance gates.
 *
 * Known-answer tests (KAT) for every dispatch path. Each case builds a
 * minimal IR fixture inline, fixes the grid, and asserts the exact win /
 * trigger output. Anything that fails here is a real bug.
 */

import { describe, it, expect } from 'vitest';
import type { SlotGameIR } from '../src/ir/types.js';
import { evaluateIR } from '../src/engine/irEvaluator.js';

// ─── Fixture builder helpers ──────────────────────────────────────────────

function baseIR(): SlotGameIR {
  return {
    schema_version: '1.0.0',
    meta: {
      id: 'kat',
      name: 'KAT',
      version: '1.0.0',
      theme_tags: ['test'],
    },
    topology: { kind: 'rectangular', reels: 5, rows: 3 },
    symbols: [
      { id: 'S_LP1', name: 'LP1', kind: 'lp' },
      { id: 'S_LP2', name: 'LP2', kind: 'lp' },
      { id: 'S_LP3', name: 'LP3', kind: 'lp' },
      { id: 'S_HP1', name: 'HP1', kind: 'hp' },
      { id: 'S_HP2', name: 'HP2', kind: 'hp' },
      { id: 'S_WILD', name: 'Wild', kind: 'wild', substitutes: '*' },
      { id: 'S_SCAT', name: 'Scat', kind: 'scatter' },
      { id: 'S_BONUS', name: 'Bonus', kind: 'bonus' },
    ],
    reels: {
      mode: 'weighted',
      base: Array.from({ length: 5 }, () => ({
        S_LP1: 8,
        S_LP2: 7,
        S_LP3: 6,
        S_HP1: 2,
        S_HP2: 3,
        S_WILD: 1,
        S_SCAT: 1,
        S_BONUS: 1,
      })),
    },
    evaluation: {
      kind: 'lines',
      paylines: [
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 0],
        [2, 2, 2, 2, 2],
      ],
      direction: 'ltr',
      min_match: 3,
      pay_left_to_right_only: true,
    },
    paytable: {
      S_LP1: { '3': 0.5, '4': 2, '5': 8 },
      S_LP2: { '3': 0.6, '4': 2.5, '5': 10 },
      S_LP3: { '3': 0.8, '4': 3, '5': 12 },
      S_HP1: { '3': 3, '4': 12, '5': 63 },
      S_HP2: { '3': 2.2, '4': 8.8, '5': 44 },
      S_SCAT: { '3': 2, '4': 5, '5': 20 },
    },
    features: [
      {
        kind: 'free_spins',
        trigger: { by: 'scatter_count', thresholds: { '3': 8, '4': 12, '5': 15 } },
        global_multiplier: 1,
      },
      {
        kind: 'hold_and_win',
        trigger: { by: 'bonus_count', min: 6 },
        respins_initial: 3,
        respin_reset_on_new: true,
        cash_value_distribution: [{ value: 1, weight: 1 }],
        jackpot_tiers: [{ id: 'GRAND', multiplier: 100 }],
      },
    ],
    rng: { kind: 'mulberry32', default_seed: 12345 },
    bet: { currency: 'EUR', base_bet: 1, denominations: [1] },
    limits: {
      target_rtp: 0.96,
      rtp_tolerance: 0.005,
      max_win_x: 5000,
      win_cap_apply: 'per_spin',
      target_volatility: 'high',
      hit_freq_target: 0.3,
    },
    compliance: {
      jurisdictions: ['UKGC'],
      rtp_range_required: [0.9, 0.97],
      max_win_cap_required: 10000,
      near_miss_rule: 'must_be_random',
      ldw_disclosure: true,
      session_time_display: true,
    },
    rtp_allocation: {
      base_game: 0.96,
      free_spins: 0,
      hold_and_win: 0,
      jackpot: 0,
      tolerance: 0.01,
    },
  };
}

// ─── Lines KAT ────────────────────────────────────────────────────────────

describe('Lines KAT', () => {
  it('S_HP1 × 5 on middle row pays 63', () => {
    const ir = baseIR();
    // grid[row][col]. Middle row (row=1) is all HP1.
    const grid = [
      ['S_LP1', 'S_LP1', 'S_LP1', 'S_LP1', 'S_LP1'],
      ['S_HP1', 'S_HP1', 'S_HP1', 'S_HP1', 'S_HP1'],
      ['S_LP2', 'S_LP2', 'S_LP2', 'S_LP2', 'S_LP2'],
    ];
    const r = evaluateIR(ir, grid);
    expect(r.evalMode).toBe('lines');
    // Top row pays S_LP1 × 5 = 8, middle pays S_HP1 × 5 = 63, bottom pays S_LP2 × 5 = 10.
    expect(r.totalPayout).toBeCloseTo(8 + 63 + 10, 6);
    // Middle-row win exists for HP1 × 5.
    expect(r.wins.find((w) => w.symbolId === 'S_HP1' && w.count === 5)).toBeDefined();
  });

  it('S_HP1 × 3 on middle row pays 3', () => {
    const ir = baseIR();
    // Only first three columns have HP1 on middle row.
    // paylines[0] = [1,1,1,1,1] → middle row → paylineIndex 0.
    const grid = [
      ['S_HP1', 'S_LP1', 'S_LP2', 'S_LP3', 'S_HP2'],
      ['S_HP1', 'S_HP1', 'S_HP1', 'S_LP1', 'S_LP3'],
      ['S_HP1', 'S_LP1', 'S_WILD', 'S_SCAT', 'S_LP3'],
    ];
    const r = evaluateIR(ir, grid);
    // Middle row HP1 × 3 = 3.
    const middleWin = r.wins.find(
      (w) => w.symbolId === 'S_HP1' && w.paylineIndex === 0,
    );
    expect(middleWin).toBeDefined();
    expect(middleWin?.count).toBe(3);
    expect(middleWin?.payout).toBeCloseTo(3, 6);
  });
});

// ─── Wild substitution KAT ────────────────────────────────────────────────

describe('Wild substitution KAT', () => {
  it('[WILD, HP1, HP1, LP1, LP1] takes best of HP1×3 or all-wild line', () => {
    const ir = baseIR();
    // paylines[0] = [1,1,1,1,1] (middle row, id=0).
    const grid = [
      ['S_LP3', 'S_LP3', 'S_LP3', 'S_LP3', 'S_LP3'],
      ['S_WILD', 'S_HP1', 'S_HP1', 'S_LP1', 'S_LP1'],
      ['S_LP3', 'S_LP3', 'S_LP3', 'S_LP3', 'S_LP3'],
    ];
    const r = evaluateIR(ir, grid);
    const win = r.wins.find((w) => w.paylineIndex === 0);
    expect(win).toBeDefined();
    expect(win?.symbolId).toBe('S_HP1');
    expect(win?.count).toBe(3); // WILD + HP1 + HP1 → HP1 × 3
    expect(win?.payout).toBeCloseTo(3, 6); // S_HP1 pay3 = 3
  });

  it('[HP1, HP1, HP1, HP1, HP1] pays HP1 × 5 = 63', () => {
    const ir = baseIR();
    // paylines[0] = [1,1,1,1,1] (middle row, id=0).
    const grid = [
      ['S_LP1', 'S_LP1', 'S_LP1', 'S_LP1', 'S_LP1'],
      ['S_HP1', 'S_HP1', 'S_HP1', 'S_HP1', 'S_HP1'],
      ['S_LP1', 'S_LP1', 'S_LP1', 'S_LP1', 'S_LP1'],
    ];
    const r = evaluateIR(ir, grid);
    const midWin = r.wins.find((w) => w.paylineIndex === 0);
    expect(midWin?.symbolId).toBe('S_HP1');
    expect(midWin?.count).toBe(5);
    expect(midWin?.payout).toBeCloseTo(63, 6);
  });
});

// ─── Ways KAT ─────────────────────────────────────────────────────────────

describe('Ways KAT', () => {
  it('243 ways: 1×1×1 = 1 way × HP1 × 3', () => {
    const ir = baseIR();
    ir.evaluation = {
      kind: 'ways',
      direction: 'ltr',
      min_match: 3,
      max_ways_per_spin: 1000,
    };
    // One HP1 per reel on first three reels, then breaks.
    const grid = [
      ['S_HP1', 'S_HP1', 'S_HP1', 'S_LP3', 'S_LP3'],
      ['S_LP2', 'S_LP2', 'S_LP2', 'S_LP3', 'S_LP3'],
      ['S_LP3', 'S_LP3', 'S_LP3', 'S_LP3', 'S_LP3'],
    ];
    const r = evaluateIR(ir, grid);
    expect(r.evalMode).toBe('ways');
    const hpWin = r.wins.find((w) => w.symbolId === 'S_HP1');
    expect(hpWin).toBeDefined();
    expect(hpWin?.count).toBe(3);
    // 1 × 1 × 1 = 1 way × pay3 (3) = 3.
    expect(hpWin?.payout).toBeCloseTo(3, 6);
  });

  it('243 ways with HP1 stacked × 2 on reel 0 → 2 ways', () => {
    const ir = baseIR();
    ir.evaluation = {
      kind: 'ways',
      direction: 'ltr',
      min_match: 3,
      max_ways_per_spin: 1000,
    };
    // Reel 0 has 2 HP1 (rows 0 and 1), reels 1-2 have 1 HP1 each.
    const grid = [
      ['S_HP1', 'S_HP1', 'S_HP1', 'S_LP3', 'S_LP3'],
      ['S_HP1', 'S_LP2', 'S_LP2', 'S_LP3', 'S_LP3'],
      ['S_LP3', 'S_LP3', 'S_LP3', 'S_LP3', 'S_LP3'],
    ];
    const r = evaluateIR(ir, grid);
    const hpWin = r.wins.find((w) => w.symbolId === 'S_HP1');
    expect(hpWin).toBeDefined();
    expect(hpWin?.count).toBe(3);
    // 2 × 1 × 1 = 2 ways × pay3 (3) = 6.
    expect(hpWin?.payout).toBeCloseTo(6, 6);
  });
});

// ─── Cluster KAT ──────────────────────────────────────────────────────────

describe('Cluster KAT', () => {
  it('6 connected S_LP1 cluster pays cluster_pay_table[6]', () => {
    const ir = baseIR();
    ir.topology = { kind: 'cluster_grid', columns: 6, rows: 5, adjacency: 'orthogonal' };
    ir.evaluation = {
      kind: 'cluster',
      min_cluster_size: 5,
      cluster_pay_table: { '5': 1, '6': 2, '7': 4 },
    };
    // Per-symbol cluster paytable lives in `paytable[sym][size]` for the
    // legacy evaluator; the IR's top-level cluster_pay_table is a fallback
    // for when symbols don't define their own. We give S_LP1 size→pay here.
    ir.paytable = {
      S_LP1: { '5': 1, '6': 2, '7': 4 },
    };
    // 6x5 grid with an orthogonal cluster of 6 LP1s in column 0 + bottom of column 1.
    // Layout (rows[row=0..4][col=0..5]):
    //   LP1 X X X X X
    //   LP1 X X X X X
    //   LP1 X X X X X
    //   LP1 X X X X X
    //   LP1 LP1 X X X X
    const grid = [
      ['S_LP1', 'S_LP2', 'S_LP2', 'S_LP2', 'S_LP2', 'S_LP2'],
      ['S_LP1', 'S_LP2', 'S_LP2', 'S_LP2', 'S_LP2', 'S_LP2'],
      ['S_LP1', 'S_LP2', 'S_LP2', 'S_LP2', 'S_LP2', 'S_LP2'],
      ['S_LP1', 'S_LP2', 'S_LP2', 'S_LP2', 'S_LP2', 'S_LP2'],
      ['S_LP1', 'S_LP1', 'S_LP2', 'S_LP2', 'S_LP2', 'S_LP2'],
    ];
    const r = evaluateIR(ir, grid);
    expect(r.evalMode).toBe('cluster');
    const win = r.wins.find((w) => w.symbolId === 'S_LP1');
    expect(win).toBeDefined();
    expect(win?.count).toBe(6);
    expect(win?.payout).toBeCloseTo(2, 6);
  });
});

// ─── PayAnywhere KAT ──────────────────────────────────────────────────────

describe('PayAnywhere KAT', () => {
  it('4 scatters pay paytable[SCAT][4]', () => {
    const ir = baseIR();
    ir.evaluation = { kind: 'pay_anywhere', min_count: 3 };
    // 4 scatters scattered around the grid.
    const grid = [
      ['S_SCAT', 'S_LP1', 'S_LP1', 'S_SCAT', 'S_LP1'],
      ['S_LP2', 'S_LP2', 'S_LP2', 'S_LP2', 'S_LP2'],
      ['S_LP3', 'S_SCAT', 'S_LP3', 'S_LP3', 'S_SCAT'],
    ];
    const r = evaluateIR(ir, grid);
    expect(r.evalMode).toBe('pay_anywhere');
    // 4 scatters → paytable["S_SCAT"]["4"] = 5
    const scatWin = r.wins.find((w) => w.symbolId === 'S_SCAT');
    expect(scatWin).toBeDefined();
    expect(scatWin?.count).toBe(4);
    expect(scatWin?.payout).toBeCloseTo(5, 6);
  });

  it('2 scatters → no pay (below min_count=3)', () => {
    const ir = baseIR();
    ir.evaluation = { kind: 'pay_anywhere', min_count: 3 };
    const grid = [
      ['S_SCAT', 'S_LP1', 'S_LP1', 'S_LP1', 'S_LP1'],
      ['S_LP2', 'S_LP2', 'S_LP2', 'S_LP2', 'S_LP2'],
      ['S_LP3', 'S_SCAT', 'S_LP3', 'S_LP3', 'S_LP3'],
    ];
    const r = evaluateIR(ir, grid);
    const scatWin = r.wins.find((w) => w.symbolId === 'S_SCAT');
    expect(scatWin).toBeUndefined();
  });
});

// ─── Pattern KAT ──────────────────────────────────────────────────────────

describe('Pattern KAT', () => {
  it('explicit positions match HP1 → payout = pay_multiplier', () => {
    const ir = baseIR();
    ir.evaluation = {
      kind: 'pattern',
      patterns: [
        {
          id: 'diag',
          positions: [
            [0, 0],
            [1, 1],
            [2, 2],
          ],
          pay_multiplier: 5,
        },
      ],
    };
    const grid = [
      ['S_HP1', 'S_LP1', 'S_LP1', 'S_LP1', 'S_LP1'],
      ['S_LP2', 'S_HP1', 'S_LP2', 'S_LP2', 'S_LP2'],
      ['S_LP3', 'S_LP3', 'S_HP1', 'S_LP3', 'S_LP3'],
    ];
    const r = evaluateIR(ir, grid);
    expect(r.evalMode).toBe('pattern');
    expect(r.wins.length).toBe(1);
    expect(r.wins[0]?.symbolId).toBe('S_HP1');
    expect(r.wins[0]?.payout).toBeCloseTo(5, 6);
  });

  it('mismatched diagonal → no win', () => {
    const ir = baseIR();
    ir.evaluation = {
      kind: 'pattern',
      patterns: [
        {
          id: 'diag',
          positions: [
            [0, 0],
            [1, 1],
            [2, 2],
          ],
          pay_multiplier: 5,
        },
      ],
    };
    const grid = [
      ['S_HP1', 'S_LP1', 'S_LP1', 'S_LP1', 'S_LP1'],
      ['S_LP2', 'S_LP2', 'S_LP2', 'S_LP2', 'S_LP2'],
      ['S_LP3', 'S_LP3', 'S_HP1', 'S_LP3', 'S_LP3'],
    ];
    const r = evaluateIR(ir, grid);
    expect(r.wins.length).toBe(0);
  });
});

// ─── Trigger detection KAT ────────────────────────────────────────────────

describe('Trigger detection KAT', () => {
  it('3 scatters fires free_spins trigger', () => {
    const ir = baseIR();
    const grid = [
      ['S_SCAT', 'S_LP1', 'S_LP1', 'S_LP1', 'S_LP1'],
      ['S_LP2', 'S_SCAT', 'S_LP2', 'S_LP2', 'S_LP2'],
      ['S_LP3', 'S_LP3', 'S_SCAT', 'S_LP3', 'S_LP3'],
    ];
    const r = evaluateIR(ir, grid);
    expect(r.scatterCount).toBe(3);
    expect(r.triggeredFeatures).toContain('free_spins');
  });

  it('2 scatters does NOT fire free_spins', () => {
    const ir = baseIR();
    const grid = [
      ['S_SCAT', 'S_LP1', 'S_LP1', 'S_LP1', 'S_LP1'],
      ['S_LP2', 'S_SCAT', 'S_LP2', 'S_LP2', 'S_LP2'],
      ['S_LP3', 'S_LP3', 'S_LP3', 'S_LP3', 'S_LP3'],
    ];
    const r = evaluateIR(ir, grid);
    expect(r.scatterCount).toBe(2);
    expect(r.triggeredFeatures).not.toContain('free_spins');
  });

  it('6 bonus symbols fires hold_and_win trigger', () => {
    const ir = baseIR();
    const grid = [
      ['S_BONUS', 'S_BONUS', 'S_BONUS', 'S_LP1', 'S_LP1'],
      ['S_BONUS', 'S_BONUS', 'S_BONUS', 'S_LP2', 'S_LP2'],
      ['S_LP3', 'S_LP3', 'S_LP3', 'S_LP3', 'S_LP3'],
    ];
    const r = evaluateIR(ir, grid);
    expect(r.bonusCount).toBe(6);
    expect(r.triggeredFeatures).toContain('hold_and_win');
  });
});
