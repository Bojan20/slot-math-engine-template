/**
 * CORTI 200.7-MARKETPLACE — Marketplace unit tests.
 *
 * Covers the data layer: load, filter, search, sort, install flow,
 * license generation, author stats, append (upload).
 */

import { describe, it, expect } from 'vitest';
import {
  filterListings,
  sortListings,
  featuredListings,
  installListing,
  makeLicenseKey,
  recordLicense,
  activateLicense,
  authorStats,
  appendListing,
  ALL_CATEGORIES,
} from '../src/data.js';
import type { Listing } from '../src/types.js';
import listingsJson from '../data/listings.json' assert { type: 'json' };

const LISTINGS = listingsJson.listings as Listing[];

describe('marketplace · listings data integrity', () => {
  it('contains at least 30 listings with well-formed shape', () => {
    expect(LISTINGS.length).toBeGreaterThanOrEqual(30);
    for (const l of LISTINGS) {
      expect(l.id).toMatch(/^ml-\d{3}$/);
      expect(typeof l.title).toBe('string');
      expect(l.title.length).toBeGreaterThan(0);
      expect(['free', 'single-game', 'studio-wide', 'site']).toContain(l.license);
      expect(ALL_CATEGORIES).toContain(l.category);
      expect(l.price).toBeGreaterThanOrEqual(0);
    }
  });

  it('covers all 6 categories', () => {
    const cats = new Set(LISTINGS.map((l) => l.category));
    expect(cats.size).toBe(6);
    for (const c of ALL_CATEGORIES) expect(cats.has(c)).toBe(true);
  });

  it('has at least one free listing per major category', () => {
    const freeCats = new Set(LISTINGS.filter((l) => l.price === 0).map((l) => l.category));
    expect(freeCats.size).toBeGreaterThanOrEqual(4);
  });
});

describe('marketplace · filter + search', () => {
  it('returns everything for empty filter', () => {
    expect(filterListings(LISTINGS, {}).length).toBe(LISTINGS.length);
  });

  it('filters by category', () => {
    const kernels = filterListings(LISTINGS, { category: 'kernels' });
    expect(kernels.length).toBeGreaterThan(0);
    for (const l of kernels) expect(l.category).toBe('kernels');
  });

  it('filters by free price', () => {
    const free = filterListings(LISTINGS, { priceFilter: 'free' });
    for (const l of free) expect(l.price).toBe(0);
  });

  it('filters by paid price', () => {
    const paid = filterListings(LISTINGS, { priceFilter: 'paid' });
    for (const l of paid) expect(l.price).toBeGreaterThan(0);
  });

  it('search matches title / desc / tags case-insensitively', () => {
    const r = filterListings(LISTINGS, { search: 'megaways' });
    expect(r.length).toBeGreaterThan(0);
    const hits = r.every((l) => `${l.title} ${l.description} ${l.tags.join(' ')}`.toLowerCase().includes('megaways'));
    expect(hits).toBe(true);
  });

  it('filters by license', () => {
    const free = filterListings(LISTINGS, { license: 'free' });
    for (const l of free) expect(l.license).toBe('free');
  });
});

describe('marketplace · sort', () => {
  it('popularity sort puts the highest-downloads listing first', () => {
    const r = sortListings(LISTINGS, 'popularity');
    for (let i = 1; i < r.length; i++) expect(r[i - 1].downloads >= r[i].downloads).toBe(true);
  });

  it('price-asc sort puts free listings first', () => {
    const r = sortListings(LISTINGS, 'price-asc');
    expect(r[0].price).toBe(0);
  });

  it('recent sort puts newest published date first', () => {
    const r = sortListings(LISTINGS, 'recent');
    for (let i = 1; i < r.length; i++) expect(r[i - 1].published >= r[i].published).toBe(true);
  });

  it('rating sort orders by descending rating', () => {
    const r = sortListings(LISTINGS, 'rating');
    for (let i = 1; i < r.length; i++) expect(r[i - 1].rating >= r[i].rating).toBe(true);
  });
});

describe('marketplace · featured', () => {
  it('returns only listings marked featured', () => {
    const f = featuredListings(LISTINGS);
    expect(f.length).toBeGreaterThan(0);
    for (const l of f) expect(l.featured).toBe(true);
  });
});

describe('marketplace · install flow', () => {
  it('free listing installs immediately and issues a license key', () => {
    const free = LISTINGS.find((l) => l.price === 0)!;
    const r = installListing(free, 'workspace-1');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('installed');
    expect(r.licenseKey).toMatch(/^lk-[0-9a-f]{16}$/);
  });

  it('paid listing routes to checkout', () => {
    const paid = LISTINGS.find((l) => l.price > 0)!;
    const r = installListing(paid);
    expect(r.action).toBe('checkout');
  });
});

describe('marketplace · license (DRM stub)', () => {
  it('makeLicenseKey is deterministic per (listing,license,scope,day)', () => {
    const fixedNow = () => new Date('2026-05-18T10:00:00Z');
    const a = makeLicenseKey('ml-001', 'studio-wide', 'workspace-x', fixedNow);
    const b = makeLicenseKey('ml-001', 'studio-wide', 'workspace-x', fixedNow);
    expect(a).toBe(b);
    expect(a).toMatch(/^lk-[0-9a-f]{16}$/);
  });

  it('different scopes produce different license keys', () => {
    const fixedNow = () => new Date('2026-05-18T10:00:00Z');
    const a = makeLicenseKey('ml-001', 'studio-wide', 'workspace-x', fixedNow);
    const b = makeLicenseKey('ml-001', 'studio-wide', 'workspace-y', fixedNow);
    expect(a).not.toBe(b);
  });

  it('recordLicense + activateLicense round-trip succeeds for matching scope', () => {
    const fixedNow = () => new Date('2026-05-18T10:00:00Z');
    const listing = LISTINGS[0];
    const rec = recordLicense(listing, 'workspace-1', fixedNow);
    const ok = activateLicense(rec, listing, 'workspace-1', fixedNow);
    expect(ok).toBe(true);
  });

  it('activateLicense rejects tampered key', () => {
    const fixedNow = () => new Date('2026-05-18T10:00:00Z');
    const listing = LISTINGS[0];
    const rec = recordLicense(listing, 'workspace-1', fixedNow);
    rec.key = 'lk-deadbeefdeadbeef';
    expect(activateLicense(rec, listing, 'workspace-1', fixedNow)).toBe(false);
  });
});

describe('marketplace · author mode', () => {
  it('authorStats returns zeros for unknown author', () => {
    const s = authorStats(LISTINGS, 'no-such-author');
    expect(s.totalListings).toBe(0);
    expect(s.totalDownloads).toBe(0);
    expect(s.totalRevenue).toBe(0);
  });

  it('authorStats aggregates downloads + revenue for known author', () => {
    const s = authorStats(LISTINGS, 'smec');
    expect(s.totalListings).toBeGreaterThan(0);
    expect(s.totalDownloads).toBeGreaterThan(0);
    expect(s.avgRating).toBeGreaterThan(0);
  });

  it('appendListing adds a new listing with default fields', () => {
    const before = LISTINGS.length;
    const after = appendListing(LISTINGS, { title: 'New Test Kernel', category: 'kernels', price: 10 });
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].title).toBe('New Test Kernel');
    expect(after[after.length - 1].id).toMatch(/^ml-\d{3}$/);
  });

  it('appendListing preserves the input array immutably', () => {
    const before = LISTINGS.length;
    appendListing(LISTINGS, { title: 'Throwaway' });
    expect(LISTINGS.length).toBe(before);
  });
});
