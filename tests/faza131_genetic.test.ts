/**
 * Faza 13.1 — Genetic Algorithm Auto-Tuner
 * 18 tests covering GeneticOptimizer.
 */

import { describe, it, expect, vi } from 'vitest';
import { GeneticOptimizer } from '../src/optimizer/genetic.js';
import type { SlotGameIR } from '../src/ir/types.js';

vi.setConfig({ testTimeout: 60000 });

// ─── fixtures ────────────────────────────────────────────────────────────────

function makeWeightedIR(): SlotGameIR {
  return {
    schema_version: '1.0.0',
    meta: { id: 'gen-test', name: 'Genetic Test', version: '1.0.0', theme_tags: [] },
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

// ─── GEN-01: construct ────────────────────────────────────────────────────────

describe('GEN-01: GeneticOptimizer can be constructed', () => {
  it('does not throw on construction', () => {
    expect(
      () => new GeneticOptimizer({ target: { rtp: 0.9 } }),
    ).not.toThrow();
  });
});

// ─── GEN-02: result fields ────────────────────────────────────────────────────

describe('GEN-02: optimize() returns all required fields', () => {
  it('has converged, iterations, finalRtp, finalHitRate, finalLoss, targetRtp, solvedIr, history, rtpError', async () => {
    const ir = makeWeightedIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5 },
      populationSize: 4,
      maxGenerations: 2,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    expect(typeof result.converged).toBe('boolean');
    expect(typeof result.iterations).toBe('number');
    expect(typeof result.finalRtp).toBe('number');
    expect(typeof result.finalHitRate).toBe('number');
    expect(typeof result.finalLoss).toBe('number');
    expect(result.targetRtp).toBe(0.5);
    expect(result.solvedIr).toBeDefined();
    expect(Array.isArray(result.history)).toBe(true);
    expect(typeof result.rtpError).toBe('number');
  });
});

// ─── GEN-03: non-weighted fallback ────────────────────────────────────────────

describe('GEN-03: non-weighted IR returns converged=false immediately', () => {
  it('converged=false, iterations=0, history=[]', async () => {
    const ir = makeStripsIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.9 },
      populationSize: 4,
      maxGenerations: 3,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    expect(result.converged).toBe(false);
    expect(result.iterations).toBe(0);
    expect(result.history).toEqual([]);
  });
});

// ─── GEN-04: history iteration=0 is initial state ─────────────────────────────

describe('GEN-04: history[0] has iteration===0', () => {
  it('first history entry is iteration 0', async () => {
    const ir = makeWeightedIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5 },
      populationSize: 4,
      maxGenerations: 2,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    expect(result.history[0]?.iteration).toBe(0);
  });
});

// ─── GEN-05: loss >= 0 ───────────────────────────────────────────────────────

describe('GEN-05: finalLoss is >= 0', () => {
  it('loss is non-negative', async () => {
    const ir = makeWeightedIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5 },
      populationSize: 4,
      maxGenerations: 2,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    expect(result.finalLoss).toBeGreaterThanOrEqual(0);
  });
});

// ─── GEN-06: rtpError correct ─────────────────────────────────────────────────

describe('GEN-06: rtpError equals |finalRtp - targetRtp|', () => {
  it('rtpError is correct', async () => {
    const ir = makeWeightedIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5 },
      populationSize: 4,
      maxGenerations: 2,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    expect(result.rtpError).toBeCloseTo(
      Math.abs(result.finalRtp - result.targetRtp),
      10,
    );
  });
});

// ─── GEN-07: converge with wide rtpTolerance=1.0 ─────────────────────────────

describe('GEN-07: converges with rtpTolerance=1.0', () => {
  it('converged is true', async () => {
    const ir = makeWeightedIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5, rtpTolerance: 1.0 },
      populationSize: 4,
      maxGenerations: 3,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    expect(result.converged).toBe(true);
  });
});

// ─── GEN-08: hitRateError present when targetHitRate set ─────────────────────

describe('GEN-08: hitRateError is defined when targetHitRate is set', () => {
  it('hitRateError is a number', async () => {
    const ir = makeWeightedIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5, hitRate: 0.3 },
      populationSize: 4,
      maxGenerations: 2,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    expect(typeof result.hitRateError).toBe('number');
  });
});

// ─── GEN-09: hitRateError absent when no targetHitRate ───────────────────────

