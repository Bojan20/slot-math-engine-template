// W209 Agent B — Template browser UI hooks + render helpers.
//
// Adds a second "Templates" tab alongside Kernels (Agent A). Pure
// rendering helpers — DOM nodes returned, no global side-effects, so
// they're easy to unit-test without a DOM.

import { el, clear } from '@shared/dom.js';
import type { TemplateEntry, TemplateFilter, TemplateSortKey } from './templates.js';
import { filterTemplates, sortTemplates, templateStats } from './templates.js';

export interface TemplateBrowserState {
  templates: TemplateEntry[];
  filter: TemplateFilter;
  sort: TemplateSortKey;
  /** Currently-open detail card id (or null). */
  detailId: string | null;
}

export function defaultTemplateBrowserState(): TemplateBrowserState {
  return {
    templates: [],
    filter: {},
    sort: 'speed',
    detailId: null,
  };
}

/** Build the list of templates after filter + sort. Pure. */
export function visibleTemplates(state: TemplateBrowserState): TemplateEntry[] {
  return sortTemplates(filterTemplates(state.templates, state.filter), state.sort);
}

/** Format the stats ribbon string (kept pure for snapshot tests). */
export function statsRibbonText(state: TemplateBrowserState): string {
  const s = templateStats(state.templates);
  return `${s.totalTemplates} templates · avg RTP ${s.averageRtpPct}% · avg $${s.averagePriceUsd.toLocaleString()} · ${s.uniqueLwGaps} L&W gaps · fastest ${s.fastestReadyDays}d`;
}

/** Build the price-bucket index helper used by the bucket filter UI. */
export function priceBuckets(templates: TemplateEntry[]): Array<{ label: string; range: [number, number]; count: number }> {
  const buckets: Array<{ label: string; range: [number, number] }> = [
    { label: '< $25k', range: [0, 24999] },
    { label: '$25k–$30k', range: [25000, 30000] },
    { label: '> $30k', range: [30001, Number.POSITIVE_INFINITY] },
  ];
  return buckets.map((b) => ({
    ...b,
    count: templates.filter((t) => t.price_usd >= b.range[0] && t.price_usd <= b.range[1]).length,
  }));
}

/** DOM render helpers — these depend on a live document. */

export function renderTemplateBrowser(
  host: HTMLElement,
  state: TemplateBrowserState,
  rerender: () => void,
  onReskin: (template: TemplateEntry) => void,
): void {
  clear(host);
  host.appendChild(el('div', { className: 'section-head' }, [
    el('div', {}, [
      el('h1', {}, ['Game Templates']),
      el('div', { className: 'crumb' }, [statsRibbonText(state)]),
    ]),
  ]));

  // filter row
  const filterRow = el('div', { className: 'filter-row' });
  const searchInput = el('input', { placeholder: 'search name / desc / tags' }) as HTMLInputElement;
  searchInput.value = state.filter.search ?? '';
  searchInput.addEventListener('input', () => {
    state.filter.search = searchInput.value;
    rerender();
  });
  filterRow.appendChild(el('label', {}, ['Search', searchInput]));

  const sortSel = el('select') as HTMLSelectElement;
  for (const s of ['speed', 'price-asc', 'price-desc', 'rtp', 'name'] as const) {
    const o = el('option', { value: s }, [s]) as HTMLOptionElement;
    if (state.sort === s) o.selected = true;
    sortSel.appendChild(o);
  }
  sortSel.addEventListener('change', () => {
    state.sort = sortSel.value as TemplateSortKey;
    rerender();
  });
  filterRow.appendChild(el('label', {}, ['Sort', sortSel]));
  host.appendChild(filterRow);

  const grid = el('div', { className: 'listings-grid' });
  for (const t of visibleTemplates(state)) {
    grid.appendChild(renderTemplateCard(t, () => onReskin(t)));
  }
  host.appendChild(grid);
}

export function renderTemplateCard(t: TemplateEntry, onReskin: () => void): HTMLElement {
  const card = el('div', { className: 'listing-card template-card' });
  card.appendChild(el('div', { className: 'listing-title' }, [t.displayName]));
  card.appendChild(el('div', { className: 'listing-author' }, [
    `${t.lw_gap_target} · ${t.layout} · RTP ${t.rtp_target}%`,
  ]));
  card.appendChild(el('div', { className: 'listing-desc' }, [t.description]));

  const meta = el('div', { className: 'listing-meta' });
  meta.appendChild(el('span', { className: 'price-tag' }, [`$${t.price_usd.toLocaleString()}`]));
  meta.appendChild(el('span', { className: 'rating' }, [`${t.volatility} · ${t.ready_to_ship_days}d ship`]));
  card.appendChild(meta);

  const tagWrap = el('div', { className: 'tags' });
  for (const tag of t.tags.slice(0, 5)) {
    tagWrap.appendChild(el('span', { className: 'tag' }, [tag]));
  }
  card.appendChild(tagWrap);

  const reskinBtn = el('button', { className: 'install-btn' }, ['Re-skin this']);
  reskinBtn.addEventListener('click', onReskin);
  card.appendChild(reskinBtn);
  return card;
}
