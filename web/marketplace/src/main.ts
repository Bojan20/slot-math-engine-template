/**
 * CORTI 200.7-MARKETPLACE — Marketplace mini-app entry point.
 *
 * Boots on :5176 (Vite dev). Two modes: Browse + Author.
 */

import { loadListings } from './data.js';
import { renderBrowse, renderAuthor, type MarketplaceState } from './sections.js';
import type { Listing, ViewMode } from './types.js';
import { renderWizard, makeInitialState } from './submit-wizard.js';
import { loadTemplates, type TemplateEntry } from './templates.js';
import {
  defaultTemplateBrowserState,
  renderTemplateBrowser,
  type TemplateBrowserState,
} from './template-browser.js';

async function boot(): Promise<void> {
  const main = document.getElementById('mp-main') as HTMLElement | null;
  const nav = document.getElementById('mp-nav') as HTMLElement | null;
  const countPill = document.getElementById('mp-listing-count') as HTMLElement | null;
  if (!main || !nav) throw new Error('marketplace: missing #mp-main or #mp-nav');

  let listings: Listing[] = [];
  let templates: TemplateEntry[] = [];
  try {
    [listings, templates] = await Promise.all([loadListings(), loadTemplates()]);
  } catch (err) {
    main.innerHTML = `<p style="color:var(--err);padding:20px">Failed to load listings: ${String(err)}</p>`;
    return;
  }

  const state: MarketplaceState = {
    listings,
    view: 'browse',
    filter: { search: '', category: 'all', priceFilter: 'all', license: 'any' },
    sort: 'popularity',
    currentAuthor: 'smec',
  };

  const tplState: TemplateBrowserState = {
    ...defaultTemplateBrowserState(),
    templates,
  };

  if (countPill) countPill.textContent = `${state.listings.length} listings · ${tplState.templates.length} templates`;

  const rerender = (): void => {
    if (countPill) countPill.textContent = `${state.listings.length} listings · ${tplState.templates.length} templates`;
    if (state.view === 'browse') renderBrowse(main, state, rerender, toast);
    else if (state.view === 'templates') {
      renderTemplateBrowser(main, tplState, rerender, (tpl) => {
        toast(`Re-skin wizard: ${tpl.displayName}`, 'ok');
      });
    } else renderAuthor(main, state, rerender, toast);
  };

  for (const btn of Array.from(nav.querySelectorAll<HTMLButtonElement>('.nav-btn'))) {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as ViewMode;
      state.view = mode;
      for (const b of Array.from(nav.querySelectorAll<HTMLButtonElement>('.nav-btn'))) {
        b.classList.toggle('is-active', b === btn);
      }
      rerender();
    });
  }

  const submitBtn = document.getElementById('mp-submit-btn');
  const modal = document.getElementById('mp-wizard-modal');
  if (submitBtn && modal) {
    submitBtn.addEventListener('click', () => {
      modal.hidden = false;
      const wState = makeInitialState(state.currentAuthor);
      renderWizard(modal, wState, {
        onClose: () => { modal.hidden = true; },
        onSubmit: async (s) => {
          // Mock — real submit wires to /api/marketplace/kernels/submit
          const id = `sub-${Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0')}`;
          const allPass = s.gateProgress.every((g) => g.pass !== false);
          toast(allPass ? 'Submission accepted (Verified granted)' : 'Submission accepted (gates failed)', allPass ? 'ok' : 'warn');
          return { submissionId: id, autoBadges: allPass ? ['verified'] : [] };
        },
      });
    });
  }

  rerender();
}

function toast(msg: string, kind: 'ok' | 'warn' | 'err' = 'ok'): void {
  const root = document.getElementById('mp-toast');
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
