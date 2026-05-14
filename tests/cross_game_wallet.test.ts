import { describe, it, expect } from 'vitest';
import {
  CrossGameWallet,
  makeSimpleWallet,
  type CrossGameWalletConfig,
} from '../src/wallet/index.js';

// ─── construction guards ─────────────────────────────────────────────────────

describe('CrossGameWallet — construction', () => {
  it('rejects empty poolId', () => {
    expect(
      () =>
        new CrossGameWallet({
          poolId: '',
          baseCurrency: 'EUR',
          tiers: [{ name: 'Grand', seedMinor: 0 }],
          contributions: [],
        })
    ).toThrow(/poolId/);
  });

  it('rejects baseCurrency < 3 letters', () => {
    expect(
      () =>
        new CrossGameWallet({
          poolId: 'p',
          baseCurrency: 'EU',
          tiers: [{ name: 'Grand', seedMinor: 0 }],
          contributions: [],
        })
    ).toThrow(/baseCurrency/);
  });

  it('rejects zero tiers', () => {
    expect(
      () =>
        new CrossGameWallet({
          poolId: 'p',
          baseCurrency: 'EUR',
          tiers: [],
          contributions: [],
        })
    ).toThrow(/at least one tier/);
  });

  it('rejects duplicate tier names', () => {
    expect(
      () =>
        new CrossGameWallet({
          poolId: 'p',
          baseCurrency: 'EUR',
          tiers: [
            { name: 'Grand', seedMinor: 0 },
            { name: 'Grand', seedMinor: 100 },
          ],
          contributions: [],
        })
    ).toThrow(/duplicate tier/);
  });

  it('rejects negative seed', () => {
    expect(
      () =>
        new CrossGameWallet({
          poolId: 'p',
          baseCurrency: 'EUR',
          tiers: [{ name: 'Grand', seedMinor: -1 }],
          contributions: [],
        })
    ).toThrow(/seedMinor must be ≥ 0/);
  });

  it('rejects mustHitByMax ≤ seed', () => {
    expect(
      () =>
        new CrossGameWallet({
          poolId: 'p',
          baseCurrency: 'EUR',
          tiers: [{ name: 'Grand', seedMinor: 100, mustHitByMaxMinor: 100 }],
          contributions: [],
        })
    ).toThrow(/mustHitByMaxMinor must exceed seedMinor/);
  });

  it('rejects contribution rate out of [0,1]', () => {
    expect(
      () =>
        new CrossGameWallet({
          poolId: 'p',
          baseCurrency: 'EUR',
          tiers: [{ name: 'Grand', seedMinor: 0 }],
          contributions: [{ gameId: 'g1', contributionRate: 1.5, eligible: true }],
        })
    ).toThrow(/contributionRate/);
  });

  it('rejects tierWeights summing > 1', () => {
    expect(
      () =>
        new CrossGameWallet({
          poolId: 'p',
          baseCurrency: 'EUR',
          tiers: [
            { name: 'Grand', seedMinor: 0 },
            { name: 'Mini', seedMinor: 0 },
          ],
          contributions: [
            {
              gameId: 'g1',
              contributionRate: 0.01,
              eligible: true,
              tierWeights: { Grand: 0.7, Mini: 0.6 },
            },
          ],
        })
    ).toThrow(/sum > 1/);
  });

  it('rejects tierWeights referencing unknown tier', () => {
    expect(
      () =>
        new CrossGameWallet({
          poolId: 'p',
          baseCurrency: 'EUR',
          tiers: [{ name: 'Grand', seedMinor: 0 }],
          contributions: [
            {
              gameId: 'g1',
              contributionRate: 0.01,
              eligible: true,
              tierWeights: { Phantom: 0.5 },
            },
          ],
        })
    ).toThrow(/unknown tier "Phantom"/);
  });
});

// ─── contribute lifecycle ────────────────────────────────────────────────────

