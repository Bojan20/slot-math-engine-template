// Studio CATALOG tab tests (W199).
//
// We exercise the JSON shape, the filter logic, the M-gap mapping,
// and the insert-into-variant action by importing the generated
// JSON files directly + reimplementing the filter pipeline as a
// pure function so tests stay free of DOM coupling.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CAT_PATH = resolve(__dirname, '../data/catalog-97.json');
const LW_PATH  = resolve(__dirname, '../data/lw-16.json');

interface Pattern {
  pid: string;
  title: string;
  wave: string;
  tier: 'base' | 'aggregator' | 'composer';
  complexity: 'L' | 'M' | 'H';
  variance: 'LOW' | 'MID' | 'HIGH';
  fam: string;
  isLWGap: boolean;
  lwMGap: string | null;
  compliance: string[];
  math: string;
  rtpBand: [number, number];
  paramRanges: Record<string, [number, number]>;
}
interface LWGap {
  m: string;
  pid: string | null;
  title: string;
  supplier: string;
  status: 'CLOSED' | 'PENDING';
}
interface CatalogDoc { totalPatterns: number; patterns: Pattern[]; lwGapsCovered: number; }
interface LWDoc { totalGaps: number; closedGaps: number; gaps: LWGap[]; }

let catalog: CatalogDoc;
let lw: LWDoc;

beforeAll(() => {
  catalog = JSON.parse(readFileSync(CAT_PATH, 'utf8')) as CatalogDoc;
  lw      = JSON.parse(readFileSync(LW_PATH,  'utf8')) as LWDoc;
});

// Pure filter pipeline mirror — keeps tests DOM-free.
interface Filters {
  search: string;
  tier: Set<string>;
  complexity: Set<string>;
  variance: Set<string>;
  lwOnly: boolean;
  jurisdictions: Set<string>;
  activeMGap: string | null;
  waveMin: number;
  waveMax: number;
}
function emptyFilters(): Filters {
  return {
    search: '',
    tier: new Set(),
    complexity: new Set(),
    variance: new Set(),
    lwOnly: false,
    jurisdictions: new Set(),
    activeMGap: null,
    waveMin: 49,
    waveMax: 196,
  };
}
function applyFilters(patterns: Pattern[], f: Filters): Pattern[] {
  const q = f.search.trim().toLowerCase();
  return patterns.filter((p) => {
    if (f.tier.size && !f.tier.has(p.tier)) return false;
    if (f.complexity.size && !f.complexity.has(p.complexity)) return false;
    if (f.variance.size && !f.variance.has(p.variance)) return false;
    if (f.lwOnly && !p.isLWGap) return false;
    if (f.activeMGap && p.lwMGap !== f.activeMGap) return false;
    if (q) {
      const hay = (p.title + ' ' + (p.math || '') + ' ' + p.pid).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.jurisdictions.size) {
      const ok = [...f.jurisdictions].every((j) => (p.compliance || []).includes(j));
      if (!ok) return false;
    }
    const wn = parseInt(String(p.wave || 'W049').slice(1), 10);
    if (wn < f.waveMin || wn > f.waveMax) return false;
    return true;
  });
}

describe('catalog data shape', () => {
  it('catalog-97.json loads and has 97 entries', () => {
    expect(catalog.totalPatterns).toBe(97);
    expect(catalog.patterns.length).toBe(97);
  });

  it('lw-16.json loads and has 16 entries', () => {
    expect(lw.totalGaps).toBe(16);
    expect(lw.gaps.length).toBe(16);
  });

  it('catalog has exactly 16 isLWGap=true entries', () => {
    const lwEntries = catalog.patterns.filter((p) => p.isLWGap);
    expect(lwEntries.length).toBe(16);
    const mIds = new Set(lwEntries.map((p) => p.lwMGap));
    expect(mIds.size).toBe(16);
    for (let i = 1; i <= 16; i++) expect(mIds.has(`M${i}`)).toBe(true);
  });

  it('every pattern carries non-empty compliance array', () => {
    for (const p of catalog.patterns) {
      expect(Array.isArray(p.compliance)).toBe(true);
      expect(p.compliance.length).toBeGreaterThan(0);
    }
  });

  it('every L&W M-gap has CLOSED status (16/16)', () => {
    const closed = lw.gaps.filter((g) => g.status === 'CLOSED').length;
    expect(closed).toBe(16);
    expect(lw.closedGaps).toBe(16);
  });
});

