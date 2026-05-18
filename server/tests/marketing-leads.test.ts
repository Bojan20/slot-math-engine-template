/**
 * W214 Faza 800.1 Agent C — marketing leads route + store tests.
 *
 * Covers:
 *   * In-memory store CRUD + email index
 *   * RateLimiter sliding window
 *   * detectOperatorTier + routeToSalesRep
 *   * POST /api/marketing/lead happy path
 *   * Validation rejections (name / email / company / role / message)
 *   * Honeypot silent drop returns 202
 *   * Rate limit returns 429 after 5 attempts/hour
 *   * Admin endpoints require auth
 *   * markSent flips tarball_sent_at
 *   * list filters by email / tier / sent
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  MarketingLeadStore,
  RateLimiter,
  detectOperatorTier,
  routeToSalesRep,
} from '../state/marketing-leads.js';
import {
  registerMarketingLeadRoutes,
  validateLead,
} from '../routes/marketing-leads.js';

async function buildApp(opts: {
  isAdmin?: boolean;
  limiter?: RateLimiter;
} = {}): Promise<{
  app: FastifyInstance;
  store: MarketingLeadStore;
}> {
  const app = Fastify({ logger: false });
  const store = new MarketingLeadStore();
  await registerMarketingLeadRoutes(app, {
    store,
    limiter: opts.limiter ?? new RateLimiter(5, 60 * 60 * 1000),
    isAdmin: opts.isAdmin === false ? () => false : () => true,
  });
  return { app, store };
}

describe('MarketingLeadStore', () => {
  it('creates a record + indexes by email', () => {
    const s = new MarketingLeadStore();
    const r = s.create({
      name: 'Boki',
      email: 'Boki@Example.com',
      company: 'Acme',
      role: 'CTO',
      message: 'hi',
      remoteIp: '1.2.3.4',
    });
    expect(r.leadId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(r.email).toBe('boki@example.com');
    expect(s.get(r.leadId)?.email).toBe('boki@example.com');
    expect(s.getByEmail('boki@example.com')?.leadId).toBe(r.leadId);
  });

  it('rejects missing fields with RangeError', () => {
    const s = new MarketingLeadStore();
    expect(() => s.create({ name: '', email: 'a@b.com', company: 'X', role: 'CTO' })).toThrow();
    expect(() => s.create({ name: 'X', email: '', company: 'X', role: 'CTO' })).toThrow();
    expect(() => s.create({ name: 'X', email: 'a@b.com', company: '', role: 'CTO' })).toThrow();
  });

  it('markSent flips tarball_sent_at', () => {
    const s = new MarketingLeadStore();
    const r = s.create({ name: 'B', email: 'b@x.com', company: 'X', role: 'CTO' });
    expect(r.tarballSentAt).toBe(null);
    const updated = s.markSent(r.leadId);
    expect(updated?.tarballSentAt).toMatch(/T/);
  });

  it('list filters by email / tier / sent', () => {
    const s = new MarketingLeadStore();
    s.create({ name: 'A', email: 'a@flutter.com', company: 'Flutter', role: 'CTO' });
    s.create({ name: 'B', email: 'b@indie.io', company: 'IndieCo', role: 'CFO' });
    const tier1 = s.list({ operatorTier: 'tier1' });
    expect(tier1.length).toBe(1);
    expect(tier1[0].company).toBe('Flutter');
    expect(s.list({ sent: false }).length).toBe(2);
  });
});

describe('detectOperatorTier + routeToSalesRep', () => {
  it('tier1 routes to enterprise-sales', () => {
    expect(detectOperatorTier('a@flutter.com')).toBe('tier1');
    expect(routeToSalesRep('tier1')).toBe('enterprise-sales');
  });
  it('tier2 routes to platform-sales', () => {
    expect(detectOperatorTier('a@betsson.com')).toBe('tier2');
    expect(routeToSalesRep('tier2')).toBe('platform-sales');
  });
  it('tier3 (commercial tld) routes to indie-sales', () => {
    expect(detectOperatorTier('a@random.com')).toBe('tier3');
    expect(routeToSalesRep('tier3')).toBe('indie-sales');
  });
  it('unknown tld routes to inbound-queue', () => {
    expect(detectOperatorTier('a@x.invalid')).toBe('unknown');
    expect(routeToSalesRep('unknown')).toBe('inbound-queue');
  });
});

describe('RateLimiter', () => {
  it('allows up to N then denies', () => {
    const r = new RateLimiter(3, 60_000);
    expect(r.allow('ip')).toBe(true);
    expect(r.allow('ip')).toBe(true);
    expect(r.allow('ip')).toBe(true);
    expect(r.allow('ip')).toBe(false);
    expect(r.remaining('ip')).toBe(0);
  });
  it('decays old hits outside the window', () => {
    const r = new RateLimiter(2, 100);
    const t0 = 1_000_000;
    expect(r.allow('ip', t0)).toBe(true);
    expect(r.allow('ip', t0)).toBe(true);
    expect(r.allow('ip', t0)).toBe(false);
    expect(r.allow('ip', t0 + 200)).toBe(true);
  });
});

describe('validateLead', () => {
  it('happy path', () => {
    const v = validateLead({
      name: 'Boki',
      email: 'boki@example.com',
      company: 'Acme',
      role: 'CTO',
      message: 'hi',
    });
    expect(v.ok).toBe(true);
  });
  it('honeypot detected', () => {
    const v = validateLead({
      name: 'Boki',
      email: 'boki@example.com',
      company: 'Acme',
      role: 'CTO',
      company_website: 'http://spam',
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('honeypot');
  });
  it('rejects unknown role', () => {
    const v = validateLead({
      name: 'X', email: 'a@b.com', company: 'Y', role: 'EvilLord' as never,
    });
    expect(v.ok).toBe(false);
  });
});

describe('POST /api/marketing/lead', () => {
  let env: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => { env = await buildApp(); });
  afterEach(async () => { await env.app.close(); });

  const payload = (over: Record<string, unknown> = {}) => ({
    name: 'Boki', email: 'boki@example.com', company: 'Acme',
    role: 'CTO', message: 'hi', ...over,
  });

  it('201 on valid submission', async () => {
    const res = await env.app.inject({
      method: 'POST', url: '/api/marketing/lead', payload: payload(),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.leadId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.operatorTier).toBe('tier3');
    expect(body.routedTo).toBe('indie-sales');
  });

  it('400 on invalid email', async () => {
    const res = await env.app.inject({
      method: 'POST', url: '/api/marketing/lead',
      payload: payload({ email: 'not-an-email' }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().reason).toBe('invalid_email');
  });

  it('400 on short company', async () => {
    const res = await env.app.inject({
      method: 'POST', url: '/api/marketing/lead',
      payload: payload({ company: 'X' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('400 on invalid role', async () => {
    const res = await env.app.inject({
      method: 'POST', url: '/api/marketing/lead',
      payload: payload({ role: 'EvilLord' }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().reason).toBe('invalid_role');
  });

  it('202 on honeypot (silent drop, no record created)', async () => {
    const res = await env.app.inject({
      method: 'POST', url: '/api/marketing/lead',
      payload: payload({ company_website: 'http://spam' }),
    });
    expect(res.statusCode).toBe(202);
    expect(env.store.count()).toBe(0);
  });

  it('detects Tier-1 operator from flutter.com', async () => {
    const res = await env.app.inject({
      method: 'POST', url: '/api/marketing/lead',
      payload: payload({ email: 'a@flutter.com' }),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().operatorTier).toBe('tier1');
    expect(res.json().routedTo).toBe('enterprise-sales');
  });

  it('429 after 5 attempts within window', async () => {
    const limiter = new RateLimiter(2, 60 * 60 * 1000);
    const tight = await buildApp({ limiter });
    const r1 = await tight.app.inject({ method: 'POST', url: '/api/marketing/lead', payload: payload() });
    const r2 = await tight.app.inject({ method: 'POST', url: '/api/marketing/lead', payload: payload({ email: 'b@x.com' }) });
    const r3 = await tight.app.inject({ method: 'POST', url: '/api/marketing/lead', payload: payload({ email: 'c@x.com' }) });
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    expect(r3.statusCode).toBe(429);
    await tight.app.close();
  });
});

describe('admin endpoints', () => {
  it('403 without admin auth', async () => {
    const env = await buildApp({ isAdmin: false });
    const res = await env.app.inject({
      method: 'GET', url: '/api/marketing/lead/some-id',
    });
    expect(res.statusCode).toBe(403);
    await env.app.close();
  });
  it('200 with admin: get-by-id', async () => {
    const env = await buildApp();
    const created = env.store.create({
      name: 'X', email: 'x@y.com', company: 'Y', role: 'CTO',
    });
    const res = await env.app.inject({
      method: 'GET', url: `/api/marketing/lead/${created.leadId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().leadId).toBe(created.leadId);
    await env.app.close();
  });
  it('mark sent flips tarball_sent_at', async () => {
    const env = await buildApp();
    const created = env.store.create({
      name: 'X', email: 'x@y.com', company: 'Y', role: 'CTO',
    });
    const res = await env.app.inject({
      method: 'POST', url: `/api/marketing/lead/${created.leadId}/sent`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tarballSentAt).toMatch(/T/);
    await env.app.close();
  });
  it('list returns all rows', async () => {
    const env = await buildApp();
    env.store.create({ name: 'A', email: 'a@a.com', company: 'A', role: 'CTO' });
    env.store.create({ name: 'B', email: 'b@b.com', company: 'B', role: 'CFO' });
    const res = await env.app.inject({
      method: 'GET', url: '/api/marketing/leads',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().count).toBe(2);
    await env.app.close();
  });
});
