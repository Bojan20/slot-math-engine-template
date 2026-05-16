/**
 * W152 Wave 95 — Ante Bet / Bet Boost Trade-Off Analyzer tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveAnteBetTradeOff,
  simulateAnteBetTradeOff,
  type AnteBetTradeOffConfig,
} from '../src/features/anteBetTradeOff.js';

const baseCfg = (overrides: Partial<AnteBetTradeOffConfig> = {}): AnteBetTradeOffConfig => ({
  baseMeanWinPerSpinX: 0.96,
  baseVarianceWinPerSpinX: 10,
  antePremiumRatio: 0.25,
  anteMeanWinPerSpinX: 1.215, // 0.97 RTP / 1.25 stake = 0.97
  anteVarianceWinPerSpinX: 18,
  ...overrides,
});

describe('validation', () => {
  it('rejects negative base mean', () => {
    expect(() => solveAnteBetTradeOff(baseCfg({ baseMeanWinPerSpinX: -1 }))).toThrow();
  });
  it('rejects negative base var', () => {
    expect(() => solveAnteBetTradeOff(baseCfg({ baseVarianceWinPerSpinX: -1 }))).toThrow();
  });
  it('rejects non-positive ante premium', () => {
    expect(() => solveAnteBetTradeOff(baseCfg({ antePremiumRatio: 0 }))).toThrow();
    expect(() => solveAnteBetTradeOff(baseCfg({ antePremiumRatio: -0.1 }))).toThrow();
  });
  it('rejects negative ante mean', () => {
    expect(() => solveAnteBetTradeOff(baseCfg({ anteMeanWinPerSpinX: -1 }))).toThrow();
  });
  it('rejects negative ante var', () => {
    expect(() => solveAnteBetTradeOff(baseCfg({ anteVarianceWinPerSpinX: -1 }))).toThrow();
  });
  it('rejects bad adoption fraction', () => {
    expect(() => solveAnteBetTradeOff(baseCfg({ anteAdoptionFraction: 1.5 }))).toThrow();
    expect(() => solveAnteBetTradeOff(baseCfg({ anteAdoptionFraction: -0.1 }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('base RTP = μ_base / 1', () => {
    const r = solveAnteBetTradeOff(baseCfg());
    expect(r.baseRtp).toBeCloseTo(0.96, 8);
  });
  it('ante RTP = μ_ante / (1+a)', () => {
    const r = solveAnteBetTradeOff(baseCfg());
    // 1.215 / 1.25 = 0.972
    expect(r.anteRtp).toBeCloseTo(1.215 / 1.25, 8);
  });
  it('house edge = 1 − RTP', () => {
    const r = solveAnteBetTradeOff(baseCfg());
    expect(r.baseHouseEdge).toBeCloseTo(1 - 0.96, 8);
    expect(r.anteHouseEdge).toBeCloseTo(1 - 0.972, 8);
  });
  it('expected net per spin: ante = μ_ante − (1+a)', () => {
    const r = solveAnteBetTradeOff(baseCfg());
    expect(r.baseExpectedNetPerSpin).toBeCloseTo(0.96 - 1, 8); // -0.04
    expect(r.anteExpectedNetPerSpin).toBeCloseTo(1.215 - 1.25, 8); // -0.035
  });
  it('ante stake = 1 + a', () => {
    const r = solveAnteBetTradeOff(baseCfg());
    expect(r.anteStake).toBeCloseTo(1.25, 10);
  });
  it('std net per spin = √variance', () => {
    const r = solveAnteBetTradeOff(baseCfg());
    expect(r.baseStdNetPerSpin).toBeCloseTo(Math.sqrt(10), 8);
    expect(r.anteStdNetPerSpin).toBeCloseTo(Math.sqrt(18), 8);
  });
  it('ante is +EV when RTP_ante > RTP_base', () => {
    const r = solveAnteBetTradeOff(baseCfg());
    expect(r.anteIsPositiveEV).toBe(true); // 0.972 > 0.96
  });
  it('ante is −EV when RTP_ante < RTP_base', () => {
    const r = solveAnteBetTradeOff(baseCfg({
      anteMeanWinPerSpinX: 1.0, // 1.0/1.25 = 0.8 < 0.96
    }));
    expect(r.anteIsPositiveEV).toBe(false);
  });
  it('boost premium = (RTP_a − RTP_b) / RTP_b', () => {
    const r = solveAnteBetTradeOff(baseCfg());
    const expected = (0.972 - 0.96) / 0.96;
    expect(r.boostPremium).toBeCloseTo(expected, 8);
  });
  it('crossover N* = 4σ²/μ² (2-sigma confidence)', () => {
    const r = solveAnteBetTradeOff(baseCfg());
    // base: 4·10 / (−0.04)² = 40 / 0.0016 = 25000
    expect(r.baseCrossover2Sigma).toBe(Math.ceil(4 * 10 / (0.04 * 0.04)));
  });
  it('aggregate RTP weighted by adoption fraction', () => {
    const r = solveAnteBetTradeOff(baseCfg({ anteAdoptionFraction: 0.3 }));
    // stake = 0.3·1.25 + 0.7·1 = 0.375 + 0.7 = 1.075
    // win = 0.3·1.215 + 0.7·0.96 = 0.3645 + 0.672 = 1.0365
    // agg RTP = 1.0365 / 1.075 ≈ 0.9642
    expect(r.aggregateRtp).toBeCloseTo(1.0365 / 1.075, 6);
  });
  it('no adoption ⇒ aggregateRtp null', () => {
    const r = solveAnteBetTradeOff(baseCfg());
    expect(r.aggregateRtp).toBeNull();
  });
});

describe('monotonicity', () => {
  it('higher ante boost ⇒ higher ante RTP', () => {
    const a = solveAnteBetTradeOff(baseCfg({ anteMeanWinPerSpinX: 1.0 }));
    const b = solveAnteBetTradeOff(baseCfg({ anteMeanWinPerSpinX: 1.5 }));
    expect(b.anteRtp).toBeGreaterThan(a.anteRtp);
  });
  it('higher ante premium ⇒ lower ante RTP (same boost)', () => {
    const a = solveAnteBetTradeOff(baseCfg({ antePremiumRatio: 0.25 }));
    const b = solveAnteBetTradeOff(baseCfg({ antePremiumRatio: 0.5 }));
    expect(b.anteRtp).toBeLessThan(a.anteRtp);
  });
  it('higher variance ⇒ higher crossover N*', () => {
    const a = solveAnteBetTradeOff(baseCfg({ baseVarianceWinPerSpinX: 5 }));
    const b = solveAnteBetTradeOff(baseCfg({ baseVarianceWinPerSpinX: 20 }));
    expect(b.baseCrossover2Sigma).toBeGreaterThan(a.baseCrossover2Sigma!);
  });
});

describe('MC cross-validation', () => {
  it('MC base RTP matches CF (rel ≤ 5% at 100K spins)', () => {
    const cfg = baseCfg();
    const cf = solveAnteBetTradeOff(cfg);
    const mc = simulateAnteBetTradeOff(cfg, 100_000, 0xc0ffee);
    const rel = Math.abs(cf.baseRtp - mc.baseObservedRtp) / cf.baseRtp;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC ante RTP matches CF (rel ≤ 5% at 100K spins)', () => {
    const cfg = baseCfg();
    const cf = solveAnteBetTradeOff(cfg);
    const mc = simulateAnteBetTradeOff(cfg, 100_000, 0xbeefbabe);
    const rel = Math.abs(cf.anteRtp - mc.anteObservedRtp) / cf.anteRtp;
    expect(rel).toBeLessThan(0.05);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveAnteBetTradeOff(baseCfg());
    const b = solveAnteBetTradeOff(baseCfg());
    expect(a.anteRtp).toBe(b.anteRtp);
  });
  it('MC same seed → identical', () => {
    const a = simulateAnteBetTradeOff(baseCfg(), 1000, 42);
    const b = simulateAnteBetTradeOff(baseCfg(), 1000, 42);
    expect(a.baseTotalWin).toBe(b.baseTotalWin);
    expect(a.anteTotalWin).toBe(b.anteTotalWin);
  });
});

describe('industry use-cases', () => {
  it('Pragmatic Ante Bet: 0.25 premium, +2pp RTP boost', () => {
    const r = solveAnteBetTradeOff({
      baseMeanWinPerSpinX: 0.96,
      baseVarianceWinPerSpinX: 10,
      antePremiumRatio: 0.25,
      anteMeanWinPerSpinX: 0.98 * 1.25, // 0.98 RTP at 1.25 stake
      anteVarianceWinPerSpinX: 20,
    });
    expect(r.anteRtp).toBeCloseTo(0.98, 8);
    expect(r.anteIsPositiveEV).toBe(true);
    expect(r.boostPremium).toBeCloseTo((0.98 - 0.96) / 0.96, 6);
  });
  it('Player-trap ante (UKGC regulator-flagged): a=0.5 premium, no real RTP boost', () => {
    const r = solveAnteBetTradeOff({
      baseMeanWinPerSpinX: 0.96,
      baseVarianceWinPerSpinX: 10,
      antePremiumRatio: 0.5,
      anteMeanWinPerSpinX: 1.44, // exactly 0.96 RTP at 1.5 stake
      anteVarianceWinPerSpinX: 30,
    });
    expect(r.anteRtp).toBeCloseTo(0.96, 8);
    expect(r.anteIsPositiveEV).toBe(false);
    expect(r.boostPremium).toBeCloseTo(0, 8);
  });
});
