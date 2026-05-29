/**
 * W244 — Stryker mutation killers pushing TS score 91.23 % → ≥ 95 %.
 *
 * Targets all 30 mutants surviving the 2026-05-24 scoped report:
 *
 *   src/rg/session.ts  — 13 survived
 *     L74:7    ConditionalExpression → true   (maxWagerPerSpin gate)
 *     L85:9    ConditionalExpression → true   (lastSpinCompletedAt > 0)
 *     L85:9    EqualityOperator      → >=     (lastSpinCompletedAt > 0)
 *     L88:11   ConditionalExpression → true   (minMs > 0 && elapsed < minMs)
 *     L88:11   EqualityOperator      → >=     (minMs > 0)
 *     L99:7    ConditionalExpression → true   (maxSessionDurationMs gate)
 *     L111:7   ConditionalExpression → true   (maxLossPerSession gate)
 *     L159:7   ConditionalExpression → true   (AML velocity gate)
 *     L179:7   ConditionalExpression → true   (AML win-rate gate)
 *     L188:33  BooleanLiteral        → false  (flagged = true)
 *     L203:7   ConditionalExpression → true   (realityCheck gate)
 *     L224:7   ConditionalExpression → true   (session-limit warning gate)
 *     L260:9   ConditionalExpression → true   (cashOutHold gate)
 *
 *   src/sensitivity/analyzer.ts  — 17 survived (high-confidence subset)
 *     L26:7    ConditionalExpression → false  (applyWeightMultiplier non-weighted)
 *     L170:28  ArithmeticOperator    → +      (error = achievedRtp - target)
 *     L206:7   ConditionalExpression → false  (autoTune non-weighted)
 *     L206:37  BlockStatement        → {}     (autoTune non-weighted early-return)
 *     L215:24  LogicalOperator       → &&     (rtpTolerance default)
 *     L220:38  ArrowFunction         → ()=>u  (wild-symbol detection)
 *     L220:45  ConditionalExpression → true   (kind === 'wild')
 *     L220:45  ConditionalExpression → false  (kind === 'wild')
 *     L220:56  StringLiteral         → ""     (kind === 'wild')
 *
 * Goal: kill ≥ 13 mutants to lift 310/342 → ≥ 323/342 (≥ 94.44 %)
 * and ideally clear 95 % threshold high band.
 */

import { describe, it, expect, vi } from 'vitest';
import { RGSession } from '../src/rg/index.js';
import {
  applyWeightMultiplier,
  autoTune,
  solveTargetRtp,
} from '../src/sensitivity/analyzer.js';
import type { SlotGameIR } from '../src/ir/types.js';

vi.setConfig({ testTimeout: 60_000 });

const t0 = 3_000_000;

// ════════════════════════════════════════════════════════════════════════════
//  rg/session.ts — 13 mutation killers
// ════════════════════════════════════════════════════════════════════════════

// L74:7 ConditionalExpression → true
describe('W244 RG-01: maxWagerPerSpin undefined ⇒ no max_wager_exceeded refusal', () => {
  it('omitting maxWagerPerSpin allows arbitrarily large wagers', () => {
    // limits has no maxWagerPerSpin → mutation `if (true)` would force the
    // gate to refuse every spin, original passes through.
    const s = new RGSession({ jurisdiction: 'default', limits: {} });
    const d = s.checkSpinAllowed(1_000_000, t0);
    expect(d.allow).toBe(true);
  });
});

// L85:9 ConditionalExpression → true  AND  L85:9 EqualityOperator > 0 → >= 0
describe('W244 RG-02: pre-first-spin lastSpinCompletedAt branch (UKGC minSpin)', () => {
  it('first ever spin with UKGC jurisdiction is allowed regardless of minMs gate', () => {
    // lastSpinCompletedAt === 0 → original skips block.  Mutant `if (true)`
    // (or `>= 0`) enters block; with elapsed = nowMs - 0 = nowMs, must trip
    // refusal when nowMs < 2500.
    const s = new RGSession({ jurisdiction: 'UKGC', limits: {} });
    const d = s.checkSpinAllowed(1, 100); // nowMs=100 << 2500
    expect(d.allow).toBe(true);
  });

  it('after first recordSpin, UKGC minSpin guard does refuse a too-fast follow-up', () => {
    const s = new RGSession({ jurisdiction: 'UKGC', limits: {} });
    s.recordSpin(1, 0, t0);
    const d = s.checkSpinAllowed(1, t0 + 100); // 100 ms < 2500 → refuse
    expect(d.allow).toBe(false);
    if (d.allow === false) {
      expect(d.reason).toBe('min_spin_time_not_elapsed');
    }
  });
});

