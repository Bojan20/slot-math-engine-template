/**
 * W152 Wave 71 — Must-Hit-By Jackpot tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveMustHitByJackpot,
  simulateMustHitByJackpot,
  type MustHitByConfig,
} from '../src/features/mustHitByJackpot.js';

const baseCfg = (overrides: Partial<MustHitByConfig> = {}): MustHitByConfig => ({
  poolSeedX: 500,
  poolCapX: 5000,
  contributionPerSpinX: 0.01,
  ...overrides,
});

describe('validation', () => {
  it('rejects negative seed', () => {
    expect(() => solveMustHitByJackpot(baseCfg({ poolSeedX: -1 }))).toThrow();
  });
  it('rejects cap ≤ seed', () => {
    expect(() => solveMustHitByJackpot(baseCfg({ poolCapX: 500 }))).toThrow();
    expect(() => solveMustHitByJackpot(baseCfg({ poolCapX: 100 }))).toThrow();
  });
  it('rejects non-positive contribution', () => {
    expect(() => solveMustHitByJackpot(baseCfg({ contributionPerSpinX: 0 }))).toThrow();
    expect(() => solveMustHitByJackpot(baseCfg({ contributionPerSpinX: -0.01 }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('E[N*] = span / (2c)', () => {
    const r = solveMustHitByJackpot(baseCfg());
    // span = 4500, c = 0.01 → 225000
    expect(r.expectedSpinsUntilTrigger).toBeCloseTo(225000, 0);
  });
  it('Var[N*] = span² / (12 c²)', () => {
    const r = solveMustHitByJackpot(baseCfg());
    // 4500² / (12 × 0.0001) = 20250000 / 0.0012 = 16,875,000,000
    expect(r.varianceSpinsUntilTrigger).toBeCloseTo(16_875_000_000, -3);
  });
  it('E[pool at trigger] = midpoint', () => {
    const r = solveMustHitByJackpot(baseCfg());
    expect(r.expectedPoolAtTrigger).toBe(2750);
  });
  it('effective RTP > contribution rate (seeded pool inflates payout)', () => {
    const r = solveMustHitByJackpot(baseCfg());
    expect(r.effectiveRtpContribution).toBeGreaterThan(0.01); // > contribution
    // = 0.01 × 5500/4500 = 0.01222...
    expect(r.effectiveRtpContribution).toBeCloseTo(0.012222, 5);
  });
  it('zero seed (no operator funding) → effective RTP = contribution', () => {
    const r = solveMustHitByJackpot(baseCfg({ poolSeedX: 0 }));
    // = c × cap/cap = c
    expect(r.effectiveRtpContribution).toBeCloseTo(0.01, 8);
  });
});

describe('monotonicity', () => {
  it('higher contribution ⇒ fewer expected spins', () => {
    const a = solveMustHitByJackpot(baseCfg({ contributionPerSpinX: 0.01 }));
    const b = solveMustHitByJackpot(baseCfg({ contributionPerSpinX: 0.02 }));
    expect(b.expectedSpinsUntilTrigger).toBeLessThan(a.expectedSpinsUntilTrigger);
  });
  it('larger span ⇒ more spins', () => {
    const small = solveMustHitByJackpot(baseCfg({ poolCapX: 2500 }));
    const large = solveMustHitByJackpot(baseCfg({ poolCapX: 10000 }));
    expect(large.expectedSpinsUntilTrigger).toBeGreaterThan(small.expectedSpinsUntilTrigger);
  });
});

describe('MC cross-validation', () => {
  it('E[N*] matches MC at 10K cycles (rel ≤ 2%)', () => {
    const cfg = baseCfg();
    const cf = solveMustHitByJackpot(cfg);
    const mc = simulateMustHitByJackpot(cfg, 10_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedSpinsUntilTrigger - mc.observedMeanSpins) /
      cf.expectedSpinsUntilTrigger;
    expect(rel).toBeLessThan(0.02);
  });
  it('E[pool at trigger] matches MC', () => {
    const cfg = baseCfg();
    const cf = solveMustHitByJackpot(cfg);
    const mc = simulateMustHitByJackpot(cfg, 10_000, 0xbeefbabe);
    const rel = Math.abs(cf.expectedPoolAtTrigger - mc.observedMeanPoolAtTrigger) /
      cf.expectedPoolAtTrigger;
    expect(rel).toBeLessThan(0.02);
  });
});

describe('determinism', () => {
  it('same config → same CF', () => {
    const a = solveMustHitByJackpot(baseCfg());
    const b = solveMustHitByJackpot(baseCfg());
    expect(a.expectedSpinsUntilTrigger).toBe(b.expectedSpinsUntilTrigger);
  });
  it('MC same seed → identical', () => {
    const a = simulateMustHitByJackpot(baseCfg(), 1000, 42);
    const b = simulateMustHitByJackpot(baseCfg(), 1000, 42);
    expect(a.observedMeanSpins).toBe(b.observedMeanSpins);
  });
});
