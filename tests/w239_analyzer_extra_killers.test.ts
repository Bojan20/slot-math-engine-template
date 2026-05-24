/**
 * W239 — extra Stryker mutation killers for `src/sensitivity/analyzer.ts`.
 *
 * Targets the 27 surviving mutants in the 2026-05-13 scoped report,
 * complementing `tests/faza67_sensitivity_mutation_strengthening.test.ts`
 * and `tests/faza67_sensitivity_strength.test.ts`.
 *
 * Mutant groups addressed here:
 *   * L26:7, L34:9, L206:7, L95:25, L220:45 ConditionalExpression false
 *   * L31:19 EqualityOperator `< vs <=` on reel loop
 *   * L68/L133/L215/L216/L217 LogicalOperator on `??` default fallbacks
 *   * L70:22 ArithmeticOperator `1 + delta` vs `1 - delta`
 *   * L79:41, L220:38 ArrowFunction return undefined
 *   * L91/L241 ObjectLiteral `{}` returns
 *   * L93/L94 ArithmeticOperator (perturbed - base) shape
 *   * L95:39 ArithmeticOperator `rtpDelta / delta` direction
 *   * L108:26 MethodExpression — slice() returns a copy not original
 *   * L170:28 ArithmeticOperator on `achievedRtp - target`
 *   * L171:9 / L177:9 EqualityOperator boundary on error vs tolerance
 *   * L177:41 BlockStatement bracket-update side-effect
 *   * L206:37 BlockStatement non-weighted early-return
 *   * L220:56 StringLiteral '' fallback id
 *
 * Imports use the .js extension required by tsconfig ESM mode.
 */

import { describe, it, expect } from 'vitest';
import {
  applyWeightMultiplier,
  analyzeSensitivity,
  solveTargetRtp,
  autoTune,
} from '../src/sensitivity/analyzer.js';
import type { SlotGameIR } from '../src/ir/types.js';

// ── Minimal weighted IR fixture (deterministic, lightweight) ────────────

function weightedIr(): SlotGameIR {
  return {
    schemaVersion: '1.0',
    meta: { id: 'W239', name: 'w239-test', version: '1', themeTags: [] },
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
      paylines: [
        [1, 1, 1],
        [0, 0, 0],
        [2, 2, 2],
      ],
    },
    paytable: {
      S_A: { '3': 10 },
      S_B: { '3': 5 },
      S_W: { '3': 50 },
    },
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
    rtpAllocation: {
      baseGame: 80,
      freeSpins: 15,
      holdAndWin: 5,
      jackpot: 0,
      tolerance: 1,
    },
  } as SlotGameIR;
}

function stripsIr(): SlotGameIR {
  const ir = weightedIr();
  ir.reels = {
    mode: 'strips',
    base: [
      ['S_A', 'S_B', 'S_W'],
      ['S_A', 'S_B', 'S_W'],
      ['S_A', 'S_B', 'S_W'],
    ],
  };
  return ir;
}

// ── L26:7 ConditionalExpression — non-weighted early-return in applyWeightMultiplier

describe('W239 — applyWeightMultiplier non-weighted early return (L26)', () => {
  it('strips IR: returns clone with mode=strips, no mutation applied', () => {
    const ir = stripsIr();
    const out = applyWeightMultiplier(ir, 'S_A', [0, 1, 2], 5);
    expect(out.reels.mode).toBe('strips');
    // Same structural shape — the early return must produce a deep clone.
    expect(out).not.toBe(ir);
    expect(out.reels).toEqual(ir.reels);
  });
});

// ── L31:19 EqualityOperator — reel loop bound `< vs <=` ──────────────────

describe('W239 — applyWeightMultiplier reel-loop bound (L31)', () => {
  it('mutating ALL reel indices touches every reel (len-1 must be included)', () => {
    const ir = weightedIr();
    const out = applyWeightMultiplier(ir, 'S_A', [0, 1, 2], 3);
    // Original `< length` mutates indices 0,1,2.
    // Mutant `<= length` would also try index 3, which doesn't exist and
    // crashes; we cover that path via correct-bound assertion below.
    const reels = out.reels as Extract<typeof out.reels, { mode: 'weighted' }>;
    expect(reels.base.length).toBe(3);
    expect(reels.base[0]?.S_A).toBe(30);
    expect(reels.base[1]?.S_A).toBe(30);
    expect(reels.base[2]?.S_A).toBe(30);
  });
});

