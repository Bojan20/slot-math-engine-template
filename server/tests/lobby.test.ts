import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('Lobby API', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildTestApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('lists all registered games', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/lobby/games',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBeGreaterThanOrEqual(2);
    expect(body.games[0]).toHaveProperty('id');
    expect(body.games[0]).toHaveProperty('rtp');
  });

  it('filters by jurisdiction (UKGC excludes test-game-2)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/lobby/games?jurisdiction=UKGC',
    });
    const body = res.json();
    const ids = body.games.map((g: { id: string }) => g.id);
    expect(ids).toContain('test-game-1');
    expect(ids).not.toContain('test-game-2');
  });

  it('filters by category', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/lobby/games?category=lw-mgaps',
    });
    const body = res.json();
    expect(body.games.every((g: { category: string }) => g.category === 'lw-mgaps')).toBe(true);
  });

  it('launch returns 400 when missing inputs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/lobby/launch',
      payload: { gameId: 'test-game-1' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('launch returns 404 for unknown game', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'pL1' },
    });
    const { sessionId } = create.json();
    const res = await app.inject({
      method: 'POST',
      url: '/api/lobby/launch',
      payload: { gameId: 'no-such-game', sessionId },
    });
    expect(res.statusCode).toBe(404);
  });

  it('launch returns config + session token for valid pair', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'pL2', jurisdiction: 'MGA' },
    });
    const { sessionId } = create.json();
    const res = await app.inject({
      method: 'POST',
      url: '/api/lobby/launch',
      payload: { gameId: 'test-game-1', sessionId },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.launchUrl).toContain(sessionId);
    expect(body.sessionToken).toHaveLength(64);
    expect(body.gameConfig.gameId).toBe('test-game-1');
  });

  it('launch rejects game disallowed in session jurisdiction', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/session/create',
      payload: { playerId: 'pL3', jurisdiction: 'UKGC' },
    });
    const { sessionId } = create.json();
    const res = await app.inject({
      method: 'POST',
      url: '/api/lobby/launch',
      payload: { gameId: 'test-game-2', sessionId },
    });
    expect(res.statusCode).toBe(403);
  });
});
