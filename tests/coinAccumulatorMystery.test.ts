/**
 * W152 Wave 91 — Coin Accumulator with Mystery Values tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveCoinAccumulatorMystery,
  simulateCoinAccumulatorMystery,
  type CoinAccumulatorMysteryConfig,
} from '../src/features/coinAccumulatorMystery.js';

const baseCfg = (overrides: Partial<CoinAccumulatorMysteryConfig> = {}): CoinAccumulatorMysteryConfig => ({
  freeSpinsK: 10,
  coinLandingProbabilityPerSpin: 0.40,
  coinValueOutcomes: [
    { label: 'cash_low',  valueX: 1,   weight: 50 },
    { label: 'cash_mid',  valueX: 5,   weight: 30 },
    { label: 'cash_high', valueX: 25,  weight: 15 },
    { label: 'mini',      valueX: 50,  weight: 4 },
    { label: 'major',     valueX: 500, weight: 1 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects K < 1', () => {
    expect(() => solveCoinAccumulatorMystery(baseCfg({ freeSpinsK: 0 }))).toThrow();
  });
  it('rejects non-integer K', () => {
    expect(() => solveCoinAccumulatorMystery(baseCfg({ freeSpinsK: 1.5 }))).toThrow();
  });
  it('rejects q out of [0,1]', () => {
    expect(() => solveCoinAccumulatorMystery(baseCfg({ coinLandingProbabilityPerSpin: -0.1 }))).toThrow();
    expect(() => solveCoinAccumulatorMystery(baseCfg({ coinLandingProbabilityPerSpin: 1.1 }))).toThrow();
  });
  it('rejects empty outcomes', () => {
    expect(() => solveCoinAccumulatorMystery(baseCfg({ coinValueOutcomes: [] }))).toThrow();
  });
  it('rejects duplicate label', () => {
    expect(() => solveCoinAccumulatorMystery(baseCfg({
      coinValueOutcomes: [
        { label: 'x', valueX: 1, weight: 1 },
        { label: 'x', valueX: 2, weight: 1 },
      ],
    }))).toThrow();
  });
  it('rejects negative value', () => {
    expect(() => solveCoinAccumulatorMystery(baseCfg({
      coinValueOutcomes: [{ label: 'a', valueX: -1, weight: 1 }],
    }))).toThrow();
  });
  it('rejects non-positive weight', () => {
    expect(() => solveCoinAccumulatorMystery(baseCfg({
      coinValueOutcomes: [{ label: 'a', valueX: 1, weight: 0 }],
    }))).toThrow();
  });
  it('rejects bad baseTrigger', () => {
    expect(() => solveCoinAccumulatorMystery(baseCfg({ baseTriggerProbabilityPerSpin: 1.5 }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('E[N] = K · q', () => {
    const r = solveCoinAccumulatorMystery(baseCfg());
    expect(r.expectedCoinsTotal).toBeCloseTo(10 * 0.4, 10);
  });
  it('Var[N] = K · q · (1-q)', () => {
    const r = solveCoinAccumulatorMystery(baseCfg());
    expect(r.varianceCoinsTotal).toBeCloseTo(10 * 0.4 * 0.6, 10);
  });
  it('E[V] = Σ p_i · v_i', () => {
    const r = solveCoinAccumulatorMystery(baseCfg());
    // Σw = 50+30+15+4+1 = 100
    // μ = 0.5·1 + 0.3·5 + 0.15·25 + 0.04·50 + 0.01·500 = 0.5+1.5+3.75+2+5 = 12.75
    expect(r.expectedCoinValue).toBeCloseTo(12.75, 8);
  });
  it('Var[V] = E[V²] − E[V]²', () => {
    const r = solveCoinAccumulatorMystery(baseCfg());
    // E[V²] = 0.5·1 + 0.3·25 + 0.15·625 + 0.04·2500 + 0.01·250000 = 0.5+7.5+93.75+100+2500 = 2701.75
    // Var = 2701.75 − 12.75² = 2701.75 − 162.5625 = 2539.1875
    expect(r.varianceCoinValue).toBeCloseTo(2539.1875, 4);
  });
  it('E[Y] = E[N] · μ_V (Wald)', () => {
    const r = solveCoinAccumulatorMystery(baseCfg());
    expect(r.expectedTotalPayoutX).toBeCloseTo(4 * 12.75, 8); // 51
  });
  it('Var[Y] = E[N]·σ²_V + Var[N]·μ²_V (compound-sum)', () => {
    const r = solveCoinAccumulatorMystery(baseCfg());
    // = 4 · 2539.1875 + 2.4 · 162.5625
    // = 10156.75 + 390.15 = 10546.9
    expect(r.varianceTotalPayoutX).toBeCloseTo(10156.75 + 2.4 * 162.5625, 4);
  });
  it('P(zero coins) = (1-q)^K', () => {
    const r = solveCoinAccumulatorMystery(baseCfg());
    expect(r.probZeroCoins).toBeCloseTo(Math.pow(0.6, 10), 10);
  });
  it('P(all coins) = q^K', () => {
    const r = solveCoinAccumulatorMystery(baseCfg());
    expect(r.probAllCoins).toBeCloseTo(Math.pow(0.4, 10), 10);
  });
  it('P(at least one max-value) = 1 − (1 − q·p_max)^K', () => {
    const r = solveCoinAccumulatorMystery(baseCfg());
    // p_major = 1/100 = 0.01, q = 0.4, K = 10
    // P = 1 − (1 − 0.4·0.01)^10 = 1 − 0.996^10
    expect(r.probAtLeastOneMaxValue).toBeCloseTo(1 - Math.pow(1 - 0.4 * 0.01, 10), 10);
  });
  it('q=0 → no coins, E[Y]=0', () => {
    const r = solveCoinAccumulatorMystery(baseCfg({ coinLandingProbabilityPerSpin: 0 }));
    expect(r.expectedCoinsTotal).toBe(0);
    expect(r.expectedTotalPayoutX).toBe(0);
    expect(r.probZeroCoins).toBe(1);
  });
  it('per-base-spin contribution if baseTrigger set', () => {
    const r = solveCoinAccumulatorMystery(baseCfg({ baseTriggerProbabilityPerSpin: 0.01 }));
    expect(r.expectedFeaturePayoutPerBaseSpin).toBeCloseTo(0.01 * 51, 8);
  });
  it('no base trigger ⇒ null', () => {
    const r = solveCoinAccumulatorMystery(baseCfg());
    expect(r.expectedFeaturePayoutPerBaseSpin).toBeNull();
  });
});

describe('monotonicity', () => {
  it('higher q ⇒ higher E[N] and E[Y]', () => {
    const a = solveCoinAccumulatorMystery(baseCfg({ coinLandingProbabilityPerSpin: 0.2 }));
    const b = solveCoinAccumulatorMystery(baseCfg({ coinLandingProbabilityPerSpin: 0.8 }));
    expect(b.expectedTotalPayoutX).toBeGreaterThan(a.expectedTotalPayoutX);
  });
  it('larger K ⇒ proportional E[Y]', () => {
    const a = solveCoinAccumulatorMystery(baseCfg({ freeSpinsK: 5 }));
    const b = solveCoinAccumulatorMystery(baseCfg({ freeSpinsK: 20 }));
    expect(b.expectedTotalPayoutX).toBeCloseTo(a.expectedTotalPayoutX * 4, 6);
  });
  it('higher max-value weight ⇒ higher P(at least one max)', () => {
    const a = solveCoinAccumulatorMystery(baseCfg());
    const cfgBoosted = baseCfg();
    cfgBoosted.coinValueOutcomes = [...cfgBoosted.coinValueOutcomes];
    cfgBoosted.coinValueOutcomes[4] = { label: 'major', valueX: 500, weight: 10 };
    const b = solveCoinAccumulatorMystery(cfgBoosted);
    expect(b.probAtLeastOneMaxValue).toBeGreaterThan(a.probAtLeastOneMaxValue);
  });
});

describe('MC cross-validation', () => {
  it('MC E[N] matches CF (rel ≤ 2% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveCoinAccumulatorMystery(cfg);
    const mc = simulateCoinAccumulatorMystery(cfg, 50_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedCoinsTotal - mc.observedMeanCoins) / cf.expectedCoinsTotal;
    expect(rel).toBeLessThan(0.02);
  });
  it('MC E[Y] matches CF (rel ≤ 10% at 50K episodes — rare-outcome variance)', () => {
    const cfg = baseCfg();
    const cf = solveCoinAccumulatorMystery(cfg);
    const mc = simulateCoinAccumulatorMystery(cfg, 50_000, 0xbeefbabe);
    const rel = Math.abs(cf.expectedTotalPayoutX - mc.observedMeanPayoutX) / cf.expectedTotalPayoutX;
    expect(rel).toBeLessThan(0.10);
  });
  it('MC Var[Y] matches CF (rel ≤ 30% at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveCoinAccumulatorMystery(cfg);
    const mc = simulateCoinAccumulatorMystery(cfg, 50_000, 0xfeedface);
    const rel = Math.abs(cf.varianceTotalPayoutX - mc.observedVariancePayoutX) / cf.varianceTotalPayoutX;
    expect(rel).toBeLessThan(0.30);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveCoinAccumulatorMystery(baseCfg());
    const b = solveCoinAccumulatorMystery(baseCfg());
    expect(a.expectedTotalPayoutX).toBe(b.expectedTotalPayoutX);
  });
  it('MC same seed → identical', () => {
    const a = simulateCoinAccumulatorMystery(baseCfg(), 1000, 42);
    const b = simulateCoinAccumulatorMystery(baseCfg(), 1000, 42);
    expect(a.totalPayoutX).toBe(b.totalPayoutX);
  });
});

describe('industry use-cases', () => {
  it('Money-Train-style K=8, q=0.3, multi-tier coin values', () => {
    const r = solveCoinAccumulatorMystery({
      freeSpinsK: 8,
      coinLandingProbabilityPerSpin: 0.30,
      coinValueOutcomes: [
        { label: 'small', valueX: 1,   weight: 60 },
        { label: 'mid',   valueX: 5,   weight: 25 },
        { label: 'big',   valueX: 20,  weight: 12 },
        { label: 'mini',  valueX: 50,  weight: 2 },
        { label: 'major', valueX: 500, weight: 1 },
      ],
    });
    expect(r.expectedCoinsTotal).toBeCloseTo(2.4, 6);
    expect(r.expectedCoinValue).toBeCloseTo(0.6 * 1 + 0.25 * 5 + 0.12 * 20 + 0.02 * 50 + 0.01 * 500, 6);
    expect(r.probZeroCoins).toBeCloseTo(Math.pow(0.7, 8), 8);
    expect(r.probAtLeastOneMaxValue).toBeGreaterThan(0);
  });
  it('Sticky-style guaranteed coin q=1', () => {
    const r = solveCoinAccumulatorMystery({
      freeSpinsK: 3,
      coinLandingProbabilityPerSpin: 1,
      coinValueOutcomes: [
        { label: 'a', valueX: 10, weight: 1 },
      ],
    });
    expect(r.expectedCoinsTotal).toBe(3);
    expect(r.expectedTotalPayoutX).toBe(30);
    expect(r.probAllCoins).toBe(1);
    expect(r.varianceTotalPayoutX).toBeCloseTo(0, 10);
  });
});
