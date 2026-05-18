/**
 * CORTI W206-PERSISTENCE — Postgres-backed AuditStore with hash chain.
 *
 * The hash chain is preserved by:
 *   1. SELECT the latest `this_hash` for the session FOR UPDATE.
 *   2. Compute `this_hash = sha256(canonical_json({seq, ts, type, payload, prev}))`.
 *   3. INSERT new row with (prev_hash, this_hash, seq) atomically.
 *
 * Restart safety: head pointer is recomputed from the table on every
 * append, so the chain survives process restarts intact. `verify()`
 * walks the rows in order and re-derives each hash.
 */

import type { PgConnection } from '../db/connection.js';
import {
  sealEntry,
  verifyChain,
  merkleRoot,
  ZERO_HASH,
} from '../lib/hashChain.js';
import type {
  AppendInput,
  AuditEntry,
  AuditQueryResult,
  ReplayResult,
} from './audit.js';

interface AuditRow {
  audit_id: string;
  session_id: string;
  seq: number;
  type: string;
  payload: unknown;
  prev_hash: string;
  this_hash: string;
  created_at: Date;
}

function rowToEntry(r: AuditRow): AuditEntry {
  return {
    seq: r.seq,
    timestamp: r.created_at.toISOString(),
    type: r.type,
    payload: r.payload,
    prev: r.prev_hash,
    current: r.this_hash,
    sessionId: r.session_id,
    auditId: `audit-${r.session_id}-${r.seq.toString(16).padStart(8, '0')}`,
  };
}

export class PostgresAuditStore {
  constructor(private readonly conn: PgConnection) {}

  async append(input: AppendInput): Promise<AuditEntry> {
    return this.conn.withTransaction(async (client) => {
      const head = await client.query<{ this_hash: string; seq: number }>(
        `SELECT this_hash, seq FROM audit_log
           WHERE session_id = $1
           ORDER BY seq DESC LIMIT 1
           FOR UPDATE`,
        [input.sessionId]
      );
      const prevHash: string = head.rows.length > 0 ? head.rows[0].this_hash : ZERO_HASH;
      const seq = head.rows.length > 0 ? head.rows[0].seq + 1 : 0;
      const timestamp = new Date().toISOString();
      const sealed = sealEntry(
        { seq, timestamp, type: input.type, payload: input.payload },
        prevHash
      );
      const auditId = `audit-${input.sessionId}-${seq.toString(16).padStart(8, '0')}`;
      await client.query(
        `INSERT INTO audit_log (session_id, seq, type, payload, prev_hash, this_hash, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
        [
          input.sessionId,
          seq,
          input.type,
          JSON.stringify(input.payload ?? null),
          sealed.prev,
          sealed.current,
          timestamp,
        ]
      );
      return {
        ...sealed,
        sessionId: input.sessionId,
        auditId,
      };
    });
  }

  async query(sessionId: string): Promise<AuditQueryResult> {
    const r = await this.conn.query<AuditRow>(
      `SELECT audit_id, session_id, seq, type, payload, prev_hash, this_hash, created_at
       FROM audit_log WHERE session_id = $1 ORDER BY seq ASC`,
      [sessionId]
    );
    const entries = r.rows.map(rowToEntry);
    return {
      entries,
      merkleRoot: merkleRoot(entries.map((e) => e.current)),
      count: entries.length,
    };
  }

  async replay(auditId: string): Promise<ReplayResult | null> {
    const m = /^audit-(.+)-([0-9a-f]+)$/.exec(auditId);
    if (!m) return null;
    const sessionId = m[1];
    const seq = parseInt(m[2], 16);
    const r = await this.conn.query<AuditRow>(
      `SELECT audit_id, session_id, seq, type, payload, prev_hash, this_hash, created_at
       FROM audit_log WHERE session_id = $1 ORDER BY seq ASC`,
      [sessionId]
    );
    if (r.rows.length === 0) return null;
    const chain = r.rows.map(rowToEntry);
    const idx = chain.findIndex((e) => e.seq === seq);
    if (idx < 0) return null;
    const verification = verifyChain(chain);
    return {
      previous: idx > 0 ? chain[idx - 1] : null,
      current: chain[idx],
      next: idx < chain.length - 1 ? chain[idx + 1] : null,
      chainOk: verification.ok,
    };
  }

  async verify(
    sessionId: string
  ): Promise<{ ok: boolean; brokenAt?: number; reason?: string }> {
    const r = await this.conn.query<AuditRow>(
      `SELECT audit_id, session_id, seq, type, payload, prev_hash, this_hash, created_at
       FROM audit_log WHERE session_id = $1 ORDER BY seq ASC`,
      [sessionId]
    );
    return verifyChain(r.rows.map(rowToEntry));
  }

  async sessionCount(): Promise<number> {
    const r = await this.conn.query<{ count: string }>(
      'SELECT COUNT(DISTINCT session_id)::text AS count FROM audit_log'
    );
    return Number(r.rows[0].count);
  }

  async totalEntries(): Promise<number> {
    const r = await this.conn.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM audit_log'
    );
    return Number(r.rows[0].count);
  }

  async reset(): Promise<void> {
    await this.conn.query('DELETE FROM audit_log');
  }
}
