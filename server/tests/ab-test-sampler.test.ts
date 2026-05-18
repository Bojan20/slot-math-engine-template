/**
 * CORTI W207-ANALYTICS — Thompson Sampling A/B test.
 */
import { describe, it, expect } from 'vitest';
import { ABTestSampler } from '../lib/ab-test-sampler.js';

/** Deterministic Mulberry32 RNG. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('ABTestSampler', () => {
  it('throws when < 2 variants provided', () => {
    expect(() => new ABTestSampler([{ id: 'A' }])).toThrow();
  });

  it('initialises priors with α=β=1', () => {
    const s = new ABTestSampler([{ id: 'A' }, { id: 'B' }]);
    const snap = s.snapshot();
    expect(snap[0].alpha).toBe(1);
    expect(snap[0].beta).toBe(1);
    expect(snap[0].exposures).toBe(0);
  });

  it('update() increments α on conversion, β on miss', () => {
    const s = new ABTestSampler([{ id: 'A' }, { id: 'B' }]);
    s.update('A', true);
    s.update('A', true);
    s.update('A', false);
    const snap = s.snapshot();
    const a = snap.find((v) => v.id === 'A')!;
    expect(a.alpha).toBe(3); // 1 + 2 wins
    expect(a.beta).toBe(2);  // 1 + 1 loss
    expect(a.exposures).toBe(3);
    expect(a.conversions).toBe(2);
  });

  it('posterior mean approaches empirical conversion rate', () => {
    const s = new ABTestSampler([{ id: 'A' }, { id: 'B' }]);
    for (let i = 0; i < 100; i++) s.update('A', true);
    for (let i = 0; i < 100; i++) s.update('A', false);
    const means = s.posteriorMean();
    expect(means.A).toBeCloseTo(0.5, 1);
  });

  it('sample() picks the better variant more often after many updates', () => {
    const s = new ABTestSampler(
      [{ id: 'A' }, { id: 'B' }],
      { rng: seededRng(42), samples: 2000 }
    );
    // A converts 70%, B converts 30%.
    for (let i = 0; i < 200; i++) s.update('A', i % 10 < 7);
    for (let i = 0; i < 200; i++) s.update('B', i % 10 < 3);
    const split = s.trafficSplit();
    expect(split.A).toBeGreaterThan(split.B);
    expect(split.A).toBeGreaterThan(0.7);
  });

  it('confidence() reports near-1 for a clear winner', () => {
    const s = new ABTestSampler(
      [{ id: 'A' }, { id: 'B' }],
      { rng: seededRng(7), samples: 4000 }
    );
    for (let i = 0; i < 500; i++) s.update('A', true);
    for (let i = 0; i < 500; i++) s.update('B', false);
    expect(s.confidence('A')).toBeGreaterThan(0.95);
  });

  it('recommendation() promotes after enough evidence', () => {
    const s = new ABTestSampler(
      [{ id: 'A' }, { id: 'B' }],
      { rng: seededRng(13), samples: 4000 }
    );
    // Strong, separated samples — should converge.
    for (let i = 0; i < 800; i++) s.update('A', i % 10 < 8);
    for (let i = 0; i < 800; i++) s.update('B', i % 10 < 2);
    const rec = s.recommendation();
    expect(rec.winnerId).toBe('A');
    expect(rec.promote).toBe(true);
    expect(rec.confidence).toBeGreaterThan(0.95);
  });

  it('recommendation() does NOT promote when variants are tied', () => {
    const s = new ABTestSampler(
      [{ id: 'A' }, { id: 'B' }],
      { rng: seededRng(99), samples: 2000 }
    );
    for (let i = 0; i < 200; i++) s.update('A', i % 2 === 0);
    for (let i = 0; i < 200; i++) s.update('B', i % 2 === 0);
    const rec = s.recommendation();
    expect(rec.promote).toBe(false);
    expect(rec.confidence).toBeLessThan(0.95);
  });

  it('Thompson sampling converges after ~1000 samples', () => {
    const s = new ABTestSampler(
      [{ id: 'A' }, { id: 'B' }],
      { rng: seededRng(2026), samples: 3000 }
    );
    // 60/40 split — typical industry separation.
    for (let i = 0; i < 600; i++) s.update('A', i % 10 < 6);
    for (let i = 0; i < 600; i++) s.update('B', i % 10 < 4);
    expect(s.confidence('A')).toBeGreaterThan(0.85);
  });

  it('trafficSplit probabilities sum to ~1.0 across variants', () => {
    const s = new ABTestSampler(
      [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      { rng: seededRng(31), samples: 1500 }
    );
    for (let i = 0; i < 100; i++) {
      s.update('A', true);
      s.update('B', false);
      s.update('C', i % 3 === 0);
    }
    const split = s.trafficSplit();
    const sum = Object.values(split).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('reset() returns variants to fresh priors', () => {
    const s = new ABTestSampler([{ id: 'A' }, { id: 'B' }]);
    for (let i = 0; i < 50; i++) s.update('A', true);
    s.reset([{ id: 'A' }, { id: 'B' }]);
    const snap = s.snapshot();
    expect(snap.every((v) => v.alpha === 1 && v.beta === 1)).toBe(true);
  });

  it('update() with unknown variant throws', () => {
    const s = new ABTestSampler([{ id: 'A' }, { id: 'B' }]);
    expect(() => s.update('ZZ', true)).toThrow(/unknown variant/);
  });
});
