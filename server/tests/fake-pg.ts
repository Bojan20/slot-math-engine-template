/**
 * CORTI W206-PERSISTENCE — minimal hand-rolled pg pool fake.
 *
 * Implements just enough of the `pg.Pool` / `pg.PoolClient` surface
 * to exercise the Postgres-backed stores without booting a real
 * server. Tables are JS Maps; SQL is dispatched by simple regex
 * matching against the statements our stores actually issue.
 *
 * NOT a general-purpose Postgres emulator — strictly scoped to the
 * INSERT/SELECT/UPDATE/DELETE shapes used by:
 *   - schema_migrations
 *   - sessions
 *   - wallet_balances / wallet_transactions
 *   - audit_log
 *   - tenants
 *   - cert_submissions
 *   - games
 */

import { EventEmitter } from 'node:events';
import type { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';

type Row = Record<string, unknown>;

interface SimpleTable {
  rows: Row[];
  /** Auto-increment counters for BIGSERIAL columns. */
  serials: Map<string, number>;
}

class FakeDb {
  readonly tables = new Map<string, SimpleTable>();
  private locked: Set<string> = new Set();

  ensureTable(name: string): SimpleTable {
    let t = this.tables.get(name);
    if (!t) {
      t = { rows: [], serials: new Map() };
      this.tables.set(name, t);
    }
    return t;
  }

  reset(): void {
    this.tables.clear();
    this.locked.clear();
  }

  nextSerial(table: string, col: string): number {
    const t = this.ensureTable(table);
    const cur = t.serials.get(col) ?? 0;
    const next = cur + 1;
    t.serials.set(col, next);
    return next;
  }
}

function cloneRow(r: Row): Row {
  const out: Row = {};
  for (const k of Object.keys(r)) out[k] = r[k];
  return out;
}

function parseJsonbParam(p: unknown): unknown {
  if (typeof p === 'string') {
    try { return JSON.parse(p); } catch { return p; }
  }
  return p;
}

interface FakeQueryResult extends QueryResult<Row> {
  rowCount: number;
}

function emptyResult(): FakeQueryResult {
  return { command: '', rowCount: 0, oid: 0, rows: [], fields: [] };
}

export class FakeClient extends EventEmitter implements Partial<PoolClient> {
  private inTransaction = false;
  constructor(private readonly db: FakeDb) { super(); }

  release(): void { /* no-op */ }

  async query(sqlOrCfg: unknown, params?: unknown[]): Promise<FakeQueryResult> {
    const sqlRaw = typeof sqlOrCfg === 'string' ? sqlOrCfg : String((sqlOrCfg as { text?: string }).text);
    // Strip line comments to avoid `-- …` confusing simple regexes.
    const stripped = sqlRaw
      .split('\n')
      .map((ln) => ln.replace(/--.*$/, ''))
      .join('\n');
    // If the input contains multiple statements (typical for migration
    // files), dispatch them one-by-one and return the last non-empty
    // result. Parameters are only used when there's exactly one stmt.
    const stmts = stripped
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (stmts.length > 1) {
      let last: FakeQueryResult = emptyResult();
      for (const stmt of stmts) last = await this.query(stmt);
      return last;
    }
    const sql = stmts[0] ?? stripped.trim();
    const upper = sql.toUpperCase();

    if (upper === 'BEGIN' || upper === 'COMMIT' || upper === 'ROLLBACK') {
      this.inTransaction = upper === 'BEGIN';
      return emptyResult();
    }

    if (upper.startsWith('SELECT 1')) {
      return { ...emptyResult(), rows: [{ '?column?': 1 }], rowCount: 1 };
    }

    // ── schema_migrations
    if (/CREATE TABLE IF NOT EXISTS schema_migrations/i.test(sql)) {
      this.db.ensureTable('schema_migrations');
      return emptyResult();
    }
    if (/SELECT version FROM schema_migrations/i.test(sql)) {
      const rows = this.db.ensureTable('schema_migrations').rows.map((r) => ({ version: r['version'] }));
      return { ...emptyResult(), rows, rowCount: rows.length };
    }
    if (/INSERT INTO schema_migrations/i.test(sql)) {
      const t = this.db.ensureTable('schema_migrations');
      const version = params?.[0] as string;
      if (!t.rows.find((r) => r['version'] === version)) {
        t.rows.push({ version, applied_at: new Date() });
      }
      return emptyResult();
    }

    // CREATE TABLE / CREATE INDEX / CREATE UNIQUE INDEX (any) — no-op
    if (
      upper.startsWith('CREATE TABLE') ||
      upper.startsWith('CREATE INDEX') ||
      upper.startsWith('CREATE UNIQUE INDEX')
    ) {
      return emptyResult();
    }

    // ── sessions
    if (/INSERT INTO sessions/i.test(sql)) {
      const t = this.db.ensureTable('sessions');
      const row: Row = {
        session_id: params?.[0],
        player_id: params?.[1],
        jurisdiction: params?.[2],
        created_at: new Date(String(params?.[3])),
        expires_at: new Date(String(params?.[4])),
        last_spin_at: null,
        state: parseJsonbParam(params?.[5]),
        closed_at: null,
      };
      t.rows.push(row);
      return { ...emptyResult(), rows: [row], rowCount: 1 };
    }
    if (/FROM sessions WHERE session_id = \$1\s+FOR UPDATE/i.test(sql)) {
      const t = this.db.ensureTable('sessions');
      const row = t.rows.find((r) => r['session_id'] === params?.[0]);
      return row
        ? { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 }
        : emptyResult();
    }
    if (/FROM sessions WHERE session_id = \$1/i.test(sql) && upper.startsWith('SELECT')) {
      const t = this.db.ensureTable('sessions');
      const row = t.rows.find((r) => r['session_id'] === params?.[0]);
      return row
        ? { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 }
        : emptyResult();
    }
    if (/UPDATE sessions SET state = \$1::jsonb, last_spin_at/i.test(sql)) {
      const t = this.db.ensureTable('sessions');
      const row = t.rows.find((r) => r['session_id'] === params?.[2]);
      if (row) {
        row['state'] = parseJsonbParam(params?.[0]);
        row['last_spin_at'] = new Date(Number(params?.[1]));
      }
      return emptyResult();
    }
    if (/UPDATE sessions SET state = \$1::jsonb, closed_at = NOW\(\)/i.test(sql)) {
      const t = this.db.ensureTable('sessions');
      const row = t.rows.find((r) => r['session_id'] === params?.[1]);
      if (row) {
        row['state'] = parseJsonbParam(params?.[0]);
        row['closed_at'] = new Date();
      }
      return emptyResult();
    }
    if (/SELECT COUNT\(\*\)::text AS count FROM sessions/i.test(sql)) {
      const t = this.db.ensureTable('sessions');
      return { ...emptyResult(), rows: [{ count: String(t.rows.length) }], rowCount: 1 };
    }
    if (/DELETE FROM sessions/i.test(sql)) {
      const t = this.db.ensureTable('sessions');
      const n = t.rows.length;
      t.rows.length = 0;
      return { ...emptyResult(), rowCount: n };
    }

    // ── wallet_balances (upsert pattern)
    if (/INSERT INTO wallet_balances/i.test(sql) && /ON CONFLICT/i.test(sql)) {
      const t = this.db.ensureTable('wallet_balances');
      const pid = params?.[0] as string;
      let row = t.rows.find((r) => r['player_id'] === pid);
      if (!row) {
        row = {
          player_id: pid,
          balance_minor: BigInt(Number(params?.[1])),
          currency: String(params?.[2] ?? 'EUR'),
          updated_at: new Date(),
        };
        t.rows.push(row);
      }
      return { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 };
    }
    if (/UPDATE wallet_balances SET balance_minor = balance_minor \+ \$1/i.test(sql)) {
      const t = this.db.ensureTable('wallet_balances');
      const row = t.rows.find((r) => r['player_id'] === params?.[1]);
      if (!row) return emptyResult();
      row['balance_minor'] = BigInt(Number(row['balance_minor'])) + BigInt(Number(params?.[0]));
      row['updated_at'] = new Date();
      return { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 };
    }
    if (/UPDATE wallet_balances SET balance_minor = balance_minor - \$1/i.test(sql)) {
      const t = this.db.ensureTable('wallet_balances');
      const row = t.rows.find((r) => r['player_id'] === params?.[1]);
      if (!row) return emptyResult();
      const next = BigInt(Number(row['balance_minor'])) - BigInt(Number(params?.[0]));
      if (next < 0n) throw new Error('wallet_balance_nonneg violation');
      row['balance_minor'] = next;
      row['updated_at'] = new Date();
      return { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 };
    }
    if (/FROM wallet_balances WHERE player_id = \$1/i.test(sql) && upper.startsWith('SELECT')) {
      const t = this.db.ensureTable('wallet_balances');
      const row = t.rows.find((r) => r['player_id'] === params?.[0]);
      return row
        ? { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 }
        : emptyResult();
    }
    if (/DELETE FROM wallet_balances/i.test(sql)) {
      const t = this.db.ensureTable('wallet_balances');
      const n = t.rows.length;
      t.rows.length = 0;
      return { ...emptyResult(), rowCount: n };
    }

    // ── wallet_transactions
    if (/INSERT INTO wallet_transactions/i.test(sql)) {
      const t = this.db.ensureTable('wallet_transactions');
      // Detect kind from the SQL literal (we always inline 'wager', etc).
      const kindMatch = /'(deposit|withdraw|wager|win)'/i.exec(sql);
      const statusMatch = /'(approved|pending|declined)'/i.exec(sql);
      // Map of positional params depends on the call site.
      let row: Row;
      if (/VALUES \(\$1, \$2, 'deposit', \$3, \$4, \$5, \$6\)/i.test(sql)) {
        row = {
          transaction_id: this.db.nextSerial('wallet_transactions', 'transaction_id'),
          player_id: params?.[0],
          amount_minor: BigInt(Number(params?.[1])),
          kind: 'deposit',
          status: String(params?.[2]),
          currency: String(params?.[3] ?? 'EUR'),
          ref: params?.[4] ?? null,
          balance_after_minor: BigInt(Number(params?.[5])),
          created_at: new Date(),
        };
      } else if (/VALUES \(\$1, \$2, 'withdraw', 'declined', \$3, \$4, \$5\)/i.test(sql)) {
        row = {
          transaction_id: this.db.nextSerial('wallet_transactions', 'transaction_id'),
          player_id: params?.[0],
          amount_minor: BigInt(Number(params?.[1])),
          kind: 'withdraw',
          status: 'declined',
          currency: String(params?.[2] ?? 'EUR'),
          ref: params?.[3] ?? null,
          balance_after_minor: BigInt(Number(params?.[4])),
          created_at: new Date(),
        };
      } else if (/VALUES \(\$1, \$2, 'withdraw', \$3, \$4, \$5, \$6\)/i.test(sql)) {
        row = {
          transaction_id: this.db.nextSerial('wallet_transactions', 'transaction_id'),
          player_id: params?.[0],
          amount_minor: BigInt(Number(params?.[1])),
          kind: 'withdraw',
          status: String(params?.[2]),
          currency: String(params?.[3] ?? 'EUR'),
          ref: params?.[4] ?? null,
          balance_after_minor: BigInt(Number(params?.[5])),
          created_at: new Date(),
        };
      } else if (/'wager', 'approved'/i.test(sql)) {
        row = {
          transaction_id: this.db.nextSerial('wallet_transactions', 'transaction_id'),
          player_id: params?.[0],
          amount_minor: BigInt(Number(params?.[1])),
          kind: 'wager',
          status: 'approved',
          currency: String(params?.[2] ?? 'EUR'),
          ref: null,
          balance_after_minor: BigInt(Number(params?.[3])),
          created_at: new Date(),
        };
      } else if (/'win', 'approved'/i.test(sql)) {
        row = {
          transaction_id: this.db.nextSerial('wallet_transactions', 'transaction_id'),
          player_id: params?.[0],
          amount_minor: BigInt(Number(params?.[1])),
          kind: 'win',
          status: 'approved',
          currency: String(params?.[2] ?? 'EUR'),
          ref: null,
          balance_after_minor: BigInt(Number(params?.[3])),
          created_at: new Date(),
        };
      } else {
        // Fallback generic
        row = {
          transaction_id: this.db.nextSerial('wallet_transactions', 'transaction_id'),
          kind: kindMatch?.[1] ?? 'unknown',
          status: statusMatch?.[1] ?? 'unknown',
        };
      }
      t.rows.push(row);
      return { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 };
    }
    if (/FROM wallet_transactions WHERE player_id = \$1/i.test(sql)) {
      const t = this.db.ensureTable('wallet_transactions');
      const rows = t.rows
        .filter((r) => r['player_id'] === params?.[0])
        .map(cloneRow)
        .sort((a, b) => Number(a['transaction_id']) - Number(b['transaction_id']));
      return { ...emptyResult(), rows, rowCount: rows.length };
    }
    if (/DELETE FROM wallet_transactions/i.test(sql)) {
      const t = this.db.ensureTable('wallet_transactions');
      const n = t.rows.length;
      t.rows.length = 0;
      return { ...emptyResult(), rowCount: n };
    }

    // ── audit_log
    if (/SELECT this_hash, seq FROM audit_log/i.test(sql)) {
      const t = this.db.ensureTable('audit_log');
      const rows = t.rows
        .filter((r) => r['session_id'] === params?.[0])
        .map(cloneRow)
        .sort((a, b) => Number(b['seq']) - Number(a['seq']));
      const limited = rows.slice(0, 1);
      return { ...emptyResult(), rows: limited, rowCount: limited.length };
    }
    if (/INSERT INTO audit_log/i.test(sql)) {
      const t = this.db.ensureTable('audit_log');
      const row: Row = {
        audit_id: this.db.nextSerial('audit_log', 'audit_id'),
        session_id: params?.[0],
        seq: Number(params?.[1]),
        type: String(params?.[2]),
        payload: parseJsonbParam(params?.[3]),
        prev_hash: String(params?.[4]),
        this_hash: String(params?.[5]),
        created_at: new Date(String(params?.[6])),
      };
      t.rows.push(row);
      return { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 };
    }
    if (/FROM audit_log WHERE session_id = \$1 ORDER BY seq ASC/i.test(sql)) {
      const t = this.db.ensureTable('audit_log');
      const rows = t.rows
        .filter((r) => r['session_id'] === params?.[0])
        .map(cloneRow)
        .sort((a, b) => Number(a['seq']) - Number(b['seq']));
      return { ...emptyResult(), rows, rowCount: rows.length };
    }
    if (/SELECT COUNT\(DISTINCT session_id\)::text AS count FROM audit_log/i.test(sql)) {
      const t = this.db.ensureTable('audit_log');
      const set = new Set(t.rows.map((r) => r['session_id']));
      return { ...emptyResult(), rows: [{ count: String(set.size) }], rowCount: 1 };
    }
    if (/SELECT COUNT\(\*\)::text AS count FROM audit_log/i.test(sql)) {
      const t = this.db.ensureTable('audit_log');
      return { ...emptyResult(), rows: [{ count: String(t.rows.length) }], rowCount: 1 };
    }
    if (/DELETE FROM audit_log/i.test(sql)) {
      const t = this.db.ensureTable('audit_log');
      const n = t.rows.length;
      t.rows.length = 0;
      return { ...emptyResult(), rowCount: n };
    }

    // ── tenants
    if (/INSERT INTO tenants/i.test(sql)) {
      const t = this.db.ensureTable('tenants');
      const id = params?.[0] as string;
      if (t.rows.find((r) => r['tenant_id'] === id)) {
        throw new Error(`duplicate tenant_id ${id}`);
      }
      const now = new Date();
      const row: Row = {
        tenant_id: id,
        name: params?.[1],
        config: parseJsonbParam(params?.[2]),
        created_at: now,
        updated_at: now,
      };
      t.rows.push(row);
      return { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 };
    }
    if (/UPDATE tenants SET name = \$1, config = \$2::jsonb/i.test(sql)) {
      const t = this.db.ensureTable('tenants');
      const row = t.rows.find((r) => r['tenant_id'] === params?.[2]);
      if (!row) return emptyResult();
      row['name'] = params?.[0];
      row['config'] = parseJsonbParam(params?.[1]);
      row['updated_at'] = new Date();
      return { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 };
    }
    if (/DELETE FROM tenants WHERE tenant_id = \$1/i.test(sql)) {
      const t = this.db.ensureTable('tenants');
      const idx = t.rows.findIndex((r) => r['tenant_id'] === params?.[0]);
      if (idx >= 0) {
        t.rows.splice(idx, 1);
        return { ...emptyResult(), rowCount: 1 };
      }
      return emptyResult();
    }
    if (/FROM tenants WHERE tenant_id = \$1/i.test(sql)) {
      const t = this.db.ensureTable('tenants');
      const row = t.rows.find((r) => r['tenant_id'] === params?.[0]);
      return row
        ? { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 }
        : emptyResult();
    }
    if (/FROM tenants ORDER BY tenant_id/i.test(sql)) {
      const t = this.db.ensureTable('tenants');
      const rows = t.rows
        .slice()
        .sort((a, b) => String(a['tenant_id']).localeCompare(String(b['tenant_id'])))
        .map(cloneRow);
      return { ...emptyResult(), rows, rowCount: rows.length };
    }
    if (/SELECT COUNT\(\*\)::text AS count FROM tenants/i.test(sql)) {
      const t = this.db.ensureTable('tenants');
      return { ...emptyResult(), rows: [{ count: String(t.rows.length) }], rowCount: 1 };
    }
    if (/DELETE FROM tenants/i.test(sql)) {
      const t = this.db.ensureTable('tenants');
      const n = t.rows.length;
      t.rows.length = 0;
      return { ...emptyResult(), rowCount: n };
    }

    // ── cert_submissions
    if (/INSERT INTO cert_submissions/i.test(sql)) {
      const t = this.db.ensureTable('cert_submissions');
      const id = params?.[0] as string;
      const existing = t.rows.find((r) => r['submission_id'] === id);
      const fields: Row = {
        submission_id: id,
        ir_blob: parseJsonbParam(params?.[1]),
        ir_sha256: params?.[2],
        jurisdiction: params?.[3],
        status: params?.[4],
        par_sheet: params?.[5] != null ? parseJsonbParam(params?.[5]) : (existing?.['par_sheet'] ?? null),
        par_pdf: params?.[6] ?? existing?.['par_pdf'] ?? null,
        par_pdf_sha256: params?.[7] ?? existing?.['par_pdf_sha256'] ?? null,
        hsm_signature: params?.[8] != null ? parseJsonbParam(params?.[8]) : (existing?.['hsm_signature'] ?? null),
        operator_package: params?.[9] != null ? parseJsonbParam(params?.[9]) : (existing?.['operator_package'] ?? null),
        submitted_at: existing?.['submitted_at'] ?? new Date(),
        reviewed_at: null,
      };
      if (existing) Object.assign(existing, fields);
      else t.rows.push(fields);
      return { ...emptyResult(), rows: [cloneRow(fields)], rowCount: 1 };
    }
    if (/FROM cert_submissions WHERE submission_id = \$1/i.test(sql)) {
      const t = this.db.ensureTable('cert_submissions');
      const row = t.rows.find((r) => r['submission_id'] === params?.[0]);
      return row
        ? { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 }
        : emptyResult();
    }
    if (/FROM cert_submissions ORDER BY submitted_at DESC/i.test(sql)) {
      const t = this.db.ensureTable('cert_submissions');
      const rows = t.rows
        .slice()
        .sort((a, b) => Number(b['submitted_at']) - Number(a['submitted_at']))
        .map(cloneRow);
      return { ...emptyResult(), rows, rowCount: rows.length };
    }
    if (/DELETE FROM cert_submissions/i.test(sql)) {
      const t = this.db.ensureTable('cert_submissions');
      const n = t.rows.length;
      t.rows.length = 0;
      return { ...emptyResult(), rowCount: n };
    }

    // ── games
    if (/INSERT INTO games/i.test(sql)) {
      const t = this.db.ensureTable('games');
      const id = params?.[0] as string;
      const existing = t.rows.find((r) => r['game_id'] === id);
      const fields: Row = {
        game_id: id,
        name: params?.[1],
        version: '1.0.0',
        supplier: params?.[2],
        category: params?.[3],
        topology: params?.[4],
        rtp: Number(params?.[5]),
        jurisdictions: parseJsonbParam(params?.[6]),
        ir_blob: null,
        metadata: parseJsonbParam(params?.[7]),
        created_at: existing?.['created_at'] ?? new Date(),
        updated_at: new Date(),
      };
      if (existing) Object.assign(existing, fields);
      else t.rows.push(fields);
      return { ...emptyResult(), rows: [cloneRow(fields)], rowCount: 1 };
    }
    if (/FROM games WHERE game_id = \$1/i.test(sql)) {
      const t = this.db.ensureTable('games');
      const row = t.rows.find((r) => r['game_id'] === params?.[0]);
      return row
        ? { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 }
        : emptyResult();
    }
    if (/FROM games WHERE jurisdictions @>/i.test(sql)) {
      const t = this.db.ensureTable('games');
      const target = (parseJsonbParam(params?.[0]) as string[])[0];
      const rows = t.rows
        .filter((r) => Array.isArray(r['jurisdictions']) && (r['jurisdictions'] as string[]).includes(target))
        .map(cloneRow)
        .sort((a, b) => String(a['game_id']).localeCompare(String(b['game_id'])));
      return { ...emptyResult(), rows, rowCount: rows.length };
    }
    if (/FROM games ORDER BY game_id/i.test(sql)) {
      const t = this.db.ensureTable('games');
      const rows = t.rows
        .slice()
        .sort((a, b) => String(a['game_id']).localeCompare(String(b['game_id'])))
        .map(cloneRow);
      return { ...emptyResult(), rows, rowCount: rows.length };
    }
    if (/SELECT COUNT\(\*\)::text AS count FROM games/i.test(sql)) {
      const t = this.db.ensureTable('games');
      return { ...emptyResult(), rows: [{ count: String(t.rows.length) }], rowCount: 1 };
    }
    if (/DELETE FROM games/i.test(sql)) {
      const t = this.db.ensureTable('games');
      const n = t.rows.length;
      t.rows.length = 0;
      return { ...emptyResult(), rowCount: n };
    }

    // ── analytics_events (W207-ANALYTICS)
    if (/INSERT INTO analytics_events/i.test(sql)) {
      const t = this.db.ensureTable('analytics_events');
      const row: Row = {
        event_id: Number(params?.[0]),
        category: String(params?.[1]),
        session_id: params?.[2] ?? null,
        game_id: params?.[3] ?? null,
        bet: params?.[4] == null ? null : Number(params?.[4]),
        value: params?.[5] == null ? null : Number(params?.[5]),
        payload: parseJsonbParam(params?.[6]),
        created_at: new Date(String(params?.[7])),
      };
      t.rows.push(row);
      return { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 };
    }
    if (/FROM analytics_events\s+ORDER BY event_id DESC LIMIT/i.test(sql)) {
      const t = this.db.ensureTable('analytics_events');
      const lim = Number(params?.[0] ?? 1000);
      const rows = t.rows
        .slice()
        .sort((a, b) => Number(b['event_id']) - Number(a['event_id']))
        .slice(0, lim)
        .map(cloneRow);
      return { ...emptyResult(), rows, rowCount: rows.length };
    }
    if (/SELECT COUNT\(\*\)::text AS count FROM analytics_events/i.test(sql)) {
      const t = this.db.ensureTable('analytics_events');
      return { ...emptyResult(), rows: [{ count: String(t.rows.length) }], rowCount: 1 };
    }
    if (/DELETE FROM analytics_events/i.test(sql)) {
      const t = this.db.ensureTable('analytics_events');
      const n = t.rows.length;
      t.rows.length = 0;
      return { ...emptyResult(), rowCount: n };
    }

    // ── pilot_runs (W211 Faza 700.0)
    if (/INSERT INTO pilot_runs/i.test(sql)) {
      const t = this.db.ensureTable('pilot_runs');
      const id = params?.[0] as string;
      const existing = t.rows.find((r) => r['run_id'] === id);
      const fields: Row = {
        run_id: id,
        tenant_id: String(params?.[1]),
        started_at: new Date(String(params?.[2])),
        completed_at: new Date(String(params?.[3])),
        total_elapsed_ms: Number(params?.[4]),
        pass_count: Number(params?.[5]),
        fail_count: Number(params?.[6]),
        overall_ok: Boolean(params?.[7]),
        verdicts: parseJsonbParam(params?.[8]),
        result_hash: String(params?.[9]),
      };
      if (existing) Object.assign(existing, fields);
      else t.rows.push(fields);
      return { ...emptyResult(), rows: [cloneRow(fields)], rowCount: 1 };
    }
    if (/FROM pilot_runs\s+WHERE run_id = \$1/i.test(sql) && upper.startsWith('SELECT')) {
      const t = this.db.ensureTable('pilot_runs');
      const row = t.rows.find((r) => r['run_id'] === params?.[0]);
      return row
        ? { ...emptyResult(), rows: [cloneRow(row)], rowCount: 1 }
        : emptyResult();
    }
    if (/FROM pilot_runs/i.test(sql) && upper.startsWith('SELECT')) {
      const t = this.db.ensureTable('pilot_runs');
      // Apply WHERE filters if present (tenant_id, overall_ok). We
      // scan the SQL to figure out which params bind to which column.
      let rows = t.rows.slice();
      const whereMatch = /WHERE\s+(.+?)\s+ORDER BY/i.exec(sql);
      if (whereMatch) {
        const clauses = whereMatch[1].split(/\s+AND\s+/i);
        for (const c of clauses) {
          const colMatch = /(\w+)\s*=\s*\$(\d+)/.exec(c);
          if (!colMatch) continue;
          const col = colMatch[1];
          const idx = Number(colMatch[2]) - 1;
          const val = params?.[idx];
          rows = rows.filter((r) => {
            if (typeof r[col] === 'boolean') return r[col] === Boolean(val);
            return r[col] === val;
          });
        }
      }
      rows = rows
        .slice()
        .sort((a, b) =>
          String(b['completed_at']).localeCompare(String(a['completed_at']))
        )
        .map(cloneRow);
      return { ...emptyResult(), rows, rowCount: rows.length };
    }
    if (/DELETE FROM pilot_runs\s+WHERE run_id = \$1/i.test(sql)) {
      const t = this.db.ensureTable('pilot_runs');
      const idx = t.rows.findIndex((r) => r['run_id'] === params?.[0]);
      if (idx >= 0) {
        t.rows.splice(idx, 1);
        return { ...emptyResult(), rowCount: 1 };
      }
      return emptyResult();
    }
    if (/DELETE FROM pilot_runs/i.test(sql)) {
      const t = this.db.ensureTable('pilot_runs');
      const n = t.rows.length;
      t.rows.length = 0;
      return { ...emptyResult(), rowCount: n };
    }

    throw new Error(`FakePg: unhandled SQL → ${sql.slice(0, 120)}`);
  }
}

export class FakePool extends EventEmitter implements Partial<Pool> {
  readonly db = new FakeDb();
  endCalled = false;

  constructor(_cfg: PoolConfig = {}) { super(); }

  async connect(): Promise<PoolClient> {
    return new FakeClient(this.db) as unknown as PoolClient;
  }

  async query(sqlOrCfg: unknown, params?: unknown[]): Promise<FakeQueryResult> {
    const c = new FakeClient(this.db);
    return c.query(sqlOrCfg, params);
  }

  async end(): Promise<void> {
    this.endCalled = true;
  }
}

/** Factory plug for `PgConnection({ poolFactory })`. */
export function fakePoolFactory(): (cfg: PoolConfig) => Pool {
  return (cfg) => new FakePool(cfg) as unknown as Pool;
}
