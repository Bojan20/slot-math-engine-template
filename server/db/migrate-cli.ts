/**
 * CORTI W206-PERSISTENCE — `npm run db:migrate` entry point.
 *
 * Reads DATABASE_URL, connects, runs idempotent migrations, prints
 * applied / skipped counts, exits.
 */

import { PgConnection } from './connection.js';
import { runMigrations } from './migrate.js';

async function main(): Promise<void> {
  const conn = new PgConnection();
  await conn.connect();
  const result = await runMigrations(conn);
  // eslint-disable-next-line no-console
  console.log(`[db:migrate] applied=${result.applied.length} skipped=${result.skipped.length}`);
  for (const f of result.applied) {
    // eslint-disable-next-line no-console
    console.log(`  + ${f}`);
  }
  await conn.shutdown();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[db:migrate] failed:', err);
  process.exit(1);
});
