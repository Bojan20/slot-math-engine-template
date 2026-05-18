/**
 * CORTI 200.4-BACKEND — audit log endpoints.
 *
 *  POST /api/audit/append
 *  GET  /api/audit/:sessionId
 *  GET  /api/audit/replay/:auditId
 */

import type { FastifyInstance } from 'fastify';
import type { AuditStore } from '../state/audit.js';
import { requireRole } from '../state/rbac.js';

export interface AuditRouteDeps {
  audit: AuditStore;
}

interface AppendBody {
  sessionId: string;
  type: string;
  payload: unknown;
}

export async function registerAuditRoutes(
  app: FastifyInstance,
  deps: AuditRouteDeps
): Promise<void> {
  // CORTI W206-SECURITY — audit.append requires operator+ (RBAC). Read
  // endpoints intentionally allow regulator/operator/admin via inheritance.
  app.post<{ Body: AppendBody }>('/api/audit/append', { preHandler: requireRole('operator') }, async (req, reply) => {
    const body = req.body ?? ({} as AppendBody);
    if (!body.sessionId || !body.type) {
      return reply.code(400).send({ error: 'sessionId_and_type_required' });
    }
    const entry = deps.audit.append({
      sessionId: body.sessionId,
      type: body.type,
      payload: body.payload ?? null,
    });
    return reply.code(201).send({
      auditId: entry.auditId,
      timestamp: entry.timestamp,
      sha256: entry.current,
      seq: entry.seq,
      prev: entry.prev,
    });
  });

  app.get<{ Params: { sessionId: string } }>(
    '/api/audit/:sessionId',
    { preHandler: requireRole('regulator') },
    async (req, reply) => {
      const result = deps.audit.query(req.params.sessionId);
      const verification = deps.audit.verify(req.params.sessionId);
      return reply.send({
        sessionId: req.params.sessionId,
        entries: result.entries,
        merkleRoot: result.merkleRoot,
        count: result.count,
        chainOk: verification.ok,
      });
    }
  );

  app.get<{ Params: { auditId: string } }>(
    '/api/audit/replay/:auditId',
    { preHandler: requireRole('regulator') },
    async (req, reply) => {
      const result = deps.audit.replay(req.params.auditId);
      if (!result) return reply.code(404).send({ error: 'audit_id_not_found' });
      return reply.send({
        previous: result.previous,
        current: result.current,
        next: result.next,
        chainOk: result.chainOk,
      });
    }
  );
}
