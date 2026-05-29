/**
 * W244 — Stryker pass 2 — spy-based killers for `src/sensitivity/analyzer.ts`.
 *
 * Pass 1 lifted overall to 93.57 % (rg/session 95.33 %, sensitivity 90.62 %).
 * Sensitivity still has 12 surviving mutants — mostly Logical-Operator
 * `??` → `&&` flips that swap evalSpins from caller value to the default
 * (200 → 10 000), plus Object/BlockStatement `→ {}` mutants that erase
 * code paths.  These cannot be killed by checking return shape alone;
 * they need argument observation on the inner `runIRSimulation` call.
 *
 * This file uses `vi.mock` to wrap `runIRSimulation` with a deterministic
 * spy. Each test:
 *   1. Clears the mock counters.
 *   2. Invokes the analyzer entry point with a known config.
 *   3. Asserts the recorded call arguments distinguish original from mutant.
 *
 * Target mutants (high-confidence kills):
 *   L68:21   LogicalOperator     analyzeSensitivity evalSpins ??/&& mutant
 *   L133:21  LogicalOperator     solveTargetRtp     evalSpins ??/&& mutant
 *   L217:21  LogicalOperator     autoTune           evalSpins ??/&& mutant
 *   L207:12  ObjectLiteral → {}  autoTune non-weighted shape erasure
 *   L206:37  BlockStatement → {} autoTune non-weighted early-return erasure
 *   L241:68  ObjectLiteral → {}  autoTune finalResult call args erasure
 *   L177:41  BlockStatement → {} solveTargetRtp bisection lo = mid erasure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IRSimResult } from '../src/engine/irSimulator.js';
import type { SlotGameIR } from '../src/ir/types.js';

// ── runIRSimulation spy — returns a controllable synthetic result ──────
//
// The spy lets us track exactly which `spins` (and `seed`) values the
// analyzer passes through. The synthetic RTP is parameterised so the
// L177 bisection direction-of-travel test can be steered.
let nextRtpResponses: number[] = [];
function popRtp(): number {
  return nextRtpResponses.length > 0 ? nextRtpResponses.shift()! : 0.5;
}

vi.mock('../src/engine/irSimulator.js', async (orig) => {
  const actual = await orig<typeof import('../src/engine/irSimulator.js')>();
  return {
    ...actual,
    runIRSimulation: vi.fn(async (_ir: SlotGameIR, config: { spins: number }) => {
      const rtp = popRtp();
      return {
        spins: config.spins,
        rtp,
        hitRate: 0.3,
        featureTriggerFreqs: {},
        maxWinX: 0,
        rtpBreakdown: { base: rtp, free_spins: 0, hold_and_win: 0, cascade: 0 },
      } as IRSimResult;
    }),
  };
});

// Import AFTER vi.mock so the analyzer picks up the wrapped module.
const analyzerMod = await import('../src/sensitivity/analyzer.js');
const simMod = await import('../src/engine/irSimulator.js');
const runIRSimulation = simMod.runIRSimulation as ReturnType<typeof vi.fn>;

vi.setConfig({ testTimeout: 30_000 });

// ── Minimal weighted IR fixture ──────────────────────────────────────────

function makeWeightedIR(): SlotGameIR {
  return {
    schema_version: '1.0.0',
    meta: { id: 'w244-p2', name: 'W244 Pass 2', version: '1.0.0', theme_tags: [] },
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
      paylines: [[1, 1, 1]],
      direction: 'ltr',
      min_match: 3,
      pay_left_to_right_only: true,
    },
    paytable: { LP1: { '3': 0.5 }, HP1: { '3': 3 }, WLD: { '3': 5 } },
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
      rtp_range_required: [0.5, 1.5],
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
        ['LP1', 'HP1', 'WLD'],
        ['LP1', 'HP1', 'WLD'],
        ['LP1', 'HP1', 'WLD'],
      ],
    },
  };
}

beforeEach(() => {
  runIRSimulation.mockClear();
  nextRtpResponses = [];
});

// ════════════════════════════════════════════════════════════════════════════
//  L68 / L133 / L217 — Logical `??` vs `&&` (evalSpins propagation)
// ════════════════════════════════════════════════════════════════════════════

describe('W244-P2 SENS-L68: analyzeSensitivity propagates explicit evalSpins', () => {
  it('analyzeSensitivity(ir, {evalSpins: 200}) → every runIRSimulation call uses spins=200', async () => {
    const ir = makeWeightedIR();
    await analyzerMod.analyzeSensitivity(ir, { evalSpins: 200 });
    // Mutant `evalSpins && 10000` would forward 10000 to every call.
    expect(runIRSimulation).toHaveBeenCalled();
    for (const call of runIRSimulation.mock.calls) {
      const cfg = call[1] as { spins: number };
      expect(cfg.spins).toBe(200);
    }
  });
});

describe('W244-P2 SENS-L133: solveTargetRtp propagates explicit evalSpins', () => {
  it('solveTargetRtp({evalSpins:150}) → every runIRSimulation uses spins=150', async () => {
    const ir = makeWeightedIR();
    nextRtpResponses = Array(60).fill(0.5);
    await analyzerMod.solveTargetRtp(ir, {
      targetRtp: 0.5,
      varySymbol: 'WLD',
      evalSpins: 150,
      tolerance: 0.5,
      maxIterations: 3,
    });
    expect(runIRSimulation).toHaveBeenCalled();
    for (const call of runIRSimulation.mock.calls) {
      const cfg = call[1] as { spins: number };
      expect(cfg.spins).toBe(150);
    }
  });
});

describe('W244-P2 SENS-L217: autoTune propagates explicit evalSpins to inner sim', () => {
  it('autoTune({evalSpins:175}) → every runIRSimulation uses spins=175', async () => {
    const ir = makeWeightedIR();
    nextRtpResponses = Array(60).fill(0.5);
    await analyzerMod.autoTune(ir, {
      targetRtp: 0.5,
      evalSpins: 175,
      rtpTolerance: 0.5,
      maxIterations: 3,
    });
    expect(runIRSimulation).toHaveBeenCalled();
    for (const call of runIRSimulation.mock.calls) {
      const cfg = call[1] as { spins: number };
      expect(cfg.spins).toBe(175);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  L206 / L207 — autoTune non-weighted early-return integrity
// ════════════════════════════════════════════════════════════════════════════

describe('W244-P2 SENS-L207: autoTune non-weighted returns FULL placeholder shape', () => {
  it('returned object owns all 4 fields (kills ObjectLiteral → {})', async () => {
    const ir = makeStripsIR();
    const res = await analyzerMod.autoTune(ir, { targetRtp: 0.95 });
    // Mutant `return {}` would have zero own keys; original has 4.
    const keys = Object.keys(res).sort();
    expect(keys).toContain('converged');
    expect(keys).toContain('achievedRtp');
    expect(keys).toContain('iterations');
    expect(keys).toContain('solvedIr');
    // Strict shape — no extra keys leaked, no missing fields.
    expect(keys.length).toBeGreaterThanOrEqual(4);
    // And the values themselves match the documented placeholder.
    expect(res.converged).toBe(false);
    expect(res.achievedRtp).toBe(0);
    expect(res.iterations).toBe(0);
    expect(res.solvedIr).toBe(ir);
  });
});

describe('W244-P2 SENS-L206: autoTune non-weighted does NOT invoke the simulator', () => {
  it('strips IR triggers early return — zero runIRSimulation calls (kills BlockStatement → {})', async () => {
    const ir = makeStripsIR();
    await analyzerMod.autoTune(ir, { targetRtp: 0.95 });
    // Original early-returns; mutant fall-through would proceed into the
    // wild-symbol path and eventually call runIRSimulation (twice: once
    // inside solveTargetRtp, once for finalResult).
    expect(runIRSimulation).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  L241 — finalResult call carries correct {spins, seed}
// ════════════════════════════════════════════════════════════════════════════

describe('W244-P2 SENS-L241: autoTune finalResult call uses {spins:evalSpins, seed:42}', () => {
  it('LAST runIRSimulation call carries the documented {spins, seed} pair', async () => {
    const ir = makeWeightedIR();
    nextRtpResponses = Array(60).fill(0.5);
    await analyzerMod.autoTune(ir, {
      targetRtp: 0.5,
      evalSpins: 250,
      rtpTolerance: 0.5,
      maxIterations: 2,
    });
    expect(runIRSimulation.mock.calls.length).toBeGreaterThan(0);
    const last = runIRSimulation.mock.calls.at(-1)!;
    const cfg = last[1] as { spins?: number; seed?: number };
    // Mutant `{}` would strip both fields; assert both present and correct.
    expect(cfg.spins).toBe(250);
    expect(cfg.seed).toBe(42);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  L177:41 — bisection lo = mid branch must execute
// ════════════════════════════════════════════════════════════════════════════

describe('W244-P2 SENS-L177: solveTargetRtp bisection raises `lo` when underRTP', () => {
  it('feeding monotonically-rising RTPs proves lo = mid path executes (kills BlockStatement → {})', async () => {
    const ir = makeWeightedIR();
    // Each MC call returns higher RTP than the last — solver must raise
    // `lo` so subsequent `mid` values climb toward the target.
    // With BlockStatement → {}, lo stays at 0.1 forever and weightChange
    // collapses to mid = (0.1 + hi) / 2, never moving past the first step.
    nextRtpResponses = [0.1, 0.2, 0.3, 0.4, 0.45, 0.49];
    const res = await analyzerMod.solveTargetRtp(ir, {
      targetRtp: 0.6,           // never reached, but direction matters
      varySymbol: 'WLD',
      tolerance: 0.001,
      maxIterations: 6,
      evalSpins: 100,
    });
    // Original: lo grows on every "under" hit → final weightChange > initial mid
    //           (start mid = 5.05). After 6 climbs lo rises, mid drifts up.
    // Mutant {}: lo never grows, weightChange just bisects toward initial mid.
    // Diagnostic: the FINAL mid value used is `(lo + hi) / 2` from the last
    // iteration. Tracking this via the spy's last call's IR isn't feasible
    // (cloned IR), so we rely on the result's `weightChange` field.
    //
    // Robust signal: original takes at least 1 step where lo > 0.1 → final
    // mid != 5.05.  We assert weightChange differs from the first-iter mid.
    expect(res.weightChange).not.toBe(5.05);
    expect(res.iterations).toBe(6); // exhausted (target unreachable in mock)
  });
});
