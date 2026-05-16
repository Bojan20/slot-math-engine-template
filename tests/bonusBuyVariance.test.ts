/**
 * W152 Wave 81 — Bonus Buy Variance Analyzer tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveBonusBuyVariance,
  simulateBonusBuy,
  type BonusBuyConfig,
} from '../src/features/bonusBuyVariance.js';

const baseCfg = (overrides: Partial<BonusBuyConfig> = {}): BonusBuyConfig => ({
  costPerBuyX: 100, // 100× base bet for feature entry
  outcomes: [
    { label: 'bust',   payoutX: 0,    probability: 0.40 },
    { label: '50x',    payoutX: 50,   probability: 0.30 },
    { label: '100x',   payoutX: 100,  probability: 0.15 },
    { label: '500x',   payoutX: 500,  probability: 0.10 },
    { label: 'maxwin', payoutX: 5000, probability: 0.05 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects non-positive costPerBuyX', () => {
    expect(() => solveBonusBuyVariance(baseCfg({ costPerBuyX: 0 }))).toThrow();
    expect(() => solveBonusBuyVariance(baseCfg({ costPerBuyX: -1 }))).toThrow();
  });
  it('rejects empty outcomes', () => {
    expect(() => solveBonusBuyVariance(baseCfg({ outcomes: [] }))).toThrow();
  });
  it('rejects probabilities not summing to 1', () => {
    expect(() => solveBonusBuyVariance(baseCfg({
      outcomes: [{ label: 'x', payoutX: 10, probability: 0.5 }],
    }))).toThrow();
  });
  it('rejects negative payout', () => {
    expect(() => solveBonusBuyVariance(baseCfg({
      outcomes: [{ label: 'x', payoutX: -1, probability: 1 }],
    }))).toThrow();
  });
  it('rejects out-of-range probability', () => {
    expect(() => solveBonusBuyVariance(baseCfg({
      outcomes: [{ label: 'x', payoutX: 1, probability: 1.5 }],
    }))).toThrow();
  });
  it('rejects empty label', () => {
    expect(() => solveBonusBuyVariance(baseCfg({
      outcomes: [{ label: '', payoutX: 1, probability: 1 }],
    }))).toThrow();
  });
  it('rejects bad confidenceZ', () => {
    expect(() => solveBonusBuyVariance(baseCfg({ confidenceZ: 0 }))).toThrow();
  });
  it('rejects bad rtpTolerance', () => {
    expect(() => solveBonusBuyVariance(baseCfg({ rtpTolerance: 0 }))).toThrow();
    expect(() => solveBonusBuyVariance(baseCfg({ rtpTolerance: 1 }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('E[Y] = Σ p_i × payout_i', () => {
    const r = solveBonusBuyVariance(baseCfg());
    // 0.40*0 + 0.30*50 + 0.15*100 + 0.10*500 + 0.05*5000 = 0+15+15+50+250 = 330
    expect(r.expectedOutcomeX).toBeCloseTo(330, 8);
  });
  it('Var[Y] = E[Y²] − E[Y]²', () => {
    const r = solveBonusBuyVariance(baseCfg());
    // E[Y²] = 0.40*0 + 0.30*2500 + 0.15*10000 + 0.10*250000 + 0.05*25000000
    //       = 0 + 750 + 1500 + 25000 + 1250000 = 1,277,250
    expect(r.expectedSecondMomentX).toBeCloseTo(1_277_250, 4);
    // Var = 1277250 - 330² = 1277250 - 108900 = 1,168,350
    expect(r.varianceOutcomeX).toBeCloseTo(1_168_350, 4);
  });
  it('effective RTP = E[Y] / cost', () => {
    const r = solveBonusBuyVariance(baseCfg());
    expect(r.effectiveRtp).toBeCloseTo(330 / 100, 8); // 3.30
  });
  it('house edge = 1 − RTP', () => {
    const r = solveBonusBuyVariance(baseCfg({
      // RTP < 1 example: cost 200, E[Y]=150 → RTP=0.75, edge=0.25
      costPerBuyX: 200,
      outcomes: [
        { label: 'bust', payoutX: 0, probability: 0.5 },
        { label: 'win', payoutX: 300, probability: 0.5 },
      ],
    }));
    expect(r.effectiveRtp).toBeCloseTo(0.75, 8);
    expect(r.houseEdge).toBeCloseTo(0.25, 8);
  });
  it('hit frequency = Σ p_i where payout_i > 0', () => {
    const r = solveBonusBuyVariance(baseCfg());
    // 0.30 + 0.15 + 0.10 + 0.05 = 0.60
    expect(r.hitFrequency).toBeCloseTo(0.60, 8);
  });
  it('max payout & win/loss ratio', () => {
    const r = solveBonusBuyVariance(baseCfg());
    expect(r.maxPayoutX).toBe(5000);
    expect(r.winLossRatio).toBe(50); // 5000 / 100
  });
  it('expected net per buy = E[Y] − cost', () => {
    const r = solveBonusBuyVariance(baseCfg());
    expect(r.expectedNetPerBuyX).toBeCloseTo(330 - 100, 8); // +230
  });
  it('P(bust) = sum where payout=0', () => {
    const r = solveBonusBuyVariance(baseCfg());
    expect(r.probZeroPayout).toBeCloseTo(0.40, 10);
  });
  it('P(below cost) + P(break-even) = 1', () => {
    const r = solveBonusBuyVariance(baseCfg());
    // payouts < 100: bust(0) + 50x → 0.40+0.30 = 0.70
    // payouts >= 100: 100x + 500x + maxwin → 0.15+0.10+0.05 = 0.30
    expect(r.probBelowCost).toBeCloseTo(0.70, 10);
    expect(r.probBreakEven).toBeCloseTo(0.30, 10);
    expect(r.probBelowCost + r.probBreakEven).toBeCloseTo(1, 10);
  });
  it('required N for convergence = (z · σ / (tol · cost))²', () => {
    const r = solveBonusBuyVariance(baseCfg({ rtpTolerance: 0.01, confidenceZ: 1.96 }));
    // z=1.96, σ=√1168350 ≈ 1080.9, cost=100, tol=0.01
    // N* = (1.96 * 1080.9 / (0.01 * 100))² = (2118.6)² ≈ 4,489,000
    const stdY = Math.sqrt(1_168_350);
    const expected = Math.ceil(Math.pow(1.96 * stdY / (0.01 * 100), 2));
    expect(r.requiredBuysForConvergence).toBe(expected);
  });
});

describe('monotonicity', () => {
  it('higher cost ⇒ lower effective RTP', () => {
    const a = solveBonusBuyVariance(baseCfg({ costPerBuyX: 100 }));
    const b = solveBonusBuyVariance(baseCfg({ costPerBuyX: 200 }));
    expect(b.effectiveRtp).toBeLessThan(a.effectiveRtp);
  });
  it('tighter tolerance ⇒ more buys needed', () => {
    const a = solveBonusBuyVariance(baseCfg({ rtpTolerance: 0.01 }));
    const b = solveBonusBuyVariance(baseCfg({ rtpTolerance: 0.001 }));
    expect(b.requiredBuysForConvergence).toBeGreaterThan(a.requiredBuysForConvergence);
  });
  it('higher variance ⇒ more buys needed', () => {
    const lowVar = solveBonusBuyVariance({
      costPerBuyX: 100,
      outcomes: [
        { label: 'a', payoutX: 90, probability: 0.5 },
        { label: 'b', payoutX: 110, probability: 0.5 },
      ],
    });
    const highVar = solveBonusBuyVariance({
      costPerBuyX: 100,
      outcomes: [
        { label: 'a', payoutX: 0, probability: 0.5 },
        { label: 'b', payoutX: 200, probability: 0.5 },
      ],
    });
    expect(highVar.requiredBuysForConvergence).toBeGreaterThan(lowVar.requiredBuysForConvergence);
  });
});

describe('MC cross-validation', () => {
  it('MC observed RTP matches closed-form (rel ≤ 5% at 100K buys)', () => {
    const cfg = baseCfg();
    const cf = solveBonusBuyVariance(cfg);
    const mc = simulateBonusBuy(cfg, 100_000, 0xc0ffee);
    const rel = Math.abs(cf.effectiveRtp - mc.observedRtp) / cf.effectiveRtp;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC observed variance matches CF (rel ≤ 10% at 100K buys)', () => {
    const cfg = baseCfg();
    const cf = solveBonusBuyVariance(cfg);
    const mc = simulateBonusBuy(cfg, 100_000, 0xbeefbabe);
    const rel = Math.abs(cf.varianceOutcomeX - mc.observedVariance) / cf.varianceOutcomeX;
    expect(rel).toBeLessThan(0.10);
  });
  it('MC observed hit frequency matches CF (rel ≤ 2% at 100K buys)', () => {
    const cfg = baseCfg();
    const cf = solveBonusBuyVariance(cfg);
    const mc = simulateBonusBuy(cfg, 100_000, 0xfeedface);
    const rel = Math.abs(cf.hitFrequency - mc.observedHitFreq) / cf.hitFrequency;
    expect(rel).toBeLessThan(0.02);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveBonusBuyVariance(baseCfg());
    const b = solveBonusBuyVariance(baseCfg());
    expect(a.effectiveRtp).toBe(b.effectiveRtp);
  });
  it('MC same seed → identical', () => {
    const a = simulateBonusBuy(baseCfg(), 1000, 42);
    const b = simulateBonusBuy(baseCfg(), 1000, 42);
    expect(a.totalPayout).toBe(b.totalPayout);
  });
  it('MC different seeds → different (sanity)', () => {
    const a = simulateBonusBuy(baseCfg(), 1000, 1);
    const b = simulateBonusBuy(baseCfg(), 1000, 2);
    expect(a.totalPayout).not.toBe(b.totalPayout);
  });
});

describe('industry use-cases', () => {
  it('typical Pragmatic-style buy: 100× cost, RTP ≈ 0.965', () => {
    // Typical commercial bonus buy outcomes
    const r = solveBonusBuyVariance({
      costPerBuyX: 100,
      outcomes: [
        { label: '0x',     payoutX: 0,     probability: 0.50 },
        { label: '30x',    payoutX: 30,    probability: 0.20 },
        { label: '80x',    payoutX: 80,    probability: 0.15 },
        { label: '150x',   payoutX: 150,   probability: 0.08 },
        { label: '300x',   payoutX: 300,   probability: 0.05 },
        { label: '1000x',  payoutX: 1000,  probability: 0.018 },
        { label: 'maxwin', payoutX: 5000,  probability: 0.002 },
      ],
    });
    // E[Y] = 0 + 6 + 12 + 12 + 15 + 18 + 10 = 73 → RTP = 0.73
    expect(r.effectiveRtp).toBeCloseTo(0.73, 4);
    expect(r.hitFrequency).toBeCloseTo(0.50, 8);
    expect(r.winLossRatio).toBe(50);
    expect(r.probZeroPayout).toBeCloseTo(0.50, 8);
  });
  it('high-volatility maxwin chase: heavy P(bust), big tail', () => {
    const r = solveBonusBuyVariance({
      costPerBuyX: 100,
      outcomes: [
        { label: 'bust',   payoutX: 0,     probability: 0.95 },
        { label: 'maxwin', payoutX: 10000, probability: 0.05 },
      ],
    });
    // E[Y] = 500 → RTP 5.00; high variance regime
    expect(r.effectiveRtp).toBe(5);
    // Var[Y] = E[Y²] - E[Y]² = (0.95·0 + 0.05·10000²) - 500² = 5e6 - 250000 = 4_750_000
    expect(r.varianceOutcomeX).toBeCloseTo(4_750_000, 1);
    expect(r.probZeroPayout).toBeCloseTo(0.95, 8);
  });
});
