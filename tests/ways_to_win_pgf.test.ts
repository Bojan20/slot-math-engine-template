/**
 * W152 Wave 23 — waysToWinPGF tests (Faza 6.7 + 12).
 */

import { describe, it, expect } from 'vitest';
import { pgfWaysContribution, pgfTotalRtp } from '../src/engine/waysToWinPGF.js';
import type { SlotGameIR } from '../src/ir/types.js';

function buildIR(opts: {
  reels: number;
  rows: number;
  paytable: Record<string, Record<string, number>>;
  reelMap?: Record<string, number>;
}): SlotGameIR {
  const reelMap = opts.reelMap ?? { A: 6, B: 4, H: 2 };
  return {
    schema_version: '1.0.0',
    meta: { id: 'g', name: 'G', version: '1.0.0', theme_tags: [] },
    topology: { kind: 'rectangular', reels: opts.reels, rows: opts.rows },
    symbols: [
      { id: 'A', name: 'A', kind: 'lp' },
      { id: 'B', name: 'B', kind: 'lp' },
      { id: 'H', name: 'H', kind: 'hp' },
    ],
    reels: {
      mode: 'weighted',
      base: Array.from({ length: opts.reels }, () => ({ ...reelMap })),
    },
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
      rtp_range_required: [0.85, 0.99],
      max_win_cap_required: 5000,
      near_miss_rule: 'must_be_random',
      ldw_disclosure: false,
      session_time_display: false,
    },
    rtp_allocation: { base_game: 1, free_spins: 0, hold_and_win: 0, jackpot: 0, tolerance: 0.01 },
  } as unknown as SlotGameIR;
}

describe('pgfWaysContribution — basic', () => {
  it('returns positive contribution for paying symbol', () => {
    const ir = buildIR({ reels: 5, rows: 3, paytable: { H: { '3': 5, '4': 25, '5': 100 } } });
    const c = pgfWaysContribution(ir, 'H', 2 / 12, 5, 3);
    expect(c.totalContribution).toBeGreaterThan(0);
    expect(c.perKindBreakdown).toHaveLength(3);
  });

  it('returns 0 for unknown symbol', () => {
    const ir = buildIR({ reels: 5, rows: 3, paytable: { H: { '3': 5 } } });
    const c = pgfWaysContribution(ir, 'UNKNOWN', 0.5, 5, 3);
    expect(c.totalContribution).toBe(0);
  });
});

describe('pgfWaysContribution — guards', () => {
  it('rejects perReelProbability out of [0, 1]', () => {
    const ir = buildIR({ reels: 5, rows: 3, paytable: { H: { '3': 5 } } });
    expect(() => pgfWaysContribution(ir, 'H', -0.1, 5, 3)).toThrow(RangeError);
    expect(() => pgfWaysContribution(ir, 'H', 1.5, 5, 3)).toThrow(RangeError);
  });

  it('rejects non-positive numReels', () => {
    const ir = buildIR({ reels: 5, rows: 3, paytable: { H: { '3': 5 } } });
    expect(() => pgfWaysContribution(ir, 'H', 0.5, 0, 3)).toThrow(RangeError);
    expect(() => pgfWaysContribution(ir, 'H', 0.5, 1.5, 3)).toThrow(RangeError);
  });

  it('rejects non-positive rowsPerReel', () => {
    const ir = buildIR({ reels: 5, rows: 3, paytable: { H: { '3': 5 } } });
    expect(() => pgfWaysContribution(ir, 'H', 0.5, 5, 0)).toThrow(RangeError);
  });
});