function makeWallet(): CrossGameWallet {
  return new CrossGameWallet({
    poolId: 'progressive-mystery',
    baseCurrency: 'EUR',
    tiers: [
      { name: 'Mini', seedMinor: 100_00 }, // €100
      { name: 'Major', seedMinor: 1_000_00 }, // €1k
      { name: 'Grand', seedMinor: 10_000_00, mustHitByMaxMinor: 100_000_00 }, // €10k, cap €100k
    ],
    contributions: [
      {
        gameId: 'gameA',
        contributionRate: 0.01,
        eligible: true,
        tierWeights: { Grand: 0.5, Major: 0.3, Mini: 0.2 },
      },
      { gameId: 'gameB', contributionRate: 0.005, eligible: true },
      { gameId: 'gameC', contributionRate: 0.02, eligible: false }, // ineligible
    ],
    fx: { USD: 0.92, GBP: 1.17 },
  });
}

describe('CrossGameWallet — contribute', () => {
  it('commits a base-currency contribution to the highest-weight tier by default', () => {
    const w = makeWallet();
    const p = w.beginContribute({ gameId: 'gameA', sourceMinor: 10_00, currency: 'EUR' });
    expect(p).not.toBeNull();
    expect(p!.tierName).toBe('Grand'); // highest weight: 0.5
    expect(p!.deltaMinor).toBe(10); // 1000 × 0.01 = 10 minor units
    w.commitContribute(p!.pendingId);
    expect(w.poolValueMinor('Grand')).toBe(10_000_00 + 10);
  });

  it('routes contribution to explicit tier when provided', () => {
    const w = makeWallet();
    const p = w.beginContribute({
      gameId: 'gameA',
      sourceMinor: 50_00,
      currency: 'EUR',
      tierName: 'Mini',
    });
    expect(p!.tierName).toBe('Mini');
    w.commitContribute(p!.pendingId);
    expect(w.poolValueMinor('Mini')).toBe(100_00 + 50);
  });

  it('converts foreign-currency contribution at FX-rate snapshot', () => {
    const w = makeWallet();
    // £10 bet × 0.005 rate × 1.17 GBP→EUR = 5.85 → rounds to 6 minor units (half-even)
    const p = w.beginContribute({ gameId: 'gameB', sourceMinor: 1000, currency: 'GBP' });
    expect(p).not.toBeNull();
    expect(p!.audit.fxRate).toBe(1.17);
    expect(p!.deltaMinor).toBe(6);
    w.commitContribute(p!.pendingId);
  });

  it('emits ineligible_game and returns null for ineligible game', () => {
    const w = makeWallet();
    const p = w.beginContribute({ gameId: 'gameC', sourceMinor: 1000, currency: 'EUR' });
    expect(p).toBeNull();
    const ev = w.drainEvents();
    expect(ev[ev.length - 1]?.kind).toBe('ineligible_game');
  });

  it('emits fx_rate_missing and returns null for unknown currency', () => {
    const w = makeWallet();
    const p = w.beginContribute({ gameId: 'gameA', sourceMinor: 1000, currency: 'JPY' });
    expect(p).toBeNull();
    const ev = w.drainEvents();
    expect(ev[ev.length - 1]?.kind).toBe('fx_rate_missing');
  });

  it('returns null when contribution rounds to 0 (sub-cent micro-bet)', () => {
    const w = makeWallet();
    const p = w.beginContribute({ gameId: 'gameA', sourceMinor: 1, currency: 'EUR' });
    expect(p).toBeNull(); // 1 × 0.01 = 0.01 → rounds to 0 half-even
  });

  it('does NOT mutate pool until commit', () => {
    const w = makeWallet();
    const before = w.poolValueMinor('Grand');
    const p = w.beginContribute({ gameId: 'gameA', sourceMinor: 100_00, currency: 'EUR' });
    expect(w.poolValueMinor('Grand')).toBe(before); // still seed
    w.commitContribute(p!.pendingId);
    expect(w.poolValueMinor('Grand')).toBe(before + 100);
  });

  it('rollback reverts pool to pre-begin state', () => {
    const w = makeWallet();
    const before = w.poolValueMinor('Grand');
    const p = w.beginContribute({ gameId: 'gameA', sourceMinor: 100_00, currency: 'EUR' });
    w.rollbackContribute(p!.pendingId, 'wallet_timeout');
    expect(w.poolValueMinor('Grand')).toBe(before);
    const ev = w.drainEvents();
    expect(ev.find((e) => e.kind === 'contribution_rolled_back')).toBeDefined();
  });

  it('throws on double-commit', () => {
    const w = makeWallet();
    const p = w.beginContribute({ gameId: 'gameA', sourceMinor: 100_00, currency: 'EUR' })!;
    w.commitContribute(p.pendingId);
    expect(() => w.commitContribute(p.pendingId)).toThrow(/status=committed/);
  });

  it('throws on commit-after-rollback', () => {
    const w = makeWallet();
    const p = w.beginContribute({ gameId: 'gameA', sourceMinor: 100_00, currency: 'EUR' })!;
    w.rollbackContribute(p.pendingId, 'oops');
    expect(() => w.commitContribute(p.pendingId)).toThrow(/status=rolled_back/);
  });
});

