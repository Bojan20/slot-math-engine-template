// IR Library tests (CORTI 200.1).
//
// Validates the 26-item starter-IR catalog end-to-end:
//   - registry shape (`web/studio/ir-library/index.json`)
//   - 16 L&W M-gap IRs exist, parse via Zod, carry the right tags
//   - 10 industry-classic IRs exist, parse via Zod, target_rtp band
//   - filterItems pipeline (search / category / topology) is correct
//   - generator script is idempotent (rerun produces no diff)
//
// All file reads use the synchronous fs API since the tests run under
// Node (vitest `environment: node`) — the production loader uses the
// async fetch API in the browser, but the JSON shape is identical so
// the tests exercise the canonical data without DOM coupling.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseGameIR } from '@engine/ir/index.js';
import type { SlotGameIR } from '@engine/ir/types.js';
import { filterItems, type LibraryItem } from '../src/ir-library.js';

const __dirname    = fileURLToPath(new URL('.', import.meta.url));
const STUDIO_ROOT  = resolve(__dirname, '..');
const LIB_ROOT     = resolve(STUDIO_ROOT, 'ir-library');
const LW_DIR       = resolve(LIB_ROOT, 'lw-mgaps');
const CLASSICS_DIR = resolve(LIB_ROOT, 'classics');
const INDEX_PATH   = resolve(LIB_ROOT, 'index.json');
const REPO_ROOT    = resolve(STUDIO_ROOT, '../..');
const GEN_SCRIPT   = resolve(REPO_ROOT, 'scripts/generate-ir-library.mjs');

interface RegistryItem {
  id: string;
  file: string;
  title: string;
  supplier?: string;
  year?: number;
  topology?: string;
  mGap?: string;
}
interface Registry {
  schema_version: string;
  total_items: number;
  categories: Array<{
    id: string;
    name: string;
    description: string;
    items: RegistryItem[];
  }>;
}

let registry: Registry;
let lwItems: RegistryItem[];
let classicItems: RegistryItem[];
let irByFile: Map<string, SlotGameIR>;

function loadIR(relFile: string): SlotGameIR {
  const abs = resolve(LIB_ROOT, relFile);
  const raw = JSON.parse(readFileSync(abs, 'utf8')) as unknown;
  const parsed = parseGameIR(raw);
  if (!parsed.ok) {
    const first = parsed.issues[0];
    throw new Error(`parseGameIR rejected ${relFile}: ${first?.path}: ${first?.message}`);
  }
  return parsed.ir;
}

beforeAll(() => {
  registry = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as Registry;
  lwItems = registry.categories.find((c) => c.id === 'lw-mgaps')?.items ?? [];
  classicItems = registry.categories.find((c) => c.id === 'classics')?.items ?? [];
  irByFile = new Map();
  for (const cat of registry.categories) {
    for (const item of cat.items) {
      irByFile.set(item.file, loadIR(item.file));
    }
  }
});

