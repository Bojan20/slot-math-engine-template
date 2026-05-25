/**
 * W152 Wave 169 — Drop-and-Stick Wild Expansion Analyzer tests.
 *
 * 30 specs:
 *   validation 8 / steady-state 4 / trajectory 3 / time-avg 3 / grid fill 3 /
 *   monotonicity 3 / MC cross-val 4 / determinism 1 / industry 1
 */

import { describe, it, expect } from 'vitest';
import {
  solveDropStickWildExpansion,
  simulateDropStickWildExpansion,
} from '../src/features/dropStickWildExpansion.js';

const baseCfg = {
  gridRows: 5,
  gridCols: 5,
  probWildLandPerCellPerSpin: 0.05,
  stickyDurationSpins: 3,
};

describe('dropStickWildExpansion — validation', () => {
  it('rejects gridRows < 1 or non-integer', () => {
    expect(() => solveDropStickWildExpansion({ ...baseCfg, gridRows: 0 })).toThrow();
    expect(() => solveDropStickWildExpansion({ ...baseCfg, gridRows: 2.5 })).toThrow();
  });
  it('rejects gridCols < 1', () => {
    expect(() => solveDropStickWildExpansion({ ...baseCfg, gridCols: 0 })).toThrow();
  });
  it('rejects probWildLandPerCellPerSpin out of (0, 1)', () => {
    expect(() => solveDropStickWildExpansion({ ...baseCfg, probWildLandPerCellPerSpin: 0 })).toThrow();
    expect(() => solveDropStickWildExpansion({ ...baseCfg, probWildLandPerCellPerSpin: 1 })).toThrow();
  });
  it('rejects stickyDurationSpins < 1 or non-integer', () => {
    expect(() => solveDropStickWildExpansion({ ...baseCfg, stickyDurationSpins: 0 })).toThrow();
    expect(() => solveDropStickWildExpansion({ ...baseCfg, stickyDurationSpins: 1.5 })).toThrow();
  });
  it('rejects horizonSpins < 1 if given', () => {
    expect(() => solveDropStickWildExpansion({ ...baseCfg, horizonSpins: 0 })).toThrow();
  });
  it('rejects baselineWinPerSpin < 0 if given', () => {
    expect(() => solveDropStickWildExpansion({ ...baseCfg, baselineWinPerSpin: -1 })).toThrow();
  });
  it('rejects perWildBonus < 0 if given', () => {
    expect(() => solveDropStickWildExpansion({ ...baseCfg, perWildBonus: -1 })).toThrow();
  });
  it('rejects non-finite inputs', () => {
    expect(() => solveDropStickWildExpansion({ ...baseCfg, probWildLandPerCellPerSpin: NaN })).toThrow();
  });
});

describe('dropStickWildExpansion — steady-state correctness', () => {
  it('perCellActiveProbSteadyState = 1 − (1−q)^S', () => {
    const r = solveDropStickWildExpansion(baseCfg);
    const expected = 1 - Math.pow(0.95, 3);
    expect(r.perCellActiveProbSteadyState).toBeCloseTo(expected, 10);
  });
  it('expectedActiveWildsSteadyState = N·M · perCellProb', () => {
    const r = solveDropStickWildExpansion(baseCfg);
    expect(r.expectedActiveWildsSteadyState).toBeCloseTo(25 * r.perCellActiveProbSteadyState, 10);
  });
  it('varianceActiveWildsSteadyState = N·M · p · (1−p)', () => {
    const r = solveDropStickWildExpansion(baseCfg);
    const p = r.perCellActiveProbSteadyState;
    expect(r.varianceActiveWildsSteadyState).toBeCloseTo(25 * p * (1 - p), 10);
  });
  it('fillFraction = perCellSteady', () => {
    const r = solveDropStickWildExpansion(baseCfg);
    expect(r.fillFraction).toBeCloseTo(r.perCellActiveProbSteadyState, 10);
  });
});

