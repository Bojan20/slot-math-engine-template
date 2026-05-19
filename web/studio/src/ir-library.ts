// IR Library bridge — loads the 26-item starter catalog (`web/studio/
// ir-library/index.json` + per-item JSON files) and exposes a small API
// the "+ New Game" wizard uses to render the sub-modal, filter, preview,
// and load an IR into a fresh workspace.
//
// All IRs are validated through `parseGameIR()` (the engine's Zod-backed
// validator) on every load so a malformed file fails loudly instead of
// silently corrupting workspace state.
//
// The loader is fetch-based and `file://`-safe via Vite's `new URL(...,
// import.meta.url)` pattern — same approach used for `data/catalog-97.json`.
//
// Public surface: `loadLibrary()`, `filterItems()`, `loadIR(itemId)`.
// All other helpers stay internal.
//
// Test surface: `filterItems` is a pure function — exercised directly
// in `tests/ir-library.test.ts`.

import type { SlotGameIR } from '@engine/ir/types.js';
import { parseGameIR } from '@engine/ir/index.js';

// ─── Public types ──────────────────────────────────────────────────────
export interface LibraryItem {
  id: string;
  file: string;
  title: string;
  /** Category id this item lives under ('classics' | 'pilots'). */
  category: string;
  /** Originating studio / vendor (free-text, generic). */
  studio?: string;
  /** Year — for sort + display. */
  year?: number;
  /** Engine topology kind — used by the topology filter. */
  topology?: string;
}

export interface LibraryIndex {
  schema_version: string;
  total_items: number;
  categories: Array<{
    id: string;
    name: string;
    description: string;
    items: LibraryItem[];
  }>;
}

export interface LibraryFilter {
  /** Free-text — case-insensitive substring match across title + id + studio. */
  search?: string;
  /** Restrict to a single category, e.g. 'classics' or 'pilots'. */
  category?: string | null;
  /** Restrict to a single topology kind, e.g. 'rectangular'. */
  topology?: string | null;
}

export interface LibraryPreview {
  item: LibraryItem;
  ir: SlotGameIR;
  rtp: number;
  features: string[];
  topologyLabel: string;
  symbolCount: number;
}

// ─── Internal state — cached after first load ─────────────────────────
let cachedIndex: LibraryIndex | null = null;
let cachedAllItems: LibraryItem[] | null = null;
const irCache = new Map<string, SlotGameIR>();

/**
 * Resolve a path inside `web/studio/ir-library/` to an absolute URL the
 * fetch API can handle in dev, build, and `file://` contexts.
 */
function libraryUrl(relPath: string): string {
  return new URL(`../ir-library/${relPath}`, import.meta.url).href;
}

/**
 * Fetch + parse the library index. Cached after first call so the
 * wizard sub-modal opens instantly on repeat invocations.
 */
export async function loadLibrary(): Promise<LibraryIndex> {
  if (cachedIndex) return cachedIndex;
  const res = await fetch(libraryUrl('index.json'));
  if (!res.ok) throw new Error(`IR library index fetch failed: HTTP ${res.status}`);
  const raw = (await res.json()) as LibraryIndex;
  // Stitch category-id into each item so filters don't need a second lookup.
  for (const cat of raw.categories) {
    for (const item of cat.items) {
      (item as LibraryItem).category = cat.id;
    }
  }
  cachedIndex = raw;
  cachedAllItems = raw.categories.flatMap((c) => c.items);
  return raw;
}

/**
 * Flat list of all items across categories — useful for search +
 * iterate. Returns an empty array if the library has not been loaded
 * yet (caller should always `await loadLibrary()` first).
 */
export function getAllItems(): LibraryItem[] {
  return cachedAllItems ?? [];
}

/**
 * Pure filter pipeline — DOM-free so tests can exercise it directly.
 * Order: category → topology → search. Search matches on the lowercased
 * title, id, and (if present) studio with a substring test.
 */
export function filterItems(items: LibraryItem[], filter: LibraryFilter): LibraryItem[] {
  let out = items;
  if (filter.category) {
    out = out.filter((it) => it.category === filter.category);
  }
  if (filter.topology) {
    out = out.filter((it) => (it.topology ?? '') === filter.topology);
  }
  if (filter.search && filter.search.trim().length > 0) {
    const q = filter.search.trim().toLowerCase();
    out = out.filter((it) => {
      const hay = [it.title, it.id, it.studio ?? ''].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  return out;
}

/**
 * Fetch + Zod-validate one IR by item id. Throws if the item is
 * unknown or if Zod rejects the payload — both should be impossible in
 * normal flow (the generator validates every IR on write).
 */
export async function loadIR(itemId: string): Promise<SlotGameIR> {
  const cached = irCache.get(itemId);
  if (cached) return cached;
  if (!cachedIndex) await loadLibrary();
  const item = (cachedAllItems ?? []).find((i) => i.id === itemId);
  if (!item) throw new Error(`Unknown IR library item: ${itemId}`);
  const res = await fetch(libraryUrl(item.file));
  if (!res.ok) throw new Error(`IR library fetch failed: ${item.file} → HTTP ${res.status}`);
  const raw = (await res.json()) as unknown;
  const parsed = parseGameIR(raw);
  if (!parsed.ok) {
    const first = parsed.issues[0];
    throw new Error(
      `IR library item '${itemId}' failed validation: ${parsed.issues.length} issue(s)` +
        (first ? ` — ${first.path}: ${first.message}` : '')
    );
  }
  irCache.set(itemId, parsed.ir);
  return parsed.ir;
}

/**
 * Build a lightweight preview for the wizard sub-modal — does not run
 * RTP simulation, just surfaces the meta + feature kinds + topology.
 */
export async function previewIR(itemId: string): Promise<LibraryPreview> {
  if (!cachedAllItems) await loadLibrary();
  const item = (cachedAllItems ?? []).find((i) => i.id === itemId);
  if (!item) throw new Error(`Unknown IR library item: ${itemId}`);
  const ir = await loadIR(itemId);
  return {
    item,
    ir,
    rtp: ir.limits.target_rtp,
    features: ir.features.map((f) => f.kind),
    topologyLabel: topologyLabel(ir.topology),
    symbolCount: ir.symbols.length,
  };
}

function topologyLabel(t: SlotGameIR['topology']): string {
  switch (t.kind) {
    case 'rectangular':   return `${t.reels}x${t.rows} rectangular`;
    case 'variable_rows': return `${t.reels}-reel Megaways`;
    case 'cluster_grid':  return `${t.columns}x${t.rows} cluster (${t.adjacency})`;
    default: {
      const exhaustive: never = t;
      return String(exhaustive);
    }
  }
}

/**
 * Convenience — reset the in-memory cache. Used by tests to force a
 * fresh fetch after mocking the underlying JSON.
 */
export function resetLibraryCache(): void {
  cachedIndex = null;
  cachedAllItems = null;
  irCache.clear();
}

/**
 * Distinct topology kinds present across the library — used to populate
 * the topology filter dropdown in the wizard sub-modal.
 */
export function listTopologies(items: LibraryItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) if (it.topology) set.add(it.topology);
  return Array.from(set).sort();
}
