/**
 * W215 Faza 1200.0 — Kernel Sandbox test-harness specs (Agent A, restart).
 */

import { describe, it, expect } from 'vitest';
import { runHarness, formatHarnessReport, stableStringify } from '../lib/kernel-sandbox/test-harness.js';
import { runFullSandbox } from '../lib/kernel-test-runner.js';

const GOOD = `
export function analyzeFoo(cfg) {
  const p = (cfg && typeof cfg.p === 'number') ? cfg.p : 0.5;
  return { rtp: p * 0.5, hitFrequency: p, expectedPayoutPerSpin: p * 0.5 };
}
export function simulateFoo(cfg, n, seed) {
  const p = (cfg && typeof cfg.p === 'number') ? cfg.p : 0.5;
  let s = 0;
  const N = (n && n > 0) ? n : 1000;
  for (let i = 0; i < N; i++) s += p * 0.5;
  return { observed: s / N, observedExpectedPayoutPerSpin: s / N };
}
`.trim();

const BAD_NON_DETERMINISTIC = `
let __counter = 0;
export function analyzeFoo(cfg) {
  __counter++;
  return { rtp: __counter * 0.001 };
}
export function simulateFoo(cfg, n) {
  return { observed: 0.001 };
}
`.trim();

const BAD_THROWS = `
export function analyzeFoo(cfg) { throw new Error('bad'); }
export function simulateFoo(cfg, n) { return { observed: 0 }; }
`.trim();

const BAD_NO_SIMULATE = `
export function analyzeFoo(cfg) { return { rtp: 0.5 }; }
`.trim();

const BAD_RESERVED_TERM = `
// Vendor B cascade variant
export function analyzeFoo(cfg) { return { rtp: 0.5 }; }
export function simulateFoo(cfg, n) { return { observed: 0.5 }; }
`.trim();

describe('runHarness · all 6 gates pass on good kernel', () => {
  it('returns ok=true with all gates passing', () => {
    const r = runHarness(GOOD, { args: [{ p: 0.5 }] });
    if (!r.ok) {
      // Diagnostic when fixing — show what's failing.
      // eslint-disable-next-line no-console
      console.error(formatHarnessReport(r));
    }
    expect(r.ok).toBe(true);
    expect(r.gates.length).toBe(6);
    expect(r.gates.every((g) => g.pass)).toBe(true);
  });

  it('emits exactly the 6 expected gate names', () => {
    const r = runHarness(GOOD, { args: [{ p: 0.5 }] });
    const names = r.gates.map((g) => g.name).sort();
    expect(names).toEqual(['boundary', 'cf-vs-mc', 'determinism', 'module-shape', 'naming', 'performance']);
  });

  it('reports a positive duration', () => {
    const r = runHarness(GOOD, { args: [{ p: 0.5 }] });
    expect(r.durationMs).toBeGreaterThan(0);
  });
});

describe('runHarness · bad-kernel failure modes', () => {
  it('determinism gate fails on non-deterministic analyze*', () => {
    const r = runHarness(BAD_NON_DETERMINISTIC, { args: [{}] });
    const g = r.gates.find((x) => x.name === 'determinism')!;
    expect(g.pass).toBe(false);
  });

  it('cf-vs-mc gate fails when analyze* throws', () => {
    const r = runHarness(BAD_THROWS, { args: [{}] });
    const g = r.gates.find((x) => x.name === 'cf-vs-mc')!;
    expect(g.pass).toBe(false);
  });

  it('module-shape fails when simulate* missing', () => {
    const r = runHarness(BAD_NO_SIMULATE, { args: [{}] });
    const g = r.gates.find((x) => x.name === 'module-shape')!;
    expect(g.pass).toBe(false);
  });

  it('cf-vs-mc reports missing simulate*', () => {
    const r = runHarness(BAD_NO_SIMULATE, { args: [{}] });
    const g = r.gates.find((x) => x.name === 'cf-vs-mc')!;
    expect(g.pass).toBe(false);
    expect(g.message).toMatch(/simulate/);
  });

  it('naming gate fails on reserved vendor term', () => {
    const r = runHarness(BAD_RESERVED_TERM, { args: [{ p: 0.5 }] });
    const g = r.gates.find((x) => x.name === 'naming')!;
    expect(g.pass).toBe(false);
  });
});

describe('runHarness · resource exhaustion', () => {
  it('boundary gate fails when analyze* loops forever on any input', () => {
    const RUNAWAY = `
      export function analyzeFoo(cfg) { while(true){} return 0; }
      export function simulateFoo(cfg, n) { return { observed: 0 }; }
    `.trim();
    const r = runHarness(RUNAWAY, {
      limits: { cpuMs: 100, heapMb: 128, consoleLines: 100 },
      args: [{}],
    });
    const g = r.gates.find((x) => x.name === 'boundary')!;
    expect(g.pass).toBe(false);
  });

  it('performance gate fails when 10k calls exceed budget', () => {
    const SLOW = `
      export function analyzeFoo(cfg) {
        let s = 0;
        for (let i = 0; i < 100000; i++) s += Math.sqrt(i);
        return { rtp: s };
      }
      export function simulateFoo(cfg, n) { return { observed: 0 }; }
    `.trim();
    const r = runHarness(SLOW, {
      args: [{}],
      perfBudgetMs: 10, // absurdly tight
      perfCallCount: 100,
    });
    const g = r.gates.find((x) => x.name === 'performance')!;
    expect(g.pass).toBe(false);
  });
});

describe('runHarness · helpers', () => {
  it('stableStringify produces key-sorted output', () => {
    const a = stableStringify({ b: 1, a: 2 });
    const b = stableStringify({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it('formatHarnessReport contains every gate line', () => {
    const r = runHarness(GOOD, { args: [{ p: 0.5 }] });
    const s = formatHarnessReport(r);
    expect(s.split('\n').length).toBe(7); // header + 6 gates
  });
});

describe('runFullSandbox · integration with kernel-test-runner', () => {
  it('returns synthetic=false (real execution)', () => {
    const v = runFullSandbox(GOOD, { args: [{ p: 0.5 }] });
    expect(v.synthetic).toBe(false);
  });

  it('grants verified badge on full pass', () => {
    const v = runFullSandbox(GOOD, { args: [{ p: 0.5 }] });
    if (!v.all_pass) {
      // eslint-disable-next-line no-console
      console.error(v.gates);
    }
    expect(v.all_pass).toBe(true);
    expect(v.badgeGranted).toBe('verified');
  });

  it('returns 6 named gates', () => {
    const v = runFullSandbox(GOOD, { args: [{ p: 0.5 }] });
    expect(v.gates.length).toBe(6);
  });

  it('rejects source with eval before harness runs', () => {
    const v = runFullSandbox(`export function analyzeFoo(){ return eval('1'); }`, { args: [{}] });
    expect(v.all_pass).toBe(false);
    expect(v.synthetic).toBe(false);
  });

  it('throws on empty input', () => {
    expect(() => runFullSandbox('')).toThrow(/required/);
  });
});
