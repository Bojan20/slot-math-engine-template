/**
 * P0 #8 push — RG/AML strength tests.
 *
 * Targets the 67 survived mutants from the Stryker baseline against
 * `src/rg/session.ts`. The patterns mirror the Rust strength push:
 *
 *   • ConditionalExpression survivors → exercise BOTH branches of every if
 *   • EqualityOperator survivors      → test EXACTLY at the boundary, just-
 *                                       below, and just-above
 *   • StringLiteral survivors          → assert exact reason / message strings
 *   • LogicalOperator survivors        → test each side independently
 *   • ArithmeticOperator survivors     → assert exact numbers in detail.*
 *   • BooleanLiteral survivors         → assert exact true/false flags
 *
 * Each test is named so a failure points at the mutant family it covers.
 * Run with:  npx vitest run tests/faza118_rg_strength.test.ts
 */

import { describe, expect, it } from 'vitest';
import { RGSession } from '../src/rg/session.js';
import { MIN_SPIN_MS } from '../src/rg/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fresh(opts: Parameters<typeof RGSession.prototype.constructor>[0] = {}) {
  return new RGSession({ startTime: 1_000_000, ...opts });
}

// ─── ConditionalExpression: every if must have both branches tested ─────────

describe('rg-strength: self-exclusion branch', () => {
  it('self_excluded=true → refuses with exact reason+message', () => {
    const s = fresh({ limits: { selfExcluded: true } });
    const d = s.checkSpinAllowed(1, 1_000_000);
    expect(d.allow).toBe(false);
    if (!d.allow) {
      expect(d.reason).toBe('self_excluded');
      expect(d.message).toBe('Player is self-excluded.');
    }
  });

  it('self_excluded=false → allows', () => {
    const s = fresh({ limits: { selfExcluded: false } });
    expect(s.checkSpinAllowed(1, 1_000_000).allow).toBe(true);
  });

  it('selfExcluded undefined → allows', () => {
    const s = fresh({ limits: {} });
    expect(s.checkSpinAllowed(1, 1_000_000).allow).toBe(true);
  });
});

// ─── EqualityOperator + ArithmeticOperator: maxWagerPerSpin boundary ────────

describe('rg-strength: maxWagerPerSpin boundary', () => {
  it('wager === limit → ALLOWED (strict >, not >=)', () => {
    // Mutation `>` → `>=` would refuse this; we lock in the > semantic.
    const s = fresh({ limits: { maxWagerPerSpin: 100 } });
    expect(s.checkSpinAllowed(100, 1_000_000).allow).toBe(true);
  });

  it('wager === limit+1 → REFUSED with exact reason+message', () => {
    const s = fresh({ limits: { maxWagerPerSpin: 100 } });
    const d = s.checkSpinAllowed(101, 1_000_000);
    expect(d.allow).toBe(false);
    if (!d.allow) {
      expect(d.reason).toBe('max_wager_exceeded');
      expect(d.message).toBe('Wager 101 exceeds limit 100.');
    }
  });

  it('wager === limit-1 → ALLOWED', () => {
    const s = fresh({ limits: { maxWagerPerSpin: 100 } });
    expect(s.checkSpinAllowed(99, 1_000_000).allow).toBe(true);
  });

  it('limit undefined → ALLOWED at any wager', () => {
    const s = fresh({ limits: {} });
    expect(s.checkSpinAllowed(1_000_000_000, 1_000_000).allow).toBe(true);
  });
});

// ─── min spin time: jurisdictional boundaries ──────────────────────────────

