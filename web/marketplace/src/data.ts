/**
 * CORTI 200.7-MARKETPLACE — listings repo + filter/search/sort.
 *
 * All ops are pure functions over a `Listing[]` so the test layer can
 * drive them without DOM.
 */

import type {
  Listing,
  ListingFilter,
  ListingCategory,
  SortKey,
  InstallResult,
  AuthorStats,
  LicenseRecord,
} from './types.js';

export interface ListingsFile {
  schema: string;
  generated: string;
  totalListings: number;
  currency: string;
  listings: Listing[];
}

export async function loadListings(): Promise<Listing[]> {
  if (typeof fetch === 'undefined') return [];
  const res = await fetch('./data/listings.json');
  if (!res.ok) throw new Error(`failed to load listings: ${res.status}`);
  const data = (await res.json()) as ListingsFile;
  return data.listings;
}

export const ALL_CATEGORIES: ListingCategory[] = [
  'kernels',
  'templates',
  'themes',
  'audio',
  'animations',
  'formulas',
];

export function filterListings(items: Listing[], f: ListingFilter): Listing[] {
  return items.filter((it) => {
    if (f.category && f.category !== 'all' && it.category !== f.category) return false;
    if (f.priceFilter === 'free' && it.price > 0) return false;
    if (f.priceFilter === 'paid' && it.price === 0) return false;
    if (f.license && f.license !== 'any' && it.license !== f.license) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = `${it.title} ${it.description} ${it.author} ${it.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortListings(items: Listing[], key: SortKey): Listing[] {
  const copy = items.slice();
  switch (key) {
    case 'popularity':
      copy.sort((a, b) => b.downloads - a.downloads);
      break;
    case 'recent':
      copy.sort((a, b) => b.published.localeCompare(a.published));
      break;
    case 'price-asc':
      copy.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      copy.sort((a, b) => b.price - a.price);
      break;
    case 'rating':
      copy.sort((a, b) => b.rating - a.rating);
      break;
  }
  return copy;
}

export function featuredListings(items: Listing[]): Listing[] {
  return items.filter((i) => i.featured);
}

/** Install flow — free items install immediately; paid items go to a
 *  checkout placeholder (we don't take real money). Either way returns
 *  a deterministic outcome the UI can react to. */
export function installListing(listing: Listing, workspaceId: string = 'default'): InstallResult {
  if (listing.price === 0) {
    return {
      ok: true,
      listingId: listing.id,
      action: 'installed',
      licenseKey: makeLicenseKey(listing.id, 'free', workspaceId),
      message: `${listing.title} installed to ${workspaceId}`,
    };
  }
  return {
    ok: true,
    listingId: listing.id,
    action: 'checkout',
    message: `Redirecting to checkout for ${listing.title} ($${listing.price})`,
  };
}

/** License-key format: lk-<sha256-12-of-listingId:license:scope:date> */
export function makeLicenseKey(
  listingId: string,
  license: string,
  scope: string,
  now: () => Date = () => new Date()
): string {
  const seed = `${listingId}:${license}:${scope}:${now().toISOString().slice(0, 10)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // emit a 16-char hex string
  const a = (h >>> 0).toString(16).padStart(8, '0');
  let h2 = h ^ 0xdeadbeef;
  for (let i = 0; i < seed.length; i++) {
    h2 ^= seed.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193);
  }
  const b = (h2 >>> 0).toString(16).padStart(8, '0');
  return `lk-${a}${b}`;
}

export function recordLicense(
  listing: Listing,
  scope: string,
  now: () => Date = () => new Date()
): LicenseRecord {
  return {
    key: makeLicenseKey(listing.id, listing.license, scope, now),
    listingId: listing.id,
    license: listing.license,
    issuedAt: now().toISOString(),
    ...(scope ? { scope } : {}),
  };
}

/** Activation check — a license is "valid" if its key matches the
 *  deterministic recipe for the given listing/license/scope/day. This
 *  is a placeholder for a real DRM/license server. */
export function activateLicense(
  record: LicenseRecord,
  listing: Listing,
  scope: string = record.scope ?? 'default',
  now: () => Date = () => new Date(record.issuedAt)
): boolean {
  const expected = makeLicenseKey(listing.id, listing.license, scope, now);
  return expected === record.key;
}

export function authorStats(items: Listing[], authorId: string): AuthorStats {
  const mine = items.filter((i) => i.authorId === authorId);
  if (mine.length === 0) {
    return { totalListings: 0, totalDownloads: 0, totalRevenue: 0, avgRating: 0 };
  }
  const totalDownloads = mine.reduce((a, b) => a + b.downloads, 0);
  // estimated revenue = price * downloads (placeholder, no margin)
  const totalRevenue = mine.reduce((a, b) => a + b.price * b.downloads, 0);
  const avgRating =
    mine.reduce((a, b) => a + b.rating * b.ratingCount, 0) /
    Math.max(1, mine.reduce((a, b) => a + b.ratingCount, 0));
  return {
    totalListings: mine.length,
    totalDownloads,
    totalRevenue,
    avgRating: Math.round(avgRating * 100) / 100,
  };
}

/** Author upload — append a new listing to in-memory list. Real impl
 *  would POST to /api/marketplace/listings. */
export function appendListing(items: Listing[], draft: Partial<Listing>): Listing[] {
  const id = draft.id ?? `ml-${String(items.length + 1).padStart(3, '0')}`;
  const listing: Listing = {
    id,
    category: (draft.category as ListingCategory) ?? 'kernels',
    title: draft.title ?? 'Untitled listing',
    author: draft.author ?? 'Anonymous',
    authorId: draft.authorId ?? 'anonymous',
    description: draft.description ?? '',
    price: draft.price ?? 0,
    license: draft.license ?? 'free',
    version: draft.version ?? '0.1.0',
    dependencies: draft.dependencies ?? [],
    downloads: 0,
    rating: 0,
    ratingCount: 0,
    tags: draft.tags ?? [],
    screenshots: draft.screenshots ?? [],
    published: draft.published ?? new Date().toISOString().slice(0, 10),
    featured: false,
  };
  return [...items, listing];
}
