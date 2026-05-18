/**
 * W210 Faza 600.0 — wallet orchestrator integration tests.
 *
 * The orchestrator is the bridge between game flow and provider
 * connectors. Tests cover:
 *   - provider resolution from tenant config
 *   - happy-path spin flow (debit → game → credit)
 *   - rollback on game failure
 *   - rollback when credit fails
 *   - idempotency reference round-trip
 *   - aggregated healthcheck with 30s cache
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MockHttpClient } from '../lib/wallet/http.js';
import { WalletOrchestrator } from '../lib/wallet/orchestrator.js';
import { TenantWalletConfigStore } from '../state/tenant-wallet-config.js';
import { createCache } from '../lib/cache.js';
import { WalletProviderError } from '../lib/wallet/types.js';

const CFG = {
  baseUrl: 'https://pam.example.test',
  apiSecret: 'sekrit',
  operatorId: 'op-1',
};

function buildOrchestrator(http: MockHttpClient): {
  orch: WalletOrchestrator;
  configs: TenantWalletConfigStore;
} {
  const configs = new TenantWalletConfigStore();
  const orch = new WalletOrchestrator({
    configStore: configs,
    http,
    healthCache: createCache({ namespace: 'test-health' }),
  });
  return { orch, configs };
}

describe('WalletOrchestrator — resolution', () => {
  it('throws auth_failed when tenant has no config', async () => {
    const http = new MockHttpClient();
    const { orch } = buildOrchestrator(http);
    expect(() => orch.resolveProvider('missing')).toThrow();
  });

  it('resolves provider from tenant config', () => {
    const http = new MockHttpClient();
    const { orch, configs } = buildOrchestrator(http);
    configs.setTenantWalletConfig('t1', 'generic-pam', CFG);
    const p = orch.resolveProvider('t1');
    expect(p.name).toBe('generic-pam');
  });

  it('reuses cached provider instance', () => {
    const http = new MockHttpClient();
    const { orch, configs } = buildOrchestrator(http);
    configs.setTenantWalletConfig('t1', 'generic-pam', CFG);
    const a = orch.resolveProvider('t1');
    const b = orch.resolveProvider('t1');
    expect(a).toBe(b);
  });

  it('invalidate() drops cached instance', () => {
    const http = new MockHttpClient();
    const { orch, configs } = buildOrchestrator(http);
    configs.setTenantWalletConfig('t1', 'generic-pam', CFG);
    const a = orch.resolveProvider('t1');
    orch.invalidate('t1');
    const b = orch.resolveProvider('t1');
    expect(a).not.toBe(b);
  });
});

describe('WalletOrchestrator — spin flow', () => {
  let http: MockHttpClient;
  let orch: WalletOrchestrator;
  let configs: TenantWalletConfigStore;

  beforeEach(() => {
    http = new MockHttpClient();
    const built = buildOrchestrator(http);
    orch = built.orch;
    configs = built.configs;
    configs.setTenantWalletConfig('t1', 'generic-pam', CFG);
  });

  it('debit → game ok with no win commits without credit', async () => {
    http.onPath('POST', '/debit', {
      status: 200,
      body: { providerTxId: 'd1', balanceAfter: 9000, timestamp: 't' },
    });
    const res = await orch.runSpinFlow({
      tenantId: 't1',
      playerToken: 'tok',
      bet: 1000,
      currency: 'EUR',
      ref: 'spin-1',
      playSpin: async () => ({ winAmount: 0 }),
    });
    expect(res.committed).toBe(true);
    expect(res.debit.ref).toBe('spin-1');
    expect(res.credit).toBeUndefined();
  });

  it('debit → game ok with win credits', async () => {
    http.onPath('POST', '/debit', {
      status: 200,
      body: { providerTxId: 'd1', balanceAfter: 9000, timestamp: 't' },
    });
    http.onPath('POST', '/credit', {
      status: 200,
      body: { providerTxId: 'c1', balanceAfter: 11500, timestamp: 't' },
    });
    const res = await orch.runSpinFlow({
      tenantId: 't1',
      playerToken: 'tok',
      bet: 1000,
      currency: 'EUR',
      ref: 'spin-2',
      playSpin: async () => ({ winAmount: 2500 }),
    });
    expect(res.committed).toBe(true);
    expect(res.credit!.ref).toBe('spin-2-win');
    expect(res.credit!.amount).toBe(2500);
  });

  it('rolls back when game throws', async () => {
    http.onPath('POST', '/debit', {
      status: 200,
      body: { providerTxId: 'd1', balanceAfter: 9000, timestamp: 't' },
    });
    http.onPath('POST', '/rollback', {
      status: 200,
      body: {
        providerTxId: 'r1',
        amount: 1000,
        currency: 'EUR',
        balanceAfter: 10000,
        timestamp: 't',
      },
    });
    const res = await orch.runSpinFlow({
      tenantId: 't1',
      playerToken: 'tok',
      bet: 1000,
      currency: 'EUR',
      ref: 'spin-3',
      playSpin: async () => {
        throw new Error('rng_fault');
      },
    });
    expect(res.committed).toBe(false);
    expect(res.errorCode).toBe('game_failed');
    expect(res.rollback?.kind).toBe('rollback');
  });

  it('rolls back when credit fails after a winning spin', async () => {
    http.onPath('POST', '/debit', {
      status: 200,
      body: { providerTxId: 'd1', balanceAfter: 9000, timestamp: 't' },
    });
    http.onPath('POST', '/credit', {
      status: 500,
      body: 'oops',
    });
    http.onPath('POST', '/rollback', {
      status: 200,
      body: {
        providerTxId: 'r1',
        amount: 1000,
        currency: 'EUR',
        balanceAfter: 10000,
        timestamp: 't',
      },
    });
    const res = await orch.runSpinFlow({
      tenantId: 't1',
      playerToken: 'tok',
      bet: 1000,
      currency: 'EUR',
      ref: 'spin-4',
      playSpin: async () => ({ winAmount: 500 }),
    });
    expect(res.committed).toBe(false);
    expect(res.rollback?.kind).toBe('rollback');
  });

  it('bails out cleanly on debit failure', async () => {
    http.onPath('POST', '/debit', {
      status: 400,
      body: { error: 'insufficient_funds', message: 'low' },
    });
    const res = await orch.runSpinFlow({
      tenantId: 't1',
      playerToken: 'tok',
      bet: 1_000_000,
      currency: 'EUR',
      ref: 'spin-5',
      playSpin: async () => ({ winAmount: 0 }),
    });
    expect(res.committed).toBe(false);
    expect(res.errorCode).toBe('insufficient_funds');
  });

  it('idempotency ref round-trips into debit + credit', async () => {
    http.onPath('POST', '/debit', {
      status: 200,
      body: { providerTxId: 'd1', balanceAfter: 9000, timestamp: 't' },
    });
    http.onPath('POST', '/credit', {
      status: 200,
      body: { providerTxId: 'c1', balanceAfter: 9100, timestamp: 't' },
    });
    const res = await orch.runSpinFlow({
      tenantId: 't1',
      playerToken: 'tok',
      bet: 1000,
      currency: 'EUR',
      ref: 'idemp-abc',
      playSpin: async () => ({ winAmount: 100 }),
    });
    const debitBody = JSON.parse(http.calls[0].body!) as { ref: string };
    const creditBody = JSON.parse(http.calls[1].body!) as { ref: string };
    expect(debitBody.ref).toBe('idemp-abc');
    expect(creditBody.ref).toBe('idemp-abc-win');
    expect(res.credit!.ref).toBe('idemp-abc-win');
  });
});

describe('WalletOrchestrator — healthcheck', () => {
  it('reports per-tenant health and caches for 30s', async () => {
    const http = new MockHttpClient();
    const { orch, configs } = buildOrchestrator(http);
    configs.setTenantWalletConfig('t1', 'generic-pam', CFG);
    configs.setTenantWalletConfig('t2', 'generic-pam', CFG);
    http.onPath('GET', '/health', { status: 200, body: {} });
    http.onPath('GET', '/health', { status: 503, body: 'down' });

    const r1 = await orch.runHealthChecks();
    expect(r1.length).toBe(2);
    expect(r1[0].cached).toBe(false);
    expect(r1[1].cached).toBe(false);

    // Re-check: cached responses, no new http calls
    const callsBefore = http.calls.length;
    const r2 = await orch.runHealthChecks();
    expect(r2.every((r) => r.cached)).toBe(true);
    expect(http.calls.length).toBe(callsBefore);
  });

  it('records per-tenant health status on the config', async () => {
    const http = new MockHttpClient();
    const { orch, configs } = buildOrchestrator(http);
    configs.setTenantWalletConfig('t1', 'generic-pam', CFG);
    http.onPath('GET', '/health', { status: 200, body: {} });
    await orch.runHealthChecks();
    const c = configs.getTenantWalletConfig('t1')!;
    expect(c.healthStatus).toBe('healthy');
    expect(c.lastCheckAt).not.toBeNull();
  });
});

describe('WalletProviderError integration', () => {
  it('throws when no tenant configured', () => {
    const http = new MockHttpClient();
    const { orch } = buildOrchestrator(http);
    try {
      orch.resolveProvider('unknown');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(WalletProviderError);
      expect((e as WalletProviderError).code).toBe('auth_failed');
    }
  });
});
