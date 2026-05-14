import { describe, it, expect } from 'vitest';
import {
  roundMinorUnits,
  lookupRoundingMode,
  DEFAULT_ROUNDING_TABLE,
  triggersW2G,
  maybeW2GEvent,
  W2G_SLOT_THRESHOLD_USD_2024,
  createBonusWageringState,
  logEligibleWager,
  forfeitBonus,
  isBonusCleared,
  MAX_WAGERING_MULTIPLIER,
  type BonusWageringState,
} from '../src/protocols/multiCurrency.js';

// ─── roundMinorUnits ──────────────────────────────────────────────────────────

describe('roundMinorUnits', () => {
  it('half_even rounds 2.5 → 2 (banker\'s)', () => {
    expect(roundMinorUnits(2.5, 'half_even')).toBe(2);
  });

  it('half_even rounds 3.5 → 4 (banker\'s)', () => {
    expect(roundMinorUnits(3.5, 'half_even')).toBe(4);
  });

  it('half_up rounds 2.5 → 3', () => {
    expect(roundMinorUnits(2.5, 'half_up')).toBe(3);
  });

  it('truncate drops fractional part', () => {
    expect(roundMinorUnits(2.99, 'truncate')).toBe(2);
    expect(roundMinorUnits(-2.99, 'truncate')).toBe(-2);
  });

  it('half_up of negative rounds toward zero on -2.5', () => {
    expect(roundMinorUnits(-2.5, 'half_up')).toBe(-3);
  });

  it('rejects non-finite input', () => {
    expect(() => roundMinorUnits(Number.NaN)).toThrow(/finite/);
    expect(() => roundMinorUnits(Infinity)).toThrow(/finite/);
  });

  it('default mode is half_even', () => {
    expect(roundMinorUnits(2.5)).toBe(2);
  });
});

// ─── lookupRoundingMode ───────────────────────────────────────────────────────

describe('lookupRoundingMode', () => {
  it('EUR → half_even (ECB)', () => {
    expect(lookupRoundingMode('EUR')).toBe('half_even');
  });

  it('USD → half_up (W-2G convention)', () => {
    expect(lookupRoundingMode('USD')).toBe('half_up');
  });

  it('JPY → truncate (no minor units)', () => {
    expect(lookupRoundingMode('JPY')).toBe('truncate');
  });

  it('unknown currency falls back to half_even', () => {
    expect(lookupRoundingMode('XXX')).toBe('half_even');
  });

  it('honours operator override', () => {
    expect(
      lookupRoundingMode('EUR', { EUR: 'half_up' })
    ).toBe('half_up');
  });

  it('DEFAULT_ROUNDING_TABLE is frozen', () => {
    expect(Object.isFrozen(DEFAULT_ROUNDING_TABLE)).toBe(true);
  });
});

// ─── W-2G threshold ───────────────────────────────────────────────────────────

describe('triggersW2G', () => {
  it('fires at exactly $1,200 USD slot win (default threshold)', () => {
    expect(triggersW2G(120_000, 'USD')).toBe(true);
  });

  it('does not fire below threshold', () => {
    expect(triggersW2G(119_999, 'USD')).toBe(false);
  });

  it('does not fire for non-USD without explicit threshold', () => {
    expect(triggersW2G(120_000, 'EUR')).toBe(false);
  });

  it('honours custom threshold (2025 proposed $5,000)', () => {
    const t = { slotWinMinor: 500_000, currency: 'USD' as const };
    expect(triggersW2G(499_999, 'USD', t)).toBe(false);
    expect(triggersW2G(500_000, 'USD', t)).toBe(true);
  });
});

describe('maybeW2GEvent', () => {
  it('returns null when below threshold', () => {
    expect(
      maybeW2GEvent({ winMinor: 100, stakeMinor: 100, currency: 'USD' })
    ).toBeNull();
  });

  it('returns event payload at threshold with source', () => {
    const e = maybeW2GEvent({ winMinor: 120_000, stakeMinor: 1000, currency: 'USD' });
    expect(e).not.toBeNull();
    expect(e!.kind).toBe('w2g_threshold_reached');
    expect(e!.thresholdMinor).toBe(120_000);
    expect(e!.source).toContain('IRS');
  });

  it('threshold source is documented', () => {
    expect(W2G_SLOT_THRESHOLD_USD_2024.source).toContain('IRS');
  });
});

// ─── Bonus wagering tracker ───────────────────────────────────────────────────

