/**
 * W152 Wave 148 — Max Win Cap Truncation Analyzer tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveMaxWinCapTruncation,
  simulateMaxWinCapTruncation,
  type MaxWinCapTruncationConfig,
} from '../src/features/maxWinCapTruncation.js';

const baseCfg = (overrides: Partial<MaxWinCapTruncationConfig> = {}): MaxWinCapTruncationConfig => ({
  payoutPmf: [
    { value: 0,    probability: 0.85 },
    { value: 1,    probability: 0.08 },
    { value: 10,   probability: 0.04 },
    { value: 100,  probability: 0.02 },
    { value: 1000, probability: 0.008 },
    { value: 5000, probability: 0.001 },
    { value: 50000, probability: 0.001 },
  ],
  maxWinCapX: 5000,
  ...overrides,
});

describe('validation', () => {
  it('rejects empty payoutPmf', () => {
    expect(() => solveMaxWinCapTruncation(baseCfg({ payoutPmf: [] }))).toThrow();
  });
  it('rejects maxWinCapX ≤ 0', () => {
    expect(() => solveMaxWinCapTruncation(baseCfg({ maxWinCapX: 0 }))).toThrow();
    expect(() => solveMaxWinCapTruncation(baseCfg({ maxWinCapX: -100 }))).toThrow();
  });
  it('rejects negative payout values', () => {
    expect(() => solveMaxWinCapTruncation(baseCfg({
      payoutPmf: [{ value: -1, probability: 1 }],
    }))).toThrow();
  });
  it('rejects PMF not summing to 1', () => {
    expect(() => solveMaxWinCapTruncation(baseCfg({
      payoutPmf: [{ value: 0, probability: 0.5 }, { value: 1, probability: 0.3 }],
    }))).toThrow();
  });
  it('rejects PMF probability > 1', () => {
    expect(() => solveMaxWinCapTruncation(baseCfg({
      payoutPmf: [{ value: 0, probability: 1.5 }],
    }))).toThrow();
  });
  it('rejects PMF probability < 0', () => {
    expect(() => solveMaxWinCapTruncation(baseCfg({
      payoutPmf: [{ value: 0, probability: -0.1 }, { value: 1, probability: 1.1 }],
    }))).toThrow();
  });
});

describe('uncapped moments', () => {
  it('E[Y] = Σ y·π_y', () => {
    const r = solveMaxWinCapTruncation(baseCfg());
    // 0·0.85 + 1·0.08 + 10·0.04 + 100·0.02 + 1000·0.008 + 5000·0.001 + 50000·0.001
    // = 0 + 0.08 + 0.4 + 2 + 8 + 5 + 50 = 65.48
    expect(r.expectedPayoutUncapped).toBeCloseTo(65.48, 6);
  });
  it('Var[Y] ≥ 0', () => {
    const r = solveMaxWinCapTruncation(baseCfg());
    expect(r.variancePayoutUncapped).toBeGreaterThanOrEqual(0);
  });
});

describe('capped moments', () => {
  it('E[Y_capped] = Σ_{y<C} y·π_y + C·P_cap', () => {
    const r = solveMaxWinCapTruncation(baseCfg());
    // C = 5000. y < C: 0,1,10,100,1000. y ≥ C: 5000, 50000 (P_cap = 0.001+0.001 = 0.002)
    // E[Y_capped] = 0+0.08+0.4+2+8 + 5000·0.002 = 10.48 + 10 = 20.48
    expect(r.expectedPayoutCapped).toBeCloseTo(20.48, 6);
  });
  it('E[Y_capped] ≤ E[Y] (cap reduces mean)', () => {
    const r = solveMaxWinCapTruncation(baseCfg());
    expect(r.expectedPayoutCapped).toBeLessThanOrEqual(r.expectedPayoutUncapped);
  });
  it('Var[Y_capped] ≤ Var[Y] (cap reduces variance — clamps tail)', () => {
    const r = solveMaxWinCapTruncation(baseCfg());
    expect(r.variancePayoutCapped).toBeLessThanOrEqual(r.variancePayoutUncapped);
  });
});

describe('RTP loss disclosure', () => {
  it('rtpLossAbsolute = E[Y] − E[Y_capped]', () => {
    const r = solveMaxWinCapTruncation(baseCfg());
    expect(r.rtpLossAbsolute).toBeCloseTo(r.expectedPayoutUncapped - r.expectedPayoutCapped, 8);
  });
  it('rtpLossRelative = rtpLossAbsolute / E[Y]', () => {
    const r = solveMaxWinCapTruncation(baseCfg());
    // 65.48 - 20.48 = 45, /65.48 ≈ 0.6872 (BIG cap impact!)
    expect(r.rtpLossRelative).toBeCloseTo(45 / 65.48, 6);
  });
  it('lower cap → higher RTP loss', () => {
    const a = solveMaxWinCapTruncation(baseCfg({ maxWinCapX: 50 }));
    const b = solveMaxWinCapTruncation(baseCfg({ maxWinCapX: 5000 }));
    expect(a.rtpLossRelative).toBeGreaterThan(b.rtpLossRelative);
  });
  it('cap above max PMF value → zero loss', () => {
    const r = solveMaxWinCapTruncation(baseCfg({ maxWinCapX: 1_000_000 }));
    expect(r.rtpLossAbsolute).toBeCloseTo(0, 8);
    expect(r.rtpLossRelative).toBeCloseTo(0, 8);
  });
});

describe('cap-hit frequency', () => {
  it('P(cap hit) = Σ_{y ≥ C} π_y', () => {
    const r = solveMaxWinCapTruncation(baseCfg());
    // y ≥ 5000: 5000 (0.001) + 50000 (0.001) = 0.002
    expect(r.probCapHit).toBeCloseTo(0.002, 8);
  });
  it('oneInNCapHitFrequency = 1 / P_cap', () => {
    const r = solveMaxWinCapTruncation(baseCfg());
    expect(r.oneInNCapHitFrequency).toBeCloseTo(1 / 0.002, 6);
  });
  it('No cap-hit → oneInN = Infinity', () => {
    const r = solveMaxWinCapTruncation(baseCfg({ maxWinCapX: 1_000_000 }));
    expect(r.oneInNCapHitFrequency).toBe(Infinity);
  });
  it('Cap below ALL payouts → P_cap = 1', () => {
    const r = solveMaxWinCapTruncation({
      payoutPmf: [{ value: 100, probability: 1 }],
      maxWinCapX: 50,
    });
    expect(r.probCapHit).toBeCloseTo(1, 8);
  });
});

describe('conditional overflow', () => {
  it('E[Y − C | Y ≥ C] = (Σ (y−C)·π_y) / P_cap', () => {
    const r = solveMaxWinCapTruncation(baseCfg());
    // (5000-5000)·0.001 + (50000-5000)·0.001 = 0 + 45 = 45
    // 45 / 0.002 = 22500
    expect(r.expectedConditionalOverflow).toBeCloseTo(45 / 0.002, 4);
  });
  it('No cap-hit → overflow = 0', () => {
    const r = solveMaxWinCapTruncation(baseCfg({ maxWinCapX: 1_000_000 }));
    expect(r.expectedConditionalOverflow).toBe(0);
  });
  it('All payout = C → overflow = 0', () => {
    const r = solveMaxWinCapTruncation({
      payoutPmf: [{ value: 100, probability: 1 }],
      maxWinCapX: 100,
    });
    expect(r.expectedConditionalOverflow).toBeCloseTo(0, 6);
  });
});

describe('monotonicity', () => {
  it('higher cap → higher E[Y_capped]', () => {
    const a = solveMaxWinCapTruncation(baseCfg({ maxWinCapX: 500 }));
    const b = solveMaxWinCapTruncation(baseCfg({ maxWinCapX: 50000 }));
    expect(b.expectedPayoutCapped).toBeGreaterThan(a.expectedPayoutCapped);
  });
  it('higher cap → lower P(cap hit)', () => {
    const a = solveMaxWinCapTruncation(baseCfg({ maxWinCapX: 500 }));
    const b = solveMaxWinCapTruncation(baseCfg({ maxWinCapX: 50000 }));
    expect(b.probCapHit).toBeLessThanOrEqual(a.probCapHit);
  });
  it('higher cap → lower RTP loss', () => {
    const a = solveMaxWinCapTruncation(baseCfg({ maxWinCapX: 500 }));
    const b = solveMaxWinCapTruncation(baseCfg({ maxWinCapX: 50000 }));
    expect(b.rtpLossRelative).toBeLessThanOrEqual(a.rtpLossRelative);
  });
});

describe('corner cases', () => {
  it('PMF has single value below cap → no loss', () => {
    const r = solveMaxWinCapTruncation({
      payoutPmf: [{ value: 50, probability: 1 }],
      maxWinCapX: 100,
    });
    expect(r.rtpLossAbsolute).toBeCloseTo(0, 8);
    expect(r.probCapHit).toBeCloseTo(0, 8);
    expect(r.expectedPayoutCapped).toBeCloseTo(50, 8);
  });
  it('Zero PMF (everything zero) → E[Y] = 0, no loss', () => {
    const r = solveMaxWinCapTruncation({
      payoutPmf: [{ value: 0, probability: 1 }],
      maxWinCapX: 5000,
    });
    expect(r.expectedPayoutUncapped).toBe(0);
    expect(r.expectedPayoutCapped).toBe(0);
    expect(r.rtpLossRelative).toBe(0);
  });
  it('Single value exactly at cap → cap hit = P, but no overflow', () => {
    const r = solveMaxWinCapTruncation({
      payoutPmf: [{ value: 0, probability: 0.9 }, { value: 100, probability: 0.1 }],
      maxWinCapX: 100,
    });
    expect(r.probCapHit).toBeCloseTo(0.1, 8);
    expect(r.expectedConditionalOverflow).toBeCloseTo(0, 8);
  });
});

describe('industry parametrizations', () => {
  it('Vendor E 5000x cap typical Sweet Bonanza-like tail', () => {
    const r = solveMaxWinCapTruncation({
      payoutPmf: [
        { value: 0,    probability: 0.70 },
        { value: 1,    probability: 0.15 },
        { value: 5,    probability: 0.08 },
        { value: 20,   probability: 0.04 },
        { value: 100,  probability: 0.018 },
        { value: 500,  probability: 0.008 },
        { value: 2500, probability: 0.003 },
        { value: 5000, probability: 0.0008 },
        { value: 10000, probability: 0.0002 },
      ],
      maxWinCapX: 5000,
    });
    expect(r.expectedPayoutUncapped).toBeGreaterThan(r.expectedPayoutCapped);
    expect(r.probCapHit).toBeGreaterThan(0);
  });
  it('Hacksaw Gaming 7500x cap rare-extreme tail', () => {
    const r = solveMaxWinCapTruncation({
      payoutPmf: [
        { value: 0,    probability: 0.80 },
        { value: 10,   probability: 0.10 },
        { value: 100,  probability: 0.07 },
        { value: 1000, probability: 0.025 },
        { value: 5000, probability: 0.0049 },
        { value: 7500, probability: 0.0001 },
      ],
      maxWinCapX: 7500,
    });
    expect(r.expectedPayoutUncapped).toBeGreaterThan(0);
    expect(r.probCapHit).toBeLessThanOrEqual(0.001);
  });
  it('Nolimit City 25000x cap deep tail (Mental, Tombstone RIP)', () => {
    const r = solveMaxWinCapTruncation({
      payoutPmf: [
        { value: 0,     probability: 0.75 },
        { value: 50,    probability: 0.15 },
        { value: 1000,  probability: 0.07 },
        { value: 10000, probability: 0.028 },
        { value: 25000, probability: 0.002 },
      ],
      maxWinCapX: 25000,
    });
    expect(r.expectedPayoutUncapped).toBeGreaterThan(0);
  });
});

describe('MC cross-validation', () => {
  it('MC E[Y_capped] matches CF (rel ≤ 5% at 200K spins)', () => {
    const cfg = baseCfg();
    const cf = solveMaxWinCapTruncation(cfg);
    const mc = simulateMaxWinCapTruncation(cfg, 200_000, 0xdeadbeef);
    const rel = Math.abs(cf.expectedPayoutCapped - mc.observedMeanPayoutCapped) /
      Math.max(cf.expectedPayoutCapped, 1e-9);
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[Y] uncapped matches CF (rel ≤ 25% at 200K — heavy tail variance)', () => {
    // For heavy-tail uncapped MC has very high variance due to rare 50000x events
    const cfg = baseCfg();
    const cf = solveMaxWinCapTruncation(cfg);
    const mc = simulateMaxWinCapTruncation(cfg, 200_000, 0xcafe1234);
    const rel = Math.abs(cf.expectedPayoutUncapped - mc.observedMeanPayoutUncapped) /
      Math.max(cf.expectedPayoutUncapped, 1e-9);
    expect(rel).toBeLessThan(0.25);
  });
  it('MC P(cap hit) matches CF (abs ≤ 0.01 at 200K)', () => {
    const cfg = baseCfg();
    const cf = solveMaxWinCapTruncation(cfg);
    const mc = simulateMaxWinCapTruncation(cfg, 200_000, 0xbeefcafe);
    expect(Math.abs(cf.probCapHit - mc.observedCapHitFraction)).toBeLessThan(0.01);
  });
  it('MC max payout uncapped seen ≤ max in PMF', () => {
    const cfg = baseCfg();
    const cf = solveMaxWinCapTruncation(cfg);
    const mc = simulateMaxWinCapTruncation(cfg, 50_000, 0x1234);
    expect(mc.observedMaxPayoutUncappedSeen).toBeLessThanOrEqual(cf.observedMaxPayoutInPmf);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveMaxWinCapTruncation(baseCfg());
    const b = solveMaxWinCapTruncation(baseCfg());
    expect(a.expectedPayoutCapped).toBe(b.expectedPayoutCapped);
  });
  it('MC same seed → identical', () => {
    const a = simulateMaxWinCapTruncation(baseCfg(), 1000, 42);
    const b = simulateMaxWinCapTruncation(baseCfg(), 1000, 42);
    expect(a.observedMeanPayoutCapped).toBe(b.observedMeanPayoutCapped);
  });
});

describe('distinctness vs W138', () => {
  it('W148 caps TOTAL PAYOUT (not per-cascade multiplier like W138)', () => {
    // W138: M_k = min(base + (k-1)·step, M_max) cascade-level cap
    // W148: Y_capped = min(Y_total, C) applied to spin-aggregate payout
    // Semantics: W148 only "kicks in" rarely (cap-hit ≪ 1); W138 always caps cascade-level multiplier
    const r = solveMaxWinCapTruncation(baseCfg());
    expect(r.probCapHit).toBeLessThan(1); // not every spin hits cap
  });
});