// L88:11 ConditionalExpression → true  AND  L88:11 EqualityOperator > 0 → >= 0
describe('W244 RG-03: default jurisdiction (MIN_SPIN_MS=0) never blocks via minSpin', () => {
  it('rapid-fire spins on default jurisdiction always pass', () => {
    // minMs === 0 → original false (0 > 0 = false), mutant true (0 >= 0).
    // Mutant `>= 0` would refuse immediately on second spin.
    const s = new RGSession({ jurisdiction: 'default', limits: {} });
    s.recordSpin(1, 0, t0);
    const d = s.checkSpinAllowed(1, t0); // 0 ms elapsed, same timestamp
    expect(d.allow).toBe(true);
  });

  it('UKGC after enough elapsed time (>= minMs) also passes', () => {
    // elapsed === minMs branch: original `elapsed < minMs` = false → pass.
    // Mutant on outer `if (true)` still enters but inner guard saves it.
    const s = new RGSession({ jurisdiction: 'UKGC', limits: {} });
    s.recordSpin(1, 0, t0);
    const d = s.checkSpinAllowed(1, t0 + 2500); // exactly minMs
    expect(d.allow).toBe(true);
  });
});

// L99:7 ConditionalExpression → true
describe('W244 RG-04: maxSessionDurationMs undefined ⇒ no max_session_duration refusal', () => {
  it('long-running session without duration cap is allowed', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: {},
      startTime: 0,
    });
    const d = s.checkSpinAllowed(1, 60 * 60 * 24 * 1000); // 1 day later
    expect(d.allow).toBe(true);
  });
});

// L111:7 ConditionalExpression → true
describe('W244 RG-05: maxLossPerSession undefined ⇒ no max_loss_session refusal', () => {
  it('huge net loss without limit configured still allows next spin', () => {
    const s = new RGSession({ jurisdiction: 'default', limits: {} });
    // Build up net loss artificially via recordSpin
    s.recordSpin(1_000_000, 0, t0); // huge loss
    const d = s.checkSpinAllowed(1, t0 + 10_000);
    expect(d.allow).toBe(true);
  });
});

// L159:7 ConditionalExpression → true
describe('W244 RG-06: AML velocity gate requires maxSpinsPerMinute defined', () => {
  it('no maxSpinsPerMinute set ⇒ no aml_velocity_flag event ever fires', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: {},
      aml: { /* maxSpinsPerMinute intentionally undefined */ },
    });
    // Hammer 200 spins in same millisecond — would trip any mutant `if (true)`.
    for (let i = 0; i < 200; i++) s.recordSpin(1, 0, t0);
    const events = s.getEventLog();
    expect(events.find((e) => e.kind === 'aml_velocity_flag')).toBeUndefined();
    expect(s.getAMLState().flagged).toBe(false);
  });
});

// L179:7 ConditionalExpression → true  AND  L188:33 BooleanLiteral → false
describe('W244 RG-07: AML win-rate gate fires exactly when conditions met', () => {
  it('< 30 spins ⇒ winRateSigma never evaluated, no flag', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: {},
      aml: { winRateSigmaThreshold: 0.01 }, // extremely sensitive
    });
    // 29 spins, all winners (would otherwise blow sigma sky-high)
    for (let i = 0; i < 29; i++) s.recordSpin(1, 5, t0 + i);
    expect(s.getAMLState().flagged).toBe(false);
    expect(s.getEventLog().find((e) => e.kind === 'aml_velocity_flag')).toBeUndefined();
  });

  it('≥ 30 spins with skewed wins ⇒ flagged becomes true (kills BooleanLiteral mutant)', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: {},
      aml: { winRateSigmaThreshold: 0.5 }, // sigma > 0.5 trivially with all-wins
    });
    for (let i = 0; i < 35; i++) s.recordSpin(1, 5, t0 + i);
    // Mutant L188:33 turns `flagged = true` into `flagged = false`, breaking this:
    expect(s.getAMLState().flagged).toBe(true);
  });
});

