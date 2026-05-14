import { describe, it, expect } from 'vitest';
import {
  FloatingJackpotPool,
  type FxRateSnapshot,
} from '../src/jackpot/fxSnapshot.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function snap(rates: Record<string, number>, at: string): FxRateSnapshot {
  return { rates, recordedAt: at, providerRef: 'TEST' };
}

// ─── construction guards ──────────────────────────────────────────────────────

describe('FloatingJackpotPool — construction', () => {
  it('rejects empty poolId', () => {
    expect(
      () =>
        new FloatingJackpotPool({
          poolId: '',
          baseCurrency: 'EUR',
          seedMinor: 0,
        })
    ).toThrow(/poolId/);
  });

  it('rejects 2-letter currency code', () => {
    expect(
      () =>
        new FloatingJackpotPool({
          poolId: 'p',
          baseCurrency: 'EU',
          seedMinor: 0,
        })
    ).toThrow(/3-letter ISO code/);
  });

  it('rejects negative seed', () => {
    expect(
      () =>
        new FloatingJackpotPool({
          poolId: 'p',
          baseCurrency: 'EUR',
          seedMinor: -1,
        })
    ).toThrow(/seedMinor must be ≥ 0/);
  });

  it('rejects mustHitByMax ≤ seed', () => {
    expect(
      () =>
        new FloatingJackpotPool({
          poolId: 'p',
          baseCurrency: 'EUR',
          seedMinor: 100,
          mustHitByMaxMinor: 100,
        })
    ).toThrow(/mustHitByMaxMinor/);
  });
});

// ─── FX snapshot validation ───────────────────────────────────────────────────

describe('FloatingJackpotPool — publishFxSnapshot', () => {
  const pool = () =>
    new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 0 });

  it('rejects snapshot missing base currency at rate 1.0', () => {
    expect(() => pool().publishFxSnapshot(snap({ USD: 1.1 }, 't0'))).toThrow(
      /base currency EUR must have rate 1.0/
    );
  });

  it('rejects non-positive FX rate', () => {
    expect(() =>
      pool().publishFxSnapshot(snap({ EUR: 1, USD: -1 }, 't0'))
    ).toThrow(/rate for USD must be > 0/);
  });

  it('rejects missing recordedAt', () => {
    expect(() =>
      pool().publishFxSnapshot({ rates: { EUR: 1 }, recordedAt: '' } as FxRateSnapshot)
    ).toThrow(/recordedAt required/);
  });

  it('accepts a valid snapshot', () => {
    const p = pool();
    p.publishFxSnapshot(snap({ EUR: 1, USD: 1.10, GBP: 0.87 }, 't0'));
    // No throw — passing means accepted.
    expect(p.poolBase()).toBe(0);
  });
});

// ─── contribute ───────────────────────────────────────────────────────────────

describe('FloatingJackpotPool — contribute', () => {
  it('throws without published snapshot', () => {
    const p = new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 0 });
    expect(() => p.contribute({ sourceCurrency: 'EUR', sourceMinor: 100 })).toThrow(
      /no FX snapshot published/
    );
  });

  it('converts source to base via the published rate', () => {
    const p = new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 0 });
    p.publishFxSnapshot(snap({ EUR: 1, USD: 1.10, GBP: 0.87 }, 't0'));
    // 100 USD cents × 1.10 EUR/USD = 110 EUR cents
    const c = p.contribute({ sourceCurrency: 'USD', sourceMinor: 100 });
    expect(c.baseMinor).toBe(110);
    expect(c.sourceMinor).toBe(100);
    expect(c.fxSnapshotAt).toBe('t0');
    expect(p.poolBase()).toBe(110);
  });

  it('rejects unknown source currency', () => {
    const p = new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 0 });
    p.publishFxSnapshot(snap({ EUR: 1, USD: 1.10 }, 't0'));
    expect(() => p.contribute({ sourceCurrency: 'JPY', sourceMinor: 1000 })).toThrow(
      /no FX rate for JPY/
    );
  });

  it('rejects negative source amount', () => {
    const p = new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 0 });
    p.publishFxSnapshot(snap({ EUR: 1 }, 't0'));
    expect(() => p.contribute({ sourceCurrency: 'EUR', sourceMinor: -1 })).toThrow(
      /sourceMinor/
    );
  });

  it('emits a unique deterministic id per contribution', () => {
    const p = new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 0 });
    p.publishFxSnapshot(snap({ EUR: 1 }, 't0'));
    const a = p.contribute({ sourceCurrency: 'EUR', sourceMinor: 100 });
    const b = p.contribute({ sourceCurrency: 'EUR', sourceMinor: 200 });
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^c-/);
    expect(b.id).toMatch(/^c-/);
  });

  it('subsequent snapshots affect later contributions, not earlier ones', () => {
    const p = new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 0 });
    p.publishFxSnapshot(snap({ EUR: 1, USD: 1.10 }, 't0'));
    const a = p.contribute({ sourceCurrency: 'USD', sourceMinor: 100 });
    p.publishFxSnapshot(snap({ EUR: 1, USD: 1.20 }, 't1'));
    const b = p.contribute({ sourceCurrency: 'USD', sourceMinor: 100 });
    expect(a.baseMinor).toBe(110);
    expect(a.fxSnapshotAt).toBe('t0');
    expect(b.baseMinor).toBe(120);
    expect(b.fxSnapshotAt).toBe('t1');
  });
});

