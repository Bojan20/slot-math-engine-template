// Regulator portal entry point. Single-page, 3 sections, no framework.

import type { Submission, Jurisdiction } from '@shared/types.js';
import type { SubmissionFilter } from '@shared/filters.js';
import { loadQueue } from './data.js';
import { renderQueue, renderReview, renderAudit } from './sections.js';

export type RegSection = 'queue' | 'review' | 'audit';

export interface RegState {
  queue: Submission[];
  regulatorId: string;
  currentSection: RegSection;
  filter: SubmissionFilter;
  selectedId: string | null;
}

async function boot(): Promise<void> {
  const main = document.getElementById('reg-main') as HTMLElement;
  const nav = document.getElementById('reg-nav') as HTMLElement;
  if (!main || !nav) throw new Error('regulator: missing #reg-main or #reg-nav');

  const state: RegState = {
    queue: [],
    regulatorId: 'UKGC-03',
    currentSection: 'queue',
    filter: { status: 'any', jurisdiction: 'any' },
    selectedId: null,
  };
  try {
    state.queue = await loadQueue();
  } catch (err) {
    main.innerHTML = `<p style="color:var(--err);padding:24px">Failed to load review queue: ${String(err)}</p>`;
    return;
  }

  const rerender = (): void => render(main, state, rerender, toast);
  for (const btn of Array.from(nav.querySelectorAll<HTMLButtonElement>('.rnav-btn'))) {
    btn.addEventListener('click', () => {
      state.currentSection = btn.dataset.section as RegSection;
      for (const b of Array.from(nav.querySelectorAll<HTMLButtonElement>('.rnav-btn'))) b.classList.toggle('is-active', b === btn);
      rerender();
    });
  }
  rerender();
}

function render(host: HTMLElement, state: RegState, rerender: () => void, toast: (m: string, k?: 'ok' | 'amber' | 'err') => void): void {
  const nav = document.getElementById('reg-nav');
  if (nav) {
    for (const b of Array.from(nav.querySelectorAll<HTMLButtonElement>('.rnav-btn'))) {
      b.classList.toggle('is-active', b.dataset.section === state.currentSection);
    }
  }
  switch (state.currentSection) {
    case 'queue':  return renderQueue(host, state, rerender);
    case 'review': return renderReview(host, state, rerender, toast);
    case 'audit':  return renderAudit(host, state, rerender, toast);
  }
}

function toast(msg: string, kind: 'ok' | 'amber' | 'err' = 'ok'): void {
  const root = document.getElementById('reg-toast');
  if (!root) return;
  const d = document.createElement('div');
  d.className = `t ${kind}`;
  d.textContent = msg;
  root.appendChild(d);
  setTimeout(() => d.remove(), 3200);
}

// silence unused-import lint
type _Use = Jurisdiction;
void (null as unknown as _Use);

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot());
  else void boot();
}
