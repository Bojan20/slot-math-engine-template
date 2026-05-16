/**
 * W152 Wave 75 — Multi-tier WAP jackpot + wheel acceptance tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveMultiTierWapWheel,
  simulateMultiTierWapWheel,
  type MultiTierWapWheelConfig,
} from '../src/features/multiTierWapWheel.js';

const baseCfg = (
  overrides: Partial<MultiTierWapWheelConfig> = {},
): MultiTierWapWheelConfig => ({
  triggerProbabilityPerSpin: 0.001, // ~1 in 1000 spins fires the wheel
  tiers: [
    { id: 'MINI', seedX: 10, contributionPerSpinX: 0.0001, wheelWeight: 500 },
    { id: 'MINOR', seedX: 50, contributionPerSpinX: 0.0002, wheelWeight: 300 },
    { id: 'MAJOR', seedX: 500, contributionPerSpinX: 0.0005, wheelWeight: 150 },
    { id: 'GRAND', seedX: 10000, contributionPerSpinX: 0.001, wheelWeight: 49 },
    { id: 'MEGA', seedX: 1000000, contributionPerSpinX: 0.0001, wheelWeight: 1 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects triggerProbability ≤ 0', () => {
    expect(() => solveMultiTierWapWheel(baseCfg({ triggerProbabilityPerSpin: 0 }))).toThrow();
  });
  it('rejects triggerProbability > 1', () => {
    expect(() => solveMultiTierWapWheel(baseCfg({ triggerProbabilityPerSpin: 1.5 }))).toThrow();
  });
  it('rejects empty tiers', () => {
    expect(() => solveMultiTierWapWheel(baseCfg({ tiers: [] }))).toThrow();
  });
  it('rejects duplicate tier id', () => {
    expect(() =>
      solveMultiTierWapWheel(
        baseCfg({
          tiers: [
            { id: 'A', seedX: 1, contributionPerSpinX: 0.001, wheelWeight: 1 },
            { id: 'A', seedX: 2, contributionPerSpinX: 0.001, wheelWeight: 1 },
          ],
        }),
      ),
    ).toThrow();
  });
  it('rejects negative seed', () => {
    expect(() =>
      solveMultiTierWapWheel(
        baseCfg({
          tiers: [{ id: 'X', seedX: -1, contributionPerSpinX: 0.001, wheelWeight: 1 }],
        }),
      ),
    ).toThrow();
  });
  it('rejects negative contribution', () => {
    expect(() =>
      solveMultiTierWapWheel(
        baseCfg({
          tiers: [{ id: 'X', seedX: 1, contributionPerSpinX: -0.001, wheelWeight: 1 }],
        }),
      ),
    ).toThrow();
  });
  it('rejects non-positive wheel weight', () => {
    expect(() =>
      solveMultiTierWapWheel(
        baseCfg({
          tiers: [{ id: 'X', seedX: 1, contributionPerSpinX: 0.001, wheelWeight: 0 }],
        }),
      ),
    ).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('λ_i = p_trigger × w_i / Σw', () => {
    const r = solveMultiTierWapWheel(baseCfg());
    // Σw = 500+300+150+49+1 = 1000
    expect(r.totalWheelWeight).toBe(1000);
    expect(r.tierResults[0].hitProbabilityPerSpin).toBeCloseTo(0.001 * 0.5, 10); // MINI
    expect(r.tierResults[4].hitProbabilityPerSpin).toBeCloseTo(0.001 * 0.001, 12); // MEGA
  });
  it('E[spins between] = 1/λ_i', () => {
    const r = solveMultiTierWapWheel(baseCfg());
    expect(r.tierResults[0].expectedSpinsBetweenHits).toBeCloseTo(1 / (0.001 * 0.5), 6);
    expect(r.tierResults[4].expectedSpinsBetweenHits).toBeCloseTo(1 / (0.001 * 0.001), 0);
  });
  it('E[pool_i at hit] = seed_i + c_i / λ_i', () => {
    const r = solveMultiTierWapWheel(baseCfg());
    // MINI: λ = 5e-4, c = 1e-4 → E[pool] = 10 + 1e-4 / 5e-4 = 10 + 0.2 = 10.2
    expect(r.tierResults[0].expectedPoolAtHit).toBeCloseTo(10.2, 8);
    // GRAND: λ = 4.9e-5, c = 1e-3 → E[pool] = 10000 + 1e-3 / 4.9e-5 ≈ 10000 + 20.408
    expect(r.tierResults[3].expectedPoolAtHit).toBeCloseTo(10000 + 1e-3 / (0.001 * 0.049), 6);
  });
  it('E[payout_i per spin] = c_i + λ_i × seed_i', () => {
    const r = solveMultiTierWapWheel(baseCfg());
    for (let i = 0; i < r.tierResults.length; i++) {
      const t = baseCfg().tiers[i];
      const lambda = r.tierResults[i].hitProbabilityPerSpin;
      const expected = t.contributionPerSpinX + lambda * t.seedX;
      expect(r.tierResults[i].expectedPayoutPerSpin).toBeCloseTo(expected, 10);
    }
  });
  it('totalRtpShare = 1', () => {
    const r = solveMultiTierWapWheel(baseCfg());
    expect(r.totalRtpShare).toBeCloseTo(1, 10);
  });
  it('totalContributionPerSpin = Σ c_i', () => {
    const r = solveMultiTierWapWheel(baseCfg());
    expect(r.totalContributionPerSpin).toBeCloseTo(0.0001 + 0.0002 + 0.0005 + 0.001 + 0.0001, 10);
  });
  it('total RTP = Σ c_i + p_trigger × E[seed | hit]', () => {
    const r = solveMultiTierWapWheel(baseCfg());
    const cfg = baseCfg();
    const sumC = cfg.tiers.reduce((a, t) => a + t.contributionPerSpinX, 0);
    const eSeed = cfg.tiers.reduce(
      (a, t) => a + (t.wheelWeight / r.totalWheelWeight) * t.seedX,
      0,
    );
    expect(r.totalExpectedPayoutPerSpin).toBeCloseTo(sumC + cfg.triggerProbabilityPerSpin * eSeed, 10);
    expect(r.operatorFundedPortion).toBeCloseTo(cfg.triggerProbabilityPerSpin * eSeed, 10);
  });
  it('Var[pool_i at hit] = c_i² (1-λ_i) / λ_i²', () => {
    const r = solveMultiTierWapWheel(baseCfg());
    const cfg = baseCfg();
    for (let i = 0; i < r.tierResults.length; i++) {
      const lambda = r.tierResults[i].hitProbabilityPerSpin;
      const c = cfg.tiers[i].contributionPerSpinX;
      const expected = (c * c) * (1 - lambda) / (lambda * lambda);
      expect(r.tierResults[i].variancePoolAtHit).toBeCloseTo(expected, 6);
    }
  });
});

describe('monotonicity', () => {
  it('higher trigger probability ⇒ shorter spins-between for every tier', () => {
    const a = solveMultiTierWapWheel(baseCfg({ triggerProbabilityPerSpin: 0.0005 }));
    const b = solveMultiTierWapWheel(baseCfg({ triggerProbabilityPerSpin: 0.005 }));
    for (let i = 0; i < a.tierResults.length; i++) {
      expect(b.tierResults[i].expectedSpinsBetweenHits).toBeLessThan(
        a.tierResults[i].expectedSpinsBetweenHits,
      );
    }
  });
  it('higher seed ⇒ higher RTP share for that tier', () => {
    const cfgA = baseCfg();
    const cfgB = baseCfg({
      tiers: cfgA.tiers.map((t) =>
        t.id === 'MEGA' ? { ...t, seedX: 5_000_000 } : t,
      ),
    });
    const a = solveMultiTierWapWheel(cfgA);
    const b = solveMultiTierWapWheel(cfgB);
    expect(b.tierResults[4].rtpShare).toBeGreaterThan(a.tierResults[4].rtpShare);
  });
  it('higher MEGA weight ⇒ higher MEGA hit probability and shorter spins-between', () => {
    const cfgA = baseCfg();
    const cfgB = baseCfg({
      tiers: cfgA.tiers.map((t) => (t.id === 'MEGA' ? { ...t, wheelWeight: 50 } : t)),
    });
    const a = solveMultiTierWapWheel(cfgA);
    const b = solveMultiTierWapWheel(cfgB);
    expect(b.tierResults[4].hitProbabilityPerSpin).toBeGreaterThan(
      a.tierResults[4].hitProbabilityPerSpin,
    );
    expect(b.tierResults[4].expectedSpinsBetweenHits).toBeLessThan(
      a.tierResults[4].expectedSpinsBetweenHits,
    );
  });
});

describe('MC cross-validation', () => {
  it('observed trigger probability matches p_trigger (rel ≤ 5% at 200K spins)', () => {
    const cfg = baseCfg({ triggerProbabilityPerSpin: 0.01 }); // higher rate to get enough hits
    const mc = simulateMultiTierWapWheel(cfg, 200_000, 0xc0ffee);
    const rel =
      Math.abs(mc.observedTriggerProbability - cfg.triggerProbabilityPerSpin) /
      cfg.triggerProbabilityPerSpin;
    expect(rel).toBeLessThan(0.05);
  });
  it('observed total RTP matches closed-form (rel ≤ 10% at 500K spins)', () => {
    const cfg = baseCfg({
      triggerProbabilityPerSpin: 0.02,
      tiers: [
        { id: 'A', seedX: 10, contributionPerSpinX: 0.001, wheelWeight: 70 },
        { id: 'B', seedX: 50, contributionPerSpinX: 0.002, wheelWeight: 25 },
        { id: 'C', seedX: 500, contributionPerSpinX: 0.003, wheelWeight: 5 },
      ],
    });
    const cf = solveMultiTierWapWheel(cfg);
    const mc = simulateMultiTierWapWheel(cfg, 500_000, 0xbeefbabe);
    const rel =
      Math.abs(cf.totalExpectedPayoutPerSpin - mc.observedTotalPayoutPerSpin) /
      cf.totalExpectedPayoutPerSpin;
    expect(rel).toBeLessThan(0.1);
  });
  it('observed mean pool@hit matches closed-form for a frequently-hit tier (rel ≤ 5%)', () => {
    const cfg = baseCfg({
      triggerProbabilityPerSpin: 0.05,
      tiers: [
        { id: 'A', seedX: 10, contributionPerSpinX: 0.01, wheelWeight: 9 },
        { id: 'B', seedX: 1000, contributionPerSpinX: 0.01, wheelWeight: 1 },
      ],
    });
    const cf = solveMultiTierWapWheel(cfg);
    const mc = simulateMultiTierWapWheel(cfg, 500_000, 0xfeedcafe);
    // Tier A: high weight, frequent hits — pool-at-hit should converge.
    const rel =
      Math.abs(cf.tierResults[0].expectedPoolAtHit - mc.observedMeanPoolAtHit[0]) /
      cf.tierResults[0].expectedPoolAtHit;
    expect(rel).toBeLessThan(0.05);
  });
  it('observed tier hits proportional to wheel weights (rel ≤ 5%)', () => {
    const cfg = baseCfg({
      triggerProbabilityPerSpin: 0.05,
      tiers: [
        { id: 'A', seedX: 10, contributionPerSpinX: 0.001, wheelWeight: 60 },
        { id: 'B', seedX: 20, contributionPerSpinX: 0.001, wheelWeight: 30 },
        { id: 'C', seedX: 30, contributionPerSpinX: 0.001, wheelWeight: 10 },
      ],
    });
    const mc = simulateMultiTierWapWheel(cfg, 200_000, 1);
    const totalHits = mc.observedTierHits.reduce((a, b) => a + b, 0);
    const observedShare = mc.observedTierHits.map((h) => h / totalHits);
    const expectedShare = [0.6, 0.3, 0.1];
    for (let i = 0; i < 3; i++) {
      const rel = Math.abs(observedShare[i] - expectedShare[i]) / expectedShare[i];
      expect(rel).toBeLessThan(0.05);
    }
  });
});

describe('determinism', () => {
  it('CF same config → identical', () => {
    const a = solveMultiTierWapWheel(baseCfg());
    const b = solveMultiTierWapWheel(baseCfg());
    expect(a.totalExpectedPayoutPerSpin).toBe(b.totalExpectedPayoutPerSpin);
  });
  it('MC same seed → identical', () => {
    const a = simulateMultiTierWapWheel(baseCfg(), 5000, 42);
    const b = simulateMultiTierWapWheel(baseCfg(), 5000, 42);
    expect(a.totalPayout).toBe(b.totalPayout);
    expect(a.triggers).toBe(b.triggers);
  });
  it('MC different seeds → different totals (sanity)', () => {
    const a = simulateMultiTierWapWheel(baseCfg({ triggerProbabilityPerSpin: 0.05 }), 5000, 1);
    const b = simulateMultiTierWapWheel(baseCfg({ triggerProbabilityPerSpin: 0.05 }), 5000, 2);
    expect(a.totalPayout).not.toBe(b.totalPayout);
  });
});

describe('PAR-sheet style 4-tier acceptance', () => {
  it('classic 4-tier WAP: each tier RTP share sums to 1, no tier dominates fully', () => {
    const cfg: MultiTierWapWheelConfig = {
      triggerProbabilityPerSpin: 0.0005,
      tiers: [
        { id: 'Mini', seedX: 5, contributionPerSpinX: 0.0001, wheelWeight: 600 },
        { id: 'Minor', seedX: 50, contributionPerSpinX: 0.0002, wheelWeight: 300 },
        { id: 'Major', seedX: 1000, contributionPerSpinX: 0.0005, wheelWeight: 95 },
        { id: 'Grand', seedX: 100000, contributionPerSpinX: 0.001, wheelWeight: 5 },
      ],
    };
    const r = solveMultiTierWapWheel(cfg);
    expect(r.totalRtpShare).toBeCloseTo(1, 10);
    for (const tr of r.tierResults) {
      expect(tr.rtpShare).toBeGreaterThan(0);
      expect(tr.rtpShare).toBeLessThan(1);
    }
    // Operator-funded portion is genuine cost, must be positive.
    expect(r.operatorFundedPortion).toBeGreaterThan(0);
    // Total RTP must exceed pure contribution (seed adds operator funding).
    expect(r.totalExpectedPayoutPerSpin).toBeGreaterThan(r.totalContributionPerSpin);
  });
  it('zero-seed configuration → RTP = total contribution', () => {
    const cfg: MultiTierWapWheelConfig = {
      triggerProbabilityPerSpin: 0.001,
      tiers: [
        { id: 'A', seedX: 0, contributionPerSpinX: 0.0001, wheelWeight: 50 },
        { id: 'B', seedX: 0, contributionPerSpinX: 0.0005, wheelWeight: 50 },
      ],
    };
    const r = solveMultiTierWapWheel(cfg);
    expect(r.totalExpectedPayoutPerSpin).toBeCloseTo(r.totalContributionPerSpin, 12);
    expect(r.operatorFundedPortion).toBeCloseTo(0, 12);
  });
});
