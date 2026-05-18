/**
 * W209 Faza 500.0 — submit wizard specs (Agent A).
 */

import { describe, it, expect } from 'vitest';
import {
  makeInitialState,
  validateManifestStep,
  validateCodeStep,
  nextStep,
  prevStep,
  simulateGates,
  computeRevenueProjection,
  type WizardState,
} from '../src/submit-wizard.js';

const GOOD_CODE = `
import { defineKernel } from '@slot-math-engine/sdk';
export const kernel = defineKernel({
  name: 'demo', version: '1.0.0', family: 'cascade',
  paramSpec: [], closedForm: (ctx) => ({ rtp: ctx.rng() * 0.5, hitFrequency: 0.3 }),
});
`.trim();

describe('submit-wizard · initial state', () => {
  it('starts at step 1 with default manifest', () => {
    const s = makeInitialState('bojan');
    expect(s.step).toBe(1);
    expect(s.manifest.author).toBe('bojan');
    expect(s.manifest.license).toBe('MIT');
    expect(s.gateProgress.length).toBe(6);
  });
});

describe('submit-wizard · validateManifestStep', () => {
  it('passes a sane default manifest', () => {
    const s = makeInitialState('me');
    expect(validateManifestStep(s.manifest)).toBeNull();
  });

  it('flags bad name', () => {
    const s = makeInitialState('me');
    s.manifest.name = 'BadName!';
    expect(validateManifestStep(s.manifest)).toMatch(/kebab-case/);
  });

  it('flags bad p_id_target', () => {
    const s = makeInitialState('me');
    s.manifest.p_id_target = 'cascade';
    expect(validateManifestStep(s.manifest)).toMatch(/p_id_target/);
  });
});

describe('submit-wizard · validateCodeStep', () => {
  it('rejects too-short code', () => {
    expect(validateCodeStep('x')).toMatch(/>= 50/);
  });

  it('accepts a normal kernel module', () => {
    expect(validateCodeStep(GOOD_CODE)).toBeNull();
  });
});

describe('submit-wizard · state machine', () => {
  it('advances step 1 → 2 when manifest is valid', () => {
    const s = makeInitialState('me');
    const n = nextStep(s);
    expect(n.step).toBe(2);
    expect(n.error).toBeUndefined();
  });

  it('blocks step 1 → 2 when manifest is invalid (records error)', () => {
    const s = makeInitialState('me');
    s.manifest.description = 'x';
    const n = nextStep(s);
    expect(n.step).toBe(1);
    expect(n.error).toMatch(/description/);
  });

  it('advances step 2 → 3 when code is non-empty', () => {
    const s: WizardState = { ...makeInitialState('me'), step: 2, code: GOOD_CODE };
    const n = nextStep(s);
    expect(n.step).toBe(3);
  });

  it('prevStep goes back', () => {
    const s: WizardState = { ...makeInitialState('me'), step: 3 };
    expect(prevStep(s).step).toBe(2);
  });

  it('prevStep on step 1 stays at 1', () => {
    expect(prevStep(makeInitialState('me')).step).toBe(1);
  });
});

describe('submit-wizard · simulateGates', () => {
  it('all 6 pass for clean code', () => {
    const r = simulateGates(GOOD_CODE);
    expect(r.length).toBe(6);
    expect(r.every((g) => g.pass)).toBe(true);
  });

  it('determinism gate FAILS on unseeded Math.random()', () => {
    const r = simulateGates('const x = Math.random();');
    const g = r.find((x) => x.name === 'determinism')!;
    expect(g.pass).toBe(false);
  });

  it('naming gate FAILS on reserved vendor term', () => {
    const r = simulateGates(GOOD_CODE + '\n// IGT pattern');
    const g = r.find((x) => x.name === 'naming')!;
    expect(g.pass).toBe(false);
  });
});

describe('submit-wizard · computeRevenueProjection', () => {
  it('100 installs × $5 → $350 author monthly at 70%', () => {
    const p = computeRevenueProjection(100, 500, 70);
    expect(p.gross).toBe(50_000);
    expect(p.authorMonthly).toBe(35_000);
  });

  it('200 installs × $10 → $1500 author monthly at 75%', () => {
    const p = computeRevenueProjection(200, 1000, 75);
    expect(p.authorMonthly).toBe(150_000);
  });
});