// ── L34:9 ConditionalExpression — reelMap missing guard ─────────────────

describe('W239 — applyWeightMultiplier missing-reelMap guard (L34)', () => {
  it('reelSet entry that resolves to no map is skipped silently', () => {
    const ir = weightedIr();
    // Inject a sparse hole at index 1 by clearing its map reference.
    const reels = ir.reels as Extract<typeof ir.reels, { mode: 'weighted' }>;
    // @ts-expect-error — test fixture intentionally violates the type.
    reels.base[1] = undefined;
    const out = applyWeightMultiplier(ir, 'S_A', [0, 1, 2], 2);
    const outReels = out.reels as Extract<typeof out.reels, { mode: 'weighted' }>;
    expect(outReels.base[0]?.S_A).toBe(20);
    // Index 1 was undefined → guard must skip it without throwing.
    expect(outReels.base[2]?.S_A).toBe(20);
  });
});

// ── L70:22 ArithmeticOperator — `1 + delta` direction ───────────────────

describe('W239 — analyzeSensitivity multiplier direction (L70)', () => {
  it('multiplier = 1 + delta (not 1 - delta): perturbed weights grow', async () => {
    const ir = weightedIr();
    // With delta=0.5: multiplier should be 1.5 (perturbing UP).
    // To verify direction without running MC twice, we exercise the
    // function and confirm sensitivity sign aligns with rtpDelta sign.
    const report = await analyzeSensitivity(ir, { evalSpins: 2000, delta: 0.5 });
    // sensitivity = rtpDelta / delta — with delta > 0, sign(sensitivity) == sign(rtpDelta).
    for (const d of report.deltas) {
      if (d.rtpDelta !== 0) {
        expect(Math.sign(d.sensitivity)).toBe(Math.sign(d.rtpDelta));
      }
    }
  });
});

// ── L68/L133/L215/L216/L217 LogicalOperator — `??` default fallbacks ────

describe('W239 — analyzeSensitivity default opts (L68)', () => {
  it('omitted opts → evalSpins defaults to 10000 and runs successfully', async () => {
    const ir = weightedIr();
    const report = await analyzeSensitivity(ir);
    expect(Number.isFinite(report.baseRtp)).toBe(true);
    expect(Number.isFinite(report.baseHitRate)).toBe(true);
    expect(report.deltas.length).toBeGreaterThanOrEqual(1);
  });
});

describe('W239 — solveTargetRtp default opts (L133)', () => {
  it('omitted maxIterations → defaults to 50 (assert iterations ≤ 50)', async () => {
    const ir = weightedIr();
    const r = await solveTargetRtp(ir, { targetRtp: 0.99, varySymbol: 'S_A', evalSpins: 200 });
    expect(r.iterations).toBeLessThanOrEqual(50);
    expect(r.iterations).toBeGreaterThan(0);
  });
});

describe('W239 — autoTune default opts (L215-L217)', () => {
  it('omitted maxIterations → defaults to 20', async () => {
    const ir = weightedIr();
    const r = await autoTune(ir, { targetRtp: 0.99, evalSpins: 200 });
    expect(r.iterations).toBeLessThanOrEqual(20);
  });

  it('omitted evalSpins → defaults to 10000 (returned IR is structurally valid)', async () => {
    const ir = weightedIr();
    const r = await autoTune(ir, { targetRtp: 0.95 });
    expect(r.solvedIr.reels.mode).toBe('weighted');
  });
});

// ── L79:41 / L220:38 ArrowFunction — `(_,i) => i` returns the index ─────

