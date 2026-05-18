/**
 * W209 Faza 500.0 — Marketplace Activation (Agent A).
 *
 * Revenue share calculator — splits per-install kernel revenue between
 * the kernel author and the platform.
 *
 * Tiers:
 *
 *   • Tier 1 (default)  — 70/30 split, no minimum.
 *   • Tier 2 (verified) — 75/25, requires 5+ certified kernels.
 *   • Tier 3 (partner)  — 80/20, contractual partner.
 *
 * Tax withholding is per-author (e.g. US W-9 vs EU VAT vs UK PSC) and
 * applied to the author's share only. The platform cut is gross.
 *
 * Multi-currency: USD / EUR / GBP / CAD / AUD. We persist amounts in
 * minor units (cents) and use integer math throughout to avoid float
 * drift in payout aggregation.
 *
 * Public surface:
 *
 *   computePayout({
 *     authorId, kernelInstallationCount, perInstallFee, period
 *   }) → { gross, platformCut, authorPayout, tax_withholding_pct }
 *
 *   getTier(author)
 *   monthlyPayoutSummary(authors)  → tabular aggregate
 */

export type AuthorTier = 1 | 2 | 3;

export type SupportedCurrency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD';

export interface AuthorProfile {
  authorId: string;
  /** Tier-2 / Tier-3 explicit override. */
  contractedTier?: AuthorTier;
  /** Number of currently-certified kernels. Drives auto-tier-2. */
  certifiedKernelCount: number;
  /** Optional tax withholding pct (e.g. 30 = 30%). Default 0. */
  tax_withholding_pct?: number;
  /** Payout currency. Default USD. */
  payoutCurrency?: SupportedCurrency;
}

export interface PayoutInput {
  authorId: string;
  kernelInstallationCount: number;
  /** Fee per install (or per month-of-install). In minor units (cents). */
  perInstallFee: number;
  /** Period label, e.g. '2026-05'. */
  period: string;
  /** Optional override of the resolved author. */
  authorProfile?: AuthorProfile;
}

export interface PayoutBreakdown {
  authorId: string;
  period: string;
  currency: SupportedCurrency;
  tier: AuthorTier;
  /** Author share (decimal, e.g. 0.70). */
  authorShare: number;
  /** Platform share (decimal). */
  platformShare: number;
  /** Gross revenue in minor units. */
  gross: number;
  /** Platform cut in minor units. */
  platformCut: number;
  /** Author payout BEFORE tax withholding, in minor units. */
  authorPayoutPreTax: number;
  /** Tax withholding pct (mirrored from profile). */
  tax_withholding_pct: number;
  /** Final author payout AFTER tax withholding, in minor units. */
  authorPayout: number;
}

/** Tier → share table. */
export const TIER_SPLITS: Record<AuthorTier, { author: number; platform: number }> = {
  1: { author: 0.70, platform: 0.30 },
  2: { author: 0.75, platform: 0.25 },
  3: { author: 0.80, platform: 0.20 },
};

/** Threshold (in certified kernels) to auto-promote to Tier 2. */
export const TIER2_THRESHOLD = 5;

/**
 * Resolve the effective tier for an author. Order:
 *   1) explicit `contractedTier` override (e.g. Tier 3 partner deal),
 *   2) auto-tier-2 if certifiedKernelCount >= 5,
 *   3) Tier 1 default.
 */
export function getTier(profile: AuthorProfile): AuthorTier {
  if (profile.contractedTier) return profile.contractedTier;
  if (profile.certifiedKernelCount >= TIER2_THRESHOLD) return 2;
  return 1;
}

/** Default author profile lookup — replaceable in tests. */
let _profileLookup: (authorId: string) => AuthorProfile = (id) => ({
  authorId: id,
  certifiedKernelCount: 0,
});

export function setProfileLookup(fn: (authorId: string) => AuthorProfile): void {
  _profileLookup = fn;
}

export function resetProfileLookup(): void {
  _profileLookup = (id) => ({ authorId: id, certifiedKernelCount: 0 });
}

/**
 * Compute the per-month payout for an author given install count + per-install fee.
 *
 * All amounts are in MINOR units (e.g. cents). Math is integer-only to
 * avoid float-rounding drift across thousands of authors.
 */
export function computePayout(input: PayoutInput): PayoutBreakdown {
  if (input.kernelInstallationCount < 0) {
    throw new Error('kernelInstallationCount must be >= 0');
  }
  if (input.perInstallFee < 0) {
    throw new Error('perInstallFee must be >= 0');
  }
  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    throw new Error('period must be YYYY-MM');
  }
  const profile = input.authorProfile ?? _profileLookup(input.authorId);
  const tier = getTier(profile);
  const { author: authorShare, platform: platformShare } = TIER_SPLITS[tier];
  const currency: SupportedCurrency = profile.payoutCurrency ?? 'USD';
  const taxPct = profile.tax_withholding_pct ?? 0;

  const gross = Math.round(input.kernelInstallationCount * input.perInstallFee);
  // Platform cut rounds toward platform (banker's rounding bias avoided
  // by using `Math.round` — the spec is "exact integer split with platform
  // taking the remainder").
  const platformCut = gross - Math.round(gross * authorShare);
  const authorPayoutPreTax = gross - platformCut;
  const taxWithheld = Math.round((authorPayoutPreTax * taxPct) / 100);
  const authorPayout = authorPayoutPreTax - taxWithheld;

  return {
    authorId: input.authorId,
    period: input.period,
    currency,
    tier,
    authorShare,
    platformShare,
    gross,
    platformCut,
    authorPayoutPreTax,
    tax_withholding_pct: taxPct,
    authorPayout,
  };
}

/** Aggregate per-month payout summary across a list of authors. */
export function monthlyPayoutSummary(
  rows: PayoutBreakdown[]
): {
  totalGross: number;
  totalPlatformCut: number;
  totalAuthorPayout: number;
  byCurrency: Record<SupportedCurrency, { gross: number; platformCut: number; authorPayout: number }>;
  rowCount: number;
} {
  const byCurrency: Record<string, { gross: number; platformCut: number; authorPayout: number }> = {};
  let totalGross = 0;
  let totalPlatformCut = 0;
  let totalAuthorPayout = 0;
  for (const r of rows) {
    totalGross += r.gross;
    totalPlatformCut += r.platformCut;
    totalAuthorPayout += r.authorPayout;
    const bucket = byCurrency[r.currency] ?? { gross: 0, platformCut: 0, authorPayout: 0 };
    bucket.gross += r.gross;
    bucket.platformCut += r.platformCut;
    bucket.authorPayout += r.authorPayout;
    byCurrency[r.currency] = bucket;
  }
  return {
    totalGross,
    totalPlatformCut,
    totalAuthorPayout,
    byCurrency: byCurrency as Record<SupportedCurrency, { gross: number; platformCut: number; authorPayout: number }>,
    rowCount: rows.length,
  };
}

/** Format minor-units → display string. e.g. 12345 USD → '$123.45'. */
export function formatMinor(amount: number, currency: SupportedCurrency): string {
  const major = amount / 100;
  const sym: Record<SupportedCurrency, string> = {
    USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$',
  };
  const sign = amount < 0 ? '-' : '';
  return `${sign}${sym[currency]}${Math.abs(major).toFixed(2)}`;
}
