import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('Session API', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildTestApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('creates a session with playerId + default jurisdiction', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'p1' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.playerId).toBe('p1');
    expect(body.sessionId).toMatch(/^sess-/);
    expect(body.jurisdiction).toBe('GENERIC');
    expect(body.balanceMinor).toBeGreaterThan(0);
  });

  it('rejects session create without playerId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates UKGC session with custom loss limit', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'p2', jurisdiction: 'UKGC', lossLimitMinor: 10_000 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.jurisdiction).toBe('UKGC');
    expect(body.lossLimitMinor).toBe(10_000);
  });

  it('GETs a session by id', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'p3' },
    });
    const { sessionId } = create.json();
    const res = await app.inject({
      method: 'GET',
      url: `/api/session/${sessionId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().sessionId).toBe(sessionId);
  });

  it('returns 404 for unknown session id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/session/sess-bogus',
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE returns close summary', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'p4' },
    });
    const { sessionId } = create.json();
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/session/${sessionId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.closed).toBe(true);
    expect(body.totalWageredMinor).toBe(0);
  });

  it('spin succeeds and updates balance + audit', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'p5', jurisdiction: 'MGA' },
    });
    const { sessionId, balanceMinor } = create.json();
    const res = await app.inject({
      method: 'POST',
      url: `/api/session/${sessionId}/spin`,
      payload: { gameId: 'test-game-1', betMinor: 100 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spinId).toMatch(/^spin-/);
    expect(typeof body.merkleCommit).toBe('string');
    expect(body.merkleCommit).toHaveLength(64);
    expect(body.balanceMinor).toBeLessThanOrEqual(balanceMinor + 1000);
  });

  it('UKGC bans autoplay flag on spin', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'pUk', jurisdiction: 'UKGC' },
    });
    const { sessionId } = create.json();
    const res = await app.inject({
      method: 'POST',
      url: `/api/session/${sessionId}/spin`,
      payload: { gameId: 'test-game-1', betMinor: 100, autoplay: true },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('autoplay_banned_in_jurisdiction');
  });

  it('UKGC enforces 2500ms spin pacing', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'pUk2', jurisdiction: 'UKGC' },
    });
    const { sessionId } = create.json();
    const first = await app.inject({
      method: 'POST',
      url: `/api/session/${sessionId}/spin`,
      payload: { gameId: 'test-game-1', betMinor: 100 },
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: 'POST',
      url: `/api/session/${sessionId}/spin`,
      payload: { gameId: 'test-game-1', betMinor: 100 },
    });
    expect(second.statusCode).toBe(403);
    expect(second.json().error).toBe('spin_pacing_violation');
    expect(second.json().waitMs).toBeGreaterThan(0);
  });

  it('spin returns 403 for game disallowed in jurisdiction', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'pUk3', jurisdiction: 'UKGC' },
    });
    const { sessionId } = create.json();
    // test-game-2 is MGA+NJ only.
    const res = await app.inject({
      method: 'POST',
      url: `/api/session/${sessionId}/spin`,
      payload: { gameId: 'test-game-2', betMinor: 100 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('game_not_allowed_in_jurisdiction');
  });

  it('spin returns 400 for invalid bet', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'p6' },
    });
    const { sessionId } = create.json();
    const res = await app.inject({
      method: 'POST',
      url: `/api/session/${sessionId}/spin`,
      payload: { gameId: 'test-game-1', betMinor: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('spin against closed session returns 403', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'p7' },
    });
    const { sessionId } = create.json();
    await app.inject({
      method: 'DELETE',
      url: `/api/session/${sessionId}`,
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/session/${sessionId}/spin`,
      payload: { gameId: 'test-game-1', betMinor: 100 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('session_closed');
  });

  it('spin with insufficient funds returns 402', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'pPoor' },
    });
    const { sessionId } = create.json();
    const res = await app.inject({
      method: 'POST',
      url: `/api/session/${sessionId}/spin`,
      payload: { gameId: 'test-game-1', betMinor: 999_999_999 },
    });
    expect(res.statusCode).toBe(402);
  });
});
