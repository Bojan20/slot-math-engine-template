/**
 * W152 Wave 138 — Tumble Multiplier with Cap tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveTumbleMultiplierWithCap,
  simulateTumbleMultiplierWithCap,
  type TumbleMultiplierWithCapConfig,
} from '../src/features/tumbleMultiplierWithCap.js';

const baseCfg = (overrides: Partial<TumbleMultiplierWithCapConfig> = {}): TumbleMultiplierWithCapConfig => ({
  winContinuationProbability: 0.4,
  baseMultiplier: 1,
  multiplierStep: 1,
  maximumMultiplier: 5, // Gonzo's Quest style cap
  winValuePmf: [
    { value: 1,  probability: 0.6 },
    { value: 5,  probability: 0.3 },
    { value: 25, probability: 0.1 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects p ≤ 0', () => {
    expect(() => solveTumbleMultiplierWithCap(baseCfg({ winContinuationProbability: 0 }))).toThrow();
  });
  it('rejects p ≥ 1', () => {
    expect(() => solveTumbleMultiplierWithCap(baseCfg({ winContinuationProbability: 1 }))).toThrow();
  });
  it('rejects baseMultiplier < 1', () => {
    expect(() => solveTumbleMultiplierWithCap(baseCfg({ baseMultiplier: 0.5 }))).toThrow();
  });
  it('rejects multiplierStep < 0', () => {
    expect(() => solveTumbleMultiplierWithCap(baseCfg({ multiplierStep: -1 }))).toThrow();
  });
  it('rejects maximumMultiplier < base', () => {
    expect(() => solveTumbleMultiplierWithCap(baseCfg({
      baseMultiplier: 5,
      maximumMultiplier: 3,
    }))).toThrow();
  });
  it('rejects winValuePmf not summing to 1', () => {
    expect(() => solveTumbleMultiplierWithCap(baseCfg({
      winValuePmf: [{ value: 1, probability: 0.5 }, { value: 2, probability: 0.3 }],
    }))).toThrow();
  });
  it('rejects bad chainLengthCap', () => {
    expect(() => solveTumbleMultiplierWithCap(baseCfg({ chainLengthCap: 0 }))).toThrow();
  });
});

describe('chain length distribution', () => {
  it('E[L] = p/(1-p)', () => {
    const r = solveTumbleMultiplierWithCap(baseCfg());
    expect(r.expectedChainLength).toBeCloseTo(0.4 / 0.6, 8);
  });
  it('probZeroChain = 1-p', () => {
    const r = solveTumbleMultiplierWithCap(baseCfg());
    expect(r.probZeroChain).toBeCloseTo(0.6, 8);
  });
});

describe('multiplier ladder + cap', () => {
  it('M_1 = base, M_2 = base+step, ..., capped at M_max', () => {
    const r = solveTumbleMultiplierWithCap(baseCfg());
    // base=1, step=1, M_max=5 → M = [1, 2, 3, 4, 5, 5, 5, ...]
    expect(r.multiplierAtCascadeLevel[0]).toBe(1);
    expect(r.multiplierAtCascadeLevel[1]).toBe(2);
    expect(r.multiplierAtCascadeLevel[4]).toBe(5);
  });
  it('k* = smallest k where M_k = M_max', () => {
    const r = solveTumbleMultiplierWithCap(baseCfg());
    // base=1, step=1, M_max=5: M_5 = 5 → k*=5
    expect(r.cascadesToCap).toBe(5);
  });
  it('step = 0 → constant base, k* = 1', () => {
    const r = solveTumbleMultiplierWithCap(baseCfg({
      multiplierStep: 0,
      baseMultiplier: 3,
      maximumMultiplier: 3,
    }));
    expect(r.cascadesToCap).toBe(1);
  });
});

describe('expected payout', () => {
  it('E[Y] = E[V] · Σ M_k · p^k positive', () => {
    const r = solveTumbleMultiplierWithCap(baseCfg());
    expect(r.expectedPayoutPerSpin).toBeGreaterThan(0);
  });
  it('Var[Y] ≥ 0', () => {
    const r = solveTumbleMultiplierWithCap(baseCfg());
    expect(r.variancePayoutPerSpin).toBeGreaterThanOrEqual(0);
  });
  it('expectedRamp + expectedCappedTail = E[Y]', () => {
    const r = solveTumbleMultiplierWithCap(baseCfg());
    expect(r.expectedRampPayoutContribution + r.expectedCappedTailContribution).toBeCloseTo(r.expectedPayoutPerSpin, 6);
  });
  it('higher M_max → higher E[Y]', () => {
    const a = solveTumbleMultiplierWithCap(baseCfg({ maximumMultiplier: 5 }));
    const b = solveTumbleMultiplierWithCap(baseCfg({ maximumMultiplier: 100 }));
    expect(b.expectedPayoutPerSpin).toBeGreaterThan(a.expectedPayoutPerSpin);
  });
  it('higher p → higher E[Y]', () => {
    const a = solveTumbleMultiplierWithCap(baseCfg({ winContinuationProbability: 0.2 }));
    const b = solveTumbleMultiplierWithCap(baseCfg({ winContinuationProbability: 0.7 }));
    expect(b.expectedPayoutPerSpin).toBeGreaterThan(a.expectedPayoutPerSpin);
  });
});

describe('cap behavior', () => {
  it('M_max = base → constant multiplier (everything cap, no ramp)', () => {
    const r = solveTumbleMultiplierWithCap(baseCfg({
      baseMultiplier: 3,
      multiplierStep: 0,
      maximumMultiplier: 3,
    }));
    // Everything goes into the saturated tail (since cap hits at k=1).
    // Ramp portion uses k < k*=1 → empty range → ramp = 0; tail = full.
    expect(r.expectedRampPayoutContribution).toBeCloseTo(0, 6);
    expect(r.expectedCappedTailContribution).toBeCloseTo(r.expectedPayoutPerSpin, 6);
  });
  it('M_max = ∞-ish (huge) → no cap effect, tail term tiny', () => {
    const r = solveTumbleMultiplierWithCap(baseCfg({
      maximumMultiplier: 1e6, // effectively no cap
    }));
    // Most of E[Y] should come from ramp; tail (M_k = M_max region) very small
    expect(r.expectedRampPayoutContribution).toBeGreaterThan(r.expectedCappedTailContribution);
  });
});

describe('industry parametrizations', () => {
  it("Gonzo's Quest style: 1×→2×→3×→4×→5× cap", () => {
    const r = solveTumbleMultiplierWithCap(baseCfg());
    expect(r.maximumMultiplier).toBe(5);
    expect(r.multiplierAtCascadeLevel[4]).toBe(5);
    expect(r.multiplierAtCascadeLevel[5]).toBe(5); // capped
  });
  it('BTG Bonanza FS style: 1×..10× cap', () => {
    const r = solveTumbleMultiplierWithCap(baseCfg({
      maximumMultiplier: 10,
    }));
    expect(r.cascadesToCap).toBe(10);
    expect(r.maximumMultiplier).toBe(10);
  });
  it('Sweet Bonanza Xmas: 1×..100× cap, geometric-like skip', () => {
    const r = solveTumbleMultiplierWithCap(baseCfg({
      baseMultiplier: 2,
      multiplierStep: 2,
      maximumMultiplier: 100,
      winContinuationProbability: 0.5,
    }));
    // base=2, step=2, max=100 → k* = ceil((100-2)/2)+1 = 50
    expect(r.cascadesToCap).toBe(50);
  });
});

describe('MC cross-validation', () => {
  it('MC E[Y] matches CF (rel ≤ 5% at 200K spins)', () => {
    const cfg = baseCfg();
    const cf = solveTumbleMultiplierWithCap(cfg);
    const mc = simulateTumbleMultiplierWithCap(cfg, 200_000, 0xdeadbeef);
    const rel = Math.abs(cf.expectedPayoutPerSpin - mc.observedMeanPayoutPerSpin) /
      Math.max(cf.expectedPayoutPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[L] matches CF (rel ≤ 3% at 200K)', () => {
    const cfg = baseCfg();
    const cf = solveTumbleMultiplierWithCap(cfg);
    const mc = simulateTumbleMultiplierWithCap(cfg, 200_000, 0xcafe1234);
    const rel = Math.abs(cf.expectedChainLength - mc.observedMeanChainLength) / cf.expectedChainLength;
    expect(rel).toBeLessThan(0.03);
  });
  it('MC P(L=0) matches CF (abs ≤ 0.01)', () => {
    const cfg = baseCfg();
    const cf = solveTumbleMultiplierWithCap(cfg);
    const mc = simulateTumbleMultiplierWithCap(cfg, 200_000, 0xbeefcafe);
    expect(Math.abs(cf.probZeroChain - mc.observedZeroChainFraction)).toBeLessThan(0.01);
  });
  it('MC observed max multiplier never exceeds M_max', () => {
    const cfg = baseCfg();
    const mc = simulateTumbleMultiplierWithCap(cfg, 50_000, 0x1234);
    expect(mc.observedMaxMultiplierSeen).toBeLessThanOrEqual(5);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveTumbleMultiplierWithCap(baseCfg());
    const b = solveTumbleMultiplierWithCap(baseCfg());
    expect(a.expectedPayoutPerSpin).toBe(b.expectedPayoutPerSpin);
  });
  it('MC same seed → identical', () => {
    const a = simulateTumbleMultiplierWithCap(baseCfg(), 1000, 42);
    const b = simulateTumbleMultiplierWithCap(baseCfg(), 1000, 42);
    expect(a.observedMeanPayoutPerSpin).toBe(b.observedMeanPayoutPerSpin);
  });
});

describe('truncation', () => {
  it('truncationProbabilityRemaining tiny for default cap', () => {
    const r = solveTumbleMultiplierWithCap(baseCfg());
    expect(r.truncationProbabilityRemaining).toBeLessThan(1e-100);
  });
});

describe('distinctness vs W121', () => {
  // W121 has no cap → tail grows linearly within ramp regime → unbounded
  // W138 has cap → tail = M_max constant after k*
  it('W138 with M_max=base (no ladder) reduces to E[Y]=E[V]·base·E[L]', () => {
    const r = solveTumbleMultiplierWithCap(baseCfg({
      baseMultiplier: 3,
      multiplierStep: 0,
      maximumMultiplier: 3,
    }));
    // E[V] = 1·0.6 + 5·0.3 + 25·0.1 = 4.6
    // E[L] = 0.4/0.6
    // E[Y] = 4.6·3·(0.4/0.6) = 9.2
    expect(r.expectedPayoutPerSpin).toBeCloseTo(9.2, 4);
  });
});
