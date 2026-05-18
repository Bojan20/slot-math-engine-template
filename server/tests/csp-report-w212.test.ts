/**
 * W212 Faza 600.1 — CSP report endpoint specs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { normaliseCspReport, registerCspReportRoutes } from '../routes/csp-report.js';

describe('W212 csp-report · normaliseCspReport', () => {
  it('parses the legacy { csp-report } wrapper', () => {
    const norm = normaliseCspReport({
      'csp-report': {
        'document-uri': 'https://example.com/x',
        'violated-directive': 'script-src',
        'blocked-uri': 'inline',
      },
    });
    expect(norm?.documentUri).toBe('https://example.com/x');
    expect(norm?.violatedDirective).toBe('script-src');
    expect(norm?.blockedUri).toBe('inline');
  });

  it('parses the Reports API v0 wrapper { body }', () => {
    const norm = normaliseCspReport({
      type: 'csp-violation',
      body: {
        documentURL: 'https://example.com/y',
        effectiveDirective: 'img-src',
        blockedURL: 'https://evil.test/x.png',
      } as Record<string, unknown>,
    });
    expect(norm?.effectiveDirective).toBe('img-src');
  });

  it('returns null on non-object body', () => {
    expect(normaliseCspReport(null)).toBeNull();
    expect(normaliseCspReport(42)).toBeNull();
  });

  it('truncates oversized fields to 2KB +ellipsis', () => {
    const huge = 'a'.repeat(5000);
    const norm = normaliseCspReport({ 'csp-report': { 'document-uri': huge } });
    expect(norm?.documentUri?.length).toBeLessThanOrEqual(2049);
    expect(norm?.documentUri?.endsWith('…')).toBe(true);
  });
});

describe('W212 csp-report · endpoint', () => {
  let app: FastifyInstance;
  let dir: string;
  let storePath: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'w212-csp-'));
    storePath = join(dir, 'csp-violations.json');
    app = Fastify({ logger: false });
    await registerCspReportRoutes(app, { storePath });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns 204 No Content on valid report', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/csp-report',
      payload: { 'csp-report': { 'document-uri': 'https://example.com', 'violated-directive': 'script-src' } },
      headers: { 'content-type': 'application/json' },
    });
    expect(r.statusCode).toBe(204);
  });

  it('persists the violation under storePath', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/csp-report',
      payload: { 'csp-report': { 'document-uri': 'https://a.test', 'violated-directive': 'img-src' } },
      headers: { 'content-type': 'application/json' },
    });
    expect(existsSync(storePath)).toBe(true);
    const arr = JSON.parse(readFileSync(storePath, 'utf8'));
    expect(arr).toHaveLength(1);
    expect(arr[0].violatedDirective).toBe('img-src');
    expect(arr[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('invokes the onViolation callback when supplied', async () => {
    const calls: Array<{ ts: string }> = [];
    const app2 = Fastify({ logger: false });
    await registerCspReportRoutes(app2, {
      storePath: join(dir, 'cb.json'),
      onViolation: (rec) => calls.push(rec),
    });
    await app2.ready();
    await app2.inject({
      method: 'POST',
      url: '/api/csp-report',
      payload: { 'csp-report': { 'document-uri': 'x', 'violated-directive': 'style-src' } },
      headers: { 'content-type': 'application/json' },
    });
    expect(calls).toHaveLength(1);
    await app2.close();
  });

  it('returns 204 on an empty body (no crash)', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/csp-report',
      payload: {},
      headers: { 'content-type': 'application/json' },
    });
    // Empty `{}` is normalised to an empty record; persistence still happens.
    expect(r.statusCode).toBe(204);
  });
});
