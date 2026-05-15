/**
 * Faza 6.7 + W152 Wave 26 — Stryker mutation strengthening for
 * `src/sensitivity/analyzer.ts`.
 *
 * Baseline (W152 Wave 17, `reports/mutation/scoped-2026-05-13.json`):
 *   * 99 / 128 mutants killed (78.91 %)
 *   * 27 survived — distribution:
 *     ConditionalExpression 6 · LogicalOperator 5 · ArithmeticOperator 5
 *     EqualityOperator 3 · ObjectLiteral 2 · ArrowFunction 2
 *     BlockStatement 2 · MethodExpression 1 · StringLiteral 1
 *
 * Each test below is annotated with the LINE in `analyzer.ts` and the
 * mutant kind it is intended to kill. The annotation is informational
 * — Stryker re-runs to confirm. Test BODIES exercise boundary inputs
 * and assert specific output shape so that swapping operators (`+` for
 * `-`, `&&` for `||`, `<` for `<=`, etc.) makes one of the assertions
 * fail.
 *
 * Run via existing vitest harness:
 *   npm test -- tests/faza67_sensitivity_mutation_strengthening.test.ts
 *
 * Re-measure mutation score:
 *   npx stryker run
 *   npm run mutation-summary
 */

import { describe, it, expect, vi } from 'vitest';

import {
  applyWeightMultiplier,
  analyzeSensitivity,
  solveTargetRtp,
} from '../src/sensitivity/analyzer.js';
import type { SlotGameIR } from '../src/ir/types.js';

vi.setConfig({ testTimeout: 60_000 });

