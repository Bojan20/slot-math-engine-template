// CORTI W206-ONBOARDING — entry point. Single-page router that boots
// on :5179 (Vite dev). Holds state in a single object; persists wizard
// progress to localStorage so refreshes don't kill the flow.

import type { OnboardingState, Route, Tier } from './types.js';
import {
  defaultSignupForm,
  submitSignup,
} from './data.js';
import {
  loadWizardState,
  saveWizardState,
} from './wizard.js';
import {
  renderLanding,
  renderSignup,
  renderVerify,
  renderPlans,
  renderWizard,
  renderDashboard,
} from './sections.js';

function bootState(): OnboardingState {
  return {
    route: 'landing',
    signup: defaultSignupForm(),
    signupErrors: {},
    result: null,
    selectedTier: 'trial' as Tier,
    wizard: loadWizardState(),
  };
}

async function boot(): Promise<void> {
  const main = document.getElementById('ob-main') as HTMLElement | null;
  const nav = document.getElementById('ob-nav') as HTMLElement | null;
  const statusPill = document.getElementById('ob-status') as HTMLElement | null;
  if (!main || !nav) throw new Error('onboarding: missing #ob-main or #ob-nav');

  const state: OnboardingState = bootState();

  const persist = (): void => saveWizardState(state.wizard);

  const navigate = (route: Route): void => {
    state.route = route;
    render();
  };

  const render = (): void => {
    syncNav();
    syncStatus();
    switch (state.route) {
      case 'landing':
        return renderLanding(main, state, navigate);
      case 'signup':
        return renderSignup(main, state, navigate, toast, onSignupSubmit);
      case 'verify':
        return renderVerify(main, state, navigate);
      case 'plans':
        return renderPlans(main, state, navigate, toast);
      case 'wizard':
        return renderWizard(main, state, navigate, toast, persist);
      case 'dashboard':
        return renderDashboard(main, state, navigate, toast);
    }
  };

  const syncNav = (): void => {
    for (const btn of Array.from(nav.querySelectorAll<HTMLButtonElement>('.nav-btn'))) {
      btn.classList.toggle('is-active', btn.dataset.route === state.route);
    }
  };

  const syncStatus = (): void => {
    if (!statusPill) return;
    if (state.result) {
      statusPill.textContent = `${state.signup.company} · ${state.selectedTier.toUpperCase()}`;
      statusPill.classList.add('is-signed');
    } else {
      statusPill.textContent = 'Not signed in';
      statusPill.classList.remove('is-signed');
    }
  };

  const onSignupSubmit = async (): Promise<void> => {
    try {
      const result = await submitSignup(state.signup);
      state.result = result;
      state.selectedTier = result.tier;
      toast('Account created! Trial active for 30 days.', 'ok');
      navigate('verify');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'signup_failed';
      // Dev fallback: if backend is unreachable, fake a local trial so
      // the UX flow is testable without the server up.
      if (msg.includes('fetch') || msg.includes('Failed') || msg.includes('NetworkError')) {
        const fake = {
          tenantId: `local-${Date.now().toString(36)}`,
          licenseKey: 'lic_local_' + Math.random().toString(16).slice(2, 18),
          trialExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          tier: 'trial' as Tier,
          verified: true,
        };
        state.result = fake;
        state.selectedTier = 'trial';
        toast('Offline mode — local trial created.', 'warn');
        navigate('verify');
      } else {
        toast(`Signup failed: ${msg}`, 'err');
      }
    }
  };

  for (const btn of Array.from(nav.querySelectorAll<HTMLButtonElement>('.nav-btn'))) {
    btn.addEventListener('click', () => {
      const route = btn.dataset.route as Route;
      navigate(route);
    });
  }

  render();
}

function toast(msg: string, kind: 'ok' | 'warn' | 'err' = 'ok'): void {
  const root = document.getElementById('ob-toast');
  if (!root) return;
  const div = document.createElement('div');
  div.className = `t ${kind}`;
  div.textContent = msg;
  root.appendChild(div);
  setTimeout(() => div.remove(), 3200);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot());
  else void boot();
}
