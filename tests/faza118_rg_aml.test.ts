/**
 * Faza 11.8 — Responsible Gaming & AML Hooks
 *
 * 25 tests covering session limits, min spin time, self-exclusion,
 * AML velocity flagging, win-rate sigma, reality check, and cash-out hold.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RGSession } from '../src/rg/index.js';

const t0 = 1_000_000;

// ─── RG-01 ────────────────────────────────────────────────────────────────────
describe('RG-01: self_excluded → allow=false', () => {
  it('refuses spin when selfExcluded=true', () => {
    const session = new RGSession({ limits: { selfExcluded: true } });
    const result = session.checkSpinAllowed(1, t0);
    expect(result.allow).toBe(false);
    if (!result.allow) expect(result.reason).toBe('self_excluded');
  });
});

// ─── RG-02 ────────────────────────────────────────────────────────────────────
describe('RG-02: not excluded → allow=true', () => {
  it('allows spin when not self-excluded', () => {
    const session = new RGSession({ limits: { selfExcluded: false } });
    const result = session.checkSpinAllowed(1, t0);
    expect(result.allow).toBe(true);
  });
});

// ─── RG-03 ────────────────────────────────────────────────────────────────────
describe('RG-03: UKGC min spin time not elapsed', () => {
  it('refuses spin when elapsed < 2500ms on UKGC', () => {
    const session = new RGSession({ jurisdiction: 'UKGC' });
    // Record first spin to set lastSpinCompletedAt
    session.recordSpin(1, 0, t0);
    // Try again 1000ms later — still under 2500ms
    const result = session.checkSpinAllowed(1, t0 + 1000);
    expect(result.allow).toBe(false);
    if (!result.allow) expect(result.reason).toBe('min_spin_time_not_elapsed');
  });
});

// ─── RG-04 ────────────────────────────────────────────────────────────────────
describe('RG-04: UKGC, elapsed >= 2500ms → allow=true', () => {
  it('allows spin after 2500ms elapsed on UKGC', () => {
    const session = new RGSession({ jurisdiction: 'UKGC' });
    session.recordSpin(1, 0, t0);
    const result = session.checkSpinAllowed(1, t0 + 2500);
    expect(result.allow).toBe(true);
  });
});

// ─── RG-05 ────────────────────────────────────────────────────────────────────
describe('RG-05: DE, elapsed < 5000ms → refused', () => {
  it('refuses spin when elapsed < 5000ms on DE', () => {
    const session = new RGSession({ jurisdiction: 'DE' });
    session.recordSpin(1, 0, t0);
    const result = session.checkSpinAllowed(1, t0 + 4999);
    expect(result.allow).toBe(false);
    if (!result.allow) expect(result.reason).toBe('min_spin_time_not_elapsed');
  });
});

// ─── RG-06 ────────────────────────────────────────────────────────────────────
describe('RG-06: max_wager exceeded → refused', () => {
  it('refuses spin when wager > maxWagerPerSpin', () => {
    const session = new RGSession({ limits: { maxWagerPerSpin: 10 } });
    const result = session.checkSpinAllowed(11, t0);
    expect(result.allow).toBe(false);
    if (!result.allow) expect(result.reason).toBe('max_wager_exceeded');
  });
});

// ─── RG-07 ────────────────────────────────────────────────────────────────────
describe('RG-07: session loss >= limit → refused', () => {
  it('refuses spin when netLoss >= maxLossPerSession', () => {
    const session = new RGSession({ limits: { maxLossPerSession: 100 } });
    session.recordSpin(100, 0, t0);
    const result = session.checkSpinAllowed(1, t0 + 1);
    expect(result.allow).toBe(false);
    if (!result.allow) expect(result.reason).toBe('max_loss_session');
  });
});

// ─── RG-08 ────────────────────────────────────────────────────────────────────
describe('RG-08: session loss < limit → allowed', () => {
  it('allows spin when netLoss < maxLossPerSession', () => {
    const session = new RGSession({ limits: { maxLossPerSession: 100 } });
    session.recordSpin(50, 0, t0);
    // netLoss = 50 < 100
    const result = session.checkSpinAllowed(1, t0 + 1);
    // 50 < 80 so no loss warning blocks; we need to confirm allow
    expect(result.allow).toBe(true);
  });
});

// ─── RG-09 ────────────────────────────────────────────────────────────────────
describe('RG-09: session duration exceeded → refused', () => {
  it('refuses spin when session duration exceeded', () => {
    const session = new RGSession({ limits: { maxSessionDurationMs: 60_000 } });
    // Try to spin 61 seconds into the session
    const result = session.checkSpinAllowed(1, session.getState().startTime + 60_001);
    expect(result.allow).toBe(false);
    if (!result.allow) expect(result.reason).toBe('max_session_duration');
  });
});

// ─── RG-10 ────────────────────────────────────────────────────────────────────
describe('RG-10: first spin never refused for min_spin_time', () => {
  it('allows very first spin regardless of jurisdiction', () => {
    const session = new RGSession({ jurisdiction: 'UKGC' });
    // No prior spin recorded → lastSpinCompletedAt=0
    const result = session.checkSpinAllowed(1, t0);
    expect(result.allow).toBe(true);
  });
});

// ─── RG-11 ────────────────────────────────────────────────────────────────────
describe('RG-11: recordSpin updates counters correctly', () => {
  it('increments totalWagered, totalWon, netLoss, spinCount', () => {
    const session = new RGSession();
    session.recordSpin(10, 3, t0);
    const state = session.getState();
    expect(state.totalWagered).toBe(10);
    expect(state.totalWon).toBe(3);
    expect(state.netLoss).toBe(7);
    expect(state.spinCount).toBe(1);
  });
});

// ─── RG-12 ────────────────────────────────────────────────────────────────────
describe('RG-12: recordSpin returns empty events when nothing triggered', () => {
  it('returns empty array when no events triggered', () => {
    const session = new RGSession();
    const events = session.recordSpin(1, 0, t0);
    expect(events).toHaveLength(0);
  });
});

// ─── RG-13 ────────────────────────────────────────────────────────────────────
describe('RG-13: reality check fires when interval elapsed', () => {
  it('emits reality_check_due when interval has elapsed', () => {
    const session = new RGSession({ limits: { realityCheckIntervalMs: 30_000 } });
    // First spin at t0
    session.recordSpin(1, 0, t0);
    // Second spin at t0 + 30000 — should fire
    const events = session.recordSpin(1, 0, t0 + 30_000);
    const rcEvent = events.find((e) => e.kind === 'reality_check_due');
    expect(rcEvent).toBeDefined();
  });
});

// ─── RG-14 ────────────────────────────────────────────────────────────────────
describe('RG-14: reality check does not double-fire within interval', () => {
  it('does not re-emit reality_check_due before interval expires again', () => {
    const session = new RGSession({ limits: { realityCheckIntervalMs: 30_000 } });
    session.recordSpin(1, 0, t0);
    // Fire once at t0 + 30000
    session.recordSpin(1, 0, t0 + 30_000);
    // Try again 1ms later — should not fire again
    const events = session.recordSpin(1, 0, t0 + 30_001);
    const rcEvent = events.find((e) => e.kind === 'reality_check_due');
    expect(rcEvent).toBeUndefined();
  });
});

// ─── RG-15 ────────────────────────────────────────────────────────────────────
describe('RG-15: session limit warning at 80%', () => {
  it('emits session_limit_warning when netLoss reaches 80% of limit', () => {
    const session = new RGSession({ limits: { maxLossPerSession: 100 } });
    // Wager 80, win 0 → netLoss = 80 = 80% of 100
    const events = session.recordSpin(80, 0, t0);
    const warnEvent = events.find((e) => e.kind === 'session_limit_warning');
    expect(warnEvent).toBeDefined();
  });
});

// ─── RG-16 ────────────────────────────────────────────────────────────────────
describe('RG-16: AML velocity flag fires when spins/min exceeded', () => {
  it('emits aml_velocity_flag when spins exceed maxSpinsPerMinute', () => {
    const session = new RGSession({ aml: { maxSpinsPerMinute: 5 } });
    let lastEvents: ReturnType<typeof session.recordSpin> = [];
    // Record 6 spins within same second → > 5 per minute
    for (let i = 0; i <= 5; i++) {
      lastEvents = session.recordSpin(1, 0, t0 + i * 10);
    }
    const allEvents = session.getEventLog();
    expect(allEvents.some((e) => e.kind === 'aml_velocity_flag')).toBe(true);
  });
});

// ─── RG-17 ────────────────────────────────────────────────────────────────────
describe('RG-17: AML velocity de-bounce', () => {
  it('does not fire aml_velocity_flag more than once', () => {
    const session = new RGSession({ aml: { maxSpinsPerMinute: 2 } });
    // Trigger 5 spins quickly
    for (let i = 0; i < 5; i++) {
      session.recordSpin(1, 0, t0 + i * 10);
    }
    const velocityFlags = session.getEventLog().filter((e) => e.kind === 'aml_velocity_flag');
    expect(velocityFlags.length).toBe(1);
  });
});

// ─── RG-18 ────────────────────────────────────────────────────────────────────
describe('RG-18: AML win-rate sigma flag after 30+ all-win spins', () => {
  it('emits aml_velocity_flag for win-rate sigma after 30+ consecutive wins', () => {
    // All-win scenario: win rate = 1.0, expected = 0.35 → huge sigma
    const session = new RGSession({ aml: { winRateSigmaThreshold: 2.0 } });
    for (let i = 0; i < 35; i++) {
      session.recordSpin(1, 5, t0 + i * 5_000); // all wins, 5s apart
    }
    const allEvents = session.getEventLog();
    const sigmaFlags = allEvents.filter(
      (e) => e.kind === 'aml_velocity_flag' && typeof e.detail['sigma'] === 'number',
    );
    expect(sigmaFlags.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── RG-19 ────────────────────────────────────────────────────────────────────
describe('RG-19: cashOutHold required above threshold', () => {
  it('returns required=true when amount >= cashOutHoldThreshold', () => {
    const session = new RGSession({ aml: { cashOutHoldThreshold: 500 } });
    const result = session.cashOutHoldRequired(500);
    expect(result.required).toBe(true);
  });
});

// ─── RG-20 ────────────────────────────────────────────────────────────────────
describe('RG-20: cashOutHold false below threshold', () => {
  it('returns required=false when amount < cashOutHoldThreshold', () => {
    const session = new RGSession({ aml: { cashOutHoldThreshold: 500 } });
    const result = session.cashOutHoldRequired(499);
    expect(result.required).toBe(false);
  });
});

// ─── RG-21 ────────────────────────────────────────────────────────────────────
describe('RG-21: getState returns snapshot', () => {
  it('getState returns immutable snapshot of session state', () => {
    const session = new RGSession({ jurisdiction: 'IT', limits: { maxLossPerSession: 200 } });
    session.recordSpin(30, 10, t0);
    const state = session.getState();
    expect(state.jurisdiction).toBe('IT');
    expect(state.totalWagered).toBe(30);
    expect(state.totalWon).toBe(10);
    expect(state.netLoss).toBe(20);
    expect(state.spinCount).toBe(1);
    expect(state.limits.maxLossPerSession).toBe(200);
  });
});

// ─── RG-22 ────────────────────────────────────────────────────────────────────
describe('RG-22: getEventLog returns all events', () => {
  it('getEventLog contains all emitted events in order', () => {
    const session = new RGSession({
      limits: { realityCheckIntervalMs: 5_000, maxLossPerSession: 100 },
    });
    session.recordSpin(80, 0, t0);           // triggers warning
    session.recordSpin(1, 0, t0 + 5_000);   // triggers reality check
    const log = session.getEventLog();
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log.some((e) => e.kind === 'session_limit_warning')).toBe(true);
    expect(log.some((e) => e.kind === 'reality_check_due')).toBe(true);
  });
});

// ─── RG-23 ────────────────────────────────────────────────────────────────────
describe('RG-23: 10 spins accumulate correctly', () => {
  it('accumulates totals over 10 spins', () => {
    const session = new RGSession();
    for (let i = 0; i < 10; i++) {
      session.recordSpin(5, 2, t0 + i * 1_000);
    }
    const state = session.getState();
    expect(state.totalWagered).toBe(50);
    expect(state.totalWon).toBe(20);
    expect(state.netLoss).toBe(30);
    expect(state.spinCount).toBe(10);
  });
});

// ─── RG-24 ────────────────────────────────────────────────────────────────────
describe('RG-24: default jurisdiction has 0 min spin time', () => {
  it('never refuses for min spin time on default jurisdiction', () => {
    const session = new RGSession({ jurisdiction: 'default' });
    session.recordSpin(1, 0, t0);
    // Immediately try again — 0ms elapsed
    const result = session.checkSpinAllowed(1, t0);
    expect(result.allow).toBe(true);
  });
});

// ─── RG-25 ────────────────────────────────────────────────────────────────────
describe('RG-25: getAMLState returns AML state', () => {
  it('getAMLState reflects recorded spins and wins', () => {
    const session = new RGSession({ aml: { maxSpinsPerMinute: 100 } });
    session.recordSpin(5, 10, t0);
    session.recordSpin(5, 0, t0 + 1_000);
    const aml = session.getAMLState();
    expect(aml.totalSpins).toBe(2);
    expect(aml.totalWins).toBe(1);
    expect(aml.flagged).toBe(false);
  });
});