describe('pgfWaysContribution — math', () => {
  it('higher per-reel probability gives higher contribution', () => {
    const ir = buildIR({ reels: 5, rows: 3, paytable: { H: { '3': 5, '4': 25, '5': 100 } } });
    const lowP = pgfWaysContribution(ir, 'H', 0.1, 5, 3);
    const highP = pgfWaysContribution(ir, 'H', 0.5, 5, 3);
    expect(highP.totalContribution).toBeGreaterThan(lowP.totalContribution);
  });

  it('rows=1 gives same as binomial single-stop', () => {
    const ir = buildIR({ reels: 3, rows: 1, paytable: { H: { '3': 10 } } });
    const c = pgfWaysContribution(ir, 'H', 0.5, 3, 1);
    // For rows=1, each reel either has the symbol (p=0.5) or not.
    // Trigger on each = 0.5. P(all 3 trigger) = 0.5^3 = 0.125
    // E[ways] = 1 (single match per reel)
    // Contribution = 10 × 0.125 × 1 = 1.25
    expect(c.totalContribution).toBeCloseTo(1.25, 6);
  });

  it('higher rows → higher contribution (more match opportunities)', () => {
    const ir = buildIR({ reels: 5, rows: 3, paytable: { H: { '3': 5, '4': 25, '5': 100 } } });
    const rows1 = pgfWaysContribution(ir, 'H', 0.2, 5, 1);
    const rows4 = pgfWaysContribution(ir, 'H', 0.2, 5, 4);
    expect(rows4.totalContribution).toBeGreaterThan(rows1.totalContribution);
  });
});

describe('pgfTotalRtp', () => {
  it('sums contributions across paying symbols', () => {
    const ir = buildIR({
      reels: 5,
      rows: 3,
      paytable: { H: { '3': 5, '4': 25, '5': 100 }, B: { '3': 1 } },
    });
    const total = pgfTotalRtp(ir, 5, 3);
    expect(total).toBeGreaterThan(0);
  });

  it('skips wild + scatter symbols', () => {
    const ir: SlotGameIR = {
      schema_version: '1.0.0',
      meta: { id: 'g', name: 'G', version: '1.0.0', theme_tags: [] },
      topology: { kind: 'rectangular', reels: 5, rows: 3 },
      symbols: [
        { id: 'H', name: 'H', kind: 'hp' },
        { id: 'W', name: 'W', kind: 'wild', substitutes: '*' },
      ],
      reels: { mode: 'weighted', base: Array.from({ length: 5 }, () => ({ H: 2, W: 1 })) },
      paytable: { H: { '3': 5 }, W: { '3': 100 } }, // Wild with payout — should be skipped
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
        rtp_range_required: [0.85, 0.99],
        max_win_cap_required: 5000,
        near_miss_rule: 'must_be_random',
        ldw_disclosure: false,
        session_time_display: false,
      },
      rtp_allocation: { base_game: 1, free_spins: 0, hold_and_win: 0, jackpot: 0, tolerance: 0.01 },
    } as unknown as SlotGameIR;
    const total = pgfTotalRtp(ir, 5, 3);
    // Only H contributes (wild ignored), p_H = 2/3
    const onlyH = pgfWaysContribution(ir, 'H', 2 / 3, 5, 3);
    expect(total).toBeCloseTo(onlyH.totalContribution, 6);
  });

  it('returns 0 for non-weighted reels', () => {
    const ir = buildIR({ reels: 5, rows: 3, paytable: { H: { '3': 5 } } });
    (ir as unknown as { reels: { mode: string } }).reels = { mode: 'strips', base: [['H', 'A']] };
    expect(pgfTotalRtp(ir, 5, 3)).toBe(0);
  });
});

describe('pgfWaysContribution — perKindBreakdown', () => {
  it('contains entries for all paytable kinds', () => {
    const ir = buildIR({ reels: 5, rows: 3, paytable: { H: { '3': 5, '4': 25, '5': 100 } } });
    const c = pgfWaysContribution(ir, 'H', 0.2, 5, 3);
    expect(c.perKindBreakdown.map((b) => b.k).sort()).toEqual([3, 4, 5]);
  });

  it('contribution equals payout × triggerProbability × expectedWays', () => {
    const ir = buildIR({ reels: 5, rows: 3, paytable: { H: { '3': 5 } } });
    const c = pgfWaysContribution(ir, 'H', 0.2, 5, 3);
    const breakdown = c.perKindBreakdown[0];
    expect(breakdown.contribution).toBeCloseTo(
      breakdown.payout * breakdown.triggerProbability * breakdown.expectedWays,
      9,
    );
  });
});