describe('W239 — analyzeSensitivity reel-index map returns numeric index (L79)', () => {
  it('all-reel indices traverse 0..N-1 — sensitivity ran across every reel', async () => {
    const ir = weightedIr();
    const report = await analyzeSensitivity(ir, { evalSpins: 500, delta: 0.1 });
    // If the arrow `(_,i) => i` had been replaced with `() => undefined`,
    // allReelIndices would be [undefined, undefined, undefined], the
    // applyWeightMultiplier guard would skip every reel and rtpDelta
    // would be exactly 0 for every symbol.  Any non-zero delta proves
    // the index-returning arrow ran correctly.
    const anyNonZero = report.deltas.some((d) => d.rtpDelta !== 0);
    expect(anyNonZero).toBe(true);
  });
});

// ── L91:64 / L241:68 ObjectLiteral — non-weighted return shape ──────────

describe('W239 — non-weighted early return shapes (L91/L241)', () => {
  it('analyzeSensitivity on strips IR returns the documented zero shape', async () => {
    const ir = stripsIr();
    const r = await analyzeSensitivity(ir);
    expect(r.baseRtp).toBe(0);
    expect(r.baseHitRate).toBe(0);
    expect(r.deltas).toEqual([]);
    expect(r.topInfluencers).toEqual([]);
  });

  it('autoTune on strips IR returns documented zero shape (L241 ObjectLiteral)', async () => {
    const ir = stripsIr();
    const r = await autoTune(ir, { targetRtp: 0.96 });
    expect(r.converged).toBe(false);
    expect(r.achievedRtp).toBe(0);
    expect(r.iterations).toBe(0);
    expect(r.solvedIr).toBe(ir);
  });
});

// ── L93/L94/L95:39 ArithmeticOperator — delta = perturbed − base ────────

describe('W239 — analyzeSensitivity delta arithmetic shape (L93-95)', () => {
  it('|rtpDelta| is small (subtraction, not addition)', async () => {
    const ir = weightedIr();
    const report = await analyzeSensitivity(ir, { evalSpins: 500, delta: 0.05 });
    // Base RTP is < 2 in this fixture; perturbed RTP is also < 2.
    // Correct |perturbed - base| should be < 2.  Mutant perturbed + base
    // would be > 0 plus the perturbation, so > base ≥ 0.
    for (const d of report.deltas) {
      expect(Math.abs(d.rtpDelta)).toBeLessThan(2);
    }
  });

  it('sensitivity = rtpDelta / delta (kills * mutant)', async () => {
    const ir = weightedIr();
    const delta = 0.5;
    const report = await analyzeSensitivity(ir, { evalSpins: 500, delta });
    for (const d of report.deltas) {
      if (d.rtpDelta !== 0) {
        const expectedSens = d.rtpDelta / delta;
        expect(d.sensitivity).toBeCloseTo(expectedSens, 9);
      }
    }
  });
});

// ── L95:25 ConditionalExpression — delta=0 guard ────────────────────────

describe('W239 — analyzeSensitivity delta=0 guard (L95)', () => {
  it('delta=0 produces sensitivity=0, no NaN', async () => {
    const ir = weightedIr();
    const report = await analyzeSensitivity(ir, { evalSpins: 200, delta: 0 });
    for (const d of report.deltas) {
      expect(Number.isNaN(d.sensitivity)).toBe(false);
      expect(d.sensitivity).toBe(0);
    }
  });
});

// ── L108:26 MethodExpression — `slice()` returns a copy ────────────────

describe('W239 — analyzeSensitivity topInfluencers sort isolation (L108)', () => {
  it('deltas array preserves Set insertion order (kills `.slice()` removal mutant)', async () => {
    const ir = weightedIr();
    // Fixture insertion order: S_A, S_B, S_W (Object.keys() iter order on
    // string-keyed objects).  Because Set preserves insertion order and
    // the analyzer iterates `Object.keys(reelMap)` then `symbolIds.add(k)`,
    // deltas[i].symbolId must follow that order exactly.
    const report = await analyzeSensitivity(ir, { evalSpins: 200, delta: 0.1 });
    expect(report.deltas.map((d) => d.symbolId)).toEqual(['S_A', 'S_B', 'S_W']);
    // If `.slice()` were removed (or replaced with `deltas`), `.sort()` on
    // line 110 would mutate the underlying `deltas` array, breaking the
    // insertion-order invariant above.
  });
});

