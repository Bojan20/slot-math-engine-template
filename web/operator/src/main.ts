// Operator dashboard entry point. Holds the top-level state, wires the
// nav buttons, and re-renders the active section into #op-main. We
// avoid framework deps for the same reasons studio does: dependency-free
// boot, runs from any static file host, no hydration cost.

import type { OperatorGame, ABTest, Submission, Jurisdiction } from '@shared/types.js';
import type { GameFilter, SubmissionFilter } from '@shared/filters.js';
import { loadGames, loadAbTests, loadSubmissions } from './data.js';
import {
  renderGameLibrary,
  renderRtp,
  renderAB,
  renderSubmissions,
  renderCompliance,
  renderMyAccount,
} from './sections.js';

// CORTI W206-ONBOARDING — operator dashboard gains a customer-facing
// "My Account" section (trial countdown, usage stats, upgrade CTA).
export type Section = 'library' | 'rtp' | 'ab' | 'subs' | 'compliance' | 'account';

export interface AppState {
  games: OperatorGame[];
  abTests: ABTest[];
  submissions: Submission[];
  currentSection: Section;
  gameFilter: GameFilter;
  subsFilter: SubmissionFilter;
  selectedGameId: string | null;
  selectedJurisdiction: Jurisdiction | null;
}

async function boot(): Promise<void> {
  const main = document.getElementById('op-main') as HTMLElement;
  const nav = document.getElementById('op-nav') as HTMLElement;
  if (!main || !nav) throw new Error('operator: missing #op-main or #op-nav');

  const state: AppState = {
    games: [],
    abTests: [],
    submissions: [],
    currentSection: 'library',
    gameFilter: { status: 'any', jurisdiction: 'any' },
    subsFilter: { status: 'any', jurisdiction: 'any' },
    selectedGameId: null,
    selectedJurisdiction: null,
  };

  try {
    const [games, ab, subs] = await Promise.all([loadGames(), loadAbTests(), loadSubmissions()]);
    state.games = games;
    state.abTests = ab;
    state.submissions = subs;
  } catch (err) {
    main.innerHTML = `<p style="color:var(--err);padding:20px">Failed to load mock data: ${String(err)}</p>`;
    return;
  }

  const rerender = (): void => render(main, state, rerender, toast);
  for (const btn of Array.from(nav.querySelectorAll<HTMLButtonElement>('.nav-btn'))) {
    btn.addEventListener('click', () => {
      const sec = btn.dataset.section as Section;
      state.currentSection = sec;
      for (const b of Array.from(nav.querySelectorAll<HTMLButtonElement>('.nav-btn'))) b.classList.toggle('is-active', b === btn);
      rerender();
    });
  }
  rerender();
}

function render(host: HTMLElement, state: AppState, rerender: () => void, toast: (m: string, k?: 'ok' | 'warn' | 'err') => void): void {
  // Sync nav active class with state (used when compliance card forces a switch).
  const nav = document.getElementById('op-nav');
  if (nav) {
    for (const b of Array.from(nav.querySelectorAll<HTMLButtonElement>('.nav-btn'))) {
      b.classList.toggle('is-active', b.dataset.section === state.currentSection);
    }
  }
  switch (state.currentSection) {
    case 'library':    return renderGameLibrary(host, state, rerender, toast);
    case 'rtp':        return renderRtp(host, state);
    case 'ab':         return renderAB(host, state, rerender, toast);
    case 'subs':       return renderSubmissions(host, state, rerender, toast);
    case 'compliance': return renderCompliance(host, state, rerender);
    case 'account':    return renderMyAccount(host, state, toast);
  }
}

function toast(msg: string, kind: 'ok' | 'warn' | 'err' = 'ok'): void {
  const root = document.getElementById('op-toast');
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
