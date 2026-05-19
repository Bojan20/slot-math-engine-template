// IR Library tests — originality-cleansed registry (no vendor IRs).
//
// Validates the post-cleanup starter-IR catalog end-to-end:
//   - registry shape  (`web/studio/ir-library/index.json`)
//   - classics (industry-generic patterns) exist, parse via Zod, target_rtp band
//   - pilots category present and lists studio-authored IRs
//   - filterItems pipeline (search / category / topology) is correct
//
// All file reads use the synchronous fs API since the tests run under
// Node (vitest `environment: node`) — the production loader uses the
// async fetch API in the browser, but the JSON shape is identical so
// the tests exercise the canonical data without DOM coupling.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGameIR } from '@engine/ir/index.js';
import type { SlotGameIR } from '@engine/ir/types.js';
import { filterItems, type LibraryItem } from '../src/ir-library.js';

const __dirname    = fileURLToPath(new URL('.', import.meta.url));
const STUDIO_ROOT  = resolve(__dirname, '..');
const LIB_ROOT     = resolve(STUDIO_ROOT, 'ir-library');
const CLASSICS_DIR = resolve(LIB_ROOT, 'classics');
const PILOTS_DIR   = resolve(STUDIO_ROOT, 'pilots');
const INDEX_PATH   = resolve(LIB_ROOT, 'index.json');

interface RegistryItem {
  id: string;
  file: string;
  title: string;
  studio?: string;
  year?: number;
  topology?: string;
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
let classicItems: RegistryItem[];
let pilotItems: RegistryItem[];
let irByFile: Map<string, SlotGameIR>;

function loadIR(relFile: string): SlotGameIR {
  // Files can live under ir-library/classics/* OR under studio root pilots/*
  const absLib = resolve(LIB_ROOT, relFile);
  const absStudio = resolve(STUDIO_ROOT, relFile);
  const abs = existsSync(absLib) ? absLib : absStudio;
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
  classicItems = registry.categories.find((c) => c.id === 'classics')?.items ?? [];
  pilotItems   = registry.categories.find((c) => c.id === 'pilots')?.items ?? [];
  irByFile = new Map();
  for (const cat of registry.categories) {
    for (const item of cat.items) {
      try {
        irByFile.set(item.file, loadIR(item.file));
      } catch (e) {
        // Pilot files may live outside ir-library/ — record nothing rather
        // than fail the beforeAll; per-item tests assert presence explicitly.
      }
    }
  }
});

describe('IR Library — registry shape (no vendor IRs)', () => {
  it('index.json exists', () => {
    expect(existsSync(INDEX_PATH)).toBe(true);
  });

  it('schema_version is a semver', () => {
    expect(registry.schema_version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('contains the two cleansed categories: classics + pilots', () => {
    const ids = registry.categories.map((c) => c.id).sort();
    expect(ids).toEqual(['classics', 'pilots']);
  });

  it('does not contain any vendor-template category (lw-mgaps removed)', () => {
    expect(registry.categories.find((c) => c.id === 'lw-mgaps')).toBeUndefined();
    expect(registry.categories.find((c) => c.id === 'lw-enhanced')).toBeUndefined();
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
});

describe('IR Library — studio pilots', () => {
  it('pilots directory exists', () => {
    expect(existsSync(PILOTS_DIR)).toBe(true);
  });

  it('every pilot referenced in the index resolves to a real file', () => {
    for (const item of pilotItems) {
      const abs = resolve(STUDIO_ROOT, item.file);
      expect(existsSync(abs), `pilot file missing: ${item.file}`).toBe(true);
    }
  });

  it('every pilot IR parses via parseGameIR', () => {
    for (const item of pilotItems) {
      expect(irByFile.has(item.file), `${item.file} not loaded`).toBe(true);
    }
  });
});

describe('IR Library — engine invariants (all parsed IRs)', () => {
  it('every IR has target_rtp in [0.85, 0.99]', () => {
    for (const ir of irByFile.values()) {
      expect(ir.limits.target_rtp).toBeGreaterThanOrEqual(0.85);
      expect(ir.limits.target_rtp).toBeLessThanOrEqual(0.99);
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
    mkItem({ id: 'pilot-1', title: 'Wrath of Olympus', category: 'pilots', topology: 'rectangular', studio: 'VanVinkl Studio' }),
    mkItem({ id: 'pilot-2', title: 'Cluster Demo',    category: 'pilots', topology: 'cluster_grid', studio: 'VanVinkl Studio' }),
    mkItem({ id: 'classic-1', title: 'Classic 5x3 Lines', category: 'classics', topology: 'rectangular' }),
    mkItem({ id: 'classic-2', title: 'Megaways 6-Reel',   category: 'classics', topology: 'variable_rows' }),
  ];

  it('returns all items when filter is empty', () => {
    expect(filterItems(fixtures, {}).length).toBe(4);
  });

  it('filters by category', () => {
    const out = filterItems(fixtures, { category: 'pilots' }).map((i) => i.id).sort();
    expect(out).toEqual(['pilot-1', 'pilot-2']);
  });

  it('filters by topology', () => {
    expect(filterItems(fixtures, { topology: 'cluster_grid' }).map((i) => i.id)).toEqual(['pilot-2']);
  });

  it('search matches title case-insensitively', () => {
    expect(filterItems(fixtures, { search: 'megaways' }).map((i) => i.id)).toEqual(['classic-2']);
  });

  it('search matches studio line', () => {
    expect(filterItems(fixtures, { search: 'vanvinkl' }).map((i) => i.id).sort()).toEqual(['pilot-1', 'pilot-2']);
  });

  it('combines category + search', () => {
    const r = filterItems(fixtures, { category: 'pilots', search: 'Olympus' });
    expect(r.map((i) => i.id)).toEqual(['pilot-1']);
  });
});
