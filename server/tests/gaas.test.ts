/**
 * CORTI 200.7-MARKETPLACE — GaaS API tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('GaaS API', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildTestApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('compute-rtp returns an RTP estimate from a well-formed IR', async () => {
    const ir = {
      gameId: 'g1',
      topology: { kind: 'rectangular', reels: 5, rows: 3 },
      symbols: { HP: 3, MP: 3, LP: 3 },
      features: { free_spins: { trigger: 3, count: 10 } },
    };
    const res = await app.inject({ method: 'POST', url: '/api/gaas/compute-rtp', payload: ir });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rtp).toBeGreaterThan(0.85);
    expect(body.rtp).toBeLessThanOrEqual(0.985);
    expect(body.method).toBe('closed-form');
  });

  it('compute-rtp rejects IR missing symbols', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/gaas/compute-rtp',
      payload: { topology: { kind: 'rectangular', reels: 5, rows: 3 } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('compute-rtp honors explicit rtpTarget when within bounds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/gaas/compute-rtp',
      payload: {
        topology: { kind: 'rectangular', reels: 5, rows: 3 },
        symbols: { HP: 3 },
        rtpTarget: 0.96,
      },
    });
    expect(res.json().rtp).toBe(0.96);
  });

  it('render-ir returns runtime config tagged with the gameId', async () => {
    const ir = {
      gameId: 'demo-1',
      topology: { kind: 'rectangular', reels: 5, rows: 3 },
      symbols: { HP: 3, MP: 3, LP: 3 },
    };
    const res = await app.inject({ method: 'POST', url: '/api/gaas/render-ir', payload: ir });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.gameId).toBe('demo-1');
    expect(body.irFile).toContain('demo-1');
    expect(body.uiHints.reels).toBe(5);
  });

  it('render-ir rejects request without gameId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/gaas/render-ir',
      payload: { topology: { kind: 'rectangular', reels: 5, rows: 3 } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('spin endpoint is authoritative — debits wallet and returns balance', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'gp1', jurisdiction: 'MGA' },
    });
    const { sessionId, balanceMinor } = create.json();
    const startBal = balanceMinor;

    const res = await app.inject({
      method: 'POST',
      url: '/api/gaas/spin',
      payload: { gameId: 'test-game-1', sessionId, betAmount: 1.0 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spinId).toMatch(/^gaas-spin-/);
    expect(typeof body.totalWin).toBe('number');
    // balance is in major units, startBal in minor
    expect(body.balance * 100).toBeLessThanOrEqual(startBal);
  });

  it('spin rejects when session unknown', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/gaas/spin',
      payload: { gameId: 'test-game-1', sessionId: 'no-such-session', betAmount: 1.0 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('spin rejects bad bet amount', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'gp2', jurisdiction: 'MGA' },
    });
    const { sessionId } = create.json();
    const res = await app.inject({
      method: 'POST',
      url: '/api/gaas/spin',
      payload: { gameId: 'test-game-1', sessionId, betAmount: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('seamless handshake returns wallet+spin endpoints + public key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/gaas/seamless?operatorId=opX',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.operatorId).toBe('opX');
    expect(body.walletEndpoint).toContain('/api/wallet');
    expect(body.spinEndpoint).toContain('/api/gaas/spin');
    expect(body.publicKey).toHaveLength(64);
  });

  it('seamless requires operatorId', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/gaas/seamless' });
    expect(res.statusCode).toBe(400);
  });

  it('live endpoint returns session events with cursor', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'gp3', jurisdiction: 'MGA' },
    });
    const { sessionId } = create.json();
    // trigger one spin to generate audit events
    await app.inject({
      method: 'POST',
      url: '/api/gaas/spin',
      payload: { gameId: 'test-game-1', sessionId, betAmount: 1.0 },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/gaas/live?sessionId=${sessionId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessionId).toBe(sessionId);
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThan(0);
    expect(typeof body.cursor).toBe('number');
  });
});
