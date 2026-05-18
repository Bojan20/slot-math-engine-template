import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('Wallet API', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildTestApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns starting balance for new player', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/wallet/p1/balance',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.playerId).toBe('p1');
    expect(body.balanceMinor).toBeGreaterThan(0);
    expect(body.currency).toBe('EUR');
  });

  it('deposit approves under threshold', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallet/p2/deposit',
      payload: { amountMinor: 5_000, ref: 'psp-1' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('approved');
    expect(body.transactionId).toMatch(/^tx-/);
  });

  it('deposit large amount returns pending', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallet/p3/deposit',
      payload: { amountMinor: 10_000_000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('pending');
  });

  it('deposit with invalid amount returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallet/p4/deposit',
      payload: { amountMinor: -5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('balance reflects deposit', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/wallet/p5/deposit',
      payload: { amountMinor: 25_000 },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/wallet/p5/balance',
    });
    expect(res.json().balanceMinor).toBe(100_000 + 25_000);
  });

  it('withdraw approves when funds sufficient', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/wallet/p6/deposit',
      payload: { amountMinor: 10_000 },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallet/p6/withdraw',
      payload: { amountMinor: 5_000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('approved');
  });

  it('withdraw declines when insufficient funds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallet/p7/withdraw',
      payload: { amountMinor: 999_999_999 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('declined');
    expect(res.json().reason).toBe('insufficient_funds');
  });

  it('transactions list reflects history', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/wallet/p8/deposit',
      payload: { amountMinor: 1_000 },
    });
    await app.inject({
      method: 'POST',
      url: '/api/wallet/p8/deposit',
      payload: { amountMinor: 2_000 },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/wallet/p8/transactions',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(2);
    expect(body.transactions[0].kind).toBe('deposit');
  });

  it('atomic deposit balance increment is exact (no float drift)', async () => {
    for (let i = 0; i < 10; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/wallet/pAtom/deposit',
        payload: { amountMinor: 137 },
      });
    }
    const res = await app.inject({
      method: 'GET',
      url: '/api/wallet/pAtom/balance',
    });
    expect(res.json().balanceMinor).toBe(100_000 + 10 * 137);
  });
});
