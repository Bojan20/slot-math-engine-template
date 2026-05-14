/**
 * W152 P1-10 — Jackpot test-coverage trojka (Jackpot slot).
 *
 * Closes audit gaps in `faza5_jackpot.test.ts` / `faza55_jackpot_resilience.test.ts`:
 *   - `contribute()` mustHitBy-cap clipping + approaching event at ≥90 %
 *   - `beginJackpot()` on empty tier emits `jackpot_insufficient_funds`
 *   - commit/rollback/retry/expire lifecycle state machine — invalid transitions
 *   - retryJackpot exceeding `maxRetries` resets pool to seed and emits `jackpot_failed`
 *   - `expireTimedOut` skips already-committed payments
 *   - multi-tier `contribute()` propagates contribution to every tier and stops at cap
 */

import { describe, expect, it } from 'vitest';
import { JackpotManager } from '../src/jackpot/manager.js';
import type { JackpotTier } from '../src/jackpot/types.js';

function tierA(over: Partial<JackpotTier> = {}): JackpotTier {
  return {
    name: 'Mini',
    poolValue: 100,
    seedValue: 100,
    contributionRate: 0.02,
    mustHitByMax: 1_000,
    ...over,
  };
}

function tierB(over: Partial<JackpotTier> = {}): JackpotTier {
  return {
    name: 'Major',
    poolValue: 500,
    seedValue: 500,
    contributionRate: 0.01,
    mustHitByMax: 5_000,
    minThreshold: 200,
    ...over,
  };
}

