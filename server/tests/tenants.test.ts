import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import { TenantStore } from '../state/tenants.js';

describe('TenantStore (unit)', () => {
  it('seeds a default tenant when no persist file is set', () => {
    const s = new TenantStore();
    expect(s.size()).toBeGreaterThan(0);
    expect(s.get('default')).not.toBeNull();
  });

  it('rejects invalid ids', () => {
    const s = new TenantStore();
    expect(() =>
      s.create({ id: 'NOT_VALID', name: 'x', contactEmail: 'a@b.co' })
    ).toThrow();
  });

  it('rejects invalid contact email', () => {
    const s = new TenantStore();
    expect(() =>
      s.create({ id: 'acme', name: 'Acme', contactEmail: 'not-an-email' })
    ).toThrow();
  });

  it('rejects non-positive rate limit', () => {
    const s = new TenantStore();
    expect(() =>
      s.create({
        id: 'acme',
        name: 'Acme',
        contactEmail: 'a@b.co',
        rateLimits: { requestsPerMinute: 0 },
      })
    ).toThrow();
  });

  it('create/get/list/delete cycle', () => {
    const s = new TenantStore();
    const t = s.create({
      id: 'acme',
      name: 'Acme Corp',
      contactEmail: 'ops@acme.io',
      allowedJurisdictions: ['UKGC'],
    });
    expect(t.id).toBe('acme');
    expect(s.get('acme')).toEqual(t);
    expect(s.list().map((x) => x.id)).toContain('acme');
    expect(s.delete('acme')).toBe(true);
    expect(s.get('acme')).toBeNull();
    expect(s.delete('acme')).toBe(false);
  });

  it('update applies partial patch + bumps updatedAt', async () => {
    const s = new TenantStore();
    const t = s.create({ id: 'acme', name: 'Acme', contactEmail: 'ops@acme.io' });
    await new Promise((r) => setTimeout(r, 5));
    const patched = s.update('acme', { name: 'Acme 2', rateLimits: { requestsPerMinute: 100 } });
    expect(patched.name).toBe('Acme 2');
    expect(patched.rateLimits.requestsPerMinute).toBe(100);
    expect(patched.updatedAt >= t.updatedAt).toBe(true);
  });

  it('rate budget allows up to the cap and then rejects', () => {
    const s = new TenantStore();
    s.create({
      id: 'acme',
      name: 'Acme',
      contactEmail: 'ops@acme.io',
      rateLimits: { requestsPerMinute: 3 },
    });
    const fixedNow = 1000;
    expect(s.consumeRateBudget('acme', fixedNow)).toEqual({ ok: true });
    expect(s.consumeRateBudget('acme', fixedNow)).toEqual({ ok: true });
    expect(s.consumeRateBudget('acme', fixedNow)).toEqual({ ok: true });
    const denied = s.consumeRateBudget('acme', fixedNow);
    expect(denied.ok).toBe(false);
    // After 60s rolls over, the budget resets.
    expect(s.consumeRateBudget('acme', fixedNow + 61_000)).toEqual({ ok: true });
  });

  it('persists to disk and reloads on construction', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sme-tenant-persist-'));
    const file = join(dir, 'tenants.json');
    const s1 = new TenantStore({ persistPath: file });
    s1.create({ id: 'cust1', name: 'Cust 1', contactEmail: 'c1@x.io' });
    expect(existsSync(file)).toBe(true);
    const s2 = new TenantStore({ persistPath: file });
    expect(s2.get('cust1')?.name).toBe('Cust 1');
  });
});

describe('Admin API (HTTP)', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildTestApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('GET /api/admin/tenants lists default tenant', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/tenants' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.tenants)).toBe(true);
    expect(body.tenants.find((t: { id: string }) => t.id === 'default')).toBeDefined();
  });

  it('POST + GET round-trips a tenant', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      payload: {
        id: 'acme',
        name: 'Acme',
        contactEmail: 'ops@acme.io',
        allowedJurisdictions: ['UKGC', 'MGA'],
      },
    });
    expect(create.statusCode).toBe(201);
    const get = await app.inject({ method: 'GET', url: '/api/admin/tenants/acme' });
    expect(get.statusCode).toBe(200);
    expect(get.json().tenant.name).toBe('Acme');
  });

  it('POST rejects missing fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      payload: { id: 'acme' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH updates fields', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      payload: { id: 'acme', name: 'Acme', contactEmail: 'ops@acme.io' },
    });
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/admin/tenants/acme',
      payload: { name: 'Acme 2' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().tenant.name).toBe('Acme 2');
  });

  it('DELETE removes the tenant', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      payload: { id: 'acme', name: 'Acme', contactEmail: 'ops@acme.io' },
    });
    const del = await app.inject({ method: 'DELETE', url: '/api/admin/tenants/acme' });
    expect(del.statusCode).toBe(204);
    const get = await app.inject({ method: 'GET', url: '/api/admin/tenants/acme' });
    expect(get.statusCode).toBe(404);
  });

  it('GET non-existent returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/tenants/missing' });
    expect(res.statusCode).toBe(404);
  });

  it('Health endpoint reports tenant count', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.tenants).toBe('number');
    expect(body.components.tenants.ok).toBe(true);
  });

  it('metrics endpoint emits Prometheus text', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.body).toContain('sme_uptime_seconds');
    expect(res.body).toContain('sme_tenants_total');
  });

  it('unknown X-Tenant-Id is rejected with 400 on data-plane routes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/lobby/games',
      headers: { 'x-tenant-id': 'no-such-tenant' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('unknown_tenant');
  });
});