describe('rg-strength: min spin time boundary', () => {
  it('UKGC: elapsed === minMs → ALLOWED (elapsed < minMs is the refusal predicate)', () => {
    const s = fresh({ jurisdiction: 'UKGC' });
    s.recordSpin(1, 0, 1_000_000); // first spin
    // Exactly 2500ms later: not "less than" 2500, so allowed.
    expect(s.checkSpinAllowed(1, 1_000_000 + MIN_SPIN_MS.UKGC).allow).toBe(true);
  });

  it('UKGC: elapsed === minMs - 1 → REFUSED', () => {
    const s = fresh({ jurisdiction: 'UKGC' });
    s.recordSpin(1, 0, 1_000_000);
    const d = s.checkSpinAllowed(1, 1_000_000 + MIN_SPIN_MS.UKGC - 1);
    expect(d.allow).toBe(false);
    if (!d.allow) {
      expect(d.reason).toBe('min_spin_time_not_elapsed');
      // Catches `minMs - elapsed` → `minMs + elapsed` mutant.
      expect(d.message).toBe('Must wait 1ms more before spinning.');
    }
  });

  it('default jurisdiction: minMs === 0 → no waiting required', () => {
    const s = fresh({ jurisdiction: 'default' });
    s.recordSpin(1, 0, 1_000_000);
    // Even 1ms after first spin: allowed because minMs is 0.
    expect(s.checkSpinAllowed(1, 1_000_001).allow).toBe(true);
  });

  it('DE: elapsed === DE.minMs / 2 → REFUSED with correct delta', () => {
    const s = fresh({ jurisdiction: 'DE' });
    s.recordSpin(1, 0, 1_000_000);
    const half = MIN_SPIN_MS.DE / 2;
    const d = s.checkSpinAllowed(1, 1_000_000 + half);
    expect(d.allow).toBe(false);
    if (!d.allow) {
      expect(d.message).toBe(`Must wait ${MIN_SPIN_MS.DE - half}ms more before spinning.`);
    }
  });

  it('first spin (lastSpinCompletedAt === 0) → time check is SKIPPED', () => {
    // Catches `this.lastSpinCompletedAt > 0` → `>= 0` mutant (which would
    // wrongly fire on the first spin).
    const s = fresh({ jurisdiction: 'UKGC' });
    expect(s.checkSpinAllowed(1, 1_000_000).allow).toBe(true);
  });
});

// ─── session duration: > vs >= boundary ─────────────────────────────────────

describe('rg-strength: maxSessionDurationMs boundary', () => {
  it('duration === limit-1 → ALLOWED', () => {
    const s = fresh({ limits: { maxSessionDurationMs: 3_600_000 } });
    expect(s.checkSpinAllowed(1, 1_000_000 + 3_599_999).allow).toBe(true);
  });

  it('duration === limit → REFUSED (>= predicate)', () => {
    const s = fresh({ limits: { maxSessionDurationMs: 3_600_000 } });
    const d = s.checkSpinAllowed(1, 1_000_000 + 3_600_000);
    expect(d.allow).toBe(false);
    if (!d.allow) {
      expect(d.reason).toBe('max_session_duration');
      expect(d.message).toBe('Session duration limit reached.');
    }
  });
});

// ─── netLoss limit: >= boundary ────────────────────────────────────────────

describe('rg-strength: maxLossPerSession boundary', () => {
  it('netLoss === limit → REFUSED with exact reason', () => {
    const s = fresh({ limits: { maxLossPerSession: 100 } });
    // Build up exactly 100 loss
    s.recordSpin(50, 0, 1_000_000);
    s.recordSpin(50, 0, 1_000_001);
    const d = s.checkSpinAllowed(1, 1_000_002);
    expect(d.allow).toBe(false);
    if (!d.allow) {
      expect(d.reason).toBe('max_loss_session');
      expect(d.message).toBe('Session loss limit reached.');
    }
  });

  it('netLoss === limit-1 → ALLOWED', () => {
    const s = fresh({ limits: { maxLossPerSession: 100 } });
    s.recordSpin(99, 0, 1_000_000);
    expect(s.checkSpinAllowed(1, 1_000_001).allow).toBe(true);
  });

  it('netWin (totalWon > totalWagered) clamps netLoss to 0 → ALLOWED', () => {
    // Catches Math.max(0, ...) collapse mutants.
    const s = fresh({ limits: { maxLossPerSession: 50 } });
    s.recordSpin(10, 100, 1_000_000); // net WIN
    expect(s.checkSpinAllowed(1, 1_000_001).allow).toBe(true);
  });
});

// ─── AML velocity: spinsInWindow > maxSpinsPerMinute (strict >, not >=) ────

