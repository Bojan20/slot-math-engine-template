/**
 * W210 Faza 600.0 — wallet provider adapter tests.
 *
 * Exercises every connector through MockHttpClient, covering:
 *   - HMAC signature shape
 *   - auth / balance / debit / credit / rollback / healthcheck happy paths
 *   - error mapping (auth_failed / insufficient_funds / duplicate_ref /
 *     unknown_ref / provider_timeout / invalid_signature)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MockHttpClient } from '../lib/wallet/http.js';
import {
  genericPamFactory,
  hmacSign,
} from '../lib/wallet/providers/generic-pam.js';
import { microgamingStyleFactory } from '../lib/wallet/providers/microgaming-style.js';
import { netentAggregatorFactory } from '../lib/wallet/providers/netent-aggregator.js';
import { playtechStyleFactory } from '../lib/wallet/providers/playtech-style.js';
import { WalletProviderError } from '../lib/wallet/types.js';

const CFG = {
  baseUrl: 'https://wallet.example.test',
  apiSecret: 'secret-shhhh',
  operatorId: 'op-1',
};

// ───────────────────────────────────────────────────────────── generic-pam
describe('generic-pam provider', () => {
  let http: MockHttpClient;
  let p: ReturnType<typeof genericPamFactory>;
  beforeEach(() => {
    http = new MockHttpClient();
    p = genericPamFactory({ ...CFG }, http);
  });

  it('authenticate parses claims + sends X-Signature header', async () => {
    http.onPath('POST', '/auth', {
      status: 200,
      body: {
        playerId: 'p1',
        tenantId: 't1',
        jurisdiction: 'UKGC',
        currency: 'EUR',
      },
    });
    const claims = await p.authenticate('user-jwt');
    expect(claims.playerId).toBe('p1');
    expect(claims.tenantId).toBe('t1');
    expect(claims.jurisdiction).toBe('UKGC');
    expect(http.calls[0].headers!['x-signature']).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hmacSign produces deterministic hex', () => {
    const sig = hmacSign('POST', '/debit', '{"amount":1}', 'k');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(sig).toBe(hmacSign('POST', '/debit', '{"amount":1}', 'k'));
  });

  it('debit returns tx with ref round-trip', async () => {
    http.onPath('POST', '/debit', {
      status: 200,
      body: { providerTxId: 'tx-1', balanceAfter: 9000, timestamp: '2026-05-18T10:00:00Z' },
    });
    const tx = await p.debit('tok', 1000, 'EUR', 'spin-42');
    expect(tx.kind).toBe('debit');
    expect(tx.ref).toBe('spin-42');
    expect(tx.balanceAfter).toBe(9000);
  });

  it('credit returns tx', async () => {
    http.onPath('POST', '/credit', {
      status: 200,
      body: { providerTxId: 'tx-2', balanceAfter: 10500, timestamp: '2026-05-18T10:00:01Z' },
    });
    const tx = await p.credit('tok', 1500, 'EUR', 'win-42');
    expect(tx.kind).toBe('credit');
    expect(tx.balanceAfter).toBe(10500);
  });

  it('rollback echoes original ref', async () => {
    http.onPath('POST', '/rollback', {
      status: 200,
      body: {
        providerTxId: 'tx-3',
        amount: 1000,
        currency: 'EUR',
        balanceAfter: 10000,
        timestamp: 't',
      },
    });
    const tx = await p.rollback('spin-42');
    expect(tx.kind).toBe('rollback');
    expect(tx.ref).toBe('spin-42');
  });

  it('insufficient_funds maps from server error code', async () => {
    http.onPath('POST', '/debit', {
      status: 400,
      body: { error: 'insufficient_funds', message: 'low balance' },
    });
    await expect(p.debit('tok', 999999, 'EUR', 's-1')).rejects.toMatchObject({
      code: 'insufficient_funds',
    });
  });

  it('duplicate_ref error maps cleanly', async () => {
    http.onPath('POST', '/debit', {
      status: 409,
      body: { error: 'duplicate_ref', message: 'replay' },
    });
    await expect(p.debit('tok', 100, 'EUR', 's-1')).rejects.toMatchObject({
      code: 'duplicate_ref',
    });
  });

  it('timeout maps to provider_timeout', async () => {
    http.onPath('POST', '/debit', { status: 0, body: '', timeout: true });
    await expect(p.debit('tok', 100, 'EUR', 's-1')).rejects.toMatchObject({
      code: 'provider_timeout',
    });
  });

  it('5xx maps to provider_unavailable', async () => {
    http.onPath('POST', '/debit', { status: 503, body: 'down' });
    await expect(p.debit('tok', 100, 'EUR', 's-1')).rejects.toMatchObject({
      code: 'provider_unavailable',
    });
  });

  it('healthcheck ok', async () => {
    http.onPath('GET', '/health', { status: 200, body: { ok: true } });
    const h = await p.healthcheck();
    expect(h.ok).toBe(true);
    expect(h.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('healthcheck failure returns ok:false', async () => {
    http.onPath('GET', '/health', { status: 503, body: 'no' });
    const h = await p.healthcheck();
    expect(h.ok).toBe(false);
  });
});

// ────────────────────────────────────────────────────── microgaming-style
describe('microgaming-style provider', () => {
  let http: MockHttpClient;
  let p: ReturnType<typeof microgamingStyleFactory>;
  beforeEach(() => {
    http = new MockHttpClient();
    p = microgamingStyleFactory({ ...CFG }, http);
  });

  it('authenticate uses sessionId path', async () => {
    http.onPath('POST', '/session/validate', {
      status: 200,
      body: { playerId: 'p1', brandId: 'b1', jurisdiction: 'MGA', currency: 'EUR' },
    });
    const claims = await p.authenticate('session-abc');
    expect(claims.playerId).toBe('p1');
    expect(claims.tenantId).toBe('b1');
  });

  it('balance returns cash+bonus split', async () => {
    http.onPath('POST', '/purse/get', {
      status: 200,
      body: { cashBalance: 8000, bonusBalance: 2000, currency: 'EUR' },
    });
    const b = await p.getBalance('s');
    expect(b.amount).toBe(8000);
    expect(b.bonus).toBe(2000);
  });

  it('debit sums cash+bonus into balanceAfter', async () => {
    http.onPath('POST', '/purse/debit', {
      status: 200,
      body: { txId: 'tx-1', cashBalance: 7000, bonusBalance: 2000, timestamp: 't' },
    });
    const tx = await p.debit('s', 1000, 'EUR', 'ref-1');
    expect(tx.balanceAfter).toBe(9000);
  });

  it('insufficient_cash maps to insufficient_funds', async () => {
    http.onPath('POST', '/purse/debit', {
      status: 400,
      body: { errorCode: 'INSUFFICIENT_CASH', description: 'low' },
    });
    await expect(p.debit('s', 100, 'EUR', 'r-1')).rejects.toMatchObject({
      code: 'insufficient_funds',
    });
  });

  it('session-invalid maps to auth_failed', async () => {
    http.onPath('POST', '/session/validate', {
      status: 401,
      body: { errorCode: 'SESSION_INVALID' },
    });
    await expect(p.authenticate('bad')).rejects.toMatchObject({ code: 'auth_failed' });
  });

  it('healthcheck ok', async () => {
    http.onPath('GET', '/health', { status: 200, body: { ok: true } });
    expect((await p.healthcheck()).ok).toBe(true);
  });

  it('rollback works', async () => {
    http.onPath('POST', '/purse/rollback', {
      status: 200,
      body: {
        txId: 'tx-r',
        amount: 1000,
        currency: 'EUR',
        cashBalance: 9000,
        bonusBalance: 1000,
        timestamp: 't',
      },
    });
    const tx = await p.rollback('orig');
    expect(tx.balanceAfter).toBe(10000);
  });
});

// ────────────────────────────────────────────────────── netent-aggregator
describe('netent-aggregator provider', () => {
  let http: MockHttpClient;
  let p: ReturnType<typeof netentAggregatorFactory>;
  beforeEach(() => {
    http = new MockHttpClient();
    p = netentAggregatorFactory({ ...CFG }, http);
  });

  it('sends Idempotency-Key header', async () => {
    http.onPath('POST', '/v2/tx/debit', {
      status: 200,
      body: { txId: 'tx-1', balanceAfter: 5000, timestamp: 't' },
    });
    await p.debit('p1', 100, 'EUR', 'ref-1');
    expect(http.calls[0].headers!['idempotency-key']).toMatch(/^[a-f0-9]{32}$/);
  });

  it('authenticate via JWT', async () => {
    http.onPath('POST', '/v2/identify', {
      status: 200,
      body: { playerRef: 'p1', brandId: 'b1', jurisdiction: 'SE', baseCurrency: 'SEK' },
    });
    const claims = await p.authenticate('jwt-token');
    expect(claims.currency).toBe('SEK');
  });

  it('currency.mismatch maps cleanly', async () => {
    http.onPath('POST', '/v2/tx/debit', {
      status: 400,
      body: { code: 'currency.mismatch', description: 'no' },
    });
    await expect(p.debit('p', 100, 'USD', 'r-1')).rejects.toMatchObject({
      code: 'invalid_currency',
    });
  });

  it('signature.invalid maps to invalid_signature', async () => {
    http.onPath('POST', '/v2/identify', {
      status: 401,
      body: { code: 'signature.invalid' },
    });
    await expect(p.authenticate('jwt')).rejects.toMatchObject({
      code: 'invalid_signature',
    });
  });

  it('healthcheck ok', async () => {
    http.onPath('GET', '/v2/ping', { status: 200, body: {} });
    expect((await p.healthcheck()).ok).toBe(true);
  });

  it('rollback works', async () => {
    http.onPath('POST', '/v2/tx/rollback', {
      status: 200,
      body: {
        txId: 't',
        amount: 100,
        currency: 'EUR',
        balanceAfter: 5100,
        timestamp: 't',
      },
    });
    expect((await p.rollback('r')).balanceAfter).toBe(5100);
  });
});

// ───────────────────────────────────────────────────────── playtech-style
describe('playtech-style provider', () => {
  let http: MockHttpClient;
  let p: ReturnType<typeof playtechStyleFactory>;
  beforeEach(() => {
    http = new MockHttpClient();
    p = playtechStyleFactory({ ...CFG, operatorId: 'brand-1' }, http);
  });

  it('authenticate stamps cashier session header', async () => {
    http.onPath('POST', '/ims/v1/session/auth', {
      status: 200,
      body: {
        player_id: 'pX',
        brand_id: 'brand-1',
        jurisdiction: 'NJ',
        currency: 'USD',
      },
    });
    await p.authenticate('cashier-sess-1');
    expect(http.calls[0].headers!['x-cashier-session']).toBe('cashier-sess-1');
    expect(http.calls[0].headers!['x-brand-id']).toBe('brand-1');
  });

  it('debit uses snake_case payload', async () => {
    http.onPath('POST', '/ims/v1/session/auth', {
      status: 200,
      body: {
        player_id: 'pX',
        brand_id: 'brand-1',
        jurisdiction: 'NJ',
        currency: 'USD',
      },
    });
    http.onPath('POST', '/ims/v1/wallet/debit', {
      status: 200,
      body: { provider_txn_id: 'tx-1', balance_after: 4000, timestamp: 't' },
    });
    await p.authenticate('cashier-sess-1');
    const tx = await p.debit('pX', 100, 'USD', 'ref-1');
    expect(tx.balanceAfter).toBe(4000);
    const body = JSON.parse(http.calls[1].body!) as Record<string, unknown>;
    expect(body['player_id']).toBe('pX');
    expect(body['txn_id']).toBe('ref-1');
  });

  it('LOW_BALANCE maps to insufficient_funds', async () => {
    http.onPath('POST', '/ims/v1/wallet/debit', {
      status: 400,
      body: { error_code: 'LOW_BALANCE', message: 'no money' },
    });
    await expect(p.debit('p', 1, 'USD', 'r')).rejects.toMatchObject({
      code: 'insufficient_funds',
    });
  });

  it('SIG_INVALID maps to invalid_signature', async () => {
    http.onPath('POST', '/ims/v1/wallet/credit', {
      status: 401,
      body: { error_code: 'SIG_INVALID' },
    });
    await expect(p.credit('p', 1, 'USD', 'r')).rejects.toMatchObject({
      code: 'invalid_signature',
    });
  });

  it('healthcheck ok', async () => {
    http.onPath('GET', '/ims/v1/system/health', { status: 200, body: {} });
    expect((await p.healthcheck()).ok).toBe(true);
  });

  it('rollback works', async () => {
    http.onPath('POST', '/ims/v1/wallet/reverse', {
      status: 200,
      body: {
        provider_txn_id: 'tx-r',
        amount: 100,
        currency: 'USD',
        balance_after: 5100,
        timestamp: 't',
      },
    });
    expect((await p.rollback('ref')).balanceAfter).toBe(5100);
  });
});

// ────────────────────────────────────────────────────────────── shared
describe('WalletProviderError', () => {
  it('preserves provider name + http status', () => {
    const e = new WalletProviderError({
      code: 'auth_failed',
      message: 'nope',
      providerName: 'x',
      httpStatus: 401,
    });
    expect(e.code).toBe('auth_failed');
    expect(e.providerName).toBe('x');
    expect(e.httpStatus).toBe(401);
  });
});
