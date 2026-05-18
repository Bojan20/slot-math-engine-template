/**
 * CORTI 200.7-MARKETPLACE — listing type model.
 */

export type ListingCategory =
  | 'kernels'
  | 'templates'
  | 'themes'
  | 'audio'
  | 'animations'
  | 'formulas';

export type ListingLicense = 'free' | 'single-game' | 'studio-wide' | 'site';

export interface Listing {
  id: string;
  category: ListingCategory;
  title: string;
  author: string;
  authorId: string;
  description: string;
  /** USD. 0 = free. */
  price: number;
  license: ListingLicense;
  version: string;
  /** IDs of other listings this depends on. */
  dependencies: string[];
  downloads: number;
  rating: number;
  ratingCount: number;
  tags: string[];
  screenshots: string[];
  published: string;
  featured: boolean;
}

export interface ListingFilter {
  /** Text search across title/desc/author/tags. */
  search?: string;
  category?: ListingCategory | 'all';
  /** `free` | `paid` | `all`. */
  priceFilter?: 'free' | 'paid' | 'all';
  license?: ListingLicense | 'any';
}

export type SortKey = 'popularity' | 'recent' | 'price-asc' | 'price-desc' | 'rating';

export interface InstallResult {
  ok: boolean;
  listingId: string;
  /** `free → 'installed'`, `paid → 'checkout'`. */
  action: 'installed' | 'checkout';
  licenseKey?: string;
  message: string;
}

export interface AuthorStats {
  totalListings: number;
  totalDownloads: number;
  totalRevenue: number;
  avgRating: number;
}

export type ViewMode = 'browse' | 'templates' | 'author';

/** License key minted for paid install (DRM placeholder). */
export interface LicenseRecord {
  key: string;
  listingId: string;
  license: ListingLicense;
  /** ISO timestamp. */
  issuedAt: string;
  /** Optional workspace/site identifier to restrict to. */
  scope?: string;
}
