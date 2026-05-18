/**
 * CORTI W207-DOCS - Documentation site entry point.
 *
 * Boots on :5181 (vite dev). Loads every markdown page declared in
 * sidebar.ts at startup, builds the in-memory search index, and wires
 * the hash router. The playground module is mounted on demand the first
 * time the user navigates to #/playground.
 */

import { SIDEBAR, flattenSidebar, renderSidebar } from './sidebar.js';
import { renderMarkdown } from './markdown.js';
import { buildIndex, search, snippet, type SearchEntry } from './search.js';
import { parseHash } from './router.js';
import { mountPlayground } from './playground.js';

interface PageRecord {
  slug: string;
  title: string;
  raw: string;
  html: string;
}

const pages = new Map<string, PageRecord>();
let searchIndex: SearchEntry[] = [];
let playgroundMounted = false;

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

async function fetchPage(slug: string): Promise<PageRecord> {
  const url = `content/${slug}.md`;
  const res = await fetch(url);
  if (!res.ok) {
    return {
      slug,
      title: slug,
      raw: '',
      html: `<h1>404 - ${escapeHtml(slug)}</h1><p>Page not found at ${escapeHtml(url)}.</p>`,
    };
  }
  const raw = await res.text();
  const md = renderMarkdown(raw);
  const titleMatch = /^#\s+(.+)$/m.exec(raw);
  const title = titleMatch ? titleMatch[1] : slug;
  return { slug, title, raw, html: md.html };
}

async function preloadAllPages(): Promise<void> {
  const flat = flattenSidebar();
  await Promise.all(
    flat.map(async (link) => {
      const page = await fetchPage(link.slug);
      pages.set(link.slug, page);
    })
  );
  const rawList = [...pages.values()].map((p) => ({ slug: p.slug, title: p.title, raw: p.raw }));
  searchIndex = buildIndex(rawList);
}

function renderSidebarTo(activeSlug: string): void {
  const el = $('docs-sidebar');
  if (!el) return;
  el.innerHTML = renderSidebar(activeSlug, SIDEBAR);
}

function navigate(): void {
  const route = parseHash(window.location.hash);
  renderSidebarTo(route.slug);
  const article = $('docs-article');
  const playground = $('docs-playground');
  if (!article || !playground) return;
  if (route.view === 'playground') {
    article.hidden = true;
    playground.hidden = false;
    if (!playgroundMounted) {
      mountPlayground(document);
      playgroundMounted = true;
    }
    document.title = 'Playground - Slot Math Engine Docs';
    return;
  }
  article.hidden = false;
  playground.hidden = true;
  const rec = pages.get(route.slug);
  if (!rec) {
    article.innerHTML = `<h1>404</h1><p>Page <code>${escapeHtml(route.slug)}</code> not found.</p>`;
    return;
  }
  article.innerHTML = rec.html;
  document.title = `${rec.title} - Slot Math Engine Docs`;
  article.scrollTo({ top: 0 });
}

function wireSearch(): void {
  const input = $('search-input') as HTMLInputElement | null;
  const results = $('search-results') as HTMLUListElement | null;
  if (!input || !results) return;
  const close = () => { results.hidden = true; results.innerHTML = ''; };
  input.addEventListener('input', () => {
    const hits = search(searchIndex, input.value, 12);
    if (hits.length === 0) { close(); return; }
    results.hidden = false;
    results.innerHTML = hits
      .map(
        (h) =>
          `<li data-slug="${escapeHtml(h.slug)}"><strong>${escapeHtml(h.section)}</strong>` +
          `<span class="sr-section">${escapeHtml(h.page)} - ${escapeHtml(snippet(h))}</span></li>`
      )
      .join('');
  });
  results.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest('li[data-slug]');
    if (!li) return;
    const slug = li.getAttribute('data-slug') ?? '';
    if (slug) window.location.hash = `#/${slug}`;
    input.value = '';
    close();
  });
  input.addEventListener('blur', () => setTimeout(close, 200));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function boot(): Promise<void> {
  renderSidebarTo(parseHash(window.location.hash).slug);
  await preloadAllPages();
  navigate();
  wireSearch();
  window.addEventListener('hashchange', navigate);
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('docs boot failed', err);
  const article = $('docs-article');
  if (article) {
    article.innerHTML = `<h1>Boot error</h1><pre>${escapeHtml(String(err))}</pre>`;
  }
});
