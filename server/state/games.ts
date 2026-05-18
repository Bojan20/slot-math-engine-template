/**
 * CORTI 200.4-BACKEND — registered games registry.
 *
 * Reads the 26-item IR library at `web/studio/ir-library/index.json`.
 * Each entry surfaces the metadata an operator's lobby would need to
 * render thumbnails + filter by jurisdiction.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface GameRecord {
  id: string;
  title: string;
  supplier: string;
  year: number;
  topology: string;
  mGap?: string;
  category: string;
  irFile: string;
  rtp: number;
  jurisdictions: string[];
  thumbnail?: string;
}

interface LibraryIndexFile {
  schema_version: string;
  total_items: number;
  categories: Array<{
    id: string;
    name: string;
    description?: string;
    items: Array<{
      id: string;
      file: string;
      title: string;
      supplier?: string;
      year?: number;
      topology?: string;
      mGap?: string;
    }>;
  }>;
}

const DEFAULT_RTP = 0.955;
const DEFAULT_JURISDICTIONS = ['UKGC', 'MGA', 'SE', 'NJ', 'GENERIC'];

function defaultLibraryPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Walk up: state/ → server/ → repo root.
  return resolve(here, '..', '..', 'web', 'studio', 'ir-library', 'index.json');
}

export class GamesRegistry {
  private readonly games = new Map<string, GameRecord>();
  private loaded = false;

  constructor(private readonly libraryPath: string = defaultLibraryPath()) {}

  /** Idempotent loader — safe to call repeatedly. */
  load(): GameRecord[] {
    if (this.loaded) return this.list();
    if (!existsSync(this.libraryPath)) {
      this.loaded = true;
      return [];
    }
    const raw = readFileSync(this.libraryPath, 'utf8');
    const parsed = JSON.parse(raw) as LibraryIndexFile;
    for (const cat of parsed.categories ?? []) {
      for (const item of cat.items ?? []) {
        this.games.set(item.id, {
          id: item.id,
          title: item.title,
          supplier: item.supplier ?? 'unknown',
          year: item.year ?? 2024,
          topology: item.topology ?? 'rectangular',
          ...(item.mGap !== undefined ? { mGap: item.mGap } : {}),
          category: cat.id,
          irFile: item.file,
          rtp: DEFAULT_RTP,
          jurisdictions: DEFAULT_JURISDICTIONS.slice(),
        });
      }
    }
    this.loaded = true;
    return this.list();
  }

  list(): GameRecord[] {
    return Array.from(this.games.values());
  }

  byId(id: string): GameRecord | null {
    return this.games.get(id) ?? null;
  }

  /** Filter by jurisdiction — used by lobby endpoints. */
  filterByJurisdiction(jurisdiction: string): GameRecord[] {
    return this.list().filter((g) => g.jurisdictions.includes(jurisdiction));
  }

  /** Add a game programmatically (used by tests, also useful for hot
   *  registration of new IRs without restart in dev). */
  register(record: GameRecord): void {
    this.games.set(record.id, record);
  }

  reset(): void {
    this.games.clear();
    this.loaded = false;
  }

  size(): number {
    return this.games.size;
  }
}
