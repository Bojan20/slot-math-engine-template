/**
 * CORTI W209 Faza 500.0 — marketplace in-memory state tests.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MarketplaceStore,
  sha256Hex,
} from '../state/marketplace.js';

describe('MarketplaceStore · authors', () => {
  let store: MarketplaceStore;
  beforeEach(() => {
    store = new MarketplaceStore();
  });

  it('upsertAuthor creates a new row with kyc=pending by default', () => {
    const a = store.upsertAuthor({ name: 'Bojan', email: 'b@a.co' });
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.kycStatus).toBe('pending');
    expect(a.tier).toBe(1);
    expect(a.revenueSharePct).toBe(0.7);
  });

  it('upsertAuthor by email is idempotent', () => {
    const a = store.upsertAuthor({ name: 'Bojan', email: 'b@a.co' });
    const b = store.upsertAuthor({ name: 'Bojan!', email: 'b@a.co', tier: 2 });
    expect(b.id).toBe(a.id);
    expect(b.name).toBe('Bojan!');
    expect(b.tier).toBe(2);
  });

  it('upsertAuthor with apiKey enables getAuthorByApiKey', () => {
    const a = store.upsertAuthor({ name: 'X', email: 'x@x.co', apiKey: 'mk_test_secret' });
    expect(a.apiKeyHash).toBe(sha256Hex('mk_test_secret'));
    expect(store.getAuthorByApiKey('mk_test_secret')?.id).toBe(a.id);
    expect(store.getAuthorByApiKey('mk_test_wrong')).toBeNull();
  });

  it('setPayoutMethod updates the row in place', () => {
    const a = store.upsertAuthor({ name: 'X', email: 'x@x.co' });
    const updated = store.setPayoutMethod(a.id, { type: 'bank', iban: 'DE89...' });
    expect(updated?.payoutMethod?.type).toBe('bank');
  });
});

describe('MarketplaceStore · kernels', () => {
  let store: MarketplaceStore;
  let authorId: string;
  beforeEach(() => {
    store = new MarketplaceStore();
    authorId = store.upsertAuthor({ name: 'A', email: 'a@a.co' }).id;
  });

  it('submitKernel returns pending state and a UUID id', () => {
    const k = store.submitKernel({
      authorId,
      manifest: { name: 'My Slot', lwGap: 'M14_P1', pId: 'P-072' },
    });
    expect(k.submissionStatus).toBe('pending');
    expect(k.lwGap).toBe('M14_P1');
    expect(k.pId).toBe('P-072');
    expect(k.installCount).toBe(0);
  });

  it('listKernels filters by status + author + lwGap + pId', () => {
    const k1 = store.submitKernel({
      authorId,
      manifest: { name: 'k1', lwGap: 'M11_P1', pId: 'P-068' },
    });
    store.submitKernel({
      authorId,
      manifest: { name: 'k2', lwGap: 'M14_P1', pId: 'P-072' },
    });
    store.updateKernelStatus(k1.id, 'active');
    expect(store.listKernels({ status: 'active' }).length).toBe(1);
    expect(store.listKernels({ lwGap: 'M14_P1' }).length).toBe(1);
    expect(store.listKernels({ pId: 'P-068' }).length).toBe(1);
    expect(store.listKernels({ authorId }).length).toBe(2);
  });

  it('updateKernelStatus → approved sets self_test cert level', () => {
    const k = store.submitKernel({ authorId, manifest: { name: 'k' } });
    const updated = store.updateKernelStatus(k.id, 'approved', {
      passed: true,
      totalSpecs: 30,
      failures: 0,
    });
    expect(updated?.certificationLevel).toBe('self_test');
  });

  it('updateKernelStatus → active sets lab_certified', () => {
    const k = store.submitKernel({ authorId, manifest: { name: 'k' } });
    store.updateKernelStatus(k.id, 'approved');
    const active = store.updateKernelStatus(k.id, 'active');
    expect(active?.certificationLevel).toBe('lab_certified');
    expect(active?.submissionStatus).toBe('active');
  });

  it('updateKernelStatus returns null for unknown id', () => {
    expect(store.updateKernelStatus('no-such', 'active')).toBeNull();
  });
});

describe('MarketplaceStore · templates', () => {
  let store: MarketplaceStore;
  let authorId: string;
  beforeEach(() => {
    store = new MarketplaceStore();
    authorId = store.upsertAuthor({ name: 'A', email: 'a@a.co' }).id;
  });

  it('createTemplate persists the row with active status', () => {
    const t = store.createTemplate({
      authorId,
      manifest: { name: 'NeonSkin', category: 'lobby' },
      priceUsd: 199,
    });
    expect(t.status).toBe('active');
    expect(t.priceUsd).toBe(199);
  });

  it('listTemplates filters by author', () => {
    store.createTemplate({ authorId, manifest: { name: 't1' } });
    const otherId = store.upsertAuthor({ name: 'B', email: 'b@b.co' }).id;
    store.createTemplate({ authorId: otherId, manifest: { name: 't2' } });
    expect(store.listTemplates({ authorId }).length).toBe(1);
  });
});

describe('MarketplaceStore · purchases', () => {
  let store: MarketplaceStore;
  let kernelId: string;
  beforeEach(() => {
    store = new MarketplaceStore();
    const authorId = store.upsertAuthor({ name: 'A', email: 'a@a.co' }).id;
    const k = store.submitKernel({ authorId, manifest: { name: 'K' }, priceUsd: 100 });
    store.updateKernelStatus(k.id, 'active');
    kernelId = k.id;
  });

  it('recordPurchase bumps install count + returns active purchase', () => {
    const beforeCount = store.getKernelById(kernelId)!.installCount;
    const p = store.recordPurchase({
      tenantId: 'op-1',
      itemId: kernelId,
      itemType: 'kernel',
      pricePaid: 100,
      currency: 'USD',
      licenseJwt: 'jwt.sample.sig',
    });
    expect(p.status).toBe('active');
    expect(store.getKernelById(kernelId)!.installCount).toBe(beforeCount + 1);
  });

  it('listPurchasesByTenant isolates other tenants', () => {
    store.recordPurchase({
      tenantId: 'op-1',
      itemId: kernelId,
      itemType: 'kernel',
      pricePaid: 100,
      currency: 'USD',
      licenseJwt: 'a.b.c',
    });
    store.recordPurchase({
      tenantId: 'op-2',
      itemId: kernelId,
      itemType: 'kernel',
      pricePaid: 100,
      currency: 'USD',
      licenseJwt: 'a.b.c',
    });
    expect(store.listPurchasesByTenant('op-1').length).toBe(1);
    expect(store.listPurchasesByTenant('op-2').length).toBe(1);
    expect(store.listPurchasesByTenant('op-3').length).toBe(0);
  });

  it('refundPurchase flips status to refunded', () => {
    const p = store.recordPurchase({
      tenantId: 'op-1',
      itemId: kernelId,
      itemType: 'kernel',
      pricePaid: 100,
      currency: 'USD',
      licenseJwt: 'a.b.c',
    });
    const refunded = store.refundPurchase(p.id);
    expect(refunded?.status).toBe('refunded');
    expect(refunded?.refundedAt).not.toBeNull();
  });
});

describe('MarketplaceStore · payouts', () => {
  let store: MarketplaceStore;
  let authorId: string;
  let kernelId: string;
  beforeEach(() => {
    store = new MarketplaceStore();
    authorId = store.upsertAuthor({
      name: 'A',
      email: 'a@a.co',
      revenueSharePct: 0.70,
    }).id;
    const k = store.submitKernel({ authorId, manifest: { name: 'K' }, priceUsd: 200 });
    store.updateKernelStatus(k.id, 'active');
    kernelId = k.id;
    for (let i = 0; i < 5; i++) {
      store.recordPurchase({
        tenantId: `op-${i}`,
        itemId: kernelId,
        itemType: 'kernel',
        pricePaid: 200,
        currency: 'USD',
        licenseJwt: 'a.b.c',
      });
    }
  });

  it('computeMonthlyPayouts aggregates revenue + splits 70/30', () => {
    const rows = store.computeMonthlyPayouts({
      start: '2000-01-01',
      end: '3000-01-01',
    });
    expect(rows.length).toBe(1);
    expect(rows[0].grossRevenue).toBe(1000);
    expect(rows[0].authorPayout).toBe(700);
    expect(rows[0].platformCut).toBe(300);
    expect(rows[0].status).toBe('pending');
  });

  it('computeMonthlyPayouts is idempotent for the same period', () => {
    store.computeMonthlyPayouts({ start: '2000-01-01', end: '3000-01-01' });
    const rows = store.computeMonthlyPayouts({
      start: '2000-01-01',
      end: '3000-01-01',
    });
    expect(rows.length).toBe(1);
    expect(store.listPayoutsByAuthor(authorId).length).toBe(1);
  });

  it('markPayoutPaid sets status + payoutRef + paidAt', () => {
    const rows = store.computeMonthlyPayouts({
      start: '2000-01-01',
      end: '3000-01-01',
    });
    const paid = store.markPayoutPaid(rows[0].id, 'wire-9000');
    expect(paid?.status).toBe('paid');
    expect(paid?.payoutRef).toBe('wire-9000');
    expect(paid?.paidAt).not.toBeNull();
  });

  it('refunded purchases are excluded from gross revenue', () => {
    const purchases = store.listAllPurchases();
    store.refundPurchase(purchases[0].id);
    const rows = store.computeMonthlyPayouts({
      start: '2000-01-01',
      end: '3000-01-01',
    });
    expect(rows[0].grossRevenue).toBe(800);
    expect(rows[0].authorPayout).toBe(560);
  });
});
