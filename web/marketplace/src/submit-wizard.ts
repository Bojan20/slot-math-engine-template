/**
 * W209 Faza 500.0 — Marketplace submit wizard (Agent A).
 *
 * Four-step wizard for submitting a new kernel:
 *
 *   1. Manifest fields  — name / version / author / license / p_id / etc.
 *   2. Upload code      — textarea (file picker comes in W215)
 *   3. Run gates        — live progress on the 6 test gates
 *   4. Confirm          — submission id + auto-granted badges
 *
 * The wizard is renderable to any DOM host (the marketplace UI hosts it
 * in a modal). It exposes a pure state-machine surface that's easy to
 * drive from tests.
 */

import { el, clear } from '@shared/dom.js';

export type WizardStep = 1 | 2 | 3 | 4;

export type GateName =
  | 'determinism'
  | 'closed-form-vs-mc'
  | 'performance'
  | 'boundary'
  | 'naming'
  | 'ts-strict';

export interface WizardManifestDraft {
  name: string;
  version: string;
  author: string;
  license: 'MIT' | 'Apache-2.0' | 'BSD-3-Clause' | 'GPL-3.0' | 'proprietary';
  p_id_target: string;
  category: string;
  description: string;
  math_summary: string;
  certification_level: 'verified' | 'endorsed' | 'production-proven';
}

export interface WizardState {
  step: WizardStep;
  manifest: WizardManifestDraft;
  code: string;
  gateProgress: Array<{ name: GateName; pass: boolean | null; message: string }>;
  submissionId?: string;
  autoBadges?: string[];
  /** Error from validation, surfaced inline. */
  error?: string;
}

const GATE_NAMES: GateName[] = [
  'determinism',
  'closed-form-vs-mc',
  'performance',
  'boundary',
  'naming',
  'ts-strict',
];

export function makeInitialState(authorId: string): WizardState {
  return {
    step: 1,
    manifest: {
      name: 'my-new-kernel',
      version: '0.1.0',
      author: authorId,
      license: 'MIT',
      p_id_target: 'P-MISC-NEW-001',
      category: 'misc',
      description: 'Describe what your kernel does in 1-2 sentences.',
      math_summary: 'Briefly summarise the closed-form math.',
      certification_level: 'verified',
    },
    code: '',
    gateProgress: GATE_NAMES.map((n) => ({ name: n, pass: null, message: 'pending' })),
  };
}

/** Validate step-1 manifest. Returns null on OK, error string otherwise. */
export function validateManifestStep(m: WizardManifestDraft): string | null {
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(m.name)) return 'name must be kebab-case 3-64 chars';
  if (!/^\d+\.\d+\.\d+/.test(m.version)) return 'version must be SemVer';
  if (m.description.length < 10) return 'description must be >= 10 chars';
  if (!/^P-[A-Z0-9-]+$/.test(m.p_id_target)) return 'p_id_target must match /^P-[A-Z0-9-]+$/';
  return null;
}

/** Validate step-2 code blob. */
export function validateCodeStep(code: string): string | null {
  if (!code || code.length < 50) return 'kernel code must be >= 50 chars';
  if (code.length > 500_000) return 'kernel code must be <= 500KB';
  return null;
}

/** Advance state machine. Returns the next state (immutable). */
export function nextStep(s: WizardState): WizardState {
  if (s.step === 1) {
    const err = validateManifestStep(s.manifest);
    if (err) return { ...s, error: err };
    return { ...s, step: 2, error: undefined };
  }
  if (s.step === 2) {
    const err = validateCodeStep(s.code);
    if (err) return { ...s, error: err };
    return { ...s, step: 3, error: undefined };
  }
  if (s.step === 3) return { ...s, step: 4, error: undefined };
  return s;
}

export function prevStep(s: WizardState): WizardState {
  if (s.step === 1) return s;
  return { ...s, step: (s.step - 1) as WizardStep, error: undefined };
}

/** Simulate the 6 gates running — used by step 3 UI. */
export function simulateGates(code: string): WizardState['gateProgress'] {
  return GATE_NAMES.map((name) => {
    let pass = true;
    let message = 'pass (synthetic)';
    if (name === 'determinism' && /Math\.random\(\)/.test(code) && !/ctx\.rng/.test(code)) {
      pass = false;
      message = 'unseeded Math.random()';
    }
    if (name === 'closed-form-vs-mc' && !/closedForm/.test(code)) {
      pass = false;
      message = 'closedForm export missing';
    }
    if (name === 'naming' && /Light\s*&\s*Wonder|IGT|NetEnt/i.test(code)) {
      pass = false;
      message = 'reserved vendor term';
    }
    if (name === 'ts-strict' && /:\s*any\b/.test(code)) {
      pass = false;
      message = '": any" annotation';
    }
    return { name, pass, message };
  });
}

// ---------------------------------------------------------------------------
// DOM renderer
// ---------------------------------------------------------------------------

export interface WizardCallbacks {
  onClose: () => void;
  onSubmit: (state: WizardState) => Promise<{ submissionId: string; autoBadges: string[] }>;
}

