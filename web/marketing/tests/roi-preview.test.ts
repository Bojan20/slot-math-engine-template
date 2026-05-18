/**
 * W214 Faza 800.1 Agent C — ROI preview kernel unit tests.
 *
 * Covers: clamping, annual savings math, NPV, formatting, sensitivity
 * (more games → more savings; more jurisdictions → linear amplification),
 * HTML rendering shape.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INPUTS,
  DEFAULT_CONSTANTS,
  clampInputs,
  annualSavings,
  threeYearNpv,
  computeRoiPreview,
  formatUsd,
  renderRoiPreviewHtml,
} from '../components/roi-preview.ts';

describe('ROI preview · clamp', () => {
  it('floors zero/negative inputs to safe minimums', () => {
    const c = clampInputs({ gamesPerYear: 0, costPerGame: 0, jurisdictions: 0 });
    expect(c.gamesPerYear).toBe(1);
    expect(c.costPerGame).toBe(10_000);
    expect(c.jurisdictions).toBe(1);
  });
  it('caps unrealistically large inputs', () => {
    const c = clampInputs({ gamesPerYear: 99_999, costPerGame: 999_999_999, jurisdictions: 999 });
    expect(c.gamesPerYear).toBe(200);
    expect(c.costPerGame).toBe(1_000_000);
    expect(c.jurisdictions).toBe(15);
  });
});

describe('ROI preview · annualSavings', () => {
  it('default 20 × $200K × 0.75 × jurisAmp(5) → ~$4.2M', () => {
    // base = 20 * 200_000 * 0.75 = 3_000_000
    // amp = 1 + 4 * 0.08 = 1.32 → 3_960_000
    const s = annualSavings(DEFAULT_INPUTS);
    expect(s).toBeGreaterThan(3_500_000);
    expect(s).toBeLessThan(5_000_000);
  });
  it('more jurisdictions amplify savings monotonically', () => {
    const lo = annualSavings({ ...DEFAULT_INPUTS, jurisdictions: 1 });
    const hi = annualSavings({ ...DEFAULT_INPUTS, jurisdictions: 15 });
    expect(hi).toBeGreaterThan(lo);
  });
  it('more games scale savings ~linearly', () => {
    const s1 = annualSavings({ ...DEFAULT_INPUTS, gamesPerYear: 10 });
    const s2 = annualSavings({ ...DEFAULT_INPUTS, gamesPerYear: 20 });
    // not exact 2x due to integer rounding, but close
    expect(s2 / s1).toBeGreaterThan(1.9);
    expect(s2 / s1).toBeLessThan(2.1);
  });
});

describe('ROI preview · NPV', () => {
  it('3-year NPV = annual × (sum of discount factors)', () => {
    const annual = annualSavings(DEFAULT_INPUTS);
    const npv = threeYearNpv(DEFAULT_INPUTS);
    // discount factors y1..y3 at 10% ≈ 0.909 + 0.826 + 0.751 ≈ 2.487
    const expected = annual * 2.487;
    expect(Math.abs(npv - expected)).toBeLessThan(annual * 0.01);
  });
  it('NPV is always smaller than 3 × annualSavings', () => {
    const a = annualSavings(DEFAULT_INPUTS);
    const n = threeYearNpv(DEFAULT_INPUTS);
    expect(n).toBeLessThan(3 * a);
  });
});

describe('ROI preview · formatUsd', () => {
  it('formats millions with one decimal under 10M', () => {
    expect(formatUsd(2_500_000)).toBe('$2.5M');
  });
  it('formats 10M+ as integer M', () => {
    expect(formatUsd(15_400_000)).toBe('$15M');
  });
  it('formats thousands with K', () => {
    expect(formatUsd(420_000)).toBe('$420K');
  });
  it('formats small values verbatim', () => {
    expect(formatUsd(500)).toBe('$500');
  });
});

describe('ROI preview · computeRoiPreview', () => {
  it('returns clamped inputs + non-negative outputs', () => {
    const o = computeRoiPreview({ gamesPerYear: -5, costPerGame: 5, jurisdictions: -1 });
    expect(o.inputs.gamesPerYear).toBeGreaterThanOrEqual(1);
    expect(o.annualSavings).toBeGreaterThan(0);
    expect(o.threeYearNpv).toBeGreaterThan(0);
  });
  it('default constants match exported DEFAULT_CONSTANTS', () => {
    expect(DEFAULT_CONSTANTS.costReductionPct).toBe(0.75);
    expect(DEFAULT_CONSTANTS.discountRate).toBe(0.1);
  });
});

describe('ROI preview · renderRoiPreviewHtml', () => {
  it('emits a <div class="roi-preview"> root', () => {
    const html = renderRoiPreviewHtml();
    expect(html).toContain('class="roi-preview"');
    expect(html).toContain('data-component="roi-preview"');
  });
  it('embeds three slider inputs', () => {
    const html = renderRoiPreviewHtml();
    expect(html).toContain('data-input="games"');
    expect(html).toContain('data-input="cost"');
    expect(html).toContain('data-input="juris"');
  });
  it('embeds two outputs', () => {
    const html = renderRoiPreviewHtml();
    expect(html).toContain('data-out="annual"');
    expect(html).toContain('data-out="npv"');
  });
});
