/**
 * W152 Wave 125 — Bi-Directional Line Pay Aggregator tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveBiDirectionalLinePay,
  simulateBiDirectionalLinePay,
  type BiDirectionalLinePayConfig,
} from '../src/features/biDirectionalLinePay.js';

const baseCfg = (overrides: Partial<BiDirectionalLinePayConfig> = {}): BiDirectionalLinePayConfig => ({
  reelCount: 5,
  minMatchLength: 3,
  symbols: [
    { label: 'low_A',  density: 0.20, paytable: [0, 0, 5,  20,  50] },
    { label: 'mid_B',  density: 0.15, paytable: [0, 0, 10, 50,  200] },
    { label: 'high_C', density: 0.10, paytable: [0, 0, 25, 100, 500] },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects reelCount < 2', () => {
    expect(() => solveBiDirectionalLinePay(baseCfg({ reelCount: 1 }))).toThrow();
  });
  it('rejects non-integer reelCount', () => {
    expect(() => solveBiDirectionalLinePay(baseCfg({ reelCount: 5.5 }))).toThrow();
  });
  it('rejects minMatchLength out of range', () => {
    expect(() => solveBiDirectionalLinePay(baseCfg({ minMatchLength: 0 }))).toThrow();
    expect(() => solveBiDirectionalLinePay(baseCfg({ minMatchLength: 6 }))).toThrow();
  });
  it('rejects empty symbols', () => {
    expect(() => solveBiDirectionalLinePay(baseCfg({ symbols: [] }))).toThrow();
  });
  it('rejects symbol density ≤ 0', () => {
    expect(() => solveBiDirectionalLinePay(baseCfg({
      symbols: [{ label: 'x', density: 0, paytable: [0,0,5,20,50] }],
    }))).toThrow();
  });
  it('rejects density > 1', () => {
    expect(() => solveBiDirectionalLinePay(baseCfg({
      symbols: [{ label: 'x', density: 1.5, paytable: [0,0,5,20,50] }],
    }))).toThrow();
  });
  it('rejects paytable length mismatch', () => {
    expect(() => solveBiDirectionalLinePay(baseCfg({
      symbols: [{ label: 'x', density: 0.1, paytable: [5, 20] }],
    }))).toThrow();
  });
  it('rejects negative paytable entry', () => {
    expect(() => solveBiDirectionalLinePay(baseCfg({
      symbols: [{ label: 'x', density: 0.1, paytable: [0, 0, 5, -10, 50] }],
    }))).toThrow();
  });
  it('rejects duplicate label', () => {
    expect(() => solveBiDirectionalLinePay(baseCfg({
      symbols: [
        { label: 'a', density: 0.1, paytable: [0,0,5,20,50] },
        { label: 'a', density: 0.2, paytable: [0,0,5,20,50] },
      ],
    }))).toThrow();
  });
  it('rejects unreasonable total density (> 1.5)', () => {
    expect(() => solveBiDirectionalLinePay(baseCfg({
      symbols: [
        { label: 'a', density: 0.8, paytable: [0,0,5,20,50] },
        { label: 'b', density: 0.8, paytable: [0,0,5,20,50] },
      ],
    }))).toThrow();
  });
});

describe('per-symbol probabilities', () => {
  it('P(L_k) = q^k · (1-q) for k < N', () => {
    const r = solveBiDirectionalLinePay(baseCfg());
    const s = r.perSymbol[0]; // q = 0.2
    // P(L_3) = 0.2^3 · 0.8 = 0.008 · 0.8 = 0.0064
    expect(s.probLeftAtK[3]).toBeCloseTo(Math.pow(0.2, 3) * 0.8, 8);
    // P(L_4) = 0.2^4 · 0.8 = 0.0016 · 0.8 = 0.00128
    expect(s.probLeftAtK[4]).toBeCloseTo(Math.pow(0.2, 4) * 0.8, 8);
  });
  it('P(L_N) = q^N (no stopper)', () => {
    const r = solveBiDirectionalLinePay(baseCfg());
    const s = r.perSymbol[0]; // q = 0.2, N = 5
    expect(s.probLeftAtK[5]).toBeCloseTo(Math.pow(0.2, 5), 8);
  });
  it('P(L_k) = P(R_k) by symmetry', () => {
    const r = solveBiDirectionalLinePay(baseCfg());
    for (const s of r.perSymbol) {
      for (let k = 3; k <= 5; k++) {
        expect(s.probLeftAtK[k]).toBeCloseTo(s.probRightAtK[k], 8);
      }
    }
  });
  it('P(L_k) below kMin = 0', () => {
    const r = solveBiDirectionalLinePay(baseCfg());
    expect(r.perSymbol[0].probLeftAtK[0]).toBe(0);
    expect(r.perSymbol[0].probLeftAtK[1]).toBe(0);
    expect(r.perSymbol[0].probLeftAtK[2]).toBe(0);
  });
});

describe('per-symbol expected pays', () => {
  it('E[pay_L per symbol] = Σ paytable[k]·P(L_k)', () => {
    const r = solveBiDirectionalLinePay(baseCfg());
    const s = r.perSymbol[0]; // low_A, q=0.2, paytable=[0,0,5,20,50]
    // E[L] = 5·P(L_3) + 20·P(L_4) + 50·P(L_5)
    //      = 5·0.0064 + 20·0.00128 + 50·0.00032
    //      = 0.032 + 0.0256 + 0.016 = 0.0736
    const expected = 5 * 0.0064 + 20 * 0.00128 + 50 * 0.00032;
    expect(s.expectedPayLeft).toBeCloseTo(expected, 6);
  });
  it('E[pay_BD] = E[L] + E[R] − paytable[N]·q^N', () => {
    const r = solveBiDirectionalLinePay(baseCfg());
    const s = r.perSymbol[0];
    expect(s.expectedPayBidirectional).toBeCloseTo(
      s.expectedPayLeft + s.expectedPayRight - 50 * Math.pow(0.2, 5),
      8,
    );
  });
  it('E[L] = E[R] by symmetry', () => {
    const r = solveBiDirectionalLinePay(baseCfg());
    for (const s of r.perSymbol) {
      expect(s.expectedPayLeft).toBeCloseTo(s.expectedPayRight, 8);
    }
  });
  it('E[pay_BD] < 2·E[L] (N-match deducted)', () => {
    const r = solveBiDirectionalLinePay(baseCfg());
    const s = r.perSymbol[0]; // q=0.2
    expect(s.expectedPayBidirectional).toBeLessThan(2.0 * s.expectedPayLeft);
    expect(s.expectedPayBidirectional).toBeGreaterThan(s.expectedPayLeft);
  });
});

describe('hit frequency', () => {
  it('hf_L = Σ_k P(L_k)', () => {
    const r = solveBiDirectionalLinePay(baseCfg());
    const s = r.perSymbol[0];
    const expected = s.probLeftAtK[3] + s.probLeftAtK[4] + s.probLeftAtK[5];
    expect(s.hitFrequencyLeft).toBeCloseTo(expected, 8);
  });
  it('hf_BD = hf_L + hf_R − P(L_N)', () => {
    const r = solveBiDirectionalLinePay(baseCfg());
    const s = r.perSymbol[0];
    expect(s.hitFrequencyBidirectional).toBeCloseTo(
      s.hitFrequencyLeft + s.hitFrequencyRight - s.probLeftAtK[5],
      8,
    );
  });
});

describe('uplift', () => {
  it('bidirectionalUpliftRatio in (1, 2) range (paytable[N] deducted)', () => {
    const r = solveBiDirectionalLinePay(baseCfg());
    expect(r.bidirectionalUpliftRatio).toBeGreaterThan(1.5);
    expect(r.bidirectionalUpliftRatio).toBeLessThan(2.0);
  });
  it('high density → uplift drops (more N-matches counted twice and deducted)', () => {
    const a = solveBiDirectionalLinePay(baseCfg({
      symbols: [{ label: 's', density: 0.1, paytable: [0,0,5,20,50] }],
    }));
    const b = solveBiDirectionalLinePay(baseCfg({
      symbols: [{ label: 's', density: 0.9, paytable: [0,0,5,20,50] }],
    }));
    expect(a.bidirectionalUpliftRatio).toBeGreaterThan(b.bidirectionalUpliftRatio);
  });
});

describe('aggregate totals', () => {
  it('total_pay = Σ per-symbol pays', () => {
    const r = solveBiDirectionalLinePay(baseCfg());
    let sumL = 0;
    let sumBD = 0;
    for (const s of r.perSymbol) {
      sumL += s.expectedPayLeft;
      sumBD += s.expectedPayBidirectional;
    }
    expect(r.totalExpectedPayLeft).toBeCloseTo(sumL, 8);
    expect(r.totalExpectedPayBidirectional).toBeCloseTo(sumBD, 8);
  });
  it('variance ≥ 0', () => {
    const r = solveBiDirectionalLinePay(baseCfg());
    expect(r.varianceBidirectional).toBeGreaterThan(0);
  });
});

describe('MC cross-validation', () => {
  it('MC E[pay_L] matches CF (rel ≤ 10% at 100K spins)', () => {
    const cfg = baseCfg();
    const cf = solveBiDirectionalLinePay(cfg);
    const mc = simulateBiDirectionalLinePay(cfg, 100_000, 0xdeadbeef);
    const rel = Math.abs(cf.totalExpectedPayLeft - mc.observedTotalPayLeft) /
      Math.max(cf.totalExpectedPayLeft, 1e-9);
    expect(rel).toBeLessThan(0.10);
  });
  it('MC E[pay_BD] matches CF (rel ≤ 10% at 100K)', () => {
    const cfg = baseCfg();
    const cf = solveBiDirectionalLinePay(cfg);
    const mc = simulateBiDirectionalLinePay(cfg, 100_000, 0xcafe1234);
    const rel = Math.abs(cf.totalExpectedPayBidirectional - mc.observedTotalPayBidirectional) /
      Math.max(cf.totalExpectedPayBidirectional, 1e-9);
    expect(rel).toBeLessThan(0.10);
  });
  it('MC uplift ratio ≈ CF uplift (rel ≤ 5%)', () => {
    const cfg = baseCfg();
    const cf = solveBiDirectionalLinePay(cfg);
    const mc = simulateBiDirectionalLinePay(cfg, 200_000, 0xbeefcafe);
    const mcRatio = mc.observedTotalPayBidirectional / Math.max(mc.observedTotalPayLeft, 1e-9);
    const rel = Math.abs(cf.bidirectionalUpliftRatio - mcRatio) / cf.bidirectionalUpliftRatio;
    expect(rel).toBeLessThan(0.05);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveBiDirectionalLinePay(baseCfg());
    const b = solveBiDirectionalLinePay(baseCfg());
    expect(a.totalExpectedPayBidirectional).toBe(b.totalExpectedPayBidirectional);
  });
  it('MC same seed → identical', () => {
    const a = simulateBiDirectionalLinePay(baseCfg(), 1000, 42);
    const b = simulateBiDirectionalLinePay(baseCfg(), 1000, 42);
    expect(a.observedTotalPayBidirectional).toBe(b.observedTotalPayBidirectional);
  });
});

describe('industry use-cases', () => {
  it('Microgaming Avalon style: 5-reel both-ways, k_min=3', () => {
    const r = solveBiDirectionalLinePay({
      reelCount: 5,
      minMatchLength: 3,
      symbols: [
        { label: 'avalon', density: 0.15, paytable: [0, 0, 10, 50, 250] },
      ],
    });
    // Bi-directional uplift is significant (≥ 1.5×) but bounded by 2 due to N-match deduction
    expect(r.bidirectionalUpliftRatio).toBeGreaterThan(1.5);
    expect(r.bidirectionalUpliftRatio).toBeLessThan(2.0);
  });
  it('NetEnt Lights style: 5-reel both-ways, k_min=2 (scatter-like)', () => {
    const r = solveBiDirectionalLinePay({
      reelCount: 5,
      minMatchLength: 2,
      symbols: [
        { label: 'lights', density: 0.20, paytable: [0, 3, 10, 50, 200] },
      ],
    });
    expect(r.totalHitFrequencyBidirectional).toBeGreaterThan(0);
    expect(r.totalExpectedPayBidirectional).toBeGreaterThan(0);
  });
  it('Edge: 2-reel game, kMin=2 → all-or-nothing', () => {
    const r = solveBiDirectionalLinePay({
      reelCount: 2,
      minMatchLength: 2,
      symbols: [
        { label: 'two', density: 0.5, paytable: [0, 10] },
      ],
    });
    // q^2 = 0.25, P(L_2) = P(R_2) = 0.25, both same event
    // E[pay_BD] = 10·0.25 + 10·0.25 − 10·0.25 = 2.5
    expect(r.totalExpectedPayBidirectional).toBeCloseTo(2.5, 6);
  });
});
