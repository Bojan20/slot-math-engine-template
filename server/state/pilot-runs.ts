/**
 * W211 Faza 700.0 — Real L&W Pilot Onboard — in-memory pilot run store.
 *
 * Stores the result of every integration suite execution (one row per
 * `runId`). Used by the admin pilot dashboard, the dossier generator,
 * and the QA/replay endpoint. The PG-backed mirror lives in
 * `./pilot-runs-pg.ts` and is selected at boot time when
 * USE_POSTGRES=true (same convention as the other W206 stores).
 */
import { randomUUID, createHash } from 'node:crypto';

export type PilotRunVerdict = 'pass' | 'fail';

export interface PilotStepVerdict {
  step: string;
  ok: boolean;
  elapsedMs: number;
  metrics?: Record<string, unknown> | null;
}

export interface PilotRunRecord {
  runId: string;
  tenantId: string;
  startedAt: string;
  completedAt: string;
  totalElapsedMs: number;
  passCount: number;
  failCount: number;
  overallOk: boolean;
  verdicts: PilotStepVerdict[];
  resultHash: string;
}

export interface PilotRunRecordInput {
  runId?: string;
  tenantId: string;
  startedAt?: string;
  completedAt?: string;
  totalElapsedMs?: number;
  verdicts: PilotStepVerdict[];
}

export interface PilotRunFilters {
  tenantId?: string;
  overallOk?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function computeResultHash(record: Omit<PilotRunRecord, 'resultHash'>): string {
  // Hash over the canonical (runId, tenantId, verdict bitmap, completedAt)
  // — sufficient for tamper-evidence in the admin replay endpoint.
  const verdictBits = record.verdicts.map((v) => `${v.step}:${v.ok ? 1 : 0}`).join('|');
  const canonical = [
    record.runId,
    record.tenantId,
    record.completedAt,
    String(record.totalElapsedMs),
    verdictBits,
  ].join('::');
  return createHash('sha256').update(canonical).digest('hex');
}

export class PilotRunStore {
  private readonly byId = new Map<string, PilotRunRecord>();

  record(input: PilotRunRecordInput): PilotRunRecord {
    if (!input.tenantId) throw new RangeError('tenantId required');
    if (!Array.isArray(input.verdicts)) {
      throw new RangeError('verdicts must be an array');
    }
    const runId = input.runId ?? randomUUID();
    const startedAt = input.startedAt ?? nowIso();
    const completedAt = input.completedAt ?? nowIso();
    const totalElapsedMs =
      input.totalElapsedMs ??
      Math.max(
        0,
        new Date(completedAt).getTime() - new Date(startedAt).getTime()
      );
    const passCount = input.verdicts.filter((v) => v.ok).length;
    const failCount = input.verdicts.length - passCount;
    const base: Omit<PilotRunRecord, 'resultHash'> = {
      runId,
      tenantId: input.tenantId,
      startedAt,
      completedAt,
      totalElapsedMs,
      passCount,
      failCount,
      overallOk: failCount === 0,
      verdicts: input.verdicts.map((v) => ({
        step: v.step,
        ok: !!v.ok,
        elapsedMs: Number(v.elapsedMs ?? 0),
        metrics: v.metrics ?? null,
      })),
    };
    const rec: PilotRunRecord = { ...base, resultHash: computeResultHash(base) };
    this.byId.set(rec.runId, rec);
    return rec;
  }

  get(runId: string): PilotRunRecord | null {
    return this.byId.get(runId) ?? null;
  }

  list(filters: PilotRunFilters = {}): PilotRunRecord[] {
    let rows = Array.from(this.byId.values());
    if (filters.tenantId) rows = rows.filter((r) => r.tenantId === filters.tenantId);
    if (filters.overallOk !== undefined) {
      rows = rows.filter((r) => r.overallOk === filters.overallOk);
    }
    return rows.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  }

  count(filters: PilotRunFilters = {}): number {
    return this.list(filters).length;
  }

  /** Drop a single run; returns true if removed. */
  delete(runId: string): boolean {
    return this.byId.delete(runId);
  }

  reset(): void {
    this.byId.clear();
  }
}
