/**
 * CORTI W208-MULTI-TENANT — token bucket rate limiter tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  consume,
  refill,
  rateLimit,
  InMemoryRateLimitStore,
  RedisRateLimitStore,
  REST_DEFAULTS,
  GAAS_SPIN_DEFAULTS,
  AUTH_DEFAULTS,
  rateLimitMetrics,
  resetInMemoryBuckets,
} from '../lib/rate-limit.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

function fakeReply(): FastifyReply & { sent: { code: number; body?: unknown } } {
  const headers: Record<string, string> = {};
  const state = { sent: { code: 200 as number, body: undefined as unknown } };
  const r = {
    header(k: string, v: string) {
      headers[k.toLowerCase()] = v;
      return r;
    },
    code(c: number) {
      state.sent.code = c;
      return r;
    },
    send(payload: unknown) {
      state.sent.body = payload;
      return r;
    },
    getHeader(k: string) {
      return headers[k.toLowerCase()];
    },
  } as unknown as FastifyReply & { sent: { code: number; body?: unknown } };
  (r as { sent: typeof state.sent }).sent = state.sent;
  return r as FastifyReply & { sent: typeof state.sent };
}

function fakeReq(tenantId?: string, ip = '127.0.0.1'): FastifyRequest {
  return { tenantId, ip, url: '/api/x' } as unknown as FastifyRequest;
}

describe('rate-limit: refill math', () => {
  it('refills tokens proportional to elapsed time', () => {
    const next = refill(
      { tokens: 0, lastRefillMs: 0 },
      { tokens: 100, refillPerSec: 10 },
      1000
    );
    expect(next.tokens).toBe(10);
  });

  it('clamps to bucket capacity', () => {
    const next = refill(
      { tokens: 50, lastRefillMs: 0 },
      { tokens: 100, refillPerSec: 100 },
      60_000
    );
    expect(next.tokens).toBe(100);
  });

  it('does not run backwards when nowMs is past', () => {
    const next = refill(
      { tokens: 5, lastRefillMs: 1000 },
      { tokens: 100, refillPerSec: 10 },
      500
    );
    expect(next.tokens).toBe(5);
  });
});

describe('rate-limit: token bucket consume', () => {
  let store: InMemoryRateLimitStore;
  beforeEach(() => {
    store = new InMemoryRateLimitStore();
    rateLimitMetrics.reset();
  });

  it('allows within budget', async () => {
    for (let i = 0; i < 5; i++) {
      const d = await consume(
        store,
        'k',
        { tokens: 10, refillPerSec: 1, routeKey: 'rest' },
        1000
      );
      expect(d.allowed).toBe(true);
    }
  });

  it('rejects with Retry-After when over budget', async () => {
    const cfg = { tokens: 2, refillPerSec: 1, routeKey: 'rest' };
    await consume(store, 'k', cfg, 1000);
    await consume(store, 'k', cfg, 1000);
    const denied = await consume(store, 'k', cfg, 1000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(rateLimitMetrics.breaches).toBe(1);
    expect(rateLimitMetrics.byRoute.rest).toBe(1);
  });

  it('refills after waiting', async () => {
    const cfg = { tokens: 2, refillPerSec: 1, routeKey: 'rest' };
    await consume(store, 'k', cfg, 1000);
    await consume(store, 'k', cfg, 1000);
    expect((await consume(store, 'k', cfg, 1000)).allowed).toBe(false);
    // After 3 seconds, refill should be > 1 token.
    const ok = await consume(store, 'k', cfg, 4000);
    expect(ok.allowed).toBe(true);
  });

  it('isolates buckets per key (tenant A vs tenant B)', async () => {
    const cfg = { tokens: 1, refillPerSec: 1, routeKey: 'rest' };
    expect((await consume(store, 'a', cfg, 1000)).allowed).toBe(true);
    expect((await consume(store, 'a', cfg, 1000)).allowed).toBe(false);
    // Tenant B has its own bucket — still full.
    expect((await consume(store, 'b', cfg, 1000)).allowed).toBe(true);
  });

  it('survives concurrent serial drains', async () => {
    const cfg = { tokens: 10, refillPerSec: 1, routeKey: 'rest' };
    const decisions = await Promise.all(
      Array.from({ length: 12 }, () => consume(store, 'k', cfg, 1000))
    );
    const allowed = decisions.filter((d) => d.allowed).length;
    expect(allowed).toBeGreaterThanOrEqual(10);
    expect(allowed).toBeLessThanOrEqual(12);
  });
});

describe('rate-limit: Fastify factory', () => {
  beforeEach(() => {
    rateLimitMetrics.reset();
    resetInMemoryBuckets();
  });

  it('passes through when budget available + sets remaining header', async () => {
    const store = new InMemoryRateLimitStore();
    const mw = rateLimit({
      ...REST_DEFAULTS,
      store,
      now: () => 1000,
    });
    const req = fakeReq('acme');
    const reply = fakeReply();
    await mw(req, reply);
    expect(reply.sent.code).toBe(200); // unchanged
    expect((reply as unknown as { getHeader(k: string): string }).getHeader('X-RateLimit-Remaining')).toBeDefined();
  });

  it('returns 429 with payload + Retry-After when budget exhausted', async () => {
    const store = new InMemoryRateLimitStore();
    const mw = rateLimit({
      tokens: 1,
      refillPerSec: 1,
      routeKey: 'rest',
      store,
      now: () => 1000,
    });
    const req = fakeReq('acme');
    await mw(req, fakeReply()); // consume the 1 token
    const reply2 = fakeReply();
    await mw(req, reply2);
    expect(reply2.sent.code).toBe(429);
    expect((reply2.sent.body as { error: string }).error).toBe('rate_limit_exceeded');
    expect(
      (reply2 as unknown as { getHeader(k: string): string }).getHeader('Retry-After')
    ).toBeDefined();
  });

  it('IP scoping (tenant+ip) gives separate buckets per IP', async () => {
    const store = new InMemoryRateLimitStore();
    const mw = rateLimit({
      tokens: 1,
      refillPerSec: 1,
      scope: 'tenant+ip',
      routeKey: 'auth',
      store,
      now: () => 1000,
    });
    // IP 1 consumes its single token.
    await mw(fakeReq('acme', '1.1.1.1'), fakeReply());
    const r1 = fakeReply();
    await mw(fakeReq('acme', '1.1.1.1'), r1);
    expect(r1.sent.code).toBe(429);
    // IP 2 still has its own token.
    const r2 = fakeReply();
    await mw(fakeReq('acme', '2.2.2.2'), r2);
    expect(r2.sent.code).toBe(200);
  });

  it('default configs are sensible', () => {
    expect(REST_DEFAULTS.tokens).toBe(200);
    expect(REST_DEFAULTS.refillPerSec).toBe(100);
    expect(GAAS_SPIN_DEFAULTS.refillPerSec).toBe(50);
    expect(AUTH_DEFAULTS.scope).toBe('tenant+ip');
  });

  it('exposes a breach counter for /api/admin/metrics', async () => {
    const store = new InMemoryRateLimitStore();
    const mw = rateLimit({
      tokens: 0,
      refillPerSec: 0.001, // effectively zero
      routeKey: 'gaas_spin',
      store,
      now: () => 1000,
    });
    await mw(fakeReq('acme'), fakeReply());
    expect(rateLimitMetrics.breaches).toBeGreaterThanOrEqual(1);
    expect(rateLimitMetrics.byRoute.gaas_spin).toBeGreaterThanOrEqual(1);
  });
});

describe('rate-limit: Redis adapter', () => {
  it('round-trips a bucket through a fake Redis client', async () => {
    const map = new Map<string, string>();
    const client = {
      async get(k: string) {
        return map.get(k) ?? null;
      },
      async set(k: string, v: string) {
        map.set(k, v);
        return 'OK';
      },
      async del(k: string) {
        map.delete(k);
        return 1;
      },
    };
    const store = new RedisRateLimitStore(client);
    await store.save('k', { tokens: 5, lastRefillMs: 1000 });
    const back = await store.load('k');
    expect(back?.tokens).toBe(5);
    expect(back?.lastRefillMs).toBe(1000);
  });

  it('falls back to in-memory when client is absent', async () => {
    // No globalThis.__sme_redis → pickStore() picks the in-memory store.
    const mw = rateLimit({
      tokens: 1,
      refillPerSec: 1,
      routeKey: 'rest',
      now: () => 5_000_000,
    });
    const reply = fakeReply();
    await mw(fakeReq('rfb'), reply);
    expect(reply.sent.code).toBe(200);
  });
});
