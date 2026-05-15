/**
 * W152 Wave 18 — winTier ladder tests (Faza 15.A.6).
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WIN_TIER_LADDER,
  validateWinTierLadder,
  classifyPayout,
  tierOccupancy,
  applyTierLadder,
  type WinTierLadder,
} from '../src/report/winTier.js';

describe('validateWinTierLadder', () => {
  it('accepts the default ladder', () => {
    expect(() => validateWinTierLadder(DEFAULT_WIN_TIER_LADDER)).not.toThrow();
  });
  it('rejects empty', () => {
    expect(() => validateWinTierLadder([])).toThrow(/empty/);
  });
  it('rejects non-finite threshold', () => {
    expect(() => validateWinTierLadder([{ threshold: NaN, label: 'x' }])).toThrow(RangeError);
  });
  it('rejects negative threshold', () => {
    expect(() => validateWinTierLadder([{ threshold: -1, label: 'x' }])).toThrow(RangeError);
  });
  it('rejects empty label', () => {
    expect(() => validateWinTierLadder([{ threshold: 0, label: '' }])).toThrow(TypeError);
  });
  it('rejects unsorted thresholds', () => {
    expect(() =>
      validateWinTierLadder([
        { threshold: 0, label: 'a' },
        { threshold: 5, label: 'b' },
        { threshold: 1, label: 'c' },
      ]),
    ).toThrow(/ascending/);
  });
  it('rejects duplicate thresholds', () => {
    expect(() =>
      validateWinTierLadder([
        { threshold: 0, label: 'a' },
        { threshold: 0, label: 'b' },
      ]),
    ).toThrow(/duplicate/);
  });
});

describe('classifyPayout', () => {
  it('returns no_win for 0', () => {
    expect(classifyPayout(0).label).toBe('no_win');
  });
  it('returns micro_win for small payout', () => {
    expect(classifyPayout(0.5).label).toBe('micro_win');
  });
  it('returns big_win at exactly 10', () => {
    expect(classifyPayout(10).label).toBe('big_win');
  });
  it('returns grand_win at 200+', () => {
    expect(classifyPayout(500).label).toBe('grand_win');
  });
  it('returns highest tier for very large payout', () => {
    expect(classifyPayout(10000).label).toBe('grand_win');
  });
  it('rejects non-finite payout', () => {
    expect(() => classifyPayout(Infinity)).toThrow(TypeError);
    expect(() => classifyPayout(NaN)).toThrow(TypeError);
  });
  it('rejects negative payout', () => {
    expect(() => classifyPayout(-1)).toThrow(RangeError);
  });
  it('handles custom ladder', () => {
    const custom: WinTierLadder = [
      { threshold: 0, label: 'zero' },
      { threshold: 100, label: 'hundred' },
    ];
    expect(classifyPayout(50, custom).label).toBe('zero');
    expect(classifyPayout(150, custom).label).toBe('hundred');
  });
});

describe('tierOccupancy', () => {
  it('counts payouts into tiers', () => {
    const occ = tierOccupancy([0, 0.5, 1, 5, 15, 75, 300]);
    expect(occ.no_win).toBe(1);
    expect(occ.micro_win).toBe(1);
    expect(occ.standard_win).toBe(2); // 1 and 5
    expect(occ.big_win).toBe(1);
    expect(occ.major_win).toBe(1);
    expect(occ.grand_win).toBe(1);
  });
  it('initialises every tier to 0 even if not hit', () => {
    const occ = tierOccupancy([0, 0]);
    expect(occ.grand_win).toBe(0);
    expect(occ.no_win).toBe(2);
  });
});

describe('applyTierLadder', () => {
  it('returns one tagged tuple per payout', () => {
    const tagged = applyTierLadder([0, 5, 200]);
    expect(tagged).toHaveLength(3);
    expect(tagged[0].label).toBe('no_win');
    expect(tagged[1].label).toBe('standard_win');
    expect(tagged[2].label).toBe('grand_win');
  });
  it('preserves payoutX in the output', () => {
    const tagged = applyTierLadder([0.123]);
    expect(tagged[0].payoutX).toBe(0.123);
  });
});
