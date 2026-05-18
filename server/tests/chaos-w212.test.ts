/**
 * W212 Faza 600.1 — Chaos engineering framework + admin route specs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import {
  ChaosController,
  FAULT_NAMES,
  isFaultName,
} from '../lib/chaos/index.js';
import {
  withCacheMissChaos,
  setCacheMissChaos,
} from '../lib/chaos/faults/cache-miss.js';
import {
  withWalletTimeoutChaos,
  setWalletTimeoutChaos,
  WalletChaosTimeoutError,
} from '../lib/chaos/faults/wallet-timeout.js';
import {
  withDbSlowQueryChaos,
  pickSlowDelayMs,
} from '../lib/chaos/faults/db-slow-query.js';
import {
  resolveKeyIdWithChaos,
  verifyWithRotationChaos,
} from '../lib/chaos/faults/hsm-key-rotation.js';
import {
  injectChainGap,
  observerVerdict,
  verifyChain,
} from '../lib/chaos/faults/audit-chain-gap.js';
import {
  safeAssertTenant,
  runWithTenantLossChaos,
} from '../lib/chaos/faults/tenant-context-loss.js';
import { sealEntry, ZERO_HASH, type ChainedEntry } from '../lib/hashChain.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { TenantContext } from '../lib/tenant-isolation.js';
import { assertTenantContext } from '../lib/tenant-isolation.js';

// Deterministic RNG factory: returns the supplied sequence in order.
function fixedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('W212 chaos · ChaosController gating', () => {
  it('is disabled by default when env vars are unset', () => {
    const original = { ce: process.env.CHAOS_ENABLED, ne: process.env.NODE_ENV };
    delete process.env.CHAOS_ENABLED;
    process.env.NODE_ENV = 'test';
    const ctrl = new ChaosController();
    expect(ctrl.isEnabled()).toBe(false);
    process.env.CHAOS_ENABLED = original.ce;
    process.env.NODE_ENV = original.ne;
  });

  it('refuses to enable in production even with CHAOS_ENABLED=true', () => {
    const original = { ce: process.env.CHAOS_ENABLED, ne: process.env.NODE_ENV };
    process.env.CHAOS_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    const ctrl = new ChaosController();
    expect(ctrl.isEnabled()).toBe(false);
    process.env.CHAOS_ENABLED = original.ce;
    process.env.NODE_ENV = original.ne;
  });

  it('forceEnabled flag overrides env (test-only)', () => {
    const ctrl = new ChaosController({ forceEnabled: true });
    expect(ctrl.isEnabled()).toBe(true);
  });
});

describe('W212 chaos · enable/disable/list', () => {
  it('clamps probability to [0, 1]', () => {
    const ctrl = new ChaosController({ forceEnabled: true });
    expect(ctrl.enable('cache.miss', -1).probability).toBe(0);
    expect(ctrl.enable('cache.miss', 5).probability).toBe(1);
  });

  it('disable returns true only when fault was active', () => {
    const ctrl = new ChaosController({ forceEnabled: true });
    ctrl.enable('cache.miss', 0.5);
    expect(ctrl.disable('cache.miss')).toBe(true);
    expect(ctrl.disable('cache.miss')).toBe(false);
  });

  it('list returns sorted snapshot', () => {
    const ctrl = new ChaosController({ forceEnabled: true });
    ctrl.enable('wallet.timeout', 0.1);
    ctrl.enable('cache.miss', 0.1);
    const list = ctrl.list();
    expect(list[0].name).toBe('cache.miss');
    expect(list[1].name).toBe('wallet.timeout');
  });

  it('isFaultName guards unknown names', () => {
    expect(isFaultName('cache.miss')).toBe(true);
    expect(isFaultName('totally.fake')).toBe(false);
  });

  it('FAULT_NAMES covers six W212 faults', () => {
    expect(FAULT_NAMES).toHaveLength(6);
  });
});

describe('W212 chaos · fault: cache.miss', () => {
  it('forces a loader call when chaos fires', async () => {
    const ctrl = new ChaosController({ forceEnabled: true, rng: () => 0 });
    ctrl.enable('cache.miss', 1.0);
    let loaderCalls = 0;
    const cache = makeStubCache<number>();
    await cache.set('k', 42);
    const r = await withCacheMissChaos(ctrl, cache, 'k', async () => {
      loaderCalls++;
      return 99;
    });
    expect(loaderCalls).toBe(1);
    expect(r.source).toBe('chaos-forced-loader');
    expect(r.value).toBe(99);
  });

  it('falls through to cache when chaos does not fire', async () => {
    const ctrl = new ChaosController({ forceEnabled: true, rng: () => 0.99 });
    ctrl.enable('cache.miss', 0.5);
    const cache = makeStubCache<number>();
    await cache.set('k', 42);
    const r = await withCacheMissChaos(ctrl, cache, 'k', async () => 99);
    expect(r.value).toBe(42);
    expect(r.source).toBe('cache');
  });

  it('setCacheMissChaos toggle returns disabled state', () => {
    const ctrl = new ChaosController({ forceEnabled: true });
    expect(setCacheMissChaos(ctrl, true, 0.3).enabled).toBe(true);
    expect(setCacheMissChaos(ctrl, false).enabled).toBe(false);
  });
});

describe('W212 chaos · fault: wallet.timeout', () => {
  it('throws WalletChaosTimeoutError when chaos fires', async () => {
    const ctrl = new ChaosController({ forceEnabled: true, rng: () => 0 });
    ctrl.enable('wallet.timeout', 1.0);
    let real = 0;
    await expect(
      withWalletTimeoutChaos(
        ctrl,
        async () => {
          real++;
          return 1;
        },
        { timeoutMs: 10, sleep: async () => undefined }
      )
    ).rejects.toBeInstanceOf(WalletChaosTimeoutError);
    expect(real).toBe(0);
  });

  it('passes through when chaos does not fire', async () => {
    const ctrl = new ChaosController({ forceEnabled: true, rng: () => 1 });
    ctrl.enable('wallet.timeout', 0.5);
    const r = await withWalletTimeoutChaos(ctrl, async () => 'ok');
    expect(r).toBe('ok');
  });

  it('setWalletTimeoutChaos toggles', () => {
    const ctrl = new ChaosController({ forceEnabled: true });
    expect(setWalletTimeoutChaos(ctrl, true, 0.2).probability).toBe(0.2);
  });
});

describe('W212 chaos · fault: db.slow-query', () => {
  it('returns delay 0 when chaos does not fire', async () => {
    const ctrl = new ChaosController({ forceEnabled: true, rng: () => 0.99 });
    ctrl.enable('db.slow-query', 0.1);
    const r = await withDbSlowQueryChaos(ctrl, async () => 7);
    expect(r.delayedMs).toBe(0);
    expect(r.value).toBe(7);
  });

  it('injects a delay 200..500ms when chaos fires', async () => {
    const ctrl = new ChaosController({ forceEnabled: true, rng: () => 0 });
    ctrl.enable('db.slow-query', 1.0);
    let slept = 0;
    const r = await withDbSlowQueryChaos(ctrl, async () => 7, {
      rng: fixedRng([0.5]),
      sleep: async (ms) => {
        slept = ms;
      },
    });
    expect(r.delayedMs).toBeGreaterThanOrEqual(200);
    expect(r.delayedMs).toBeLessThanOrEqual(500);
    expect(slept).toBe(r.delayedMs);
  });

  it('pickSlowDelayMs honours bounds', () => {
    const v = pickSlowDelayMs({ minDelayMs: 100, maxDelayMs: 100, rng: () => 0 });
    expect(v).toBe(100);
  });
});

describe('W212 chaos · fault: hsm.key-rotation', () => {
  it('returns rotated keyId when chaos fires', () => {
    const ctrl = new ChaosController({ forceEnabled: true, rng: () => 0 });
    ctrl.enable('hsm.key-rotation', 1.0);
    const r = resolveKeyIdWithChaos(ctrl, 'k-prod-2026');
    expect(r.rotated).toBe(true);
    expect(r.keyId).toBe('k-prod-2026#rotated');
  });

  it('verifyWithRotationChaos surfaces key_rotated', async () => {
    const ctrl = new ChaosController({ forceEnabled: true, rng: () => 0 });
    ctrl.enable('hsm.key-rotation', 1.0);
    const r = await verifyWithRotationChaos(ctrl, 'k-1', async () => 'sig-ok');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('key_rotated');
  });

  it('verifyWithRotationChaos passes when chaos does not fire', async () => {
    const ctrl = new ChaosController({ forceEnabled: true, rng: () => 0.99 });
    ctrl.enable('hsm.key-rotation', 0.01);
    const r = await verifyWithRotationChaos(ctrl, 'k-1', async () => 'sig-ok');
    expect(r.ok).toBe(true);
  });
});

describe('W212 chaos · fault: audit.chain-gap', () => {
  it('observer detects the gap when chaos fires', () => {
    const ctrl = new ChaosController({ forceEnabled: true, rng: () => 0 });
    ctrl.enable('audit.chain-gap', 1.0);
    const chain = buildChain(5);
    expect(verifyChain(chain)).toBeNull();
    const { tampered, brokenAt, triggered } = injectChainGap(ctrl, chain, { rng: () => 0.5 });
    expect(triggered).toBe(true);
    expect(brokenAt).not.toBeNull();
    const verdict = observerVerdict(tampered);
    expect(verdict.ok).toBe(false);
    expect(verdict.brokenAt).toBe(brokenAt);
  });

  it('observer passes when chaos does not fire', () => {
    const ctrl = new ChaosController({ forceEnabled: true, rng: () => 0.99 });
    ctrl.enable('audit.chain-gap', 0.01);
    const chain = buildChain(3);
    const { tampered, triggered } = injectChainGap(ctrl, chain);
    expect(triggered).toBe(false);
    expect(observerVerdict(tampered).ok).toBe(true);
  });
});

describe('W212 chaos · fault: tenant.context-loss', () => {
  it('safeAssertTenant returns reason when context missing', () => {
    const r = safeAssertTenant(() => assertTenantContext());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('tenant_context_missing');
  });

  it('runWithTenantLossChaos uses real context when chaos miss', () => {
    const ctrl = new ChaosController({ forceEnabled: true, rng: () => 0.99 });
    ctrl.enable('tenant.context-loss', 0.0);
    const storage = new AsyncLocalStorage<TenantContext>();
    const r = runWithTenantLossChaos(ctrl, { tenantId: 'acme' }, storage, () => {
      return storage.getStore()?.tenantId ?? null;
    });
    expect(r.lostContext).toBe(false);
    expect(r.value).toBe('acme');
  });

  it('runWithTenantLossChaos drops context when chaos fires', () => {
    const ctrl = new ChaosController({ forceEnabled: true, rng: () => 0 });
    ctrl.enable('tenant.context-loss', 1.0);
    const storage = new AsyncLocalStorage<TenantContext>();
    const r = runWithTenantLossChaos(ctrl, { tenantId: 'acme' }, storage, () => {
      return storage.getStore()?.tenantId ?? null;
    });
    expect(r.lostContext).toBe(true);
    expect(r.value).toBeNull();
  });
});

describe('W212 chaos · admin route', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildTestApp();
  });
  afterEach(async () => {
    await app.close();
    process.env.CHAOS_ENABLED = undefined;
  });

  it('GET /api/admin/chaos returns env + faults list', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/admin/chaos' });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.availableFaults).toEqual(expect.arrayContaining(FAULT_NAMES as unknown as string[]));
    expect(body.faults).toBeInstanceOf(Array);
  });

  it('POST enable returns 403 when chaos env-disabled', async () => {
    delete process.env.CHAOS_ENABLED;
    const r = await app.inject({
      method: 'POST',
      url: '/api/admin/chaos/enable',
      payload: { name: 'cache.miss', probability: 0.5 },
    });
    expect(r.statusCode).toBe(403);
  });

  it('GET requires admin role (403 for guest)', async () => {
    const app2 = await buildTestApp({ defaultRole: 'guest' });
    const r = await app2.inject({ method: 'GET', url: '/api/admin/chaos' });
    expect(r.statusCode).toBe(403);
    await app2.close();
  });
});

// ---- helpers ----

function makeStubCache<T>() {
  const map = new Map<string, T>();
  return {
    get: async (k: string) => (map.has(k) ? map.get(k)! : null),
    set: async (k: string, v: T) => {
      map.set(k, v);
    },
    del: async (k: string) => map.delete(k),
    incr: async () => 0,
    expire: async () => true,
    delByPrefix: async () => 0,
    healthy: async () => true,
    close: async () => {},
    stats: () => ({ hits: 0, misses: 0, sets: 0, deletes: 0, hitRate: 0 }),
    resetStats: () => {},
  };
}

function buildChain(n: number): ChainedEntry[] {
  const out: ChainedEntry[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    const e = sealEntry(
      {
        seq: i,
        timestamp: new Date(2026, 4, 18, 12, 0, i).toISOString(),
        type: 'test',
        payload: { idx: i },
      },
      prev
    );
    out.push(e);
    prev = e.current;
  }
  return out;
}