describe('rg-strength: AML velocity flag', () => {
  it('exactly maxSpinsPerMinute spins in window → NO flag', () => {
    // Catches `>` → `>=` flip.
    const s = fresh({ aml: { maxSpinsPerMinute: 5 } });
    for (let i = 0; i < 5; i++) s.recordSpin(1, 0, 1_000_000 + i);
    const aml = s.getAMLState();
    expect(aml.flagged).toBe(false);
    expect(aml.flagReason).toBeUndefined();
  });

  it('maxSpinsPerMinute+1 spins → flag fires with exact kind + detail', () => {
    const s = fresh({ aml: { maxSpinsPerMinute: 5 } });
    let lastEvents: Awaited<ReturnType<typeof s.recordSpin>> = [];
    for (let i = 0; i < 6; i++) lastEvents = s.recordSpin(1, 0, 1_000_000 + i);
    expect(lastEvents.length).toBeGreaterThan(0);
    const ev = lastEvents.find((e) => e.kind === 'aml_velocity_flag');
    expect(ev).toBeDefined();
    expect(ev!.detail).toEqual({ spinsInWindow: 6, maxSpinsPerMinute: 5 });
    const aml = s.getAMLState();
    expect(aml.flagged).toBe(true);
    expect(aml.flagReason).toBe('velocity');
  });

  it('velocity flag fires ONCE then suppressed', () => {
    const s = fresh({ aml: { maxSpinsPerMinute: 2 } });
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const ev = s.recordSpin(1, 0, 1_000_000 + i);
      total += ev.filter((e) => e.kind === 'aml_velocity_flag').length;
    }
    expect(total).toBe(1);
  });

  it('window slides: spins older than 60s are dropped from velocity count', () => {
    // Catches `ts > windowStart` → `>=` or `<`, and the 60_000 ms arithmetic mutants.
    const s = fresh({ aml: { maxSpinsPerMinute: 3 } });
    s.recordSpin(1, 0, 1_000_000);
    s.recordSpin(1, 0, 1_000_001);
    s.recordSpin(1, 0, 1_000_002);
    // 61 seconds later: those three are out of window.
    s.recordSpin(1, 0, 1_000_000 + 61_000);
    const aml = s.getAMLState();
    expect(aml.flagged).toBe(false);
    expect(aml.recentSpinTimestamps.length).toBe(1);
  });

  it('maxSpinsPerMinute undefined → never flags', () => {
    const s = fresh({ aml: {} });
    for (let i = 0; i < 100; i++) s.recordSpin(1, 0, 1_000_000 + i);
    expect(s.getAMLState().flagged).toBe(false);
  });
});

// ─── AML win-rate sigma: > vs >= and arithmetic ────────────────────────────

describe('rg-strength: AML win-rate sigma', () => {
  it('totalSpins === 29 (< 30) → no sigma check fires', () => {
    // Catches `>= 30` → `> 30` / `< 30` mutants.
    const s = fresh({ aml: { winRateSigmaThreshold: 0.1 } });
    for (let i = 0; i < 29; i++) s.recordSpin(1, 1, 1_000_000 + i); // all wins
    expect(s.getAMLState().flagged).toBe(false);
  });

  it('totalSpins === 30 + extreme win rate → fires with exact kind', () => {
    const s = fresh({ aml: { winRateSigmaThreshold: 0.5 } });
    let lastEvents: Awaited<ReturnType<typeof s.recordSpin>> = [];
    for (let i = 0; i < 30; i++) lastEvents = s.recordSpin(1, 1, 1_000_000 + i);
    const ev = lastEvents.find((e) => e.detail.sigma !== undefined);
    expect(ev).toBeDefined();
    expect(ev!.kind).toBe('aml_velocity_flag'); // same kind by design
    expect(typeof ev!.detail.sigma).toBe('number');
    expect(ev!.detail.expectedRate).toBe(0.35);
    expect((ev!.detail.actualRate as number)).toBeGreaterThan(0.9);
    expect(s.getAMLState().flagReason).toBe('win_rate_sigma');
  });

  it('moderate win rate within sigma threshold → no flag', () => {
    const s = fresh({ aml: { winRateSigmaThreshold: 50 } }); // unreachable threshold
    for (let i = 0; i < 100; i++) s.recordSpin(1, i % 3 === 0 ? 2 : 0, 1_000_000 + i);
    expect(s.getAMLState().flagged).toBe(false);
  });

  it('winRateSigmaThreshold undefined → no check', () => {
    const s = fresh({ aml: {} });
    for (let i = 0; i < 100; i++) s.recordSpin(1, 1, 1_000_000 + i);
    expect(s.getAMLState().flagged).toBe(false);
  });

  it('sigma flag suppression: fires once even if win rate stays anomalous', () => {
    const s = fresh({ aml: { winRateSigmaThreshold: 0.1 } });
    let total = 0;
    for (let i = 0; i < 60; i++) {
      const ev = s.recordSpin(1, 1, 1_000_000 + i);
      total += ev.filter((e) => e.detail.sigma !== undefined).length;
    }
    expect(total).toBe(1);
  });
});

