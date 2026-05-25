/**
 * W211 Faza 700.0 — Real Vendor B Pilot Onboard — pilot run REST routes.
 *
 *   POST /api/pilot/runs       — admin record a new run (called by CI /
 *                                 the integration-suite script).
 *   GET  /api/pilot/runs       — admin list runs (filter ?tenant=&ok=)
 *   GET  /api/pilot/runs/:id   — per-run detail
 *
 * The store backing these routes is either the in-memory PilotRunStore
 * or the Postgres-backed PostgresPilotRunStore. Both expose the same
 * record() / get() / list() API, so the route layer treats them as a
 * common interface.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  PilotRunFilters,
  PilotRunRecord,
  PilotRunRecordInput,
  PilotRunStore,
  PilotStepVerdict,
} from '../state/pilot-runs.js';
import type { PostgresPilotRunStore } from '../state/pilot-runs-pg.js';

type Store = PilotRunStore | PostgresPilotRunStore;

export interface PilotRouteDeps {
  store: Store;
}

function asPromise<T>(v: T | Promise<T>): Promise<T> {
  return v instanceof Promise ? v : Promise.resolve(v);
}

function badRequest(reply: FastifyReply, error: string): FastifyReply {
  return reply.code(400).send({ error });
}

function isVerdictArray(v: unknown): v is PilotStepVerdict[] {
  if (!Array.isArray(v)) return false;
  for (const e of v) {
    if (!e || typeof e !== 'object') return false;
    const r = e as Record<string, unknown>;
    if (typeof r.step !== 'string') return false;
    if (typeof r.ok !== 'boolean') return false;
  }
  return true;
}

export async function registerPilotRoutes(
  app: FastifyInstance,
  deps: PilotRouteDeps
): Promise<void> {
  app.post<{
    Body: {
      runId?: string;
      tenantId?: string;
      startedAt?: string;
      completedAt?: string;
      totalElapsedMs?: number;
      verdicts?: unknown;
    };
  }>('/api/pilot/runs', async (req, reply) => {
    const body = req.body ?? {};
    if (!body.tenantId) return badRequest(reply, 'tenantId_required');
    if (!isVerdictArray(body.verdicts)) {
      return badRequest(reply, 'verdicts_must_be_array');
    }
    const input: PilotRunRecordInput = {
      runId: body.runId,
      tenantId: body.tenantId,
      startedAt: body.startedAt,
      completedAt: body.completedAt,
      totalElapsedMs: body.totalElapsedMs,
      verdicts: body.verdicts,
    };
    const rec = await asPromise<PilotRunRecord>(deps.store.record(input));
    return reply.code(201).send({ run: rec });
  });

  app.get<{
    Querystring: { tenant?: string; ok?: string };
  }>('/api/pilot/runs', async (req, reply) => {
    const filters: PilotRunFilters = {};
    if (req.query.tenant) filters.tenantId = req.query.tenant;
    if (req.query.ok !== undefined) {
      filters.overallOk = req.query.ok === 'true' || req.query.ok === '1';
    }
    const rows = await asPromise(deps.store.list(filters));
    return reply.send({ runs: rows, total: rows.length });
  });

  app.get<{ Params: { id: string } }>(
    '/api/pilot/runs/:id',
    async (req, reply) => {
      const rec = await asPromise(deps.store.get(req.params.id));
      if (!rec) return reply.code(404).send({ error: 'pilot_run_not_found' });
      return reply.send({ run: rec });
    }
  );
}