describe('catalog filters', () => {
  it('tier=base filter returns only base patterns (and at least 1)', () => {
    const f = emptyFilters();
    f.tier.add('base');
    const out = applyFilters(catalog.patterns, f);
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) expect(p.tier).toBe('base');
  });

  it('complexity=H filter returns only complex patterns', () => {
    const f = emptyFilters();
    f.complexity.add('H');
    const out = applyFilters(catalog.patterns, f);
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) expect(p.complexity).toBe('H');
  });

  it('search "Quick Hit" matches at least one L&W pattern with M5 gap', () => {
    const f = emptyFilters();
    f.search = 'Quick Hit';
    const out = applyFilters(catalog.patterns, f);
    expect(out.length).toBeGreaterThan(0);
    const hasM5 = out.some((p) => p.lwMGap === 'M5');
    expect(hasM5).toBe(true);
  });

  it('M-gap chip filter narrows grid to that single P-ID', () => {
    const f = emptyFilters();
    f.activeMGap = 'M5';
    const out = applyFilters(catalog.patterns, f);
    expect(out.length).toBe(1);
    expect(out[0].lwMGap).toBe('M5');
  });

  it('lwOnly toggle restricts to the 16 L&W gap entries', () => {
    const f = emptyFilters();
    f.lwOnly = true;
    const out = applyFilters(catalog.patterns, f);
    expect(out.length).toBe(16);
    for (const p of out) expect(p.isLWGap).toBe(true);
  });
});

describe('insert into variant (simulated)', () => {
  // We re-implement the insert action's mutation contract so the test
  // stays DOM-free while still verifying the data shape it produces
  // matches what app.js writes onto variant.composedKernels + variant.ir.
  type Variant = { name: string; composedKernels: string[]; ir?: { kernels: unknown[] }; activity: { msg: string; at: number }[] };
  function makeVariant(): Variant {
    return { name: 'Base', composedKernels: [], activity: [] };
  }
  function insert(v: Variant, p: Pattern): boolean {
    if (!v.composedKernels.includes(p.pid)) v.composedKernels.push(p.pid);
    if (!v.ir) v.ir = { kernels: [] };
    if (!Array.isArray(v.ir.kernels)) v.ir.kernels = [];
    const existing = (v.ir.kernels as { pid: string }[]).find((k) => k.pid === p.pid);
    if (!existing) {
      v.ir.kernels.push({ pid: p.pid, title: p.title, wave: p.wave, tier: p.tier, fam: p.fam, insertedAt: Date.now() });
    }
    v.activity.unshift({ msg: `kernel ${p.pid} (${p.title}) composed`, at: Date.now() });
    return true;
  }

  it('insert action adds kernel to variant.composedKernels + variant.ir.kernels', () => {
    const v = makeVariant();
    const target = catalog.patterns.find((p) => p.lwMGap === 'M5');
    expect(target).toBeDefined();
    const ok = insert(v, target!);
    expect(ok).toBe(true);
    expect(v.composedKernels).toContain(target!.pid);
    expect(v.ir!.kernels.length).toBe(1);
    expect(v.activity[0].msg).toContain(target!.pid);
  });

  it('idempotent · inserting same pattern twice does not duplicate', () => {
    const v = makeVariant();
    const target = catalog.patterns.find((p) => p.lwMGap === 'M6')!;
    insert(v, target);
    insert(v, target);
    expect(v.composedKernels.filter((x) => x === target.pid).length).toBe(1);
    expect(v.ir!.kernels.length).toBe(1);
  });
});

describe('command palette M1-M16 navigation', () => {
  it('every M-gap entry has a pid pointing at a real catalog pattern', () => {
    for (const g of lw.gaps) {
      if (g.status !== 'CLOSED') continue;
      expect(g.pid).toBeTruthy();
      const p = catalog.patterns.find((x) => x.pid === g.pid);
      expect(p, `M-gap ${g.m} points at unknown pid ${g.pid}`).toBeDefined();
      expect(p!.lwMGap).toBe(g.m);
    }
  });
});