// ─── Reality check: interval boundary ──────────────────────────────────────

describe('rg-strength: reality check interval', () => {
  it('elapsed === interval-1 → no event', () => {
    const s = fresh({ limits: { realityCheckIntervalMs: 60_000 } });
    s.recordSpin(1, 0, 1_000_000); // initializes lastRealityCheckAt
    const ev = s.recordSpin(1, 0, 1_000_000 + 59_999);
    expect(ev.find((e) => e.kind === 'reality_check_due')).toBeUndefined();
  });

  it('elapsed === interval → event fires with full detail', () => {
    const s = fresh({ limits: { realityCheckIntervalMs: 60_000 } });
    s.recordSpin(10, 0, 1_000_000);
    s.recordSpin(5, 0, 1_000_000); // 2nd at same time accumulates wagered
    const ev = s.recordSpin(5, 0, 1_060_000);
    const rc = ev.find((e) => e.kind === 'reality_check_due');
    expect(rc).toBeDefined();
    expect(rc!.detail).toEqual({
      totalWagered: 20,
      totalWon: 0,
      netLoss: 20,
      spinCount: 3,
    });
  });

  it('realityCheckIntervalMs undefined → never fires', () => {
    const s = fresh({ limits: {} });
    for (let i = 0; i < 50; i++) s.recordSpin(1, 0, 1_000_000 + i * 60_000);
    const log = s.getEventLog();
    expect(log.find((e) => e.kind === 'reality_check_due')).toBeUndefined();
  });
});

// ─── Session limit warning at 80% boundary ─────────────────────────────────

describe('rg-strength: session limit warning at 80%', () => {
  it('netLoss === limit * 0.80 → warning fires with exact pct', () => {
    const s = fresh({ limits: { maxLossPerSession: 100 } });
    const ev = s.recordSpin(80, 0, 1_000_000);
    const warn = ev.find((e) => e.kind === 'session_limit_warning');
    expect(warn).toBeDefined();
    expect(warn!.detail).toEqual({ netLoss: 80, limit: 100, pct: 0.8 });
  });

  it('netLoss === limit * 0.79 → no warning', () => {
    const s = fresh({ limits: { maxLossPerSession: 100 } });
    const ev = s.recordSpin(79, 0, 1_000_000);
    expect(ev.find((e) => e.kind === 'session_limit_warning')).toBeUndefined();
  });

  it('warning fires every spin while over threshold (no suppression)', () => {
    // Distinguishes from the AML flags which DO have suppression. Catches
    // accidental introduction of a `if (!warned)` guard.
    const s = fresh({ limits: { maxLossPerSession: 100 } });
    s.recordSpin(80, 0, 1_000_000);
    const ev2 = s.recordSpin(10, 0, 1_000_001);
    expect(ev2.find((e) => e.kind === 'session_limit_warning')).toBeDefined();
  });
});

// ─── Consecutive wins / non-win reset ──────────────────────────────────────

describe('rg-strength: consecutiveWins counter', () => {
  it('win > 0 increments; win === 0 resets to 0', () => {
    // Catches `win <= 0` → `win > 0` flip + `-= 1` mutants.
    const s = fresh();
    s.recordSpin(1, 1, 1_000_000);
    s.recordSpin(1, 1, 1_000_001);
    expect(s.getAMLState().consecutiveWins).toBe(2);
    s.recordSpin(1, 0, 1_000_002);
    expect(s.getAMLState().consecutiveWins).toBe(0);
    s.recordSpin(1, 5, 1_000_003);
    expect(s.getAMLState().consecutiveWins).toBe(1);
  });

  it('totalWins counts only wins, not non-wins', () => {
    const s = fresh();
    s.recordSpin(1, 1, 1_000_000);
    s.recordSpin(1, 0, 1_000_001);
    s.recordSpin(1, 5, 1_000_002);
    expect(s.getAMLState().totalWins).toBe(2);
    expect(s.getAMLState().totalSpins).toBe(3);
  });
});

