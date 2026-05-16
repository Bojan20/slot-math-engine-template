/**
 * W152 Wave 152 — Bonus Trigger Award Tier Stratification tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveBonusTriggerAwardStratification,
  simulateBonusTriggerAwardStratification,
  type BonusTriggerAwardStratificationConfig,
} from '../src/features/bonusTriggerAwardStratification.js';

const baseCfg = (overrides: Partial<BonusTriggerAwardStratificationConfig> = {}): BonusTriggerAwardStratificationConfig => ({
  reelCount: 5,
  scatterProbabilityPerReel: 0.15,
  minScattersForTrigger: 3,
  awardTiers: [
    { scatterCount: 3, freeSpinsAward: 10 },
    { scatterCount: 4, freeSpinsAward: 15 },
    { scatterCount: 5, freeSpinsAward: 25 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects reelCount < 1', () => {
    expect(() => solveBonusTriggerAwardStratification(baseCfg({ reelCount: 0 }))).toThrow();
  });
  it('rejects q ≤ 0', () => {
    expect(() => solveBonusTriggerAwardStratification(baseCfg({ scatterProbabilityPerReel: 0 }))).toThrow();
  });
  it('rejects q ≥ 1', () => {
    expect(() => solveBonusTriggerAwardStratification(baseCfg({ scatterProbabilityPerReel: 1 }))).toThrow();
  });
  it('rejects S_min < 1', () => {
    expect(() => solveBonusTriggerAwardStratification(baseCfg({ minScattersForTrigger: 0 }))).toThrow();
  });
  it('rejects S_min > N', () => {
    expect(() => solveBonusTriggerAwardStratification(baseCfg({ minScattersForTrigger: 6 }))).toThrow();
  });
  it('rejects wrong number of award tiers', () => {
    expect(() => solveBonusTriggerAwardStratification(baseCfg({
      awardTiers: [
        { scatterCount: 3, freeSpinsAward: 10 },
        { scatterCount: 4, freeSpinsAward: 15 },
      ],
    }))).toThrow();
  });
  it('rejects missing tier in [S_min, N]', () => {
    expect(() => solveBonusTriggerAwardStratification(baseCfg({
      awardTiers: [
        { scatterCount: 3, freeSpinsAward: 10 },
        { scatterCount: 4, freeSpinsAward: 15 },
        { scatterCount: 6, freeSpinsAward: 25 }, // out of range
      ],
    }))).toThrow();
  });
  it('rejects duplicate tier', () => {
    expect(() => solveBonusTriggerAwardStratification(baseCfg({
      awardTiers: [
        { scatterCount: 3, freeSpinsAward: 10 },
        { scatterCount: 3, freeSpinsAward: 15 },
        { scatterCount: 5, freeSpinsAward: 25 },
      ],
    }))).toThrow();
  });
  it('rejects negative FS award', () => {
    expect(() => solveBonusTriggerAwardStratification(baseCfg({
      awardTiers: [
        { scatterCount: 3, freeSpinsAward: -1 },
        { scatterCount: 4, freeSpinsAward: 15 },
        { scatterCount: 5, freeSpinsAward: 25 },
      ],
    }))).toThrow();
  });
});

describe('scatter PMF correctness', () => {
  it('PMF sums to 1', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg());
    const sum = r.scatterCountPmf.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
  it('PMF has N+1 entries', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg());
    expect(r.scatterCountPmf.length).toBe(6); // N=5 → 0..5
  });
  it('P(S=0) = (1-q)^N', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg());
    expect(r.scatterCountPmf[0]).toBeCloseTo(Math.pow(0.85, 5), 10);
  });
  it('P(S=N) = q^N', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg());
    expect(r.scatterCountPmf[5]).toBeCloseTo(Math.pow(0.15, 5), 12);
  });
  it('E[S] = N·q = 0.75 implicitly via PMF moments', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg());
    let eS = 0;
    for (let s = 0; s <= 5; s++) eS += s * r.scatterCountPmf[s];
    expect(eS).toBeCloseTo(5 * 0.15, 10);
  });
});

describe('trigger probability', () => {
  it('P(trigger) = Σ_{s ≥ S_min} P(S = s)', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg());
    let manual = 0;
    for (let s = 3; s <= 5; s++) manual += r.scatterCountPmf[s];
    expect(r.probTriggerPerSpin).toBeCloseTo(manual, 10);
  });
  it('P(trigger) increases monotonically with q', () => {
    const a = solveBonusTriggerAwardStratification(baseCfg({ scatterProbabilityPerReel: 0.10 }));
    const b = solveBonusTriggerAwardStratification(baseCfg({ scatterProbabilityPerReel: 0.30 }));
    expect(b.probTriggerPerSpin).toBeGreaterThan(a.probTriggerPerSpin);
  });
  it('oneInNTriggerFrequency = 1 / P(trigger)', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg());
    expect(r.oneInNTriggerFrequency).toBeCloseTo(1 / r.probTriggerPerSpin, 6);
  });
  it('S_min = N → P(trigger) = q^N (rarest)', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg({
      minScattersForTrigger: 5,
      awardTiers: [{ scatterCount: 5, freeSpinsAward: 100 }],
    }));
    expect(r.probTriggerPerSpin).toBeCloseTo(Math.pow(0.15, 5), 12);
  });
  it('S_min = 1 → P(trigger) = 1 − (1−q)^N', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg({
      minScattersForTrigger: 1,
      awardTiers: [
        { scatterCount: 1, freeSpinsAward: 3 },
        { scatterCount: 2, freeSpinsAward: 6 },
        { scatterCount: 3, freeSpinsAward: 10 },
        { scatterCount: 4, freeSpinsAward: 15 },
        { scatterCount: 5, freeSpinsAward: 25 },
      ],
    }));
    expect(r.probTriggerPerSpin).toBeCloseTo(1 - Math.pow(0.85, 5), 10);
  });
});

describe('award correctness', () => {
  it('E[K | trigger] = Σ K(s)·P(S=s|trigger)', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg());
    // P(S = 3) = C(5,3)·0.15³·0.85² = 10·0.003375·0.7225 ≈ 0.024384
    // P(S = 4) = C(5,4)·0.15⁴·0.85 ≈ 0.002152
    // P(S = 5) = 0.15⁵ ≈ 0.0000759
    // P(trig) ≈ 0.02661
    // E[K|trig] = (10·0.024384 + 15·0.002152 + 25·0.0000759) / 0.02661
    const pTrig = r.probTriggerPerSpin;
    const eK = (10 * r.scatterCountPmf[3] + 15 * r.scatterCountPmf[4] + 25 * r.scatterCountPmf[5]) / pTrig;
    expect(r.expectedAwardGivenTrigger).toBeCloseTo(eK, 6);
  });
  it('E[FS per spin] = P(trig) · E[K | trig]', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg());
    expect(r.expectedFreeSpinsAwardedPerSpin).toBeCloseTo(r.probTriggerPerSpin * r.expectedAwardGivenTrigger, 8);
  });
  it('Var[K | trigger] ≥ 0', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg());
    expect(r.varianceAwardGivenTrigger).toBeGreaterThanOrEqual(0);
  });
  it('higher awards → higher E[K | trigger]', () => {
    const a = solveBonusTriggerAwardStratification(baseCfg({
      awardTiers: [
        { scatterCount: 3, freeSpinsAward: 5 },
        { scatterCount: 4, freeSpinsAward: 8 },
        { scatterCount: 5, freeSpinsAward: 12 },
      ],
    }));
    const b = solveBonusTriggerAwardStratification(baseCfg());
    expect(b.expectedAwardGivenTrigger).toBeGreaterThan(a.expectedAwardGivenTrigger);
  });
});

describe('tier stratification', () => {
  it('tier breakdown probabilities sum to 1', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg());
    const sum = r.probTierBreakdownConditional.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 8);
  });
  it('lowest tier most common (since S = S_min is most probable in heavy-tail Binomial)', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg());
    // For q=0.15, S=3 should be much more common than S=4 or S=5
    expect(r.probTierBreakdownConditional[0]).toBeGreaterThan(r.probTierBreakdownConditional[1]);
    expect(r.probTierBreakdownConditional[1]).toBeGreaterThan(r.probTierBreakdownConditional[2]);
  });
  it('probMaxScatterTier = P(S=N | trigger) = q^N / P(trig)', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg());
    expect(r.probMaxScatterTier).toBeCloseTo(Math.pow(0.15, 5) / r.probTriggerPerSpin, 8);
  });
});

describe('monotonicity', () => {
  it('higher q → higher E[FS per spin]', () => {
    const a = solveBonusTriggerAwardStratification(baseCfg({ scatterProbabilityPerReel: 0.10 }));
    const b = solveBonusTriggerAwardStratification(baseCfg({ scatterProbabilityPerReel: 0.30 }));
    expect(b.expectedFreeSpinsAwardedPerSpin).toBeGreaterThan(a.expectedFreeSpinsAwardedPerSpin);
  });
  it('higher q → higher max scatter tier proportion', () => {
    const a = solveBonusTriggerAwardStratification(baseCfg({ scatterProbabilityPerReel: 0.05 }));
    const b = solveBonusTriggerAwardStratification(baseCfg({ scatterProbabilityPerReel: 0.40 }));
    expect(b.probMaxScatterTier).toBeGreaterThan(a.probMaxScatterTier);
  });
});

describe('corner cases', () => {
  it('S_min = N → only max scatter triggers', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg({
      minScattersForTrigger: 5,
      awardTiers: [{ scatterCount: 5, freeSpinsAward: 100 }],
    }));
    expect(r.probTriggerPerSpin).toBeCloseTo(Math.pow(0.15, 5), 12);
    expect(r.expectedAwardGivenTrigger).toBe(100);
  });
  it('uniform awards across tiers → E[K | trig] = same value', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg({
      awardTiers: [
        { scatterCount: 3, freeSpinsAward: 10 },
        { scatterCount: 4, freeSpinsAward: 10 },
        { scatterCount: 5, freeSpinsAward: 10 },
      ],
    }));
    expect(r.expectedAwardGivenTrigger).toBeCloseTo(10, 10);
  });
  it('zero awards → zero E[FS]', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg({
      awardTiers: [
        { scatterCount: 3, freeSpinsAward: 0 },
        { scatterCount: 4, freeSpinsAward: 0 },
        { scatterCount: 5, freeSpinsAward: 0 },
      ],
    }));
    expect(r.expectedFreeSpinsAwardedPerSpin).toBe(0);
  });
});

describe('industry parametrizations', () => {
  it('Pragmatic Sweet Bonanza family 3/4/5 = 10/15/20 FS', () => {
    const r = solveBonusTriggerAwardStratification({
      reelCount: 5,
      scatterProbabilityPerReel: 0.13,
      minScattersForTrigger: 3,
      awardTiers: [
        { scatterCount: 3, freeSpinsAward: 10 },
        { scatterCount: 4, freeSpinsAward: 15 },
        { scatterCount: 5, freeSpinsAward: 20 },
      ],
    });
    expect(r.probTriggerPerSpin).toBeGreaterThan(0);
    expect(r.expectedFreeSpinsAwardedPerSpin).toBeGreaterThan(0);
  });
  it('NetEnt Vikings 3/4/5 with higher 5-scatter award', () => {
    const r = solveBonusTriggerAwardStratification({
      reelCount: 5,
      scatterProbabilityPerReel: 0.10,
      minScattersForTrigger: 3,
      awardTiers: [
        { scatterCount: 3, freeSpinsAward: 7 },
        { scatterCount: 4, freeSpinsAward: 11 },
        { scatterCount: 5, freeSpinsAward: 21 },
      ],
    });
    expect(r.probTriggerPerSpin).toBeGreaterThan(0);
  });
  it('Microgaming Mega Moolah-style 4-scatter trigger only', () => {
    const r = solveBonusTriggerAwardStratification({
      reelCount: 5,
      scatterProbabilityPerReel: 0.12,
      minScattersForTrigger: 4,
      awardTiers: [
        { scatterCount: 4, freeSpinsAward: 25 },
        { scatterCount: 5, freeSpinsAward: 50 },
      ],
    });
    expect(r.probTriggerPerSpin).toBeGreaterThan(0);
  });
  it('BTG Megaways 6-reel 3/4/5/6 → 10/15/20/30 FS', () => {
    const r = solveBonusTriggerAwardStratification({
      reelCount: 6,
      scatterProbabilityPerReel: 0.10,
      minScattersForTrigger: 3,
      awardTiers: [
        { scatterCount: 3, freeSpinsAward: 10 },
        { scatterCount: 4, freeSpinsAward: 15 },
        { scatterCount: 5, freeSpinsAward: 20 },
        { scatterCount: 6, freeSpinsAward: 30 },
      ],
    });
    expect(r.probTriggerPerSpin).toBeGreaterThan(0);
    expect(r.probTierBreakdownConditional.length).toBe(4);
  });
});

describe('MC cross-validation', () => {
  it('MC P(trigger) matches CF (abs ≤ 0.005 at 300K spins)', () => {
    const cfg = baseCfg();
    const cf = solveBonusTriggerAwardStratification(cfg);
    const mc = simulateBonusTriggerAwardStratification(cfg, 300_000, 0xdeadbeef);
    expect(Math.abs(cf.probTriggerPerSpin - mc.observedTriggerFraction)).toBeLessThan(0.005);
  });
  it('MC E[FS per spin] matches CF (rel ≤ 5% at 300K)', () => {
    const cfg = baseCfg();
    const cf = solveBonusTriggerAwardStratification(cfg);
    const mc = simulateBonusTriggerAwardStratification(cfg, 300_000, 0xcafe1234);
    const rel = Math.abs(cf.expectedFreeSpinsAwardedPerSpin - mc.observedMeanFreeSpinsAwardedPerSpin) /
      Math.max(cf.expectedFreeSpinsAwardedPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[scatters per spin] matches N·q (rel ≤ 2% at 300K)', () => {
    const cfg = baseCfg();
    const mc = simulateBonusTriggerAwardStratification(cfg, 300_000, 0xbeefcafe);
    const expected = 5 * 0.15;
    expect(Math.abs(expected - mc.observedMeanScattersPerSpin) / expected).toBeLessThan(0.02);
  });
  it('MC E[K | trigger] matches CF (rel ≤ 5% at 300K)', () => {
    const cfg = baseCfg();
    const cf = solveBonusTriggerAwardStratification(cfg);
    const mc = simulateBonusTriggerAwardStratification(cfg, 300_000, 0x1234);
    const rel = Math.abs(cf.expectedAwardGivenTrigger - mc.observedMeanAwardGivenTrigger) /
      Math.max(cf.expectedAwardGivenTrigger, 1e-9);
    expect(rel).toBeLessThan(0.05);
  });
  it('MC tier fractions match CF (abs ≤ 0.02 at 300K)', () => {
    const cfg = baseCfg();
    const cf = solveBonusTriggerAwardStratification(cfg);
    const mc = simulateBonusTriggerAwardStratification(cfg, 300_000, 0x5678);
    for (let k = 0; k < cf.probTierBreakdownConditional.length; k++) {
      expect(Math.abs(cf.probTierBreakdownConditional[k] - mc.observedTierFractions[k])).toBeLessThan(0.02);
    }
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveBonusTriggerAwardStratification(baseCfg());
    const b = solveBonusTriggerAwardStratification(baseCfg());
    expect(a.expectedFreeSpinsAwardedPerSpin).toBe(b.expectedFreeSpinsAwardedPerSpin);
  });
  it('MC same seed → identical', () => {
    const a = simulateBonusTriggerAwardStratification(baseCfg(), 1000, 42);
    const b = simulateBonusTriggerAwardStratification(baseCfg(), 1000, 42);
    expect(a.observedTriggerFraction).toBe(b.observedTriggerFraction);
  });
});

describe('distinctness vs prior Wxx', () => {
  it('W152 computes per-tier award stratification, W110 only wait time', () => {
    const r = solveBonusTriggerAwardStratification(baseCfg());
    expect(r.probTierBreakdownConditional.length).toBeGreaterThan(0);
  });
  it('W152 immediate trigger pri ≥ S_min (W118 collect-N tokens)', () => {
    // W118 collects N tokens over multiple spins; W152 is per-spin Binomial scatter count.
    const r = solveBonusTriggerAwardStratification(baseCfg());
    expect(r.probTriggerPerSpin).toBeGreaterThan(0);
    expect(r.probTriggerPerSpin).toBeLessThan(1);
  });
});
