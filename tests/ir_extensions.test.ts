/**
 * W152 Wave 18 — IR Schema Extensions tests (Faza 15.A.1-5, 8-10).
 */

import { describe, it, expect } from 'vitest';
import {
  HitProbabilityRowZ,
  parseHitProbabilityRows,
  RtpBandZ,
  RtpBandsBundleZ,
  validateMonotonicCoverage,
  getRtpBandForBet,
  WinCapEntryZ,
  WinCapPerCurrencyZ,
  resolveWinCap,
  PaylineLadderZ,
  getLadderRung,
  checkLadderCompliance,
  JackpotOddsByBetBandZ,
  jackpotHitProbabilityForBet,
  EngineKindZ,
  ReelSetSelectorZ,
  pickReelSetVariant,
  ExtrasBagZ,
  getExtra,
  ExtensionsBundleZ,
  parseExtensions,
} from '../src/ir/extensions.js';

// ── 15.A.1 hitProbability ────────────────────────────────────────────────
describe('HitProbabilityRow (15.A.1)', () => {
  it('accepts a valid row with hitProbability', () => {
    const r = HitProbabilityRowZ.parse({ symbolId: 'WLD', count: 5, payout: 100, hitProbability: 0.001 });
    expect(r.hitProbability).toBe(0.001);
  });
  it('accepts row without optional hitProbability', () => {
    const r = HitProbabilityRowZ.parse({ symbolId: 'A', count: 3, payout: 5 });
    expect(r.hitProbability).toBeUndefined();
  });
  it('rejects hitProbability > 1', () => {
    expect(() =>
      HitProbabilityRowZ.parse({ symbolId: 'A', count: 3, payout: 5, hitProbability: 1.5 }),
    ).toThrow();
  });
  it('rejects negative count', () => {
    expect(() => HitProbabilityRowZ.parse({ symbolId: 'A', count: -1, payout: 5 })).toThrow();
  });
  it('parseHitProbabilityRows accepts an array', () => {
    const arr = parseHitProbabilityRows([
      { symbolId: 'A', count: 3, payout: 5 },
      { symbolId: 'A', count: 4, payout: 25, hitProbability: 0.0001 },
    ]);
    expect(arr).toHaveLength(2);
  });
});

// ── 15.A.2 rtpBands + volatility ─────────────────────────────────────────
describe('RtpBands (15.A.2)', () => {
  it('accepts a valid single band', () => {
    const b = RtpBandZ.parse({ minBet: 0.1, maxBet: 1.0, minRtp: 0.94, maxRtp: 0.96 });
    expect(b.minBet).toBe(0.1);
  });
  it('rejects minBet > maxBet', () => {
    expect(() => RtpBandZ.parse({ minBet: 5, maxBet: 1, minRtp: 0.9, maxRtp: 0.96 })).toThrow();
  });
  it('rejects minRtp > maxRtp', () => {
    expect(() => RtpBandZ.parse({ minBet: 0, maxBet: 1, minRtp: 0.97, maxRtp: 0.94 })).toThrow();
  });
  it('validateMonotonicCoverage detects overlap', () => {
    expect(() =>
      validateMonotonicCoverage([
        { minBet: 0, maxBet: 1, minRtp: 0.94, maxRtp: 0.96 },
        { minBet: 0.5, maxBet: 2, minRtp: 0.94, maxRtp: 0.96 },
      ]),
    ).toThrow(/overlap/);
  });
  it('validateMonotonicCoverage detects gap', () => {
    expect(() =>
      validateMonotonicCoverage([
        { minBet: 0, maxBet: 1, minRtp: 0.94, maxRtp: 0.96 },
        { minBet: 5, maxBet: 10, minRtp: 0.94, maxRtp: 0.96 },
      ]),
    ).toThrow(/gap/);
  });
  it('validateMonotonicCoverage returns sorted on contiguous bands', () => {
    const bands = [
      { minBet: 1, maxBet: 5, minRtp: 0.94, maxRtp: 0.96 },
      { minBet: 0, maxBet: 1, minRtp: 0.92, maxRtp: 0.94 },
    ];
    const sorted = validateMonotonicCoverage(bands);
    expect(sorted[0].minBet).toBe(0);
    expect(sorted[1].minBet).toBe(1);
  });
  it('getRtpBandForBet returns band for in-range bet', () => {
    const bands = [
      { minBet: 0, maxBet: 1, minRtp: 0.92, maxRtp: 0.94 },
      { minBet: 1, maxBet: 5, minRtp: 0.94, maxRtp: 0.96 },
    ];
    expect(getRtpBandForBet(bands, 0.5)?.minRtp).toBe(0.92);
    expect(getRtpBandForBet(bands, 3.0)?.minRtp).toBe(0.94);
  });
  it('getRtpBandForBet returns null for out-of-range', () => {
    const bands = [{ minBet: 0, maxBet: 1, minRtp: 0.92, maxRtp: 0.94 }];
    expect(getRtpBandForBet(bands, 99)).toBeNull();
    expect(getRtpBandForBet(bands, -1)).toBeNull();
  });
  it('RtpBandsBundle accepts optional volatility curve', () => {
    const bundle = RtpBandsBundleZ.parse({
      bands: [{ minBet: 0, maxBet: 1, minRtp: 0.94, maxRtp: 0.96 }],
      volatilityCurve: [{ bet: 0.5, expectedSigma: 1.2 }],
    });
    expect(bundle.volatilityCurve).toHaveLength(1);
  });
});