describe('P1-10 — Jackpot manager coverage gaps', () => {
  describe('contribute()', () => {
    it('clips pool at mustHitByMax and emits approaching when ≥ 90 % cap', () => {
      const mgr = new JackpotManager({
        tiers: [tierA({ poolValue: 850 })],
      });
      const events = mgr.contribute(10_000); // 10000 × 0.02 = 200 → would exceed cap of 1000
      const tier = mgr.getTier('Mini')!;
      expect(tier.poolValue).toBe(1_000);
      expect(events.find((e) => e.kind === 'must_hit_by_approaching')).toBeDefined();
    });

    it('contributes to every configured tier on a single wager', () => {
      const mgr = new JackpotManager({
        tiers: [tierA(), tierB()],
      });
      const events = mgr.contribute(100);
      const a = mgr.getTier('Mini')!;
      const b = mgr.getTier('Major')!;
      expect(a.poolValue).toBeCloseTo(100 + 100 * 0.02, 9);
      expect(b.poolValue).toBeCloseTo(500 + 100 * 0.01, 9);
      expect(
        events.filter((e) => e.kind === 'tier_contributed').map((e) => e.tierName),
      ).toEqual(['Mini', 'Major']);
    });

    it('does not emit approaching when below 90 % cap', () => {
      const mgr = new JackpotManager({
        tiers: [tierA({ poolValue: 100 })],
      });
      const events = mgr.contribute(1_000); // pool → 100 + 20 = 120 (12 % cap)
      expect(events.find((e) => e.kind === 'must_hit_by_approaching')).toBeUndefined();
    });
  });

  describe('canWin()', () => {
    it('returns false when below minThreshold', () => {
      const mgr = new JackpotManager({ tiers: [tierB({ poolValue: 150 })] });
      expect(mgr.canWin('Major')).toBe(false);
    });

    it('returns true at or above minThreshold', () => {
      const mgr = new JackpotManager({ tiers: [tierB({ poolValue: 250 })] });
      expect(mgr.canWin('Major')).toBe(true);
    });

    it('returns false for unknown tier', () => {
      const mgr = new JackpotManager({ tiers: [tierA()] });
      expect(mgr.canWin('Grand')).toBe(false);
    });
  });

  describe('beginJackpot() failure modes', () => {
    it('emits jackpot_insufficient_funds on empty pool and returns no pendingId', () => {
      const mgr = new JackpotManager({ tiers: [tierA({ poolValue: 0 })] });
      const { pendingId, events } = mgr.beginJackpot('spin-x', 'Mini');
      expect(pendingId).toBe('');
      const insufficient = events.find((e) => e.kind === 'jackpot_insufficient_funds');
      expect(insufficient).toBeDefined();
      expect(insufficient!.kind === 'jackpot_insufficient_funds' && insufficient.available).toBe(0);
    });

    it('emits jackpot_insufficient_funds on unknown tier', () => {
      const mgr = new JackpotManager({ tiers: [tierA()] });
      const { events } = mgr.beginJackpot('spin-x', 'Grand');
      expect(events.find((e) => e.kind === 'jackpot_insufficient_funds')).toBeDefined();
    });
  });

  describe('commit/rollback/retry state machine', () => {
    it('commit on already-committed payment throws', () => {
      const mgr = new JackpotManager({ tiers: [tierA()] });
      const { pendingId } = mgr.beginJackpot('s1', 'Mini');
      mgr.commitJackpot(pendingId);
      expect(() => mgr.commitJackpot(pendingId)).toThrow(/Cannot commit/);
    });

    it('rollback on committed payment throws', () => {
      const mgr = new JackpotManager({ tiers: [tierA()] });
      const { pendingId } = mgr.beginJackpot('s1', 'Mini');
      mgr.commitJackpot(pendingId);
      expect(() => mgr.rollbackJackpot(pendingId, 'reason')).toThrow(/Cannot rollback/);
    });

    it('commit on unknown pendingId throws', () => {
      const mgr = new JackpotManager({ tiers: [tierA()] });
      expect(() => mgr.commitJackpot('does-not-exist')).toThrow(/Unknown pendingId/);
    });

    it('commit past paymentTimeoutMs marks payment as failed', () => {
      const mgr = new JackpotManager({
        tiers: [tierA()],
        paymentTimeoutMs: 1_000,
      });
      const { pendingId } = mgr.beginJackpot('s1', 'Mini', 0);
      const events = mgr.commitJackpot(pendingId, 5_000);
      expect(events[0].kind).toBe('jackpot_failed');
      expect(
        events[0].kind === 'jackpot_failed' ? events[0].reason : '',
      ).toBe('payment_timeout');
    });

    it('rollback restores pool to original amount (not seed)', () => {
      const mgr = new JackpotManager({
        tiers: [tierA({ poolValue: 2_500, seedValue: 100 })],
      });
      const { pendingId } = mgr.beginJackpot('s1', 'Mini');
      // Pool got drained to 0 by begin.
      expect(mgr.getTier('Mini')!.poolValue).toBe(0);
      mgr.rollbackJackpot(pendingId, 'host-decline');
      // Pool restored to original 2500 — NOT to seed 100.
      expect(mgr.getTier('Mini')!.poolValue).toBe(2_500);
    });

    it('retryJackpot past maxRetries marks as failed and resets pool to seed', () => {
      const mgr = new JackpotManager({
        tiers: [tierA({ poolValue: 5_000, seedValue: 100 })],
        maxRetries: 2,
      });
      const { pendingId } = mgr.beginJackpot('s1', 'Mini');
      mgr.retryJackpot(pendingId);
      mgr.retryJackpot(pendingId);
      const events = mgr.retryJackpot(pendingId); // third retry > maxRetries
      expect(events[0].kind).toBe('jackpot_failed');
      expect(
        events[0].kind === 'jackpot_failed' ? events[0].reason : '',
      ).toBe('max_retries_exceeded');
      expect(mgr.getTier('Mini')!.poolValue).toBe(100); // back to seed
    });

    it('retryJackpot resets startedAt to extend timeout clock', () => {
      const mgr = new JackpotManager({
        tiers: [tierA()],
        paymentTimeoutMs: 1_000,
      });
      const { pendingId } = mgr.beginJackpot('s1', 'Mini', 0);
      mgr.retryJackpot(pendingId, 2_500); // would otherwise be expired
      const events = mgr.commitJackpot(pendingId, 3_200); // 700 ms after retry — within window
      expect(events[0].kind).toBe('jackpot_committed');
    });
  });

  describe('expireTimedOut()', () => {
    it('rolls back expired pending payments and ignores committed ones', () => {
      const mgr = new JackpotManager({
        tiers: [tierA(), tierB()],
        paymentTimeoutMs: 1_000,
      });
      const { pendingId: aId } = mgr.beginJackpot('s1', 'Mini', 0);
      const { pendingId: bId } = mgr.beginJackpot('s2', 'Major', 0);
      mgr.commitJackpot(aId, 500);

      const events = mgr.expireTimedOut(2_000);
      // Only b is expired → rolled back, with reason 'payment_timeout'.
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('jackpot_rolled_back');
      const rolled = events[0];
      expect(rolled.kind === 'jackpot_rolled_back' ? rolled.pendingId : '').toBe(bId);
      expect(rolled.kind === 'jackpot_rolled_back' ? rolled.reason : '').toBe('payment_timeout');
    });

    it('returns no events when nothing is expired', () => {
      const mgr = new JackpotManager({ tiers: [tierA()], paymentTimeoutMs: 5_000 });
      mgr.beginJackpot('s1', 'Mini', 0);
      const events = mgr.expireTimedOut(1_000);
      expect(events).toEqual([]);
    });
  });

  describe('event log accumulator', () => {
    it('accumulates all events across the full lifecycle', () => {
      const mgr = new JackpotManager({ tiers: [tierA()] });
      mgr.contribute(50);
      const { pendingId } = mgr.beginJackpot('s1', 'Mini');
      mgr.commitJackpot(pendingId);
      const log = mgr.getEventLog();
      const kinds = log.map((e) => e.kind);
      expect(kinds).toContain('tier_contributed');
      expect(kinds).toContain('jackpot_payment_required');
      expect(kinds).toContain('jackpot_committed');
    });
  });
});
