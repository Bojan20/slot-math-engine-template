/**
 * W211 Faza 700.0 — Real L&W Pilot Onboard — Postgres-backed pilot run store.
 *
 * Mirrors {@link PilotRunStore}'s API against the `pilot_runs` table
 * defined by migration `013_pilot_runs.sql`. Hash chain consideration is
 * NOT applied here — pilot runs are immutable summaries; the audit log
 * proper continues to live in `audit_log`.
 *
 * The same record() function lives on both stores so routes can swap
 * via `process.env.USE_POSTGRES`.
 */
import { randomUUID } from 'node:crypto';
import type { PgConnection } from '../db/connection.js';
import {
  computeResultHash,
  type PilotRunFilters,
  type PilotRunRecord,
  type PilotRunRecordInput,
  type PilotStepVerdict,
} from './pilot-runs.js';

interface PilotRunRow {
  run_id: string;
  tenant_id: string;
  started_at: Date;
  completed_at: Date;
  total_elapsed_ms: number;
  pass_count: number;
  fail_count: number;
  overall_ok: boolean;
  verdicts: PilotStepVerdict[];
  result_hash: string;
}

function rowToRecord(r: PilotRunRow): PilotRunRecord {
  return {
    runId: r.run_id,
    tenantId: r.tenant_id,
    startedAt: r.started_at.toISOString(),
    completedAt: r.completed_at.toISOString(),
    totalElapsedMs: Number(r.total_elapsed_ms),
    passCount: Number(r.pass_count),
    failCount: Number(r.fail_count),
    overallOk: !!r.overall_ok,
    verdicts: Array.isArray(r.verdicts) ? r.verdicts : [],
    resultHash: r.result_hash,
  };
}

export class PostgresPilotRunStore {
  constructor(private readonly conn: PgConnection) {}

  async record(input: PilotRunRecordInput): Promise<PilotRunRecord> {
    if (!input.tenantId) throw new RangeError('tenantId required');
    if (!Array.isArray(input.verdicts)) {
      throw new RangeError('verdicts must be an array');
    }
    const runId = input.runId ?? randomUUID();
    const startedAt = input.startedAt ?? new Date().toISOString();
    const completedAt = input.completedAt ?? new Date().toISOString();
    const totalElapsedMs =
      input.totalElapsedMs ??
      Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
    const passCount = input.verdicts.filter((v) => v.ok).length;
    const failCount = input.verdicts.length - passCount;
    const overallOk = failCount === 0;
    const verdicts: PilotStepVerdict[] = input.verdicts.map((v) => ({
      step: v.step,
      ok: !!v.ok,
      elapsedMs: Number(v.elapsedMs ?? 0),
      metrics: v.metrics ?? null,
    }));
    const resultHash = computeResultHash({
      runId,
      tenantId: input.tenantId,
      startedAt,
      completedAt,
      totalElapsedMs,
      passCount,
      failCount,
      overallOk,
      verdicts,
    });
    await this.conn.query(
      `INSERT INTO pilot_runs (
         run_id, tenant_id, started_at, completed_at, total_elapsed_ms,
         pass_count, fail_count, overall_ok, verdicts, result_hash
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       ON CONFLICT (run_id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         started_at = EXCLUDED.started_at,
         completed_at = EXCLUDED.completed_at,
         total_elapsed_ms = EXCLUDED.total_elapsed_ms,
         pass_count = EXCLUDED.pass_count,
         fail_count = EXCLUDED.fail_count,
         overall_ok = EXCLUDED.overall_ok,
         verdicts = EXCLUDED.verdicts,
         result_hash = EXCLUDED.result_hash`,
      [
        runId,
        input.tenantId,
        startedAt,
        completedAt,
        totalElapsedMs,
        passCount,
        failCount,
        overallOk,
        JSON.stringify(verdicts),
        resultHash,
      ]
    );
    return {
      runId,
      tenantId: input.tenantId,
      startedAt,
      completedAt,
      totalElapsedMs,
      passCount,
      failCount,
      overallOk,
      verdicts,
      resultHash,
    };
  }

  async get(runId: string): Promise<PilotRunRecord | null> {
    const r = await this.conn.query<PilotRunRow>(
      `SELECT run_id, tenant_id, started_at, completed_at, total_elapsed_ms,
              pass_count, fail_count, overall_ok, verdicts, result_hash
         FROM pilot_runs
        WHERE run_id = $1
        LIMIT 1`,
      [runId]
    );
    if (r.rows.length === 0) return null;
    return rowToRecord(r.rows[0]);
  }

  async list(filters: PilotRunFilters = {}): Promise<PilotRunRecord[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.tenantId) {
      params.push(filters.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    if (filters.overallOk !== undefined) {
      params.push(filters.overallOk);
      where.push(`overall_ok = $${params.length}`);
    }
    const sql =
      `SELECT run_id, tenant_id, started_at, completed_at, total_elapsed_ms,
              pass_count, fail_count, overall_ok, verdicts, result_hash
         FROM pilot_runs
        ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY completed_at DESC`;
    const r = await this.conn.query<PilotRunRow>(sql, params);
    return r.rows.map(rowToRecord);
  }

  async count(filters: PilotRunFilters = {}): Promise<number> {
    const rows = await this.list(filters);
    return rows.length;
  }

  async delete(runId: string): Promise<boolean> {
    const r = await this.conn.query(
      `DELETE FROM pilot_runs WHERE run_id = $1`,
      [runId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async reset(): Promise<void> {
    await this.conn.query(`DELETE FROM pilot_runs`);
  }
}
