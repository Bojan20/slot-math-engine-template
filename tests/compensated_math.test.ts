/**
 * W152 Wave 17 — CompensatedMathStateMachine tests (UK AWP cycleProgress).
 */

import { describe, it, expect } from 'vitest';
import {
  CompensatedMathStateMachine,
  type CompensatedMathConfig,
} from '../src/jurisdiction/compensatedMath.js';

const SIMPLE_CFG: CompensatedMathConfig = {
  targetRtp: 0.7,
  maxDeviationAbs: 0.04,
  cycleLengthSpins: 100,
};

describe('CompensatedMathStateMachine — construction', () => {
  it('rejects targetRtp out of range', () => {
    expect(() => new CompensatedMathStateMachine({ ...SIMPLE_CFG, targetRtp: -0.1 })).toThrow(RangeError);
    expect(() => new CompensatedMathStateMachine({ ...SIMPLE_CFG, targetRtp: 1.6 })).toThrow(RangeError);
  });
  it('rejects maxDeviationAbs out of [0, 1]', () => {
    expect(() => new CompensatedMathStateMachine({ ...SIMPLE_CFG, maxDeviationAbs: -0.01 })).toThrow(RangeError);
    expect(() => new CompensatedMathStateMachine({ ...SIMPLE_CFG, maxDeviationAbs: 1.5 })).toThrow(RangeError);
  });
  it('rejects non-positive integer cycleLengthSpins', () => {
    expect(() => new CompensatedMathStateMachine({ ...SIMPLE_CFG, cycleLengthSpins: 0 })).toThrow(RangeError);
    expect(() => new CompensatedMathStateMachine({ ...SIMPLE_CFG, cycleLengthSpins: -1 })).toThrow(RangeError);
    expect(() => new CompensatedMathStateMachine({ ...SIMPLE_CFG, cycleLengthSpins: 1.5 })).toThrow(RangeError);
  });
  it('initialises spinsRemaining to cycleLengthSpins', () => {
    const sm = new CompensatedMathStateMachine(SIMPLE_CFG);
    expect(sm.snapshot().spinsRemaining).toBe(100);
  });
});

describe('recordSpin — math + hint', () => {
  it('zero payout under-pays → hint says under_paying', () => {
    const sm = new CompensatedMathStateMachine(SIMPLE_CFG);
    const hint = sm.recordSpin(100, 0);
    expect(hint.direction).toBe('under_paying');
    expect(hint.deviation).toBeCloseTo(-0.7);
    expect(hint.urgency).toBe(1);
  });

  it('exact-target spin → hint says within_band', () => {
    const sm = new CompensatedMathStateMachine(SIMPLE_CFG);
    const hint = sm.recordSpin(100, 70);
    expect(hint.direction).toBe('within_band');
    expect(hint.deviation).toBeCloseTo(0);
    expect(hint.urgency).toBeCloseTo(0);
  });

  it('big over-pay → hint says over_paying with urgency=1', () => {
    const sm = new CompensatedMathStateMachine(SIMPLE_CFG);
    const hint = sm.recordSpin(100, 200);
    expect(hint.direction).toBe('over_paying');
    expect(hint.deviation).toBeGreaterThan(0);
    expect(hint.urgency).toBe(1);
  });

  it('cumulative tracking across spins', () => {
    const sm = new CompensatedMathStateMachine(SIMPLE_CFG);
    sm.recordSpin(100, 70);
    sm.recordSpin(100, 80);
    const s = sm.snapshot();
    expect(s.spinsInCycle).toBe(2);
    expect(s.cumulativeBetMinor).toBe(200);
    expect(s.cumulativePayoutMinor).toBe(150);
    expect(s.realisedRtp).toBeCloseTo(0.75);
    expect(s.spinsRemaining).toBe(98);
  });
});

