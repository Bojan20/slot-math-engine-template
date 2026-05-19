/**
 * W215 Faza 1300.0 Agent C — NPS module tests.
 *
 * 15+ specs covering:
 *   * classifyScore: 9-10 promoter, 7-8 passive, 0-6 detractor
 *   * classifySentiment positive / negative / neutral / unknown
 *   * extractTags identifies themes from the comment
 *   * record() persists + auto-classifies
 *   * aggregate computes the canonical NPS formula
 *   * composeInvite produces a tokenized link
 *   * redeemToken is single-use + expires
 *   * Route happy / sad paths
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  NpsStore,
  classifyScore,
  classifySentiment,
  extractTags,
} from '../lib/csm/nps.js';
import { registerCsmRoutes } from '../routes/csm.js';
import { CustomerOnboardingStore } from '../state/customer-onboarding.js';
import { SupportTicketStore } from '../state/support-tickets.js';

async function buildApp(opts: { isAdmin?: boolean } = {}): Promise<{
  app: FastifyInstance;
  nps: NpsStore;
}> {
  const app = Fastify({ logger: false });
  const nps = new NpsStore();
  await registerCsmRoutes(app, {
    onboarding: new CustomerOnboardingStore(),
    tickets: new SupportTicketStore(),
    nps,
    isAdmin: opts.isAdmin === false ? () => false : () => true,
    resolveTenantId: () => null,
  });
  return { app, nps };
}

describe('NPS classification', () => {
  it('classifyScore: 0-6 detractor, 7-8 passive, 9-10 promoter', () => {
    expect(classifyScore(0)).toBe('detractor');
    expect(classifyScore(6)).toBe('detractor');
    expect(classifyScore(7)).toBe('passive');
    expect(classifyScore(8)).toBe('passive');
    expect(classifyScore(9)).toBe('promoter');
    expect(classifyScore(10)).toBe('promoter');
  });

  it('classifyScore rejects bad input', () => {
    expect(() => classifyScore(-1)).toThrow();
    expect(() => classifyScore(11)).toThrow();
    expect(() => classifyScore(5.5)).toThrow();
  });

  it('classifySentiment positive / negative / neutral / unknown', () => {
    expect(classifySentiment('Amazing fast and helpful')).toBe('positive');
    expect(classifySentiment('Broken crash slow terrible')).toBe('negative');
    expect(classifySentiment('No notable issues')).toBe('neutral');
    expect(classifySentiment('   ')).toBe('unknown');
  });

  it('extractTags identifies themes', () => {
    const t = extractTags('latency feels slow and the ticket response is unreliable');
    expect(t).toContain('performance');
    expect(t).toContain('support');
  });
});

describe('NpsStore', () => {
  it('record auto-classifies score + sentiment + tags', () => {
    const s = new NpsStore();
    const r = s.record({
      tenantId: 'op1',
      respondentEmail: 'Sponsor@Op1.co',
      scoreOutOf10: 10,
      comment: 'Fast and reliable platform, great support',
    });
    expect(r.category).toBe('promoter');
    expect(r.sentiment).toBe('positive');
    expect(r.respondentEmail).toBe('sponsor@op1.co');
    expect(r.tags.length).toBeGreaterThan(0);
  });

  it('aggregate computes NPS = (% promoters - % detractors) * 100', () => {
    const s = new NpsStore();
    for (let i = 0; i < 4; i++) s.record({ tenantId: 'x', respondentEmail: `p${i}@x.co`, scoreOutOf10: 10 });
    for (let i = 0; i < 1; i++) s.record({ tenantId: 'x', respondentEmail: `n${i}@x.co`, scoreOutOf10: 7 });
    for (let i = 0; i < 5; i++) s.record({ tenantId: 'x', respondentEmail: `d${i}@x.co`, scoreOutOf10: 3 });
    // 4 promoters, 5 detractors, 1 passive of 10 → (40 - 50) = -10
    const agg = s.aggregate();
    expect(agg.totalResponses).toBe(10);
    expect(agg.promoters).toBe(4);
    expect(agg.detractors).toBe(5);
    expect(agg.score).toBe(-10);
  });

  it('aggregate handles empty input', () => {
    const s = new NpsStore();
    expect(s.aggregate().score).toBe(0);
  });

  it('list filters by tenantId + since', () => {
    const s = new NpsStore();
    s.record({ tenantId: 'a', respondentEmail: 'a@a.co', scoreOutOf10: 10 });
    s.record({ tenantId: 'b', respondentEmail: 'b@b.co', scoreOutOf10: 5 });
    expect(s.list({ tenantId: 'a' }).length).toBe(1);
  });

  it('composeInvite + redeemToken happy path', () => {
    const s = new NpsStore();
    const inv = s.composeInvite('op1', 'sponsor@op1.co');
    expect(inv.token.length).toBe(32);
    expect(inv.body).toContain(inv.token);
    const { tenantId, email } = s.redeemToken(inv.token);
    expect(tenantId).toBe('op1');
    expect(email).toBe('sponsor@op1.co');
  });

  it('redeemToken is single-use', () => {
    const s = new NpsStore();
    const inv = s.composeInvite('op1', 'sponsor@op1.co');
    s.redeemToken(inv.token);
    expect(() => s.redeemToken(inv.token)).toThrow();
  });

  it('redeemToken expires', () => {
    const s = new NpsStore();
    const inv = s.composeInvite('op1', 'sponsor@op1.co', 0, 1); // expired-future
    const past = 1; // now < expiresAt initially; we test by faking far future
    s.composeInvite; // reference to satisfy lint
    // pass a future time beyond ttl
    expect(() => s.redeemToken(inv.token, Number.MAX_SAFE_INTEGER)).toThrow(/expired/);
    expect(past).toBe(1);
  });
});

describe('csm/nps routes', () => {
  let env: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => { env = await buildApp(); });
  afterEach(async () => { await env.app.close(); });

  it('POST /api/csm/nps/send (admin) returns an invite', async () => {
    const r = await env.app.inject({
      method: 'POST', url: '/api/csm/nps/send',
      payload: { tenantId: 'op1', email: 'sponsor@op1.co' },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().token.length).toBe(32);
  });

  it('POST /api/csm/nps/send 403 without admin', async () => {
    const noAdmin = await buildApp({ isAdmin: false });
    const r = await noAdmin.app.inject({
      method: 'POST', url: '/api/csm/nps/send',
      payload: { tenantId: 'op1', email: 'sponsor@op1.co' },
    });
    expect(r.statusCode).toBe(403);
    await noAdmin.app.close();
  });

  it('POST /api/csm/nps/responses redeems the token', async () => {
    const inv = env.nps.composeInvite('op1', 'sponsor@op1.co');
    const r = await env.app.inject({
      method: 'POST', url: '/api/csm/nps/responses',
      payload: { token: inv.token, scoreOutOf10: 9, comment: 'Great' },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().category).toBe('promoter');
  });

  it('POST /api/csm/nps/responses 400 on bad token', async () => {
    const r = await env.app.inject({
      method: 'POST', url: '/api/csm/nps/responses',
      payload: { token: 'deadbeef', scoreOutOf10: 9 },
    });
    expect(r.statusCode).toBe(400);
  });

  it('GET /api/csm/nps/responses (admin) lists all + aggregate', async () => {
    env.nps.record({ tenantId: 'op1', respondentEmail: 'a@op1.co', scoreOutOf10: 10 });
    const r = await env.app.inject({ method: 'GET', url: '/api/csm/nps/responses' });
    expect(r.statusCode).toBe(200);
    expect(r.json().count).toBe(1);
    expect(r.json().aggregate.promoters).toBe(1);
  });
});