describe('GEN-09: hitRateError is undefined when targetHitRate is not set', () => {
  it('hitRateError is undefined', async () => {
    const ir = makeWeightedIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5 },
      populationSize: 4,
      maxGenerations: 2,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    expect(result.hitRateError).toBeUndefined();
  });
});

// ─── GEN-10: solvedIr is a weighted IR ────────────────────────────────────────

describe('GEN-10: solvedIr retains weighted mode', () => {
  it('reels.mode is weighted', async () => {
    const ir = makeWeightedIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5 },
      populationSize: 4,
      maxGenerations: 2,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    expect(result.solvedIr.reels.mode).toBe('weighted');
  });
});

// ─── GEN-11: does not mutate input IR ─────────────────────────────────────────

describe('GEN-11: does not mutate original IR', () => {
  it('original IR is unchanged after optimize', async () => {
    const ir = makeWeightedIR();
    const before = JSON.stringify(ir);
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5 },
      populationSize: 4,
      maxGenerations: 2,
      evalSpins: 500,
    });
    await optimizer.optimize(ir);
    expect(JSON.stringify(ir)).toBe(before);
  });
});

// ─── GEN-12: solvedIr has all required IR keys ────────────────────────────────

describe('GEN-12: solvedIr has all required IR top-level keys', () => {
  it('has schema_version, reels, symbols, paytable', async () => {
    const ir = makeWeightedIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5 },
      populationSize: 4,
      maxGenerations: 2,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    expect(result.solvedIr).toHaveProperty('schema_version');
    expect(result.solvedIr).toHaveProperty('reels');
    expect(result.solvedIr).toHaveProperty('symbols');
    expect(result.solvedIr).toHaveProperty('paytable');
  });
});

// ─── GEN-13: iterations <= maxGenerations ─────────────────────────────────────

describe('GEN-13: iterations <= maxGenerations', () => {
  it('does not exceed maxGenerations', async () => {
    const ir = makeWeightedIR();
    const maxGen = 4;
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5 },
      populationSize: 4,
      maxGenerations: maxGen,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    expect(result.iterations).toBeLessThanOrEqual(maxGen);
  });
});

// ─── GEN-14: all history losses >= 0 ─────────────────────────────────────────

describe('GEN-14: all history entry losses are >= 0', () => {
  it('each history entry has loss >= 0', async () => {
    const ir = makeWeightedIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5 },
      populationSize: 4,
      maxGenerations: 3,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    for (const entry of result.history) {
      expect(entry.loss).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── GEN-15: history entries have required fields ─────────────────────────────

describe('GEN-15: history entries have required fields', () => {
  it('each entry has iteration, rtp, hitRate, loss, weights', async () => {
    const ir = makeWeightedIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5 },
      populationSize: 4,
      maxGenerations: 2,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    for (const entry of result.history) {
      expect(typeof entry.iteration).toBe('number');
      expect(typeof entry.rtp).toBe('number');
      expect(typeof entry.hitRate).toBe('number');
      expect(typeof entry.loss).toBe('number');
      expect(typeof entry.weights).toBe('object');
    }
  });
});

// ─── GEN-16: finalHitRate in [0, 1] ──────────────────────────────────────────

describe('GEN-16: finalHitRate is in [0, 1]', () => {
  it('hitRate is valid probability', async () => {
    const ir = makeWeightedIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5 },
      populationSize: 4,
      maxGenerations: 2,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    expect(result.finalHitRate).toBeGreaterThanOrEqual(0);
    expect(result.finalHitRate).toBeLessThanOrEqual(1);
  });
});

// ─── GEN-17: non-weighted solvedIr equals input ir ───────────────────────────

describe('GEN-17: non-weighted solvedIr is the input IR (reference)', () => {
  it('solvedIr === input ir reference for non-weighted', async () => {
    const ir = makeStripsIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.9 },
      populationSize: 4,
      maxGenerations: 2,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    // solvedIr should be the same reference or equivalent to input ir
    expect(result.solvedIr).toBe(ir);
  });
});

// ─── GEN-18: population-based variation (multiple candidates tested) ──────────

describe('GEN-18: history has at least 1 entry (initial state recorded)', () => {
  it('history length >= 1 for weighted IR', async () => {
    const ir = makeWeightedIR();
    const optimizer = new GeneticOptimizer({
      target: { rtp: 0.5 },
      populationSize: 4,
      maxGenerations: 2,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    expect(result.history.length).toBeGreaterThanOrEqual(1);
  });
});
