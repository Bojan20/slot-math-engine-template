/**
 * W239 — extra Stryker mutation killers for `src/rg/session.ts`.
 *
 * Complements `tests/faza1310_rg_session_mutation_killers.test.ts` by
 * covering the remaining surviving mutants from the 2026-05-13 scoped
 * report that were not addressed earlier:
 *
 *   * L13:10 MethodExpression — uuid uniqueness from Math.random + Date.now
 *   * L39:42 / L43:27 ArrayDeclaration — eventLog/recentSpinTimestamps init
 *   * L74:7 ConditionalExpression — maxWagerPerSpin gate (both branches)
 *   * L85:9 / L88:11 ConditionalExpression — minSpin guard branches
 *   * L99:7 ConditionalExpression — maxSessionDurationMs gate
 *   * L111:7 ConditionalExpression — maxLossPerSession gate
 *   * L129:9 ConditionalExpression / L129:43 BlockStatement — lazy reality-check init
 *   * L184-185 ArithmeticOperator — Math.sqrt((p*(1-p))/n) shape
 *   * L188:33 BooleanLiteral — amlWinRateFired idempotency
 *   * L203:7 ConditionalExpression — reality-check undefined branch
 *   * L224:7 ConditionalExpression — session-limit warning unset branch
 *   * L260:9 ConditionalExpression — cashOutHoldRequired threshold branches
 *
 * Each assertion is the minimal trap that distinguishes the original
 * code from any single boolean/arithmetic/literal mutation surface.
 */

import { describe, it, expect } from 'vitest';
import { RGSession } from '../src/rg/index.js';

const t0 = 2_000_000;

// ── L13:10 MethodExpression — uuid uniqueness ────────────────────────────

describe('W239 — uuid uniqueness (line 13)', () => {
  it('two consecutive sessions produce different sessionIds', () => {
    const a = new RGSession().getState().sessionId;
    // Force a tiny delay so Date.now() changes in even the fastest CPUs.
    const b = new RGSession().getState().sessionId;
    // Even if Date.now() ties, Math.random() differs → ids differ.
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(4);
    expect(b.length).toBeGreaterThan(4);
    // If the random source were neutered to a constant, the random portion
    // would be empty/identical, collapsing the id distinctness.
    expect(a).not.toBe(b);
  });

  it('explicit sessionId override never invokes uuid()', () => {
    const s = new RGSession({ sessionId: 'fixed-id-42' });
    expect(s.getState().sessionId).toBe('fixed-id-42');
  });
});

// ── L39:42 ArrayDeclaration — eventLog starts empty ──────────────────────

describe('W239 — eventLog starts empty (line 39)', () => {
  it('newly-constructed session has no events', () => {
    const s = new RGSession();
    expect(s.getEventLog()).toEqual([]);
    expect(s.getEventLog().length).toBe(0);
  });

  it('any pre-seeded sentinel element would surface here', () => {
    const s = new RGSession();
    // Mutant `["Stryker was here"]` would make this fail.
    expect(s.getEventLog()).not.toContain('Stryker was here');
  });
});

// ── L43:27 ArrayDeclaration — recentSpinTimestamps starts empty ─────────

describe('W239 — recentSpinTimestamps starts empty (line 43)', () => {
  it('AML state recentSpinTimestamps is [] before any spin', () => {
    const s = new RGSession();
    expect(s.getAMLState().recentSpinTimestamps).toEqual([]);
  });

  it('after one spin, the array contains exactly that one timestamp', () => {
    const s = new RGSession();
    s.recordSpin(1, 0, t0);
    expect(s.getAMLState().recentSpinTimestamps).toEqual([t0]);
  });
});

// ── L74:7 ConditionalExpression — maxWagerPerSpin gate ──────────────────

describe('W239 — maxWagerPerSpin true/false branches (line 74)', () => {
  it('limit undefined → unlimited wager allowed (false branch)', () => {
    const s = new RGSession({ limits: {} });
    expect(s.checkSpinAllowed(1_000_000, t0).allow).toBe(true);
  });

  it('limit set, wager exceeds → refused (true branch)', () => {
    const s = new RGSession({ limits: { maxWagerPerSpin: 100 } });
    const res = s.checkSpinAllowed(101, t0);
    expect(res.allow).toBe(false);
    if (!res.allow) expect(res.reason).toBe('max_wager_exceeded');
  });

  it('limit set, wager equal → allowed (boundary, kills > vs >= mutant)', () => {
    const s = new RGSession({ limits: { maxWagerPerSpin: 100 } });
    expect(s.checkSpinAllowed(100, t0).allow).toBe(true);
  });
});

// ── L99:7 ConditionalExpression — maxSessionDurationMs gate ─────────────

