/**
 * W215 — Operator Portfolio Fit tests.
 *
 * Validates the deterministic portfolio-fit calculator: seed data integrity,
 * NPV math, weighted coverage, override behavior, Markdown rendering, CLI.
 */
import { describe, it, expect } from 'vitest';

import {
  OPERATOR_SEEDS,
  computePortfolioFit,
  renderFitMarkdown,
  npvFiveYear,
  parseArgs,
  // @ts-expect-error — .mjs import, no .d.ts
} from '../../scripts/outreach/operator-portfolio-fit.mjs';

// @ts-expect-error — .mjs import, no .d.ts
import { OPERATORS } from '../../scripts/outreach/tier2-coverage-matrix.mjs';

describe('operator-portfolio-fit · seed data', () => {
  it('has seed entries for all 8 operators', () => {
    for (const op of OPERATORS) {
      expect(OPERATOR_SEEDS[op]).toBeDefined();
    }
  });

  it('every operator mechanicMix sums to ~1.0', () => {
    for (const op of Object.keys(OPERATOR_SEEDS)) {
      const seed = OPERATOR_SEEDS[op];
      const total = Object.values(seed.mechanicMix).reduce((a: number, b: any) => a + (b as number), 0);
      expect(Math.abs(total - 1.0)).toBeLessThan(0.01);
    }
  });

  it('every operator has positive portfolio size + annual ships', () => {
    for (const op of Object.keys(OPERATOR_SEEDS)) {
      const seed = OPERATOR_SEEDS[op];
      expect(seed.portfolioSize).toBeGreaterThan(0);
      expect(seed.annualShipsPre).toBeGreaterThan(0);
      expect(seed.annualShipsPost).toBeGreaterThan(seed.annualShipsPre);
      expect(seed.perTitleSavingUsd).toBeGreaterThan(0);
    }
  });
});

describe('operator-portfolio-fit · npvFiveYear', () => {
  it('returns positive NPV for positive annual savings', () => {
    expect(npvFiveYear(1_000_000)).toBeGreaterThan(0);
  });

  it('higher discount rate produces lower NPV', () => {
    const a = npvFiveYear(1_000_000, 0.05);
    const b = npvFiveYear(1_000_000, 0.15);
    expect(a).toBeGreaterThan(b);
  });

  it('NPV less than nominal 5-year sum (discounted)', () => {
    const annual = 1_000_000;
    const nominal = annual * 5;
    expect(npvFiveYear(annual)).toBeLessThan(nominal);
  });
});

describe('operator-portfolio-fit · computePortfolioFit', () => {
  it('produces valid fit for aristocrat (P0)', () => {
    const fit = computePortfolioFit('aristocrat');
    expect(fit.operator).toBe('aristocrat');
    expect(fit.region).toBe('AU+NA');
    expect(fit.priority).toBe('P0');
    expect(fit.weightedCoveragePct).toBeGreaterThan(0);
    expect(fit.weightedCoveragePct).toBeLessThanOrEqual(1);
    expect(fit.fiveYearNpvUsd).toBeGreaterThan(0);
    expect(fit.paybackMonths).toBeGreaterThan(0);
  });

  it('produces valid fit for all 8 operators', () => {
    for (const op of OPERATORS) {
      const fit = computePortfolioFit(op);
      expect(fit.operator).toBe(op);
      expect(fit.weightedCoveragePct).toBeGreaterThan(0);
    }
  });

  it('throws on unknown operator', () => {
    expect(() => computePortfolioFit('unknown_op_xxx')).toThrow();
  });

  it('is fully deterministic — same input, same output', () => {
    const a = JSON.stringify(computePortfolioFit('konami'));
    const b = JSON.stringify(computePortfolioFit('konami'));
    expect(a).toBe(b);
  });

  it('honors portfolioSize override', () => {
    const base = computePortfolioFit('aristocrat');
    const over = computePortfolioFit('aristocrat', { portfolioSize: 2400 });
    expect(over.inputs.portfolioSize).toBe(2400);
    expect(over.upfrontLicenseUsd).toBeGreaterThan(base.upfrontLicenseUsd);
  });

  it('honors perTitleSavingUsd override', () => {
    const a = computePortfolioFit('igt', { perTitleSavingUsd: 100_000 });
    const b = computePortfolioFit('igt', { perTitleSavingUsd: 300_000 });
    expect(b.annualSavingsUsd).toBeGreaterThan(a.annualSavingsUsd);
    expect(b.fiveYearNpvUsd).toBeGreaterThan(a.fiveYearNpvUsd);
  });

  it('mechanic-breakdown contributions sum to weightedCoveragePct', () => {
    const fit = computePortfolioFit('playtech');
    const breakdownSum = Object.values(fit.mechanicBreakdown).reduce(
      (a: number, m: any) => a + m.contribution,
      0,
    );
    expect(Math.abs(breakdownSum - fit.weightedCoveragePct)).toBeLessThan(1e-9);
  });

  it('velocity uplift factor matches input ratio', () => {
    const fit = computePortfolioFit('aristocrat');
    const expected = OPERATOR_SEEDS.aristocrat.annualShipsPost / OPERATOR_SEEDS.aristocrat.annualShipsPre;
    expect(fit.velocityUpliftFactor).toBeCloseTo(expected, 6);
  });

  it('higher discountRate => lower NPV', () => {
    const a = computePortfolioFit('aristocrat', { discountRate: 0.05 });
    const b = computePortfolioFit('aristocrat', { discountRate: 0.20 });
    expect(a.fiveYearNpvUsd).toBeGreaterThan(b.fiveYearNpvUsd);
  });
});

describe('operator-portfolio-fit · renderFitMarkdown', () => {
  it('produces non-trivial Markdown for every operator', () => {
    for (const op of OPERATORS) {
      const fit = computePortfolioFit(op);
      const md = renderFitMarkdown(fit);
      expect(md.length).toBeGreaterThan(500);
      expect(md).toContain(`# Portfolio Fit — ${op}`);
      expect(md).toContain('Weighted coverage');
      expect(md).toContain('5yr NPV');
    }
  });

  it('rendered Markdown is byte-stable for identical input', () => {
    const fit = computePortfolioFit('aristocrat');
    const a = renderFitMarkdown(fit);
    const b = renderFitMarkdown(fit);
    expect(a).toBe(b);
  });
});

describe('operator-portfolio-fit · CLI parsing', () => {
  it('parses --operator <slug>', () => {
    const a = parseArgs(['node', 'cli', '--operator', 'aristocrat']);
    expect(a.operator).toBe('aristocrat');
  });

  it('parses --operator=<slug>', () => {
    const a = parseArgs(['node', 'cli', '--operator=igt']);
    expect(a.operator).toBe('igt');
  });

  it('parses --portfolio-size numeric override', () => {
    const a = parseArgs(['node', 'cli', '--operator', 'konami', '--portfolio-size', '500']);
    expect(a.portfolioSize).toBe(500);
  });

  it('parses --json flag', () => {
    const a = parseArgs(['node', 'cli', '--operator', 'aristocrat', '--json']);
    expect(a.json).toBe(true);
  });

  it('parses --discount-rate override', () => {
    const a = parseArgs(['node', 'cli', '--operator', 'igt', '--discount-rate', '0.15']);
    expect(a.discountRate).toBeCloseTo(0.15, 6);
  });
});
