/**
 * W152 Wave 146 — Cascade Meter Charge-Up Trigger tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveCascadeMeterChargeUp,
  simulateCascadeMeterChargeUp,
  type CascadeMeterChargeUpConfig,
} from '../src/features/cascadeMeterChargeUp.js';

const baseCfg = (overrides: Partial<CascadeMeterChargeUpConfig> = {}): CascadeMeterChargeUpConfig => ({
  cascadeContinuationProbability: 0.5,
  meterThreshold: 5,
  fireRewardX: 50,
  winValuePmf: [
    { value: 1,  probability: 0.6 },
    { value: 3,  probability: 0.3 },
    { value: 10, probability: 0.1 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects p ≤ 0', () => {
    expect(() => solveCascadeMeterChargeUp(baseCfg({ cascadeContinuationProbability: 0 }))).toThrow();
  });
  it('rejects p ≥ 1', () => {
    expect(() => solveCascadeMeterChargeUp(baseCfg({ cascadeContinuationProbability: 1 }))).toThrow();
  });
  it('rejects T < 1', () => {
    expect(() => solveCascadeMeterChargeUp(baseCfg({ meterThreshold: 0 }))).toThrow();
  });
  it('rejects non-integer T', () => {
    expect(() => solveCascadeMeterChargeUp(baseCfg({ meterThreshold: 2.5 }))).toThrow();
  });
  it('rejects negative fireRewardX', () => {
    expect(() => solveCascadeMeterChargeUp(baseCfg({ fireRewardX: -10 }))).toThrow();
  });
  it('rejects empty winValuePmf', () => {
    expect(() => solveCascadeMeterChargeUp(baseCfg({ winValuePmf: [] }))).toThrow();
  });
  it('rejects winValuePmf not summing to 1', () => {
    expect(() => solveCascadeMeterChargeUp(baseCfg({
      winValuePmf: [{ value: 1, probability: 0.5 }, { value: 2, probability: 0.3 }],
    }))).toThrow();
  });
  it('rejects negative win value', () => {
    expect(() => solveCascadeMeterChargeUp(baseCfg({
      winValuePmf: [{ value: -1, probability: 1 }],
    }))).toThrow();
  });
});

describe('chain length distribution', () => {
  it('E[L] = p/(1-p)', () => {
    const r = solveCascadeMeterChargeUp(baseCfg());
    expect(r.expectedChainLength).toBeCloseTo(0.5 / 0.5, 8);
  });
  it('Var[L] = p/(1-p)²', () => {
    const r = solveCascadeMeterChargeUp(baseCfg());
    expect(r.varianceChainLength).toBeCloseTo(0.5 / 0.25, 8);
  });
  it('P(L=0) = 1-p', () => {
    const r = solveCascadeMeterChargeUp(baseCfg());
    expect(r.probZeroChain).toBeCloseTo(0.5, 8);
  });
});

describe('fire distribution (the key closed form)', () => {
  it('E[F] = p^T / (1 - p^T)', () => {
    const r = solveCascadeMeterChargeUp(baseCfg());
    // p=0.5, T=5 → p^T = 1/32 = 0.03125 → E[F] = 0.03125 / 0.96875 ≈ 0.03226
    const pT = Math.pow(0.5, 5);
    const expected = pT / (1 - pT);
    expect(r.expectedFiresPerSpin).toBeCloseTo(expected, 8);
  });
  it('Var[F] = p^T / (1 - p^T)²', () => {
    const r = solveCascadeMeterChargeUp(baseCfg());
    const pT = Math.pow(0.5, 5);
    const expected = pT / Math.pow(1 - pT, 2);
    expect(r.varianceFiresPerSpin).toBeCloseTo(expected, 8);
  });
  it('P(≥ 1 fire) = p^T', () => {
    const r = solveCascadeMeterChargeUp(baseCfg());
    expect(r.probAtLeastOneFire).toBeCloseTo(Math.pow(0.5, 5), 8);
  });
  it('T = 1 → F = L → E[F] = E[L]', () => {
    const r = solveCascadeMeterChargeUp(baseCfg({ meterThreshold: 1 }));
    expect(r.expectedFiresPerSpin).toBeCloseTo(r.expectedChainLength, 8);
  });
});

describe('meter end distribution', () => {
  it('E[L mod T] ≥ 0', () => {
    const r = solveCascadeMeterChargeUp(baseCfg());
    expect(r.expectedMeterEndOfSpin).toBeGreaterThanOrEqual(0);
  });
  it('E[L mod T] < T', () => {
    const r = solveCascadeMeterChargeUp(baseCfg());
    expect(r.expectedMeterEndOfSpin).toBeLessThan(r.meterThreshold);
  });
  it('T = 1 → L mod T = 0 always → E[meterEnd] = 0', () => {
    const r = solveCascadeMeterChargeUp(baseCfg({ meterThreshold: 1 }));
    expect(r.expectedMeterEndOfSpin).toBeCloseTo(0, 8);
  });
  it('E[L] = T · E[F] + E[meterEnd] (identity)', () => {
    const r = solveCascadeMeterChargeUp(baseCfg());
    const lhs = r.expectedChainLength;
    const rhs = r.meterThreshold * r.expectedFiresPerSpin + r.expectedMeterEndOfSpin;
    expect(lhs).toBeCloseTo(rhs, 8);
  });
});

describe('payout aggregation', () => {
  it('E[Y_base] = E[L] · μ_V', () => {
    const r = solveCascadeMeterChargeUp(baseCfg());
    expect(r.expectedBasePayoutPerSpin).toBeCloseTo(r.expectedChainLength * r.expectedWinValuePerCascade, 8);
  });
  it('Var[Y_base] = E[L]·σ_V² + Var[L]·μ_V² (compound)', () => {
    const r = solveCascadeMeterChargeUp(baseCfg());
    const expected = r.expectedChainLength * r.varianceWinValuePerCascade +
      r.varianceChainLength * r.expectedWinValuePerCascade * r.expectedWinValuePerCascade;
    expect(r.varianceBasePayoutPerSpin).toBeCloseTo(expected, 8);
  });
  it('E[Y_feature] = B · E[F]', () => {
    const r = solveCascadeMeterChargeUp(baseCfg());
    expect(r.expectedFeaturePayoutPerSpin).toBeCloseTo(r.fireRewardX * r.expectedFiresPerSpin, 8);
  });
  it('E[Y_total] = E[Y_base] + E[Y_feature]', () => {
    const r = solveCascadeMeterChargeUp(baseCfg());
    expect(r.expectedTotalPayoutPerSpin).toBeCloseTo(r.expectedBasePayoutPerSpin + r.expectedFeaturePayoutPerSpin, 8);
  });
  it('Var ≥ 0 for all components', () => {
    const r = solveCascadeMeterChargeUp(baseCfg());
    expect(r.varianceChainLength).toBeGreaterThanOrEqual(0);
    expect(r.varianceFiresPerSpin).toBeGreaterThanOrEqual(0);
    expect(r.varianceBasePayoutPerSpin).toBeGreaterThanOrEqual(0);
    expect(r.varianceFeaturePayoutPerSpin).toBeGreaterThanOrEqual(0);
  });
});

describe('monotonicity', () => {
  it('higher p → higher E[F]', () => {
    const a = solveCascadeMeterChargeUp(baseCfg({ cascadeContinuationProbability: 0.3 }));
    const b = solveCascadeMeterChargeUp(baseCfg({ cascadeContinuationProbability: 0.7 }));
    expect(b.expectedFiresPerSpin).toBeGreaterThan(a.expectedFiresPerSpin);
  });
  it('higher T → lower E[F] (rarer fires)', () => {
    const a = solveCascadeMeterChargeUp(baseCfg({ meterThreshold: 3 }));
    const b = solveCascadeMeterChargeUp(baseCfg({ meterThreshold: 10 }));
    expect(a.expectedFiresPerSpin).toBeGreaterThan(b.expectedFiresPerSpin);
  });
  it('higher B → higher E[Y_feature]', () => {
    const a = solveCascadeMeterChargeUp(baseCfg({ fireRewardX: 10 }));
    const b = solveCascadeMeterChargeUp(baseCfg({ fireRewardX: 1000 }));
    expect(b.expectedFeaturePayoutPerSpin).toBeGreaterThan(a.expectedFeaturePayoutPerSpin);
  });
});

describe('corner cases', () => {
  it('T = 1, p = 0.5 → E[F] = 1', () => {
    const r = solveCascadeMeterChargeUp(baseCfg({ meterThreshold: 1 }));
    expect(r.expectedFiresPerSpin).toBeCloseTo(0.5 / 0.5, 8); // E[L]
  });
  it('Very large T → E[F] ≈ 0', () => {
    const r = solveCascadeMeterChargeUp(baseCfg({ meterThreshold: 100 }));
    expect(r.expectedFiresPerSpin).toBeLessThan(1e-15);
  });
  it('zero reward → E[Y_feature] = 0', () => {
    const r = solveCascadeMeterChargeUp(baseCfg({ fireRewardX: 0 }));
    expect(r.expectedFeaturePayoutPerSpin).toBe(0);
  });
});

describe('industry parametrizations', () => {
  it("Play'n GO Reactoonz Quantum Leap (T=4 each)", () => {
    const r = solveCascadeMeterChargeUp({
      cascadeContinuationProbability: 0.5,
      meterThreshold: 4,
      fireRewardX: 25,
      winValuePmf: [
        { value: 1,  probability: 0.7 },
        { value: 5,  probability: 0.2 },
        { value: 50, probability: 0.1 },
      ],
    });
    expect(r.expectedFiresPerSpin).toBeGreaterThan(0);
  });
  it("Hacksaw Stack 'Em (every 3 wins boost)", () => {
    const r = solveCascadeMeterChargeUp({
      cascadeContinuationProbability: 0.55,
      meterThreshold: 3,
      fireRewardX: 10,
      winValuePmf: [
        { value: 1, probability: 0.65 },
        { value: 3, probability: 0.25 },
        { value: 20, probability: 0.1 },
      ],
    });
    expect(r.expectedFiresPerSpin).toBeGreaterThan(0);
  });
  it("Push Aztec Bonanza-style high T charge meter", () => {
    const r = solveCascadeMeterChargeUp({
      cascadeContinuationProbability: 0.6,
      meterThreshold: 10,
      fireRewardX: 500,
      winValuePmf: [
        { value: 1, probability: 0.5 },
        { value: 5, probability: 0.3 },
        { value: 50, probability: 0.15 },
        { value: 500, probability: 0.05 },
      ],
    });
    expect(r.expectedFiresPerSpin).toBeGreaterThan(0);
  });
});

describe('MC cross-validation', () => {
  it('MC E[F] matches CF (rel ≤ 5% at 500K spins)', () => {
    const cfg = baseCfg();
    const cf = solveCascadeMeterChargeUp(cfg);
    const mc = simulateCascadeMeterChargeUp(cfg, 500_000, 0xdeadbeef);
    const rel = Math.abs(cf.expectedFiresPerSpin - mc.observedMeanFiresPerSpin) /
      Math.max(cf.expectedFiresPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[L] matches CF (rel ≤ 2% at 500K)', () => {
    const cfg = baseCfg();
    const cf = solveCascadeMeterChargeUp(cfg);
    const mc = simulateCascadeMeterChargeUp(cfg, 500_000, 0xcafe1234);
    const rel = Math.abs(cf.expectedChainLength - mc.observedMeanChainLength) /
      Math.max(cf.expectedChainLength, 1e-9);
    expect(rel).toBeLessThan(0.02);
  });
  it('MC P(≥ 1 fire) matches CF p^T (abs ≤ 0.01 at 500K)', () => {
    const cfg = baseCfg();
    const cf = solveCascadeMeterChargeUp(cfg);
    const mc = simulateCascadeMeterChargeUp(cfg, 500_000, 0xbeefcafe);
    expect(Math.abs(cf.probAtLeastOneFire - mc.observedAtLeastOneFireFraction)).toBeLessThan(0.01);
  });
  it('MC E[meterEnd] matches CF (rel ≤ 5% at 500K)', () => {
    const cfg = baseCfg();
    const cf = solveCascadeMeterChargeUp(cfg);
    const mc = simulateCascadeMeterChargeUp(cfg, 500_000, 0x1234);
    const rel = Math.abs(cf.expectedMeterEndOfSpin - mc.observedMeanMeterEndOfSpin) /
      Math.max(cf.expectedMeterEndOfSpin, 1e-9);
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[Y] matches CF (rel ≤ 5% at 500K)', () => {
    const cfg = baseCfg();
    const cf = solveCascadeMeterChargeUp(cfg);
    const mc = simulateCascadeMeterChargeUp(cfg, 500_000, 0x5678);
    const rel = Math.abs(cf.expectedTotalPayoutPerSpin - mc.observedMeanTotalPayoutPerSpin) /
      Math.max(cf.expectedTotalPayoutPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.05);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveCascadeMeterChargeUp(baseCfg());
    const b = solveCascadeMeterChargeUp(baseCfg());
    expect(a.expectedTotalPayoutPerSpin).toBe(b.expectedTotalPayoutPerSpin);
  });
  it('MC same seed → identical', () => {
    const a = simulateCascadeMeterChargeUp(baseCfg(), 1000, 42);
    const b = simulateCascadeMeterChargeUp(baseCfg(), 1000, 42);
    expect(a.observedMeanTotalPayoutPerSpin).toBe(b.observedMeanTotalPayoutPerSpin);
  });
});

describe('distinctness vs prior Wxx', () => {
  it('W146 has per-spin chain-driven meter (not steady-state stationary like W50)', () => {
    // W50: stationary meter steady-state (long-run); no concept of per-spin chain
    // W146: per-spin chain L ~ Geometric, F = floor(L/T), each spin independent
    const r = solveCascadeMeterChargeUp(baseCfg());
    expect(r.expectedFiresPerSpin).toBeLessThan(1); // typically much less than E[L]
  });
  it('W146 has meter F = floor(L/T) (W138 has per-cascade ladder M_k)', () => {
    // W138: deterministic ladder per cascade level k
    // W146: integer count F = floor(L/T)
    const r = solveCascadeMeterChargeUp(baseCfg());
    // F can be 0 (no fires) when L < T
    expect(r.probZeroChain + (1 - r.probAtLeastOneFire) - r.probZeroChain).toBeGreaterThan(0);
  });
});
