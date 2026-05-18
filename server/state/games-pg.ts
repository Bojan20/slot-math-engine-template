/**
 * CORTI W206-PERSISTENCE — Postgres-backed games registry.
 *
 * Mirrors GamesRegistry's read API (list / byId / filterByJurisdiction)
 * but stores rows in `games(game_id, …, ir_blob JSONB, metadata JSONB)`.
 *
 * Bootstrap path: on first connect, `load()` reads from the IR library
 * index and seeds the table if empty. Subsequent boots use the table.
 */

import type { PgConnection } from '../db/connection.js';
import type { GameRecord } from './games.js';

interface GameRow {
  game_id: string;
  name: string;
  version: string;
  supplier: string;
  category: string;
  topology: string;
  rtp: number;
  jurisdictions: string[];
  ir_blob: unknown;
  metadata: { year?: number; irFile?: string; mGap?: string; thumbnail?: string } | null;
  created_at: Date;
  updated_at: Date;
}

function rowToRecord(r: GameRow): GameRecord {
  const meta = r.metadata ?? {};
  return {
    id: r.game_id,
    title: r.name,
    supplier: r.supplier,
    year: meta.year ?? 2024,
    topology: r.topology,
    ...(meta.mGap !== undefined ? { mGap: meta.mGap } : {}),
    category: r.category,
    irFile: meta.irFile ?? '',
    rtp: r.rtp,
    jurisdictions: r.jurisdictions ?? [],
    ...(meta.thumbnail !== undefined ? { thumbnail: meta.thumbnail } : {}),
  };
}

export class PostgresGamesRegistry {
  constructor(private readonly conn: PgConnection) {}

  async list(): Promise<GameRecord[]> {
    const r = await this.conn.query<GameRow>(
      `SELECT game_id, name, version, supplier, category, topology, rtp, jurisdictions, ir_blob, metadata, created_at, updated_at
       FROM games ORDER BY game_id ASC`
    );
    return r.rows.map(rowToRecord);
  }

  async byId(id: string): Promise<GameRecord | null> {
    const r = await this.conn.query<GameRow>(
      `SELECT game_id, name, version, supplier, category, topology, rtp, jurisdictions, ir_blob, metadata, created_at, updated_at
       FROM games WHERE game_id = $1`,
      [id]
    );
    if (r.rows.length === 0) return null;
    return rowToRecord(r.rows[0]);
  }

  async filterByJurisdiction(jurisdiction: string): Promise<GameRecord[]> {
    const r = await this.conn.query<GameRow>(
      `SELECT game_id, name, version, supplier, category, topology, rtp, jurisdictions, ir_blob, metadata, created_at, updated_at
       FROM games WHERE jurisdictions @> $1::jsonb ORDER BY game_id ASC`,
      [JSON.stringify([jurisdiction])]
    );
    return r.rows.map(rowToRecord);
  }

  async register(record: GameRecord): Promise<void> {
    const meta = {
      year: record.year,
      irFile: record.irFile,
      ...(record.mGap !== undefined ? { mGap: record.mGap } : {}),
      ...(record.thumbnail !== undefined ? { thumbnail: record.thumbnail } : {}),
    };
    await this.conn.query(
      `INSERT INTO games(game_id, name, version, supplier, category, topology, rtp, jurisdictions, ir_blob, metadata, created_at, updated_at)
       VALUES ($1, $2, '1.0.0', $3, $4, $5, $6, $7::jsonb, NULL, $8::jsonb, NOW(), NOW())
       ON CONFLICT (game_id) DO UPDATE SET
         name = EXCLUDED.name,
         supplier = EXCLUDED.supplier,
         category = EXCLUDED.category,
         topology = EXCLUDED.topology,
         rtp = EXCLUDED.rtp,
         jurisdictions = EXCLUDED.jurisdictions,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      [
        record.id,
        record.title,
        record.supplier,
        record.category,
        record.topology,
        record.rtp,
        JSON.stringify(record.jurisdictions),
        JSON.stringify(meta),
      ]
    );
  }

  async size(): Promise<number> {
    const r = await this.conn.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM games'
    );
    return Number(r.rows[0].count);
  }

  async reset(): Promise<void> {
    await this.conn.query('DELETE FROM games');
  }
}
