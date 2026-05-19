/**
 * W215 Faza 1200.0 — Kernel Sandbox executor specs (Agent A, restart).
 */

import { describe, it, expect } from 'vitest';
import {
  executeKernelSandbox,
  makeFrozenContext,
  makeConsoleProxy,
  rewriteExports,
} from '../lib/kernel-sandbox/executor.js';
import {
  DEFAULT_LIMITS,
  limitsForTier,
  mergeLimits,
  isCpuExceeded,
  isHeapExceeded,
  formatLimits,
} from '../lib/kernel-sandbox/resource-limits.js';

const GOOD = `
export function analyzeFoo(cfg) {
  const p = (cfg && cfg.p) || 0.5;
  return { rtp: p * 0.5, hitFrequency: p };
}
export function simulateFoo(cfg, n) {
  const p = (cfg && cfg.p) || 0.5;
  let s = 0;
  const N = n || 1000;
  for (let i = 0; i < N; i++) s += p * 0.5;
  return { observed: s / N };
}
`.trim();

describe('executeKernelSandbox · happy path', () => {
  it('runs a well-formed kernel without crashes', () => {
    const r = executeKernelSandbox(GOOD);
    expect(r.ok).toBe(true);
    expect(r.crashes).toEqual([]);
    expect(r.exportedFunctions.sort()).toEqual(['analyzeFoo', 'simulateFoo']);
  });

  it('invokes a named export and returns its value', () => {
    const r = executeKernelSandbox(GOOD, {
      invoke: { name: 'analyzeFoo', args: [{ p: 0.4 }] },
    });
    expect(r.ok).toBe(true);
    const v = r.returnValue as { rtp: number; hitFrequency: number };
    expect(v.rtp).toBeCloseTo(0.2, 6);
  });

  it('records timings for compile + execute', () => {
    const r = executeKernelSandbox(GOOD);
    expect(r.timings.compileMs).toBeGreaterThanOrEqual(0);
    expect(r.timings.executeMs).toBeGreaterThanOrEqual(0);
    expect(r.timings.totalMs).toBeGreaterThanOrEqual(r.timings.compileMs);
  });
});

describe('executeKernelSandbox · frozen globals', () => {
  it('blocks `require`', () => {
    const r = executeKernelSandbox(
      `export function analyzeX(){ return require('fs'); }`,
      { invoke: { name: 'analyzeX', args: [] } },
    );
    expect(r.ok).toBe(false);
    expect(r.crashes[0]?.kind).toBe('thrown');
  });

  it('blocks `process`', () => {
    const r = executeKernelSandbox(
      `export function analyzeX(){ return process.env.HOME; }`,
      { invoke: { name: 'analyzeX', args: [] } },
    );
    expect(r.ok).toBe(false);
  });

  it('blocks `Buffer`', () => {
    const r = executeKernelSandbox(
      `export function analyzeX(){ return Buffer.alloc(8); }`,
      { invoke: { name: 'analyzeX', args: [] } },
    );
    expect(r.ok).toBe(false);
  });

  it('blocks `setTimeout`', () => {
    const r = executeKernelSandbox(
      `export function analyzeX(){ setTimeout(()=>{},10); return 1; }`,
      { invoke: { name: 'analyzeX', args: [] } },
    );
    expect(r.ok).toBe(false);
  });

  it('blocks `Reflect`', () => {
    const r = executeKernelSandbox(
      `export function analyzeX(){ return Reflect.get({a:1},'a'); }`,
      { invoke: { name: 'analyzeX', args: [] } },
    );
    expect(r.ok).toBe(false);
  });

  it('disables code generation (eval/new Function fail)', () => {
    const r = executeKernelSandbox(
      `export function analyzeX(){ return eval('1+1'); }`,
      { invoke: { name: 'analyzeX', args: [] } },
    );
    expect(r.ok).toBe(false);
  });

  it('exposes Math/Number/JSON', () => {
    const r = executeKernelSandbox(
      `export function analyzeX(){ return JSON.parse('{"v": ' + Math.floor(Number("3.7")) + '}'); }`,
      { invoke: { name: 'analyzeX', args: [] } },
    );
    expect(r.ok).toBe(true);
    expect((r.returnValue as { v: number }).v).toBe(3);
  });
});

