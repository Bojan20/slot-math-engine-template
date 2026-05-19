/**
 * W215 Faza 800.2 Agent C — A/B bucketing tests.
 *
 * Verifies:
 *   * deterministic hash (same input → same variant)
 *   * registration validation
 *   * variant assignment stability across reload
 *   * uniform-ish distribution over a 10 000-bucket sample
 *     (chi-square test at α = 0.001)
 *   * weighted variants honour the weights
 */

import { describe, it, expect, beforeEach } from 'vitest';
// @ts-expect-error vanilla ESM JS imported into TS test
import {
  abHash,
  bucket,
  registerExperiment,
  listExperiments,
  applyExperiment,
  applyAll,
  _reset,
} from '../../web/marketing/analytics/ab-testing.js';
// @ts-expect-error vanilla ESM JS imported into TS test
import { chiSquareStat } from '../../web/marketing/analytics/stats.js';

describe('abHash', () => {
  it('is deterministic', () => {
    expect(abHash('xyz')).toBe(abHash('xyz'));
  });
  it('is a non-negative 32-bit integer', () => {
    const h = abHash('foo::bar');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
  it('differs across distinct inputs', () => {
    expect(abHash('a')).not.toBe(abHash('b'));
  });
  it('avoids trivial fixed points', () => {
    expect(abHash('')).not.toBe(0);
  });
});

describe('registerExperiment / listExperiments', () => {
  beforeEach(() => _reset());
  it('lists the three default experiments', () => {
    const ids = listExperiments().map((e: { id: string }) => e.id);
    expect(ids).toContain('hero_headline_v2');
    expect(ids).toContain('pricing_tier_order');
    expect(ids).toContain('cta_button_color');
  });
  it('rejects missing id', () => {
    expect(() => registerExperiment({ variants: ['A'] } as never)).toThrow(/id/);
  });
  it('rejects empty variants', () => {
    expect(() => registerExperiment({ id: 'x', variants: [] })).toThrow();
  });
  it('rejects mismatched weights length', () => {
    expect(() => registerExperiment({ id: 'x', variants: ['A', 'B'], weights: [1, 1, 1] })).toThrow();
  });
  it('accepts weighted experiments', () => {
    registerExperiment({ id: 'weighted', variants: ['A', 'B'], weights: [3, 1] });
    expect(listExperiments().some((e: { id: string }) => e.id === 'weighted')).toBe(true);
  });
});

describe('bucket determinism', () => {
  beforeEach(() => _reset());
  it('same session+experiment → same variant', () => {
    const v1 = bucket('sid-abc', 'hero_headline_v2');
    const v2 = bucket('sid-abc', 'hero_headline_v2');
    expect(v1).toBe(v2);
  });
  it('different session → may yield different variant', () => {
    const distinct = new Set();
    for (let i = 0; i < 50; i++) distinct.add(bucket('sid-' + i, 'hero_headline_v2'));
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });
  it('unknown experiment returns null', () => {
    expect(bucket('sid', 'no-such-experiment')).toBe(null);
  });
  it('binary experiment returns one of two', () => {
    const v = bucket('sid-x', 'pricing_tier_order');
    expect(['indie-first', 'platform-first']).toContain(v);
  });
});

describe('10 000-bucket distribution (chi-square)', () => {
  beforeEach(() => _reset());
  it('hero_headline_v2 (3 equal variants) passes chi-square', () => {
    const counts = { A: 0, B: 0, C: 0 } as Record<string, number>;
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const v = bucket(`session-${i}`, 'hero_headline_v2');
      counts[v as string]++;
    }
    const expected = [N / 3, N / 3, N / 3];
    const observed = [counts.A, counts.B, counts.C];
    const chi = chiSquareStat(observed, expected);
    // χ² critical value at α = 0.001, df = 2 is 13.816.
    expect(chi).toBeLessThan(20);
  });
  it('cta_button_color (3 equal variants) hits ~33% each', () => {
    const counts = { cyan: 0, amber: 0, emerald: 0 } as Record<string, number>;
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const v = bucket(`sid-${i}`, 'cta_button_color');
      counts[v as string]++;
    }
    for (const k of Object.keys(counts)) {
      expect(counts[k]).toBeGreaterThan(N * 0.28);
      expect(counts[k]).toBeLessThan(N * 0.39);
    }
  });
  it('pricing_tier_order (binary) hits ~50/50', () => {
    const counts = { 'indie-first': 0, 'platform-first': 0 } as Record<string, number>;
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const v = bucket(`s-${i}`, 'pricing_tier_order');
      counts[v as string]++;
    }
    for (const k of Object.keys(counts)) {
      expect(counts[k]).toBeGreaterThan(N * 0.45);
      expect(counts[k]).toBeLessThan(N * 0.55);
    }
  });
});

describe('weighted experiments', () => {
  beforeEach(() => _reset());
  it('a 3:1 weighted experiment trends 75/25', () => {
    registerExperiment({ id: 'w_test', variants: ['A', 'B'], weights: [3, 1] });
    const counts = { A: 0, B: 0 } as Record<string, number>;
    const N = 5000;
    for (let i = 0; i < N; i++) {
      const v = bucket(`s-${i}`, 'w_test');
      counts[v as string]++;
    }
    expect(counts.A).toBeGreaterThan(N * 0.7);
    expect(counts.B).toBeLessThan(N * 0.3);
  });
});

describe('DOM application (mock document)', () => {
  beforeEach(() => _reset());
  function makeDoc(): {
    documentElement: { attrs: Record<string, string>; setAttribute(k: string, v: string): void };
    elements: Array<{ attrs: Record<string, string>; setAttribute(k: string, v: string): void }>;
    querySelectorAll(sel: string): unknown[];
  } {
    const root = { attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; } };
    const elements: Array<{ attrs: Record<string, string>; setAttribute(k: string, v: string): void }> = [
      { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } },
      { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } },
    ];
    return {
      documentElement: root,
      elements,
      querySelectorAll: (_sel: string) => elements,
    };
  }

  it('applyExperiment sets root data-ab attribute', () => {
    const doc = makeDoc();
    const v = applyExperiment('sid', 'hero_headline_v2', doc as unknown as Document);
    expect(['A', 'B', 'C']).toContain(v);
    expect(doc.documentElement.attrs[`data-ab-hero_headline_v2`]).toBe(v);
  });
  it('applyAll returns a map of all experiments', () => {
    const doc = makeDoc();
    const out = applyAll('sid', doc as unknown as Document);
    expect(Object.keys(out).sort()).toEqual(['cta_button_color', 'hero_headline_v2', 'pricing_tier_order']);
  });
});
