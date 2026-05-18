/**
 * CORTI 200.7-MARKETPLACE — Browse + Author renderers.
 */

import { el, clear } from '@shared/dom.js';
import type { Listing, ListingCategory, SortKey, ViewMode, ListingLicense } from './types.js';
import {
  ALL_CATEGORIES,
  filterListings,
  sortListings,
  featuredListings,
  installListing,
  authorStats,
  appendListing,
} from './data.js';

export interface MarketplaceState {
  listings: Listing[];
  view: ViewMode;
  filter: {
    search: string;
    category: ListingCategory | 'all';
    priceFilter: 'all' | 'free' | 'paid';
    license: ListingLicense | 'any';
  };
  sort: SortKey;
  currentAuthor: string;
}

type Toast = (m: string, k?: 'ok' | 'warn' | 'err') => void;

export function renderBrowse(host: HTMLElement, state: MarketplaceState, rerender: () => void, toast: Toast): void {
  clear(host);

  host.appendChild(el('div', { className: 'section-head' }, [
    el('div', {}, [
      el('h1', {}, ['Marketplace']),
      el('div', { className: 'crumb' }, [
        `${state.listings.length} listings · 6 categories · ${state.listings.filter((l) => l.price === 0).length} free`,
      ]),
    ]),
  ]));

  // featured strip
  const featured = featuredListings(state.listings);
  if (featured.length > 0) {
    const strip = el('div', { className: 'featured-strip' });
    strip.appendChild(el('h3', {}, [`Featured (${featured.length})`]));
    const grid = el('div', { className: 'listings-grid' });
    for (const f of featured.slice(0, 4)) grid.appendChild(renderListingCard(f, state, rerender, toast));
    strip.appendChild(grid);
    host.appendChild(strip);
  }

  // filter row
  const filterRow = el('div', { className: 'filter-row' });
  const searchInput = el('input', { placeholder: 'search title / desc / tags' }) as HTMLInputElement;
  searchInput.value = state.filter.search;
  searchInput.addEventListener('input', () => { state.filter.search = searchInput.value; rerender(); });
  filterRow.appendChild(el('label', {}, ['Search', searchInput]));

  const priceSel = el('select') as HTMLSelectElement;
  for (const p of ['all', 'free', 'paid'] as const) {
    const o = el('option', { value: p }, [p]) as HTMLOptionElement;
    if (state.filter.priceFilter === p) o.selected = true;
    priceSel.appendChild(o);
  }
  priceSel.addEventListener('change', () => { state.filter.priceFilter = priceSel.value as 'all' | 'free' | 'paid'; rerender(); });
  filterRow.appendChild(el('label', {}, ['Price', priceSel]));

  const licSel = el('select') as HTMLSelectElement;
  for (const l of ['any', 'free', 'single-game', 'studio-wide', 'site'] as const) {
    const o = el('option', { value: l }, [l]) as HTMLOptionElement;
    if (state.filter.license === l) o.selected = true;
    licSel.appendChild(o);
  }
  licSel.addEventListener('change', () => { state.filter.license = licSel.value as ListingLicense | 'any'; rerender(); });
  filterRow.appendChild(el('label', {}, ['License', licSel]));

  const sortSel = el('select') as HTMLSelectElement;
  for (const s of ['popularity', 'recent', 'price-asc', 'price-desc', 'rating'] as const) {
    const o = el('option', { value: s }, [s]) as HTMLOptionElement;
    if (state.sort === s) o.selected = true;
    sortSel.appendChild(o);
  }
  sortSel.addEventListener('change', () => { state.sort = sortSel.value as SortKey; rerender(); });
  filterRow.appendChild(el('label', {}, ['Sort', sortSel]));

  host.appendChild(filterRow);

  // category tabs
  const tabs = el('div', { className: 'cat-tabs' });
  const allTab = el('button', { className: `cat-tab ${state.filter.category === 'all' ? 'is-active' : ''}` }, ['All']);
  allTab.addEventListener('click', () => { state.filter.category = 'all'; rerender(); });
  tabs.appendChild(allTab);
  for (const cat of ALL_CATEGORIES) {
    const t = el('button', { className: `cat-tab ${state.filter.category === cat ? 'is-active' : ''}` }, [cat]);
    t.addEventListener('click', () => { state.filter.category = cat; rerender(); });
    tabs.appendChild(t);
  }
  host.appendChild(tabs);

  // grid
  const filtered = filterListings(state.listings, state.filter);
  const sorted = sortListings(filtered, state.sort);
  const grid = el('div', { className: 'listings-grid' });
  if (sorted.length === 0) {
    grid.appendChild(el('div', { className: 'crumb' }, ['no listings match your filter']));
  }
  for (const l of sorted) grid.appendChild(renderListingCard(l, state, rerender, toast));
  host.appendChild(grid);
}

