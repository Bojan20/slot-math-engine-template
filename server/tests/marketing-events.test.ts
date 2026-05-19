/**
 * W215 Faza 800.2 Agent C — marketing events route + store tests.
 *
 * Covers:
 *   * MarketingEventStore CRUD + funnel + AB aggregation
 *   * isValidEventType / wilsonInterval
 *   * POST /api/marketing/event happy path
 *   * Schema validation rejections (type, sessionId, batch size)
 *   * DNT header silent-drop returns 204
 *   * Rate-limit returns 429 after 100/min
 *   * GET /api/marketing/analytics/funnel requires admin
 *   * GET /api/marketing/analytics/ab/:experimentId returns variant rows
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { RateLimiter } from '../state/marketing-leads.js';
import {
  MarketingEventStore,
  isValidEventType,
  wilsonInterval,
} from '../state/marketing-events.js';
import {
  registerMarketingEventRoutes,
  validateBatch,
} from '../routes/marketing-events.js';

async function buildApp(opts: { isAdmin?: boolean; limiter?: RateLimiter } = {}): Promise<{
  app: FastifyInstance;
  store: MarketingEventStore;
}> {
  const app = Fastify({ logger: false });
  const store = new MarketingEventStore();
  await registerMarketingEventRoutes(app, {
    store,
    limiter: opts.limiter ?? new RateLimiter(100, 60 * 1000),
    isAdmin: opts.isAdmin === false ? () => false : () => true,
  });
  return { app, store };
}

describe('isValidEventType', () => {
  it('accepts known types', () => {
    expect(isValidEventType('pageview')).toBe(true);
    expect(isValidEventType('scroll-depth-50')).toBe(true);
    expect(isValidEventType('cta-click')).toBe(true);
    expect(isValidEventType('signup')).toBe(true);
  });
  it('rejects unknown types', () => {
    expect(isValidEventType('mystery')).toBe(false);
  });
});

describe('wilsonInterval', () => {
  it('returns [0, 1] when n = 0', () => {
    const ci = wilsonInterval(0, 0);
    expect(ci.lo).toBe(0);
    expect(ci.hi).toBe(1);
  });
  it('encloses the empirical rate', () => {
    const ci = wilsonInterval(50, 100);
    expect(ci.lo).toBeLessThan(0.5);
    expect(ci.hi).toBeGreaterThan(0.5);
  });
});

describe('MarketingEventStore', () => {
  it('adds + lists', () => {
    const s = new MarketingEventStore();
    s.add({ type: 'pageview', sessionId: 'sid-1', page: '/' });
    s.add({ type: 'cta-click', sessionId: 'sid-1', destination: '/contact' });
    expect(s.count()).toBe(2);
    expect(s.list({ type: 'pageview' })).toHaveLength(1);
  });
  it('rejects invalid event type', () => {
    const s = new MarketingEventStore();
    expect(() => s.add({ type: 'wat' as never, sessionId: 'sid-1' })).toThrow();
  });
  it('rejects missing sessionId', () => {
    const s = new MarketingEventStore();
    expect(() => s.add({ type: 'pageview', sessionId: '' })).toThrow();
  });
  it('addBatch returns all records', () => {
    const s = new MarketingEventStore();
    const out = s.addBatch([
      { type: 'pageview', sessionId: 'a' },
      { type: 'pageview', sessionId: 'b' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].eventId).not.toBe(out[1].eventId);
  });
  it('funnel counts unique sessions per stage', () => {
    const s = new MarketingEventStore();
    // Two sessions hit landing, one continues to demo, none to signup.
    s.add({ type: 'pageview', sessionId: 'a', page: '/' });
    s.add({ type: 'pageview', sessionId: 'b', page: '/' });
    s.add({ type: 'pageview', sessionId: 'a', page: '/pages/demo.html' });
    s.add({ type: 'form-submit', sessionId: 'a', formId: 'signup-form' });
    const f = s.funnel(30);
    expect(f.funnel.landing).toBe(2);
    expect(f.funnel.demo).toBe(1);
    expect(f.funnel.signup).toBe(1);
  });
  it('abAggregate returns Wilson intervals', () => {
    const s = new MarketingEventStore();
    for (let i = 0; i < 200; i++) {
      s.add({ type: 'ab-impression', sessionId: 's' + i, experimentId: 'x', variant: 'A' });
    }
    for (let i = 0; i < 50; i++) {
      s.add({ type: 'ab-conversion', sessionId: 's' + i, experimentId: 'x', variant: 'A' });
    }
    const rows = s.abAggregate('x', 30);
    expect(rows).toHaveLength(1);
    expect(rows[0].variant).toBe('A');
    expect(rows[0].impressions).toBe(200);
    expect(rows[0].conversions).toBe(50);
    expect(rows[0].ciLo).toBeLessThan(0.25);
    expect(rows[0].ciHi).toBeGreaterThan(0.25);
  });
  it('pageviewBreakdown sorts by views desc', () => {
    const s = new MarketingEventStore();
    s.add({ type: 'pageview', sessionId: 'a', page: '/a' });
    s.add({ type: 'pageview', sessionId: 'a', page: '/b' });
    s.add({ type: 'pageview', sessionId: 'c', page: '/b' });
    const rows = s.pageviewBreakdown(30);
    expect(rows[0].page).toBe('/b');
    expect(rows[0].views).toBe(2);
    expect(rows[0].uniques).toBe(2);
  });
});

describe('validateBatch', () => {
  it('happy path', () => {
    const v = validateBatch({
      sessionId: 'sid-12345678',
      events: [{ type: 'pageview', page: '/' }],
    });
    expect(v.ok).toBe(true);
  });
  it('rejects empty events array', () => {
    const v = validateBatch({ events: [] });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('events_required');
  });
  it('rejects batch too large', () => {
    const v = validateBatch({
      sessionId: 'sid-12345678',
      events: new Array(30).fill({ type: 'pageview' }),
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('batch_too_large');
  });
  it('rejects bad sessionId', () => {
    const v = validateBatch({
      sessionId: 'short',
      events: [{ type: 'pageview' }],
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('invalid_session_id');
  });
  it('rejects unknown type', () => {
    const v = validateBatch({
      sessionId: 'sid-12345678',
      events: [{ type: 'unknown' }],
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('invalid_event_type');
  });
});

describe('POST /api/marketing/event', () => {
  let env: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => { env = await buildApp(); });
  afterEach(async () => { await env.app.close(); });

  it('201 on a valid single-event batch', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/marketing/event',
      payload: {
        sessionId: 'sid-12345678',
        events: [{ type: 'pageview', page: '/' }],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().accepted).toBe(1);
    expect(env.store.count()).toBe(1);
  });

  it('400 on invalid type', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/marketing/event',
      payload: {
        sessionId: 'sid-12345678',
        events: [{ type: 'wat' }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('204 silent drop on DNT header', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/marketing/event',
      headers: { dnt: '1' },
      payload: {
        sessionId: 'sid-12345678',
        events: [{ type: 'pageview' }],
      },
    });
    expect(res.statusCode).toBe(204);
    expect(env.store.count()).toBe(0);
  });

  it('429 once rate limit is hit', async () => {
    const limiter = new RateLimiter(2, 60_000);
    await env.app.close();
    env = await buildApp({ limiter });
    const payload = { sessionId: 'sid-12345678', events: [{ type: 'pageview' }] };
    for (let i = 0; i < 2; i++) {
      const ok = await env.app.inject({ method: 'POST', url: '/api/marketing/event', payload });
      expect(ok.statusCode).toBe(201);
    }
    const deny = await env.app.inject({ method: 'POST', url: '/api/marketing/event', payload });
    expect(deny.statusCode).toBe(429);
  });
});

describe('GET /api/marketing/analytics/funnel', () => {
  let env: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => { env = await buildApp(); });
  afterEach(async () => { await env.app.close(); });

  it('returns funnel JSON for admin', async () => {
    env.store.add({ type: 'pageview', sessionId: 'a', page: '/' });
    env.store.add({ type: 'pageview', sessionId: 'a', page: '/pages/demo.html' });
    env.store.add({ type: 'signup',  sessionId: 'a' });
    const res = await env.app.inject({ method: 'GET', url: '/api/marketing/analytics/funnel' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.funnel.landing).toBe(1);
    expect(body.funnel.demo).toBe(1);
    expect(body.funnel.signup).toBe(1);
    expect(body.windowDays).toBe(30);
  });
  it('403 without admin auth', async () => {
    await env.app.close();
    env = await buildApp({ isAdmin: false });
    const res = await env.app.inject({ method: 'GET', url: '/api/marketing/analytics/funnel' });
    expect(res.statusCode).toBe(403);
  });
  it('window query is honoured', async () => {
    const res = await env.app.inject({ method: 'GET', url: '/api/marketing/analytics/funnel?window=7' });
    expect(res.json().windowDays).toBe(7);
  });
});

describe('GET /api/marketing/analytics/ab/:experimentId', () => {
  let env: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => { env = await buildApp(); });
  afterEach(async () => { await env.app.close(); });
  it('returns variant rows for admin', async () => {
    env.store.add({ type: 'ab-impression', sessionId: 'a', experimentId: 'hero_headline_v2', variant: 'A' });
    env.store.add({ type: 'ab-conversion', sessionId: 'a', experimentId: 'hero_headline_v2', variant: 'A' });
    const res = await env.app.inject({ method: 'GET', url: '/api/marketing/analytics/ab/hero_headline_v2' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.experimentId).toBe('hero_headline_v2');
    expect(body.rows[0].variant).toBe('A');
    expect(body.rows[0].impressions).toBe(1);
    expect(body.rows[0].conversions).toBe(1);
  });
  it('403 without admin auth', async () => {
    await env.app.close();
    env = await buildApp({ isAdmin: false });
    const res = await env.app.inject({ method: 'GET', url: '/api/marketing/analytics/ab/foo' });
    expect(res.statusCode).toBe(403);
  });
});
