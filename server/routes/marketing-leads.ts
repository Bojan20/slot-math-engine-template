/**
 * W214 Faza 800.1 Agent C — Public marketing site lead capture route.
 *
 *   POST  /api/marketing/lead              insert a new lead (public, rate-limited)
 *   GET   /api/marketing/lead/:id          fetch by id (admin)
 *   POST  /api/marketing/lead/:id/sent     mark tarball as delivered (admin)
 *   GET   /api/marketing/leads             list w/ filters (admin)
 *
 * The POST is the unauthenticated entry the marketing site form posts to.
 * It enforces:
 *   * required fields + email regex
 *   * honeypot (silent drop on non-empty `company_website`)
 *   * IP-based rate limit (5 / hour by default, shared across process)
 *
 * Successful insert returns 201 with { leadId, operatorTier, routedTo }.
 * The route does NOT email or send the tarball directly — that is done
 * out-of-band by the sales automation (W213 contact list workflow).
 *
 * Reuses Agent B's W208 rate-limit + observability layers when wired
 * (an instance is constructed inline here when not provided so unit
 * tests can stub it).
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  RateLimiter,
  type LeadRole,
  type MarketingLeadStore,
} from '../state/marketing-leads.js';
import type { PostgresMarketingLeadStore } from '../state/marketing-leads-pg.js';

export type AnyLeadStore = MarketingLeadStore | PostgresMarketingLeadStore;

export interface MarketingLeadsRouteDeps {
  store: AnyLeadStore;
  /** Optional rate limiter; defaults to 5/hour per IP. */
  limiter?: RateLimiter;
  /** Optional auth check for admin endpoints (default: deny). */
  isAdmin?: (req: FastifyRequest) => boolean;
}

export interface MarketingLeadBody {
  name?: string;
  email?: string;
  company?: string;
  role?: string;
  message?: string;
  company_website?: string; // honeypot
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES: ReadonlySet<LeadRole> = new Set<LeadRole>([
  'CTO',
  'CMO',
  'CFO',
  'MathLead',
  'Other',
]);

/**
 * Validate the form payload and return either a normalized `LeadInput`
 * or a structured error suitable for a 400 response.
 */
export function validateLead(
  body: MarketingLeadBody
):
  | {
      ok: true;
      input: {
        name: string;
        email: string;
        company: string;
        role: LeadRole;
        message: string;
      };
    }
  | { ok: false; field: string; reason: string } {
  // Honeypot: silently treated as a valid drop downstream, but signalled
  // to the route so it can 200 the client without writing anything.
  if (body.company_website && String(body.company_website).trim() !== '') {
    return { ok: false, field: 'company_website', reason: 'honeypot' };
  }
  const name = (body.name ?? '').trim();
  if (name.length < 2) {
    return { ok: false, field: 'name', reason: 'name_too_short' };
  }
  const email = (body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, field: 'email', reason: 'invalid_email' };
  }
  const company = (body.company ?? '').trim();
  if (company.length < 2) {
    return { ok: false, field: 'company', reason: 'company_too_short' };
  }
  const roleStr = (body.role ?? '') as LeadRole;
  if (!VALID_ROLES.has(roleStr)) {
    return { ok: false, field: 'role', reason: 'invalid_role' };
  }
  const message = (body.message ?? '').trim().slice(0, 2000);
  return { ok: true, input: { name, email, company, role: roleStr, message } };
}

/** Resolve remote IP from headers / connection, with fallback. */
export function resolveRemoteIp(req: FastifyRequest): string {
  const hdr = req.headers['x-forwarded-for'];
  if (typeof hdr === 'string' && hdr.length > 0) {
    return hdr.split(',')[0].trim();
  }
  // Fastify exposes `ip` in newer versions; fall back to socket.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyReq = req as any;
  if (typeof anyReq.ip === 'string') return anyReq.ip;
  return anyReq.socket?.remoteAddress ?? '0.0.0.0';
}

export async function registerMarketingLeadRoutes(
  app: FastifyInstance,
  deps: MarketingLeadsRouteDeps
): Promise<void> {
  const limiter = deps.limiter ?? new RateLimiter(5, 60 * 60 * 1000);
  const isAdmin = deps.isAdmin ?? ((): boolean => false);

  // ─── PUBLIC: create lead ──────────────────────────────────────
  app.post<{ Body: MarketingLeadBody }>(
    '/api/marketing/lead',
    async (req, reply) => {
      const body = (req.body ?? {}) as MarketingLeadBody;

      const remoteIp = resolveRemoteIp(req);
      if (!limiter.allow(remoteIp)) {
        return reply.code(429).send({ error: 'rate_limited' });
      }

      const v = validateLead(body);
      if (!v.ok) {
        if (v.reason === 'honeypot') {
          // Silent drop — pretend success so the bot moves on.
          return reply.code(202).send({ accepted: true });
        }
        return reply
          .code(400)
          .send({ error: 'invalid_payload', field: v.field, reason: v.reason });
      }

      try {
        const created = await Promise.resolve(
          deps.store.create({ ...v.input, remoteIp })
        );
        return reply.code(201).send({
          leadId: created.leadId,
          operatorTier: created.operatorTier,
          routedTo: created.routedTo,
          receivedAt: created.receivedAt,
        });
      } catch (err) {
        return reply.code(500).send({
          error: err instanceof Error ? err.message : 'lead_create_failed',
        });
      }
    }
  );

  // ─── ADMIN: get by id ─────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/marketing/lead/:id',
    async (req, reply) => {
      if (!isAdmin(req)) return reply.code(403).send({ error: 'forbidden' });
      const rec = await Promise.resolve(deps.store.get(req.params.id));
      if (!rec) return reply.code(404).send({ error: 'not_found' });
      return reply.send(rec);
    }
  );

  // ─── ADMIN: mark sent ─────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/marketing/lead/:id/sent',
    async (req, reply) => {
      if (!isAdmin(req)) return reply.code(403).send({ error: 'forbidden' });
      const rec = await Promise.resolve(deps.store.markSent(req.params.id));
      if (!rec) return reply.code(404).send({ error: 'not_found' });
      return reply.send(rec);
    }
  );

  // ─── ADMIN: list ──────────────────────────────────────────────
  app.get<{
    Querystring: { email?: string; tier?: string; sent?: string };
  }>('/api/marketing/leads', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'forbidden' });
    const q = req.query ?? {};
    const filters = {
      email: q.email,
      operatorTier: q.tier as ReturnType<typeof JSON.parse> | undefined,
      sent: q.sent === 'true' ? true : q.sent === 'false' ? false : undefined,
    };
    const rows = await Promise.resolve(deps.store.list(filters));
    return reply.send({ rows, count: rows.length });
  });
}
