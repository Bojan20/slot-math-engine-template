/**
 * W152 Wave 20 — progressivePool tests (Faza 15.C.4).
 */

import { describe, it, expect } from 'vitest';
import {
  ProgressivePool,
  poolRtpContribution,
  expectedPoolSizeAtHit,
  totalProgressiveRtp,
  type ProgressiveTierConfig,
} from '../src/jackpot/progressivePool.js';

const MINI: ProgressiveTierConfig = {
  tierId: 'mini',
  seedValue: 100,
  contributionRate: 0.005,
  perSpinHitProbability: 1 / 10000,
};

describe('ProgressivePool — construction', () => {
  it('rejects negative seedValue', () => {
    expect(() => new ProgressivePool({ ...MINI, seedValue: -1 })).toThrow(RangeError);
  });
  it('rejects out-of-range contributionRate', () => {
    expect(() => new ProgressivePool({ ...MINI, contributionRate: -0.01 })).toThrow(RangeError);
    expect(() => new ProgressivePool({ ...MINI, contributionRate: 1.5 })).toThrow(RangeError);
  });
  it('rejects out-of-range perSpinHitProbability', () => {
    expect(() => new ProgressivePool({ ...MINI, perSpinHitProbability: 0 })).toThrow(RangeError);
    expect(() => new ProgressivePool({ ...MINI, perSpinHitProbability: 1.5 })).toThrow(RangeError);
  });
  it('rejects mustHitByMax <= seedValue', () => {
    expect(() => new ProgressivePool({ ...MINI, mustHitByMax: 50 })).toThrow(RangeError);
  });
  it('starts at seedValue', () => {
    const p = new ProgressivePool(MINI);
    expect(p.snapshot().currentValue).toBe(100);
  });
});

describe('ProgressivePool — contribute', () => {
  it('adds bet × rate to pool', () => {
    const p = new ProgressivePool(MINI);
    p.contribute(10);
    expect(p.snapshot().currentValue).toBeCloseTo(100.05);
  });
  it('rejects negative bet', () => {
    const p = new ProgressivePool(MINI);
    expect(() => p.contribute(-1)).toThrow(RangeError);
  });
  it('caps at mustHitByMax', () => {
    // contributionRate=0.005, bet=100000 → 500 per spin. 100 spins → 50000.
    // Cap at 200 → first contribution overshoots and gets clamped.
    const p = new ProgressivePool({ ...MINI, mustHitByMax: 200 });
    for (let i = 0; i < 100; i++) p.contribute(100000);
    expect(p.snapshot().currentValue).toBe(200);
  });
  it('emits contribution event', () => {
    const p = new ProgressivePool(MINI);
    const e = p.contribute(20);
    expect(e.kind).toBe('contribution');
    expect(e.contributedAmount).toBeCloseTo(0.1);
  });
});

describe('ProgressivePool — recordHit', () => {
  it('drops to seedValue and pays out current pool', () => {
    const p = new ProgressivePool(MINI);
    p.contribute(1000);
    expect(p.snapshot().currentValue).toBeCloseTo(105);
    const e = p.recordHit();
    expect(e.kind).toBe('hit');
    expect(e.payoutValue).toBeCloseTo(105);
    expect(p.snapshot().currentValue).toBe(100);
    expect(p.snapshot().totalHitsPaid).toBe(1);
  });
  it('resets spinsSinceLastHit', () => {
    const p = new ProgressivePool(MINI);
    p.contribute(10);
    p.contribute(10);
    p.contribute(10);
    expect(p.snapshot().spinsSinceLastHit).toBe(3);
    p.recordHit();
    expect(p.snapshot().spinsSinceLastHit).toBe(0);
  });
});

describe('ProgressivePool — eventLog', () => {
  it('records all events in order', () => {
    const p = new ProgressivePool(MINI);
    p.contribute(10);
    p.contribute(10);
    p.recordHit();
    const log = p.eventLog();
    expect(log).toHaveLength(3);
    expect(log[0].kind).toBe('contribution');
    expect(log[2].kind).toBe('hit');
  });
});

describe('ProgressivePool — reset', () => {
  it('returns to initial seedValue and zeroes counters', () => {
    const p = new ProgressivePool(MINI);
    p.contribute(100);
    p.recordHit();
    p.reset();
    const s = p.snapshot();
    expect(s.currentValue).toBe(100);
    expect(s.totalHitsPaid).toBe(0);
    expect(s.totalContributionsReceived).toBe(0);
  });
});

describe('poolRtpContribution', () => {
  it('returns contributionRate when seedValue=0', () => {
    expect(poolRtpContribution({ ...MINI, seedValue: 0 }, 1)).toBeCloseTo(0.005);
  });
  it('adds seed/avgInterval term', () => {
    const c = poolRtpContribution(MINI, 1);
    // 0.005 + (100 × 0.0001) / 1 = 0.005 + 0.01 = 0.015
    expect(c).toBeCloseTo(0.015);
  });
  it('rejects non-positive averageBet', () => {
    expect(() => poolRtpContribution(MINI, 0)).toThrow(RangeError);
    expect(() => poolRtpContribution(MINI, -1)).toThrow(RangeError);
  });
});

describe('expectedPoolSizeAtHit', () => {
  it('matches analytical formula', () => {
    const e = expectedPoolSizeAtHit(MINI, 1);
    // seed + rate × bet × 1/p = 100 + 0.005 × 1 × 10000 = 150
    expect(e).toBeCloseTo(150);
  });
});

describe('totalProgressiveRtp', () => {
  it('sums RTP across multiple tiers', () => {
    const tiers: ProgressiveTierConfig[] = [
      MINI,
      { tierId: 'major', seedValue: 1000, contributionRate: 0.01, perSpinHitProbability: 1 / 1000000 },
    ];
    const total = totalProgressiveRtp(tiers, 1);
    expect(total).toBeCloseTo(0.015 + 0.01 + 0.001, 5);
  });
});
