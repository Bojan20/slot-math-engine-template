/**
 * CORTI W209 Faza 500.0 — marketplace REST API integration tests.
 *
 * We boot a slim Fastify instance with only the marketplace routes
 * wired so we don't have to fight the global tenant/observability
 * stack (covered by other tests).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { MarketplaceStore } from '../state/marketplace.js';
import { HsmStore } from '../state/hsm.js';
import { registerMarketplaceRoutes } from '../routes/marketplace.js';
import { StubPaymentProvider } from '../lib/payment-stub.js';
import * as path from 'node:path';

async function buildEnv(opts: { forceFailure?: boolean } = {}): Promise<{
  app: FastifyInstance;
  store: MarketplaceStore;
  hsm: HsmStore;
  apiKey: string;
  authorId: string;
}> {
  const app = Fastify({ logger: false });
  // Mimic tenant-isolation header behaviour without the full pipeline.
  app.addHook('preHandler', async (req) => {
    const raw = req.headers['x-tenant-id'];
    if (raw) req.tenantId = Array.isArray(raw) ? raw[0] : raw;
  });
  const store = new MarketplaceStore();
  const keyFile = path.resolve(
    process.cwd(),
    `server/data/hsm-test-${Date.now()}-${Math.random()}.json`
  );
  const hsm = new HsmStore({ keyFile });
  await hsm.init();
  const provider = new StubPaymentProvider({
    forceSuccess: !opts.forceFailure,
    forceFailure: !!opts.forceFailure,
  });
  await registerMarketplaceRoutes(app, { store, hsm, paymentProvider: provider });

  // Seed an author via the registration endpoint.
  const reg = await app.inject({
    method: 'POST',
    url: '/api/marketplace/authors/register',
    payload: { name: 'Bojan', email: 'b@a.co' },
  });
  expect(reg.statusCode).toBe(201);
  const body = reg.json();
  return { app, store, hsm, apiKey: body.apiKey, authorId: body.authorId };
}

describe('marketplace · authors', () => {
  let env: Awaited<ReturnType<typeof buildEnv>>;
  beforeEach(async () => {
    env = await buildEnv();
  });
  afterEach(async () => {
    await env.app.close();
    await env.hsm.reset();
  });

  it('POST /authors/register returns an apiKey + authorId', () => {
    expect(env.authorId).toMatch(/^[0-9a-f-]{36}$/);
    expect(env.apiKey).toMatch(/^mk_live_/);
  });

  it('POST /authors/register rejects when missing fields', async () => {
    const r = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/authors/register',
      payload: { name: 'x' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('GET /authors/:id returns public profile + kernels/templates', async () => {
    const r = await env.app.inject({
      method: 'GET',
      url: `/api/marketplace/authors/${env.authorId}`,
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.id).toBe(env.authorId);
    expect(Array.isArray(body.kernels)).toBe(true);
  });

  it('GET /authors/:id returns 404 for unknown id', async () => {
    const r = await env.app.inject({
      method: 'GET',
      url: '/api/marketplace/authors/00000000-0000-0000-0000-000000000000',
    });
    expect(r.statusCode).toBe(404);
  });

  it('POST /authors/me/payout-method requires X-Author-Key', async () => {
    const r = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/authors/me/payout-method',
      payload: { type: 'bank', iban: 'DE89...' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('POST /authors/me/payout-method succeeds with key', async () => {
    const r = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/authors/me/payout-method',
      headers: { 'x-author-key': env.apiKey },
      payload: { type: 'bank', iban: 'DE89...' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().author.payoutMethod.type).toBe('bank');
  });

  it('POST /authors/me/payout-method rejects invalid type', async () => {
    const r = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/authors/me/payout-method',
      headers: { 'x-author-key': env.apiKey },
      payload: { type: 'mystery' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('GET /authors/me/earnings returns lifetime + payouts', async () => {
    const r = await env.app.inject({
      method: 'GET',
      url: '/api/marketplace/authors/me/earnings',
      headers: { 'x-author-key': env.apiKey },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.authorId).toBe(env.authorId);
    expect(body.payouts).toEqual([]);
    expect(body.lifetimeEarningsUsd).toBe(0);
  });
});

describe('marketplace · kernels', () => {
  let env: Awaited<ReturnType<typeof buildEnv>>;
  beforeEach(async () => {
    env = await buildEnv();
  });
  afterEach(async () => {
    await env.app.close();
    await env.hsm.reset();
  });

  async function submit(): Promise<string> {
    const r = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/kernels/submit',
      headers: { 'x-author-key': env.apiKey },
      payload: {
        manifest: { name: 'Super Slot', lwGap: 'M14_P1', pId: 'P-072' },
        priceUsd: 500,
      },
    });
    expect(r.statusCode).toBe(201);
    return r.json().submissionId;
  }

  it('POST /kernels/submit requires X-Author-Key', async () => {
    const r = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/kernels/submit',
      payload: { manifest: { name: 'x' } },
    });
    expect(r.statusCode).toBe(401);
  });

  it('POST /kernels/submit rejects manifest without name', async () => {
    const r = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/kernels/submit',
      headers: { 'x-author-key': env.apiKey },
      payload: { manifest: {} },
    });
    expect(r.statusCode).toBe(400);
  });

  it('full kernel lifecycle: submit → run-gates → approve → list active', async () => {
    const id = await submit();
    await env.app.inject({
      method: 'POST',
      url: `/api/marketplace/kernels/${id}/run-gates`,
    });
    const approved = env.store.getKernelById(id)!;
    expect(approved.submissionStatus).toBe('approved');
    await env.app.inject({
      method: 'POST',
      url: `/api/marketplace/kernels/${id}/approve`,
    });
    const r = await env.app.inject({
      method: 'GET',
      url: '/api/marketplace/kernels?status=active',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().total).toBe(1);
  });

  it('GET /kernels with lw_gap filter narrows results', async () => {
    await submit();
    const r = await env.app.inject({
      method: 'GET',
      url: '/api/marketplace/kernels?lw_gap=M14_P1',
    });
    expect(r.json().total).toBe(1);
    const empty = await env.app.inject({
      method: 'GET',
      url: '/api/marketplace/kernels?lw_gap=M99_P9',
    });
    expect(empty.json().total).toBe(0);
  });

  it('GET /kernels/:id returns 404 for unknown id', async () => {
    const r = await env.app.inject({
      method: 'GET',
      url: '/api/marketplace/kernels/00000000-0000-0000-0000-000000000000',
    });
    expect(r.statusCode).toBe(404);
  });

  it('POST /kernels/:id/reject persists rejection verdict', async () => {
    const id = await submit();
    const r = await env.app.inject({
      method: 'POST',
      url: `/api/marketplace/kernels/${id}/reject`,
      payload: { reason: 'bad-rtp' },
    });
    expect(r.statusCode).toBe(200);
    const kern = env.store.getKernelById(id)!;
    expect(kern.submissionStatus).toBe('rejected');
    expect((kern.testVerdict?.detail as { reason: string })?.reason).toBe('bad-rtp');
  });
});

describe('marketplace · purchases', () => {
  let env: Awaited<ReturnType<typeof buildEnv>>;
  let kernelId: string;

  beforeEach(async () => {
    env = await buildEnv();
    const submitRes = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/kernels/submit',
      headers: { 'x-author-key': env.apiKey },
      payload: { manifest: { name: 'k' }, priceUsd: 500 },
    });
    kernelId = submitRes.json().submissionId;
    env.store.updateKernelStatus(kernelId, 'active');
  });
  afterEach(async () => {
    await env.app.close();
    await env.hsm.reset();
  });

  it('POST /purchase requires X-Tenant-Id', async () => {
    const r = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/purchase',
      payload: { itemId: kernelId, itemType: 'kernel' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('POST /purchase issues license JWT on success', async () => {
    const r = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/purchase',
      headers: { 'x-tenant-id': 'op-1' },
      payload: { itemId: kernelId, itemType: 'kernel' },
    });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body.purchaseId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.licenseJwt.split('.').length).toBe(3);
    expect(body.receipt.amount).toBe(500);
  });

  it('POST /purchase 402s on payment failure', async () => {
    await env.app.close();
    env = await buildEnv({ forceFailure: true });
    const submit = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/kernels/submit',
      headers: { 'x-author-key': env.apiKey },
      payload: { manifest: { name: 'k' }, priceUsd: 500 },
    });
    const newKernelId = submit.json().submissionId;
    env.store.updateKernelStatus(newKernelId, 'active');
    const r = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/purchase',
      headers: { 'x-tenant-id': 'op-1' },
      payload: { itemId: newKernelId, itemType: 'kernel' },
    });
    expect(r.statusCode).toBe(402);
    expect(r.json().error).toBe('payment_failed');
  });

  it('POST /purchase 409s when kernel is in pending state', async () => {
    env.store.updateKernelStatus(kernelId, 'pending');
    const r = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/purchase',
      headers: { 'x-tenant-id': 'op-1' },
      payload: { itemId: kernelId, itemType: 'kernel' },
    });
    expect(r.statusCode).toBe(409);
  });

  it('POST /purchase 404s when item missing', async () => {
    const r = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/purchase',
      headers: { 'x-tenant-id': 'op-1' },
      payload: {
        itemId: '00000000-0000-0000-0000-000000000000',
        itemType: 'kernel',
      },
    });
    expect(r.statusCode).toBe(404);
  });

  it('GET /purchases is tenant-scoped', async () => {
    // Purchase as tenant op-A
    await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/purchase',
      headers: { 'x-tenant-id': 'op-A' },
      payload: { itemId: kernelId, itemType: 'kernel' },
    });
    // op-B has no purchases.
    const a = await env.app.inject({
      method: 'GET',
      url: '/api/marketplace/purchases',
      headers: { 'x-tenant-id': 'op-A' },
    });
    const b = await env.app.inject({
      method: 'GET',
      url: '/api/marketplace/purchases',
      headers: { 'x-tenant-id': 'op-B' },
    });
    expect(a.json().total).toBe(1);
    expect(b.json().total).toBe(0);
  });

  it('POST /purchase/:id/refund flips status to refunded', async () => {
    const p = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/purchase',
      headers: { 'x-tenant-id': 'op-1' },
      payload: { itemId: kernelId, itemType: 'kernel' },
    });
    const pid = p.json().purchaseId;
    const r = await env.app.inject({
      method: 'POST',
      url: `/api/marketplace/purchase/${pid}/refund`,
      headers: { 'x-tenant-id': 'op-1' },
      payload: { reason: 'wrong-item' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().purchase.status).toBe('refunded');
  });

  it('POST /purchase/:id/refund 403s for other tenant', async () => {
    const p = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/purchase',
      headers: { 'x-tenant-id': 'op-1' },
      payload: { itemId: kernelId, itemType: 'kernel' },
    });
    const pid = p.json().purchaseId;
    const r = await env.app.inject({
      method: 'POST',
      url: `/api/marketplace/purchase/${pid}/refund`,
      headers: { 'x-tenant-id': 'op-other' },
    });
    expect(r.statusCode).toBe(403);
  });
});

describe('marketplace · templates + misc', () => {
  let env: Awaited<ReturnType<typeof buildEnv>>;
  beforeEach(async () => {
    env = await buildEnv();
  });
  afterEach(async () => {
    await env.app.close();
    await env.hsm.reset();
  });

  it('GET /templates returns empty list initially', async () => {
    const r = await env.app.inject({
      method: 'GET',
      url: '/api/marketplace/templates',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().total).toBe(0);
  });

  it('GET /templates/:id 404 for unknown id', async () => {
    const r = await env.app.inject({
      method: 'GET',
      url: '/api/marketplace/templates/00000000-0000-0000-0000-000000000000',
    });
    expect(r.statusCode).toBe(404);
  });

  it('POST /webhooks/payment without secret returns received:false', async () => {
    delete process.env.MARKETPLACE_WEBHOOK_SECRET;
    const r = await env.app.inject({
      method: 'POST',
      url: '/api/marketplace/webhooks/payment',
      payload: { event: 'payment.succeeded' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().received).toBe(false);
  });
});
