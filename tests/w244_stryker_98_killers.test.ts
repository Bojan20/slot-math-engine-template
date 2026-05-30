/**
 * W244 — Stryker mutation killers pushing 95.91 % → ≥ 97.95 %.
 *
 * Pass 1+2 brought TS score from 91.23 → 95.91 % (326 killed, 14 survived).
 * This pass 3 file targets the **9 logically killable** mutants from the
 * post-pass-2 surviving 14, the remaining 5 being genuine death-equivalents
 * (constant-folded MIN_SPIN_MS map + float < vs <= boundaries on RNG output).
 *
 * Strategy: each new killer **enters** the conditional with the limit set
 * but **not** violated. This forces V8 coverage tracking to map the test
 * to the if-line (previous killers using `limits = {}` short-circuited on
 * the first operand and V8 sometimes failed to attribute the line).
 *
 * Targeted survivors (post pass-2 scoped report):
 *
 *   src/rg/session.ts — 8 killable:
 *     L74:7    ConditionalExpression → true   (maxWagerPerSpin gate)
 *     L99:7    ConditionalExpression → true   (maxSessionDurationMs gate)
 *     L111:7   ConditionalExpression → true   (maxLossPerSession gate)
 *     L159:7   ConditionalExpression → true   (AML velocity gate)
 *     L179:7   ConditionalExpression → true   (AML win-rate gate)
 *     L203:7   ConditionalExpression → true   (realityCheck gate)
 *     L224:7   ConditionalExpression → true   (session-limit warning gate)
 *     L260:9   ConditionalExpression → true   (cashOutHold gate)
 *
 *   src/sensitivity/analyzer.ts — 1 killable:
 *     L26:7    ConditionalExpression → false  (applyWeightMultiplier non-weighted early return)
 *
 *   Death-equivalents (NOT targeted):
 *     session.ts L88:11      — MIN_SPIN_MS constant map, no jurisdiction with minMs=0
 *     analyzer.ts L31:19     — loop body `if (!reelMap) continue` neutralizes off-by-one
 *     analyzer.ts L171:9     — float boundary `error < tol`, RNG never gives exact tol
 *     analyzer.ts L177:9     — float boundary `achievedRtp < target`, same
 *
 * Target: 326 + 9 = 335 killed, 14 - 9 = 5 survived, 2 timeout → 335/342 = 97.95 %.
 */

import { describe, it, expect } from 'vitest';
import { RGSession } from '../src/rg/index.js';
import { applyWeightMultiplier } from '../src/sensitivity/analyzer.js';
import type { SlotGameIR } from '../src/ir/types.js';

const t0 = 3_000_000;

// ════════════════════════════════════════════════════════════════════════
//  rg/session.ts — 8 logical killers
//  Each test SETS the limit (so the first `!== undefined` operand is TRUE)
//  but stays under the threshold (so the second operand is FALSE). Result:
//  V8 sees L74/L99/L111/.../L260 evaluated, mutant `if (true)` returns the
//  refusal payload, original passes through.
// ════════════════════════════════════════════════════════════════════════

// L74:7 ConditionalExpression → true
describe('W244-PASS3 RG-L74: maxWagerPerSpin SET but NOT exceeded', () => {
  it('wager well under maxWagerPerSpin ⇒ allow=true (mutant `if (true)` returns max_wager_exceeded)', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: { maxWagerPerSpin: 100 },
    });
    const d = s.checkSpinAllowed(50, t0);
    expect(d.allow).toBe(true);
    // Belt-and-suspenders: explicitly forbid the refusal payload shape.
    if (d.allow === false) {
      expect(d.reason).not.toBe('max_wager_exceeded');
    }
  });
});

// L99:7 ConditionalExpression → true
describe('W244-PASS3 RG-L99: maxSessionDurationMs SET but NOT elapsed', () => {
  it('elapsed time under maxSessionDurationMs ⇒ allow=true', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: { maxSessionDurationMs: 100_000 },
      startTime: t0,
    });
    const d = s.checkSpinAllowed(1, t0 + 1_000); // 1s elapsed, limit 100s
    expect(d.allow).toBe(true);
    if (d.allow === false) {
      expect(d.reason).not.toBe('max_session_duration');
    }
  });
});

// L111:7 ConditionalExpression → true
describe('W244-PASS3 RG-L111: maxLossPerSession SET but netLoss UNDER', () => {
  it('netLoss < maxLossPerSession ⇒ allow=true', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: { maxLossPerSession: 1000 },
    });
    s.recordSpin(100, 0, t0); // netLoss = 100, way under 1000
    const d = s.checkSpinAllowed(1, t0 + 1_000);
    expect(d.allow).toBe(true);
    if (d.allow === false) {
      expect(d.reason).not.toBe('max_loss_session');
    }
  });
});

// L159:7 ConditionalExpression → true (AML velocity gate)
describe('W244-PASS3 RG-L159: maxSpinsPerMinute SET but not exceeded', () => {
  it('spins-in-window < maxSpinsPerMinute ⇒ no aml_velocity_flag event', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: {},
      aml: { maxSpinsPerMinute: 100 },
    });
    // 50 spins spread over 60s window (under 100 cap)
    for (let i = 0; i < 50; i++) s.recordSpin(1, 0, t0 + i * 1000);
    const events = s.getEventLog();
    expect(events.find((e) => e.kind === 'aml_velocity_flag')).toBeUndefined();
  });
});