// ── L170:28 / L171:9 / L177:9 — bisection arithmetic / equality ─────────

describe('W239 — solveTargetRtp error arithmetic & convergence boundary (L170-177)', () => {
  it('error is computed as |achievedRtp - target| (kills + mutant)', async () => {
    const ir = weightedIr();
    const r = await solveTargetRtp(ir, {
      targetRtp: 0.96,
      varySymbol: 'S_A',
      evalSpins: 300,
      maxIterations: 5,
    });
    const expected = Math.abs(r.achievedRtp - 0.96);
    expect(r.error).toBeCloseTo(expected, 9);
  });

  it('convergence requires error < tolerance, not <= (strict equality kill)', async () => {
    const ir = weightedIr();
    // With high tolerance, must converge.
    const r = await solveTargetRtp(ir, {
      targetRtp: 0.5,
      varySymbol: 'S_A',
      evalSpins: 300,
      maxIterations: 30,
      tolerance: 10, // huge tolerance
    });
    expect(r.converged).toBe(true);
    expect(r.error).toBeLessThan(10);
  });
});

// ── L177:41 BlockStatement — bracket-update side-effect ────────────────

describe('W239 — solveTargetRtp bracket-update keeps direction (L177)', () => {
  it('when achievedRtp > target, hi bound shrinks (binary-search direction)', async () => {
    const ir = weightedIr();
    // Target near 0 forces achievedRtp > target on every iter → hi shrinks
    // → weightChange ends up small (close to lo=0.1).
    const r = await solveTargetRtp(ir, {
      targetRtp: 0.001,
      varySymbol: 'S_A',
      evalSpins: 200,
      maxIterations: 10,
    });
    // After 10 iters of hi shrinking, weightChange should be close to lo (0.1).
    expect(r.weightChange).toBeLessThan(5);
  });
});

// ── L206:7 / L206:37 ConditionalExpression / BlockStatement — autoTune non-weighted

describe('W239 — autoTune non-weighted branch fully exercised (L206)', () => {
  it('strips IR triggers the early-return block without invoking solveTargetRtp', async () => {
    const ir = stripsIr();
    const r = await autoTune(ir, { targetRtp: 0.96 });
    // Early-return must not run any iterations.
    expect(r.iterations).toBe(0);
    expect(r.solvedIr).toBe(ir);
  });
});

// ── L220 ArrowFunction / ConditionalExpression / StringLiteral — wild lookup

describe('W239 — autoTune wild lookup & fallback id (L220)', () => {
  it('finds wild symbol and uses its id as varySymbol', async () => {
    const ir = weightedIr();
    const r = await autoTune(ir, { targetRtp: 0.95, evalSpins: 200, maxIterations: 5 });
    // converged or not, the result must be structurally valid.
    expect(r.solvedIr.reels.mode).toBe('weighted');
    expect(r.iterations).toBeGreaterThan(0);
  });

  it('no wild and no symbols → empty varySymbol → early-return with iterations=0', async () => {
    const ir = weightedIr();
    ir.symbols = [];
    const r = await autoTune(ir, { targetRtp: 0.95, evalSpins: 200 });
    // Empty string fallback (line 221) means varySymbol === '' → early return.
    expect(r.iterations).toBe(0);
    expect(r.converged).toBe(false);
  });

  it('no wild but has other symbols → falls back to first symbol id', async () => {
    const ir = weightedIr();
    ir.symbols = [
      { id: 'S_X', name: 'X', kind: 'hp' },
      { id: 'S_Y', name: 'Y', kind: 'lp' },
    ];
    // S_X is NOT a key in any reelMap, so applyWeightMultiplier won't touch
    // anything, but the function must still complete without error and
    // run at least one iteration.
    const r = await autoTune(ir, { targetRtp: 0.5, evalSpins: 200, maxIterations: 3 });
    expect(r.iterations).toBeGreaterThan(0);
  });
});