// ─── hit lifecycle ───────────────────────────────────────────────────────────

describe('CrossGameWallet — recordHit', () => {
  it('pays the full pool and resets to seed on commit', () => {
    const w = makeWallet();
    // Grow the Grand pool first.
    const c = w.beginContribute({ gameId: 'gameA', sourceMinor: 100_000_00, currency: 'EUR' })!;
    w.commitContribute(c.pendingId);
    const seed = 10_000_00;
    // 100_000_00 minor × 0.01 contribution rate = 100_000 minor.
    const growth = 100_000;
    expect(w.poolValueMinor('Grand')).toBe(seed + growth);

    const h = w.beginHit({ gameId: 'gameA', tierName: 'Grand' });
    expect(h.deltaMinor).toBe(-(seed + growth));
    w.commitHit(h.pendingId);
    expect(w.poolValueMinor('Grand')).toBe(seed); // reset to seed
    const snap = w.snapshot();
    expect(snap.hitsByTier['Grand']).toBe(1);
    expect(snap.payoutsTotalByTier['Grand']).toBe(seed + growth);
  });

  it('rollback preserves the pool unchanged', () => {
    const w = makeWallet();
    const before = w.poolValueMinor('Grand');
    const h = w.beginHit({ gameId: 'gameA', tierName: 'Grand' });
    expect(w.poolValueMinor('Grand')).toBe(before);
    w.rollbackHit(h.pendingId, 'player_disconnect');
    expect(w.poolValueMinor('Grand')).toBe(before);
    const ev = w.drainEvents();
    expect(ev.find((e) => e.kind === 'hit_rolled_back')).toBeDefined();
  });

  it('throws if game not registered to the pool', () => {
    const w = makeWallet();
    expect(() => w.beginHit({ gameId: 'phantom', tierName: 'Grand' })).toThrow(/not registered/);
  });

  it('throws if tier is unknown', () => {
    const w = makeWallet();
    expect(() => w.beginHit({ gameId: 'gameA', tierName: 'Cosmic' })).toThrow(/unknown tier/);
  });

  it('throws if pool is empty (zero seed, no contributions)', () => {
    const w = new CrossGameWallet({
      poolId: 'p',
      baseCurrency: 'EUR',
      tiers: [{ name: 'Grand', seedMinor: 0 }],
      contributions: [{ gameId: 'g1', contributionRate: 0.01, eligible: true }],
    });
    expect(() => w.beginHit({ gameId: 'g1', tierName: 'Grand' })).toThrow(/pool is empty/);
  });
});

// ─── must-hit-by ─────────────────────────────────────────────────────────────

