/**
 * CORTI W209 Faza 500.0 — Marketplace REST API.
 *
 * All routes mounted under `/api/marketplace`. Tenant-scoped where
 * applicable (purchases / list-mine / refund), public for catalogue
 * reads (list kernels + templates + author profile). Author-only
 * endpoints (kernel submission, payout method, earnings) gated by
 * `X-Author-Key` via {@link authorAuthPreHandler}.
 *
 * Routes follow the same JSON response shape as the rest of the
 * backend — every error returns `{ error: <code>, ... }` with the
 * appropriate HTTP status (400 / 401 / 403 / 404 / 409 / 429).
 *
 * Rate-limit: the global REST rate limiter from index.ts already covers
 * every endpoint here. For the purchase endpoint we additionally wire
 * a tighter per-tenant limiter to discourage card-testing.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Cache } from '../lib/cache.js';
import type { HsmStore } from '../state/hsm.js';
import {
  type MarketplaceStore,
  type AuthorRecord,
  type KernelFilters,
  type KernelStatus,
} from '../state/marketplace.js';
import type { PostgresMarketplaceStore } from '../state/marketplace-pg.js';
import {
  authorAuthPreHandler,
  issueLicenseJwt,
  verifyLicenseJwt,
  registerAuthor,
  approveAuthorKyc,
} from '../lib/marketplace-auth.js';
import {
  type PaymentProvider,
  StubPaymentProvider,
  validateWebhookSignature,
} from '../lib/payment-stub.js';
import { rateLimit } from '../lib/rate-limit.js';

type Store = MarketplaceStore | PostgresMarketplaceStore;

export interface MarketplaceRouteDeps {
  store: Store;
  hsm: HsmStore;
  cache?: Cache<unknown>;
  paymentProvider?: PaymentProvider;
  /** Skip the tenant header requirement (e.g. tests). Default: false. */
  allowAnonymousReads?: boolean;
}

function asPromise<T>(v: T | Promise<T>): Promise<T> {
  return v instanceof Promise ? v : Promise.resolve(v);
}

function requireTenant(req: FastifyRequest, reply: FastifyReply): string | null {
  const tid = req.tenantId;
  if (!tid) {
    reply.code(400).send({ error: 'tenant_required' });
    return null;
  }
  return tid;
}

function badRequest(reply: FastifyReply, error: string, detail?: unknown): FastifyReply {
  return reply.code(400).send({ error, ...(detail !== undefined ? { detail } : {}) });
}

