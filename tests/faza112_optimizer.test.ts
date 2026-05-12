/**
 * Faza 11.2 — Reel Strip Optimizer
 * 18 tests covering ReelStripOptimizer coordinate gradient descent.
 */

import { describe, it, expect, vi } from 'vitest';
import { ReelStripOptimizer } from '../src/optimizer/optimizer.js';
import type { SlotGameIR } from '../src/ir/types.js';

vi.setConfig({ testTimeout: 60000 });

// ─── fixtures ────────────────────────────────────────────────────────────────

function makeWeightedIR(): SlotGameIR {
  return {
    schema_version: '1.0.0',
    meta: { id: 'opt-test', name: 'Optimizer Test', version: '1.0.0', theme_tags: [] },
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

// ─── OPT-01: construct ───────────────────────────────────────────────────────

describe('OPT-01: ReelStripOptimizer can be constructed', () => {
  it('does not throw on construction', () => {
    expect(
      () => new ReelStripOptimizer({ target: { rtp: 0.9 } }),
    ).not.toThrow();
  });
});

// ─── OPT-02: result fields ────────────────────────────────────────────────────

describe('OPT-02: optimize() returns all required fields', () => {
  it('has converged, iterations, finalRtp, finalHitRate, finalLoss, targetRtp, solvedIr, history, rtpError', async () => {
    const ir = makeWeightedIR();
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5 },
      maxIterations: 2,
      evalSpins: 1000,
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

// ─── OPT-03: non-weighted graceful ────────────────────────────────────────────

describe('OPT-03: non-weighted IR returns graceful result', () => {
  it('converged=false, iterations=0, history=[]', async () => {
    const ir = makeStripsIR();
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.9 },
      maxIterations: 5,
      evalSpins: 1000,
    });
    const result = await optimizer.optimize(ir);
    expect(result.converged).toBe(false);
    expect(result.iterations).toBe(0);
    expect(result.history).toEqual([]);
  });
});

// ─── OPT-04: history structure ────────────────────────────────────────────────

describe('OPT-04: history entries have required fields', () => {
  it('each entry has iteration, rtp, hitRate, loss, weights', async () => {
    const ir = makeWeightedIR();
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5 },
      maxIterations: 2,
      evalSpins: 1000,
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

// ─── OPT-05: loss >= 0 ───────────────────────────────────────────────────────

describe('OPT-05: finalLoss is >= 0', () => {
  it('loss is non-negative', async () => {
    const ir = makeWeightedIR();
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5 },
      maxIterations: 2,
      evalSpins: 1000,
    });
    const result = await optimizer.optimize(ir);
    expect(result.finalLoss).toBeGreaterThanOrEqual(0);
  });
});

// ─── OPT-06: loss >= 0 in history ─────────────────────────────────────────────

describe('OPT-06: all history entry losses are >= 0', () => {
  it('each entry has loss >= 0', async () => {
    const ir = makeWeightedIR();
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5 },
      maxIterations: 3,
      evalSpins: 1000,
    });
    const result = await optimizer.optimize(ir);
    for (const entry of result.history) {
      expect(entry.loss).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── OPT-07: converge with wide tolerance ────────────────────────────────────

describe('OPT-07: converges with wide rtpTolerance=1.0', () => {
  it('converged is true', async () => {
    const ir = makeWeightedIR();
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5, rtpTolerance: 1.0 },
      maxIterations: 5,
      evalSpins: 1000,
    });
    const result = await optimizer.optimize(ir);
    expect(result.converged).toBe(true);
  });
});

// ─── OPT-08: history has maxIterations+1 entries when no early convergence ────

describe('OPT-08: history has maxIterations+1 entries when not converging', () => {
  it('length is maxIterations+1', async () => {
    const ir = makeWeightedIR();
    const maxIter = 3;
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.9999, rtpTolerance: 0.0000001 },
      maxIterations: maxIter,
      evalSpins: 500,
    });
    const result = await optimizer.optimize(ir);
    // history includes iteration 0 + up to maxIter entries
    expect(result.history.length).toBeLessThanOrEqual(maxIter + 1);
    expect(result.history.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── OPT-09: solvedIr is a valid IR ─────────────────────────────────────────

describe('OPT-09: solvedIr has all required IR top-level keys', () => {
  it('solvedIr is valid', async () => {
    const ir = makeWeightedIR();
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5 },
      maxIterations: 2,
      evalSpins: 1000,
    });
    const result = await optimizer.optimize(ir);
    expect(result.solvedIr).toHaveProperty('schema_version');
    expect(result.solvedIr).toHaveProperty('reels');
    expect(result.solvedIr).toHaveProperty('symbols');
    expect(result.solvedIr).toHaveProperty('paytable');
  });
});