// L203:7 ConditionalExpression → true
describe('W244 RG-08: realityCheck event suppressed when interval undefined', () => {
  it('no reality_check_due event when realityCheckIntervalMs unset', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: { /* no realityCheckIntervalMs */ },
    });
    s.recordSpin(1, 0, t0);
    s.recordSpin(1, 0, t0 + 60_000);
    expect(s.getEventLog().find((e) => e.kind === 'reality_check_due')).toBeUndefined();
  });
});

// L224:7 ConditionalExpression → true
describe('W244 RG-09: session_limit_warning gate requires maxLossPerSession defined', () => {
  it('no warning fired when limit not configured', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: { /* no maxLossPerSession */ },
    });
    s.recordSpin(1_000_000, 0, t0); // catastrophic loss
    expect(s.getEventLog().find((e) => e.kind === 'session_limit_warning')).toBeUndefined();
  });
});

// L260:9 ConditionalExpression → true (cashOutHoldRequired)
describe('W244 RG-10: cashOutHoldRequired returns false when threshold undefined', () => {
  it('omitting cashOutHoldThreshold means hold never required, regardless of amount', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: {},
      aml: { /* no cashOutHoldThreshold */ },
    });
    const r = s.cashOutHoldRequired(1_000_000);
    expect(r.required).toBe(false);
  });

  it('with threshold, amount exactly equal triggers hold (boundary)', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: {},
      aml: { cashOutHoldThreshold: 5000 },
    });
    const r = s.cashOutHoldRequired(5000);
    expect(r.required).toBe(true);
  });

  it('with threshold, amount below threshold does not trigger hold', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: {},
      aml: { cashOutHoldThreshold: 5000 },
    });
    const r = s.cashOutHoldRequired(4999);
    expect(r.required).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  sensitivity/analyzer.ts — high-confidence killers
// ════════════════════════════════════════════════════════════════════════════

