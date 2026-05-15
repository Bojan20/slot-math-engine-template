/**
 * W152 Wave 18 — preBaked RNG tests (Faza 15.A.12).
 */

import { describe, it, expect } from 'vitest';
import {
  buildPreBaked,
  pickPreBaked,
  bulkPickPreBaked,
  estimateMemoryBytes,
  describePreBaked,
  MAX_PRE_BAKED_LENGTH,
} from '../src/rng/preBaked.js';

describe('buildPreBaked', () => {
  it('produces array with exact symbol counts', () => {
    const d = buildPreBaked({ A: 3, B: 2, C: 1 });
    expect(d.length).toBe(6);
    expect(d.array.filter((s) => s === 'A')).toHaveLength(3);
    expect(d.array.filter((s) => s === 'B')).toHaveLength(2);
    expect(d.array.filter((s) => s === 'C')).toHaveLength(1);
  });
  it('orders symbols alphabetically (deterministic)', () => {
    const d = buildPreBaked({ Z: 1, A: 1, M: 1 });
    expect(d.array).toEqual(['A', 'M', 'Z']);
  });
  it('rejects empty map', () => {
    expect(() => buildPreBaked({})).toThrow(/empty/);
  });
  it('rejects non-integer weight', () => {
    expect(() => buildPreBaked({ A: 1.5 })).toThrow(TypeError);
  });
  it('rejects negative weight', () => {
    expect(() => buildPreBaked({ A: -1 })).toThrow(RangeError);
  });
  it('rejects all-zero weights', () => {
    expect(() => buildPreBaked({ A: 0, B: 0 })).toThrow(/total weight is zero/);
  });
  it('rejects oversized total', () => {
    expect(() => buildPreBaked({ X: MAX_PRE_BAKED_LENGTH + 1 })).toThrow(/exceeds MAX/);
  });
  it('immutable result', () => {
    const d = buildPreBaked({ A: 1 });
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.isFrozen(d.array)).toBe(true);
  });
});

describe('pickPreBaked', () => {
  it('returns first symbol at uniformU=0', () => {
    const d = buildPreBaked({ A: 3, B: 2 });
    expect(pickPreBaked(d, 0)).toBe('A');
  });
  it('returns last symbol near uniformU=0.999...', () => {
    const d = buildPreBaked({ A: 3, B: 2 });
    expect(pickPreBaked(d, 0.99999)).toBe('B');
  });
  it('rejects out-of-range uniformU', () => {
    const d = buildPreBaked({ A: 1 });
    expect(() => pickPreBaked(d, 1)).toThrow(RangeError);
    expect(() => pickPreBaked(d, -0.01)).toThrow(RangeError);
    expect(() => pickPreBaked(d, NaN)).toThrow(RangeError);
  });
  it('weight distribution holds across many draws', () => {
    const d = buildPreBaked({ A: 7, B: 3 }); // 70/30
    let aCount = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      if (pickPreBaked(d, i / N) === 'A') aCount++;
    }
    expect(aCount / N).toBeGreaterThan(0.68);
    expect(aCount / N).toBeLessThan(0.72);
  });
});

describe('bulkPickPreBaked', () => {
  it('returns one pick per uniform', () => {
    const d = buildPreBaked({ A: 1 });
    const picks = bulkPickPreBaked(d, [0, 0.5, 0.999]);
    expect(picks).toEqual(['A', 'A', 'A']);
  });
});

describe('estimateMemoryBytes', () => {
  it('scales linearly with length', () => {
    const small = buildPreBaked({ A: 10 });
    const large = buildPreBaked({ A: 1000 });
    expect(estimateMemoryBytes(large)).toBeGreaterThan(estimateMemoryBytes(small));
  });
});

describe('describePreBaked', () => {
  it('emits a JSON-shaped diagnostic', () => {
    const d = buildPreBaked({ A: 3, B: 2 });
    const desc = describePreBaked(d);
    expect(desc).toMatchObject({
      length: 5,
      uniqueSymbols: 2,
      weights: { A: 3, B: 2 },
    });
  });
});
