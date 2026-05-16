/**
 * W152 Wave 150 — Voltage/XP Meter Multi-Tier Reward tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveVoltageMeterMultiTier,
  simulateVoltageMeterMultiTier,
  type VoltageMeterMultiTierConfig,
} from '../src/features/voltageMeterMultiTier.js';

const baseCfg = (overrides: Partial<VoltageMeterMultiTierConfig> = {}): VoltageMeterMultiTierConfig => ({
  cascadeContinuationProbability: 0.5,
  tiers: [
    { threshold: 3, rewardX: 5 },
    { threshold: 6, rewardX: 25 },
    { threshold: 10, rewardX: 200 },
  ],
  rewardMode: 'highest-only',
  ...overrides,
});

describe('validation', () => {
  it('rejects p ≤ 0', () => {
    expect(() => solveVoltageMeterMultiTier(baseCfg({ cascadeContinuationProbability: 0 }))).toThrow();
  });
  it('rejects p ≥ 1', () => {
    expect(() => solveVoltageMeterMultiTier(baseCfg({ cascadeContinuationProbability: 1 }))).toThrow();
  });
  it('rejects empty tiers', () => {
    expect(() => solveVoltageMeterMultiTier(baseCfg({ tiers: [] }))).toThrow();
  });
  it('rejects non-ascending thresholds', () => {
    expect(() => solveVoltageMeterMultiTier(baseCfg({
      tiers: [
        { threshold: 5, rewardX: 10 },
        { threshold: 3, rewardX: 20 },
      ],
    }))).toThrow();
  });
  it('rejects duplicate thresholds', () => {
    expect(() => solveVoltageMeterMultiTier(baseCfg({
      tiers: [
        { threshold: 5, rewardX: 10 },
        { threshold: 5, rewardX: 20 },
      ],
    }))).toThrow();
  });
  it('rejects threshold < 1', () => {
    expect(() => solveVoltageMeterMultiTier(baseCfg({
      tiers: [{ threshold: 0, rewardX: 10 }],
    }))).toThrow();
  });
  it('rejects negative rewardX', () => {
    expect(() => solveVoltageMeterMultiTier(baseCfg({
      tiers: [{ threshold: 5, rewardX: -10 }],
    }))).toThrow();
  });
  it('rejects invalid rewardMode', () => {
    expect(() => solveVoltageMeterMultiTier(baseCfg({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rewardMode: 'invalid' as any,
    }))).toThrow();
  });
});

describe('hit probabilities', () => {
  it('P(L ≥ T_k) = p^T_k', () => {
    const r = solveVoltageMeterMultiTier(baseCfg());
    // p=0.5, T_1=3, T_2=6, T_3=10
    expect(r.perTierHitProbability[0]).toBeCloseTo(Math.pow(0.5, 3), 10);
    expect(r.perTierHitProbability[1]).toBeCloseTo(Math.pow(0.5, 6), 10);
    expect(r.perTierHitProbability[2]).toBeCloseTo(Math.pow(0.5, 10), 10);
  });
  it('hit probs strictly decreasing', () => {
    const r = solveVoltageMeterMultiTier(baseCfg());
    for (let k = 0; k < r.tierCount - 1; k++) {
      expect(r.perTierHitProbability[k]).toBeGreaterThan(r.perTierHitProbability[k + 1]);
    }
  });
  it('exact-highest probs sum + P(no tier) = 1', () => {
    const r = solveVoltageMeterMultiTier(baseCfg());
    const sum = r.perTierExactHighestProbability.reduce((a, b) => a + b, 0) + r.probNoTierReached;
    expect(sum).toBeCloseTo(1, 10);
  });
  it('exact-highest probs all non-negative', () => {
    const r = solveVoltageMeterMultiTier(baseCfg());
    for (const p of r.perTierExactHighestProbability) {
      expect(p).toBeGreaterThanOrEqual(0);
    }
  });
  it('P(no tier) = 1 - p^T_1', () => {
    const r = solveVoltageMeterMultiTier(baseCfg());
    expect(r.probNoTierReached).toBeCloseTo(1 - Math.pow(0.5, 3), 10);
  });
});

describe('highest-only mode', () => {
  it('E[reward] = R_1·(p^T_1 - p^T_2) + R_2·(p^T_2 - p^T_3) + R_3·p^T_3', () => {
    const r = solveVoltageMeterMultiTier(baseCfg({ rewardMode: 'highest-only' }));
    const expected =
      5 * (Math.pow(0.5, 3) - Math.pow(0.5, 6)) +
      25 * (Math.pow(0.5, 6) - Math.pow(0.5, 10)) +
      200 * Math.pow(0.5, 10);
    expect(r.expectedRewardPerSpin).toBeCloseTo(expected, 8);
  });
  it('telescoping form: R_1·p^T_1 + (R_2-R_1)·p^T_2 + (R_3-R_2)·p^T_3', () => {
    const r = solveVoltageMeterMultiTier(baseCfg({ rewardMode: 'highest-only' }));
    const tele =
      5 * Math.pow(0.5, 3) +
      (25 - 5) * Math.pow(0.5, 6) +
      (200 - 25) * Math.pow(0.5, 10);
    expect(r.expectedRewardPerSpin).toBeCloseTo(tele, 8);
  });
  it('Var ≥ 0', () => {
    const r = solveVoltageMeterMultiTier(baseCfg({ rewardMode: 'highest-only' }));
    expect(r.varianceRewardPerSpin).toBeGreaterThanOrEqual(0);
  });
});

describe('cumulative mode', () => {
  it('E[reward] = Σ R_k · p^T_k', () => {
    const r = solveVoltageMeterMultiTier(baseCfg({ rewardMode: 'cumulative' }));
    const expected =
      5 * Math.pow(0.5, 3) +
      25 * Math.pow(0.5, 6) +
      200 * Math.pow(0.5, 10);
    expect(r.expectedRewardPerSpin).toBeCloseTo(expected, 8);
  });
  it('cumulative mode ≥ highest-only mode (more rewards collected)', () => {
    const a = solveVoltageMeterMultiTier(baseCfg({ rewardMode: 'highest-only' }));
    const b = solveVoltageMeterMultiTier(baseCfg({ rewardMode: 'cumulative' }));
    expect(b.expectedRewardPerSpin).toBeGreaterThanOrEqual(a.expectedRewardPerSpin);
  });
  it('Var ≥ 0', () => {
    const r = solveVoltageMeterMultiTier(baseCfg({ rewardMode: 'cumulative' }));
    expect(r.varianceRewardPerSpin).toBeGreaterThanOrEqual(0);
  });
});

describe('monotonicity', () => {
  it('higher p → higher E[reward]', () => {
    const a = solveVoltageMeterMultiTier(baseCfg({ cascadeContinuationProbability: 0.3 }));
    const b = solveVoltageMeterMultiTier(baseCfg({ cascadeContinuationProbability: 0.7 }));
    expect(b.expectedRewardPerSpin).toBeGreaterThan(a.expectedRewardPerSpin);
  });
  it('lower thresholds → higher E[reward]', () => {
    const a = solveVoltageMeterMultiTier({
      cascadeContinuationProbability: 0.5,
      tiers: [
        { threshold: 10, rewardX: 5 },
        { threshold: 20, rewardX: 25 },
        { threshold: 30, rewardX: 200 },
      ],
      rewardMode: 'highest-only',
    });
    const b = solveVoltageMeterMultiTier({
      cascadeContinuationProbability: 0.5,
      tiers: [
        { threshold: 2, rewardX: 5 },
        { threshold: 4, rewardX: 25 },
        { threshold: 6, rewardX: 200 },
      ],
      rewardMode: 'highest-only',
    });
    expect(b.expectedRewardPerSpin).toBeGreaterThan(a.expectedRewardPerSpin);
  });
  it('higher rewards → higher E[reward]', () => {
    const a = solveVoltageMeterMultiTier(baseCfg());
    const b = solveVoltageMeterMultiTier({
      ...baseCfg(),
      tiers: [
        { threshold: 3, rewardX: 50 },
        { threshold: 6, rewardX: 250 },
        { threshold: 10, rewardX: 2000 },
      ],
    });
    expect(b.expectedRewardPerSpin).toBeGreaterThan(a.expectedRewardPerSpin);
  });
});

describe('corner cases', () => {
  it('single tier reduces to W146-style single threshold', () => {
    const r = solveVoltageMeterMultiTier({
      cascadeContinuationProbability: 0.5,
      tiers: [{ threshold: 5, rewardX: 100 }],
      rewardMode: 'highest-only',
    });
    // Single tier: E[R] = R · p^T = 100 · 0.5^5 = 100/32 = 3.125
    expect(r.expectedRewardPerSpin).toBeCloseTo(100 * Math.pow(0.5, 5), 8);
  });
  it('zero rewards everywhere → E[reward] = 0', () => {
    const r = solveVoltageMeterMultiTier({
      cascadeContinuationProbability: 0.5,
      tiers: [
        { threshold: 3, rewardX: 0 },
        { threshold: 6, rewardX: 0 },
      ],
      rewardMode: 'highest-only',
    });
    expect(r.expectedRewardPerSpin).toBe(0);
  });
  it('tier 1 threshold = 1 → P(no tier) = 1 - p', () => {
    const r = solveVoltageMeterMultiTier({
      cascadeContinuationProbability: 0.5,
      tiers: [{ threshold: 1, rewardX: 10 }],
      rewardMode: 'highest-only',
    });
    expect(r.probNoTierReached).toBeCloseTo(0.5, 10);
  });
});

describe('industry parametrizations', () => {
  it("Hacksaw Stack 'Em 3-tier cumulative", () => {
    const r = solveVoltageMeterMultiTier({
      cascadeContinuationProbability: 0.55,
      tiers: [
        { threshold: 3,  rewardX: 5 },
        { threshold: 6,  rewardX: 20 },
        { threshold: 10, rewardX: 100 },
      ],
      rewardMode: 'cumulative',
    });
    expect(r.expectedRewardPerSpin).toBeGreaterThan(0);
    expect(r.tierCount).toBe(3);
  });
  it('Push Wild Swarm highest-only 4-tier', () => {
    const r = solveVoltageMeterMultiTier({
      cascadeContinuationProbability: 0.5,
      tiers: [
        { threshold: 2,  rewardX: 10 },
        { threshold: 5,  rewardX: 50 },
        { threshold: 10, rewardX: 250 },
        { threshold: 15, rewardX: 1000 },
      ],
      rewardMode: 'highest-only',
    });
    expect(r.expectedRewardPerSpin).toBeGreaterThan(0);
  });
  it('NetEnt Charged 5-tier deep ladder', () => {
    const r = solveVoltageMeterMultiTier({
      cascadeContinuationProbability: 0.6,
      tiers: [
        { threshold: 2,  rewardX: 1 },
        { threshold: 5,  rewardX: 5 },
        { threshold: 10, rewardX: 25 },
        { threshold: 15, rewardX: 100 },
        { threshold: 25, rewardX: 1000 },
      ],
      rewardMode: 'cumulative',
    });
    expect(r.expectedRewardPerSpin).toBeGreaterThan(0);
  });
});

describe('MC cross-validation', () => {
  it('MC E[reward] matches CF highest-only (rel ≤ 6% at 500K spins)', () => {
    const cfg = baseCfg({ rewardMode: 'highest-only' });
    const cf = solveVoltageMeterMultiTier(cfg);
    const mc = simulateVoltageMeterMultiTier(cfg, 500_000, 0xdeadbeef);
    const rel = Math.abs(cf.expectedRewardPerSpin - mc.observedMeanRewardPerSpin) /
      Math.max(cf.expectedRewardPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.06);
  });
  it('MC E[reward] matches CF cumulative (rel ≤ 6% at 500K spins)', () => {
    const cfg = baseCfg({ rewardMode: 'cumulative' });
    const cf = solveVoltageMeterMultiTier(cfg);
    const mc = simulateVoltageMeterMultiTier(cfg, 500_000, 0xcafe1234);
    const rel = Math.abs(cf.expectedRewardPerSpin - mc.observedMeanRewardPerSpin) /
      Math.max(cf.expectedRewardPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.06);
  });
  it('MC P(no tier) matches CF (abs ≤ 0.01 at 500K)', () => {
    const cfg = baseCfg();
    const cf = solveVoltageMeterMultiTier(cfg);
    const mc = simulateVoltageMeterMultiTier(cfg, 500_000, 0xbeefcafe);
    expect(Math.abs(cf.probNoTierReached - mc.observedNoTierReachedFraction)).toBeLessThan(0.01);
  });
  it('MC per-tier hit fractions match CF (abs ≤ 0.005 at 500K)', () => {
    const cfg = baseCfg();
    const cf = solveVoltageMeterMultiTier(cfg);
    const mc = simulateVoltageMeterMultiTier(cfg, 500_000, 0x1234);
    for (let k = 0; k < cf.tierCount; k++) {
      expect(Math.abs(cf.perTierHitProbability[k] - mc.observedPerTierHitFraction[k])).toBeLessThan(0.005);
    }
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveVoltageMeterMultiTier(baseCfg());
    const b = solveVoltageMeterMultiTier(baseCfg());
    expect(a.expectedRewardPerSpin).toBe(b.expectedRewardPerSpin);
  });
  it('MC same seed → identical', () => {
    const a = simulateVoltageMeterMultiTier(baseCfg(), 1000, 42);
    const b = simulateVoltageMeterMultiTier(baseCfg(), 1000, 42);
    expect(a.observedMeanRewardPerSpin).toBe(b.observedMeanRewardPerSpin);
  });
});

describe('distinctness vs W146', () => {
  it('W150 supports multiple thresholds (W146 has only one)', () => {
    const r = solveVoltageMeterMultiTier(baseCfg());
    expect(r.tierCount).toBeGreaterThan(1);
  });
  it('W150 single-tier reduces to W146-style single-fire-or-not (Bernoulli p^T)', () => {
    // W146 with B=R, T=T → E[F] = p^T/(1-p^T), feature pay = B·E[F]
    // W150 single tier highest-only → E[R] = R · p^T (ne baš isto kao W146!)
    // W150: P(L ≥ T) · R = p^T · R = single trigger flat reward
    // W146: E[fires] = p^T/(1-p^T) which can be >1 (multiple fires same spin)
    // So W150 = single-tier ≠ W146 fundamentally
    const w150 = solveVoltageMeterMultiTier({
      cascadeContinuationProbability: 0.5,
      tiers: [{ threshold: 5, rewardX: 100 }],
      rewardMode: 'highest-only',
    });
    expect(w150.expectedRewardPerSpin).toBeCloseTo(100 * Math.pow(0.5, 5), 6);
    // W146 with same params would give 100 · 0.5^5 / (1-0.5^5) ≈ 3.226, NOT 3.125
  });
});
