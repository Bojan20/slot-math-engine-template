/**
 * W211 Agent B — ROI calculator unit tests.
 *
 * Covers: pure math (savings / NPV / break-even / marketplace ARR),
 * edge cases (zero games, extreme inputs, clamping), and sensitivity
 * sweep correctness.
 */

import { describe, it, expect } from 'vitest';
import {
  computeRoi,
  DEFAULT_INPUTS,
  DEFAULT_CONSTANTS,
  annualCostSavings,
  acceleratedWeeksPerGame,
  annualTimeSavedWeeks,
  fiveYearNpv,
  breakEvenMonths,
  marketplaceArr,
  sensitivitySweep,
  mountRoiCalculator,
  renderRoiSummary,
} from '../src/roi-calculator.js';

describe('ROI · annualCostSavings', () => {
  it('default 30 games × $250K × 0.75 × juris-amp(8) = ~$7.4M', () => {
    // base = 30 * 250000 * 0.75 = 5_625_000
    // jurisAmp = 1 + (8-1)*0.08 = 1.56
    // savings ≈ 5_625_000 * 1.56 = 8_775_000
    const s = annualCostSavings(DEFAULT_INPUTS);
    expect(s).toBeGreaterThan(8_000_000);
    expect(s).toBeLessThan(10_000_000);
  });

  it('higher jurisdictions amplify savings linearly', () => {
    const lo = annualCostSavings({ ...DEFAULT_INPUTS, jurisdictions: 1 });
    const hi = annualCostSavings({ ...DEFAULT_INPUTS, jurisdictions: 15 });
    expect(hi).toBeGreaterThan(lo);
  });

  it('clamps zero/negative games to floor of 1', () => {
    const s = annualCostSavings({ ...DEFAULT_INPUTS, gamesPerYear: 0 });
    expect(s).toBeGreaterThan(0);
  });
});

describe('ROI · time acceleration', () => {
  it('default 26 weeks at 70% reduction = 7.8 weeks', () => {
    expect(acceleratedWeeksPerGame(DEFAULT_INPUTS)).toBeCloseTo(7.8, 1);
  });

  it('annual time saved scales with games', () => {
    const a = annualTimeSavedWeeks(DEFAULT_INPUTS);
    const b = annualTimeSavedWeeks({ ...DEFAULT_INPUTS, gamesPerYear: 60 });
    expect(b).toBeCloseTo(a * 2, 0);
  });
});

describe('ROI · fiveYearNpv', () => {
  it('NPV of $1M for 5 years at 10% ≈ $3.79M', () => {
    const v = fiveYearNpv(1_000_000);
    expect(v).toBeGreaterThan(3_700_000);
    expect(v).toBeLessThan(3_800_000);
  });

  it('NPV of zero savings is zero', () => {
    expect(fiveYearNpv(0)).toBe(0);
  });

  it('NPV monotonically increases with savings', () => {
    expect(fiveYearNpv(2_000_000)).toBeGreaterThan(fiveYearNpv(1_000_000));
  });
});

describe('ROI · breakEvenMonths', () => {
  it('breaks even faster with bigger savings', () => {
    const fast = breakEvenMonths(20_000_000);
    const slow = breakEvenMonths(2_000_000);
    expect(fast).toBeLessThan(slow);
  });

  it('returns Infinity when savings are zero or negative', () => {
    expect(breakEvenMonths(0)).toBe(Number.POSITIVE_INFINITY);
    expect(breakEvenMonths(-100)).toBe(Number.POSITIVE_INFINITY);
  });

  it('default inputs break even within 12 months', () => {
    const r = computeRoi(DEFAULT_INPUTS);
    expect(r.breakEvenMonths).toBeLessThanOrEqual(12);
  });
});

describe('ROI · marketplaceArr', () => {
  it('default 50-operator network yields >$100K ARR', () => {
    // templateRev = 8 * 25000 * 0.30 = 60_000
    // operatorBonus = 50 * 1200 = 60_000
    // total = 120_000
    const v = marketplaceArr(DEFAULT_INPUTS);
    expect(v).toBeGreaterThanOrEqual(100_000);
    expect(v).toBeLessThan(200_000);
  });

  it('scales with operator network size', () => {
    const a = marketplaceArr({ ...DEFAULT_INPUTS, operatorNetwork: 50 });
    const b = marketplaceArr({ ...DEFAULT_INPUTS, operatorNetwork: 250 });
    expect(b).toBeGreaterThan(a);
  });
});

