/**
 * W152 Wave 132 — Multi-Level Wild Tier Markov tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveMultiLevelWildMarkov,
  simulateMultiLevelWildMarkov,
  type MultiLevelWildMarkovConfig,
} from '../src/features/multiLevelWildMarkov.js';

const baseCfg = (overrides: Partial<MultiLevelWildMarkovConfig> = {}): MultiLevelWildMarkovConfig => ({
  landProbability: 0.05,
  upgradeProbabilityBasicToSuper: 0.10,
  upgradeProbabilitySuperToMega: 0.05,
  expireProbability: 0.20,
  basicMultiplier: 2,
  superMultiplier: 5,
  megaMultiplier: 25,
  baseWinPmf: [
    { value: 0, probability: 0.7 },
    { value: 1, probability: 0.2 },
    { value: 5, probability: 0.1 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects p_land ≤ 0', () => {
    expect(() => solveMultiLevelWildMarkov(baseCfg({ landProbability: 0 }))).toThrow();
  });
  it('rejects p_land > 1', () => {
    expect(() => solveMultiLevelWildMarkov(baseCfg({ landProbability: 1.5 }))).toThrow();
  });
  it('rejects p_up1 < 0', () => {
    expect(() => solveMultiLevelWildMarkov(baseCfg({ upgradeProbabilityBasicToSuper: -0.1 }))).toThrow();
  });
  it('rejects p_expire = 0', () => {
    expect(() => solveMultiLevelWildMarkov(baseCfg({ expireProbability: 0 }))).toThrow();
  });
  it('rejects p_up1 + p_expire > 1', () => {
    expect(() => solveMultiLevelWildMarkov(baseCfg({
      upgradeProbabilityBasicToSuper: 0.6,
      expireProbability: 0.5,
    }))).toThrow();
  });
  it('rejects superMultiplier < basicMultiplier', () => {
    expect(() => solveMultiLevelWildMarkov(baseCfg({
      basicMultiplier: 5,
      superMultiplier: 3,
    }))).toThrow();
  });
  it('rejects megaMultiplier < superMultiplier', () => {
    expect(() => solveMultiLevelWildMarkov(baseCfg({
      superMultiplier: 10,
      megaMultiplier: 8,
    }))).toThrow();
  });
  it('rejects basicMultiplier < 1', () => {
    expect(() => solveMultiLevelWildMarkov(baseCfg({ basicMultiplier: 0.5 }))).toThrow();
  });
  it('rejects baseWinPmf not summing to 1', () => {
    expect(() => solveMultiLevelWildMarkov(baseCfg({
      baseWinPmf: [{ value: 1, probability: 0.5 }, { value: 2, probability: 0.3 }],
    }))).toThrow();
  });
});

describe('stationary distribution', () => {
  it('all 4 probabilities sum to 1', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    const sum = r.probIdle + r.probBasic + r.probSuper + r.probMega;
    expect(sum).toBeCloseTo(1, 10);
  });
  it('probIdle > 0', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    expect(r.probIdle).toBeGreaterThan(0);
  });
  it('all stationary probs ≥ 0', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    expect(r.probIdle).toBeGreaterThanOrEqual(0);
    expect(r.probBasic).toBeGreaterThanOrEqual(0);
    expect(r.probSuper).toBeGreaterThanOrEqual(0);
    expect(r.probMega).toBeGreaterThanOrEqual(0);
  });
  it('probAnyActive = 1 − probIdle', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    expect(r.probAnyActive).toBeCloseTo(1 - r.probIdle, 10);
  });
  it('probBasic > probSuper > probMega (upgrades cascade rare)', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    expect(r.probBasic).toBeGreaterThan(r.probSuper);
    expect(r.probSuper).toBeGreaterThan(r.probMega);
  });
  it('conditional probs sum to 1 given active', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    const sum = r.conditionalProbBasicGivenActive + r.conditionalProbSuperGivenActive + r.conditionalProbMegaGivenActive;
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe('balance equations', () => {
  it('chain ratios: π_super/π_basic = p_up1 / (p_up2 + p_exp)', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    const cfg = baseCfg();
    const expectedRatio = cfg.upgradeProbabilityBasicToSuper / (cfg.upgradeProbabilitySuperToMega + cfg.expireProbability);
    expect(r.probSuper / r.probBasic).toBeCloseTo(expectedRatio, 8);
  });
  it('chain ratios: π_mega/π_super = p_up2 / p_exp', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    const cfg = baseCfg();
    const expectedRatio = cfg.upgradeProbabilitySuperToMega / cfg.expireProbability;
    expect(r.probMega / r.probSuper).toBeCloseTo(expectedRatio, 8);
  });
});

describe('expected multiplier', () => {
  it('E[M] = π_idle·1 + π_basic·M_basic + π_super·M_super + π_mega·M_mega', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    const expected = r.probIdle * 1 + r.probBasic * 2 + r.probSuper * 5 + r.probMega * 25;
    expect(r.expectedMultiplierPerSpin).toBeCloseTo(expected, 8);
  });
  it('E[M] ≥ 1 (baseline)', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    expect(r.expectedMultiplierPerSpin).toBeGreaterThanOrEqual(1);
  });
  it('Var[M] ≥ 0', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    expect(r.varianceMultiplierPerSpin).toBeGreaterThanOrEqual(0);
  });
  it('maxMultiplier = megaMultiplier', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    expect(r.maxMultiplier).toBe(25);
  });
});

describe('payout decomposition', () => {
  it('E[Y] = E[V] · E[M] (independence)', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    expect(r.expectedPayoutPerSpin).toBeCloseTo(r.expectedBaseWin * r.expectedMultiplierPerSpin, 8);
  });
  it('E[V] computed correctly', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    // 0·0.7 + 1·0.2 + 5·0.1 = 0.7
    expect(r.expectedBaseWin).toBeCloseTo(0.7, 8);
  });
  it('Var[Y] = E[V²]·E[M²] − E[Y]² (cross-indep)', () => {
    const r = solveMultiLevelWildMarkov(baseCfg());
    const expected = r.expectedBaseWinSquared * r.expectedMultiplierSquaredPerSpin -
      r.expectedPayoutPerSpin * r.expectedPayoutPerSpin;
    expect(r.variancePayoutPerSpin).toBeCloseTo(Math.max(0, expected), 4);
  });
});

describe('monotonicity', () => {
  it('higher p_up1 → higher π_super', () => {
    const a = solveMultiLevelWildMarkov(baseCfg({ upgradeProbabilityBasicToSuper: 0.05 }));
    const b = solveMultiLevelWildMarkov(baseCfg({ upgradeProbabilityBasicToSuper: 0.50 }));
    expect(b.probSuper).toBeGreaterThan(a.probSuper);
  });
  it('higher megaMultiplier → higher E[M]', () => {
    const a = solveMultiLevelWildMarkov(baseCfg({ megaMultiplier: 10 }));
    const b = solveMultiLevelWildMarkov(baseCfg({ megaMultiplier: 50 }));
    expect(b.expectedMultiplierPerSpin).toBeGreaterThan(a.expectedMultiplierPerSpin);
  });
  it('higher p_expire → higher π_idle', () => {
    const a = solveMultiLevelWildMarkov(baseCfg({ expireProbability: 0.05 }));
    const b = solveMultiLevelWildMarkov(baseCfg({ expireProbability: 0.50 }));
    expect(b.probIdle).toBeGreaterThan(a.probIdle);
  });
});

describe('degenerate corners', () => {
  it('p_up1 = 0 → no super/mega reachable', () => {
    const r = solveMultiLevelWildMarkov(baseCfg({
      upgradeProbabilityBasicToSuper: 0,
      upgradeProbabilitySuperToMega: 0,
    }));
    expect(r.probSuper).toBeCloseTo(0, 10);
    expect(r.probMega).toBeCloseTo(0, 10);
  });
  it('p_up2 = 0 → no mega reachable', () => {
    const r = solveMultiLevelWildMarkov(baseCfg({
      upgradeProbabilitySuperToMega: 0,
    }));
    expect(r.probMega).toBeCloseTo(0, 10);
  });
});

describe('MC cross-validation', () => {
  it('MC π_basic matches CF (abs ≤ 0.01 at 200K spins)', () => {
    const cfg = baseCfg();
    const cf = solveMultiLevelWildMarkov(cfg);
    const mc = simulateMultiLevelWildMarkov(cfg, 200_000, 0xdeadbeef);
    expect(Math.abs(cf.probBasic - mc.observedFractionBasic)).toBeLessThan(0.01);
  });
  it('MC E[M] matches CF (rel ≤ 5% at 200K)', () => {
    const cfg = baseCfg();
    const cf = solveMultiLevelWildMarkov(cfg);
    const mc = simulateMultiLevelWildMarkov(cfg, 200_000, 0xcafe1234);
    const rel = Math.abs(cf.expectedMultiplierPerSpin - mc.observedMeanMultiplierPerSpin) /
      cf.expectedMultiplierPerSpin;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[Y] matches CF (rel ≤ 7% at 200K)', () => {
    const cfg = baseCfg();
    const cf = solveMultiLevelWildMarkov(cfg);
    const mc = simulateMultiLevelWildMarkov(cfg, 200_000, 0xbeefcafe);
    const rel = Math.abs(cf.expectedPayoutPerSpin - mc.observedMeanPayoutPerSpin) /
      Math.max(cf.expectedPayoutPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.07);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveMultiLevelWildMarkov(baseCfg());
    const b = solveMultiLevelWildMarkov(baseCfg());
    expect(a.expectedPayoutPerSpin).toBe(b.expectedPayoutPerSpin);
  });
  it('MC same seed → identical', () => {
    const a = simulateMultiLevelWildMarkov(baseCfg(), 1000, 42);
    const b = simulateMultiLevelWildMarkov(baseCfg(), 1000, 42);
    expect(a.observedMeanPayoutPerSpin).toBe(b.observedMeanPayoutPerSpin);
  });
});

describe('industry use-cases', () => {
  it('NetEnt Vikings style: 2-tier (basic + super, no mega)', () => {
    const r = solveMultiLevelWildMarkov({
      landProbability: 0.05,
      upgradeProbabilityBasicToSuper: 0.15,
      upgradeProbabilitySuperToMega: 0, // no mega
      expireProbability: 0.20,
      basicMultiplier: 2,
      superMultiplier: 5,
      megaMultiplier: 5, // unused
      baseWinPmf: [{ value: 0, probability: 0.5 }, { value: 1, probability: 0.5 }],
    });
    expect(r.probMega).toBeCloseTo(0, 10);
    expect(r.probSuper).toBeGreaterThan(0);
  });
  it('Push Mount Magmas style: 3-tier sa aggressive mega multiplier', () => {
    const r = solveMultiLevelWildMarkov({
      landProbability: 0.03,
      upgradeProbabilityBasicToSuper: 0.20,
      upgradeProbabilitySuperToMega: 0.10,
      expireProbability: 0.30,
      basicMultiplier: 2,
      superMultiplier: 10,
      megaMultiplier: 100,
      baseWinPmf: [{ value: 0, probability: 0.6 }, { value: 1, probability: 0.3 }, { value: 10, probability: 0.1 }],
    });
    expect(r.maxMultiplier).toBe(100);
    expect(r.expectedMultiplierPerSpin).toBeGreaterThan(1);
  });
  it('Pragmatic Da Vinci style: high-frequency low-tier wilds', () => {
    const r = solveMultiLevelWildMarkov({
      landProbability: 0.20,
      upgradeProbabilityBasicToSuper: 0.05,
      upgradeProbabilitySuperToMega: 0.02,
      expireProbability: 0.40,
      basicMultiplier: 2,
      superMultiplier: 3,
      megaMultiplier: 5,
      baseWinPmf: [{ value: 0, probability: 0.7 }, { value: 2, probability: 0.3 }],
    });
    expect(r.probBasic).toBeGreaterThan(r.probSuper);
    expect(r.probSuper).toBeGreaterThan(r.probMega);
  });
});
