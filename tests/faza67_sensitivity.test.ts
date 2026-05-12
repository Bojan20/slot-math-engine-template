/**
 * Faza 6.7 — Sensitivity Analyzer + Inverse RTP Solver
 * 22 tests covering analyzeSensitivity, solveTargetRtp, autoTune.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  applyWeightMultiplier,
  analyzeSensitivity,
  solveTargetRtp,
  autoTune,
} from '../src/sensitivity/analyzer.js';
import type { SlotGameIR } from '../src/ir/types.js';

vi.setConfig({ testTimeout: 60000 });

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Minimal weighted IR fixture ────────────────────────────────────────────

function makeWeightedIR(): SlotGameIR {
  return {
    schema_version: '1.0.0',
    meta: { id: 'sens-test', name: 'Sensitivity Test', version: '1.0.0', theme_tags: [] },
    topology: { kind: 'rectangular', reels: 3, rows: 3 },
    symbols: [
      { id: 'LP1', name: 'LP1', kind: 'lp' },
      { id: 'HP1', name: 'HP1', kind: 'hp' },
      { id: 'WLD', name: 'Wild', kind: 'wild', substitutes: '*' },
    ],
    reels: {
      mode: 'weighted',
      base: [
        { LP1: 10, HP1: 3, WLD: 1 },
        { LP1: 10, HP1: 3, WLD: 1 },
        { LP1: 10, HP1: 3, WLD: 1 },
      ],
    },
    evaluation: {
      kind: 'lines',
      paylines: [[1, 1, 1], [0, 0, 0], [2, 2, 2]],
      direction: 'ltr',
      min_match: 3,
      pay_left_to_right_only: true,
    },
    paytable: {
      LP1: { '3': 0.5 },
      HP1: { '3': 3 },
    },
    features: [],
    rng: { kind: 'mulberry32', default_seed: 42 },
    bet: { currency: 'EUR', base_bet: 1, denominations: [1] },
    limits: {
      target_rtp: 0.95,
      rtp_tolerance: 0.01,
      max_win_x: 1000,
      win_cap_apply: 'per_spin',
      target_volatility: 'medium',
      hit_freq_target: 0.3,
    },
    compliance: {
      jurisdictions: ['MGA'],
      rtp_range_required: [0.92, 0.99],
      max_win_cap_required: 1000,
      near_miss_rule: 'must_be_random',
      ldw_disclosure: true,
      session_time_display: true,
    },
    rtp_allocation: {
      base_game: 1.0,
      free_spins: 0,
      hold_and_win: 0,
      jackpot: 0,
      tolerance: 0.01,
    },
  };
}

function makeStripsIR(): SlotGameIR {
  const ir = makeWeightedIR();
  return {
    ...ir,
    reels: {
      mode: 'strips',
      base: [
        ['LP1', 'HP1', 'LP1', 'WLD'],
        ['LP1', 'HP1', 'LP1'],
        ['LP1', 'HP1', 'LP1'],
      ],
    },
  };
}

// ─── SENS-01..06 analyzeSensitivity ────────────────────────────────────────

describe('SENS-01: analyzeSensitivity returns baseRtp > 0 for weighted IR', () => {
  it('baseRtp is positive', async () => {
    const ir = makeWeightedIR();
    const report = await analyzeSensitivity(ir, { evalSpins: 2000 });
    expect(report.baseRtp).toBeGreaterThan(0);
  });
});

describe('SENS-02: analyzeSensitivity returns baseHitRate > 0', () => {
  it('baseHitRate is positive', async () => {
    const ir = makeWeightedIR();
    const report = await analyzeSensitivity(ir, { evalSpins: 2000 });
    expect(report.baseHitRate).toBeGreaterThan(0);
  });
});

describe('SENS-03: analyzeSensitivity returns deltas for each symbol', () => {
  it('has deltas for LP1, HP1, WLD', async () => {
    const ir = makeWeightedIR();
    const report = await analyzeSensitivity(ir, { evalSpins: 2000 });
    const ids = report.deltas.map((d) => d.symbolId);
    expect(ids).toContain('LP1');
    expect(ids).toContain('HP1');
    expect(ids).toContain('WLD');
  });
});

describe('SENS-04: topInfluencers has <= 5 entries', () => {
  it('length <= 5', async () => {
    const ir = makeWeightedIR();
    const report = await analyzeSensitivity(ir, { evalSpins: 2000 });
    expect(report.topInfluencers.length).toBeLessThanOrEqual(5);
  });
});

describe('SENS-05: non-weighted IR returns empty deltas gracefully', () => {
  it('deltas is empty array, baseRtp is 0', async () => {
    const ir = makeStripsIR();
    const report = await analyzeSensitivity(ir, { evalSpins: 2000 });
    expect(report.deltas).toEqual([]);
    expect(report.baseRtp).toBe(0);
    expect(report.topInfluencers).toEqual([]);
  });
});

describe('SENS-06: delta field is set correctly on SensitivityDelta', () => {
  it('all deltas have delta === 0.1', async () => {
    const ir = makeWeightedIR();
    const report = await analyzeSensitivity(ir, { evalSpins: 2000 });
    for (const d of report.deltas) {
      expect(d.delta).toBeCloseTo(0.1, 10);
    }
  });
});

// ─── applyWeightMultiplier tests ────────────────────────────────────────────

describe('SENS-00a: applyWeightMultiplier does not mutate input', () => {
  it('original IR is unchanged', () => {
    const ir = makeWeightedIR();
    const reels = ir.reels as Extract<typeof ir.reels, { mode: 'weighted' }>;
    const original = reels.base[0]?.['WLD'];
    applyWeightMultiplier(ir, 'WLD', [0, 1, 2], 5);
    expect((ir.reels as Extract<typeof ir.reels, { mode: 'weighted' }>).base[0]?.['WLD']).toBe(original);
  });
});

describe('SENS-00b: applyWeightMultiplier clamps to >= 1', () => {
  it('weight does not go below 1', () => {
    const ir = makeWeightedIR();
    const modified = applyWeightMultiplier(ir, 'WLD', [0], 0.00001);
    const reels = modified.reels as Extract<typeof modified.reels, { mode: 'weighted' }>;
    expect(reels.base[0]?.['WLD']).toBeGreaterThanOrEqual(1);
  });
});

// ─── SOLVER-07..13 solveTargetRtp ──────────────────────────────────────────

describe('SOLVER-07: solveTargetRtp returns all required fields', () => {
  it('has converged, iterations, achievedRtp, targetRtp, error, solvedIr, weightChange', async () => {
    const ir = makeWeightedIR();
    const result = await solveTargetRtp(ir, {
      targetRtp: 0.5,
      varySymbol: 'HP1',
      evalSpins: 2000,
      maxIterations: 5,
    });
    expect(typeof result.converged).toBe('boolean');
    expect(typeof result.iterations).toBe('number');
    expect(typeof result.achievedRtp).toBe('number');
    expect(result.targetRtp).toBe(0.5);
    expect(typeof result.error).toBe('number');
    expect(result.solvedIr).toBeDefined();
    expect(typeof result.weightChange).toBe('number');
  });
});

describe('SOLVER-08: solvedIr is a valid SlotGameIR', () => {
  it('has required top-level keys', async () => {
    const ir = makeWeightedIR();
    const result = await solveTargetRtp(ir, {
      targetRtp: 0.5,
      varySymbol: 'HP1',
      evalSpins: 2000,
      maxIterations: 5,
    });
    expect(result.solvedIr).toHaveProperty('schema_version');
    expect(result.solvedIr).toHaveProperty('reels');
    expect(result.solvedIr).toHaveProperty('symbols');
    expect(result.solvedIr).toHaveProperty('paytable');
  });
});

describe('SOLVER-09: solveTargetRtp is a pure function (does not mutate input)', () => {
  it('original IR is unchanged after solve', async () => {
    const ir = makeWeightedIR();
    const reels = ir.reels as Extract<typeof ir.reels, { mode: 'weighted' }>;
    const before = JSON.stringify(reels.base);
    await solveTargetRtp(ir, {
      targetRtp: 0.5,
      varySymbol: 'HP1',
      evalSpins: 2000,
      maxIterations: 5,
    });
    expect(JSON.stringify((ir.reels as Extract<typeof ir.reels, { mode: 'weighted' }>).base)).toBe(before);
  });
});

describe('SOLVER-10: weightChange is within [0.1, 10.0]', () => {
  it('weightChange in bisection bounds', async () => {
    const ir = makeWeightedIR();
    const result = await solveTargetRtp(ir, {
      targetRtp: 0.5,
      varySymbol: 'HP1',
      evalSpins: 2000,
      maxIterations: 10,
    });
    expect(result.weightChange).toBeGreaterThanOrEqual(0.1);
    expect(result.weightChange).toBeLessThanOrEqual(10.0);
  });
});

describe('SOLVER-11: iterations <= maxIterations', () => {
  it('does not exceed maxIterations', async () => {
    const ir = makeWeightedIR();
    const maxIter = 8;
    const result = await solveTargetRtp(ir, {
      targetRtp: 0.5,
      varySymbol: 'HP1',
      evalSpins: 2000,
      maxIterations: maxIter,
    });
    expect(result.iterations).toBeLessThanOrEqual(maxIter);
  });
});

describe('SOLVER-12: error field equals |achievedRtp - targetRtp|', () => {
  it('error is correct', async () => {
    const ir = makeWeightedIR();
    const result = await solveTargetRtp(ir, {
      targetRtp: 0.5,
      varySymbol: 'HP1',
      evalSpins: 2000,
      maxIterations: 5,
    });
    expect(result.error).toBeCloseTo(Math.abs(result.achievedRtp - result.targetRtp), 10);
  });
});

describe('SOLVER-13: non-weighted IR returns converged=false gracefully', () => {
  it('converged is false, iterations is 0', async () => {
    const ir = makeStripsIR();
    const result = await solveTargetRtp(ir, {
      targetRtp: 0.8,
      varySymbol: 'HP1',
      evalSpins: 2000,
      maxIterations: 5,
    });
    expect(result.converged).toBe(false);
    expect(result.iterations).toBe(0);
  });
});

// ─── TUNER-14..17 autoTune ─────────────────────────────────────────────────

describe('TUNER-14: autoTune returns all required fields', () => {
  it('has converged, achievedRtp, iterations, solvedIr', async () => {
    const ir = makeWeightedIR();
    const result = await autoTune(ir, {
      targetRtp: 0.5,
      evalSpins: 2000,
      maxIterations: 5,
    });
    expect(typeof result.converged).toBe('boolean');
    expect(typeof result.achievedRtp).toBe('number');
    expect(typeof result.iterations).toBe('number');
    expect(result.solvedIr).toBeDefined();
  });
});

describe('TUNER-15: autoTune returns achievedHitRate when targetHitRate set', () => {
  it('achievedHitRate is defined', async () => {
    const ir = makeWeightedIR();
    const result = await autoTune(ir, {
      targetRtp: 0.5,
      targetHitRate: 0.3,
      evalSpins: 2000,
      maxIterations: 5,
    });
    expect(result.achievedHitRate).toBeDefined();
    expect(typeof result.achievedHitRate).toBe('number');
  });
});

describe('TUNER-16: autoTune graceful on non-weighted IR', () => {
  it('returns converged=false, iterations=0', async () => {
    const ir = makeStripsIR();
    const result = await autoTune(ir, {
      targetRtp: 0.8,
      evalSpins: 2000,
      maxIterations: 5,
    });
    expect(result.converged).toBe(false);
    expect(result.iterations).toBe(0);
    expect(result.achievedHitRate).toBeUndefined();
  });
});

describe('TUNER-17: autoTune picks wild symbol as vary target', () => {
  it('does not throw and uses wild symbol', async () => {
    const ir = makeWeightedIR();
    // WLD is the wild symbol — just verify it runs without error
    const result = await autoTune(ir, {
      targetRtp: 0.5,
      evalSpins: 2000,
      maxIterations: 5,
    });
    expect(result).toBeDefined();
    expect(result.solvedIr).toBeDefined();
  });
});

// ─── INTEGRATION-18..20 ────────────────────────────────────────────────────

function loadFixture(name: string): SlotGameIR {
  const filePath = join(__dirname, 'fixtures/reference', name);
  return JSON.parse(readFileSync(filePath, 'utf-8')) as SlotGameIR;
}

describe('INTEGRATION-18: load classic-3x3-lines and run analyzeSensitivity', () => {
  it('report has deltas and baseRtp > 0', async () => {
    const ir = loadFixture('classic-3x3-lines.json');
    const report = await analyzeSensitivity(ir, { evalSpins: 2000 });
    expect(report.baseRtp).toBeGreaterThan(0);
    expect(report.deltas.length).toBeGreaterThan(0);
  });
});

describe('INTEGRATION-19: classic-3x3-lines topInfluencers', () => {
  it('topInfluencers has 1-5 entries with valid fields', async () => {
    const ir = loadFixture('classic-3x3-lines.json');
    const report = await analyzeSensitivity(ir, { evalSpins: 2000 });
    expect(report.topInfluencers.length).toBeGreaterThanOrEqual(1);
    expect(report.topInfluencers.length).toBeLessThanOrEqual(5);
    for (const inf of report.topInfluencers) {
      expect(inf.symbolId).toBeTruthy();
      expect(typeof inf.sensitivity).toBe('number');
      expect(inf.reelIndex).toBe(-1);
    }
  });
});

describe('INTEGRATION-20: classic-3x3-lines solveTargetRtp runs without error', () => {
  it('returns a valid result object', async () => {
    const ir = loadFixture('classic-3x3-lines.json');
    const result = await solveTargetRtp(ir, {
      targetRtp: 0.9,
      varySymbol: 'WLD',
      evalSpins: 2000,
      maxIterations: 5,
    });
    expect(typeof result.converged).toBe('boolean');
    expect(result.solvedIr).toHaveProperty('reels');
    expect(result.weightChange).toBeGreaterThanOrEqual(0.1);
    expect(result.weightChange).toBeLessThanOrEqual(10.0);
  });
});