describe('ROI · computeRoi bundle', () => {
  it('returns all output fields', () => {
    const r = computeRoi(DEFAULT_INPUTS);
    expect(r.annualCostSavings).toBeGreaterThan(0);
    expect(r.acceleratedWeeksPerGame).toBeGreaterThan(0);
    expect(r.annualTimeSavedWeeks).toBeGreaterThan(0);
    expect(r.fiveYearNpv).toBeGreaterThan(0);
    expect(r.breakEvenMonths).toBeGreaterThan(0);
    expect(r.marketplaceArr).toBeGreaterThan(0);
    expect(r.inputs).toBeDefined();
    expect(r.constants).toEqual(DEFAULT_CONSTANTS);
  });

  it('clamps extreme inputs without crashing', () => {
    const r = computeRoi({
      gamesPerYear: 99999,
      costPerGame: 99_999_999,
      weeksPerGame: -10,
      jurisdictions: -1,
      operatorNetwork: 0,
    });
    expect(r.annualCostSavings).toBeGreaterThan(0);
    expect(r.acceleratedWeeksPerGame).toBeGreaterThan(0);
    expect(r.inputs.gamesPerYear).toBeLessThanOrEqual(500);
    expect(r.inputs.weeksPerGame).toBeGreaterThanOrEqual(1);
  });
});

describe('ROI · sensitivity sweep', () => {
  it('sweep on gamesPerYear shows low < baseline < high', () => {
    const sw = sensitivitySweep(DEFAULT_INPUTS, 'gamesPerYear');
    expect(sw.low).toBeLessThan(sw.baseline);
    expect(sw.baseline).toBeLessThan(sw.high);
  });

  it('sweep on costPerGame shows positive sensitivity', () => {
    const sw = sensitivitySweep(DEFAULT_INPUTS, 'costPerGame');
    expect(sw.high).toBeGreaterThan(sw.low);
  });
});

describe('ROI · renderRoiSummary / mountRoiCalculator', () => {
  it('renderRoiSummary contains formatted USD strings and slider summary', () => {
    const out = computeRoi(DEFAULT_INPUTS);
    const html = renderRoiSummary(out);
    expect(html).toContain('lw-roi-summary');
    expect(html).toContain('annual cost savings');
    expect(html).toContain('5-year NPV');
  });

  it('mountRoiCalculator writes 5 sliders to host innerHTML', () => {
    const host = { root: { innerHTML: '' } };
    mountRoiCalculator(host);
    expect(host.root.innerHTML).toContain('lw-roi-sliders');
    expect((host.root.innerHTML.match(/type="range"/g) ?? []).length).toBe(5);
    expect(host.root.innerHTML).toContain('gamesPerYear');
    expect(host.root.innerHTML).toContain('costPerGame');
    expect(host.root.innerHTML).toContain('weeksPerGame');
    expect(host.root.innerHTML).toContain('jurisdictions');
    expect(host.root.innerHTML).toContain('operatorNetwork');
  });

  it('mountRoiCalculator triggers onUpdate with the computed bundle', () => {
    let captured: { fiveYearNpv: number } | null = null;
    const host = { root: { innerHTML: '' }, onUpdate: (o: { fiveYearNpv: number }) => { captured = o; } };
    mountRoiCalculator(host);
    expect(captured).not.toBeNull();
    expect(captured!.fiveYearNpv).toBeGreaterThan(0);
  });
});

describe('ROI · regression guard for defaults', () => {
  it('default inputs produce numbers in expected commercial ranges', () => {
    const r = computeRoi(DEFAULT_INPUTS);
    expect(r.annualCostSavings).toBeGreaterThan(5_000_000);
    expect(r.annualCostSavings).toBeLessThan(15_000_000);
    expect(r.fiveYearNpv).toBeGreaterThan(20_000_000);
    expect(r.fiveYearNpv).toBeLessThan(60_000_000);
    expect(r.acceleratedWeeksPerGame).toBeGreaterThan(5);
    expect(r.acceleratedWeeksPerGame).toBeLessThan(12);
  });
});