describe('recordSpin — guards', () => {
  it('rejects negative bet/payout', () => {
    const sm = new CompensatedMathStateMachine(SIMPLE_CFG);
    expect(() => sm.recordSpin(-1, 0)).toThrow(RangeError);
    expect(() => sm.recordSpin(0, -1)).toThrow(RangeError);
  });

  it('rejects non-finite bet/payout', () => {
    const sm = new CompensatedMathStateMachine(SIMPLE_CFG);
    expect(() => sm.recordSpin(Infinity, 0)).toThrow(TypeError);
    expect(() => sm.recordSpin(NaN, 0)).toThrow(TypeError);
  });

  it('throws when cycle is full (cap=2 + 3rd spin)', () => {
    const sm = new CompensatedMathStateMachine({ ...SIMPLE_CFG, cycleLengthSpins: 2 });
    sm.recordSpin(100, 70);
    sm.recordSpin(100, 70);
    expect(() => sm.recordSpin(100, 70)).toThrow(/full/);
  });

  it('honours minStakeMinor', () => {
    const sm = new CompensatedMathStateMachine({ ...SIMPLE_CFG, minStakeMinor: 50 });
    expect(() => sm.recordSpin(40, 0)).toThrow(/below minStakeMinor/);
    sm.recordSpin(50, 0); // OK
  });
});

describe('resetCycle', () => {
  it('zeroes counters and bumps cycleId', () => {
    const sm = new CompensatedMathStateMachine(SIMPLE_CFG);
    sm.recordSpin(100, 70);
    sm.recordSpin(100, 50);
    sm.resetCycle();
    const s = sm.snapshot();
    expect(s.cycleId).toBe(1);
    expect(s.spinsInCycle).toBe(0);
    expect(s.cumulativeBetMinor).toBe(0);
    expect(s.cumulativePayoutMinor).toBe(0);
    expect(s.realisedRtp).toBe(0);
    expect(s.spinsRemaining).toBe(100);
  });
});

describe('serialize / deserialize round-trip', () => {
  it('preserves config and state', () => {
    const sm = new CompensatedMathStateMachine(SIMPLE_CFG);
    sm.recordSpin(100, 50);
    const snapshot = sm.serialize();
    const restored = CompensatedMathStateMachine.deserialize(snapshot);
    const s1 = sm.snapshot();
    const s2 = restored.snapshot();
    expect(s2).toEqual(s1);
  });

  it('restored machine continues incrementally', () => {
    const sm = new CompensatedMathStateMachine(SIMPLE_CFG);
    sm.recordSpin(100, 70);
    const restored = CompensatedMathStateMachine.deserialize(sm.serialize());
    restored.recordSpin(100, 70);
    expect(restored.snapshot().spinsInCycle).toBe(2);
    expect(restored.snapshot().cumulativeBetMinor).toBe(200);
  });
});

describe('cycleVerdict', () => {
  it('returns null while cycle is incomplete', () => {
    const sm = new CompensatedMathStateMachine({ ...SIMPLE_CFG, cycleLengthSpins: 5 });
    sm.recordSpin(100, 70);
    expect(sm.cycleVerdict()).toBeNull();
  });

  it('returns passed=true when final deviation within cap', () => {
    const sm = new CompensatedMathStateMachine({ ...SIMPLE_CFG, cycleLengthSpins: 5, maxDeviationAbs: 0.05 });
    for (let i = 0; i < 5; i++) sm.recordSpin(100, 70);
    const v = sm.cycleVerdict();
    expect(v).not.toBeNull();
    expect(v!.passed).toBe(true);
    expect(v!.cycleId).toBe(0);
  });

  it('returns passed=false when final deviation breaches cap', () => {
    const sm = new CompensatedMathStateMachine({
      targetRtp: 0.7,
      maxDeviationAbs: 0.05,
      cycleLengthSpins: 3,
    });
    sm.recordSpin(100, 100);
    sm.recordSpin(100, 100);
    sm.recordSpin(100, 100);
    const v = sm.cycleVerdict();
    expect(v!.passed).toBe(false);
    expect(v!.finalDeviation).toBeGreaterThan(0.05);
  });
});

describe('hint.remainingBudget', () => {
  it('positive when deviation is below cap', () => {
    const sm = new CompensatedMathStateMachine(SIMPLE_CFG);
    // Bet 100, payout 70 → realisedRtp 0.70, deviation 0 (well within cap 0.04).
    const h = sm.recordSpin(100, 70);
    expect(h.remainingBudget).toBeGreaterThan(0);
  });

  it('zero when deviation is at the cap', () => {
    const sm = new CompensatedMathStateMachine({ ...SIMPLE_CFG, maxDeviationAbs: 0.04 });
    const h = sm.recordSpin(100, 0); // 70 % under
    expect(h.remainingBudget).toBe(0);
  });
});
