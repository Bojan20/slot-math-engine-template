/**
 * W209 Faza 500.0 — kernel-test-runner specs (Agent A).
 */

import { describe, it, expect } from 'vitest';
import {
  runKernelTestBattery,
  formatVerdict,
  ALL_GATE_NAMES,
} from '../lib/kernel-test-runner.js';

const GOOD_KERNEL = `
import { defineKernel } from '@slot-math-engine/sdk';
export const kernel = defineKernel({
  name: 'demo',
  version: '1.0.0',
  family: 'cascade',
  paramSpec: [{ key: 'p', type: 'number', min: 0, max: 1 }],
  closedForm: (ctx, params) => {
    // deterministic — uses ctx.rng (seeded)
    const r = ctx.rng();
    return { rtp: (params.p as number) * 0.5, hitFrequency: r };
  },
});
`.trim();

const BAD_RANDOM = GOOD_KERNEL + '\nconst evil = Math.random();';
const BAD_NO_CLOSED_FORM = `
export const kernel = { name: 'broken', monteCarlo: () => 0 };
const r = ctx.rng();
`.trim();
const BAD_NAMING = GOOD_KERNEL.replace("'cascade'", "'Light & Wonder cascade'");
const BAD_ANY = GOOD_KERNEL + '\nconst evil: any = 1;';
const BAD_TODO = '// TODO implement\n';
const BAD_NOT_IMPL = GOOD_KERNEL + '\nfunction stub() { throw new Error("not implemented"); }';

describe('kernel-test-runner · happy path', () => {
  it('all 6 gates pass on a well-formed kernel', () => {
    const v = runKernelTestBattery(GOOD_KERNEL);
    expect(v.all_pass).toBe(true);
    expect(v.gates.length).toBe(6);
    expect(v.badgeGranted).toBe('verified');
    expect(v.synthetic).toBe(true);
  });

  it('emits every named gate exactly once', () => {
    const v = runKernelTestBattery(GOOD_KERNEL);
    const names = v.gates.map((g) => g.name).sort();
    expect(names).toEqual(ALL_GATE_NAMES.slice().sort());
  });

  it('duration_ms is positive', () => {
    const v = runKernelTestBattery(GOOD_KERNEL);
    expect(v.duration_ms).toBeGreaterThan(0);
  });
});

describe('kernel-test-runner · determinism gate', () => {
  it('FAILS when unseeded Math.random() is used', () => {
    const v = runKernelTestBattery(BAD_RANDOM);
    const g = v.gates.find((x) => x.name === 'determinism')!;
    expect(g.pass).toBe(false);
    expect(v.all_pass).toBe(false);
    expect(v.badgeGranted).toBeUndefined();
  });
});

describe('kernel-test-runner · closed-form gate', () => {
  it('FAILS when closedForm export is missing', () => {
    const v = runKernelTestBattery(BAD_NO_CLOSED_FORM);
    const g = v.gates.find((x) => x.name === 'closed-form-vs-mc')!;
    expect(g.pass).toBe(false);
  });

  it('rtpTolerance override threads through', () => {
    // Synthetic deviation is 0.018; if we tighten tolerance below that
    // the gate should FAIL.
    const v = runKernelTestBattery(GOOD_KERNEL, { rtpTolerance: 0.001 });
    const g = v.gates.find((x) => x.name === 'closed-form-vs-mc')!;
    expect(g.pass).toBe(false);
  });
});

describe('kernel-test-runner · performance gate', () => {
  it('FAILS when source exceeds 80KB', () => {
    const huge = GOOD_KERNEL + '\n// padding\n' + '/* '.repeat(50_000) + ' */';
    const v = runKernelTestBattery(huge);
    const g = v.gates.find((x) => x.name === 'performance')!;
    expect(g.pass).toBe(false);
  });
});

describe('kernel-test-runner · boundary gate', () => {
  it('FAILS on "not implemented" stub', () => {
    const v = runKernelTestBattery(BAD_NOT_IMPL);
    const g = v.gates.find((x) => x.name === 'boundary')!;
    expect(g.pass).toBe(false);
  });

  it('FAILS on TODO-only stub', () => {
    const v = runKernelTestBattery(BAD_TODO);
    const g = v.gates.find((x) => x.name === 'boundary')!;
    expect(g.pass).toBe(false);
  });
});

describe('kernel-test-runner · naming gate', () => {
  it('FAILS when reserved vendor term is found', () => {
    const v = runKernelTestBattery(BAD_NAMING);
    const g = v.gates.find((x) => x.name === 'naming')!;
    expect(g.pass).toBe(false);
    expect(g.message).toMatch(/Light/i);
  });

  it('reservedTerms override honored', () => {
    const code = GOOD_KERNEL + '\nconst note = "FooBar slots";';
    const v = runKernelTestBattery(code, { reservedTerms: ['FooBar'] });
    const g = v.gates.find((x) => x.name === 'naming')!;
    expect(g.pass).toBe(false);
  });
});

describe('kernel-test-runner · ts-strict gate', () => {
  it('FAILS on ": any" annotation', () => {
    const v = runKernelTestBattery(BAD_ANY);
    const g = v.gates.find((x) => x.name === 'ts-strict')!;
    expect(g.pass).toBe(false);
  });

  it('FAILS on @ts-ignore', () => {
    const code = GOOD_KERNEL + '\n// @ts-ignore\nconst x = 1;';
    const v = runKernelTestBattery(code);
    const g = v.gates.find((x) => x.name === 'ts-strict')!;
    expect(g.pass).toBe(false);
  });
});

describe('kernel-test-runner · misc', () => {
  it('throws on empty input', () => {
    expect(() => runKernelTestBattery('')).toThrow(/required/);
  });

  it('formatVerdict produces a multi-line summary', () => {
    const v = runKernelTestBattery(GOOD_KERNEL);
    const s = formatVerdict(v);
    expect(s).toMatch(/all_pass=true/);
    expect(s.split('\n').length).toBe(7); // header + 6 gates
  });
});