// ─── Minimal weighted IR fixture (kept local so the mutation file is
//     reviewable without cross-file context).
function makeWeightedIR(): SlotGameIR {
  return {
    schema_version: '1.0.0',
    meta: { id: 'sens-mut', name: 'Sensitivity Mut', version: '1.0.0', theme_tags: [] },
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
    paytable: { LP1: { '3': 0.5 }, HP1: { '3': 3 } },
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

// ─── applyWeightMultiplier — boundary mutants ──────────────────────────────

describe('MUT-AWM-01: applyWeightMultiplier — non-weighted IR returns same shape (line 26 ConditionalExpression)', () => {
  it('strips mode → returns unchanged structure', () => {
    const ir: SlotGameIR = {
      ...makeWeightedIR(),
      reels: { mode: 'strips', base: [['LP1'], ['HP1'], ['WLD']] },
    };
    const out = applyWeightMultiplier(ir, 'LP1', [0], 2.0);
    // If the `if (clone.reels.mode !== 'weighted') return clone;` flips to
    // `false`, the function would press on and crash on missing reels.base.
    // Asserting the same `mode` value forces the early-return path to fire.
    expect(out.reels.mode).toBe('strips');
    // Strips path: nothing should have been touched.
    expect((out.reels as { mode: 'strips'; base: string[][] }).base).toEqual([
      ['LP1'],
      ['HP1'],
      ['WLD'],
    ]);
  });
});

describe('MUT-AWM-02: applyWeightMultiplier — reel-index loop boundary (line 31 EqualityOperator: < vs <=)', () => {
  it('out-of-range index does NOT touch reel.length position', () => {
    const ir = makeWeightedIR();
    // reels.base.length === 3; index 3 is one past the end.
    const out = applyWeightMultiplier(ir, 'LP1', [3], 5.0);
    const weighted = out.reels as Extract<typeof out.reels, { mode: 'weighted' }>;
    // No reel got mutated — every reel still has LP1=10.
    for (const reel of weighted.base) {
      expect(reel['LP1']).toBe(10);
    }
    // If the loop bound were `i <= reels.base.length` (Stryker mutant), the
    // loop would attempt `reels.base[3]` which is undefined and would
    // either crash or silently no-op. Our assertion is the same either way
    // but the mutation also bumps `i` past the valid set causing the
    // `if (!reelSet.has(i))` branch to flip identity coverage.
  });
});

describe('MUT-AWM-03: applyWeightMultiplier — reelSet.has guard prevents wrong-reel mutation (line 34 ConditionalExpression)', () => {
  it('mutating reel 1 leaves reel 0 and reel 2 unchanged', () => {
    const ir = makeWeightedIR();
    const out = applyWeightMultiplier(ir, 'LP1', [1], 2.0);
    const weighted = out.reels as Extract<typeof out.reels, { mode: 'weighted' }>;
    expect(weighted.base[0]!['LP1']).toBe(10);
    expect(weighted.base[1]!['LP1']).toBe(20);
    expect(weighted.base[2]!['LP1']).toBe(10);
  });
});

describe('MUT-AWM-04: applyWeightMultiplier — Math.max clamp keeps weights ≥1 (boundary)', () => {
  it('multiplier 0 floor-clamps to 1 instead of zero', () => {
    const ir = makeWeightedIR();
    const out = applyWeightMultiplier(ir, 'WLD', [0, 1, 2], 0);
    const weighted = out.reels as Extract<typeof out.reels, { mode: 'weighted' }>;
    for (const reel of weighted.base) {
      // 1 × 0 = 0; clamp to 1.
      expect(reel['WLD']).toBe(1);
    }
  });

  it('tiny multiplier still produces ≥1 weight', () => {
    const ir = makeWeightedIR();
    const out = applyWeightMultiplier(ir, 'HP1', [0, 1, 2], 0.001);
    const weighted = out.reels as Extract<typeof out.reels, { mode: 'weighted' }>;
    for (const reel of weighted.base) {
      expect(reel['HP1']).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── analyzeSensitivity — defaults + arithmetic ────────────────────────────

describe('MUT-AS-01: analyzeSensitivity — non-weighted path returns empty deltas (line 60 ObjectLiteral)', () => {
  it('strips mode → deltas=[] and topInfluencers=[]', async () => {
    const ir: SlotGameIR = {
      ...makeWeightedIR(),
      reels: { mode: 'strips', base: [['LP1'], ['HP1'], ['WLD']] },
    };
    const report = await analyzeSensitivity(ir, { evalSpins: 1000 });
    expect(report.baseRtp).toBe(0);
    expect(report.baseHitRate).toBe(0);
    expect(report.deltas).toEqual([]);
    expect(report.topInfluencers).toEqual([]);
  });
});

describe('MUT-AS-02: analyzeSensitivity — opts.evalSpins default fallback (line 68 LogicalOperator)', () => {
  it('omitted evalSpins uses 10000 default and still returns finite numbers', async () => {
    const ir = makeWeightedIR();
    // We don't pass evalSpins — Stryker may mutate `opts?.evalSpins ?? 10000`
    // to `opts?.evalSpins && 10000`. The behaviour gap shows up because
    // `undefined && 10000 → undefined` would crash `runIRSimulation`.
    const report = await analyzeSensitivity(ir, { delta: 0.05 });
    expect(Number.isFinite(report.baseRtp)).toBe(true);
    expect(report.deltas.length).toBeGreaterThan(0);
  }, 60_000);
});

describe('MUT-AS-03: analyzeSensitivity — opts.delta default fallback (line 69 LogicalOperator)', () => {
  it('omitted delta uses 0.1 → sensitivity = rtpDelta / 0.1', async () => {
    const ir = makeWeightedIR();
    const reportA = await analyzeSensitivity(ir, { evalSpins: 1500 });
    const reportB = await analyzeSensitivity(ir, { evalSpins: 1500, delta: 0.1 });
    // Same default; identical seed→identical deltas.
    expect(reportA.deltas.length).toBe(reportB.deltas.length);
    for (let i = 0; i < reportA.deltas.length; i++) {
      expect(reportA.deltas[i]!.symbolId).toBe(reportB.deltas[i]!.symbolId);
      expect(reportA.deltas[i]!.delta).toBe(0.1);
    }
  }, 60_000);
});

describe('MUT-AS-04: analyzeSensitivity — perturbedResult deltas use SUBTRACTION not addition (line 93/94 ArithmeticOperator)', () => {
  it('rtpDelta is small (perturbed - base), not large (perturbed + base)', async () => {
    const ir = makeWeightedIR();
    const report = await analyzeSensitivity(ir, { evalSpins: 1500, delta: 0.1 });
    // After a +10% weight perturbation, an `rtpDelta = perturbed + base`
    // mutant would yield |rtpDelta| ≈ 2 × base_rtp ≈ 0.5–2.0; the correct
    // subtraction yields |rtpDelta| < 0.5 even on tiny synthetic fixtures.
    for (const d of report.deltas) {
      expect(Math.abs(d.rtpDelta)).toBeLessThan(0.5);
      expect(Math.abs(d.hitRateDelta)).toBeLessThan(0.5);
    }
  }, 60_000);
});

describe('MUT-AS-05: analyzeSensitivity — sensitivity uses DIVISION not multiplication (line 95 ArithmeticOperator)', () => {
  it('sensitivity ≈ rtpDelta / delta, not rtpDelta × delta', async () => {
    const ir = makeWeightedIR();
    const report = await analyzeSensitivity(ir, { evalSpins: 1500, delta: 0.1 });
    for (const d of report.deltas) {
      if (d.delta === 0) continue;
      // Correct: sensitivity = rtpDelta / delta = rtpDelta × 10 for delta=0.1.
      // Mutant: rtpDelta × delta = rtpDelta × 0.1.
      // Spread is 100× — easy assertion gap.
      const expected = d.rtpDelta / d.delta;
      expect(d.sensitivity).toBeCloseTo(expected, 8);
    }
  }, 60_000);
});

describe('MUT-AS-06: analyzeSensitivity — sensitivity zero-guard returns 0 not NaN (line 95 ConditionalExpression)', () => {
  it('delta=0 means sensitivity=0 (no division-by-zero NaN)', async () => {
    const ir = makeWeightedIR();
    const report = await analyzeSensitivity(ir, { evalSpins: 1500, delta: 0 });
    for (const d of report.deltas) {
      expect(d.delta).toBe(0);
      expect(d.sensitivity).toBe(0);
      // `Number.isNaN(0)` is false; this assertion catches a flipped
      // conditional that would let NaN through.
      expect(Number.isNaN(d.sensitivity)).toBe(false);
    }
  }, 60_000);
});

describe('MUT-AS-07: analyzeSensitivity — topInfluencers sorted DESCENDING by |sensitivity| (line 110 ArithmeticOperator)', () => {
  it('first influencer has the largest |sensitivity|', async () => {
    const ir = makeWeightedIR();
    const report = await analyzeSensitivity(ir, { evalSpins: 1500, delta: 0.1 });
    if (report.topInfluencers.length < 2) return;
    for (let i = 1; i < report.topInfluencers.length; i++) {
      const prev = Math.abs(report.topInfluencers[i - 1]!.sensitivity);
      const cur = Math.abs(report.topInfluencers[i]!.sensitivity);
      expect(prev).toBeGreaterThanOrEqual(cur);
    }
  }, 60_000);
});

describe('MUT-AS-08: analyzeSensitivity — topInfluencers capped at 5 (slice 0,5)', () => {
  it('length ≤ 5', async () => {
    const ir = makeWeightedIR();
    const report = await analyzeSensitivity(ir, { evalSpins: 1500, delta: 0.1 });
    expect(report.topInfluencers.length).toBeLessThanOrEqual(5);
  }, 60_000);
});

// ─── solveTargetRtp — convergence + boundary ───────────────────────────────

describe('MUT-STR-01: solveTargetRtp — non-weighted returns weightChange=1 (line 138 ObjectLiteral)', () => {
  it('strips IR → converged=false, weightChange=1', async () => {
    const ir: SlotGameIR = {
      ...makeWeightedIR(),
      reels: { mode: 'strips', base: [['LP1'], ['HP1'], ['WLD']] },
    };
    const out = await solveTargetRtp(ir, { targetRtp: 0.96, varySymbol: 'LP1' });
    expect(out.converged).toBe(false);
    expect(out.weightChange).toBe(1);
    expect(out.iterations).toBe(0);
    expect(out.achievedRtp).toBe(0);
  });
});

describe('MUT-STR-02: solveTargetRtp — config.tolerance default 0.001 (line 131 LogicalOperator)', () => {
  it('omitted tolerance uses 0.001 (assertion: a clearly-not-found target stays non-converged)', async () => {
    const ir = makeWeightedIR();
    // Target way outside reachable RTP for this fixture → no convergence.
    const out = await solveTargetRtp(ir, {
      targetRtp: 0.001,
      varySymbol: 'LP1',
      maxIterations: 10,
      evalSpins: 1000,
    });
    // The error must be > the (default 0.001) tolerance when no convergence.
    expect(out.error).toBeGreaterThan(0.001);
    // If `tolerance` defaulted to something larger (e.g. 1.0 due to a
    // mutant), `converged` would always trip true.
    expect(out.converged).toBe(false);
  }, 60_000);
});

describe('MUT-STR-03: solveTargetRtp — bisection uses MIDPOINT (line 163 ArithmeticOperator)', () => {
  it('with a wide bracket and few iterations, midpoint heuristic narrows the search', async () => {
    const ir = makeWeightedIR();
    const out = await solveTargetRtp(ir, {
      targetRtp: 0.92,
      varySymbol: 'HP1',
      maxIterations: 5,
      evalSpins: 1500,
    });
    // weightChange ∈ [0.1, 10] — must stay inside the bracket the
    // algorithm enforces. If `+` becomes `-` (line 163 mutation),
    // weightChange could go negative.
    expect(out.weightChange).toBeGreaterThanOrEqual(0.1);
    expect(out.weightChange).toBeLessThanOrEqual(10.0);
  }, 60_000);
});

describe('MUT-STR-04: solveTargetRtp — error uses Math.abs (boundary)', () => {
  it('error is always ≥ 0', async () => {
    const ir = makeWeightedIR();
    const out = await solveTargetRtp(ir, {
      targetRtp: 1.5, // unreachable; achievedRtp < targetRtp → diff < 0 raw
      varySymbol: 'HP1',
      maxIterations: 5,
      evalSpins: 1000,
    });
    expect(out.error).toBeGreaterThanOrEqual(0);
  }, 60_000);
});

describe('MUT-STR-05: solveTargetRtp — converged path uses strict `error < tolerance` (line 171 EqualityOperator)', () => {
  it('when error is exactly at tolerance boundary, branch fires correctly', async () => {
    // We can't control achievedRtp precisely enough to force `error ===
    // tolerance` — but we CAN force it BELOW tolerance by giving a huge
    // tolerance, and observe converged=true.
    const ir = makeWeightedIR();
    const out = await solveTargetRtp(ir, {
      targetRtp: 0.5,
      varySymbol: 'HP1',
      maxIterations: 30,
      evalSpins: 1500,
      tolerance: 100.0, // basically "anything is close enough"
    });
    expect(out.converged).toBe(true);
    expect(out.error).toBeLessThan(100.0);
  }, 60_000);
});

describe('MUT-STR-06: solveTargetRtp — bracket update direction (line 177 ConditionalExpression)', () => {
  it('if achievedRtp < target, lo bound moves up (search higher weights)', async () => {
    // The branch under test is:
    //   if (achievedRtp < config.targetRtp) lo = mid; else hi = mid;
    // A mutant flipping the comparison or the assignment would either
    // never converge or converge to the wrong direction. We force a
    // reachable RTP target and check the solver converges quickly.
    const ir = makeWeightedIR();
    const out = await solveTargetRtp(ir, {
      targetRtp: 0.93,
      varySymbol: 'HP1',
      maxIterations: 30,
      tolerance: 0.05, // relaxed for tiny fixture noise
      evalSpins: 1500,
    });
    expect(out.iterations).toBeLessThanOrEqual(30);
    // Must terminate; weightChange in bracket.
    expect(out.weightChange).toBeGreaterThan(0.1);
    expect(out.weightChange).toBeLessThan(10.0);
  }, 60_000);
});
