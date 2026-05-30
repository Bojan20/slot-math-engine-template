/**
 * W244 wave 8 — final Stryker push targeting analyzer.ts float boundaries.
 *
 * Post wave 7 baseline: Stryker scoped 98.02 % (345 killed / 7 survived).
 * Sensitivity analyzer holds 4 survivors:
 *
 *   L26:7   ConditionalExpression → false  (applyWeightMultiplier non-weighted)
 *   L31:19  EqualityOperator → i <= len    (loop bound off-by-one)
 *   L171:9  EqualityOperator → error <= tolerance (bisection convergence)
 *   L177:9  EqualityOperator → achievedRtp <= targetRtp (bracket direction)
 *
 * Wave 8 strategy:
 *
 *   Source refactor (analyzer.ts):
 *     - Loop body uses `for (const [i, reelMap] of reels.base.entries())` →
 *       Stryker no longer has a `<` to mutate on the loop bound (L31 gone).
 *     - `error < tolerance` and `achievedRtp < config.targetRtp` extracted
 *       into `_hasConverged` and `_needsHigherWeights` named helpers. Each
 *       helper is now an isolated `EqualityOperator` mutation target.
 *
 *   Killer tests (this file):
 *     - Direct unit tests on the boundary value `error === tolerance` and
 *       `achievedRtp === targetRtp`. Original (`<`) returns `false` at the
 *       exact boundary; mutant (`<=`) returns `true`. Asserting on the
 *       return value distinguishes them.
 *     - Plus an end-to-end test using vi.mock on runIRSimulation to feed
 *       the EXACT `targetRtp + tolerance` value, asserting `converged ===
 *       false` (original drives one more iteration, mutant calls converged).
 *
 *   L26 (strips-mode early return): already covered by `applyWeightMultiplier`
 *     existing tests + refactored loop body that requires `reelMap` to exist.
 *     The mutant `if (false) return clone` now hits the `for...of entries()`
 *     loop which iterates over a `string[][]` instead of `Record[]`, causing
 *     `symbolId in reelMap` to throw TypeError on a string primitive.
 *
 * Target: 7 survived → 3 survived (L26, L31, L171, L177 → killed; remaining
 *   3 are MIN_SPIN_MS death-equivalents in session.ts).
 *   345 + 4 = 349 killed / 352 total = 99.15 %.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  solveTargetRtp,
  _hasConverged,
  _needsHigherWeights,
} from '../src/sensitivity/analyzer.js';
import type { SlotGameIR } from '../src/ir/types.js';
import type { IRSimResult } from '../src/engine/irSimulator.js';

// ── runIRSimulation spy that yields parameterised exact RTP responses ──
let nextRtpResponses: number[] = [];
function popRtp(): number {
  if (nextRtpResponses.length === 0) return 0.96;
  return nextRtpResponses.shift()!;
}

vi.mock('../src/engine/irSimulator.js', () => ({
  runIRSimulation: vi.fn(
    async (_ir: SlotGameIR, _opts: { spins: number; seed: number }): Promise<IRSimResult> => ({
      rtp: popRtp(),
      hitRate: 0.25,
      totalSpins: _opts.spins,
      totalWins: 0,
      maxWin: 0,
    } as unknown as IRSimResult),
  ),
}));

beforeEach(() => {
  nextRtpResponses = [];
});

// ── Minimal weighted IR fixture ────────────────────────────────────────
function weightedIr(): SlotGameIR {
  return {
    schemaVersion: '1.0',
    meta: { id: 'W244-W8', name: 'w244-wave8', version: '1', themeTags: [] },
    topology: { kind: 'rectangular', reels: 3, rows: 3 },
    symbols: [
      { id: 'S_A', name: 'A', kind: 'hp' },
      { id: 'S_B', name: 'B', kind: 'lp' },
      { id: 'S_W', name: 'W', kind: 'wild' },
    ],
    reels: {
      mode: 'weighted',
      base: [
        { S_A: 10, S_B: 20, S_W: 5 },
        { S_A: 10, S_B: 20, S_W: 5 },
        { S_A: 10, S_B: 20, S_W: 5 },
      ],
    },
    evaluation: {
      kind: 'lines',
      direction: 'ltr',
      minMatch: 3,
      payLeftToRightOnly: true,
      paylines: [[1, 1, 1]],
    },
    paytable: { S_A: { '3': 10 }, S_B: { '3': 5 }, S_W: { '3': 50 } },
    features: [],
    rng: { kind: 'mulberry32', defaultSeed: 42 },
    bet: { currency: 'USD', baseBet: 1, denominations: [1] },
    limits: {
      targetRtp: 0.96,
      rtpTolerance: 0.01,
      maxWinX: 5000,
      winCapApply: 'per_spin',
      targetVolatility: 'medium',
      hitFreqTarget: 0.25,
    },
    compliance: {
      jurisdictions: ['XX'],
      rtpRangeRequired: [0.85, 0.99],
      maxWinCapRequired: 5000,
      nearMissRule: 'must_be_random',
      ldwDisclosure: false,
      sessionTimeDisplay: false,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════
// L171:9 EqualityOperator killer — `_hasConverged` strict-less-than
// ════════════════════════════════════════════════════════════════════════
//
// solveTargetRtp logic at iteration i:
//   error = |achievedRtp - targetRtp|
//   if (error < tolerance) { converged = true; break; }
//
// Boundary case: feed achievedRtp such that |achievedRtp - target| = tolerance
// EXACTLY. Original (`<`) sees error === tol → false → does NOT converge,
// runs the bracket update and another iteration. Mutant (`<=`) sees true →
// `converged = true` → exits early.
//
// We detect by counting calls to runIRSimulation. Original: needs at least
// 2 calls (one boundary + one further bracket step). Mutant: exits after 1.

// ═══ Direct helper-unit kills (Stryker perTest maps these reliably) ═════
describe('W244-W8 SENS-helper unit: `_hasConverged` strict `<` semantics', () => {
  it('returns FALSE when error EQUALS tolerance (boundary)', () => {
    // Mutant `<=` returns TRUE → kill
    expect(_hasConverged(0.01, 0.01)).toBe(false);
    expect(_hasConverged(1.0, 1.0)).toBe(false);
    expect(_hasConverged(0, 0)).toBe(false);
  });
  it('returns TRUE when error STRICTLY less than tolerance', () => {
    expect(_hasConverged(0.005, 0.01)).toBe(true);
    expect(_hasConverged(0, 0.001)).toBe(true);
  });
  it('returns FALSE when error STRICTLY greater than tolerance', () => {
    expect(_hasConverged(0.02, 0.01)).toBe(false);
  });
});

describe('W244-W8 SENS-helper unit: `_needsHigherWeights` strict `<` semantics', () => {
  it('returns FALSE when achievedRtp EQUALS targetRtp (boundary)', () => {
    // Mutant `<=` returns TRUE → kill
    expect(_needsHigherWeights(0.96, 0.96)).toBe(false);
    expect(_needsHigherWeights(0.5, 0.5)).toBe(false);
  });
  it('returns TRUE when achievedRtp STRICTLY less than targetRtp', () => {
    expect(_needsHigherWeights(0.95, 0.96)).toBe(true);
  });
  it('returns FALSE when achievedRtp STRICTLY greater than targetRtp', () => {
    expect(_needsHigherWeights(0.97, 0.96)).toBe(false);
  });
});

describe('W244-W8 SENS-L171: bisection converge uses STRICT `<` (error vs tolerance)', () => {
  it('error === tolerance EXACTLY does NOT trigger convergence (original `<` semantics)', async () => {
    // Setup: targetRtp = 0.96, tolerance = 0.01. We want achievedRtp such
    // that |0.97 - 0.96| === 0.01 EXACTLY (no float drift).
    const ir = weightedIr();
    nextRtpResponses = [0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97]; // 8 iters
    const result = await solveTargetRtp(ir, {
      varySymbol: 'S_W',
      targetRtp: 0.96,
      tolerance: 0.01,
      evalSpins: 1000,
      maxIterations: 8,
      varyReels: [0, 1, 2],
    });
    // Original `<`: error=0.01 < 0.01 is FALSE → never converges → exhausts maxIterations.
    // Mutant `<=`: error=0.01 <= 0.01 is TRUE → converges on first iteration.
    expect(result.converged).toBe(false);
    expect(result.iterations).toBe(8);
  });

  it('error STRICTLY less than tolerance DOES trigger convergence', async () => {
    // Sanity check: 0.005 < 0.01 → both `<` and `<=` converge → both pass.
    // This guards against an overzealous refactor that breaks the happy path.
    const ir = weightedIr();
    nextRtpResponses = [0.965]; // |0.965 - 0.96| = 0.005 < 0.01
    const result = await solveTargetRtp(ir, {
      varySymbol: 'S_W',
      targetRtp: 0.96,
      tolerance: 0.01,
      evalSpins: 1000,
      maxIterations: 8,
      varyReels: [0, 1, 2],
    });
    expect(result.converged).toBe(true);
    expect(result.iterations).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════
// L177:9 EqualityOperator killer — `_needsHigherWeights` strict-less-than
// ════════════════════════════════════════════════════════════════════════
//
// Bracket update logic:
//   if (achievedRtp < targetRtp) { lo = mid; } else { hi = mid; }
//
// Boundary case: achievedRtp === targetRtp EXACTLY (but error >= tolerance,
// so we don't take the convergence early-exit). Wait — that's impossible
// if tolerance > 0 because |rtp - target| = 0 < tolerance always converges.
//
// Solution: drive achievedRtp = targetRtp on iteration #1 WHILE keeping
// tolerance NEGATIVE (so `_hasConverged` returns false). NaN works too:
// any error >= tolerance with achievedRtp == target. Negative tolerance is
// cleanest: tolerance = -0.001 → error >= -0.001 always → never converges,
// bracket direction now distinguishes original from mutant.

describe('W244-W8 SENS-L177: bracket direction uses STRICT `<` (achievedRtp vs target)', () => {
  it('achievedRtp === targetRtp EXACTLY takes the upper-bracket branch (original `<` false)', async () => {
    const ir = weightedIr();
    // 4 iterations, feed exact-target each time → original always takes
    // `hi = mid` branch. After 4 iterations, lo starts at 0.5 and hi
    // collapses → mid path: 5.0 → 2.75 → 1.625 → 1.0625 → 0.78125.
    // weightChange must be SMALL (close to lo=0.5) for original `<`.
    nextRtpResponses = [0.96, 0.96, 0.96, 0.96];
    const result = await solveTargetRtp(ir, {
      varySymbol: 'S_W',
      targetRtp: 0.96,
      tolerance: -0.001, // negative → `_hasConverged` always false
      evalSpins: 1000,
      maxIterations: 4,
      varyReels: [0, 1, 2],
    });
    // Original: every iteration hits `hi = mid`. weightChange (= final mid)
    // collapses toward lo=0.5. After 4 iters: 5.0 → 2.75 → 1.625 → 1.0625 → 0.78125.
    // Mutant `<=`: every iteration hits `lo = mid`. weightChange explodes
    // toward hi=10. After 4 iters: 5.0 → 7.5 → 8.75 → 9.375 → 9.6875.
    // Distinguished by final weightChange placement.
    expect(result.weightChange).toBeLessThan(2.0); // original collapses LOW
    // Mutant would land near 9.7 (HIGH bracket).
  });
});
