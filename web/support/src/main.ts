// CORTI W206-ONBOARDING — support portal entry. Boots on :5180.

import type { SupportState, View } from './types.js';
import { loadKb, defaultTicketDraft } from './data.js';
import { renderKb, renderTicket, renderStatus } from './sections.js';

async function boot(): Promise<void> {
  const main = document.getElementById('sp-main') as HTMLElement | null;
  const nav = document.getElementById('sp-nav') as HTMLElement | null;
  if (!main || !nav) throw new Error('support: missing #sp-main or #sp-nav');

  let kb;
  try {
    kb = await loadKb();
  } catch (err) {
    main.innerHTML = `<p style="color:var(--err);padding:20px">Failed to load knowledge base: ${String(err)}</p>`;
    return;
  }

  const state: SupportState = {
    view: 'kb',
    kb,
    search: '',
    filterCategory: 'All',
    expandedId: null,
    ticket: defaultTicketDraft(),
    submittedTickets: [],
  };

  const rerender = (): void => {
    syncNav();
    switch (state.view) {
      case 'kb':     return renderKb(main, state, rerender);
      case 'ticket': return renderTicket(main, state, rerender, toast);
      case 'status': return renderStatus(main, state, rerender);
    }
  };

  const syncNav = (): void => {
    for (const btn of Array.from(nav.querySelectorAll<HTMLButtonElement>('.nav-btn'))) {
      btn.classList.toggle('is-active', btn.dataset.view === state.view);
    }
  };

  for (const btn of Array.from(nav.querySelectorAll<HTMLButtonElement>('.nav-btn'))) {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view as View;
      rerender();
    });
  }

  rerender();
}

function toast(msg: string, kind: 'ok' | 'warn' | 'err' = 'ok'): void {
  const root = document.getElementById('sp-toast');
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
