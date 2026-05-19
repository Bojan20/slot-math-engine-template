/**
 * W215 Faza 1300.0 Agent C — Customer Success Manager (CSM) routes.
 *
 * Wires the 5 CSM-operations stores under three top-level paths:
 *
 *   /api/csm/customers/...   onboarding tracker
 *   /api/support/tickets/... support tickets (tenant-scoped)
 *   /api/csm/nps/...         NPS survey
 *   /api/csm/churn-risk      churn-risk scorer
 *
 * Admin endpoints require `isAdmin(req)` → true. Tenant-scoped endpoints
 * require a `req.tenantId` set by the W208 tenant-isolation pre-handler
 * (caller injects it for unit tests).
 *
 * NOTE on tickets: the public `POST /api/support/tickets` requires
 * `req.tenantId` for write isolation; admin scoping is *implicit* via
 * the W208 cross-tenant override on list. This matches the audit / cert
 * route patterns.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CustomerOnboardingStore } from '../state/customer-onboarding.js';
import type {
  SupportTicketStore,
  TicketSeverity,
  TicketCategory,
  TicketStatus,
} from '../state/support-tickets.js';
import type { NpsStore, NpsResponseInput } from '../lib/csm/nps.js';

export interface CsmRouteDeps {
  onboarding: CustomerOnboardingStore;
  tickets: SupportTicketStore;
  nps: NpsStore;
  isAdmin?: (req: FastifyRequest) => boolean;
  resolveTenantId?: (req: FastifyRequest) => string | null;
}

interface OnboardingCreateBody {
  tenantId?: string;
  displayName?: string;
  tier?: 'enterprise' | 'platform' | 'indie';
  dealValueUsd?: number;
  csmEmail?: string;
  renewalDueAt?: string;
}

interface TransitionBody {
  toStage?: string;
  actor?: string;
  note?: string;
}

interface TicketCreateBody {
  raisedBy?: string;
  title?: string;
  description?: string;
  severity?: TicketSeverity;
  category?: TicketCategory;
  assignee?: string;
}

interface TicketPatchBody {
  status?: TicketStatus;
  assignee?: string;
  severity?: TicketSeverity;
  resolution?: string;
}

interface CommentBody {
  author?: string;
  body?: string;
}

interface NpsSendBody {
  tenantId?: string;
  email?: string;
}

interface NpsRespondBody {
  token?: string;
  scoreOutOf10?: number;
  comment?: string;
}

export async function registerCsmRoutes(
  app: FastifyInstance,
  deps: CsmRouteDeps,
): Promise<void> {
  const isAdmin = deps.isAdmin ?? ((): boolean => false);
  const resolveTenant =
    deps.resolveTenantId ??
    ((req: FastifyRequest): string | null => {
      // Fall back to the W208 tenant-context pre-handler if available.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyReq = req as any;
      return anyReq.tenantId ?? null;
    });

  // ===== Customer onboarding (admin) =====
  app.post<{ Body: OnboardingCreateBody }>(
    '/api/csm/customers',
    async (req, reply) => {
      if (!isAdmin(req)) return reply.code(403).send({ error: 'forbidden' });
      try {
        const b = req.body ?? {};
        const rec = deps.onboarding.create({
          tenantId: b.tenantId ?? '',
          displayName: b.displayName ?? '',
          tier: (b.tier ?? 'indie') as 'enterprise' | 'platform' | 'indie',
          dealValueUsd: Number(b.dealValueUsd ?? 0),
          csmEmail: b.csmEmail ?? '',
          renewalDueAt: b.renewalDueAt ?? '',
        });
        return reply.code(201).send(rec);
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'create_failed',
        });
      }
    },
  );

  app.get('/api/csm/customers', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'forbidden' });
    const rows = deps.onboarding.list();
    return reply.send({
      rows,
      count: rows.length,
      countsByStage: deps.onboarding.countByStage(),
      slaBreaches: deps.onboarding.listSlaBreaches(),
      upcomingRenewals: deps.onboarding.listUpcomingRenewals(),
    });
  });

  app.get<{ Params: { id: string } }>(
    '/api/csm/customers/:id',
    async (req, reply) => {
      if (!isAdmin(req)) return reply.code(403).send({ error: 'forbidden' });
      const rec = deps.onboarding.get(req.params.id);
      if (!rec) return reply.code(404).send({ error: 'not_found' });
      return reply.send(rec);
    },
  );

  app.post<{ Params: { id: string }; Body: TransitionBody }>(
    '/api/csm/customers/:id/transition',
    async (req, reply) => {
      if (!isAdmin(req)) return reply.code(403).send({ error: 'forbidden' });
      const b = req.body ?? {};
      if (!b.toStage) return reply.code(400).send({ error: 'missing_toStage' });
      try {
        const rec = deps.onboarding.transition(
          req.params.id,
          // Casting is safe — the store re-validates.
          b.toStage as Parameters<CustomerOnboardingStore['transition']>[1],
          b.actor ?? 'system',
          b.note ?? '',
        );
        return reply.send(rec);
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'transition_failed',
        });
      }
    },
  );

  // ===== Support tickets =====
  app.post<{ Body: TicketCreateBody }>(
    '/api/support/tickets',
    async (req, reply) => {
      const tenantId = resolveTenant(req);
      if (!tenantId) return reply.code(403).send({ error: 'tenant_required' });
      try {
        const b = req.body ?? {};
        const t = deps.tickets.create({
          tenantId,
          raisedBy: b.raisedBy ?? '',
          title: b.title ?? '',
          description: b.description ?? '',
          severity: (b.severity ?? 'P2') as TicketSeverity,
          category: (b.category ?? 'question') as TicketCategory,
          assignee: b.assignee,
        });
        return reply.code(201).send(t);
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'create_failed',
        });
      }
    },
  );

  app.get<{
    Querystring: {
      severity?: string;
      status?: string;
      category?: string;
      assignee?: string;
    };
  }>('/api/support/tickets', async (req, reply) => {
    const tenantId = resolveTenant(req);
    const q = req.query ?? {};
    const filter = {
      tenantId: tenantId ?? undefined,
      severity: q.severity as TicketSeverity | undefined,
      status: q.status as TicketStatus | undefined,
      category: q.category as TicketCategory | undefined,
      assignee: q.assignee,
    };
    // Admins may pass `?adminAll=true` to see across tenants.
    if (
      isAdmin(req) &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req.query as any)?.adminAll === 'true'
    ) {
      filter.tenantId = undefined;
    }
    if (!filter.tenantId && !isAdmin(req)) {
      return reply.code(403).send({ error: 'tenant_required' });
    }
    const rows = deps.tickets.list(filter);
    return reply.send({
      rows,
      count: rows.length,
      countsByStatus: deps.tickets.countByStatus(filter),
      meanTimeToResolutionHours: deps.tickets.meanTimeToResolutionHours(filter),
    });
  });

  app.get<{ Params: { id: string } }>(
    '/api/support/tickets/:id',
    async (req, reply) => {
      const tenantId = resolveTenant(req);
      const t = deps.tickets.get(req.params.id);
      if (!t) return reply.code(404).send({ error: 'not_found' });
      if (!isAdmin(req) && (!tenantId || t.tenantId !== tenantId)) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      return reply.send(t);
    },
  );

  app.patch<{ Params: { id: string }; Body: TicketPatchBody }>(
    '/api/support/tickets/:id',
    async (req, reply) => {
      const tenantId = resolveTenant(req);
      const existing = deps.tickets.get(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'not_found' });
      if (!isAdmin(req) && (!tenantId || existing.tenantId !== tenantId)) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      try {
        const updated = deps.tickets.patch(
          req.params.id,
          req.body ?? {},
          tenantId ?? 'admin',
        );
        return reply.send(updated);
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'patch_failed',
        });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: CommentBody }>(
    '/api/support/tickets/:id/comment',
    async (req, reply) => {
      const tenantId = resolveTenant(req);
      const existing = deps.tickets.get(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'not_found' });
      if (!isAdmin(req) && (!tenantId || existing.tenantId !== tenantId)) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      try {
        const b = req.body ?? {};
        const c = deps.tickets.appendComment(
          req.params.id,
          b.author ?? 'unknown',
          b.body ?? '',
        );
        return reply.code(201).send(c);
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'comment_failed',
        });
      }
    },
  );

  // ===== NPS =====
  app.post<{ Body: NpsSendBody }>('/api/csm/nps/send', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'forbidden' });
    const b = req.body ?? {};
    if (!b.tenantId || !b.email) {
      return reply.code(400).send({ error: 'missing_fields' });
    }
    try {
      const invite = deps.nps.composeInvite(b.tenantId, b.email);
      return reply.code(201).send(invite);
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : 'compose_failed',
      });
    }
  });

  app.get('/api/csm/nps/responses', async (req, reply) => {
    const tenantId = resolveTenant(req);
    if (!isAdmin(req) && !tenantId) {
      return reply.code(403).send({ error: 'tenant_required' });
    }
    const rows = deps.nps.list(
      tenantId && !isAdmin(req) ? { tenantId } : {},
    );
    return reply.send({
      rows,
      count: rows.length,
      aggregate: deps.nps.aggregate(
        tenantId && !isAdmin(req) ? { tenantId } : {},
      ),
    });
  });

  // Tokenized public submission — no auth needed.
  app.post<{ Body: NpsRespondBody }>(
    '/api/csm/nps/responses',
    async (req, reply) => {
      const b = req.body ?? {};
      if (!b.token || b.scoreOutOf10 === undefined) {
        return reply.code(400).send({ error: 'missing_fields' });
      }
      try {
        const { tenantId, email } = deps.nps.redeemToken(b.token);
        const input: NpsResponseInput = {
          tenantId,
          respondentEmail: email,
          scoreOutOf10: b.scoreOutOf10,
          comment: b.comment,
        };
        const r = deps.nps.record(input);
        return reply.code(201).send(r);
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'record_failed',
        });
      }
    },
  );
}