describe('CrossGameWallet — must-hit-by approaching', () => {
  it('emits must_hit_by_approaching at ≥95% of cap', () => {
    const w = new CrossGameWallet({
      poolId: 'p',
      baseCurrency: 'EUR',
      tiers: [{ name: 'Grand', seedMinor: 1000_00, mustHitByMaxMinor: 1100_00 }],
      contributions: [{ gameId: 'g1', contributionRate: 0.5, eligible: true }],
    });
    // current pool = 1000_00 seed, cap = 1100_00. Need to push pool to ≥ 1045_00 (95% of cap).
    // 1 bet of 100_00 minor units × 0.5 rate = 50_00 contribution → pool = 1050_00.
    const p = w.beginContribute({ gameId: 'g1', sourceMinor: 100_00, currency: 'EUR' })!;
    w.commitContribute(p.pendingId);
    const ev = w.drainEvents();
    expect(ev.some((e) => e.kind === 'must_hit_by_approaching')).toBe(true);
  });

  it('does NOT emit must_hit_by_approaching below 95%', () => {
    const w = new CrossGameWallet({
      poolId: 'p',
      baseCurrency: 'EUR',
      tiers: [{ name: 'Grand', seedMinor: 1000_00, mustHitByMaxMinor: 2000_00 }],
      contributions: [{ gameId: 'g1', contributionRate: 0.1, eligible: true }],
    });
    const p = w.beginContribute({ gameId: 'g1', sourceMinor: 1000_00, currency: 'EUR' })!;
    w.commitContribute(p.pendingId);
    const ev = w.drainEvents();
    expect(ev.some((e) => e.kind === 'must_hit_by_approaching')).toBe(false);
  });
});

// ─── analytical RTP contribution ─────────────────────────────────────────────

describe('CrossGameWallet — rtpContribution', () => {
  it('returns 0 for zero mean bet', () => {
    const w = makeSimpleWallet({ poolId: 'p', games: [{ gameId: 'g1', contributionRate: 0.01 }] });
    expect(
      w.rtpContribution({
        gameId: 'g1',
        meanBetMinor: 0,
        hitsPerSpinByTier: { Grand: 1e-6 },
        meanPoolAtHitByTier: { Grand: 1_000_000 },
      })
    ).toBe(0);
  });

  it('matches hand-computed RTP for single-tier pool', () => {
    const w = makeSimpleWallet({
      poolId: 'p',
      games: [{ gameId: 'g1', contributionRate: 0.01 }],
      seedMinor: 100_00,
    });
    // Stylised: 1 in 1,000,000 spins hits, mean pool at hit = €5000 (500_000 minor).
    // For €1 (100 minor) bet → contribution to RTP = 1e-6 × 500_000 / 100 = 0.005
    // (0.5% pool RTP contribution — typical for a small mystery progressive).
    const rtp = w.rtpContribution({
      gameId: 'g1',
      meanBetMinor: 100,
      hitsPerSpinByTier: { Grand: 1e-6 },
      meanPoolAtHitByTier: { Grand: 500_000 },
    });
    expect(rtp).toBeCloseTo(0.005, 9);
  });

  it('poolGrowthPerSpin matches bet × contributionRate', () => {
    const w = makeSimpleWallet({
      poolId: 'p',
      games: [{ gameId: 'g1', contributionRate: 0.0075 }],
    });
    expect(w.poolGrowthPerSpin({ gameId: 'g1', meanBetMinor: 200 })).toBeCloseTo(1.5, 9);
  });

  it('poolGrowthPerSpin returns 0 for ineligible game', () => {
    const w = new CrossGameWallet({
      poolId: 'p',
      baseCurrency: 'EUR',
      tiers: [{ name: 'Grand', seedMinor: 0 }],
      contributions: [{ gameId: 'g1', contributionRate: 0.01, eligible: false }],
    });
    expect(w.poolGrowthPerSpin({ gameId: 'g1', meanBetMinor: 100 })).toBe(0);
  });
});

// ─── snapshot / replay ──────────────────────────────────────────────────────

describe('CrossGameWallet — snapshot determinism', () => {
  it('snapshot ↔ fromSnapshot round-trip preserves state', () => {
    const w = makeWallet();
    const p1 = w.beginContribute({ gameId: 'gameA', sourceMinor: 500_00, currency: 'EUR' })!;
    w.commitContribute(p1.pendingId);
    const p2 = w.beginContribute({ gameId: 'gameB', sourceMinor: 200_00, currency: 'USD' })!;
    w.commitContribute(p2.pendingId);

    const snap = w.snapshot();
    const w2 = CrossGameWallet.fromSnapshot(w.config, snap);
    expect(w2.snapshot()).toEqual(snap);
  });

  it('same inputs produce same sequence of events (no clock, no RNG)', () => {
    const cfg: CrossGameWalletConfig = {
      poolId: 'p',
      baseCurrency: 'EUR',
      tiers: [{ name: 'Grand', seedMinor: 1000 }],
      contributions: [{ gameId: 'g1', contributionRate: 0.01, eligible: true }],
    };
    const a = new CrossGameWallet(cfg);
    const b = new CrossGameWallet(cfg);
    for (let i = 0; i < 100; i++) {
      const pa = a.beginContribute({ gameId: 'g1', sourceMinor: 100_00, currency: 'EUR' })!;
      a.commitContribute(pa.pendingId);
      const pb = b.beginContribute({ gameId: 'g1', sourceMinor: 100_00, currency: 'EUR' })!;
      b.commitContribute(pb.pendingId);
      expect(pa.pendingId).toBe(pb.pendingId);
    }
    expect(a.snapshot()).toEqual(b.snapshot());
  });
});

