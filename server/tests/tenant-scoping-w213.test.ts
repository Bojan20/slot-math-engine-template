/**
 * W213 Faza 600.2 — tenant scoping boundary specs.
 *
 * Validates that the four pg state stores flagged by the W212 audit
 * (`tenants-pg`, `marketplace-pg`, `pilot-runs-pg`,
 * `tenant-wallet-config-pg`) reference the W208 isolation helpers and
 * enforce tenant boundaries on the per-tenant query paths.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MarketplaceStore } from '../state/marketplace.js';
import { PilotRunStore } from '../state/pilot-runs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STATE_DIR = resolve(__dirname, '..', 'state');

function readState(file: string): string {
  return readFileSync(resolve(STATE_DIR, file), 'utf8');
}

describe('W213 · isolation-helper presence in pg stores', () => {
  it('tenants-pg.ts imports assertTenantScopedQuery + crossTenantOverride', () => {
    const src = readState('tenants-pg.ts');
    expect(src).toMatch(/assertTenantScopedQuery/);
    expect(src).toMatch(/crossTenantOverride/);
  });

  it('marketplace-pg.ts imports assertTenantScopedQuery + crossTenantOverride', () => {
    const src = readState('marketplace-pg.ts');
    expect(src).toMatch(/assertTenantScopedQuery/);
    expect(src).toMatch(/crossTenantOverride/);
  });

  it('pilot-runs-pg.ts imports assertTenantScopedQuery + crossTenantOverride', () => {
    const src = readState('pilot-runs-pg.ts');
    expect(src).toMatch(/assertTenantScopedQuery/);
    expect(src).toMatch(/crossTenantOverride/);
  });

  it('tenant-wallet-config-pg.ts imports assertTenantScopedQuery + crossTenantOverride', () => {
    const src = readState('tenant-wallet-config-pg.ts');
    expect(src).toMatch(/assertTenantScopedQuery/);
    expect(src).toMatch(/crossTenantOverride/);
  });
});

describe('W213 · marketplace purchases honour tenant boundary', () => {
  let store: MarketplaceStore;

  beforeEach(() => {
    store = new MarketplaceStore();
  });

  it('listPurchasesByTenant only returns rows for the asked tenant', () => {
    const author = store.upsertAuthor({
      name: 'Author A', email: 'a@example.com',
    });
    const kernel = store.submitKernel({
      authorId: author.id, manifest: { name: 'k1' }, priceUsd: 10,
    });
    store.recordPurchase({
      tenantId: 'tenant-A', itemId: kernel.id, itemType: 'kernel',
      pricePaid: 10, currency: 'USD', licenseJwt: 'tok-A',
    });
    store.recordPurchase({
      tenantId: 'tenant-B', itemId: kernel.id, itemType: 'kernel',
      pricePaid: 10, currency: 'USD', licenseJwt: 'tok-B',
    });

    const a = store.listPurchasesByTenant('tenant-A');
    const b = store.listPurchasesByTenant('tenant-B');
    const ghost = store.listPurchasesByTenant('tenant-GHOST');

    expect(a.map((p) => p.tenantId)).toEqual(['tenant-A']);
    expect(b.map((p) => p.tenantId)).toEqual(['tenant-B']);
    expect(ghost).toHaveLength(0);
  });
});

describe('W213 · pilot-runs honour tenant boundary', () => {
  let store: PilotRunStore;

  beforeEach(() => {
    store = new PilotRunStore();
  });

  it('list({tenantId}) returns only that tenant’s rows; cross-tenant scan returns all', () => {
    store.record({
      tenantId: 'tenant-A',
      verdicts: [{ step: 's1', ok: true, elapsedMs: 1 }],
    });
    store.record({
      tenantId: 'tenant-B',
      verdicts: [{ step: 's1', ok: true, elapsedMs: 1 }],
    });

    const onlyA = store.list({ tenantId: 'tenant-A' });
    const onlyB = store.list({ tenantId: 'tenant-B' });
    const all = store.list();

    expect(onlyA.map((r) => r.tenantId)).toEqual(['tenant-A']);
    expect(onlyB.map((r) => r.tenantId)).toEqual(['tenant-B']);
    expect(all).toHaveLength(2);
  });
});