// ─── recordHit — FX-at-hit snapshot semantics ────────────────────────────────

describe('FloatingJackpotPool — recordHit FX snapshot', () => {
  it('payout uses FX rate at hit time, NOT current FX', () => {
    const p = new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 10_000 });
    // Snapshot 1: EUR=1, USD=1.10
    p.publishFxSnapshot(snap({ EUR: 1, USD: 1.10 }, 't_contribute'));
    p.contribute({ sourceCurrency: 'EUR', sourceMinor: 5000 }); // pool = 15_000 EUR
    // Snapshot 2: rates change BEFORE the hit
    p.publishFxSnapshot(snap({ EUR: 1, USD: 1.05 }, 't_hit'));
    const h = p.recordHit({ playerCurrency: 'USD' });
    expect(h.fxRateAtHit).toBe(1.05);
    // Payout in USD = 15_000 EUR / 1.05 = 14_285.71 → 14_286 (half-even)
    expect(h.playerPayoutMinor).toBe(14_286);
    expect(h.poolBaseMinor).toBe(15_000);
    expect(h.snapshotAt).toBe('t_hit');

    // Now alter the FX again — the hit's recorded amount must be replayable from the snapshot.
    p.publishFxSnapshot(snap({ EUR: 1, USD: 0.99 }, 't_after'));
    expect(p.replayHit(h)).toBe(14_286);
  });

  it('replayHit is deterministic and ignores current snapshot', () => {
    const p = new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 1000 });
    p.publishFxSnapshot(snap({ EUR: 1, GBP: 0.87 }, 't0'));
    p.contribute({ sourceCurrency: 'EUR', sourceMinor: 2000 });
    const h1 = p.recordHit({ playerCurrency: 'GBP' });
    // Reseat the FX feed; recompute the same hit.
    p.publishFxSnapshot(snap({ EUR: 1, GBP: 2.5 }, 't_later'));
    expect(p.replayHit(h1)).toBe(h1.playerPayoutMinor);
  });

  it('throws when pool is empty (seed=0, no contributions)', () => {
    const p = new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 0 });
    p.publishFxSnapshot(snap({ EUR: 1 }, 't0'));
    expect(() => p.recordHit({ playerCurrency: 'EUR' })).toThrow(/pool is empty/);
  });

  it('throws when player currency missing from current snapshot', () => {
    const p = new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 1000 });
    p.publishFxSnapshot(snap({ EUR: 1 }, 't0'));
    expect(() => p.recordHit({ playerCurrency: 'JPY' })).toThrow(/no FX rate for JPY/);
  });

  it('resets pool to seed after hit', () => {
    const p = new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 1000 });
    p.publishFxSnapshot(snap({ EUR: 1 }, 't0'));
    p.contribute({ sourceCurrency: 'EUR', sourceMinor: 5000 });
    expect(p.poolBase()).toBe(6000);
    p.recordHit({ playerCurrency: 'EUR' });
    expect(p.poolBase()).toBe(1000);
  });

  it('hit IDs are unique and prefixed', () => {
    const p = new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 1000 });
    p.publishFxSnapshot(snap({ EUR: 1 }, 't0'));
    const h1 = p.recordHit({ playerCurrency: 'EUR' });
    p.contribute({ sourceCurrency: 'EUR', sourceMinor: 5000 });
    const h2 = p.recordHit({ playerCurrency: 'EUR' });
    expect(h1.hitId).not.toBe(h2.hitId);
    expect(h1.hitId).toMatch(/^h-/);
  });
});

// ─── stats / audit ────────────────────────────────────────────────────────────

describe('FloatingJackpotPool — stats', () => {
  it('tracks contribution count + total base contributed', () => {
    const p = new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 0 });
    p.publishFxSnapshot(snap({ EUR: 1, USD: 1.10 }, 't0'));
    p.contribute({ sourceCurrency: 'EUR', sourceMinor: 100 });
    p.contribute({ sourceCurrency: 'USD', sourceMinor: 100 });
    const s = p.stats();
    expect(s.totalContributions).toBe(2);
    expect(s.totalContributedBaseMinor).toBe(100 + 110);
    expect(s.currentPoolBaseMinor).toBe(210);
  });

  it('aggregates payouts by player currency', () => {
    const p = new FloatingJackpotPool({ poolId: 'p', baseCurrency: 'EUR', seedMinor: 1000 });
    p.publishFxSnapshot(snap({ EUR: 1, GBP: 0.87 }, 't0'));
    const h1 = p.recordHit({ playerCurrency: 'EUR' }); // pays 1000 EUR
    p.contribute({ sourceCurrency: 'EUR', sourceMinor: 500 });
    const h2 = p.recordHit({ playerCurrency: 'GBP' }); // pays 1500/0.87 ≈ 1724 GBP
    const s = p.stats();
    expect(s.totalHits).toBe(2);
    expect(s.totalPaidPlayerMinor['EUR']).toBe(h1.playerPayoutMinor);
    expect(s.totalPaidPlayerMinor['GBP']).toBe(h2.playerPayoutMinor);
  });
});
