import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';

const SAMPLE_IR = {
  game: { id: 'demo', topology: 'rectangular' },
  reels: [{ stops: 30, symbols: ['A', 'B', 'C'] }],
  paytable: { A: 5 },
};

describe('Cert API', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildTestApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('submit returns submissionId + status', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cert/submit',
      payload: { ir: SAMPLE_IR, jurisdiction: 'UKGC' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.submissionId).toMatch(/^cert-/);
    expect(body.status).toBe('completed');
    expect(body.irSha256).toHaveLength(64);
  });

  it('submit rejects when ir missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cert/submit',
      payload: { jurisdiction: 'UKGC' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('submit rejects when jurisdiction missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cert/submit',
      payload: { ir: SAMPLE_IR },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET status returns par + operator package metadata', async () => {
    const submit = await app.inject({
      method: 'POST',
      url: '/api/cert/submit',
      payload: { ir: SAMPLE_IR, jurisdiction: 'MGA' },
    });
    const { submissionId } = submit.json();
    const res = await app.inject({
      method: 'GET',
      url: `/api/cert/${submissionId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.parSheet).toBeDefined();
    expect(body.parSheet.sections).toBe(12);
    expect(body.operatorPackage).toBeDefined();
    expect(body.operatorPackage.downloadUrl).toContain(submissionId);
  });

  it('GET status returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/cert/cert-bogus',
    });
    expect(res.statusCode).toBe(404);
  });

  it('download returns ZIP bytes', async () => {
    const submit = await app.inject({
      method: 'POST',
      url: '/api/cert/submit',
      payload: { ir: SAMPLE_IR, jurisdiction: 'SE' },
    });
    const { submissionId } = submit.json();
    const res = await app.inject({
      method: 'GET',
      url: `/api/cert/${submissionId}/download`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['x-package-sha256']).toBeDefined();
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });

  it('download returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/cert/cert-bogus/download',
    });
    expect(res.statusCode).toBe(404);
  });

  it('same IR produces same irSha256 (canonical hash)', async () => {
    const s1 = await app.inject({
      method: 'POST',
      url: '/api/cert/submit',
      payload: { ir: SAMPLE_IR, jurisdiction: 'UKGC' },
    });
    const s2 = await app.inject({
      method: 'POST',
      url: '/api/cert/submit',
      payload: { ir: SAMPLE_IR, jurisdiction: 'UKGC' },
    });
    expect(s1.json().irSha256).toBe(s2.json().irSha256);
    expect(s1.json().submissionId).not.toBe(s2.json().submissionId);
  });
});
