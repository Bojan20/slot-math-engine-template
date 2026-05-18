// CORTI W206-ONBOARDING — 5-step wizard state machine + localStorage
// persistence. Each step has a deeplink that the customer would follow
// into Studio to complete the task. "Mark complete" lets the user move
// on without leaving onboarding.

import type { WizardState, WizardStep, WizardStepId } from './types.js';

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'workspace',
    title: 'Create your first workspace',
    description:
      'Workspaces hold your games, simulations, and operator packages. Give yours a name and a target jurisdiction.',
    cta: 'Open Studio · Workspaces',
    deeplink: 'http://localhost:5173/studio.html?onboard=workspace',
  },
  {
    id: 'gdd',
    title: 'Upload your first GDD',
    description:
      'Drop a Game Design Document or start from the Quick Hit Platinum sample IR. The engine parses it into an IR tree you can iterate on.',
    cta: 'Open Studio · Import GDD',
    deeplink: 'http://localhost:5173/studio.html?onboard=gdd',
  },
  {
    id: 'play',
    title: 'First spin in PLAY',
    description:
      'Watch the kernel render reels live with the closed-form solver running in the background. Tweak the bet and see the distribution shift.',
    cta: 'Open Studio · PLAY tab',
    deeplink: 'http://localhost:5173/studio.html?tab=play&onboard=play',
  },
  {
    id: 'certify',
    title: 'First MC validation run',
    description:
      'Run a 1M-spin Monte Carlo against the closed-form RTP. Targets convergence to 4 decimals; the CERTIFY tab shows the chi-squared histogram inline.',
    cta: 'Open Studio · CERTIFY tab',
    deeplink: 'http://localhost:5173/studio.html?tab=certify&onboard=mc',
  },
  {
    id: 'package',
    title: 'Generate your first operator-package.zip',
    description:
      'Combine cert PDF, PAR sheet, HSM signature, and audit chain into a single regulator-ready ZIP. This is the artifact you ship to the lab.',
    cta: 'Open Studio · Package',
    deeplink: 'http://localhost:5173/studio.html?tab=package&onboard=pkg',
  },
];

const LS_KEY = 'corti-onboarding-wizard';

export function loadWizardState(storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null): WizardState {
  const empty: WizardState = { current: 0, completed: new Set() };
  if (!storage) return empty;
  try {
    const raw = storage.getItem(LS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as { current?: number; completed?: string[] };
    return {
      current: typeof parsed.current === 'number' ? Math.max(0, Math.min(WIZARD_STEPS.length - 1, parsed.current)) : 0,
      completed: new Set((parsed.completed ?? []) as WizardStepId[]),
    };
  } catch {
    return empty;
  }
}

export function saveWizardState(state: WizardState, storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null): void {
  if (!storage) return;
  try {
    storage.setItem(
      LS_KEY,
      JSON.stringify({ current: state.current, completed: Array.from(state.completed) })
    );
  } catch {
    /* ignore quota */
  }
}

export function resetWizardState(storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null): void {
  if (!storage) return;
  try {
    storage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

export function markStepComplete(state: WizardState, id: WizardStepId): WizardState {
  const next: WizardState = { current: state.current, completed: new Set(state.completed) };
  next.completed.add(id);
  const idx = WIZARD_STEPS.findIndex((s) => s.id === id);
  if (idx >= 0 && idx === state.current && state.current < WIZARD_STEPS.length - 1) {
    next.current = state.current + 1;
  }
  return next;
}

export function skipStep(state: WizardState): WizardState {
  if (state.current >= WIZARD_STEPS.length - 1) return state;
  return { current: state.current + 1, completed: new Set(state.completed) };
}

export function backStep(state: WizardState): WizardState {
  if (state.current <= 0) return state;
  return { current: state.current - 1, completed: new Set(state.completed) };
}

export function progressPercent(state: WizardState): number {
  return Math.round((state.completed.size / WIZARD_STEPS.length) * 100);
}

export function isWizardComplete(state: WizardState): boolean {
  return state.completed.size === WIZARD_STEPS.length;
}