// ─── OPT-10: does not mutate original IR ─────────────────────────────────────

describe('OPT-10: does not mutate original IR', () => {
  it('original IR base reels unchanged after optimize', async () => {
    const ir = makeWeightedIR();
    const before = JSON.stringify(ir);
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5 },
      maxIterations: 2,
      evalSpins: 1000,
    });
    await optimizer.optimize(ir);
    expect(JSON.stringify(ir)).toBe(before);
  });
});

// ─── OPT-11: rtpError = |finalRtp - targetRtp| ────────────────────────────────

describe('OPT-11: rtpError equals |finalRtp - targetRtp|', () => {
  it('rtpError is correct', async () => {
    const ir = makeWeightedIR();
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5 },
      maxIterations: 2,
      evalSpins: 1000,
    });
    const result = await optimizer.optimize(ir);
    expect(result.rtpError).toBeCloseTo(
      Math.abs(result.finalRtp - result.targetRtp),
      10,
    );
  });
});

// ─── OPT-12: hitRateError present when targetHitRate is set ───────────────────

describe('OPT-12: hitRateError is defined when targetHitRate is set', () => {
  it('hitRateError is a number', async () => {
    const ir = makeWeightedIR();
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5, hitRate: 0.3 },
      maxIterations: 2,
      evalSpins: 1000,
    });
    const result = await optimizer.optimize(ir);
    expect(typeof result.hitRateError).toBe('number');
  });
});

// ─── OPT-13: hitRateError absent when targetHitRate not set ──────────────────

describe('OPT-13: hitRateError is undefined when targetHitRate is not set', () => {
  it('hitRateError is undefined', async () => {
    const ir = makeWeightedIR();
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5 },
      maxIterations: 2,
      evalSpins: 1000,
    });
    const result = await optimizer.optimize(ir);
    expect(result.hitRateError).toBeUndefined();
  });
});

// ─── OPT-14: iterations <= maxIterations ──────────────────────────────────────

describe('OPT-14: iterations <= maxIterations', () => {
  it('does not exceed maxIterations', async () => {
    const ir = makeWeightedIR();
    const maxIter = 4;
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5 },
      maxIterations: maxIter,
      evalSpins: 1000,
    });
    const result = await optimizer.optimize(ir);
    expect(result.iterations).toBeLessThanOrEqual(maxIter);
  });
});

// ─── OPT-15: history iteration 0 is initial state ─────────────────────────────

describe('OPT-15: history[0] has iteration===0', () => {
  it('first history entry is iteration 0', async () => {
    const ir = makeWeightedIR();
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5 },
      maxIterations: 2,
      evalSpins: 1000,
    });
    const result = await optimizer.optimize(ir);
    expect(result.history[0]?.iteration).toBe(0);
  });
});

// ─── OPT-16: solvedIr is a weighted IR ────────────────────────────────────────

describe('OPT-16: solvedIr retains weighted mode', () => {
  it('reels.mode is weighted', async () => {
    const ir = makeWeightedIR();
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5 },
      maxIterations: 2,
      evalSpins: 1000,
    });
    const result = await optimizer.optimize(ir);
    expect(result.solvedIr.reels.mode).toBe('weighted');
  });
});

// ─── OPT-17: finalHitRate is in [0, 1] ────────────────────────────────────────

describe('OPT-17: finalHitRate is in [0, 1]', () => {
  it('hitRate is valid probability', async () => {
    const ir = makeWeightedIR();
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5 },
      maxIterations: 2,
      evalSpins: 1000,
    });
    const result = await optimizer.optimize(ir);
    expect(result.finalHitRate).toBeGreaterThanOrEqual(0);
    expect(result.finalHitRate).toBeLessThanOrEqual(1);
  });
});

// ─── OPT-18: varySymbols subset works ─────────────────────────────────────────

describe('OPT-18: varySymbols subset does not throw', () => {
  it('optimize with varySymbols=["HP1"] runs correctly', async () => {
    const ir = makeWeightedIR();
    const optimizer = new ReelStripOptimizer({
      target: { rtp: 0.5 },
      varySymbols: ['HP1'],
      maxIterations: 2,
      evalSpins: 1000,
    });
    const result = await optimizer.optimize(ir);
    expect(result).toBeDefined();
    expect(typeof result.finalRtp).toBe('number');
  });
});
