import { describe, it, expect } from 'vitest';
import { solveSportsbook, simulateSportsbook } from '../src/features/sportsbookOddsMargin.js';

const baseCfg = {
  trueProbabilities: [0.50, 0.30, 0.20],
  decimalOdds: [1.95, 3.20, 4.80],
  annualHandle: 100_000_000,
  customerWagerDistribution: [0.5, 0.3, 0.2],
};

describe('sportsbook — validation', () => {
  it('rejects probability sum ≠ 1', () => {
    expect(() => solveSportsbook({ ...baseCfg, trueProbabilities: [0.5, 0.5, 0.2] })).toThrow();
  });
  it('rejects odds ≤ 1', () => {
    expect(() => solveSportsbook({ ...baseCfg, decimalOdds: [1.0, 3.0, 4.0] })).toThrow();
  });
  it('rejects negative handle', () => {
    expect(() => solveSportsbook({ ...baseCfg, annualHandle: -100 })).toThrow();
  });
  it('rejects wagerDist sum ≠ 1', () => {
    expect(() => solveSportsbook({ ...baseCfg, customerWagerDistribution: [0.5, 0.3, 0.5] })).toThrow();
  });
  it('rejects < 2 outcomes', () => {
    expect(() => solveSportsbook({ ...baseCfg, trueProbabilities: [1.0], decimalOdds: [2.0], customerWagerDistribution: [1.0] })).toThrow();
  });
});

describe('sportsbook — math', () => {
  it('implied = 1/odds', () => {
    const r = solveSportsbook(baseCfg);
    expect(r.impliedProbabilities[0]).toBeCloseTo(1 / 1.95, 4);
  });
  it('overround > 0 for fair odds', () => {
    const r = solveSportsbook(baseCfg);
    expect(r.overround).toBeGreaterThan(0);
  });
  it('expected GGR > 0', () => {
    const r = solveSportsbook(baseCfg);
    expect(r.expectedAnnualGgr).toBeGreaterThan(0);
  });
  it('lower odds → higher overround', () => {
    const a = solveSportsbook({ ...baseCfg, decimalOdds: [1.95, 3.20, 4.80] });
    const b = solveSportsbook({ ...baseCfg, decimalOdds: [1.80, 2.90, 4.30] });
    expect(b.overround).toBeGreaterThan(a.overround);
  });
});

describe('sportsbook — UKGC RTS 12', () => {
  it('compliant for ≤ 15% overround', () => {
    const r = solveSportsbook(baseCfg);
    expect(r.isCompliantUkgcRts12).toBe(true);
  });
  it('non-compliant > 15% overround', () => {
    const r = solveSportsbook({ ...baseCfg, decimalOdds: [1.50, 2.40, 3.60] });
    expect(r.isCompliantUkgcRts12).toBe(false);
  });
});

describe('sportsbook — MC', () => {
  it('MC GGR exists', () => {
    const mc = simulateSportsbook(baseCfg, 12345, 10_000);
    expect(typeof mc.observedGgrMean).toBe('number');
  });
  it('determinism', () => {
    const a = simulateSportsbook(baseCfg, 42, 1000);
    const b = simulateSportsbook(baseCfg, 42, 1000);
    expect(a.observedGgrMean).toBe(b.observedGgrMean);
  });
});