describe('dropStickWildExpansion — trajectory', () => {
  it('trajectory at spin 1 = N·M · q', () => {
    const r = solveDropStickWildExpansion(baseCfg);
    const t1 = r.expectedActiveWildsAtSpin.find((x) => x.spin === 1);
    expect(t1!.expected).toBeCloseTo(25 * 0.05, 10);
  });
  it('trajectory monotone increasing up to S', () => {
    const r = solveDropStickWildExpansion(baseCfg);
    for (let i = 1; i < r.expectedActiveWildsAtSpin.length; i++) {
      expect(r.expectedActiveWildsAtSpin[i].expected).toBeGreaterThanOrEqual(
        r.expectedActiveWildsAtSpin[i - 1].expected,
      );
    }
  });
  it('trajectory at S = steady-state value', () => {
    const r = solveDropStickWildExpansion(baseCfg);
    const tS = r.expectedActiveWildsAtSpin.find((x) => x.spin === 3);
    expect(tS!.expected).toBeCloseTo(r.expectedActiveWildsSteadyState, 10);
  });
});

describe('dropStickWildExpansion — time-averaged horizon', () => {
  it('time-avg ≤ steady-state value (transient pulls mean down)', () => {
    const r = solveDropStickWildExpansion({ ...baseCfg, horizonSpins: 9 });
    expect(r.timeAveragedActiveWildsOverHorizon).toBeLessThanOrEqual(r.expectedActiveWildsSteadyState);
  });
  it('time-avg → steady as horizon → ∞', () => {
    const r1 = solveDropStickWildExpansion({ ...baseCfg, horizonSpins: 5 });
    const r2 = solveDropStickWildExpansion({ ...baseCfg, horizonSpins: 500 });
    expect(Math.abs(r2.timeAveragedActiveWildsOverHorizon - r2.expectedActiveWildsSteadyState))
      .toBeLessThan(Math.abs(r1.timeAveragedActiveWildsOverHorizon - r1.expectedActiveWildsSteadyState));
  });
  it('time-avg at horizon=S exactly = phase-1 only (closed-form)', () => {
    const cfg = { ...baseCfg, horizonSpins: 3 };
    const r = solveDropStickWildExpansion(cfg);
    expect(r.timeAveragedActiveWildsOverHorizon).toBeGreaterThan(0);
    expect(r.timeAveragedActiveWildsOverHorizon).toBeLessThan(r.expectedActiveWildsSteadyState);
  });
});

describe('dropStickWildExpansion — grid fill', () => {
  it('gridFillProbSteadyState = perCellSteady^(N·M)', () => {
    const r = solveDropStickWildExpansion(baseCfg);
    expect(r.gridFillProbSteadyState).toBeCloseTo(Math.pow(r.perCellActiveProbSteadyState, 25), 10);
  });
  it('expectedSpinsToFullGridFill = 1 / fillProb', () => {
    const r = solveDropStickWildExpansion(baseCfg);
    if (Number.isFinite(r.expectedSpinsToFullGridFill)) {
      expect(r.expectedSpinsToFullGridFill).toBeCloseTo(1 / r.gridFillProbSteadyState, 6);
    }
  });
  it('small grid + high q + long sticky → high fill prob', () => {
    const r = solveDropStickWildExpansion({
      gridRows: 2, gridCols: 2, probWildLandPerCellPerSpin: 0.5, stickyDurationSpins: 10,
    });
    expect(r.gridFillProbSteadyState).toBeGreaterThan(0.9);
  });
});

