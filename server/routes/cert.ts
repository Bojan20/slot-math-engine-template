/**
 * CORTI 200.4-BACKEND — cert submission endpoints.
 *
 *  POST /api/cert/submit
 *  GET  /api/cert/:submissionId
 *  GET  /api/cert/:submissionId/download
 */

import type { FastifyInstance } from 'fastify';
import type { CertStore } from '../state/cert.js';

export interface CertRouteDeps {
  cert: CertStore;
}

interface SubmitBody {
  ir: unknown;
  jurisdiction: string;
}

export async function registerCertRoutes(
  app: FastifyInstance,
  deps: CertRouteDeps
): Promise<void> {
  app.post<{ Body: SubmitBody }>('/api/cert/submit', async (req, reply) => {
    const body = req.body ?? ({} as SubmitBody);
    if (!body.ir || typeof body.ir !== 'object') {
      return reply.code(400).send({ error: 'ir_required' });
    }
    if (!body.jurisdiction) {
      return reply.code(400).send({ error: 'jurisdiction_required' });
    }
    try {
      const submission = deps.cert.submit({
        ir: body.ir,
        jurisdiction: body.jurisdiction,
      });
      return reply.code(201).send({
        submissionId: submission.submissionId,
        status: submission.status,
        estimatedCompletion: submission.estimatedCompletion,
        irSha256: submission.irSha256,
      });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : 'submit_failed',
      });
    }
  });

  app.get<{ Params: { submissionId: string } }>(
    '/api/cert/:submissionId',
    async (req, reply) => {
      const sub = deps.cert.get(req.params.submissionId);
      if (!sub) return reply.code(404).send({ error: 'not_found' });
      return reply.send({
        submissionId: sub.submissionId,
        status: sub.status,
        jurisdiction: sub.jurisdiction,
        createdAt: sub.createdAt,
        estimatedCompletion: sub.estimatedCompletion,
        irSha256: sub.irSha256,
        parSheet: sub.parSheet,
        operatorPackage: sub.operatorPackage
          ? {
              sizeBytes: sub.operatorPackage.sizeBytes,
              sha256: sub.operatorPackage.sha256,
              downloadUrl: `/api/cert/${sub.submissionId}/download`,
            }
          : undefined,
        regulatorFeedback: sub.regulatorFeedback,
      });
    }
  );

  app.get<{ Params: { submissionId: string } }>(
    '/api/cert/:submissionId/download',
    async (req, reply) => {
      const download = deps.cert.download(req.params.submissionId);
      if (!download) return reply.code(404).send({ error: 'not_found_or_not_ready' });
      return reply
        .header('Content-Type', 'application/zip')
        .header(
          'Content-Disposition',
          `attachment; filename="operator-package-${req.params.submissionId}.zip"`
        )
        .header('X-Package-Sha256', download.sha256)
        .send(download.buffer);
    }
  );
}