export function renderWizard(
  host: HTMLElement,
  state: WizardState,
  cb: WizardCallbacks
): void {
  clear(host);
  const card = el('div', { className: 'wizard-card', role: 'dialog', 'aria-label': 'Submit kernel' });
  const closeBtn = el('button', { className: 'wizard-close', 'aria-label': 'Close wizard' }, ['×']);
  closeBtn.addEventListener('click', () => cb.onClose());
  card.appendChild(el('div', { className: 'wizard-head' }, [
    el('h2', {}, [`Submit Kernel — Step ${state.step} of 4`]),
    closeBtn,
  ]));

  if (state.error) {
    card.appendChild(el('div', { className: 'wizard-err', role: 'alert' }, [state.error]));
  }

  if (state.step === 1) renderStep1(card, state);
  else if (state.step === 2) renderStep2(card, state);
  else if (state.step === 3) renderStep3(card, state);
  else renderStep4(card, state);

  const nav = el('div', { className: 'wizard-nav' });
  if (state.step > 1 && state.step < 4) {
    const back = el('button', { className: 'btn ghost' }, ['Back']);
    back.addEventListener('click', () => renderWizard(host, prevStep(state), cb));
    nav.appendChild(back);
  }
  if (state.step < 3) {
    const next = el('button', { className: 'btn primary' }, ['Next']);
    next.addEventListener('click', () => renderWizard(host, nextStep(state), cb));
    nav.appendChild(next);
  } else if (state.step === 3) {
    const next = el('button', { className: 'btn primary' }, ['Submit']);
    next.addEventListener('click', async () => {
      const res = await cb.onSubmit(state);
      const advanced: WizardState = {
        ...state,
        step: 4,
        submissionId: res.submissionId,
        autoBadges: res.autoBadges,
        error: undefined,
      };
      renderWizard(host, advanced, cb);
    });
    nav.appendChild(next);
  } else {
    const done = el('button', { className: 'btn primary' }, ['Done']);
    done.addEventListener('click', () => cb.onClose());
    nav.appendChild(done);
  }
  card.appendChild(nav);
  host.appendChild(card);
}

function renderStep1(card: HTMLElement, state: WizardState): void {
  const body = el('div', { className: 'wizard-body' });
  body.appendChild(el('p', { className: 'crumb' }, ['Fill in the kernel manifest — these fields go into the cert paper trail.']));
  for (const f of [
    { k: 'name', label: 'Name (kebab-case)' },
    { k: 'version', label: 'Version (SemVer)' },
    { k: 'p_id_target', label: 'Pattern ID (P-...)' },
    { k: 'category', label: 'Category' },
    { k: 'description', label: 'Description' },
    { k: 'math_summary', label: 'Math summary' },
  ]) {
    const wrap = el('label');
    wrap.appendChild(el('span', {}, [f.label]));
    const inp = el('input', {
      value: (state.manifest as unknown as Record<string, string>)[f.k] ?? '',
    }) as HTMLInputElement;
    inp.addEventListener('input', () => {
      (state.manifest as unknown as Record<string, string>)[f.k] = inp.value;
    });
    wrap.appendChild(inp);
    body.appendChild(wrap);
  }
  card.appendChild(body);
}

function renderStep2(card: HTMLElement, state: WizardState): void {
  const body = el('div', { className: 'wizard-body' });
  body.appendChild(el('p', { className: 'crumb' }, ['Paste your kernel module source. (File upload in a later release.)']));
  const ta = el('textarea', { rows: '12', placeholder: 'export const kernel = defineKernel({ ... });' }) as HTMLTextAreaElement;
  ta.value = state.code;
  ta.addEventListener('input', () => { state.code = ta.value; });
  body.appendChild(ta);
  card.appendChild(body);
}

function renderStep3(card: HTMLElement, state: WizardState): void {
  state.gateProgress = simulateGates(state.code);
  const body = el('div', { className: 'wizard-body' });
  body.appendChild(el('p', { className: 'crumb' }, ['Running the 6-gate battery (synthetic, v0.9 MVP).']));
  const list = el('ul', { className: 'gate-list' });
  for (const g of state.gateProgress) {
    const item = el('li', { className: g.pass === false ? 'gate-fail' : g.pass === true ? 'gate-pass' : 'gate-pending' });
    item.appendChild(el('span', { className: 'gate-name' }, [g.name]));
    item.appendChild(el('span', { className: 'gate-msg' }, [g.message]));
    list.appendChild(item);
  }
  body.appendChild(list);
  card.appendChild(body);
}

function renderStep4(card: HTMLElement, state: WizardState): void {
  const body = el('div', { className: 'wizard-body' });
  body.appendChild(el('h3', {}, ['Submission accepted']));
  body.appendChild(el('p', {}, [`Submission ID: ${state.submissionId ?? '—'}`]));
  if (state.autoBadges && state.autoBadges.length > 0) {
    body.appendChild(el('p', {}, [`Auto-granted badges: ${state.autoBadges.join(', ')}`]));
  } else {
    body.appendChild(el('p', { className: 'crumb' }, ['No auto-badges granted — review the gate results.']));
  }
  card.appendChild(body);
}

/** Compute author revenue projection for the detail page. */
export function computeRevenueProjection(
  installs: number,
  perInstallFee: number,
  authorSharePct: number = 70
): { gross: number; authorMonthly: number } {
  const gross = installs * perInstallFee;
  const authorMonthly = Math.round((gross * authorSharePct) / 100);
  return { gross, authorMonthly };
}
