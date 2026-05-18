/**
 * CORTI W207-DOCS - Hash-based router.
 *
 * URL shape: #/<slug>           -> render markdown page
 *            #/playground       -> render playground view
 *            #                  -> redirect to DEFAULT_SLUG
 *
 * The router is dependency-free and re-entrant. Tests verify slug parsing
 * + the slug -> URL conversion in isolation.
 */

import { DEFAULT_SLUG, flattenSidebar } from './sidebar.js';

export interface RouteState {
  view: 'page' | 'playground';
  slug: string;
}

export function parseHash(hash: string): RouteState {
  const h = hash.replace(/^#\/?/, '').trim();
  if (h === 'playground') return { view: 'playground', slug: 'playground' };
  if (h === '') return { view: 'page', slug: DEFAULT_SLUG };
  // sanitize: allow alnum + dash + slash (subdir for generated/...)
  const safe = h.replace(/[^a-zA-Z0-9/_-]/g, '');
  return { view: 'page', slug: safe || DEFAULT_SLUG };
}

export function slugUrl(slug: string): string {
  return `#/${slug}`;
}

export function isKnownSlug(slug: string): boolean {
  const flat = flattenSidebar();
  for (const l of flat) if (l.slug === slug) return true;
  return slug === 'playground';
}