// ─── multi-game cross-contribution invariant ────────────────────────────────

describe('CrossGameWallet — multi-game cross-contribution', () => {
  it('sum of game contributions equals pool growth (modulo seed)', () => {
    const w = makeWallet();
    const seedGrand = 10_000_00;
    const seedMajor = 1_000_00;
    const seedMini = 100_00;

    // gameA: 5 spins × €10 × 0.01 = €0.50 split per weights: 0.5/0.3/0.2 → 25/15/10 cents to Grand/Major/Mini.
    // But routing currently picks ONE tier per contribute call (highest weight). So 5×€10 → 5×50 = 250 minor all to Grand.
    let totalToGrand = 0;
    for (let i = 0; i < 5; i++) {
      const p = w.beginContribute({ gameId: 'gameA', sourceMinor: 10_00, currency: 'EUR' })!;
      w.commitContribute(p.pendingId);
      totalToGrand += p.deltaMinor;
    }
    expect(w.poolValueMinor('Grand')).toBe(seedGrand + totalToGrand);
    expect(w.poolValueMinor('Major')).toBe(seedMajor); // untouched
    expect(w.poolValueMinor('Mini')).toBe(seedMini); // untouched

    // gameB: 10 spins × €5 × 0.005 = €0.025 → 2.5 minor each, rounds half-even to 2 (down) and 3 (up) alternating.
    let totalToTier = 0;
    for (let i = 0; i < 10; i++) {
      const p = w.beginContribute({ gameId: 'gameB', sourceMinor: 5_00, currency: 'EUR' })!;
      w.commitContribute(p.pendingId);
      totalToTier += p.deltaMinor;
    }
    // The default tier for gameB (no weights) is whichever tier was inserted first → Mini.
    expect(w.poolValueMinor('Mini')).toBe(seedMini + totalToTier);
  });
});

// ─── rounding mode coverage ──────────────────────────────────────────────────

describe('CrossGameWallet — rounding modes', () => {
  const baseCfg = (mode: 'half_even' | 'half_up' | 'truncate'): CrossGameWalletConfig => ({
    poolId: 'p',
    baseCurrency: 'EUR',
    roundingMode: mode,
    tiers: [{ name: 'Grand', seedMinor: 0 }],
    contributions: [{ gameId: 'g1', contributionRate: 0.025, eligible: true }],
  });

  it('half_even rounds 2.5 → 2', () => {
    const w = new CrossGameWallet(baseCfg('half_even'));
    const p = w.beginContribute({ gameId: 'g1', sourceMinor: 100, currency: 'EUR' })!;
    expect(p.deltaMinor).toBe(2); // 100 × 0.025 = 2.5 → 2 (even)
  });

  it('half_up rounds 2.5 → 3', () => {
    const w = new CrossGameWallet(baseCfg('half_up'));
    const p = w.beginContribute({ gameId: 'g1', sourceMinor: 100, currency: 'EUR' })!;
    expect(p.deltaMinor).toBe(3);
  });

  it('truncate rounds 2.9 → 2', () => {
    const w = new CrossGameWallet({
      ...baseCfg('truncate'),
      contributions: [{ gameId: 'g1', contributionRate: 0.029, eligible: true }],
    });
    const p = w.beginContribute({ gameId: 'g1', sourceMinor: 100, currency: 'EUR' })!;
    expect(p.deltaMinor).toBe(2);
  });
});