function renderListingCard(l: Listing, _state: MarketplaceState, _rerender: () => void, toast: Toast): HTMLElement {
  const card = el('div', { className: `listing-card ${l.featured ? 'is-featured' : ''}` });
  card.appendChild(el('div', { className: 'listing-title' }, [l.title]));
  card.appendChild(el('div', { className: 'listing-author' }, [`by ${l.author} · v${l.version}`]));
  card.appendChild(el('div', { className: 'listing-desc' }, [l.description]));

  const meta = el('div', { className: 'listing-meta' });
  meta.appendChild(el('span', { className: `price-tag ${l.price === 0 ? 'free' : ''}` }, [l.price === 0 ? 'FREE' : `$${l.price}`]));
  meta.appendChild(el('span', { className: 'rating' }, [`★ ${l.rating.toFixed(1)} (${l.ratingCount}) · ${l.downloads.toLocaleString()} dl`]));
  card.appendChild(meta);

  if (l.tags.length > 0) {
    const tagWrap = el('div', { className: 'tags' });
    for (const t of l.tags.slice(0, 5)) tagWrap.appendChild(el('span', { className: 'tag' }, [t]));
    card.appendChild(tagWrap);
  }

  const btn = el('button', { className: `install-btn ${l.price === 0 ? 'free' : ''}` }, [l.price === 0 ? 'Install (Free)' : `Buy $${l.price}`]);
  btn.addEventListener('click', () => {
    const res = installListing(l);
    toast(res.message, res.action === 'installed' ? 'ok' : 'warn');
  });
  card.appendChild(btn);

  return card;
}

export function renderAuthor(host: HTMLElement, state: MarketplaceState, rerender: () => void, toast: Toast): void {
  clear(host);

  host.appendChild(el('div', { className: 'section-head' }, [
    el('div', {}, [
      el('h1', {}, ['Author Mode']),
      el('div', { className: 'crumb' }, [`Logged in as ${state.currentAuthor}`]),
    ]),
  ]));

  const stats = authorStats(state.listings, state.currentAuthor);
  const statsRow = el('div', { className: 'author-stats' });
  statsRow.appendChild(makeStat('Listings', String(stats.totalListings)));
  statsRow.appendChild(makeStat('Downloads', stats.totalDownloads.toLocaleString()));
  statsRow.appendChild(makeStat('Revenue', `$${stats.totalRevenue.toLocaleString()}`));
  statsRow.appendChild(makeStat('Avg Rating', stats.avgRating ? `★ ${stats.avgRating}` : '—'));
  host.appendChild(statsRow);

  // upload form
  const form = el('form', { className: 'author-form' }) as HTMLFormElement;
  form.appendChild(formField('title', 'Title', 'input', 'My Kernel'));
  form.appendChild(formField('description', 'Description', 'textarea', 'What does it do?'));
  form.appendChild(formField('category', 'Category', 'select', 'kernels', ALL_CATEGORIES.slice()));
  form.appendChild(formField('price', 'Price (USD, 0 = free)', 'input', '0'));
  form.appendChild(formField('license', 'License', 'select', 'free', ['free', 'single-game', 'studio-wide', 'site']));
  form.appendChild(formField('tags', 'Tags (comma-separated)', 'input', 'kernel,mygame'));

  const submitBtn = el('button', { className: 'btn primary', type: 'submit' }, ['Upload Listing']);
  form.appendChild(submitBtn);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    const draft: Partial<Listing> = {
      title: String(data.get('title') ?? '').trim() || 'Untitled',
      description: String(data.get('description') ?? ''),
      category: String(data.get('category') ?? 'kernels') as ListingCategory,
      price: Number(data.get('price') ?? 0),
      license: String(data.get('license') ?? 'free') as ListingLicense,
      tags: String(data.get('tags') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      author: state.currentAuthor,
      authorId: state.currentAuthor.toLowerCase().replace(/\s+/g, '-'),
    };
    state.listings = appendListing(state.listings, draft);
    toast(`Uploaded: ${draft.title}`, 'ok');
    rerender();
  });

  host.appendChild(form);

  // my listings table
  const mine = state.listings.filter((l) => l.authorId === state.currentAuthor.toLowerCase().replace(/\s+/g, '-') || l.authorId === state.currentAuthor);
  if (mine.length > 0) {
    host.appendChild(el('h2', { style: 'margin-top: 24px; font-size: 16px;' }, [`Your listings (${mine.length})`]));
    const grid = el('div', { className: 'listings-grid' });
    for (const l of mine) grid.appendChild(renderListingCard(l, state, rerender, toast));
    host.appendChild(grid);
  }
}

function makeStat(label: string, value: string): HTMLElement {
  const card = el('div', { className: 'stat-card' });
  card.appendChild(el('div', { className: 'label' }, [label]));
  card.appendChild(el('div', { className: 'value' }, [value]));
  return card;
}

function formField(name: string, label: string, type: 'input' | 'textarea' | 'select', placeholder: string, options?: string[]): HTMLElement {
  const wrap = el('label');
  wrap.appendChild(el('span', {}, [label]));
  let ctrl: HTMLElement;
  if (type === 'select' && options) {
    ctrl = el('select', { name }) as HTMLSelectElement;
    for (const opt of options) {
      ctrl.appendChild(el('option', { value: opt }, [opt]));
    }
  } else if (type === 'textarea') {
    ctrl = el('textarea', { name, placeholder });
  } else {
    ctrl = el('input', { name, placeholder });
  }
  wrap.appendChild(ctrl);
  return wrap;
}
