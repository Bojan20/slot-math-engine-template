// W209 Agent B — Template browser + templates registry specs.

import { describe, it, expect } from 'vitest';
import templatesJson from '../data/templates.json' assert { type: 'json' };
import type { TemplateEntry } from '../src/templates.js';
import {
  filterTemplates,
  sortTemplates,
  templateStats,
  getTemplateById,
} from '../src/templates.js';
import {
  defaultTemplateBrowserState,
  priceBuckets,
  statsRibbonText,
  visibleTemplates,
} from '../src/template-browser.js';

const TEMPLATES = (templatesJson as { templates: TemplateEntry[] }).templates;

describe('templates · data integrity', () => {
  it('seeds exactly 6 templates with required fields', () => {
    expect(TEMPLATES.length).toBe(6);
    for (const t of TEMPLATES) {
      expect(t.id).toMatch(/^tpl-/);
      expect(t.displayName.length).toBeGreaterThan(0);
      expect(t.based_on_pids.length).toBeGreaterThan(0);
      expect(t.lw_gap_target).toMatch(/^M\d+/);
      expect(t.price_usd).toBeGreaterThan(0);
      expect(t.rtp_target).toBeGreaterThan(90);
      expect(t.rtp_target).toBeLessThan(100);
      expect(t.tags.length).toBeGreaterThan(0);
      expect(t.ready_to_ship_days).toBeGreaterThan(0);
      expect(t.preview_image).toMatch(/\.svg$/);
    }
  });

  it('every template has a unique id', () => {
    const ids = new Set(TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(TEMPLATES.length);
  });

  it('covers a mix of L&W gaps M4, M5, M7, M10, M14, M16', () => {
    const gaps = new Set(TEMPLATES.map((t) => t.lw_gap_target));
    for (const expected of ['M4', 'M5', 'M7', 'M10', 'M14', 'M16']) {
      expect(gaps.has(expected)).toBe(true);
    }
  });

  it('covers diverse layouts (5x3, 5x4, 6x3, 6x4, dual-grid)', () => {
    const layouts = new Set(TEMPLATES.map((t) => t.layout));
    expect(layouts.size).toBeGreaterThanOrEqual(5);
  });
});

describe('templates · filter + sort', () => {
  it('filters by lw_gap', () => {
    const r = filterTemplates(TEMPLATES, { lw_gap: 'M5' });
    expect(r.length).toBeGreaterThan(0);
    for (const t of r) expect(t.lw_gap_target).toBe('M5');
  });

  it('filters by layout', () => {
    const r = filterTemplates(TEMPLATES, { layout: '5x3' });
    for (const t of r) expect(t.layout).toBe('5x3');
  });

  it('filters by volatility', () => {
    const r = filterTemplates(TEMPLATES, { volatility: 'high' });
    for (const t of r) expect(t.volatility).toBe('high');
  });

  it('filters by price range', () => {
    const r = filterTemplates(TEMPLATES, { priceRange: [25000, 28000] });
    for (const t of r) {
      expect(t.price_usd).toBeGreaterThanOrEqual(25000);
      expect(t.price_usd).toBeLessThanOrEqual(28000);
    }
  });

  it('filters by tag', () => {
    const r = filterTemplates(TEMPLATES, { tag: 'underwater' });
    for (const t of r) expect(t.tags).toContain('underwater');
  });

  it('search matches description case-insensitively', () => {
    const r = filterTemplates(TEMPLATES, { search: 'PHOENIX' });
    expect(r.length).toBeGreaterThan(0);
  });

  it('sort price-asc puts cheapest first', () => {
    const r = sortTemplates(TEMPLATES, 'price-asc');
    for (let i = 1; i < r.length; i++) expect(r[i - 1].price_usd <= r[i].price_usd).toBe(true);
  });

  it('sort speed puts fastest-ship first', () => {
    const r = sortTemplates(TEMPLATES, 'speed');
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].ready_to_ship_days <= r[i].ready_to_ship_days).toBe(true);
    }
  });

  it('sort name is alphabetic', () => {
    const r = sortTemplates(TEMPLATES, 'name');
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].displayName.localeCompare(r[i].displayName) <= 0).toBe(true);
    }
  });
});

describe('templates · stats + lookup', () => {
  it('templateStats summarises the 6 seeds', () => {
    const s = templateStats(TEMPLATES);
    expect(s.totalTemplates).toBe(6);
    expect(s.averageRtpPct).toBeGreaterThan(94);
    expect(s.averageRtpPct).toBeLessThan(97);
    expect(s.uniqueLwGaps).toBe(6);
    expect(s.fastestReadyDays).toBeGreaterThan(0);
  });

  it('getTemplateById returns the requested template', () => {
    const t = getTemplateById(TEMPLATES, 'tpl-quick-hit-dragons');
    expect(t.displayName).toBe('Quick Hit Dragons');
  });

  it('getTemplateById throws on unknown id', () => {
    expect(() => getTemplateById(TEMPLATES, 'tpl-bogus')).toThrow();
  });
});

describe('template-browser · state helpers', () => {
  it('defaultTemplateBrowserState starts empty', () => {
    const s = defaultTemplateBrowserState();
    expect(s.templates.length).toBe(0);
    expect(s.detailId).toBeNull();
    expect(s.sort).toBe('speed');
  });

  it('visibleTemplates applies sort + filter', () => {
    const s = { ...defaultTemplateBrowserState(), templates: TEMPLATES, sort: 'price-asc' as const };
    const v = visibleTemplates(s);
    expect(v.length).toBe(6);
    expect(v[0].price_usd).toBeLessThanOrEqual(v[v.length - 1].price_usd);
  });

  it('statsRibbonText composes the stats line', () => {
    const s = { ...defaultTemplateBrowserState(), templates: TEMPLATES };
    const txt = statsRibbonText(s);
    expect(txt).toContain('6 templates');
    expect(txt).toContain('L&W gaps');
  });

  it('priceBuckets returns 3 buckets', () => {
    const b = priceBuckets(TEMPLATES);
    expect(b.length).toBe(3);
    const total = b.reduce((a, x) => a + x.count, 0);
    expect(total).toBe(TEMPLATES.length);
  });
});
