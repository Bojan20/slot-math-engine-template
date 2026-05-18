/**
 * CORTI W204-PROTOCOLS — cert submission endpoints.
 *
 *  POST /api/cert/submit
 *  GET  /api/cert/:submissionId
 *  GET  /api/cert/:submissionId/download                — operator-package.zip
 *  GET  /api/cert/:submissionId/par.pdf                 — real PAR PDF (pdf-lib)
 *  GET  /api/cert/:submissionId/verify-signature        — ed25519 verify
 */

import type { FastifyInstance } from 'fastify';
import type { CertStore } from '../state/cert.js';
import { HsmStore } from '../state/hsm.js';

export interface CertRouteDeps {
  cert: CertStore;
  hsm?: HsmStore;
}

interface SubmitBody {
  ir: unknown;
  jurisdiction: string;
}

export async function registerCertRoutes(
  app: FastifyInstance,
  deps: CertRouteDeps
): Promise<void> {
  if (deps.hsm) {
    await deps.hsm.init();
    deps.cert.withHsm(deps.hsm);
  }

  app.post<{ Body: SubmitBody }>('/api/cert/submit', async (req, reply) => {
    const body = req.body ?? ({} as SubmitBody);
    if (!body.ir || typeof body.ir !== 'object') {
      return reply.code(400).send({ error: 'ir_required' });
    }
    if (!body.jurisdiction) {
      return reply.code(400).send({ error: 'jurisdiction_required' });
    }
    try {
      const submission = await deps.cert.submit({
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
        parPdfSha256: sub.parPdfSha256,
        hsmSignature: sub.hsmSignature
          ? {
              publicKey: sub.hsmSignature.publicKey,
              signature: sub.hsmSignature.signature,
              signedAt: sub.hsmSignature.signedAt,
              signer: sub.hsmSignature.signer,
            }
          : undefined,
        operatorPackage: sub.operatorPackage
          ? {
              sizeBytes: sub.operatorPackage.sizeBytes,
              sha256: sub.operatorPackage.sha256,
              downloadUrl: `/api/cert/${sub.submissionId}/download`,
            }
          : undefined,
        parPdfUrl: sub.parPdfSha256
          ? `/api/cert/${sub.submissionId}/par.pdf`
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

  app.get<{ Params: { submissionId: string } }>(
    '/api/cert/:submissionId/par.pdf',
    async (req, reply) => {
      const sub = deps.cert.get(req.params.submissionId);
      const pdf = deps.cert.getPdf(req.params.submissionId);
      if (!sub || !pdf) {
        return reply.code(404).send({ error: 'pdf_not_ready' });
      }
      const par = deps.cert.getPar(req.params.submissionId);
      const filename = par
        ? `PAR_${par.gameId}_${par.jurisdiction}.pdf`
        : `PAR_${req.params.submissionId}.pdf`;
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="${filename}"`)
        .header('X-Par-Sha256', sub.parSheet?.sha256 ?? '')
        .header('X-Par-Pdf-Sha256', sub.parPdfSha256 ?? '')
        .header('X-Hsm-Public-Key', sub.hsmSignature?.publicKey ?? '')
        .header('X-Hsm-Signature', sub.hsmSignature?.signature ?? '')
        .send(pdf);
    }
  );

  app.get<{ Params: { submissionId: string } }>(
    '/api/cert/:submissionId/verify-signature',
    async (req, reply) => {
      const sub = deps.cert.get(req.params.submissionId);
      if (!sub) return reply.code(404).send({ error: 'not_found' });
      if (!sub.hsmSignature || !sub.parSheet) {
        return reply.code(409).send({ error: 'not_signed_yet' });
      }
      const par = deps.cert.getPar(req.params.submissionId);
      if (!par) return reply.code(404).send({ error: 'par_missing' });
      const valid = HsmStore.verifyCanonical(
        sub.hsmSignature.signature,
        sub.hsmSignature.publicKey,
        {
          gameId: par.gameId,
          jurisdiction: par.jurisdiction,
          irSha256: par.irSha256,
          parSha256: sub.parSheet.sha256,
          merkleRoot: sub.parSheet.merkleRoot,
        }
      );
      return reply.send({
        valid,
        signedAt: sub.hsmSignature.signedAt,
        signer: sub.hsmSignature.signer,
        publicKey: sub.hsmSignature.publicKey,
        merkleRoot: sub.parSheet.merkleRoot,
        parSha256: sub.parSheet.sha256,
        gameId: par.gameId,
        jurisdiction: par.jurisdiction,
      });
    }
  );
}
