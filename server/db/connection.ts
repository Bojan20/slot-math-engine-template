/**
 * CORTI W206-PERSISTENCE — Postgres connection pool wrapper.
 *
 *  - Reads DATABASE_URL or component env vars (PGHOST / PGUSER / ...).
 *  - Pool size capped at 20 by default; tunable via PG_POOL_MAX.
 *  - `connect()` retries up to 5x with exponential backoff (250ms → 4s).
 *  - `health()` runs `SELECT 1` and reports latency.
 *  - `shutdown()` drains the pool gracefully.
 *
 * Only this module imports `pg` so the rest of the backend can stay
 * agnostic to the driver. Pass an injected pool to the constructors of
 * Postgres-backed stores for unit testing.
 */

import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

export interface PgConnectionOptions {
  /** Full Postgres URL, e.g. postgres://user:pass@host:5432/db. */
  databaseUrl?: string | undefined;
  /** Max pool size; defaults to 20. */
  maxConnections?: number;
  /** Connection statement timeout (ms). Defaults to 10000. */
  statementTimeoutMs?: number;
  /** Max retry attempts on connect failure. Defaults to 5. */
  maxRetries?: number;
  /** Initial retry delay (ms); doubles each attempt up to a 4000ms cap. */
  baseRetryDelayMs?: number;
  /** Test-only: inject an alternative Pool factory (e.g. pg-mem). */
  poolFactory?: (cfg: PoolConfig) => Pool;
}

export interface PgHealth {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export class PgConnection {
  private pool: Pool | null = null;
  private closing = false;
  private readonly options: Required<Omit<PgConnectionOptions, 'poolFactory' | 'databaseUrl'>> & {
    poolFactory: ((cfg: PoolConfig) => Pool) | null;
    databaseUrl: string | null;
  };

  constructor(opts: PgConnectionOptions = {}) {
    this.options = {
      databaseUrl: opts.databaseUrl ?? process.env.DATABASE_URL ?? null,
      maxConnections: opts.maxConnections ?? Number(process.env.PG_POOL_MAX ?? 20),
      statementTimeoutMs: opts.statementTimeoutMs ?? 10_000,
      maxRetries: opts.maxRetries ?? 5,
      baseRetryDelayMs: opts.baseRetryDelayMs ?? 250,
      poolFactory: opts.poolFactory ?? null,
    };
  }

  /** Build (or return existing) the pool and run an initial probe. */
  async connect(): Promise<Pool> {
    if (this.pool) return this.pool;
    const cfg: PoolConfig = this.options.databaseUrl
      ? {
          connectionString: this.options.databaseUrl,
          max: this.options.maxConnections,
          statement_timeout: this.options.statementTimeoutMs,
        }
      : {
          max: this.options.maxConnections,
          statement_timeout: this.options.statementTimeoutMs,
        };
    const factory = this.options.poolFactory ?? ((c: PoolConfig) => new Pool(c));

    let attempt = 0;
    let lastErr: unknown = null;
    while (attempt < this.options.maxRetries) {
      try {
        const pool = factory(cfg);
        // Force-acquire one connection so initial-connect errors surface here.
        const c = await pool.connect();
        await c.query('SELECT 1');
        c.release();
        // Swallow pool-level errors so a single bad client doesn't crash
        // the process — they're logged on the next `query` call instead.
        pool.on('error', () => {
          /* ignored on purpose — logged at query call site */
        });
        this.pool = pool;
        return pool;
      } catch (err) {
        lastErr = err;
        attempt++;
        if (attempt >= this.options.maxRetries) break;
        const delay = Math.min(
          this.options.baseRetryDelayMs * 2 ** (attempt - 1),
          4_000
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new Error(
      `PgConnection.connect: failed after ${this.options.maxRetries} attempts: ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`
    );
  }

  /** Run a parameterized query against the pool. */
  async query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: ReadonlyArray<unknown> = []
  ): Promise<QueryResult<R>> {
    const pool = await this.connect();
    return pool.query<R>(sql, params as unknown[]);
  }

  /** Acquire a dedicated client for a multi-statement transaction. */
  async withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const pool = await this.connect();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  }

  /** Lightweight health check — runs `SELECT 1` + reports latency. */
  async health(): Promise<PgHealth> {
    const t0 = Date.now();
    try {
      await this.query('SELECT 1');
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Drain the pool. Safe to call multiple times. */
  async shutdown(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    if (this.pool) {
      try {
        await this.pool.end();
      } catch {
        // ignore — best effort drain
      }
      this.pool = null;
    }
  }

  /** True once `connect()` has succeeded and `shutdown()` has not run. */
  isConnected(): boolean {
    return this.pool !== null && !this.closing;
  }

  /** Expose the pool for migration helpers / tests. */
  getPool(): Pool | null {
    return this.pool;
  }
}

/** Singleton helper — used when the app wants exactly one shared pool. */
let _shared: PgConnection | null = null;
export function getSharedConnection(opts?: PgConnectionOptions): PgConnection {
  if (!_shared) _shared = new PgConnection(opts);
  return _shared;
}
export function resetSharedConnection(): void {
  _shared = null;
}
