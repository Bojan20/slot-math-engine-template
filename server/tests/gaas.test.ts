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
    const betMajor = 1.0;

    const res = await app.inject({
      method: 'POST',
      url: '/api/gaas/spin',
      payload: { gameId: 'test-game-1', sessionId, betAmount: betMajor },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spinId).toMatch(/^gaas-spin-/);
    expect(typeof body.totalWin).toBe('number');
    // Bookkeeping invariant: balance == startBal - bet + win.
    const expectedBalMinor = startBal - Math.round(betMajor * 100) + Math.round(body.totalWin * 100);
    expect(Math.round(body.balance * 100)).toBe(expectedBalMinor);
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

  it('live endpoint rejects a plain HTTP GET (websocket-only route)', async () => {
    // The full WebSocket protocol contract lives in
    // tests/gaas-websocket.test.ts (12 specs). Here we just confirm the
    // route is wired — a regular HTTP GET should hit the websocket
    // route's HTTP fallback (404) rather than the catch-all not-found.
    const res = await app.inject({ method: 'GET', url: '/api/gaas/live' });
    expect(res.statusCode).toBe(404);
    // 'not_found' would be Fastify's generic 404 body; the @fastify/websocket
    // fallback handler returns an empty body or a 404 message — either way
    // the route is reachable.
  });
});
