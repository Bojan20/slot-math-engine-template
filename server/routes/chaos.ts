/**
 * W212 Faza 600.1 — Admin chaos UI endpoint.
 *
 *   GET    /api/admin/chaos        → list active faults
 *   POST   /api/admin/chaos/enable → { name, probability }
 *   POST   /api/admin/chaos/disable→ { name } | { all: true }
 *   POST   /api/admin/chaos/reset  → reset counters
 *
 * Always env-gated: when `CHAOS_ENABLED !== 'true'` or `NODE_ENV ===
 * 'production'`, every mutating call returns 403. The GET works either
 * way so dashboards can render an empty state without 403'ing.
 *
 * Admin RBAC enforced via the standard `requireRole('admin')` guard.
 */

import type { FastifyInstance } from 'fastify';
import { requireRole } from '../state/rbac.js';
import { chaos as defaultChaos, FAULT_NAMES, isFaultName, type ChaosController } from '../lib/chaos/index.js';

export interface ChaosRouteDeps {
  /** Override the singleton controller (tests). */
  controller?: ChaosController;
}

interface EnableBody {
  name?: string;
  probability?: number;
}
interface DisableBody {
  name?: string;
  all?: boolean;
}

export async function registerChaosRoutes(
  app: FastifyInstance,
  deps: ChaosRouteDeps = {}
): Promise<void> {
  const ctrl = deps.controller ?? defaultChaos;
  const adminOnly = { preHandler: requireRole('admin') };

  app.get('/api/admin/chaos', adminOnly, async () => {
    return {
      enabled: ctrl.isEnabled(),
      env: {
        chaosEnabled: process.env.CHAOS_ENABLED === 'true',
        nodeEnv: process.env.NODE_ENV ?? 'development',
      },
      faults: ctrl.list(),
      availableFaults: FAULT_NAMES,
      totals: ctrl.totals(),
    };
  });

  app.post<{ Body: EnableBody }>('/api/admin/chaos/enable', adminOnly, async (req, reply) => {
    if (!ctrl.isEnabled()) {
      return reply.code(403).send({ error: 'chaos_disabled_by_env' });
    }
    const body = req.body ?? {};
    if (!body.name || !isFaultName(body.name)) {
      return reply.code(400).send({ error: 'invalid_fault_name', validNames: FAULT_NAMES });
    }
    const p = typeof body.probability === 'number' ? body.probability : 0;
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      return reply.code(400).send({ error: 'probability_out_of_range' });
    }
    const rec = ctrl.enable(body.name, p);
    return { ok: true, fault: rec };
  });

  app.post<{ Body: DisableBody }>('/api/admin/chaos/disable', adminOnly, async (req, reply) => {
    if (!ctrl.isEnabled()) {
      return reply.code(403).send({ error: 'chaos_disabled_by_env' });
    }
    const body = req.body ?? {};
    if (body.all === true) {
      ctrl.disableAll();
      return { ok: true, cleared: true };
    }
    if (!body.name || !isFaultName(body.name)) {
      return reply.code(400).send({ error: 'invalid_fault_name', validNames: FAULT_NAMES });
    }
    const removed = ctrl.disable(body.name);
    return { ok: true, removed };
  });

  app.post('/api/admin/chaos/reset', adminOnly, async () => {
    ctrl.resetCounters();
    return { ok: true, totals: ctrl.totals() };
  });
}
