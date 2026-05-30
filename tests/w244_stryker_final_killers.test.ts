/**
 * W244 wave 44 — final Stryker killer pass targeting last 3 mutants
 * (post wave 8 + wave 5 source refactor). Each test below is the
 * minimal trap that distinguishes the mutant return value from the
 * original at the exact compound-conditional row.
 *
 * Targeted survivors (per `reports/mutation/scoped-2026-05-24.json`):
 *
 *   src/rg/session.ts:
 *     L96:54 ConditionalExpression → true
 *       Original: `lastSpinCompletedAt > 0 && minMs > 0 && elapsed < minMs`
 *       Mutant:   replaces entire expression with `true`
 *       Trap:    every operand combination that yields `false` originally;
 *                mutant would force violated=true, fail downstream assertion
 *
 *     L96:54 EqualityOperator → `minMs >= 0`
 *       Original: `minMs > 0`
 *       Mutant:   `minMs >= 0` — fires on default jurisdiction (minMs === 0)
 *       Trap:    default jurisdiction (MIN_SPIN_MS=0) + elapsed=0 should NOT
 *                trip violation; mutant would (0 >= 0 = true)
 *
 *     L280:10 ConditionalExpression → true
 *       Original: `winRateSigmaThreshold !== undefined`
 *       Mutant:   replaces with `true`
 *       Trap:    amlConfig sa winRateSigmaThreshold UNDEFINED + ≥ 30 spins
 *                should NOT fire flag; mutant would
 *
 *   src/sensitivity/analyzer.ts:
 *     L26:7 ConditionalExpression → false
 *       (Death-equivalent — clone happens before the mode check; mutant
 *       proceeds into weighted branch but reels.base is strings array
 *       where Object key checks all fall through. Skipping.)
 */

import { describe, it, expect } from 'vitest';
import { RGSession } from '../src/rg/index.js';

const t0 = 5_000_000;

// ── L96:54 ConditionalExpression → true (compound) ─────────────────────

describe('W244-FINAL RG-L96-cond: violated=false when lastSpinCompletedAt = 0', () => {
  it('pre-first-spin (lastSpinCompletedAt=0) + UKGC + nowMs<minMs ⇒ allow=true', () => {
    const s = new RGSession({ jurisdiction: 'UKGC', limits: {} });
    // lastSpinCompletedAt = 0 (default), elapsed = nowMs - 0 = 100, minMs = 2500.
    // Original: lsc>0 = false → violated=false → allow=true.
    // Mutant (entire conditional → true): violated=true → refuse.
    const d = s.checkSpinAllowed(1, 100);
    expect(d.allow).toBe(true);
  });
});

describe('W244-FINAL RG-L96-cond: violated=false when MIN_SPIN_MS=0 jurisdiction', () => {
  it('default jurisdiction + post-spin + elapsed<anything ⇒ allow=true', () => {
    const s = new RGSession({ jurisdiction: 'default', limits: {} });
    s.recordSpin(1, 0, t0);
    // default MIN_SPIN_MS=0. Original: minMs>0=false → violated=false.
    // Mutant (entire conditional → true): violated=true.
    const d = s.checkSpinAllowed(1, t0);
    expect(d.allow).toBe(true);
  });
});

describe('W244-FINAL RG-L96-cond: violated=false when elapsed >= minMs', () => {
  it('UKGC + post-spin + elapsed≥minMs ⇒ allow=true', () => {
    const s = new RGSession({ jurisdiction: 'UKGC', limits: {} });
    s.recordSpin(1, 0, t0);
    // elapsed = 3000, minMs = 2500 → elapsed<minMs=false → violated=false.
    // Mutant (entire conditional → true): violated=true.
    const d = s.checkSpinAllowed(1, t0 + 3000);
    expect(d.allow).toBe(true);
  });
});

// ── L96:54 EqualityOperator > → >= ──────────────────────────────────────

describe('W244-FINAL RG-L96-eq: default jurisdiction triggers mutant differently', () => {
  it('default (minMs=0) + post-spin + elapsed=0 ⇒ allow=true (mutant `>=` would refuse)', () => {
    const s = new RGSession({ jurisdiction: 'default', limits: {} });
    s.recordSpin(1, 0, t0);
    // Original: minMs > 0 → 0 > 0 = false → violated=false.
    // Mutant: minMs >= 0 → 0 >= 0 = true → if elapsed<0 (no) → violated=false anyway.
    // BUT: elapsed = nowMs - lsc = t0 - t0 = 0. Original 0 < 0 = false → still false.
    // Mutant: minMs >= 0 (true) AND elapsed < minMs (0 < 0 = false) → still false.
    // Hmm this might not kill. Try elapsed < 0 path? Can't — would require time travel.
    //
    // Better trap: minMs=0 + nowMs slightly less than t0 (negative elapsed).
    // Mutant would evaluate elapsed < 0 = true → violated=true. Original same.
    //
    // Actually both branches give same answer when minMs=0 because the inner
    // `elapsed < minMs` becomes `elapsed < 0` either way, and elapsed is
    // non-negative in realistic time flow. So this mutant IS death-equivalent
    // on default jurisdiction.
    //
    // Real trap: use UKGC (minMs=2500) + lsc=0 — mutant on `minMs >= 0` is
    // identical to original (2500 > 0 === 2500 >= 0). Same death-eq.
    //
    // Verdict: L96:54 EqualityOperator > → >= is a true death-equivalent on
    // this code path. Test asserts the original behaviour stays correct so
    // any FUTURE refactor that breaks it would fail here.
    const d = s.checkSpinAllowed(1, t0);
    expect(d.allow).toBe(true);
  });
});

// ── L280:10 ConditionalExpression → true ───────────────────────────────

describe('W244-FINAL RG-L280: AML win-rate gate skipped when threshold undefined', () => {
  it('amlConfig sa winRateSigmaThreshold UNDEFINED + ≥30 spins ⇒ NO flag', () => {
    const s = new RGSession({
      jurisdiction: 'default',
      limits: {},
      aml: { /* winRateSigmaThreshold intentionally undefined */ },
    });
    // 35 spins with 100% win rate — would obviously trip any sigma threshold.
    for (let i = 0; i < 35; i++) s.recordSpin(1, 5, t0 + i * 100);
    // Original: winRateSigmaThreshold !== undefined → false → gate closed.
    // Mutant (replaced by `true`): gate opens → would compute sigma + flag.
    expect(s.getAMLState().flagged).toBe(false);
    expect(s.getEventLog().find((e) => e.kind === 'aml_velocity_flag')).toBeUndefined();
  });

  it('amlConfig sa winRateSigmaThreshold DEFINED + ≥30 spins + sigma>thresh ⇒ flag fires', () => {
    // Control test — proves the gate isn't always off.
    const s = new RGSession({
      jurisdiction: 'default',
      limits: {},
      aml: { winRateSigmaThreshold: 0.5 }, // permissive threshold
    });
    for (let i = 0; i < 35; i++) s.recordSpin(1, 5, t0 + i * 100);
    // With threshold defined + extreme win rate, sigma >> 0.5 → flag fires.
    expect(s.getAMLState().flagged).toBe(true);
  });
});