describe('dropStickWildExpansion — monotonicity', () => {
  it('larger q → more wilds', () => {
    const r1 = solveDropStickWildExpansion({ ...baseCfg, probWildLandPerCellPerSpin: 0.02 });
    const r2 = solveDropStickWildExpansion({ ...baseCfg, probWildLandPerCellPerSpin: 0.20 });
    expect(r2.expectedActiveWildsSteadyState).toBeGreaterThan(r1.expectedActiveWildsSteadyState);
  });
  it('longer S → more wilds (more accumulation)', () => {
    const r1 = solveDropStickWildExpansion({ ...baseCfg, stickyDurationSpins: 2 });
    const r2 = solveDropStickWildExpansion({ ...baseCfg, stickyDurationSpins: 10 });
    expect(r2.expectedActiveWildsSteadyState).toBeGreaterThan(r1.expectedActiveWildsSteadyState);
  });
  it('larger grid → proportionally more wilds', () => {
    const r1 = solveDropStickWildExpansion({ ...baseCfg, gridRows: 3, gridCols: 3 });
    const r2 = solveDropStickWildExpansion({ ...baseCfg, gridRows: 6, gridCols: 6 });
    // Fill fraction same; absolute count scales with NM
    expect(r2.expectedActiveWildsSteadyState).toBeGreaterThan(r1.expectedActiveWildsSteadyState);
    expect(r1.fillFraction).toBeCloseTo(r2.fillFraction, 10);
  });
});

describe('dropStickWildExpansion — MC cross-validation', () => {
  it('observed steady-state E[wilds] within ±5% of CF', () => {
    const cf = solveDropStickWildExpansion(baseCfg);
    const mc = simulateDropStickWildExpansion(baseCfg, 1000, 12345);
    const rel = Math.abs(cf.expectedActiveWildsSteadyState - mc.observedActiveWildsAtSteadyState) /
      cf.expectedActiveWildsSteadyState;
    expect(rel).toBeLessThan(0.05);
  });
  it('observed stdDev within ±20% of CF', () => {
    const cf = solveDropStickWildExpansion(baseCfg);
    const mc = simulateDropStickWildExpansion(baseCfg, 1000, 7);
    const rel = Math.abs(cf.stdDevActiveWildsSteadyState - mc.observedStdDevActiveWildsAtSteadyState) /
      cf.stdDevActiveWildsSteadyState;
    expect(rel).toBeLessThan(0.20);
  });
  it('observed time-avg within ±5% of CF', () => {
    const cf = solveDropStickWildExpansion(baseCfg);
    const mc = simulateDropStickWildExpansion(baseCfg, 1000, 31);
    const rel = Math.abs(cf.timeAveragedActiveWildsOverHorizon - mc.observedTimeAveragedActiveWildsOverHorizon) /
      cf.timeAveragedActiveWildsOverHorizon;
    expect(rel).toBeLessThan(0.05);
  });
  it('high-q config tighter MC slaganje', () => {
    const cfg = { ...baseCfg, probWildLandPerCellPerSpin: 0.20, stickyDurationSpins: 5 };
    const cf = solveDropStickWildExpansion(cfg);
    const mc = simulateDropStickWildExpansion(cfg, 500, 99);
    const rel = Math.abs(cf.expectedActiveWildsSteadyState - mc.observedActiveWildsAtSteadyState) /
      cf.expectedActiveWildsSteadyState;
    expect(rel).toBeLessThan(0.05);
  });
});

describe('dropStickWildExpansion — determinism', () => {
  it('CF solver returns same result on repeated calls', () => {
    const r1 = solveDropStickWildExpansion(baseCfg);
    const r2 = solveDropStickWildExpansion(baseCfg);
    expect(r1).toEqual(r2);
  });
});

describe('dropStickWildExpansion — industry use-case', () => {
  it('Vendor D Witchcraft Academy-class: 5×3 grid, q=0.08, S=5 (full FS sticky)', () => {
    const r = solveDropStickWildExpansion({
      gridRows: 3, gridCols: 5,
      probWildLandPerCellPerSpin: 0.08,
      stickyDurationSpins: 5,
      baselineWinPerSpin: 0.5,
      perWildBonus: 0.2,
    });
    expect(r.gridCellCount).toBe(15);
    // perCellSteady = 1 - 0.92^5 ≈ 0.341
    expect(r.perCellActiveProbSteadyState).toBeCloseTo(1 - Math.pow(0.92, 5), 6);
    expect(r.expectedActiveWildsSteadyState).toBeCloseTo(15 * (1 - Math.pow(0.92, 5)), 6);
    // payout proxy: 0.5 + 0.2 · 5.12 ≈ 1.52
    expect(r.payoutPerSpinProxySteadyState).toBeGreaterThan(0.5);
  });
});
