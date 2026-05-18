/**
 * W212 Faza 600.1 — security-headers middleware unit + integration specs.
 *
 * Complements the existing `security-headers.test.ts` (Helmet) with
 * coverage for the explicit policy + per-route overrides exposed by
 * `server/lib/security-headers.ts`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  DEFAULT_POLICY,
  auditSecurityHeaders,
  registerSecurityHeaders,
  setRouteSecurityPolicy,
} from '../lib/security-headers.js';

describe('W212 security-headers · policy snapshot', () => {
  it('default HSTS is 1y with includeSubDomains + preload', () => {
    const a = auditSecurityHeaders();
    const hsts = a.find((x) => x.name === 'Strict-Transport-Security');
    expect(hsts?.value).toContain('max-age=31536000');
    expect(hsts?.value).toContain('includeSubDomains');
    expect(hsts?.value).toContain('preload');
    expect(hsts?.verdict).toBe('pass');
  });

  it('flags HSTS warn when max-age too short', () => {
    const a = auditSecurityHeaders({ ...DEFAULT_POLICY, hsts: { maxAgeSec: 60, includeSubDomains: true, preload: false } });
    const hsts = a.find((x) => x.name === 'Strict-Transport-Security');
    expect(hsts?.verdict).toBe('warn');
  });

  it('CSP verdict passes when default-src self', () => {
    const a = auditSecurityHeaders();
    const csp = a.find((x) => x.name === 'Content-Security-Policy');
    expect(csp?.verdict).toBe('pass');
  });

  it('Permissions-Policy locks down camera by default', () => {
    expect(DEFAULT_POLICY.permissionsPolicy).toContain('camera=()');
  });

  it('default CSP includes report-uri', () => {
    expect(DEFAULT_POLICY.csp).toContain('report-uri /api/csp-report');
  });

  it('default frameOptions is SAMEORIGIN (GaaS iframe-friendly)', () => {
    expect(DEFAULT_POLICY.frameOptions).toBe('SAMEORIGIN');
  });
});

describe('W212 security-headers · middleware emission', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = Fastify({ logger: false });
    await registerSecurityHeaders(app, {
      routePrefixOverrides: {
        '/api/docs': { frameOptions: 'DENY' },
      },
    });
    app.get('/api/x', async () => ({ ok: true }));
    app.get('/api/docs/landing', async () => ({ ok: true }));
    app.get('/api/relaxed', async (req) => {
      setRouteSecurityPolicy(req, { csp: "default-src 'self' https://cdn.example.com" });
      return { ok: true };
    });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  it('emits all default headers on a plain GET', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/x' });
    expect(r.headers['strict-transport-security']).toBeDefined();
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(String(r.headers['content-security-policy'])).toContain('object-src');
    expect(r.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(String(r.headers['permissions-policy'])).toContain('camera=()');
  });

  it('prefix override replaces X-Frame-Options on /api/docs/*', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/docs/landing' });
    expect(r.headers['x-frame-options']).toBe('DENY');
  });

  it('per-request override wins over global policy', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/relaxed' });
    expect(String(r.headers['content-security-policy'])).toContain('cdn.example.com');
  });

  it('does not strip helmet-style required headers across calls', async () => {
    const r1 = await app.inject({ method: 'GET', url: '/api/x' });
    const r2 = await app.inject({ method: 'GET', url: '/api/x' });
    expect(r1.headers['strict-transport-security']).toBe(r2.headers['strict-transport-security']);
  });
});
