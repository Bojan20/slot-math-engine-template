/**
 * CORTI W206-ONBOARDING — onboarding mini-app unit tests.
 * Pure logic only — DOM rendering is covered by Playwright e2e later.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PLANS,
  ALL_JURISDICTIONS,
  validateSignup,
  passwordStrength,
  planFor,
  defaultSignupForm,
} from '../src/data.js';
import {
  WIZARD_STEPS,
  loadWizardState,
  saveWizardState,
  resetWizardState,
  markStepComplete,
  skipStep,
  backStep,
  progressPercent,
  isWizardComplete,
} from '../src/wizard.js';
import type { WizardState } from '../src/types.js';

// ── mock storage for wizard tests ────────────────────────────────
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.get(k) ?? null; }
  setItem(k: string, v: string): void { this.m.set(k, v); }
  removeItem(k: string): void { this.m.delete(k); }
  get length(): number { return this.m.size; }
  clear(): void { this.m.clear(); }
  key(_i: number): string | null { return null; }
}

describe('plan catalog', () => {
  it('has exactly 3 tiers: trial, pro, enterprise', () => {
    expect(PLANS.length).toBe(3);
    expect(PLANS.map((p) => p.tier).sort()).toEqual(['enterprise', 'pro', 'trial']);
  });

  it('marks pro as the popular tier', () => {
    const popular = PLANS.filter((p) => p.popular);
    expect(popular.length).toBe(1);
    expect(popular[0].tier).toBe('pro');
  });

  it('planFor returns the plan for each tier', () => {
    expect(planFor('trial').name).toBe('Trial');
    expect(planFor('pro').name).toBe('Pro');
    expect(planFor('enterprise').name).toBe('Enterprise');
  });

  it('exposes 17 jurisdictions including UKGC + MGA + GENERIC', () => {
    expect(ALL_JURISDICTIONS).toContain('UKGC');
    expect(ALL_JURISDICTIONS).toContain('MGA');
    expect(ALL_JURISDICTIONS).toContain('GENERIC');
  });
});

describe('signup validation', () => {
  it('default form is invalid', () => {
    const r = validateSignup(defaultSignupForm());
    expect(r.ok).toBe(false);
    expect(r.errors.email).toBeDefined();
  });

  it('catches invalid email format', () => {
    const r = validateSignup({ ...defaultSignupForm(), email: 'not-an-email' });
    expect(r.errors.email).toBeDefined();
  });

  it('passes on a fully-filled valid form', () => {
    const r = validateSignup({
      email: 'boki@example.com',
      company: 'Acme Slots',
      jurisdiction: 'UKGC',
      useCase: 'L&W cert pipeline',
      password: 'GoodPass123!',
      confirmPassword: 'GoodPass123!',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects mismatched passwords', () => {
    const r = validateSignup({
      email: 'boki@example.com',
      company: 'Acme Slots',
      jurisdiction: 'UKGC',
      useCase: 'L&W cert pipeline',
      password: 'GoodPass123!',
      confirmPassword: 'OtherPass456!',
    });
    expect(r.errors.confirmPassword).toBeDefined();
  });

  it('rejects short company', () => {
    const r = validateSignup({
      email: 'boki@example.com',
      company: 'X',
      jurisdiction: 'UKGC',
      useCase: 'L&W cert pipeline',
      password: 'GoodPass123!',
      confirmPassword: 'GoodPass123!',
    });
    expect(r.errors.company).toBeDefined();
  });

  it('rejects unknown jurisdiction', () => {
    const r = validateSignup({
      email: 'boki@example.com',
      company: 'Acme',
      jurisdiction: 'ATLANTIS',
      useCase: 'L&W cert pipeline',
      password: 'GoodPass123!',
      confirmPassword: 'GoodPass123!',
    });
    expect(r.errors.jurisdiction).toBeDefined();
  });
});

describe('password strength meter', () => {
  it('returns 0 for empty', () => {
    expect(passwordStrength('').score).toBe(0);
  });
  it('rates a weak password 1-2', () => {
    expect(passwordStrength('abcdef').score).toBeLessThan(3);
  });
  it('rates a strong long password 3+', () => {
    expect(passwordStrength('GoodPass123!').score).toBeGreaterThanOrEqual(3);
  });
  it('rates 12+ chars with symbol as 4', () => {
    expect(passwordStrength('SuperStrong!2026X').score).toBe(4);
  });
});

describe('wizard state machine', () => {
  let store: MemStorage;
  let state: WizardState;

  beforeEach(() => {
    store = new MemStorage();
    state = loadWizardState(store);
  });

  it('starts at step 0 with empty completed set', () => {
    expect(state.current).toBe(0);
    expect(state.completed.size).toBe(0);
  });

  it('has 5 steps in canonical order', () => {
    expect(WIZARD_STEPS.length).toBe(5);
    expect(WIZARD_STEPS.map((s) => s.id)).toEqual(['workspace', 'gdd', 'play', 'certify', 'package']);
  });

  it('markStepComplete advances current pointer', () => {
    state = markStepComplete(state, 'workspace');
    expect(state.completed.has('workspace')).toBe(true);
    expect(state.current).toBe(1);
  });

  it('markStepComplete is idempotent', () => {
    state = markStepComplete(state, 'workspace');
    state = markStepComplete(state, 'workspace');
    expect(state.completed.size).toBe(1);
  });

  it('skipStep advances without marking complete', () => {
    state = skipStep(state);
    expect(state.current).toBe(1);
    expect(state.completed.size).toBe(0);
  });

  it('backStep decrements current pointer', () => {
    state = skipStep(state);
    state = backStep(state);
    expect(state.current).toBe(0);
  });

  it('progressPercent reflects completed count', () => {
    expect(progressPercent(state)).toBe(0);
    state = markStepComplete(state, 'workspace');
    expect(progressPercent(state)).toBe(20);
  });

  it('isWizardComplete only when all 5 done', () => {
    expect(isWizardComplete(state)).toBe(false);
    for (const step of WIZARD_STEPS) state = markStepComplete(state, step.id);
    expect(isWizardComplete(state)).toBe(true);
    expect(progressPercent(state)).toBe(100);
  });

  it('saveWizardState + loadWizardState round-trip via storage', () => {
    state = markStepComplete(state, 'workspace');
    state = markStepComplete(state, 'gdd');
    saveWizardState(state, store);
    const loaded = loadWizardState(store);
    expect(loaded.current).toBe(state.current);
    expect(loaded.completed.has('workspace')).toBe(true);
    expect(loaded.completed.has('gdd')).toBe(true);
  });

  it('resetWizardState wipes storage', () => {
    saveWizardState(markStepComplete(state, 'workspace'), store);
    resetWizardState(store);
    const loaded = loadWizardState(store);
    expect(loaded.completed.size).toBe(0);
  });

  it('backStep clamps at 0', () => {
    const s = backStep(backStep(state));
    expect(s.current).toBe(0);
  });

  it('skipStep clamps at last step', () => {
    let s = state;
    for (let i = 0; i < 10; i++) s = skipStep(s);
    expect(s.current).toBe(WIZARD_STEPS.length - 1);
  });
});