// ─── cashOutHoldRequired boundary ──────────────────────────────────────────

describe('rg-strength: cash-out hold threshold', () => {
  it('amount === threshold → required=true with exact reason', () => {
    const s = fresh({ aml: { cashOutHoldThreshold: 1000 } });
    const r = s.cashOutHoldRequired(1000);
    expect(r.required).toBe(true);
    expect(r.reason).toBe('Cash-out amount 1000 meets AML hold threshold 1000.');
  });

  it('amount === threshold - 1 → required=false, no reason', () => {
    const s = fresh({ aml: { cashOutHoldThreshold: 1000 } });
    const r = s.cashOutHoldRequired(999);
    expect(r.required).toBe(false);
    expect(r.reason).toBeUndefined();
  });

  it('amount === threshold + 1 → required=true', () => {
    const s = fresh({ aml: { cashOutHoldThreshold: 1000 } });
    expect(s.cashOutHoldRequired(1001).required).toBe(true);
  });

  it('threshold undefined → never required', () => {
    const s = fresh({ aml: {} });
    expect(s.cashOutHoldRequired(1_000_000_000).required).toBe(false);
  });
});

// ─── getState invariants ───────────────────────────────────────────────────

describe('rg-strength: getState invariants', () => {
  it('fresh session: all counters zero, lastRealityCheckAt === startTime', () => {
    const s = fresh({ startTime: 12345 });
    const st = s.getState();
    expect(st.totalWagered).toBe(0);
    expect(st.totalWon).toBe(0);
    expect(st.netLoss).toBe(0);
    expect(st.spinCount).toBe(0);
    expect(st.startTime).toBe(12345);
    expect(st.lastRealityCheckAt).toBe(12345);
  });

  it('after one losing spin: totals match exactly', () => {
    const s = fresh();
    s.recordSpin(10, 3, 1_000_001);
    const st = s.getState();
    expect(st.totalWagered).toBe(10);
    expect(st.totalWon).toBe(3);
    expect(st.netLoss).toBe(7);
    expect(st.spinCount).toBe(1);
  });

  it('default jurisdiction echoed back', () => {
    const s = fresh();
    expect(s.getState().jurisdiction).toBe('default');
  });

  it('jurisdiction explicitly set is honored', () => {
    const s = fresh({ jurisdiction: 'UKGC' });
    expect(s.getState().jurisdiction).toBe('UKGC');
  });

  it('limits are deep-cloned (state is read-only snapshot)', () => {
    const limits = { maxWagerPerSpin: 50, selfExcluded: false };
    const s = fresh({ limits });
    const st = s.getState();
    expect(st.limits).toEqual(limits);
    expect(st.limits).not.toBe(limits); // not the same reference
  });
});

// ─── Event log ─────────────────────────────────────────────────────────────

describe('rg-strength: event log', () => {
  it('event log appends every fired event', () => {
    const s = fresh({
      limits: { maxLossPerSession: 100, realityCheckIntervalMs: 1 },
      aml: { maxSpinsPerMinute: 1 },
    });
    s.recordSpin(80, 0, 1_000_000); // initializes reality check
    s.recordSpin(10, 0, 1_000_002); // velocity (2 spins in window > 1), reality_check_due, session_limit_warning
    const log = s.getEventLog();
    expect(log.length).toBeGreaterThanOrEqual(2);
  });

  it('getAMLState returns a defensive copy', () => {
    const s = fresh();
    s.recordSpin(1, 0, 1_000_000);
    const a1 = s.getAMLState();
    const a2 = s.getAMLState();
    expect(a1).not.toBe(a2);
    expect(a1.recentSpinTimestamps).not.toBe(a2.recentSpinTimestamps);
    expect(a1).toEqual(a2);
  });
});

// ─── Sessionid + UUID generation ───────────────────────────────────────────

describe('rg-strength: session id', () => {
  it('explicit sessionId is preserved', () => {
    const s = fresh({ sessionId: 'session-xyz' });
    expect(s.getState().sessionId).toBe('session-xyz');
  });

  it('default uuid is non-empty and distinct between instances', () => {
    const a = fresh().getState().sessionId;
    const b = fresh().getState().sessionId;
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});
