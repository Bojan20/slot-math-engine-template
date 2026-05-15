/**
 * W152 Wave 20 — tumbleAccumulator tests (Faza 15.C.1).
 */

import { describe, it, expect } from 'vitest';
import {
  TumbleAccumulator,
  expectedCascadeWin,
  type TumbleAccumulatorConfig,
} from '../src/features/tumbleAccumulator.js';

describe('TumbleAccumulator — construction', () => {
  it('rejects unknown mode', () => {
    expect(() => new TumbleAccumulator({ mode: 'wild' as 'none' })).toThrow();
  });
  it('rejects non-positive step', () => {
    expect(() => new TumbleAccumulator({ mode: 'additive', step: 0 })).toThrow(RangeError);
    expect(() => new TumbleAccumulator({ mode: 'additive', step: -1 })).toThrow(RangeError);
  });
  it('rejects non-positive cap', () => {
    expect(() => new TumbleAccumulator({ mode: 'additive', capX: 0 })).toThrow(RangeError);
  });
  it('rejects non-positive maxTumbles', () => {
    expect(() => new TumbleAccumulator({ mode: 'additive', maxTumbles: 0 })).toThrow(RangeError);
    expect(() => new TumbleAccumulator({ mode: 'additive', maxTumbles: 1.5 })).toThrow(RangeError);
  });
});

describe('TumbleAccumulator — none mode', () => {
  it('multiplier stays at initialMultiplier', () => {
    const t = new TumbleAccumulator({ mode: 'none' });
    t.recordStep(10);
    t.recordStep(5);
    t.recordStep(2);
    const r = t.result();
    expect(r.steps.every((s) => s.multiplier === 1)).toBe(true);
    expect(r.totalWinX).toBe(17);
    expect(r.finalMultiplier).toBe(1);
  });
});

describe('TumbleAccumulator — additive mode', () => {
  it('progresses 1, 2, 3, …', () => {
    const t = new TumbleAccumulator({ mode: 'additive' });
    t.recordStep(10); // multiplier 1 → 10
    t.recordStep(10); // multiplier 2 → 20
    t.recordStep(10); // multiplier 3 → 30
    const r = t.result();
    expect(r.steps[0].multiplier).toBe(1);
    expect(r.steps[1].multiplier).toBe(2);
    expect(r.steps[2].multiplier).toBe(3);
    expect(r.totalWinX).toBe(60);
  });
  it('respects cap', () => {
    const t = new TumbleAccumulator({ mode: 'additive', step: 5, capX: 10 });
    t.recordStep(1); // 1
    t.recordStep(1); // 6
    t.recordStep(1); // capped at 10
    t.recordStep(1); // stays at 10
    const r = t.result();
    expect(r.steps[3].multiplier).toBe(10);
  });
});

describe('TumbleAccumulator — multiplicative mode', () => {
  it('progresses 1, 2, 4, 8 by default step=2', () => {
    const t = new TumbleAccumulator({ mode: 'multiplicative' });
    t.recordStep(1);
    t.recordStep(1);
    t.recordStep(1);
    t.recordStep(1);
    const r = t.result();
    expect(r.steps.map((s) => s.multiplier)).toEqual([1, 2, 4, 8]);
  });
  it('honours custom step=3', () => {
    const t = new TumbleAccumulator({ mode: 'multiplicative', step: 3 });
    t.recordStep(1);
    t.recordStep(1);
    t.recordStep(1);
    expect(t.result().steps.map((s) => s.multiplier)).toEqual([1, 3, 9]);
  });
});

describe('TumbleAccumulator — guards', () => {
  it('rejects negative baseWinX', () => {
    const t = new TumbleAccumulator({ mode: 'none' });
    expect(() => t.recordStep(-1)).toThrow(RangeError);
  });
  it('throws when maxTumbles cap reached', () => {
    const t = new TumbleAccumulator({ mode: 'none', maxTumbles: 2 });
    t.recordStep(1);
    t.recordStep(1);
    expect(() => t.recordStep(1)).toThrow(/maxTumbles cap/);
  });
});

describe('TumbleAccumulator — result snapshot', () => {
  it('result() is repeatable without mutating state', () => {
    const t = new TumbleAccumulator({ mode: 'additive' });
    t.recordStep(10);
    t.recordStep(10);
    const r1 = t.result();
    const r2 = t.result();
    expect(r1.totalWinX).toBe(r2.totalWinX);
    expect(r1.steps.length).toBe(r2.steps.length);
  });
});

describe('expectedCascadeWin', () => {
  it('matches geometric sum for none mode', () => {
    // E = μ × Σ p^n for n=1.. = μ / (1-p)
    const e = expectedCascadeWin(0.5, 10, { mode: 'none', maxTumbles: 100 });
    expect(e).toBeCloseTo(20, 1); // 10 / 0.5 = 20 (truncated near-asymptote)
  });
  it('higher trigger probability → higher expected win', () => {
    const e1 = expectedCascadeWin(0.3, 10, { mode: 'additive', maxTumbles: 50 });
    const e2 = expectedCascadeWin(0.7, 10, { mode: 'additive', maxTumbles: 50 });
    expect(e2).toBeGreaterThan(e1);
  });
  it('rejects out-of-range probability', () => {
    expect(() => expectedCascadeWin(-0.1, 10, { mode: 'none' })).toThrow(RangeError);
    expect(() => expectedCascadeWin(1.0, 10, { mode: 'none' })).toThrow(RangeError);
  });
  it('rejects negative baseWinExpectation', () => {
    expect(() => expectedCascadeWin(0.5, -1, { mode: 'none' })).toThrow(RangeError);
  });
});

describe('TumbleAccumulator — capExhausted flag', () => {
  it('marks capExhausted=true when maxTumbles reached', () => {
    const t = new TumbleAccumulator({ mode: 'additive', maxTumbles: 3 });
    t.recordStep(1);
    t.recordStep(1);
    t.recordStep(1);
    expect(t.result().capExhausted).toBe(true);
  });
  it('marks capExhausted=false when below cap', () => {
    const t = new TumbleAccumulator({ mode: 'additive', maxTumbles: 50 });
    t.recordStep(1);
    expect(t.result().capExhausted).toBe(false);
  });
});