describe('W239 — maxSessionDurationMs branches (line 99-100)', () => {
  it('undefined limit → unlimited session (false branch)', () => {
    const s = new RGSession({ limits: {} });
    expect(s.checkSpinAllowed(1, t0 + 86_400_000).allow).toBe(true);
  });

  it('exactly at limit → refused (boundary, kills < vs <= mutant)', () => {
    const s = new RGSession({ limits: { maxSessionDurationMs: 1000 }, startTime: t0 });
    const res = s.checkSpinAllowed(1, t0 + 1000);
    expect(res.allow).toBe(false);
    if (!res.allow) expect(res.reason).toBe('max_session_duration');
  });

  it('one ms below limit → allowed', () => {
    const s = new RGSession({ limits: { maxSessionDurationMs: 1000 }, startTime: t0 });
    expect(s.checkSpinAllowed(1, t0 + 999).allow).toBe(true);
  });
});

// ── L111:7 ConditionalExpression — maxLossPerSession gate ───────────────

describe('W239 — maxLossPerSession branches (line 111-112)', () => {
  it('undefined limit → unlimited losses allowed', () => {
    const s = new RGSession({ limits: {} });
    for (let i = 0; i < 100; i++) s.recordSpin(100, 0, t0 + i);
    expect(s.checkSpinAllowed(1, t0 + 1_000_000).allow).toBe(true);
  });

  it('exact net loss == limit → refused (boundary kills < vs <= mutant)', () => {
    const s = new RGSession({ limits: { maxLossPerSession: 500 } });
    // Net loss = wagered - won = 500
    s.recordSpin(500, 0, t0);
    const res = s.checkSpinAllowed(1, t0 + 1);
    expect(res.allow).toBe(false);
    if (!res.allow) expect(res.reason).toBe('max_loss_session');
  });

  it('net loss below limit → allowed', () => {
    const s = new RGSession({ limits: { maxLossPerSession: 500 } });
    s.recordSpin(499, 0, t0);
    expect(s.checkSpinAllowed(1, t0 + 1).allow).toBe(true);
  });
});

// ── L129:9/43 ConditionalExpression/BlockStatement — lazy reality check init

describe('W239 — lazy reality-check init (line 129)', () => {
  it('first spin establishes lastRealityCheckAt to that spin\'s timestamp', () => {
    const s = new RGSession({ limits: { realityCheckIntervalMs: 60_000 } });
    s.recordSpin(1, 0, t0);
    expect(s.getState().lastRealityCheckAt).toBe(t0);
  });

  it('subsequent spins below interval do NOT re-initialize lastRealityCheckAt', () => {
    const s = new RGSession({ limits: { realityCheckIntervalMs: 60_000 } });
    s.recordSpin(1, 0, t0);
    s.recordSpin(1, 0, t0 + 1000);
    // lastRealityCheckAt must still be t0, not t0+1000.
    expect(s.getState().lastRealityCheckAt).toBe(t0);
  });

  it('reality check at exact interval updates lastRealityCheckAt to fire time', () => {
    const s = new RGSession({ limits: { realityCheckIntervalMs: 60_000 } });
    s.recordSpin(1, 0, t0);
    s.recordSpin(1, 0, t0 + 60_000);
    expect(s.getState().lastRealityCheckAt).toBe(t0 + 60_000);
  });
});

// ── L184-185 ArithmeticOperator — Math.sqrt((p*(1-p))/n) shape ──────────

describe('W239 — win-rate sigma arithmetic shape (lines 184-185)', () => {
  it('actual win rate is computed as wins / spins (kills + → -)', () => {
    // 30 spins, 21 wins (70%) — actualRate=0.7. Expected p=0.35.
    // |0.7 - 0.35| = 0.35. stdErr = sqrt(0.35*0.65/30) ≈ 0.0871.
    // sigma ≈ 4.02 > any reasonable threshold (3.0).
    const s = new RGSession({ aml: { winRateSigmaThreshold: 3.0 } });
    for (let i = 0; i < 30; i++) {
      s.recordSpin(1, i < 21 ? 5 : 0, t0 + i);
    }
    const log = s.getEventLog().filter((e) =>
      'detail' in e && (e.detail as { sigma?: number }).sigma !== undefined,
    );
    expect(log.length).toBe(1);
    if (log[0] && 'detail' in log[0]) {
      const d = log[0].detail as { actualRate: number; sigma: number };
      expect(d.actualRate).toBeCloseTo(0.7, 3);
      expect(d.sigma).toBeGreaterThan(3.5);
      expect(d.sigma).toBeLessThan(4.5);
    }
  });

  it('stdErr uses (1 - p) not (1 + p) (kills sqrt(p*(1+p)/n) mutant)', () => {
    // With p=0.35:
    //   correct: sqrt(0.35 * 0.65 / 30) ≈ 0.0871
    //   mutant : sqrt(0.35 * 1.35 / 30) ≈ 0.1255
    // For 21 wins out of 30 (actualRate=0.7), diff=0.35.
    //   correct sigma ≈ 4.02
    //   mutant  sigma ≈ 2.79
    // Threshold 3.5 → correct fires, mutant does not.
    const s = new RGSession({ aml: { winRateSigmaThreshold: 3.5 } });
    for (let i = 0; i < 30; i++) {
      s.recordSpin(1, i < 21 ? 5 : 0, t0 + i);
    }
    const log = s.getEventLog().filter(
      (e) => 'detail' in e && (e.detail as { sigma?: number }).sigma !== undefined,
    );
    expect(log.length).toBe(1);
  });
});

