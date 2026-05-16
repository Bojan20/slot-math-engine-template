/**
 * W152 Wave 134 — Hold-and-Win Multi-Tier Value-Based Jackpot tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveHoldWinValueJackpot,
  simulateHoldWinValueJackpot,
  type HoldWinValueJackpotConfig,
} from '../src/features/holdWinValueJackpot.js';

const baseCfg = (overrides: Partial<HoldWinValueJackpotConfig> = {}): HoldWinValueJackpotConfig => ({
  gridCells: 15,
  initialFilledCells: 6,
  landingProbabilityPerCell: 0.05,
  maxRespins: 3,
  valuePmf: [
    { value: 1,    probability: 0.50 },
    { value: 2,    probability: 0.25 },
    { value: 5,    probability: 0.15 },
    { value: 10,   probability: 0.08 },
    { value: 50,   probability: 0.02 },
  ],
  tiers: [
    { label: 'mini',  thresholdX: 50,  bonusPayoutX: 100 },
    { label: 'major', thresholdX: 200, bonusPayoutX: 500 },
    { label: 'mega',  thresholdX: 500, bonusPayoutX: 5000 },
  ],
  fullGridBonusX: 10000,
  ...overrides,
});

describe('validation', () => {
  it('rejects gridCells < 1', () => {
    expect(() => solveHoldWinValueJackpot(baseCfg({ gridCells: 0 }))).toThrow();
  });
  it('rejects initialFilledCells > gridCells', () => {
    expect(() => solveHoldWinValueJackpot(baseCfg({ initialFilledCells: 20 }))).toThrow();
  });
  it('rejects p ≤ 0', () => {
    expect(() => solveHoldWinValueJackpot(baseCfg({ landingProbabilityPerCell: 0 }))).toThrow();
  });
  it('rejects p > 1', () => {
    expect(() => solveHoldWinValueJackpot(baseCfg({ landingProbabilityPerCell: 1.5 }))).toThrow();
  });
  it('rejects maxRespins < 1', () => {
    expect(() => solveHoldWinValueJackpot(baseCfg({ maxRespins: 0 }))).toThrow();
  });
  it('rejects empty valuePmf', () => {
    expect(() => solveHoldWinValueJackpot(baseCfg({ valuePmf: [] }))).toThrow();
  });
  it('rejects valuePmf not summing to 1', () => {
    expect(() => solveHoldWinValueJackpot(baseCfg({
      valuePmf: [{ value: 1, probability: 0.7 }],
    }))).toThrow();
  });
  it('rejects empty tiers', () => {
    expect(() => solveHoldWinValueJackpot(baseCfg({ tiers: [] }))).toThrow();
  });
  it('rejects duplicate tier label', () => {
    expect(() => solveHoldWinValueJackpot(baseCfg({
      tiers: [
        { label: 'a', thresholdX: 10 },
        { label: 'a', thresholdX: 20 },
      ],
    }))).toThrow();
  });
  it('rejects negative tier threshold', () => {
    expect(() => solveHoldWinValueJackpot(baseCfg({
      tiers: [{ label: 'x', thresholdX: -5 }],
    }))).toThrow();
  });
});

describe('filled distribution', () => {
  it('probFilledByEnd sums to ~1', () => {
    const r = solveHoldWinValueJackpot(baseCfg());
    const sum = r.probFilledByEnd.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
  it('probFilledByEnd[k] = 0 for k < initialFilledCells', () => {
    const r = solveHoldWinValueJackpot(baseCfg());
    for (let k = 0; k < r.initialFilledCells; k++) {
      expect(r.probFilledByEnd[k]).toBe(0);
    }
  });
  it('expectedFilledCount ≥ initialFilledCells', () => {
    const r = solveHoldWinValueJackpot(baseCfg());
    expect(r.expectedFilledCount).toBeGreaterThanOrEqual(r.initialFilledCells);
  });
  it('expectedFilledCount ≤ gridCells', () => {
    const r = solveHoldWinValueJackpot(baseCfg());
    expect(r.expectedFilledCount).toBeLessThanOrEqual(r.gridCells);
  });
  it('probFullGridReached in [0, 1]', () => {
    const r = solveHoldWinValueJackpot(baseCfg());
    expect(r.probFullGridReached).toBeGreaterThanOrEqual(0);
    expect(r.probFullGridReached).toBeLessThanOrEqual(1);
  });
});

describe('value moments', () => {
  it('expectedValuePerCell = Σ value · prob from valuePmf', () => {
    const r = solveHoldWinValueJackpot(baseCfg());
    // 1·0.5 + 2·0.25 + 5·0.15 + 10·0.08 + 50·0.02 = 0.5 + 0.5 + 0.75 + 0.8 + 1.0 = 3.55
    expect(r.expectedValuePerCell).toBeCloseTo(3.55, 6);
  });
  it('expectedTotalValue = (E[F] − F_init) · E[V] (only new cells get money)', () => {
    const r = solveHoldWinValueJackpot(baseCfg());
    expect(r.expectedTotalValue).toBeCloseTo((r.expectedFilledCount - r.initialFilledCells) * r.expectedValuePerCell, 6);
  });
});

describe('tier probabilities', () => {
  it('P(reach mini) ≥ P(reach major) ≥ P(reach mega) (monotone tail)', () => {
    const r = solveHoldWinValueJackpot(baseCfg());
    const mini = r.perTier.find((t) => t.label === 'mini')!;
    const major = r.perTier.find((t) => t.label === 'major')!;
    const mega = r.perTier.find((t) => t.label === 'mega')!;
    expect(mini.probReachTier).toBeGreaterThanOrEqual(major.probReachTier - 1e-9);
    expect(major.probReachTier).toBeGreaterThanOrEqual(mega.probReachTier - 1e-9);
  });
  it('P(exactly tier) decomposition sums to P(reach lowest)', () => {
    const r = solveHoldWinValueJackpot(baseCfg());
    let exactlySum = 0;
    for (const t of r.perTier) exactlySum += t.probExactlyTier;
    expect(exactlySum).toBeCloseTo(r.probAnyTierReached, 6);
  });
  it('all tier probs in [0, 1]', () => {
    const r = solveHoldWinValueJackpot(baseCfg());
    for (const t of r.perTier) {
      expect(t.probReachTier).toBeGreaterThanOrEqual(0);
      expect(t.probReachTier).toBeLessThanOrEqual(1);
      expect(t.probExactlyTier).toBeGreaterThanOrEqual(0);
      expect(t.probExactlyTier).toBeLessThanOrEqual(1);
    }
  });
  it('lower threshold → higher P(reach)', () => {
    const r = solveHoldWinValueJackpot({
      ...baseCfg(),
      tiers: [
        { label: 'low',  thresholdX: 10 },
        { label: 'high', thresholdX: 500 },
      ],
    });
    const low = r.perTier.find((t) => t.label === 'low')!;
    const high = r.perTier.find((t) => t.label === 'high')!;
    expect(low.probReachTier).toBeGreaterThanOrEqual(high.probReachTier);
  });
});

describe('jackpot payout', () => {
  it('expectedJackpotPayout ≥ expectedTotalValue', () => {
    const r = solveHoldWinValueJackpot(baseCfg());
    expect(r.expectedJackpotPayout).toBeGreaterThanOrEqual(r.expectedTotalValue);
  });
  it('higher tier bonuses → higher expected jackpot', () => {
    const a = solveHoldWinValueJackpot(baseCfg());
    const b = solveHoldWinValueJackpot({
      ...baseCfg(),
      tiers: [
        { label: 'mini',  thresholdX: 50,  bonusPayoutX: 1000 }, // 10× bonus
        { label: 'major', thresholdX: 200, bonusPayoutX: 5000 },
        { label: 'mega',  thresholdX: 500, bonusPayoutX: 50000 },
      ],
    });
    expect(b.expectedJackpotPayout).toBeGreaterThan(a.expectedJackpotPayout);
  });
});

describe('monotonicity', () => {
  it('higher p → higher E[F]', () => {
    const a = solveHoldWinValueJackpot(baseCfg({ landingProbabilityPerCell: 0.02 }));
    const b = solveHoldWinValueJackpot(baseCfg({ landingProbabilityPerCell: 0.10 }));
    expect(b.expectedFilledCount).toBeGreaterThan(a.expectedFilledCount);
  });
  it('higher initialFilled → higher E[F]', () => {
    const a = solveHoldWinValueJackpot(baseCfg({ initialFilledCells: 3 }));
    const b = solveHoldWinValueJackpot(baseCfg({ initialFilledCells: 10 }));
    expect(b.expectedFilledCount).toBeGreaterThan(a.expectedFilledCount);
  });
  it('higher maxRespins → higher E[F]', () => {
    const a = solveHoldWinValueJackpot(baseCfg({ maxRespins: 1 }));
    const b = solveHoldWinValueJackpot(baseCfg({ maxRespins: 5 }));
    expect(b.expectedFilledCount).toBeGreaterThan(a.expectedFilledCount);
  });
});

describe('degenerate corners', () => {
  it('initialFilled = gridCells → no respins effective', () => {
    const r = solveHoldWinValueJackpot(baseCfg({ initialFilledCells: 15 }));
    expect(r.expectedFilledCount).toBe(15);
    expect(r.probFullGridReached).toBe(1);
  });
  it('p = 1 → likely reaches full grid', () => {
    const r = solveHoldWinValueJackpot(baseCfg({
      landingProbabilityPerCell: 1,
    }));
    // With p=1, every respin fills all empty cells → 1 respin enough → full grid
    expect(r.probFullGridReached).toBeCloseTo(1, 4);
  });
});

describe('MC cross-validation', () => {
  it('MC E[F] matches CF (abs ≤ 0.3 at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveHoldWinValueJackpot(cfg);
    const mc = simulateHoldWinValueJackpot(cfg, 50_000, 0xdeadbeef);
    expect(Math.abs(cf.expectedFilledCount - mc.observedMeanFilledCount)).toBeLessThan(0.3);
  });
  it('MC E[V_total] matches CF (rel ≤ 10% at 50K)', () => {
    const cfg = baseCfg();
    const cf = solveHoldWinValueJackpot(cfg);
    const mc = simulateHoldWinValueJackpot(cfg, 50_000, 0xcafe1234);
    const rel = Math.abs(cf.expectedTotalValue - mc.observedMeanTotalValue) /
      Math.max(cf.expectedTotalValue, 1e-9);
    expect(rel).toBeLessThan(0.10);
  });
  it('MC P(full grid) matches CF (abs ≤ 0.05 at 50K)', () => {
    const cfg = baseCfg();
    const cf = solveHoldWinValueJackpot(cfg);
    const mc = simulateHoldWinValueJackpot(cfg, 50_000, 0xbeefcafe);
    expect(Math.abs(cf.probFullGridReached - mc.observedFullGridFraction)).toBeLessThan(0.05);
  });
  it('MC tier hit rates match CF (abs ≤ 0.05 each tier at 50K)', () => {
    const cfg = baseCfg();
    const cf = solveHoldWinValueJackpot(cfg);
    const mc = simulateHoldWinValueJackpot(cfg, 50_000, 0xbeef0001);
    for (const t of cf.perTier) {
      const mcRate = mc.observedTierHits[t.label] / mc.episodes;
      expect(Math.abs(t.probReachTier - mcRate)).toBeLessThan(0.05);
    }
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveHoldWinValueJackpot(baseCfg());
    const b = solveHoldWinValueJackpot(baseCfg());
    expect(a.expectedTotalValue).toBe(b.expectedTotalValue);
  });
  it('MC same seed → identical', () => {
    const a = simulateHoldWinValueJackpot(baseCfg(), 1000, 42);
    const b = simulateHoldWinValueJackpot(baseCfg(), 1000, 42);
    expect(a.observedMeanFilledCount).toBe(b.observedMeanFilledCount);
  });
});

describe('industry use-cases', () => {
  it('Aristocrat Lightning Link: 15-cell, 6-trigger, 3 respins, MMM+Grand tiers', () => {
    const r = solveHoldWinValueJackpot({
      gridCells: 15,
      initialFilledCells: 6,
      landingProbabilityPerCell: 0.05,
      maxRespins: 3,
      valuePmf: [
        { value: 1,   probability: 0.55 },
        { value: 2,   probability: 0.20 },
        { value: 5,   probability: 0.12 },
        { value: 10,  probability: 0.08 },
        { value: 50,  probability: 0.04 },
        { value: 200, probability: 0.01 },
      ],
      tiers: [
        { label: 'mini',  thresholdX: 30,   bonusPayoutX: 50 },
        { label: 'minor', thresholdX: 100,  bonusPayoutX: 250 },
        { label: 'major', thresholdX: 300,  bonusPayoutX: 1000 },
      ],
      fullGridBonusX: 10000,
    });
    expect(r.perTier.length).toBe(3);
    expect(r.perTier[0].label).toBe('mini'); // sorted ascending
    expect(r.probAnyTierReached).toBeGreaterThan(0);
  });
  it('IGT Hold & Win: smaller 12-cell grid', () => {
    const r = solveHoldWinValueJackpot({
      gridCells: 12,
      initialFilledCells: 5,
      landingProbabilityPerCell: 0.08,
      maxRespins: 3,
      valuePmf: [
        { value: 2,  probability: 0.6 },
        { value: 10, probability: 0.3 },
        { value: 50, probability: 0.1 },
      ],
      tiers: [{ label: 'jp', thresholdX: 100, bonusPayoutX: 500 }],
    });
    expect(r.gridCells).toBe(12);
    expect(r.perTier[0].label).toBe('jp');
  });
});