function makeWeightedIR(): SlotGameIR {
  return {
    schema_version: '1.0.0',
    meta: { id: 'w244-test', name: 'W244 Test', version: '1.0.0', theme_tags: [] },
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

// L26:7 ConditionalExpression → false (mode !== 'weighted' check)
describe('W244 SENS-01: applyWeightMultiplier returns untouched clone on non-weighted IR', () => {
  it('strips IR is returned unchanged (deep clone)', () => {
    const ir = makeStripsIR();
    const out = applyWeightMultiplier(ir, 'WLD', [0, 1, 2], 5.0);
    // Must be a separate object (clone) AND structurally equal to the input.
    expect(out).not.toBe(ir);
    expect(out.reels).toEqual(ir.reels);
    // Mutant `if (false)` would proceed to the weighted-only branch and
    // attempt `reels.base[i][symbolId]` — but base entries here are strings,
    // not weight maps, so behaviour would diverge.
  });
});

// L170:28 ArithmeticOperator (achievedRtp - target) → (+); L171:9 EqualityOperator
describe('W244 SENS-02: solveTargetRtp converges on a feasible target (error sign matters)', () => {
  it('targetRtp roughly matching IR baseline converges in ≤ 50 iterations', async () => {
    const ir = makeWeightedIR();
    // Pick a target near the natural baseline so bisection can hit it.
    const res = await solveTargetRtp(ir, {
      targetRtp: 0.5,
      varySymbol: 'WLD',
      tolerance: 0.5,
      maxIterations: 5,
      evalSpins: 200,
    });
    // error must be small and non-negative — mutant `+` would inflate error
    // way past any sane tolerance.  Original `-` keeps error ~ |Δ|.
    expect(res.error).toBeGreaterThanOrEqual(0);
    expect(res.error).toBeLessThan(2.0); // mutant `+` floors ~ 2 * baseline
    expect(Number.isFinite(res.error)).toBe(true);
  });
});

// L206:7 ConditionalExpression → false  AND  L206:37 BlockStatement → {}
describe('W244 SENS-03: autoTune on non-weighted IR returns the documented early-return shape', () => {
  it('strips IR returns {converged:false, achievedRtp:0, iterations:0, solvedIr:ir}', async () => {
    const ir = makeStripsIR();
    const res = await autoTune(ir, { targetRtp: 0.95 });
    expect(res.converged).toBe(false);
    expect(res.achievedRtp).toBe(0);
    expect(res.iterations).toBe(0);
    expect(res.solvedIr).toBe(ir);
    // BlockStatement → {} would skip the return entirely, sending the
    // function down the weighted-only path with a strips IR — eventual
    // crash or wildly different shape.
  });
});

// L215:24 LogicalOperator (rtpTolerance ?? 0.005) → &&
describe('W244 SENS-04: autoTune honours explicit rtpTolerance', () => {
  it('passing rtpTolerance=0.5 (lax) converges quickly without forcing default 0.005', async () => {
    const ir = makeWeightedIR();
    const res = await autoTune(ir, {
      targetRtp: 0.5,
      rtpTolerance: 0.5, // wide tolerance — must propagate to solveTargetRtp
      maxIterations: 3,
      evalSpins: 200,
    });
    // With tolerance 0.5 and only 3 iterations, original converges trivially.
    // Mutant `&&` evaluates `0.5 && 0.005 → 0.005`, forcing tight tolerance
    // and likely non-convergence in 3 iters.
    expect(res.converged).toBe(true);
  });
});

// L220:38 ArrowFunction → ()=>u  ;  L220:45 Conditional/StringLiteral mutants
describe('W244 SENS-05: autoTune detects wild symbol by kind, not by index', () => {
  it('IR with wild as last symbol still finds and uses it', async () => {
    const ir = makeWeightedIR(); // symbols: [LP1, HP1, WLD]
    const res = await autoTune(ir, {
      targetRtp: 0.5,
      rtpTolerance: 0.5,
      maxIterations: 2,
      evalSpins: 200,
    });
    // If the arrow function were neutered to () => undefined, find returns
    // undefined → varySymbol falls back to ir.symbols[0]?.id ('LP1').
    // The solved IR should have the WLD weight perturbed.
    const baseWld = (ir.reels as any).base[0].WLD;
    const solvedWld = (res.solvedIr.reels as any).base[0].WLD;
    expect(solvedWld).not.toBe(baseWld);
  });

  it('IR with NO wild symbol falls back to the first symbol (LP1)', async () => {
    const ir = makeWeightedIR();
    const noWildIr: SlotGameIR = {
      ...ir,
      symbols: [
        { id: 'LP1', name: 'LP1', kind: 'lp' },
        { id: 'HP1', name: 'HP1', kind: 'hp' },
      ],
      reels: {
        mode: 'weighted',
        base: [
          { LP1: 10, HP1: 3 },
          { LP1: 10, HP1: 3 },
          { LP1: 10, HP1: 3 },
        ],
      },
    };
    const res = await autoTune(noWildIr, {
      targetRtp: 0.5,
      rtpTolerance: 0.5,
      maxIterations: 2,
      evalSpins: 200,
    });
    // Mutant `kind === 'wild' → true` makes find return LP1 (still LP1 — same).
    // Mutant `kind === ""` makes find return undefined → fallback also LP1.
    // We assert LP1 weight changed AND HP1 weight did NOT (proves varySymbol=LP1).
    const baseLp = (noWildIr.reels as any).base[0].LP1;
    const baseHp = (noWildIr.reels as any).base[0].HP1;
    const solvedLp = (res.solvedIr.reels as any).base[0].LP1;
    const solvedHp = (res.solvedIr.reels as any).base[0].HP1;
    expect(solvedLp).not.toBe(baseLp);
    expect(solvedHp).toBe(baseHp);
  });
});
