/**
 * W212 Faza 600.1 — Latency budget circuit breaker tests (Agent C).
 */
import { describe, it, expect } from 'vitest';
import {
  LatencyBudgetTracker,
  LatencyBudgetCircuitBreaker,
  CircuitOpenError,
  enforceLatencyBudget,
} from '../lib/latency-budget.js';

function makeBreaker(opts: { p99Ms?: number; now?: () => number } = {}) {
  const tracker = new LatencyBudgetTracker({
    budgets: [{ route: 'r', p99Ms: opts.p99Ms ?? 50 }],
  });
  const breaker = new LatencyBudgetCircuitBreaker(tracker, {
    consecutiveBreachesToOpen: 3,
    openDurationMs: 1_000,
    now: opts.now,
  });
  return { tracker, breaker };
}

describe('LatencyBudgetCircuitBreaker — initial state', () => {
  it('starts closed', () => {
    const { breaker } = makeBreaker();
    expect(breaker.getState('r')).toBe('closed');
  });

  it('returns empty snapshot for untouched route', () => {
    const { breaker } = makeBreaker();
    const s = breaker.snapshot('r');
    expect(s.trips).toBe(0);
    expect(s.state).toBe('closed');
  });

  it('snapshotAll returns no entries before any record/evaluate', () => {
    const { breaker } = makeBreaker();
    expect(breaker.snapshotAll().length).toBe(0);
  });
});

describe('LatencyBudgetCircuitBreaker — trip on sustained breach', () => {
  it('opens after consecutive evaluations over budget', () => {
    const { breaker } = makeBreaker();
    // 50 samples well over budget → p99 will be high
    for (let i = 0; i < 50; i++) breaker.record('r', 200);
    // record() auto-evaluates so by the 3rd recorded breach the circuit
    // should be open.
    expect(breaker.getState('r')).toBe('open');
  });

  it('stays closed when only intermittent breach', () => {
    const { breaker } = makeBreaker();
    for (let i = 0; i < 50; i++) breaker.record('r', 10); // baseline
    breaker.record('r', 200); // one over
    expect(breaker.getState('r')).not.toBe('open');
  });

  it('counts trips', () => {
    const { breaker } = makeBreaker();
    for (let i = 0; i < 50; i++) breaker.record('r', 500);
    expect(breaker.snapshot('r').trips).toBeGreaterThanOrEqual(1);
  });
});

describe('LatencyBudgetCircuitBreaker — enforce()', () => {
  it('does not throw when closed', () => {
    const { breaker } = makeBreaker();
    expect(() => breaker.enforce('r')).not.toThrow();
  });

  it('throws CircuitOpenError when open', () => {
    const { breaker } = makeBreaker();
    breaker.trip('r');
    expect(() => breaker.enforce('r')).toThrow(CircuitOpenError);
  });

  it('transitions to half-open after openDurationMs elapses', () => {
    let now = 1_000_000;
    const { breaker } = makeBreaker({ now: () => now });
    breaker.trip('r');
    expect(() => breaker.enforce('r')).toThrow(CircuitOpenError);
    now += 2_000; // > openDurationMs
    expect(() => breaker.enforce('r')).not.toThrow();
    expect(breaker.getState('r')).toBe('half-open');
  });
});

describe('LatencyBudgetCircuitBreaker — half-open probe', () => {
  it('only one probe allowed in half-open', () => {
    let now = 1_000_000;
    const { breaker } = makeBreaker({ now: () => now });
    breaker.trip('r');
    now += 2_000;
    expect(() => breaker.enforce('r')).not.toThrow();  // probe 1
    expect(() => breaker.enforce('r')).toThrow(CircuitOpenError); // probe 2 blocked
  });

  it('closes when probe succeeds (below budget)', () => {
    let now = 1_000_000;
    const { breaker } = makeBreaker({ now: () => now });
    breaker.trip('r');
    now += 2_000;
    breaker.enforce('r'); // probe through
    // Probe completes fast → record + evaluate
    breaker.record('r', 5);
    expect(breaker.getState('r')).toBe('closed');
  });

  it('re-opens when probe fails (over budget)', () => {
    let now = 1_000_000;
    const { breaker } = makeBreaker({ now: () => now });
    breaker.trip('r');
    now += 2_000;
    breaker.enforce('r');
    // Saturate the reservoir so p99 stays above the 50ms budget for the
    // half-open evaluation.
    for (let i = 0; i < 80; i++) breaker.record('r', 500);
    expect(breaker.getState('r')).toBe('open');
  });
});

describe('LatencyBudgetCircuitBreaker — admin controls', () => {
  it('trip() forces open state', () => {
    const { breaker } = makeBreaker();
    breaker.trip('r');
    expect(breaker.getState('r')).toBe('open');
  });

  it('reset(route) clears state for that route', () => {
    const { breaker } = makeBreaker();
    breaker.trip('r');
    breaker.reset('r');
    expect(breaker.getState('r')).toBe('closed');
  });

  it('reset() clears all routes', () => {
    const { breaker } = makeBreaker();
    breaker.trip('r');
    breaker.reset();
    expect(breaker.snapshotAll().length).toBe(0);
  });
});

describe('LatencyBudgetCircuitBreaker — enforceLatencyBudget middleware', () => {
  it('returns a function that throws on open', () => {
    const { breaker } = makeBreaker();
    const enforce = enforceLatencyBudget(breaker);
    breaker.trip('r');
    expect(() => enforce('r')).toThrow(CircuitOpenError);
  });

  it('returns a function that passes on closed', () => {
    const { breaker } = makeBreaker();
    const enforce = enforceLatencyBudget(breaker);
    expect(() => enforce('r')).not.toThrow();
  });
});
