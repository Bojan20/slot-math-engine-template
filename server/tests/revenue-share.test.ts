/**
 * W209 Faza 500.0 — revenue-share specs (Agent A).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computePayout,
  getTier,
  monthlyPayoutSummary,
  formatMinor,
  setProfileLookup,
  resetProfileLookup,
  TIER_SPLITS,
  TIER2_THRESHOLD,
} from '../lib/revenue-share.js';

describe('revenue-share · getTier', () => {
  it('returns Tier 1 by default', () => {
    expect(getTier({ authorId: 'a', certifiedKernelCount: 0 })).toBe(1);
  });

  it('auto-promotes to Tier 2 at 5+ certified kernels', () => {
    expect(getTier({ authorId: 'a', certifiedKernelCount: TIER2_THRESHOLD })).toBe(2);
    expect(getTier({ authorId: 'a', certifiedKernelCount: 12 })).toBe(2);
  });

  it('honors contractedTier override (partner)', () => {
    expect(getTier({ authorId: 'a', certifiedKernelCount: 0, contractedTier: 3 })).toBe(3);
  });

  it('contractedTier wins over auto-tier', () => {
    expect(getTier({ authorId: 'a', certifiedKernelCount: 10, contractedTier: 3 })).toBe(3);
  });
});

describe('revenue-share · computePayout', () => {
  beforeEach(() => resetProfileLookup());

  it('splits 70/30 for default Tier 1', () => {
    const r = computePayout({
      authorId: 'tier1',
      kernelInstallationCount: 100,
      perInstallFee: 500, // $5.00
      period: '2026-05',
    });
    expect(r.gross).toBe(50_000);
    expect(r.tier).toBe(1);
    expect(r.authorShare).toBeCloseTo(0.70);
    expect(r.platformCut).toBe(15_000);
    expect(r.authorPayout).toBe(35_000);
  });

  it('splits 75/25 for Tier 2 author', () => {
    const r = computePayout({
      authorId: 'tier2',
      kernelInstallationCount: 200,
      perInstallFee: 500,
      period: '2026-05',
      authorProfile: { authorId: 'tier2', certifiedKernelCount: 7 },
    });
    expect(r.tier).toBe(2);
    expect(r.platformCut).toBe(25_000);
    expect(r.authorPayout).toBe(75_000);
  });

  it('splits 80/20 for Tier 3 partner', () => {
    const r = computePayout({
      authorId: 'tier3',
      kernelInstallationCount: 1000,
      perInstallFee: 500,
      period: '2026-05',
      authorProfile: { authorId: 'tier3', certifiedKernelCount: 20, contractedTier: 3 },
    });
    expect(r.tier).toBe(3);
    expect(r.platformCut).toBe(100_000);
    expect(r.authorPayout).toBe(400_000);
  });

  it('applies tax withholding ONLY to author share', () => {
    const r = computePayout({
      authorId: 'a',
      kernelInstallationCount: 100,
      perInstallFee: 100,
      period: '2026-05',
      authorProfile: { authorId: 'a', certifiedKernelCount: 0, tax_withholding_pct: 30 },
    });
    expect(r.gross).toBe(10_000);
    expect(r.platformCut).toBe(3_000);
    expect(r.authorPayoutPreTax).toBe(7_000);
    expect(r.authorPayout).toBe(4_900); // 7000 * 0.7
  });

  it('threads payoutCurrency through', () => {
    const r = computePayout({
      authorId: 'eu',
      kernelInstallationCount: 10,
      perInstallFee: 100,
      period: '2026-05',
      authorProfile: { authorId: 'eu', certifiedKernelCount: 0, payoutCurrency: 'EUR' },
    });
    expect(r.currency).toBe('EUR');
  });

  it('uses configured profile lookup', () => {
    setProfileLookup(() => ({
      authorId: 'global',
      certifiedKernelCount: 10,
      payoutCurrency: 'GBP',
    }));
    const r = computePayout({
      authorId: 'global',
      kernelInstallationCount: 100,
      perInstallFee: 500,
      period: '2026-05',
    });
    expect(r.tier).toBe(2);
    expect(r.currency).toBe('GBP');
  });

  it('zero installs → zero gross + zero payouts', () => {
    const r = computePayout({
      authorId: 'idle',
      kernelInstallationCount: 0,
      perInstallFee: 500,
      period: '2026-05',
    });
    expect(r.gross).toBe(0);
    expect(r.platformCut).toBe(0);
    expect(r.authorPayout).toBe(0);
  });

  it('rejects negative install count', () => {
    expect(() =>
      computePayout({
        authorId: 'a',
        kernelInstallationCount: -1,
        perInstallFee: 100,
        period: '2026-05',
      })
    ).toThrow(/>= 0/);
  });

  it('rejects malformed period', () => {
    expect(() =>
      computePayout({
        authorId: 'a',
        kernelInstallationCount: 1,
        perInstallFee: 100,
        period: '2026/5',
      })
    ).toThrow(/YYYY-MM/);
  });
});

describe('revenue-share · monthlyPayoutSummary', () => {
  it('aggregates totals and groups by currency', () => {
    const rows = [
      computePayout({
        authorId: 'a',
        kernelInstallationCount: 100,
        perInstallFee: 500,
        period: '2026-05',
        authorProfile: { authorId: 'a', certifiedKernelCount: 0, payoutCurrency: 'USD' },
      }),
      computePayout({
        authorId: 'b',
        kernelInstallationCount: 50,
        perInstallFee: 500,
        period: '2026-05',
        authorProfile: { authorId: 'b', certifiedKernelCount: 0, payoutCurrency: 'EUR' },
      }),
    ];
    const sum = monthlyPayoutSummary(rows);
    expect(sum.rowCount).toBe(2);
    expect(sum.totalGross).toBe(75_000);
    expect(sum.byCurrency.USD.gross).toBe(50_000);
    expect(sum.byCurrency.EUR.gross).toBe(25_000);
  });
});

describe('revenue-share · formatMinor', () => {
  it('USD prefixed with $', () => {
    expect(formatMinor(12_345, 'USD')).toBe('$123.45');
  });

  it('EUR prefixed with €', () => {
    expect(formatMinor(99_900, 'EUR')).toBe('€999.00');
  });

  it('negative amount keeps sign before symbol', () => {
    expect(formatMinor(-500, 'GBP')).toBe('-£5.00');
  });
});

describe('revenue-share · TIER_SPLITS table', () => {
  it('every tier sums to 1.0', () => {
    for (const t of [1, 2, 3] as const) {
      expect(TIER_SPLITS[t].author + TIER_SPLITS[t].platform).toBeCloseTo(1.0);
    }
  });
});
