/**
 * CORTI W206-SECURITY — security headers test suite (OWASP A05).
 *
 * Verifies @fastify/helmet attaches the expected headers on every
 * response: CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
 * Referrer-Policy, Permissions-Policy / Cross-Origin-Resource-Policy.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';

describe('Security headers (Helmet)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('attaches a Content-Security-Policy header', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(String(csp)).toContain("default-src 'self'");
  });

  it('CSP forbids objects and locks form-action to self', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it('attaches Strict-Transport-Security (HSTS) with 1y max-age + preload', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    const hsts = String(res.headers['strict-transport-security']);
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).toContain('preload');
  });

  it('attaches X-Frame-Options: SAMEORIGIN (GaaS iframe friendly)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(String(res.headers['x-frame-options']).toUpperCase()).toBe('SAMEORIGIN');
  });

  it('attaches X-Content-Type-Options: nosniff', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('attaches Referrer-Policy: strict-origin-when-cross-origin', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('removes the X-Powered-By header (default Helmet behavior)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('attaches headers across multiple endpoints (admin + lobby)', async () => {
    const r1 = await app.inject({ method: 'GET', url: '/api/admin/tenants' });
    const r2 = await app.inject({ method: 'GET', url: '/api/lobby/games' });
    for (const r of [r1, r2]) {
      expect(r.headers['content-security-policy']).toBeDefined();
      expect(r.headers['strict-transport-security']).toBeDefined();
      expect(r.headers['x-content-type-options']).toBe('nosniff');
    }
  });

  it('Cross-Origin-Resource-Policy is set to same-site', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
  });
});