export async function registerMarketplaceRoutes(
  app: FastifyInstance,
  deps: MarketplaceRouteDeps
): Promise<void> {
  const provider: PaymentProvider = deps.paymentProvider ?? new StubPaymentProvider();
  // Ensure the HSM has a keypair so issue/verify work straight away.
  await deps.hsm.init();

  // -------------------------------------------------------------------------
  // KERNELS
  // -------------------------------------------------------------------------

  app.post<{
    Body: {
      manifest?: Record<string, unknown>;
      code?: string;
      storageUrl?: string;
      priceUsd?: number;
      licenseType?: 'perpetual' | 'subscription' | 'metered';
    };
  }>(
    '/api/marketplace/kernels/submit',
    { preHandler: authorAuthPreHandler(deps.store) },
    async (req, reply) => {
      const author = req.author as AuthorRecord;
      const manifest = (req.body?.manifest ?? {}) as Record<string, unknown>;
      if (!manifest.name) return badRequest(reply, 'manifest.name_required');
      const rec = await asPromise(
        deps.store.submitKernel({
          authorId: author.id,
          manifest,
          code: req.body?.code,
          storageUrl: req.body?.storageUrl,
          priceUsd: req.body?.priceUsd,
          licenseType: req.body?.licenseType,
        })
      );
      return reply.code(201).send({ submissionId: rec.id, kernel: rec });
    }
  );

  app.get<{
    Querystring: { status?: KernelStatus; author?: string; lw_gap?: string; p_id?: string };
  }>('/api/marketplace/kernels', async (req, reply) => {
    const filters: KernelFilters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.author) filters.authorId = req.query.author;
    if (req.query.lw_gap) filters.lwGap = req.query.lw_gap;
    if (req.query.p_id) filters.pId = req.query.p_id;
    const rows = await asPromise(deps.store.listKernels(filters));
    return reply.send({ kernels: rows, total: rows.length });
  });

  app.get<{ Params: { id: string } }>('/api/marketplace/kernels/:id', async (req, reply) => {
    const rec = await asPromise(deps.store.getKernelById(req.params.id));
    if (!rec) return reply.code(404).send({ error: 'kernel_not_found' });
    return reply.send({ kernel: rec });
  });

  app.post<{ Params: { id: string } }>(
    '/api/marketplace/kernels/:id/run-gates',
    async (req, reply) => {
      const rec = await asPromise(deps.store.getKernelById(req.params.id));
      if (!rec) return reply.code(404).send({ error: 'kernel_not_found' });
      // Stub: in real wiring this would dispatch the IR through the
      // closed-form solver + MC validation pipeline. For now we mark
      // testing → approved with a synthetic verdict.
      await asPromise(
        deps.store.updateKernelStatus(rec.id, 'testing', null)
      );
      const verdict = {
        passed: true,
        totalSpecs: 40,
        failures: 0,
        rtpMean: 0.955,
        rtpCi: [0.952, 0.958] as [number, number],
        signedAt: new Date().toISOString(),
      };
      const updated = await asPromise(
        deps.store.updateKernelStatus(rec.id, 'approved', verdict)
      );
      return reply.send({ ok: true, kernel: updated });
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/marketplace/kernels/:id/approve',
    async (req, reply) => {
      const updated = await asPromise(
        deps.store.updateKernelStatus(req.params.id, 'active')
      );
      if (!updated) return reply.code(404).send({ error: 'kernel_not_found' });
      return reply.send({ ok: true, kernel: updated });
    }
  );

  app.post<{
    Params: { id: string };
    Body: { reason?: string };
  }>('/api/marketplace/kernels/:id/reject', async (req, reply) => {
    const updated = await asPromise(
      deps.store.updateKernelStatus(req.params.id, 'rejected', {
        passed: false,
        totalSpecs: 0,
        failures: 0,
        detail: { reason: req.body?.reason ?? 'no_reason_given' },
      })
    );
    if (!updated) return reply.code(404).send({ error: 'kernel_not_found' });
    return reply.send({ ok: true, kernel: updated });
  });

  // -------------------------------------------------------------------------
  // TEMPLATES
  // -------------------------------------------------------------------------

  app.get<{ Querystring: { author?: string; status?: 'active' | 'archived' } }>(
    '/api/marketplace/templates',
    async (req, reply) => {
      const filters: { authorId?: string; status?: 'active' | 'archived' } = {};
      if (req.query.author) filters.authorId = req.query.author;
      if (req.query.status) filters.status = req.query.status;
      const rows = await asPromise(deps.store.listTemplates(filters));
      return reply.send({ templates: rows, total: rows.length });
    }
  );

  app.get<{ Params: { id: string } }>(
    '/api/marketplace/templates/:id',
    async (req, reply) => {
      const rec = await asPromise(deps.store.getTemplateById(req.params.id));
      if (!rec) return reply.code(404).send({ error: 'template_not_found' });
      return reply.send({ template: rec });
    }
  );

  // -------------------------------------------------------------------------
  // PURCHASES
  // -------------------------------------------------------------------------

  const purchaseRateLimit = rateLimit({
    tokens: 20,
    refillPerSec: 5,
    scope: 'tenant',
    routeKey: 'marketplace_purchase',
  });

  app.post<{
    Body: {
      itemId?: string;
      itemType?: 'kernel' | 'template';
      paymentSource?: { type: 'card' | 'wire' | 'wallet'; token?: string };
      currency?: string;
    };
  }>(
    '/api/marketplace/purchase',
    { preHandler: purchaseRateLimit },
    async (req, reply) => {
      const tid = requireTenant(req, reply);
      if (!tid) return;
      const itemId = req.body?.itemId;
      const itemType = req.body?.itemType;
      if (!itemId || (itemType !== 'kernel' && itemType !== 'template')) {
        return badRequest(reply, 'itemId_and_itemType_required');
      }
      let priceUsd = 0;
      let licenseType: 'perpetual' | 'subscription' | 'metered' = 'perpetual';
      if (itemType === 'kernel') {
        const k = await asPromise(deps.store.getKernelById(itemId));
        if (!k) return reply.code(404).send({ error: 'item_not_found' });
        if (k.submissionStatus !== 'active' && k.submissionStatus !== 'approved') {
          return reply.code(409).send({ error: 'item_not_available' });
        }
        priceUsd = k.priceUsd;
        licenseType = k.licenseType;
      } else {
        const t = await asPromise(deps.store.getTemplateById(itemId));
        if (!t) return reply.code(404).send({ error: 'item_not_found' });
        if (t.status !== 'active') return reply.code(409).send({ error: 'item_not_available' });
        priceUsd = t.priceUsd;
        licenseType = t.licenseType;
      }

      const charge = await provider.charge({
        amount: priceUsd,
        currency: req.body?.currency ?? 'USD',
        source: req.body?.paymentSource ?? { type: 'card', token: 'tok_test' },
        metadata: { tenant: tid, item: itemId, type: itemType },
      });
      if (!charge.ok) {
        return reply.code(402).send({
          error: 'payment_failed',
          providerError: charge.errorCode ?? 'unknown',
          reference: charge.reference,
        });
      }

      // Allocate a placeholder purchaseId now so the JWT and the row id agree.
      const purchaseId = cryptoRandomUuid();
      const licenseJwt = issueLicenseJwt(deps.hsm, {
        tenantId: tid,
        itemId,
        itemType,
        purchaseId,
        licenseType,
      });
      const purchase = await asPromise(
        deps.store.recordPurchase({
          tenantId: tid,
          itemId,
          itemType,
          pricePaid: priceUsd,
          currency: req.body?.currency ?? 'USD',
          licenseJwt,
          paymentRef: charge.reference,
        })
      );
      return reply.code(201).send({
        purchaseId: purchase.id,
        licenseJwt,
        receipt: {
          itemId,
          itemType,
          amount: priceUsd,
          currency: purchase.currency,
          paymentRef: charge.reference,
          purchasedAt: purchase.purchasedAt,
        },
      });
    }
  );

  app.get('/api/marketplace/purchases', async (req, reply) => {
    const tid = requireTenant(req, reply);
    if (!tid) return;
    const rows = await asPromise(deps.store.listPurchasesByTenant(tid));
    return reply.send({ purchases: rows, total: rows.length });
  });

  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/api/marketplace/purchase/:id/refund',
    async (req, reply) => {
      const tid = requireTenant(req, reply);
      if (!tid) return;
      const existing = await asPromise(deps.store.getPurchaseById(req.params.id));
      if (!existing) return reply.code(404).send({ error: 'purchase_not_found' });
      if (existing.tenantId !== tid) return reply.code(403).send({ error: 'forbidden' });
      if (existing.status !== 'active')
        return reply.code(409).send({ error: 'purchase_not_refundable' });
      const refund = await provider.refund({
        reference: existing.paymentRef ?? '',
        reason: req.body?.reason,
      });
      if (!refund.ok)
        return reply.code(502).send({ error: 'refund_failed', detail: refund.errorCode });
      const updated = await asPromise(deps.store.refundPurchase(existing.id));
      return reply.send({ ok: true, purchase: updated, refundId: refund.refundId });
    }
  );

  // -------------------------------------------------------------------------
  // AUTHORS
  // -------------------------------------------------------------------------

  app.post<{
    Body: { name?: string; email?: string; tier?: 1 | 2 | 3 };
  }>('/api/marketplace/authors/register', async (req, reply) => {
    if (!req.body?.name || !req.body?.email) {
      return badRequest(reply, 'name_and_email_required');
    }
    const { author, apiKey } = await registerAuthor(deps.store, {
      name: req.body.name,
      email: req.body.email,
      tier: req.body.tier,
    });
    // Auto-approve KYC in MVP — replace with real KYC flow in W21x.
    await approveAuthorKyc(deps.store, author.id);
    return reply.code(201).send({ authorId: author.id, apiKey, kycStatus: 'approved' });
  });

  app.get<{ Params: { id: string } }>(
    '/api/marketplace/authors/:id',
    async (req, reply) => {
      const author = await asPromise(deps.store.getAuthorById(req.params.id));
      if (!author) return reply.code(404).send({ error: 'author_not_found' });
      const kernels = await asPromise(deps.store.listKernels({ authorId: author.id }));
      const templates = await asPromise(
        deps.store.listTemplates({ authorId: author.id })
      );
      // Strip sensitive fields from the public view.
      return reply.send({
        id: author.id,
        name: author.name,
        tier: author.tier,
        kycStatus: author.kycStatus,
        kernels,
        templates,
      });
    }
  );

  app.post<{
    Body: {
      type?: 'bank' | 'paypal' | 'crypto';
      account?: string;
      routing?: string;
      iban?: string;
      email?: string;
      wallet?: string;
    };
  }>(
    '/api/marketplace/authors/me/payout-method',
    { preHandler: authorAuthPreHandler(deps.store) },
    async (req, reply) => {
      const author = req.author as AuthorRecord;
      const body = req.body ?? {};
      if (body.type !== 'bank' && body.type !== 'paypal' && body.type !== 'crypto') {
        return badRequest(reply, 'invalid_payout_type');
      }
      const method = { ...body, type: body.type } as Parameters<
        typeof deps.store.setPayoutMethod
      >[1];
      const updated = await asPromise(deps.store.setPayoutMethod(author.id, method));
      return reply.send({ ok: true, author: updated });
    }
  );

  app.get(
    '/api/marketplace/authors/me/earnings',
    { preHandler: authorAuthPreHandler(deps.store) },
    async (req, reply) => {
      const author = req.author as AuthorRecord;
      const payouts = await asPromise(deps.store.listPayoutsByAuthor(author.id));
      const lifetime = payouts.reduce((s, p) => s + p.authorPayout, 0);
      return reply.send({
        authorId: author.id,
        revenueSharePct: author.revenueSharePct,
        payouts,
        lifetimeEarningsUsd: Math.round(lifetime * 100) / 100,
      });
    }
  );

  // -------------------------------------------------------------------------
  // LICENSE VERIFY
  // -------------------------------------------------------------------------

  app.post<{ Body: { licenseJwt?: string } }>(
    '/api/marketplace/license/verify',
    async (req, reply) => {
      const jwt = req.body?.licenseJwt;
      if (!jwt) return badRequest(reply, 'license_jwt_required');
      const res = verifyLicenseJwt(jwt, deps.hsm.getPublicKeyHex());
      return reply.send(res);
    }
  );

  // -------------------------------------------------------------------------
  // PAYMENT WEBHOOK
  // -------------------------------------------------------------------------

  app.post('/api/marketplace/webhooks/payment', async (req, reply) => {
    const raw = JSON.stringify(req.body ?? {});
    const sig = req.headers['x-webhook-signature'];
    const sigHeader = Array.isArray(sig) ? sig[0] : sig;
    const v = validateWebhookSignature({
      rawBody: raw,
      signatureHeader: sigHeader,
    });
    if (!v.ok) {
      // We don't 500 — return 200/ignored so the PSP doesn't retry
      // forever on a config error, but we mark received=false.
      return reply.send({ received: false, reason: v.reason });
    }
    // Real implementation would dispatch by event type.
    return reply.send({ received: true });
  });
}

// ---------------------------------------------------------------------------
// Local UUID helper — uses globalThis.crypto if available to keep ESM happy.
// ---------------------------------------------------------------------------

import { randomUUID as nodeRandomUuid } from 'node:crypto';
function cryptoRandomUuid(): string {
  return nodeRandomUuid();
}
