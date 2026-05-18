/**
 * CORTI W206-PERSISTENCE — idempotent migration runner.
 *
 *  - Maintains a `schema_migrations(version PK, applied_at)` table.
 *  - Reads `.sql` files from `server/db/migrations/` in sorted order.
 *  - Skips files already recorded; applies new ones inside a transaction.
 *
 * Migrations are written with `CREATE TABLE IF NOT EXISTS` so re-running
 * a partial application is harmless.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PgConnection } from './connection.js';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

function migrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, 'migrations');
}

async function listMigrationFiles(dir: string): Promise<string[]> {
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

export async function runMigrations(
  conn: PgConnection,
  opts: { dir?: string } = {}
): Promise<MigrationResult> {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    VARCHAR(64)  PRIMARY KEY,
      applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  const applied = new Set<string>();
  const rows = await conn.query<{ version: string }>(
    'SELECT version FROM schema_migrations'
  );
  for (const r of rows.rows) applied.add(r.version);

  const dir = opts.dir ?? migrationsDir();
  const files = await listMigrationFiles(dir);
  const result: MigrationResult = { applied: [], skipped: [] };

  for (const file of files) {
    if (applied.has(file)) {
      result.skipped.push(file);
      continue;
    }
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    await conn.withTransaction(async (client) => {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING',
        [file]
      );
    });
    result.applied.push(file);
  }

  return result;
}
