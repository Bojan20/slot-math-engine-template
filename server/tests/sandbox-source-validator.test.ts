/**
 * W215 Faza 1200.0 — Kernel Sandbox source-validator specs (Agent A, restart).
 */

import { describe, it, expect } from 'vitest';
import {
  validateKernelSource,
  collectExportedNames,
  formatViolations,
} from '../lib/kernel-sandbox/source-validator.js';

const GOOD = `
export function analyzeFoo(cfg) {
  return { rtp: cfg.p * 0.5 };
}
export function simulateFoo(cfg, n) {
  let s = 0;
  for (let i = 0; i < n; i++) s += cfg.p * 0.5;
  return { observed: s / n };
}
`.trim();

describe('validateKernelSource · happy path', () => {
  it('accepts a well-formed kernel', () => {
    const v = validateKernelSource(GOOD);
    expect(v.ok).toBe(true);
    expect(v.violations).toEqual([]);
  });

  it('lists the exported names', () => {
    const names = collectExportedNames(GOOD);
    expect(names.sort()).toEqual(['analyzeFoo', 'simulateFoo']);
  });
});

describe('validateKernelSource · critical denies', () => {
  it('blocks `eval(`', () => {
    const v = validateKernelSource(GOOD + '\nexport function analyzeBad(){ return eval("1"); }');
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'eval-call')).toBe(true);
  });

  it('blocks `new Function(...)`', () => {
    const v = validateKernelSource(GOOD + '\nexport function analyzeX(){ return new Function("return 1")(); }');
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'new-function')).toBe(true);
  });

  it('blocks `import(...)` (dynamic)', () => {
    const v = validateKernelSource(GOOD + '\nexport function analyzeI(){ return import("fs"); }');
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'dynamic-import')).toBe(true);
  });

  it('blocks `require(...)`', () => {
    const v = validateKernelSource(GOOD + '\nexport function analyzeR(){ return require("fs"); }');
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'require-call')).toBe(true);
  });

  it('blocks `process.*` access', () => {
    const v = validateKernelSource(GOOD + '\nexport function analyzeP(){ return process.env.HOME; }');
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'process-access')).toBe(true);
  });

  it('blocks core-module static import', () => {
    const v = validateKernelSource(`import x from 'fs';\n` + GOOD);
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'fs-import')).toBe(true);
  });
});

describe('validateKernelSource · high-severity denies', () => {
  it('blocks `__proto__` access', () => {
    const v = validateKernelSource(GOOD + '\nexport function analyzeP(){ return ({}).__proto__; }');
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'proto-property')).toBe(true);
  });

  it('blocks `constructor[...]` index', () => {
    const v = validateKernelSource(GOOD + '\nexport function analyzeC(o){ return o.constructor["name"]; }');
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'constructor-index')).toBe(true);
  });

  it('blocks `Reflect.*`', () => {
    const v = validateKernelSource(GOOD + '\nexport function analyzeR(){ return Reflect.get({}, "x"); }');
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'reflect-namespace')).toBe(true);
  });

  it('blocks `new Proxy(...)`', () => {
    const v = validateKernelSource(GOOD + '\nexport function analyzePr(){ return new Proxy({}, {}); }');
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'proxy-ctor')).toBe(true);
  });

  it('blocks `globalThis.*` mutation', () => {
    const v = validateKernelSource(GOOD + '\nexport function analyzeG(){ globalThis.x = 1; return 1; }');
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'global-this')).toBe(true);
  });
});

describe('validateKernelSource · export shape', () => {
  it('rejects empty source', () => {
    const v = validateKernelSource('');
    expect(v.ok).toBe(false);
    expect(v.violations[0].rule).toBe('empty-source');
  });

  it('rejects when no exports', () => {
    const v = validateKernelSource('const x = 1;');
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'no-exports')).toBe(true);
  });

  it('rejects export with disallowed prefix', () => {
    const v = validateKernelSource('export function evilThing(){ return 1; }');
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'disallowed-export')).toBe(true);
  });

  it('rejects `export default`', () => {
    const v = validateKernelSource(GOOD + '\nexport default 1;');
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'default-export')).toBe(true);
  });

  it('rejects `export *` wildcard re-export', () => {
    const v = validateKernelSource(GOOD + `\nexport * from 'foo';`);
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.rule === 'wildcard-reexport')).toBe(true);
  });

  it('accepts solve* prefix', () => {
    const v = validateKernelSource('export function solveThing(){ return 1; }\nexport function simulateThing(){ return 1; }');
    expect(v.ok).toBe(true);
  });
});

describe('validateKernelSource · misc', () => {
  it('rejects non-string input', () => {
    // @ts-expect-error — intentional bad type
    const v = validateKernelSource(123);
    expect(v.ok).toBe(false);
    expect(v.violations[0].rule).toBe('input-type');
  });

  it('formatViolations produces multi-line output', () => {
    const v = validateKernelSource('eval("x"); export function analyzeX(){return 0;}');
    expect(v.ok).toBe(false);
    const s = formatViolations(v.violations);
    expect(s).toMatch(/eval-call/);
    expect(s.split('\n').length).toBeGreaterThanOrEqual(1);
  });

  it('formatViolations on empty list', () => {
    expect(formatViolations([])).toBe('(no violations)');
  });

  it('reports line numbers (1-based) for matched patterns', () => {
    const src = `${GOOD}\n\n\neval("bad");\nexport function analyzeY(){return 0;}`;
    const v = validateKernelSource(src);
    const ev = v.violations.find((x) => x.rule === 'eval-call');
    expect(ev).toBeDefined();
    expect(ev!.line).toBeGreaterThan(1);
  });
});
