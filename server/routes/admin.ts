/**
 * CORTI 200.6-DEVOPS — tenant admin API.
 *
 *  GET    /api/admin/tenants
 *  POST   /api/admin/tenants
 *  GET    /api/admin/tenants/:id
 *  PATCH  /api/admin/tenants/:id
 *  DELETE /api/admin/tenants/:id
 *
 * Also installs a `preHandler` hook that resolves the tenant from the
 * `X-Tenant-Id` header and enforces the per-tenant rate limit.
 *
 * In production these endpoints would sit behind operator auth (JWT
 * with admin scope). Here we keep them open so smoke deploys and tests
 * can drive CRUD directly.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  TenantStore,
  resolveTenant,
  type Tenant,
  type TenantInput,
  type TenantPatch,
} from '../state/tenants.js';

export interface AdminRouteDeps {
  tenants: TenantStore;
}

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: Tenant;
  }
}

interface CreateBody extends TenantInput {}
interface PatchBody extends TenantPatch {}

export async function registerAdminRoutes(
  app: FastifyInstance,
  deps: AdminRouteDeps
): Promise<void> {
  // Per-request: stash the resolved tenant and enforce rate limit.
  // Admin routes themselves are exempt from the per-tenant cap because
  // they are infrastructure plane, not data plane.
  app.addHook('preHandler', async (req: FastifyRequest, reply) => {
    if (req.url.startsWith('/api/admin/')) return;
    if (req.url.startsWith('/api/health')) return;
    if (req.url.startsWith('/api/metrics')) return;
    const tenant = resolveTenant(deps.tenants, req.headers as Record<string, string | string[] | undefined>);
    if (tenant === null) {
      return reply.code(400).send({ error: 'unknown_tenant' });
    }
    req.tenant = tenant;
    const budget = deps.tenants.consumeRateBudget(tenant.id);
    if (!budget.ok) {
      reply.header('Retry-After', String(budget.retryAfterSeconds));
      return reply.code(429).send({
        error: 'rate_limit_exceeded',
        tenant: tenant.id,
        retryAfterSeconds: budget.retryAfterSeconds,
      });
    }
  });

  app.get('/api/admin/tenants', async (_req, reply) => {
    return reply.send({ tenants: deps.tenants.list() });
  });

  app.post<{ Body: CreateBody }>('/api/admin/tenants', async (req, reply) => {
    const body = req.body ?? ({} as CreateBody);
    if (!body.id || !body.name || !body.contactEmail) {
      return reply.code(400).send({ error: 'id_name_email_required' });
    }
    try {
      const tenant = deps.tenants.create(body);
      return reply.code(201).send({ tenant });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : 'create_failed',
      });
    }
  });

  app.get<{ Params: { id: string } }>(
    '/api/admin/tenants/:id',
    async (req, reply) => {
      const tenant = deps.tenants.get(req.params.id);
      if (!tenant) return reply.code(404).send({ error: 'not_found' });
      return reply.send({ tenant });
    }
  );

  app.patch<{ Params: { id: string }; Body: PatchBody }>(
    '/api/admin/tenants/:id',
    async (req, reply) => {
      try {
        const tenant = deps.tenants.update(req.params.id, req.body ?? {});
        return reply.send({ tenant });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'update_failed';
        const code = msg.includes('not found') ? 404 : 400;
        return reply.code(code).send({ error: msg });
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/tenants/:id',
    async (req, reply) => {
      const ok = deps.tenants.delete(req.params.id);
      if (!ok) return reply.code(404).send({ error: 'not_found' });
      return reply.code(204).send();
    }
  );
}
