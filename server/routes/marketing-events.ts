/**
 * W215 Faza 800.2 Agent C — Marketing analytics event routes.
 *
 *   POST  /api/marketing/event                       insert event batch (public, rate-limited)
 *   GET   /api/marketing/analytics/funnel            funnel JSON (admin)
 *   GET   /api/marketing/analytics/ab/:experimentId  A/B experiment results (admin)
 *   GET   /api/marketing/analytics/pageviews         pageviews breakdown (admin)
 *
 * Public POST accepts {sessionId, events:[…]} or {events:[…]} (each
 * event carries its own sessionId). Reuses the {@link RateLimiter}
 * pattern from `marketing-leads.ts` at 100 req/min per IP.
 *
 * All admin endpoints require the injected isAdmin predicate.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { RateLimiter } from '../state/marketing-leads.js';
import {
  MarketingEventStore,
  isValidEventType,
  type MarketingEventInput,
  type MarketingEventType,
} from '../state/marketing-events.js';
import type { PostgresMarketingEventStore } from '../state/marketing-events-pg.js';
import { resolveRemoteIp } from './marketing-leads.js';

export type AnyEventStore = MarketingEventStore | PostgresMarketingEventStore;

export interface MarketingEventsRouteDeps {
  store: AnyEventStore;
  limiter?: RateLimiter;
  isAdmin?: (req: FastifyRequest) => boolean;
}

export interface MarketingEventBatchBody {
  sessionId?: string;
  events?: Array<{
    type?: string;
    sessionId?: string;
    ts?: number;
    page?: string;
    destination?: string;
    formId?: string;
    videoId?: string;
    experimentId?: string;
    variant?: string;
    props?: Record<string, unknown>;
  }>;
}

const MAX_BATCH = 25;
const SESSION_RE = /^[a-zA-Z0-9_-]{8,128}$/;

export function validateBatch(
  body: MarketingEventBatchBody
): { ok: true; inputs: MarketingEventInput[] } | { ok: false; reason: string; field?: string } {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'invalid_body' };
  const events = Array.isArray(body.events) ? body.events : null;
  if (!events || events.length === 0) return { ok: false, reason: 'events_required' };
  if (events.length > MAX_BATCH) return { ok: false, reason: 'batch_too_large' };
  const inputs: MarketingEventInput[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e || typeof e !== 'object') return { ok: false, reason: 'invalid_event', field: `events[${i}]` };
    const type = String(e.type ?? '');
    if (!isValidEventType(type)) return { ok: false, reason: 'invalid_event_type', field: `events[${i}].type` };
    const sessionId = String(e.sessionId ?? body.sessionId ?? '');
    if (!SESSION_RE.test(sessionId)) return { ok: false, reason: 'invalid_session_id', field: `events[${i}].sessionId` };
    inputs.push({
      type: type as MarketingEventType,
      sessionId,
      ts: typeof e.ts === 'number' ? e.ts : undefined,
      page: e.page ? String(e.page).slice(0, 400) : undefined,
      destination: e.destination ? String(e.destination).slice(0, 400) : undefined,
      formId: e.formId ? String(e.formId).slice(0, 80) : undefined,
      videoId: e.videoId ? String(e.videoId).slice(0, 80) : undefined,
      experimentId: e.experimentId ? String(e.experimentId).slice(0, 60) : undefined,
      variant: e.variant ? String(e.variant).slice(0, 60) : undefined,
      props: e.props && typeof e.props === 'object' ? e.props : undefined,
    });
  }
  return { ok: true, inputs };
}

export async function registerMarketingEventRoutes(
  app: FastifyInstance,
  deps: MarketingEventsRouteDeps
): Promise<void> {
  const limiter = deps.limiter ?? new RateLimiter(100, 60 * 1000);
  const isAdmin = deps.isAdmin ?? ((): boolean => false);

  // ─── PUBLIC: ingest event batch ──────────────────────────────────────
  app.post<{ Body: MarketingEventBatchBody }>(
    '/api/marketing/event',
    async (req, reply) => {
      const remoteIp = resolveRemoteIp(req);
      if (!limiter.allow(remoteIp)) {
        return reply.code(429).send({ error: 'rate_limited' });
      }
      // Respect DNT defensively: if the client sent the header we drop
      // silently with a 204 so the network round-trip doesn't get
      // expensive when a privacy-conscious user keeps the tab open.
      if (req.headers['dnt'] === '1') {
        return reply.code(204).send();
      }
      const v = validateBatch((req.body ?? {}) as MarketingEventBatchBody);
      if (!v.ok) {
        return reply.code(400).send({ error: 'invalid_payload', reason: v.reason, field: v.field });
      }
      try {
        const stamped = v.inputs.map((i) => ({ ...i, remoteIp }));
        const result = await Promise.resolve(deps.store.addBatch(stamped));
        return reply.code(201).send({ accepted: result.length });
      } catch (err) {
        return reply.code(500).send({
          error: err instanceof Error ? err.message : 'event_add_failed',
        });
      }
    }
  );

  // ─── ADMIN: funnel ─────────────────────────────────────────────────
  app.get<{ Querystring: { window?: string } }>(
    '/api/marketing/analytics/funnel',
    async (req, reply) => {
      if (!isAdmin(req)) return reply.code(403).send({ error: 'forbidden' });
      const win = Number(req.query?.window ?? '30');
      const days = Number.isFinite(win) && win > 0 && win <= 365 ? win : 30;
      const snap = await Promise.resolve(deps.store.funnel(days));
      return reply.send(snap);
    }
  );

  // ─── ADMIN: pageviews ──────────────────────────────────────────────
  app.get<{ Querystring: { window?: string } }>(
    '/api/marketing/analytics/pageviews',
    async (req, reply) => {
      if (!isAdmin(req)) return reply.code(403).send({ error: 'forbidden' });
      const win = Number(req.query?.window ?? '30');
      const days = Number.isFinite(win) && win > 0 && win <= 365 ? win : 30;
      const rows = await Promise.resolve(deps.store.pageviewBreakdown(days));
      return reply.send({ rows, count: rows.length, windowDays: days });
    }
  );

  // ─── ADMIN: A/B experiment results ─────────────────────────────────
  app.get<{ Params: { experimentId: string }; Querystring: { window?: string } }>(
    '/api/marketing/analytics/ab/:experimentId',
    async (req, reply) => {
      if (!isAdmin(req)) return reply.code(403).send({ error: 'forbidden' });
      const win = Number(req.query?.window ?? '30');
      const days = Number.isFinite(win) && win > 0 && win <= 365 ? win : 30;
      const rows = await Promise.resolve(deps.store.abAggregate(req.params.experimentId, days));
      return reply.send({ experimentId: req.params.experimentId, rows, windowDays: days });
    }
  );
}