// ── 15.A.3 winCap per currency ───────────────────────────────────────────
describe('WinCapPerCurrency (15.A.3)', () => {
  it('accepts ISO 4217 codes', () => {
    const map = WinCapPerCurrencyZ.parse({
      EUR: { capX: 10000, mode: 'strict' },
      BRL: { capX: 25000, mode: 'inclusive' },
    });
    expect(map.EUR.capX).toBe(10000);
  });
  it('rejects non-ISO codes', () => {
    expect(() =>
      WinCapPerCurrencyZ.parse({ Eur: { capX: 100, mode: 'strict' } }),
    ).toThrow();
  });
  it('rejects unknown mode', () => {
    expect(() =>
      WinCapEntryZ.parse({ capX: 100, mode: 'lenient' as 'strict' }),
    ).toThrow();
  });
  it('resolveWinCap returns direct match', () => {
    const map = { GBP: { capX: 10000, mode: 'strict' as const } };
    expect(resolveWinCap(map, 'GBP')?.capX).toBe(10000);
  });
  it('resolveWinCap falls back to default', () => {
    const r = resolveWinCap({}, 'GBP', 5000);
    expect(r?.capX).toBe(5000);
    expect(r?.mode).toBe('strict');
  });
  it('resolveWinCap returns null when no entry and no default', () => {
    expect(resolveWinCap({}, 'GBP')).toBeNull();
  });
});

// ── 15.A.4 paylineLadder ─────────────────────────────────────────────────
describe('PaylineLadder (15.A.4)', () => {
  const LADDER = PaylineLadderZ.parse([
    { paylines: 1, allowedBets: [0.1, 0.5] },
    { paylines: 5, allowedBets: [0.5, 1.0, 5.0] },
    { paylines: 25, allowedBets: [1.0, 5.0, 25.0] },
  ]);
  it('getLadderRung finds rung by paylines', () => {
    expect(getLadderRung(LADDER, 5)?.allowedBets).toEqual([0.5, 1.0, 5.0]);
  });
  it('getLadderRung returns null for unknown paylines', () => {
    expect(getLadderRung(LADDER, 7)).toBeNull();
  });
  it('checkLadderCompliance accepts valid pair', () => {
    expect(checkLadderCompliance(LADDER, 5, 1.0)).toEqual({ ok: true });
  });
  it('checkLadderCompliance rejects unknown paylines', () => {
    const r = checkLadderCompliance(LADDER, 7, 1.0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not in ladder/);
  });
  it('checkLadderCompliance rejects unallowed bet', () => {
    const r = checkLadderCompliance(LADDER, 5, 0.1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not in allowed list/);
  });
  it('rejects empty ladder', () => {
    expect(() => PaylineLadderZ.parse([])).toThrow();
  });
});

// ── 15.A.5 jackpotOddsByBetBand ──────────────────────────────────────────
describe('JackpotOddsByBetBand (15.A.5)', () => {
  it('accepts valid tier', () => {
    const t = JackpotOddsByBetBandZ.parse({
      tierId: 'mini',
      bands: [{ minBet: 0, maxBet: 1, oddsX: 100000 }],
    });
    expect(t.tierId).toBe('mini');
  });
  it('jackpotHitProbabilityForBet returns 1/oddsX in range', () => {
    const t = {
      tierId: 'major',
      bands: [{ minBet: 0, maxBet: 5, oddsX: 50000 }],
    };
    expect(jackpotHitProbabilityForBet(t, 1.0)).toBeCloseTo(1 / 50000);
  });
  it('jackpotHitProbabilityForBet returns 0 out of range', () => {
    const t = {
      tierId: 'major',
      bands: [{ minBet: 0, maxBet: 5, oddsX: 50000 }],
    };
    expect(jackpotHitProbabilityForBet(t, 99)).toBe(0);
  });
  it('jackpotHitProbabilityForBet picks first matching band', () => {
    const t = {
      tierId: 'multi',
      bands: [
        { minBet: 0, maxBet: 1, oddsX: 100000 },
        { minBet: 1, maxBet: 5, oddsX: 50000 },
      ],
    };
    expect(jackpotHitProbabilityForBet(t, 0.5)).toBeCloseTo(1 / 100000);
    // bet=1 matches FIRST band (inclusive on maxBet)
    expect(jackpotHitProbabilityForBet(t, 1)).toBeCloseTo(1 / 100000);
    expect(jackpotHitProbabilityForBet(t, 3)).toBeCloseTo(1 / 50000);
  });
});

