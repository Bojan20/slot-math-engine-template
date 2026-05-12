/**
 * Faza 5.5 — Jackpot Two-Phase Commit
 *
 * 25 tests covering beginJackpot, commitJackpot, rollbackJackpot,
 * retryJackpot, expireTimedOut, contribute, canWin, must_hit_by logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JackpotManager } from '../src/jackpot/index.js';
import type { JackpotTier } from '../src/jackpot/index.js';

const t0 = 1_000_000;

function makeTier(overrides: Partial<JackpotTier> = {}): JackpotTier {
  return {
    name: 'Major',
    poolValue: 1000,
    seedValue: 100,
    contributionRate: 0.01,
    ...overrides,
  };
}

// ─── JP-01 ────────────────────────────────────────────────────────────────────
describe('JP-01: constructs with tiers', () => {
  it('constructs and stores tiers', () => {
    const mgr = new JackpotManager({ tiers: [makeTier()] });
    expect(mgr.getTier('Major')).toBeDefined();
  });
});

// ─── JP-02 ────────────────────────────────────────────────────────────────────
describe('JP-02: contribute increases pool by wager*rate', () => {
  it('single contribute adds wager * contributionRate', () => {
    const mgr = new JackpotManager({ tiers: [makeTier({ poolValue: 0 })] });
    mgr.contribute(1000);
    expect(mgr.getTier('Major')!.poolValue).toBeCloseTo(10);
  });
});

// ─── JP-03 ────────────────────────────────────────────────────────────────────
describe('JP-03: multiple contribute accumulates', () => {
  it('accumulates contributions over multiple calls', () => {
    const mgr = new JackpotManager({ tiers: [makeTier({ poolValue: 0 })] });
    mgr.contribute(1000);
    mgr.contribute(1000);
    mgr.contribute(1000);
    expect(mgr.getTier('Major')!.poolValue).toBeCloseTo(30);
  });
});

// ─── JP-04 ────────────────────────────────────────────────────────────────────
describe('JP-04: contribute emits tier_contributed', () => {
  it('emits tier_contributed event on each contribute', () => {
    const mgr = new JackpotManager({ tiers: [makeTier({ poolValue: 0 })] });
    mgr.contribute(500);
    const log = mgr.getEventLog();
    expect(log.some((e) => e.kind === 'tier_contributed')).toBe(true);
  });
});

// ─── JP-05 ────────────────────────────────────────────────────────────────────
describe('JP-05: canWin true when pool >= threshold', () => {
  it('canWin returns true when pool >= minThreshold', () => {
    const mgr = new JackpotManager({
      tiers: [makeTier({ poolValue: 200, minThreshold: 100 })],
    });
    expect(mgr.canWin('Major')).toBe(true);
  });
});

// ─── JP-06 ────────────────────────────────────────────────────────────────────
describe('JP-06: canWin false below threshold', () => {
  it('canWin returns false when pool < minThreshold', () => {
    const mgr = new JackpotManager({
      tiers: [makeTier({ poolValue: 50, minThreshold: 100 })],
    });
    expect(mgr.canWin('Major')).toBe(false);
  });
});

// ─── JP-07 ────────────────────────────────────────────────────────────────────
describe('JP-07: canWin false for unknown tier', () => {
  it('canWin returns false for unknown tier name', () => {
    const mgr = new JackpotManager({ tiers: [makeTier()] });
    expect(mgr.canWin('NonExistent')).toBe(false);
  });
});

// ─── JP-08 ────────────────────────────────────────────────────────────────────
describe('JP-08: beginJackpot returns non-empty pendingId', () => {
  it('beginJackpot returns a non-empty pendingId', () => {
    const mgr = new JackpotManager({ tiers: [makeTier()] });
    const { pendingId } = mgr.beginJackpot('spin-1', 'Major', t0);
    expect(pendingId).toBeTruthy();
    expect(pendingId.length).toBeGreaterThan(0);
  });
});

// ─── JP-09 ────────────────────────────────────────────────────────────────────
describe('JP-09: beginJackpot emits payment_required', () => {
  it('beginJackpot emits jackpot_payment_required', () => {
    const mgr = new JackpotManager({ tiers: [makeTier()] });
    const { events } = mgr.beginJackpot('spin-1', 'Major', t0);
    expect(events.some((e) => e.kind === 'jackpot_payment_required')).toBe(true);
  });
});

// ─── JP-10 ────────────────────────────────────────────────────────────────────
describe('JP-10: pool zeroed after beginJackpot', () => {
  it('pool is set to 0 after beginJackpot', () => {
    const mgr = new JackpotManager({ tiers: [makeTier({ poolValue: 1000 })] });
    mgr.beginJackpot('spin-1', 'Major', t0);
    expect(mgr.getTier('Major')!.poolValue).toBe(0);
  });
});

// ─── JP-11 ────────────────────────────────────────────────────────────────────
describe('JP-11: beginJackpot on pool=0 emits insufficient_funds', () => {
  it('emits jackpot_insufficient_funds when pool is 0', () => {
    const mgr = new JackpotManager({ tiers: [makeTier({ poolValue: 0 })] });
    const { events } = mgr.beginJackpot('spin-1', 'Major', t0);
    expect(events.some((e) => e.kind === 'jackpot_insufficient_funds')).toBe(true);
  });
});

// ─── JP-12 ────────────────────────────────────────────────────────────────────
describe('JP-12: commitJackpot resets tier to seedValue', () => {
  it('pool is reset to seedValue after commit', () => {
    const mgr = new JackpotManager({ tiers: [makeTier({ poolValue: 1000, seedValue: 100 })] });
    const { pendingId } = mgr.beginJackpot('spin-1', 'Major', t0);
    mgr.commitJackpot(pendingId, t0 + 100);
    expect(mgr.getTier('Major')!.poolValue).toBe(100);
  });
});

// ─── JP-13 ────────────────────────────────────────────────────────────────────
describe('JP-13: commitJackpot emits jackpot_committed', () => {
  it('emits jackpot_committed event on successful commit', () => {
    const mgr = new JackpotManager({ tiers: [makeTier()] });
    const { pendingId } = mgr.beginJackpot('spin-1', 'Major', t0);
    const events = mgr.commitJackpot(pendingId, t0 + 100);
    expect(events.some((e) => e.kind === 'jackpot_committed')).toBe(true);
  });
});

// ─── JP-14 ────────────────────────────────────────────────────────────────────
describe('JP-14: rollbackJackpot restores pool', () => {
  it('pool is restored to original amount after rollback', () => {
    const mgr = new JackpotManager({ tiers: [makeTier({ poolValue: 750 })] });
    const { pendingId } = mgr.beginJackpot('spin-1', 'Major', t0);
    expect(mgr.getTier('Major')!.poolValue).toBe(0);
    mgr.rollbackJackpot(pendingId, 'network_error', t0 + 100);
    expect(mgr.getTier('Major')!.poolValue).toBe(750);
  });
});

// ─── JP-15 ────────────────────────────────────────────────────────────────────
describe('JP-15: rollbackJackpot emits jackpot_rolled_back', () => {
  it('emits jackpot_rolled_back on rollback', () => {
    const mgr = new JackpotManager({ tiers: [makeTier()] });
    const { pendingId } = mgr.beginJackpot('spin-1', 'Major', t0);
    const events = mgr.rollbackJackpot(pendingId, 'test_reason', t0 + 100);
    expect(events.some((e) => e.kind === 'jackpot_rolled_back')).toBe(true);
  });
});

// ─── JP-16 ────────────────────────────────────────────────────────────────────
describe('JP-16: commit on rolled_back payment throws', () => {
  it('throws when committing an already rolled-back payment', () => {
    const mgr = new JackpotManager({ tiers: [makeTier()] });
    const { pendingId } = mgr.beginJackpot('spin-1', 'Major', t0);
    mgr.rollbackJackpot(pendingId, 'reason', t0 + 100);
    expect(() => mgr.commitJackpot(pendingId, t0 + 200)).toThrow();
  });
});

// ─── JP-17 ────────────────────────────────────────────────────────────────────
describe('JP-17: rollback on committed payment throws', () => {
  it('throws when rolling back an already committed payment', () => {
    const mgr = new JackpotManager({ tiers: [makeTier()] });
    const { pendingId } = mgr.beginJackpot('spin-1', 'Major', t0);
    mgr.commitJackpot(pendingId, t0 + 100);
    expect(() => mgr.rollbackJackpot(pendingId, 'late_rollback', t0 + 200)).toThrow();
  });
});

// ─── JP-18 ────────────────────────────────────────────────────────────────────
describe('JP-18: retryJackpot re-enables commit attempt', () => {
  it('after retry, payment status is pending and can be committed', () => {
    const mgr = new JackpotManager({ tiers: [makeTier()], maxRetries: 3 });
    const { pendingId } = mgr.beginJackpot('spin-1', 'Major', t0);
    // Simulate something that moved status away from pending via internal path
    // We'll call retry which should keep it pending (retryCount=1 <= 3)
    mgr.retryJackpot(pendingId, t0 + 100);
    const p = mgr.getPending(pendingId);
    expect(p!.status).toBe('pending');
    // Should still be committable
    const events = mgr.commitJackpot(pendingId, t0 + 200);
    expect(events.some((e) => e.kind === 'jackpot_committed')).toBe(true);
  });
});

// ─── JP-19 ────────────────────────────────────────────────────────────────────
describe('JP-19: retry beyond maxRetries marks failed', () => {
  it('marks payment failed after exceeding maxRetries', () => {
    const mgr = new JackpotManager({ tiers: [makeTier()], maxRetries: 2 });
    const { pendingId } = mgr.beginJackpot('spin-1', 'Major', t0);
    // Retry 3 times (exceeds maxRetries=2)
    mgr.retryJackpot(pendingId, t0 + 100);  // retryCount=1
    mgr.retryJackpot(pendingId, t0 + 200);  // retryCount=2
    mgr.retryJackpot(pendingId, t0 + 300);  // retryCount=3 > 2 → failed
    const p = mgr.getPending(pendingId);
    expect(p!.status).toBe('failed');
  });
});

// ─── JP-20 ────────────────────────────────────────────────────────────────────
describe('JP-20: expireTimedOut rolls back old payments (paymentTimeoutMs=0)', () => {
  it('rolls back pending payments when paymentTimeoutMs=0', () => {
    const mgr = new JackpotManager({ tiers: [makeTier({ poolValue: 500 })], paymentTimeoutMs: 0 });
    const { pendingId } = mgr.beginJackpot('spin-1', 'Major', t0);
    mgr.expireTimedOut(t0);
    const p = mgr.getPending(pendingId);
    expect(p!.status).toBe('rolled_back');
  });
});

// ─── JP-21 ────────────────────────────────────────────────────────────────────
describe('JP-21: getTier returns snapshot', () => {
  it('getTier returns a snapshot that does not mutate internal state', () => {
    const mgr = new JackpotManager({ tiers: [makeTier({ poolValue: 500 })] });
    const snap = mgr.getTier('Major')!;
    (snap as JackpotTier).poolValue = 9999;
    // Internal value should be unchanged
    expect(mgr.getTier('Major')!.poolValue).toBe(500);
  });
});

// ─── JP-22 ────────────────────────────────────────────────────────────────────
describe('JP-22: full two-phase commit scenario', () => {
  it('completes a full begin → commit cycle correctly', () => {
    const mgr = new JackpotManager({ tiers: [makeTier({ poolValue: 2000, seedValue: 200 })] });
    const { pendingId, events: beginEvents } = mgr.beginJackpot('spin-42', 'Major', t0);
    expect(beginEvents.some((e) => e.kind === 'jackpot_payment_required')).toBe(true);
    expect(mgr.getTier('Major')!.poolValue).toBe(0);

    const commitEvents = mgr.commitJackpot(pendingId, t0 + 5_000);
    expect(commitEvents.some((e) => e.kind === 'jackpot_committed')).toBe(true);
    expect(mgr.getTier('Major')!.poolValue).toBe(200);

    const p = mgr.getPending(pendingId)!;
    expect(p.status).toBe('committed');
    expect(p.amount).toBe(2000);
  });
});

// ─── JP-23 ────────────────────────────────────────────────────────────────────
describe('JP-23: network partition: rollback then re-begin then commit', () => {
  it('successfully re-begins and commits after a rollback', () => {
    const mgr = new JackpotManager({ tiers: [makeTier({ poolValue: 1500 })] });

    // First attempt - network partition
    const { pendingId: pid1 } = mgr.beginJackpot('spin-100', 'Major', t0);
    mgr.rollbackJackpot(pid1, 'network_partition', t0 + 500);
    // Pool restored
    expect(mgr.getTier('Major')!.poolValue).toBe(1500);

    // Second attempt - succeeds
    const { pendingId: pid2 } = mgr.beginJackpot('spin-101', 'Major', t0 + 1000);
    expect(pid2).toBeTruthy();
    const commitEvents = mgr.commitJackpot(pid2, t0 + 2000);
    expect(commitEvents.some((e) => e.kind === 'jackpot_committed')).toBe(true);
  });
});

// ─── JP-24 ────────────────────────────────────────────────────────────────────
describe('JP-24: must_hit_by_approaching fires at 90% of cap', () => {
  it('emits must_hit_by_approaching when pool reaches 90% of mustHitByMax', () => {
    const mgr = new JackpotManager({
      tiers: [makeTier({ poolValue: 0, mustHitByMax: 1000, contributionRate: 0.5 })],
    });
    // Contribute 1800 → 1800 * 0.5 = 900 = 90% of 1000
    mgr.contribute(1800);
    const log = mgr.getEventLog();
    expect(log.some((e) => e.kind === 'must_hit_by_approaching')).toBe(true);
  });
});

// ─── JP-25 ────────────────────────────────────────────────────────────────────
describe('JP-25: getEventLog contains all events', () => {
  it('event log accumulates all events across operations', () => {
    const mgr = new JackpotManager({ tiers: [makeTier({ poolValue: 500 })] });
    mgr.contribute(100);
    const { pendingId } = mgr.beginJackpot('spin-1', 'Major', t0);
    mgr.commitJackpot(pendingId, t0 + 500);

    const log = mgr.getEventLog();
    expect(log.some((e) => e.kind === 'tier_contributed')).toBe(true);
    expect(log.some((e) => e.kind === 'jackpot_payment_required')).toBe(true);
    expect(log.some((e) => e.kind === 'jackpot_committed')).toBe(true);
  });
});