describe('executeKernelSandbox · console proxy', () => {
  it('captures console.log lines', () => {
    const r = executeKernelSandbox(
      `export function analyzeX(){ console.log('hello', 1); return 0; }`,
      { invoke: { name: 'analyzeX', args: [] } },
    );
    expect(r.consoleEntries.length).toBe(1);
    expect(r.consoleEntries[0].message).toMatch(/hello/);
  });

  it('caps captured lines at limit', () => {
    const r = executeKernelSandbox(
      `export function analyzeX(){ for (let i=0;i<5000;i++) console.log(i); return 0; }`,
      {
        limits: { cpuMs: 5_000, heapMb: 256, consoleLines: 100 },
        invoke: { name: 'analyzeX', args: [] },
      },
    );
    expect(r.consoleEntries.length).toBeLessThanOrEqual(100);
  });
});

describe('executeKernelSandbox · resource crashes', () => {
  it('CPU timeout fires on runaway loop', () => {
    const r = executeKernelSandbox(
      `export function analyzeX(){ while(true){} return 0; }`,
      {
        limits: { cpuMs: 150, heapMb: 128, consoleLines: 100 },
        invoke: { name: 'analyzeX', args: [] },
      },
    );
    expect(r.ok).toBe(false);
    expect(r.crashes.some((c) => c.kind === 'cpu-timeout')).toBe(true);
  });

  it('compile-error crash for unparseable source', () => {
    const r = executeKernelSandbox(`export function analyzeX(){ this is not js }`);
    expect(r.ok).toBe(false);
    expect(r.crashes[0]?.kind).toBe('compile-error');
  });

  it('thrown crash for runtime error', () => {
    const r = executeKernelSandbox(
      `export function analyzeX(){ throw new Error('boom'); }`,
      { invoke: { name: 'analyzeX', args: [] } },
    );
    expect(r.ok).toBe(false);
    expect(r.crashes[0]?.kind).toBe('thrown');
    expect(r.crashes[0]?.message).toMatch(/boom/);
  });
});

describe('rewriteExports', () => {
  it('captures `export function`', () => {
    const out = rewriteExports('export function analyzeX(){ return 1; }');
    expect(out).toMatch(/^function analyzeX/);
    expect(out).toMatch(/__exports\.analyzeX = analyzeX;/);
  });

  it('captures `export const`', () => {
    const out = rewriteExports('export const analyzeX = () => 1;');
    expect(out).toMatch(/^const analyzeX/);
    expect(out).toMatch(/__exports\.analyzeX = analyzeX;/);
  });

  it('strips static imports', () => {
    const out = rewriteExports(`import x from 'fs';\nexport function analyzeX(){return x;}`);
    expect(out).not.toMatch(/^import/);
  });
});

describe('resource-limits', () => {
  it('exposes per-tier defaults', () => {
    expect(limitsForTier('tier-1').cpuMs).toBe(10_000);
    expect(limitsForTier('tier-2').cpuMs).toBe(5_000);
    expect(limitsForTier('tier-3').cpuMs).toBe(2_000);
  });

  it('mergeLimits clamps to safe range', () => {
    const merged = mergeLimits(DEFAULT_LIMITS, { cpuMs: 999_999, heapMb: 9999 });
    expect(merged.cpuMs).toBeLessThanOrEqual(60_000);
    expect(merged.heapMb).toBeLessThanOrEqual(1_024);
  });

  it('mergeLimits rejects negative input', () => {
    expect(() => mergeLimits(DEFAULT_LIMITS, { cpuMs: -1 })).toThrow();
  });

  it('isCpuExceeded / isHeapExceeded boundary', () => {
    expect(isCpuExceeded(1001, 1000)).toBe(true);
    expect(isCpuExceeded(1000, 1000)).toBe(false);
    expect(isHeapExceeded(129, 128)).toBe(true);
    expect(isHeapExceeded(128, 128)).toBe(false);
  });

  it('formatLimits renders all fields', () => {
    const s = formatLimits(DEFAULT_LIMITS);
    expect(s).toMatch(/cpu=\d+ms/);
    expect(s).toMatch(/heap=\d+MiB/);
  });
});

describe('makeFrozenContext / makeConsoleProxy direct', () => {
  it('returns a sealed vm context', () => {
    const ctx = makeFrozenContext();
    expect(ctx).toBeDefined();
  });

  it('console proxy levels all push entries', () => {
    const sink: Array<{ level: string; message: string; tsMs: number }> = [];
    const proxy = makeConsoleProxy(sink, 1000) as Record<string, (...a: unknown[]) => void>;
    proxy.log('a');
    proxy.info('b');
    proxy.warn('c');
    proxy.error('d');
    expect(sink.length).toBe(4);
    expect(sink.map((e) => e.level)).toEqual(['log', 'info', 'warn', 'error']);
  });
});
