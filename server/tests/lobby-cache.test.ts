/**
 * W208 Faza 400.1 — lobby endpoint cache behaviour.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('Lobby cache', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('first request is MISS, repeat is HIT', async () => {
    const r1 = await app.inject({ method: 'GET', url: '/api/lobby/games' });
    expect(r1.statusCode).toBe(200);
    expect(r1.headers['x-cache']).toBe('MISS');

    const r2 = await app.inject({ method: 'GET', url: '/api/lobby/games' });
    expect(r2.statusCode).toBe(200);
    expect(r2.headers['x-cache']).toBe('HIT');
    expect(r2.json().count).toBe(r1.json().count);
  });

  it('different filter combos produce different cache keys', async () => {
    const a = await app.inject({ method: 'GET', url: '/api/lobby/games?jurisdiction=UKGC' });
    const b = await app.inject({ method: 'GET', url: '/api/lobby/games?jurisdiction=MGA' });
    expect(a.headers['x-cache']).toBe('MISS');
    expect(b.headers['x-cache']).toBe('MISS');
    // Second hit on each key should be cached.
    const a2 = await app.inject({ method: 'GET', url: '/api/lobby/games?jurisdiction=UKGC' });
    expect(a2.headers['x-cache']).toBe('HIT');
  });

  it('invalidation endpoint drops cached entries', async () => {
    await app.inject({ method: 'GET', url: '/api/lobby/games' });
    const hit1 = await app.inject({ method: 'GET', url: '/api/lobby/games' });
    expect(hit1.headers['x-cache']).toBe('HIT');

    const inv = await app.inject({ method: 'POST', url: '/api/lobby/_invalidate' });
    expect(inv.statusCode).toBe(200);
    expect(inv.json().ok).toBe(true);

    const miss2 = await app.inject({ method: 'GET', url: '/api/lobby/games' });
    expect(miss2.headers['x-cache']).toBe('MISS');
  });

  it('catalog endpoint is cached', async () => {
    const r1 = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(r1.statusCode).toBe(200);
    expect(r1.headers['x-cache']).toBe('MISS');
    const r2 = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(r2.headers['x-cache']).toBe('HIT');
  });

  it('admin latency-budgets endpoint reports route stats', async () => {
    await app.inject({ method: 'GET', url: '/api/lobby/games' });
    const r = await app.inject({ method: 'GET', url: '/api/admin/latency-budgets' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(Array.isArray(body.routes)).toBe(true);
    expect(body.routes.length).toBeGreaterThan(0);
  });
});