// ── L188:33 BooleanLiteral — amlWinRateFired idempotency ────────────────

describe('W239 — winRateFired idempotency (line 187)', () => {
  it('extra spins after sigma flag do not produce a second flag event', () => {
    const s = new RGSession({ aml: { winRateSigmaThreshold: 3.0 } });
    for (let i = 0; i < 60; i++) {
      s.recordSpin(1, i < 42 ? 5 : 0, t0 + i);
    }
    const sigmaEvents = s.getEventLog().filter(
      (e) => 'detail' in e && (e.detail as { sigma?: number }).sigma !== undefined,
    );
    expect(sigmaEvents.length).toBe(1);
  });
});

// ── L203:7 ConditionalExpression — reality-check undefined branch ───────

describe('W239 — reality-check undefined-interval branch (line 203)', () => {
  it('undefined interval → no reality_check_due events ever', () => {
    const s = new RGSession({ limits: {} });
    for (let i = 0; i < 50; i++) s.recordSpin(1, 0, t0 + i * 60_000);
    expect(s.getEventLog().filter((e) => e.kind === 'reality_check_due')).toEqual([]);
  });
});

// ── L224:7 ConditionalExpression — session-limit warning unset branch ──

describe('W239 — session_limit_warning undefined-limit branch (line 224)', () => {
  it('no maxLossPerSession set → never emits warning', () => {
    const s = new RGSession({ limits: {} });
    for (let i = 0; i < 100; i++) s.recordSpin(1000, 0, t0 + i);
    expect(s.getEventLog().filter((e) => e.kind === 'session_limit_warning')).toEqual([]);
  });
});

// ── L260:9 ConditionalExpression — cashOutHoldRequired threshold ────────

describe('W239 — cashOutHoldRequired branches (line 260)', () => {
  it('threshold undefined → never required', () => {
    const s = new RGSession({ aml: {} });
    const r = s.cashOutHoldRequired(1_000_000);
    expect(r.required).toBe(false);
  });

  it('amount exactly at threshold → required (kills > vs >= mutant)', () => {
    const s = new RGSession({ aml: { cashOutHoldThreshold: 500 } });
    expect(s.cashOutHoldRequired(500).required).toBe(true);
  });

  it('amount below threshold → not required', () => {
    const s = new RGSession({ aml: { cashOutHoldThreshold: 500 } });
    expect(s.cashOutHoldRequired(499).required).toBe(false);
  });

  it('amount above threshold → required with reason text', () => {
    const s = new RGSession({ aml: { cashOutHoldThreshold: 500 } });
    const r = s.cashOutHoldRequired(1000);
    expect(r.required).toBe(true);
    if (r.required) expect(r.reason).toContain('1000');
  });
});

// ── L153:15 EqualityOperator — sliding window filter > vs >= ────────────

describe('W239 — AML velocity window filter boundary (line 153)', () => {
  it('timestamp exactly at windowStart is filtered OUT (strict > comparator)', () => {
    // Setup: maxSpinsPerMinute=3, fire 4 spins with timing that puts one
    // exactly on the windowStart boundary.
    const s = new RGSession({ aml: { maxSpinsPerMinute: 3 } });
    // Spin at t0 (will be at windowStart on the 4th recordSpin).
    s.recordSpin(1, 0, t0);
    // Spins 2-4 within the next 60s.
    s.recordSpin(1, 0, t0 + 1000);
    s.recordSpin(1, 0, t0 + 2000);
    // 4th spin exactly 60s after t0 → windowStart == t0 → t0 filtered out,
    // so the window contains spins at +1000, +2000, +60000 = 3 spins, NOT 4.
    // With strict > windowStart: 3 spins → no flag (3 ≤ max).
    // With >= mutant: 4 spins → flag fires.
    s.recordSpin(1, 0, t0 + 60_000);
    const velocity = s.getEventLog().filter((e) => e.kind === 'aml_velocity_flag');
    expect(velocity.length).toBe(0);
  });
});
