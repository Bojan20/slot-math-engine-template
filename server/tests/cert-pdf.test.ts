/**
 * CORTI W204-PROTOCOLS — real PAR PDF tests (pdf-lib).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';

const SAMPLE_IR = {
  meta: { id: 'demo-pdf-game', version: '1.0.0' },
  game: { id: 'demo-pdf-game', topology: 'rectangular' },
  reels: [{ stops: 30, symbols: ['A', 'B', 'C'] }],
  paytable: { A: 5 },
};

describe('Cert PAR PDF (pdf-lib)', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildTestApp();
  });
  afterEach(async () => {
    await app.close();
  });

  async function submitAndGet(): Promise<{ submissionId: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cert/submit',
      payload: { ir: SAMPLE_IR, jurisdiction: 'MGA' },
    });
    expect(res.statusCode).toBe(201);
    return { submissionId: res.json().submissionId };
  }

  it('endpoint returns application/pdf content-type', async () => {
    const { submissionId } = await submitAndGet();
    const res = await app.inject({ method: 'GET', url: `/api/cert/${submissionId}/par.pdf` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('emits a Content-Disposition with PAR_<gameId>_<jurisdiction>.pdf filename', async () => {
    const { submissionId } = await submitAndGet();
    const res = await app.inject({ method: 'GET', url: `/api/cert/${submissionId}/par.pdf` });
    expect(res.headers['content-disposition']).toContain('PAR_demo-pdf-game_MGA.pdf');
  });

  it('returns 404 for unknown submissionId', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/cert/cert-bogus/par.pdf' });
    expect(res.statusCode).toBe(404);
  });

  it('returns PDF bytes that begin with the %PDF magic header', async () => {
    const { submissionId } = await submitAndGet();
    const res = await app.inject({ method: 'GET', url: `/api/cert/${submissionId}/par.pdf` });
    const buf = res.rawPayload;
    expect(buf.length).toBeGreaterThan(1024);
    expect(buf.slice(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('PDF parses back through pdf-lib and reports ≥ 1 page', async () => {
    const { submissionId } = await submitAndGet();
    const res = await app.inject({ method: 'GET', url: `/api/cert/${submissionId}/par.pdf` });
    const pdf = await PDFDocument.load(res.rawPayload);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('PDF metadata embeds title with gameId + jurisdiction', async () => {
    const { submissionId } = await submitAndGet();
    const res = await app.inject({ method: 'GET', url: `/api/cert/${submissionId}/par.pdf` });
    const pdf = await PDFDocument.load(res.rawPayload);
    expect(pdf.getTitle()).toContain('demo-pdf-game');
    expect(pdf.getTitle()).toContain('MGA');
  });

  it('PDF metadata embeds expected author + subject', async () => {
    const { submissionId } = await submitAndGet();
    const res = await app.inject({ method: 'GET', url: `/api/cert/${submissionId}/par.pdf` });
    const pdf = await PDFDocument.load(res.rawPayload);
    expect(pdf.getAuthor()).toBe('slot-math-engine-template');
    expect(pdf.getSubject()).toContain('GLI-16');
  });

  it('GET status returns parPdfUrl + hsmSignature + parPdfSha256', async () => {
    const { submissionId } = await submitAndGet();
    const res = await app.inject({ method: 'GET', url: `/api/cert/${submissionId}` });
    const body = res.json();
    expect(body.parPdfUrl).toContain(submissionId);
    expect(body.parPdfSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body.hsmSignature).toBeDefined();
    expect(body.hsmSignature.publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(body.hsmSignature.signature).toMatch(/^[0-9a-f]{128}$/);
  });

  it('PDF response carries X-Hsm-Public-Key + X-Hsm-Signature headers', async () => {
    const { submissionId } = await submitAndGet();
    const res = await app.inject({ method: 'GET', url: `/api/cert/${submissionId}/par.pdf` });
    expect(res.headers['x-hsm-public-key']).toMatch(/^[0-9a-f]{64}$/);
    expect(res.headers['x-hsm-signature']).toMatch(/^[0-9a-f]{128}$/);
    expect(res.headers['x-par-sha256']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('two submissions with identical IR share the same HSM public key + irSha256', async () => {
    // The PAR generatedAt timestamp differs across submissions so the
    // parSheet sha256 isn't stable, but the HSM keypair + the canonical
    // IR hash must match.
    const a = await submitAndGet();
    const b = await submitAndGet();
    const sa = (await app.inject({ method: 'GET', url: `/api/cert/${a.submissionId}` })).json();
    const sb = (await app.inject({ method: 'GET', url: `/api/cert/${b.submissionId}` })).json();
    expect(sa.irSha256).toBe(sb.irSha256);
    expect(sa.hsmSignature.publicKey).toBe(sb.hsmSignature.publicKey);
    expect(sa.hsmSignature.signer).toBe(sb.hsmSignature.signer);
  });

  it('PDF reports the correct gameId via embedded keywords metadata', async () => {
    const { submissionId } = await submitAndGet();
    const res = await app.inject({ method: 'GET', url: `/api/cert/${submissionId}/par.pdf` });
    const pdf = await PDFDocument.load(res.rawPayload);
    const keywords = pdf.getKeywords() ?? '';
    expect(keywords).toContain('demo-pdf-game');
    expect(keywords).toContain('MGA');
  });
});
