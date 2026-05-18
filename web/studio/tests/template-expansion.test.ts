// CORTI 200.8 — Template expansion library tests.
//
// Validates the expansion catalog produced by `scripts/generate-
// ir-expansion.mjs`:
//   - 100+ templates total (base 26 + expansion 80+)
//   - index-expansion.json shape
//   - every expansion IR parses via parseGameIR
//   - all 10 expansion categories present
//   - generator idempotency

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseGameIR } from '@engine/ir/index.js';

const __dirname   = fileURLToPath(new URL('.', import.meta.url));
const STUDIO_ROOT = resolve(__dirname, '..');
const LIB_ROOT    = resolve(STUDIO_ROOT, 'ir-library');
const EXP_INDEX   = resolve(LIB_ROOT, 'index-expansion.json');
const BASE_INDEX  = resolve(LIB_ROOT, 'index.json');
const REPO_ROOT   = resolve(STUDIO_ROOT, '../..');
const GEN_SCRIPT  = resolve(REPO_ROOT, 'scripts/generate-ir-expansion.mjs');

interface ExpItem { id: string; file: string; title: string; topology: string; supplier?: string; mGap?: string; year?: number; }
interface ExpCat  { id: string; name: string; description: string; items: ExpItem[]; }
interface ExpIdx  { schema_version: string; generated_by: string; total_items: number; categories: ExpCat[]; }

let idx: ExpIdx;
let baseIdx: { total_items: number };
let allItems: ExpItem[];

beforeAll(() => {
  idx = JSON.parse(readFileSync(EXP_INDEX, 'utf8')) as ExpIdx;
  baseIdx = JSON.parse(readFileSync(BASE_INDEX, 'utf8')) as { total_items: number };
  allItems = idx.categories.flatMap((c) => c.items);
});

describe('Template expansion — index shape', () => {
  it('index-expansion.json exists', () => {
    expect(existsSync(EXP_INDEX)).toBe(true);
  });

  it('declares schema_version 1.0.0', () => {
    expect(idx.schema_version).toBe('1.0.0');
  });

  it('declares at least 80 expansion items', () => {
    expect(idx.total_items).toBeGreaterThanOrEqual(80);
  });

  it('declares all 10 expansion categories', () => {
    const ids = idx.categories.map((c) => c.id).sort();
    expect(ids).toEqual([
      'bonus', 'cascade', 'classic-lines', 'cluster',
      'freespins', 'holdwin', 'hybrid', 'jackpot',
      'lw-enhanced', 'megaways',
    ]);
  });
});

describe('Template expansion — totals', () => {
  it('total templates across base + expansion ≥ 100', () => {
    expect(baseIdx.total_items + idx.total_items).toBeGreaterThanOrEqual(100);
  });

  it('classic-lines category has 5 items', () => {
    expect(idx.categories.find((c) => c.id === 'classic-lines')!.items.length).toBe(5);
  });

  it('megaways category has 10 items', () => {
    expect(idx.categories.find((c) => c.id === 'megaways')!.items.length).toBe(10);
  });

  it('cluster category has 10 items', () => {
    expect(idx.categories.find((c) => c.id === 'cluster')!.items.length).toBe(10);
  });

  it('cascade category has 10 items', () => {
    expect(idx.categories.find((c) => c.id === 'cascade')!.items.length).toBe(10);
  });

  it('holdwin category has 10 items', () => {
    expect(idx.categories.find((c) => c.id === 'holdwin')!.items.length).toBe(10);
  });

  it('freespins category has 15 items', () => {
    expect(idx.categories.find((c) => c.id === 'freespins')!.items.length).toBe(15);
  });

  it('bonus category has 10 items', () => {
    expect(idx.categories.find((c) => c.id === 'bonus')!.items.length).toBe(10);
  });

  it('jackpot category has 10 items', () => {
    expect(idx.categories.find((c) => c.id === 'jackpot')!.items.length).toBe(10);
  });

  it('hybrid category has 10 items', () => {
    expect(idx.categories.find((c) => c.id === 'hybrid')!.items.length).toBe(10);
  });

  it('lw-enhanced category has 64 items (16 gaps × 4 profiles)', () => {
    expect(idx.categories.find((c) => c.id === 'lw-enhanced')!.items.length).toBe(64);
  });
});

describe('Template expansion — IR validity', () => {
  it('every expansion IR parses via parseGameIR', () => {
    for (const item of allItems) {
      const abs = resolve(LIB_ROOT, item.file);
      const raw = JSON.parse(readFileSync(abs, 'utf8')) as unknown;
      const res = parseGameIR(raw);
      expect(res.ok, `parse failed: ${item.id}`).toBe(true);
    }
  });

  it('every expansion IR file exists on disk', () => {
    for (const item of allItems) {
      expect(existsSync(resolve(LIB_ROOT, item.file)), item.file).toBe(true);
    }
  });

  it('expansion item ids are unique', () => {
    const ids = allItems.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every classic-lines IR has classic theme tag', () => {
    const items = idx.categories.find((c) => c.id === 'classic-lines')!.items;
    for (const item of items) {
      const ir = JSON.parse(readFileSync(resolve(LIB_ROOT, item.file), 'utf8'));
      expect(ir.meta.theme_tags).toContain('classic');
    }
  });
});

describe('Template expansion — directory hygiene', () => {
  for (const dir of ['classic-lines', 'megaways', 'cluster', 'cascade', 'holdwin', 'freespins', 'bonus', 'jackpot', 'hybrid', 'lw-enhanced']) {
    it(`${dir}/ contains only *.ir.json files`, () => {
      const onDisk = readdirSync(resolve(LIB_ROOT, dir));
      for (const f of onDisk) expect(f.endsWith('.ir.json'), f).toBe(true);
    });
  }
});

describe('Template expansion — generator idempotency', () => {
  it('regen produces stable index-expansion.json', () => {
    const before = readFileSync(EXP_INDEX, 'utf8');
    execFileSync('node', [GEN_SCRIPT], { cwd: REPO_ROOT, stdio: 'pipe' });
    const after = readFileSync(EXP_INDEX, 'utf8');
    expect(after).toBe(before);
  });
});
