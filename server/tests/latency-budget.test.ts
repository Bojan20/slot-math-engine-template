/**
 * W208 Faza 400.1 — latency budget tracker.
 */
import { describe, it, expect } from 'vitest';
import { LatencyBudgetTracker } from '../lib/latency-budget.js';

describe('LatencyBudgetTracker', () => {
  it('returns empty snapshot for untouched routes', () => {
    const t = new LatencyBudgetTracker({ budgets: [{ route: 'r1', p99Ms: 50 }] });
    const s = t.snapshot('r1');
    expect(s.count).toBe(0);
    expect(s.withinBudget).toBe(true);
  });

  it('records samples and computes p50/p95/p99', () => {
    const t = new LatencyBudgetTracker({ budgets: [{ route: 'r', p99Ms: 100 }] });
    for (let i = 1; i <= 100; i++) t.record('r', i);
    const s = t.snapshot('r');
    expect(s.count).toBe(100);
    expect(s.p50).toBeGreaterThanOrEqual(40);
    expect(s.p50).toBeLessThanOrEqual(60);
    expect(s.p99).toBeGreaterThanOrEqual(90);
    expect(s.max).toBe(100);
  });

  it('flags breaches when sample exceeds p99 budget', () => {
    let warned: Record<string, unknown> | null = null;
    const t = new LatencyBudgetTracker({
      budgets: [{ route: 'r', p99Ms: 50 }],
      warn: (_msg, ctx) => {
        warned = ctx;
      },
    });
    t.record('r', 5);
    expect(warned).toBeNull();
    t.record('r', 80);
    expect(warned).not.toBeNull();
    expect(t.snapshot('r').breaches).toBe(1);
  });

  it('marks withinBudget=false when p99 exceeds limit', () => {
    const t = new LatencyBudgetTracker({ budgets: [{ route: 'r', p99Ms: 10 }] });
    for (let i = 0; i < 50; i++) t.record('r', 20);
    const s = t.snapshot('r');
    expect(s.withinBudget).toBe(false);
  });

  it('track() wraps an async op and records its duration', async () => {
    const t = new LatencyBudgetTracker({ budgets: [{ route: 'op', p99Ms: 100 }] });
    const out = await t.track('op', async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 'done';
    });
    expect(out).toBe('done');
    const s = t.snapshot('op');
    expect(s.count).toBe(1);
    expect(s.p99).toBeGreaterThan(0);
  });

  it('snapshotAll lists every configured + observed route', () => {
    const t = new LatencyBudgetTracker({
      budgets: [
        { route: 'a', p99Ms: 10 },
        { route: 'b', p99Ms: 20 },
      ],
    });
    t.record('a', 5);
    t.record('c', 3); // ad-hoc untracked route
    const all = t.snapshotAll();
    const routes = all.map((x) => x.route).sort();
    expect(routes).toContain('a');
    expect(routes).toContain('b');
    expect(routes).toContain('c');
  });

  it('reset clears all samples', () => {
    const t = new LatencyBudgetTracker({ budgets: [{ route: 'r', p99Ms: 100 }] });
    t.record('r', 1);
    t.reset();
    expect(t.snapshot('r').count).toBe(0);
  });
});
