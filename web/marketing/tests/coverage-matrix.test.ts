/**
 * W214 Faza 800.1 Agent C — coverage matrix kernel unit tests.
 *
 * Locks the canonical 16/16 row count, validates filter / sort / counter
 * helpers, and snapshots the HTML rendering shape so a stale source-of-
 * truth doc (`KIMI_LW_PORTFOLIO_COVERAGE_2026-05-18.md`) blows up CI
 * before the marketing site ships a wrong number.
 */

import { describe, it, expect } from 'vitest';
import {
  COVERAGE_ROWS,
  filterCoverageRows,
  sortCoverageRows,
  countByTier,
  renderCoverageMatrixHtml,
} from '../components/coverage-matrix.ts';

describe('Coverage matrix · canonical data', () => {
  it('contains exactly 16 closed gaps (M1 … M16)', () => {
    expect(COVERAGE_ROWS.length).toBe(16);
  });
  it('every gap follows M<n> convention', () => {
    for (const r of COVERAGE_ROWS) {
      expect(r.gap).toMatch(/^M\d+$/);
    }
  });
  it('every row has a 7-char commit hash prefix', () => {
    for (const r of COVERAGE_ROWS) {
      expect(r.commit).toMatch(/^[0-9a-f]{7}$/);
    }
  });
  it('every row carries a tier in {Indie, Platform, Enterprise}', () => {
    const tiers = new Set(['Indie', 'Platform', 'Enterprise']);
    for (const r of COVERAGE_ROWS) {
      expect(tiers.has(r.tier)).toBe(true);
    }
  });
});

describe('Coverage matrix · filter', () => {
  it('filters by tier', () => {
    const indie = filterCoverageRows(COVERAGE_ROWS, { tier: 'Indie' });
    expect(indie.length).toBeGreaterThan(0);
    expect(indie.every((r) => r.tier === 'Indie')).toBe(true);
  });
  it('filters by volatility', () => {
    const high = filterCoverageRows(COVERAGE_ROWS, { volatility: 'high' });
    expect(high.every((r) => r.volatility === 'high')).toBe(true);
  });
  it('combines filters (AND semantics)', () => {
    const r = filterCoverageRows(COVERAGE_ROWS, {
      tier: 'Platform',
      volatility: 'high',
    });
    expect(r.every((x) => x.tier === 'Platform' && x.volatility === 'high')).toBe(true);
  });
  it('returns all rows for empty filter', () => {
    expect(filterCoverageRows(COVERAGE_ROWS, {}).length).toBe(16);
  });
});

describe('Coverage matrix · sort', () => {
  it('sorts gaps M1 → M16 numerically (not lexicographic)', () => {
    const sorted = sortCoverageRows(COVERAGE_ROWS, 'gap', 'asc');
    expect(sorted[0].gap).toBe('M1');
    expect(sorted[15].gap).toBe('M16');
    // critical: M2 must come before M10 (numeric), not after
    const idxM2 = sorted.findIndex((r) => r.gap === 'M2');
    const idxM10 = sorted.findIndex((r) => r.gap === 'M10');
    expect(idxM2).toBeLessThan(idxM10);
  });
  it('descending reverses', () => {
    const desc = sortCoverageRows(COVERAGE_ROWS, 'gap', 'desc');
    expect(desc[0].gap).toBe('M16');
  });
});

describe('Coverage matrix · countByTier', () => {
  it('sums to 16 across all tiers', () => {
    const c = countByTier(COVERAGE_ROWS);
    const total = Object.values(c).reduce((s, v) => s + v, 0);
    expect(total).toBe(16);
  });
});

describe('Coverage matrix · renderCoverageMatrixHtml', () => {
  it('emits a 16-row tbody', () => {
    const html = renderCoverageMatrixHtml();
    const trCount = (html.match(/<tr/g) ?? []).length;
    // 1 head row + 16 body rows = 17
    expect(trCount).toBe(17);
  });
  it('includes the data-component sentinel', () => {
    expect(renderCoverageMatrixHtml()).toContain('data-component="coverage-matrix"');
  });
  it('escapes HTML in mechanic names defensively', () => {
    const html = renderCoverageMatrixHtml([
      {
        gap: 'M1',
        name: '<script>alert(1)</script>',
        wave: 'W181',
        commit: 'a1b2c3d',
        tier: 'Indie',
        category: 'Math',
        volatility: 'high',
      },
    ]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