// ── 15.A.8 engineKind enum ───────────────────────────────────────────────
describe('EngineKind (15.A.8)', () => {
  it('accepts all 5 kinds', () => {
    for (const k of ['standard', 'independent', 'stepper', 'pyramid', 'tumbling'] as const) {
      expect(EngineKindZ.parse(k)).toBe(k);
    }
  });
  it('rejects unknown kind', () => {
    expect(() => EngineKindZ.parse('cluster')).toThrow();
  });
});

// ── 15.A.9 reelSetSelector ───────────────────────────────────────────────
describe('ReelSetSelector (15.A.9)', () => {
  const SEL = ReelSetSelectorZ.parse({
    variants: [
      { variantId: 'baseA', weight: 70 },
      { variantId: 'highVolB', weight: 30 },
    ],
  });
  it('rejects single-variant selector', () => {
    expect(() =>
      ReelSetSelectorZ.parse({ variants: [{ variantId: 'only', weight: 1 }] }),
    ).toThrow();
  });
  it('pickReelSetVariant respects weights at 0', () => {
    expect(pickReelSetVariant(SEL, 0)).toBe('baseA');
  });
  it('pickReelSetVariant respects weights near 1', () => {
    expect(pickReelSetVariant(SEL, 0.99)).toBe('highVolB');
  });
  it('pickReelSetVariant rejects out-of-range uniform', () => {
    expect(() => pickReelSetVariant(SEL, 1)).toThrow(RangeError);
    expect(() => pickReelSetVariant(SEL, -0.01)).toThrow(RangeError);
    expect(() => pickReelSetVariant(SEL, NaN)).toThrow(RangeError);
  });
  it('weight distribution holds across many draws', () => {
    let baseCount = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      // Pseudo-uniform: i / N covers [0, 1).
      if (pickReelSetVariant(SEL, i / N) === 'baseA') baseCount++;
    }
    // 70% expected. Within ±2% on N=10000.
    expect(baseCount / N).toBeGreaterThan(0.68);
    expect(baseCount / N).toBeLessThan(0.72);
  });
});

// ── 15.A.10 extras bag ───────────────────────────────────────────────────
describe('ExtrasBag (15.A.10)', () => {
  it('accepts arbitrary nested JSON', () => {
    const bag = ExtrasBagZ.parse({
      operatorTag: 'NJ-DGE-2024-15',
      experimental: { feature_X_enabled: true, threshold: 0.95 },
      list: [1, 2, 'three', null, [true, false]],
    });
    expect((bag as Record<string, unknown>).operatorTag).toBe('NJ-DGE-2024-15');
  });
  it('rejects non-finite numbers', () => {
    expect(() => ExtrasBagZ.parse({ broken: NaN })).toThrow();
    expect(() => ExtrasBagZ.parse({ broken: Infinity })).toThrow();
  });
  it('rejects undefined values', () => {
    expect(() => ExtrasBagZ.parse({ broken: undefined })).toThrow();
  });
  it('getExtra returns the value or null', () => {
    const bag = { foo: 'bar' };
    expect(getExtra(bag, 'foo')).toBe('bar');
    expect(getExtra(bag, 'missing')).toBeNull();
  });
});

// ── ExtensionsBundle ─────────────────────────────────────────────────────
describe('ExtensionsBundle', () => {
  it('accepts a complete bundle', () => {
    const b = parseExtensions({
      hitProbabilityRows: [{ symbolId: 'A', count: 3, payout: 5 }],
      rtpBands: { bands: [{ minBet: 0, maxBet: 1, minRtp: 0.94, maxRtp: 0.96 }] },
      winCapPerCurrency: { EUR: { capX: 10000, mode: 'strict' } },
      paylineLadder: [{ paylines: 1, allowedBets: [0.1] }],
      jackpotOdds: [{ tierId: 'mini', bands: [{ minBet: 0, maxBet: 1, oddsX: 100000 }] }],
      engineKind: 'standard',
      reelSetSelector: {
        variants: [
          { variantId: 'A', weight: 1 },
          { variantId: 'B', weight: 1 },
        ],
      },
      extras: { customField: 'custom-value' },
    });
    expect(b.engineKind).toBe('standard');
  });
  it('parseExtensions enforces monotonic coverage on rtpBands', () => {
    expect(() =>
      parseExtensions({
        rtpBands: {
          bands: [
            { minBet: 0, maxBet: 1, minRtp: 0.94, maxRtp: 0.96 },
            { minBet: 0.5, maxBet: 2, minRtp: 0.94, maxRtp: 0.96 },
          ],
        },
      }),
    ).toThrow(/overlap/);
  });
  it('rejects unknown top-level keys (strict)', () => {
    expect(() =>
      ExtensionsBundleZ.parse({ engineKind: 'standard', unknown: 'extra' }),
    ).toThrow();
  });
});