// L179:7 ConditionalExpression → true (AML win-rate gate)
describe('W244-PASS3 RG-L179: winRateSigmaThreshold SET, ≥30 spins, sigma UNDER', () => {
  it('balanced win rate within sigma threshold ⇒ no aml flag', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: {},
      aml: { winRateSigmaThreshold: 100 }, // absurdly permissive
    });
    // 40 spins, ~35% win rate (matches expected p=0.35 → sigma ~0)
    for (let i = 0; i < 40; i++) {
      s.recordSpin(1, i < 14 ? 5 : 0, t0 + i * 1000); // 14/40 = 35% wins
    }
    expect(s.getAMLState().flagged).toBe(false);
  });
});

// L203:7 ConditionalExpression → true (reality check gate)
describe('W244-PASS3 RG-L203: realityCheckIntervalMs SET but interval NOT reached', () => {
  it('elapsed since last check < realityCheckIntervalMs ⇒ no reality_check_due event', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: { realityCheckIntervalMs: 100_000 },
      startTime: t0,
    });
    s.recordSpin(1, 0, t0 + 1_000); // 1s, way under 100s interval
    const events = s.getEventLog();
    expect(events.find((e) => e.kind === 'reality_check_due')).toBeUndefined();
  });
});

// L224:7 ConditionalExpression → true (session-limit warning at 80%)
describe('W244-PASS3 RG-L224: maxLossPerSession SET but netLoss UNDER 80%', () => {
  it('netLoss < 80% of maxLossPerSession ⇒ no session_limit_warning event', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: { maxLossPerSession: 1000 },
    });
    s.recordSpin(100, 0, t0); // netLoss=100, 10% of cap, way under 800
    const events = s.getEventLog();
    expect(events.find((e) => e.kind === 'session_limit_warning')).toBeUndefined();
  });
});

// L260:9 ConditionalExpression → true (cashOutHold gate)
describe('W244-PASS3 RG-L260: cashOutHoldThreshold SET but amount UNDER', () => {
  it('amount < cashOutHoldThreshold ⇒ required=false', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: {},
      aml: { cashOutHoldThreshold: 1000 },
    });
    const r = s.cashOutHoldRequired(500); // 500 < 1000
    expect(r.required).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
//  sensitivity/analyzer.ts — 1 logical killer
// ════════════════════════════════════════════════════════════════════════

// Helper: minimal strips-mode IR (mode !== 'weighted' triggers L26 early return)
function stripsIr(): SlotGameIR {
  return {
    schemaVersion: '1.0',
    meta: { id: 'W244-P3', name: 'w244-pass3', version: '1', themeTags: [] },
    topology: { kind: 'rectangular', reels: 3, rows: 3 },
    symbols: [
      { id: 'S_A', name: 'A', kind: 'hp' },
      { id: 'S_B', name: 'B', kind: 'lp' },
    ],
    reels: {
      mode: 'strips',
      // `applyWeightMultiplier` mutant L26 → `false` skips the early return,
      // then `clone.reels as Extract<..., 'weighted'>` typechecks at compile
      // time but at runtime `reels.base` is `SymbolKey[][]` (array of arrays).
      // The loop body then does `reelMap[symbolId] = Math.max(1, ...)`. On
      // an array, that assignment SUCCEEDS (you can set arr[symbolId] as a
      // sparse property) → but the returned clone now has a string-keyed
      // property on a reel-array that should not be there. We detect via
      // strict deep equality with the input strips.
      base: [
        ['S_A', 'S_B', 'S_A'],
        ['S_A', 'S_B', 'S_A'],
        ['S_A', 'S_B', 'S_A'],
      ],
    },
    evaluation: {
      kind: 'lines',
      direction: 'ltr',
      minMatch: 3,
      payLeftToRightOnly: true,
      paylines: [[1, 1, 1]],
    },
    paytable: { S_A: { '3': 10 }, S_B: { '3': 5 } },
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

// L26:7 ConditionalExpression → false
describe('W244-PASS3 SENS-L26: applyWeightMultiplier on strips mode returns unmodified clone', () => {
  it('strips-mode IR is returned bit-identical (mutant `if (false)` would mutate reel arrays)', () => {
    const ir = stripsIr();
    const before = JSON.stringify(ir.reels);
    const result = applyWeightMultiplier(ir, 'S_A', [0, 1, 2], 2);
    // Original: L26 returns the clone immediately when mode !== 'weighted'.
    // Mutant: L26 → false skips return → loop runs over `reels.base` which is
    // `string[][]` and assigns `reelMap['S_A'] = Math.max(...)`. JavaScript
    // tolerates string-keyed assignment on arrays (sparse property), but the
    // resulting reel array carries an EXTRA property the original never had.
    // Strict deep equality detects this.
    expect(result.reels).toEqual(ir.reels);
    expect(result.reels.mode).toBe('strips');
    // Re-stringify check: mutant adds enumerable string keys to arrays,
    // which JSON.stringify ignores for arrays. We probe via property check.
    if (result.reels.mode === 'strips') {
      for (const reel of result.reels.base) {
        expect(Object.keys(reel).every((k) => /^\d+$/.test(k))).toBe(true);
      }
    }
    expect(before).toBe(JSON.stringify(ir.reels)); // input not mutated either
  });
});
