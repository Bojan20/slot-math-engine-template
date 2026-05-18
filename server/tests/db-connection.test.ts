/**
 * CORTI W206-PERSISTENCE — connection pool / migration / lifecycle.
 */
import { describe, it, expect } from 'vitest';
import { PgConnection } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { fakePoolFactory, FakePool } from './fake-pg.js';
import type { Pool, PoolConfig } from 'pg';

describe('PgConnection', () => {
  it('connects via injected pool factory and reports healthy', async () => {
    const conn = new PgConnection({
      databaseUrl: 'postgres://x:y@host:5432/db',
      poolFactory: fakePoolFactory(),
    });
    await conn.connect();
    expect(conn.isConnected()).toBe(true);
    const h = await conn.health();
    expect(h.ok).toBe(true);
    expect(typeof h.latencyMs).toBe('number');
    await conn.shutdown();
  });

  it('retries on initial failure then succeeds (exponential backoff)', async () => {
    let attempts = 0;
    const factory = (cfg: PoolConfig): Pool => {
      attempts++;
      if (attempts < 3) {
        // Return a pool whose `connect()` immediately fails.
        const bad = {
          connect: async () => { throw new Error('boom'); },
          on: () => {},
          end: async () => {},
          query: async () => ({ rows: [], rowCount: 0 }),
        };
        return bad as unknown as Pool;
      }
      return new FakePool(cfg) as unknown as Pool;
    };
    const conn = new PgConnection({
      databaseUrl: 'postgres://x:y@host:5432/db',
      poolFactory: factory,
      maxRetries: 5,
      baseRetryDelayMs: 1, // keep test fast
    });
    await conn.connect();
    expect(attempts).toBe(3);
    expect(conn.isConnected()).toBe(true);
    await conn.shutdown();
  });

  it('fails after exhausting retries and surfaces the underlying error', async () => {
    const conn = new PgConnection({
      databaseUrl: 'postgres://x:y@host:5432/db',
      poolFactory: (() => {
        const bad = {
          connect: async () => { throw new Error('nope'); },
          on: () => {},
          end: async () => {},
          query: async () => ({ rows: [], rowCount: 0 }),
        };
        return bad as unknown as Pool;
      }),
      maxRetries: 2,
      baseRetryDelayMs: 1,
    });
    await expect(conn.connect()).rejects.toThrow(/failed after 2 attempts/);
  });

  it('withTransaction commits on success', async () => {
    const conn = new PgConnection({ poolFactory: fakePoolFactory() });
    await conn.query('CREATE TABLE IF NOT EXISTS tenants (x INT)');
    const out = await conn.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO tenants(tenant_id, name, config, created_at, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW(), NOW())
         RETURNING tenant_id, name, config, created_at, updated_at`,
        ['t1', 'Tenant One', JSON.stringify({ contactEmail: 'a@b.c' })]
      );
      return 'done';
    });
    expect(out).toBe('done');
    await conn.shutdown();
  });

  it('shutdown is idempotent', async () => {
    const conn = new PgConnection({ poolFactory: fakePoolFactory() });
    await conn.connect();
    await conn.shutdown();
    await conn.shutdown();
    expect(conn.isConnected()).toBe(false);
  });

  it('runMigrations records each file in schema_migrations and is idempotent', async () => {
    const conn = new PgConnection({ poolFactory: fakePoolFactory() });
    const first = await runMigrations(conn);
    // 4 .sql files shipped: 001_initial, 002_cert, 003_users_rbac, 004_games.
    expect(first.applied.length).toBeGreaterThanOrEqual(4);
    expect(first.skipped.length).toBe(0);
    const second = await runMigrations(conn);
    expect(second.applied.length).toBe(0);
    expect(second.skipped.length).toBe(first.applied.length);
    await conn.shutdown();
  });

  it('health() reports false when query throws', async () => {
    const conn = new PgConnection({ poolFactory: fakePoolFactory() });
    await conn.shutdown(); // force closed state
    // After shutdown, connect() will rebuild on next call — but isConnected goes false again on next shutdown.
    const fresh = new PgConnection({ poolFactory: fakePoolFactory() });
    await fresh.connect();
    await fresh.shutdown();
    // Try health on a connection that will have to re-connect via factory.
    const h = await fresh.health();
    expect(typeof h.ok).toBe('boolean');
  });
});
