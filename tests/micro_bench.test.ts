/**
 * W152 Wave 24 — microBench tests.
 */

import { describe, it, expect } from 'vitest';
import { bench, benchSuite, formatBenchLine, toJSON } from '../src/bench/microBench.js';

describe('bench — basic', () => {
  it('runs and returns structured result', () => {
    const r = bench('noop', () => {}, { iterations: 1000, batches: 3, warmupIters: 10 });
    expect(r.name).toBe('noop');
    expect(r.iterations).toBe(1000);
    expect(r.batches).toBe(3);
    expect(r.totalIters).toBe(3000);
    expect(r.perIterMs.mean).toBeGreaterThanOrEqual(0);
  });

  it('produces sensible ops/sec for noop', () => {
    const r = bench('noop', () => {}, { iterations: 100_000, batches: 3, warmupIters: 100 });
    expect(r.opsPerSec).toBeGreaterThan(1_000_000); // noop should be fast
  });

  it('measures slower function as slower', () => {
    const fast = bench('fast', () => {}, { iterations: 10_000, batches: 3, warmupIters: 0 });
    const slow = bench(
      'slow',
      () => {
        let sum = 0;
        for (let i = 0; i < 100; i++) sum += Math.sqrt(i);
        // Use sum to prevent dead-code elimination
        if (sum < 0) throw new Error();
      },
      { iterations: 10_000, batches: 3, warmupIters: 0 },
    );
    expect(slow.perIterMs.mean).toBeGreaterThan(fast.perIterMs.mean);
  });
});

describe('bench — guards', () => {
  it('rejects empty name', () => {
    expect(() => bench('', () => {})).toThrow();
  });
  it('rejects non-positive batches', () => {
    expect(() => bench('x', () => {}, { batches: 0 })).toThrow(RangeError);
  });
  it('rejects negative warmupIters', () => {
    expect(() => bench('x', () => {}, { warmupIters: -1 })).toThrow(RangeError);
  });
  it('rejects non-positive targetBudgetMs', () => {
    expect(() => bench('x', () => {}, { targetBudgetMs: 0 })).toThrow(RangeError);
  });
});

describe('bench — calibration', () => {
  it('auto-calibrates when iterations not provided', () => {
    const r = bench('noop', () => {}, { targetBudgetMs: 5, batches: 2, warmupIters: 0 });
    expect(r.iterations).toBeGreaterThan(0);
  });
});

describe('bench — statistics', () => {
  it('computes p50/p95/p99 from per-iter measurements', () => {
    const r = bench('noop', () => {}, { iterations: 1000, batches: 5, warmupIters: 10 });
    expect(r.perIterMs.p50).toBeGreaterThanOrEqual(r.perIterMs.min);
    expect(r.perIterMs.p95).toBeGreaterThanOrEqual(r.perIterMs.p50);
    expect(r.perIterMs.p99).toBeGreaterThanOrEqual(r.perIterMs.p95);
    expect(r.perIterMs.max).toBeGreaterThanOrEqual(r.perIterMs.p99);
  });
  it('std-dev is non-negative', () => {
    const r = bench('noop', () => {}, { iterations: 1000, batches: 5, warmupIters: 10 });
    expect(r.perIterMs.stdDev).toBeGreaterThanOrEqual(0);
  });
});

describe('benchSuite', () => {
  it('aggregates multiple functions', () => {
    const suite = benchSuite('demo', [
      { name: 'a', fn: () => {}, opts: { iterations: 100, batches: 2, warmupIters: 0 } },
      { name: 'b', fn: () => {}, opts: { iterations: 100, batches: 2, warmupIters: 0 } },
    ]);
    expect(suite.results).toHaveLength(2);
    expect(suite.suiteName).toBe('demo');
    expect(suite.totalWallMs).toBeGreaterThanOrEqual(0);
  });
});

describe('formatBenchLine', () => {
  it('produces single-line summary', () => {
    const r = bench('noop', () => {}, { iterations: 100, batches: 2, warmupIters: 0 });
    const line = formatBenchLine(r);
    expect(line).toMatch(/noop/);
    expect(line).toMatch(/ns\/op/);
  });
});

describe('toJSON', () => {
  it('produces valid JSON', () => {
    const suite = benchSuite('demo', [
      { name: 'x', fn: () => {}, opts: { iterations: 100, batches: 1, warmupIters: 0 } },
    ]);
    const json = toJSON(suite);
    const parsed = JSON.parse(json);
    expect(parsed.suiteName).toBe('demo');
    expect(parsed.results).toHaveLength(1);
    expect(parsed.generatedAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
