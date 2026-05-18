/**
 * W210 Faza 600.0 — wallet provider healthcheck endpoint.
 *
 * POST /api/wallet/healthcheck — runs (or fetches cached) provider
 * health for every configured tenant and returns the aggregate.
 */
import type { FastifyInstance } from 'fastify';
import type { WalletOrchestrator } from '../lib/wallet/orchestrator.js';
import { requireRole } from '../state/rbac.js';

export interface WalletHealthRouteDeps {
  orchestrator: WalletOrchestrator;
}

export async function registerWalletHealthRoutes(
  app: FastifyInstance,
  deps: WalletHealthRouteDeps
): Promise<void> {
  const adminOnly = { preHandler: requireRole('admin') };

  app.post('/api/wallet/healthcheck', adminOnly, async (_req, reply) => {
    const results = await deps.orchestrator.runHealthChecks();
    const okCount = results.filter((r) => r.ok).length;
    return reply.send({
      ok: okCount === results.length,
      total: results.length,
      healthy: okCount,
      results,
    });
  });
}
