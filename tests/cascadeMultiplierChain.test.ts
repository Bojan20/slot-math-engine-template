/**
 * W152 Wave 121 — Cascade Multiplier Chain tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveCascadeMultiplierChain,
  simulateCascadeMultiplierChain,
  type CascadeMultiplierChainConfig,
} from '../src/features/cascadeMultiplierChain.js';

const baseCfg = (overrides: Partial<CascadeMultiplierChainConfig> = {}): CascadeMultiplierChainConfig => ({
  winContinuationProbability: 0.4,
  baseMultiplier: 1,
  growthMode: 'linear',
  linearStep: 1,
  winValuePmf: [
    { value: 1, probability: 0.6 },
    { value: 5, probability: 0.3 },
    { value: 25, probability: 0.1 },
  ],
  chainLengthCap: 100,
  ...overrides,
});

describe('validation', () => {
  it('rejects p ≤ 0', () => {
    expect(() => solveCascadeMultiplierChain(baseCfg({ winContinuationProbability: 0 }))).toThrow();
  });
  it('rejects p ≥ 1 (infinite expected length)', () => {
    expect(() => solveCascadeMultiplierChain(baseCfg({ winContinuationProbability: 1 }))).toThrow();
  });
  it('rejects baseMultiplier < 1', () => {
    expect(() => solveCascadeMultiplierChain(baseCfg({ baseMultiplier: 0.5 }))).toThrow();
  });
  it('rejects bad growthMode', () => {
    expect(() => solveCascadeMultiplierChain({ ...baseCfg(), growthMode: 'cubic' as never })).toThrow();
  });
  it('rejects negative linearStep', () => {
    expect(() => solveCascadeMultiplierChain(baseCfg({ linearStep: -1 }))).toThrow();
  });
  it('rejects geometricRatio < 1', () => {
    expect(() => solveCascadeMultiplierChain(baseCfg({
      growthMode: 'geometric',
      geometricRatio: 0.5,
    }))).toThrow();
  });
  it('rejects r·p ≥ 1 (geometric divergence)', () => {
    expect(() => solveCascadeMultiplierChain(baseCfg({
      growthMode: 'geometric',
      geometricRatio: 3,
      winContinuationProbability: 0.4, // 3*0.4 = 1.2 ≥ 1
    }))).toThrow();
  });
  it('rejects winValuePmf not summing to 1', () => {
    expect(() => solveCascadeMultiplierChain(baseCfg({
      winValuePmf: [{ value: 1, probability: 0.5 }, { value: 2, probability: 0.3 }],
    }))).toThrow();
  });
  it('rejects bad chainLengthCap', () => {
    expect(() => solveCascadeMultiplierChain(baseCfg({ chainLengthCap: 0 }))).toThrow();
  });
});

describe('chain length distribution', () => {
  it('E[L] = p/(1-p)', () => {
    const r = solveCascadeMultiplierChain(baseCfg());
    expect(r.expectedChainLength).toBeCloseTo(0.4 / 0.6, 8);
  });
  it('Var[L] = p/(1-p)²', () => {
    const r = solveCascadeMultiplierChain(baseCfg());
    expect(r.varianceChainLength).toBeCloseTo(0.4 / Math.pow(0.6, 2), 8);
  });
  it('P(L=0) = 1-p', () => {
    const r = solveCascadeMultiplierChain(baseCfg());
    expect(r.probZeroChain).toBeCloseTo(0.6, 8);
  });
  it('P(L ≥ k) = p^k decay', () => {
    const r = solveCascadeMultiplierChain(baseCfg());
    expect(r.probReachLength[0]).toBe(1);
    expect(r.probReachLength[1]).toBeCloseTo(0.4, 8);
    expect(r.probReachLength[5]).toBeCloseTo(Math.pow(0.4, 5), 8);
  });
  it('higher p → higher E[L]', () => {
    const a = solveCascadeMultiplierChain(baseCfg({ winContinuationProbability: 0.2 }));
    const b = solveCascadeMultiplierChain(baseCfg({ winContinuationProbability: 0.6 }));
    expect(b.expectedChainLength).toBeGreaterThan(a.expectedChainLength);
  });
});

describe('multiplier ladder', () => {
  it('linear M_k = base + (k-1)·step', () => {
    const r = solveCascadeMultiplierChain(baseCfg());
    expect(r.multipliersByCascadeLevel[0]).toBe(1);
    expect(r.multipliersByCascadeLevel[1]).toBe(2);
    expect(r.multipliersByCascadeLevel[9]).toBe(10);
  });
  it('geometric M_k = base · ratio^(k-1)', () => {
    const r = solveCascadeMultiplierChain(baseCfg({
      growthMode: 'geometric',
      geometricRatio: 2,
      winContinuationProbability: 0.3, // r·p = 0.6 < 1 OK
    }));
    expect(r.multipliersByCascadeLevel[0]).toBe(1);
    expect(r.multipliersByCascadeLevel[1]).toBe(2);
    expect(r.multipliersByCascadeLevel[5]).toBe(32);
  });
});

describe('win value moments', () => {
  it('E[V] computed correctly', () => {
    const r = solveCascadeMultiplierChain(baseCfg());
    // E[V] = 1·0.6 + 5·0.3 + 25·0.1 = 0.6 + 1.5 + 2.5 = 4.6
    expect(r.expectedWinValuePerCascade).toBeCloseTo(4.6, 8);
  });
  it('Var[V] computed correctly', () => {
    const r = solveCascadeMultiplierChain(baseCfg());
    // E[V²] = 1·0.6 + 25·0.3 + 625·0.1 = 0.6 + 7.5 + 62.5 = 70.6
    // Var[V] = 70.6 - 4.6² = 70.6 - 21.16 = 49.44
    expect(r.varianceWinValuePerCascade).toBeCloseTo(49.44, 4);
  });
});

describe('payout decomposition', () => {
  it('E[Y] = E[V] · Σ M_k · p^k (closed-form)', () => {
    const r = solveCascadeMultiplierChain(baseCfg());
    // p=0.4, linear M=[1,2,3,4,5,...], E[V]=4.6
    // S₁ = p/(1-p) = 0.4/0.6 = 0.6667
    // S₂ = p²/(1-p)² = 0.16/0.36 = 0.4444
    // E[Y] = 4.6 · (1·0.6667 + 1·0.4444) = 4.6 · 1.1111 = 5.1111
    // Approximate, since truncated at cap=100 but tail negligible
    expect(r.expectedPayoutPerSpin).toBeCloseTo(4.6 * (1 * (0.4 / 0.6) + 1 * (0.16 / 0.36)), 4);
  });
  it('Var[Y] ≥ 0', () => {
    const r = solveCascadeMultiplierChain(baseCfg());
    expect(r.variancePayoutPerSpin).toBeGreaterThan(0);
  });
  it('higher base → higher E[Y]', () => {
    const a = solveCascadeMultiplierChain(baseCfg({ baseMultiplier: 1 }));
    const b = solveCascadeMultiplierChain(baseCfg({ baseMultiplier: 5 }));
    expect(b.expectedPayoutPerSpin).toBeGreaterThan(a.expectedPayoutPerSpin);
  });
  it('higher step → higher E[Y]', () => {
    const a = solveCascadeMultiplierChain(baseCfg({ linearStep: 0 }));
    const b = solveCascadeMultiplierChain(baseCfg({ linearStep: 3 }));
    expect(b.expectedPayoutPerSpin).toBeGreaterThan(a.expectedPayoutPerSpin);
  });
});

describe('truncation', () => {
  it('truncation tail prob = p^(cap+1)', () => {
    const r = solveCascadeMultiplierChain(baseCfg({ chainLengthCap: 10 }));
    expect(r.truncationProbabilityRemaining).toBeCloseTo(Math.pow(0.4, 11), 8);
  });
  it('large cap → near-zero truncation tail', () => {
    const r = solveCascadeMultiplierChain(baseCfg({ chainLengthCap: 50 }));
    expect(r.truncationProbabilityRemaining).toBeLessThan(1e-15);
  });
});

describe('MC cross-validation', () => {
  it('MC E[Y] matches CF (rel ≤ 5% at 200K spins)', () => {
    const cfg = baseCfg();
    const cf = solveCascadeMultiplierChain(cfg);
    const mc = simulateCascadeMultiplierChain(cfg, 200_000, 0xdeadbeef);
    const rel = Math.abs(cf.expectedPayoutPerSpin - mc.observedMeanPayoutPerSpin) /
      Math.max(cf.expectedPayoutPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[L] matches CF (rel ≤ 3% at 200K)', () => {
    const cfg = baseCfg();
    const cf = solveCascadeMultiplierChain(cfg);
    const mc = simulateCascadeMultiplierChain(cfg, 200_000, 0xcafe1234);
    const rel = Math.abs(cf.expectedChainLength - mc.observedMeanChainLength) / cf.expectedChainLength;
    expect(rel).toBeLessThan(0.03);
  });
  it('MC P(L=0) matches CF (abs ≤ 0.01 at 200K)', () => {
    const cfg = baseCfg();
    const cf = solveCascadeMultiplierChain(cfg);
    const mc = simulateCascadeMultiplierChain(cfg, 200_000, 0xbeefcafe);
    expect(Math.abs(cf.probZeroChain - mc.observedZeroChainFraction)).toBeLessThan(0.01);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveCascadeMultiplierChain(baseCfg());
    const b = solveCascadeMultiplierChain(baseCfg());
    expect(a.expectedPayoutPerSpin).toBe(b.expectedPayoutPerSpin);
  });
  it('MC same seed → identical', () => {
    const a = simulateCascadeMultiplierChain(baseCfg(), 1000, 42);
    const b = simulateCascadeMultiplierChain(baseCfg(), 1000, 42);
    expect(a.observedMeanPayoutPerSpin).toBe(b.observedMeanPayoutPerSpin);
  });
});

describe('industry use-cases', () => {
  it('Quickspin Reactor Wilds style: high p=0.6 linear +1', () => {
    const r = solveCascadeMultiplierChain(baseCfg({
      winContinuationProbability: 0.6,
      linearStep: 1,
    }));
    expect(r.expectedChainLength).toBeCloseTo(0.6 / 0.4, 8); // 1.5
  });
  it('Push Token of Life style: aggressive geometric ratio=1.5', () => {
    const r = solveCascadeMultiplierChain(baseCfg({
      winContinuationProbability: 0.5,
      growthMode: 'geometric',
      geometricRatio: 1.5, // r·p = 0.75 < 1 OK
    }));
    expect(r.expectedPayoutPerSpin).toBeGreaterThan(0);
  });
  it('Step 0 (constant base) → reduces to E[V]·base·E[L]', () => {
    const r = solveCascadeMultiplierChain(baseCfg({
      baseMultiplier: 3,
      linearStep: 0,
    }));
    // E[Y] = E[V]·base·Σ p^k = E[V]·base·p/(1-p) = 4.6·3·(0.4/0.6) = 9.2
    expect(r.expectedPayoutPerSpin).toBeCloseTo(4.6 * 3 * (0.4 / 0.6), 4);
  });
});