describe('createBonusWageringState', () => {
  it('initialises with progress 0 and requirement = bonus × wr', () => {
    const s = createBonusWageringState({
      bonusId: 'b1',
      bonusAmountMinor: 1000,
      wrMultiplier: 10,
      expiresAt: '2026-12-31T00:00:00Z',
      currency: 'EUR',
      now: '2026-05-15T00:00:00Z',
    });
    expect(s.progressMinor).toBe(0);
    expect(s.requirementMinor).toBe(10_000);
    expect(s.status).toBe('active');
    expect(s.transitions.activeAt).toBe('2026-05-15T00:00:00Z');
  });

  it('rejects bonus amount ≤ 0', () => {
    expect(() =>
      createBonusWageringState({
        bonusId: 'b1',
        bonusAmountMinor: 0,
        wrMultiplier: 10,
        expiresAt: 'X',
        currency: 'EUR',
        now: 'Y',
      })
    ).toThrow(/bonusAmountMinor/);
  });

  it('rejects WR > 10 (UKGC SI 2025/215 cap)', () => {
    expect(() =>
      createBonusWageringState({
        bonusId: 'b1',
        bonusAmountMinor: 1000,
        wrMultiplier: 11,
        expiresAt: 'X',
        currency: 'EUR',
        now: 'Y',
      })
    ).toThrow(/UKGC SI 2025\/215/);
  });

  it('exposes MAX_WAGERING_MULTIPLIER constant', () => {
    expect(MAX_WAGERING_MULTIPLIER).toBe(10);
  });
});

// ─── logEligibleWager ─────────────────────────────────────────────────────────

describe('logEligibleWager', () => {
  let s: BonusWageringState;

  function freshBonus(): BonusWageringState {
    return createBonusWageringState({
      bonusId: 'b1',
      bonusAmountMinor: 1000,
      wrMultiplier: 5,
      expiresAt: '2026-12-31T00:00:00Z',
      currency: 'EUR',
      now: '2026-05-15T00:00:00Z',
    });
  }

  it('progress accumulates and emits bonus_progress event', () => {
    s = freshBonus();
    const ev = logEligibleWager(s, { betMinor: 1000, now: '2026-05-15T01:00:00Z' });
    expect(s.progressMinor).toBe(1000);
    expect(ev.kind).toBe('bonus_progress');
  });

  it('transitions to cleared when progress reaches requirement', () => {
    s = freshBonus();
    // requirement = 1000 * 5 = 5000
    logEligibleWager(s, { betMinor: 4500, now: '2026-05-15T01:00:00Z' });
    expect(s.status).toBe('active');
    const ev = logEligibleWager(s, { betMinor: 500, now: '2026-05-15T02:00:00Z' });
    expect(ev.kind).toBe('bonus_cleared');
    expect(s.status).toBe('cleared');
    expect(s.transitions.clearedAt).toBe('2026-05-15T02:00:00Z');
    expect(isBonusCleared(s)).toBe(true);
  });

  it('further bets are no-ops once cleared', () => {
    s = freshBonus();
    logEligibleWager(s, { betMinor: 6000, now: '2026-05-15T01:00:00Z' });
    expect(s.status).toBe('cleared');
    const ev = logEligibleWager(s, { betMinor: 100, now: '2026-05-15T02:00:00Z' });
    expect(ev.kind).toBe('bonus_progress');
    expect(s.progressMinor).toBe(6000); // unchanged
  });

  it('expires when now > expiresAt before any progress', () => {
    s = freshBonus();
    const ev = logEligibleWager(s, { betMinor: 100, now: '2027-01-01T00:00:00Z' });
    expect(ev.kind).toBe('bonus_expired');
    expect(s.status).toBe('expired');
    expect(s.transitions.expiredAt).toBe('2027-01-01T00:00:00Z');
  });

  it('rejects negative bet', () => {
    s = freshBonus();
    expect(() =>
      logEligibleWager(s, { betMinor: -1, now: '2026-05-15T01:00:00Z' })
    ).toThrow(/betMinor/);
  });
});

// ─── forfeitBonus ─────────────────────────────────────────────────────────────

describe('forfeitBonus', () => {
  it('transitions an active bonus to forfeited', () => {
    const s = createBonusWageringState({
      bonusId: 'b1',
      bonusAmountMinor: 1000,
      wrMultiplier: 5,
      expiresAt: '2026-12-31T00:00:00Z',
      currency: 'EUR',
      now: '2026-05-15T00:00:00Z',
    });
    const ev = forfeitBonus(s, { now: '2026-05-16T00:00:00Z' });
    expect(ev.kind).toBe('bonus_forfeited');
    expect(s.status).toBe('forfeited');
    expect(s.transitions.forfeitedAt).toBe('2026-05-16T00:00:00Z');
  });

  it('is a no-op on already-cleared bonuses', () => {
    const s = createBonusWageringState({
      bonusId: 'b1',
      bonusAmountMinor: 1000,
      wrMultiplier: 5,
      expiresAt: '2026-12-31T00:00:00Z',
      currency: 'EUR',
      now: '2026-05-15T00:00:00Z',
    });
    logEligibleWager(s, { betMinor: 6000, now: '2026-05-15T01:00:00Z' });
    forfeitBonus(s, { now: '2026-05-16T00:00:00Z' });
    expect(s.status).toBe('cleared');
  });
});