describe('IR Library — registry shape', () => {
  it('index.json exists', () => {
    expect(existsSync(INDEX_PATH)).toBe(true);
  });

  it('declares total_items = 26', () => {
    expect(registry.total_items).toBe(26);
  });

  it('has exactly two categories (lw-mgaps + classics)', () => {
    expect(registry.categories.map((c) => c.id).sort()).toEqual(['classics', 'lw-mgaps']);
  });

  it('schema_version is a semver', () => {
    expect(registry.schema_version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('lw-mgaps category contains exactly 16 items', () => {
    expect(lwItems.length).toBe(16);
  });

  it('classics category contains exactly 10 items', () => {
    expect(classicItems.length).toBe(10);
  });

  it('every item has a unique id', () => {
    const allIds = registry.categories.flatMap((c) => c.items.map((i) => i.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('every item.file path is unique', () => {
    const allFiles = registry.categories.flatMap((c) => c.items.map((i) => i.file));
    expect(new Set(allFiles).size).toBe(allFiles.length);
  });
});

describe('IR Library — L&W M-gap files', () => {
  it('all 16 M-gap files exist on disk', () => {
    const onDisk = readdirSync(LW_DIR).filter((f) => f.endsWith('.ir.json'));
    expect(onDisk.length).toBe(16);
  });

  it('files M1 through M16 are present', () => {
    for (let n = 1; n <= 16; n++) {
      const found = lwItems.find((i) => i.id === `lw-m${n}`);
      expect(found, `lw-m${n} missing from registry`).toBeDefined();
    }
  });

  it('every L&W IR parses via parseGameIR', () => {
    for (const item of lwItems) {
      expect(irByFile.has(item.file), `${item.file} not loaded`).toBe(true);
    }
  });

  it("every L&W IR carries the 'lw-template' theme tag", () => {
    for (const item of lwItems) {
      const ir = irByFile.get(item.file)!;
      expect(ir.meta.theme_tags, `${item.id} tags`).toContain('lw-template');
    }
  });

  it('every L&W IR carries the matching m{N} theme tag', () => {
    for (const item of lwItems) {
      const ir = irByFile.get(item.file)!;
      expect(ir.meta.theme_tags.some((t) => /^m\d+$/.test(t))).toBe(true);
    }
  });

  it('every L&W IR registry entry carries a supplier line', () => {
    for (const item of lwItems) {
      expect(item.supplier, `${item.id}`).toMatch(/L&W/);
    }
  });
});

describe('IR Library — industry classic files', () => {
  it('all 10 classic files exist on disk', () => {
    const onDisk = readdirSync(CLASSICS_DIR).filter((f) => f.endsWith('.ir.json'));
    expect(onDisk.length).toBe(10);
  });

  it('every classic IR parses via parseGameIR', () => {
    for (const item of classicItems) {
      expect(irByFile.has(item.file)).toBe(true);
    }
  });

  it('every classic IR registry entry has a topology kind', () => {
    for (const item of classicItems) {
      expect(['rectangular', 'variable_rows', 'cluster_grid']).toContain(item.topology);
    }
  });

  it('every classic IR carries the "classic" theme tag', () => {
    for (const item of classicItems) {
      const ir = irByFile.get(item.file)!;
      expect(ir.meta.theme_tags).toContain('classic');
    }
  });
});

describe('IR Library — engine invariants (all 26)', () => {
  it('every IR has target_rtp in [0.92, 0.98]', () => {
    for (const ir of irByFile.values()) {
      expect(ir.limits.target_rtp).toBeGreaterThanOrEqual(0.92);
      expect(ir.limits.target_rtp).toBeLessThanOrEqual(0.98);
    }
  });

  it('every IR has between 9 and 15 symbols', () => {
    for (const ir of irByFile.values()) {
      expect(ir.symbols.length).toBeGreaterThanOrEqual(9);
      expect(ir.symbols.length).toBeLessThanOrEqual(15);
    }
  });

  it('every IR has at least one feature', () => {
    for (const ir of irByFile.values()) {
      expect(ir.features.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every IR has schema_version = 1.0.0', () => {
    for (const ir of irByFile.values()) {
      expect(ir.schema_version).toBe('1.0.0');
    }
  });

  it('every IR rtp_allocation sum is within tolerance of target_rtp', () => {
    for (const ir of irByFile.values()) {
      const a = ir.rtp_allocation;
      const sum = a.base_game + a.free_spins + a.hold_and_win + a.jackpot;
      expect(Math.abs(sum - ir.limits.target_rtp)).toBeLessThanOrEqual(a.tolerance);
    }
  });

  it('every IR declares at least one jurisdiction', () => {
    for (const ir of irByFile.values()) {
      expect(ir.compliance.jurisdictions.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('IR Library — filterItems pipeline', () => {
  function mkItem(over: Partial<LibraryItem>): LibraryItem {
    return {
      id: 'x',
      file: 'x.json',
      title: 'X',
      category: 'classics',
      ...over,
    };
  }

  const fixtures: LibraryItem[] = [
    mkItem({ id: 'lw-m1', title: 'M1 Dragon Spin', category: 'lw-mgaps', topology: 'rectangular', supplier: 'L&W Bally', mGap: 'M1' }),
    mkItem({ id: 'lw-m3', title: 'M3 Ultimate Fire Link', category: 'lw-mgaps', topology: 'cluster_grid', supplier: 'L&W Bally', mGap: 'M3' }),
    mkItem({ id: 'classic-1', title: 'Classic 5x3 Lines', category: 'classics', topology: 'rectangular' }),
    mkItem({ id: 'classic-2', title: 'Megaways 6-Reel', category: 'classics', topology: 'variable_rows' }),
  ];

  it('returns all items when filter is empty', () => {
    expect(filterItems(fixtures, {}).length).toBe(4);
  });

  it('filters by category', () => {
    expect(filterItems(fixtures, { category: 'lw-mgaps' }).map((i) => i.id)).toEqual(['lw-m1', 'lw-m3']);
  });

  it('filters by topology', () => {
    expect(filterItems(fixtures, { topology: 'cluster_grid' }).map((i) => i.id)).toEqual(['lw-m3']);
  });

  it('search matches title case-insensitively', () => {
    expect(filterItems(fixtures, { search: 'megaways' }).map((i) => i.id)).toEqual(['classic-2']);
  });

  it('search matches mGap label', () => {
    expect(filterItems(fixtures, { search: 'M3' }).map((i) => i.id)).toEqual(['lw-m3']);
  });

  it('search matches supplier line', () => {
    expect(filterItems(fixtures, { search: 'bally' }).map((i) => i.id).sort()).toEqual(['lw-m1', 'lw-m3']);
  });

  it('combines category + search', () => {
    const r = filterItems(fixtures, { category: 'lw-mgaps', search: 'Dragon' });
    expect(r.map((i) => i.id)).toEqual(['lw-m1']);
  });
});

describe('IR Library — generator idempotency', () => {
  it('npm run ir-library:gen produces a stable index.json on rerun', () => {
    // Read the current file checksum, regen, read again — must match
    // byte-for-byte (idempotent generator).
    const before = readFileSync(INDEX_PATH, 'utf8');
    execFileSync('node', [GEN_SCRIPT], { cwd: REPO_ROOT, stdio: 'pipe' });
    const after = readFileSync(INDEX_PATH, 'utf8');
    expect(after).toBe(before);
  });

  it('regen produces stable L&W IR bytes', () => {
    const sample = resolve(LW_DIR, 'M5-quick-hit-reel-bound-mystery.ir.json');
    const before = readFileSync(sample, 'utf8');
    execFileSync('node', [GEN_SCRIPT], { cwd: REPO_ROOT, stdio: 'pipe' });
    const after = readFileSync(sample, 'utf8');
    expect(after).toBe(before);
  });
});
