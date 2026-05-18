/**
 * CORTI 200.4-BACKEND — lobby endpoints.
 *
 *  GET  /api/lobby/games
 *  POST /api/lobby/launch
 */

import type { FastifyInstance } from 'fastify';
import { sha256Hex } from '../lib/hashChain.js';
import type { GamesRegistry } from '../state/games.js';
import type { SessionStore } from '../state/sessions.js';
import { requireRole } from '../state/rbac.js';
import { createCache, type Cache } from '../lib/cache.js';

export interface LobbyRouteDeps {
  games: GamesRegistry;
  sessions: SessionStore;
  /** Optional shared cache (per-tenant lobby list). */
  cache?: Cache<unknown>;
  /** TTL override for the lobby list (default 60s). */
  cacheTtlMs?: number;
}

/** Cache key for lobby list — namespaced per tenant + filters. */
function lobbyCacheKey(tenantId: string, jurisdiction?: string, category?: string): string {
  return `lobby:${tenantId}:${jurisdiction ?? '*'}:${category ?? '*'}`;
}

/** Exported so other modules (e.g. games admin) can invalidate. */
export function invalidateLobbyCache(cache: Cache<unknown>, tenantId?: string): Promise<number> {
  if (tenantId) return cache.delByPrefix(`lobby:${tenantId}:`);
  return cache.delByPrefix('lobby:');
}

interface LaunchBody {
  gameId: string;
  sessionId: string;
}

export async function registerLobbyRoutes(
  app: FastifyInstance,
  deps: LobbyRouteDeps
): Promise<void> {
  const cache: Cache<unknown> = deps.cache ?? createCache<unknown>({ namespace: 'svc' });
  const ttlMs = deps.cacheTtlMs ?? 60_000;

  app.get<{ Querystring: { jurisdiction?: string; category?: string } }>(
    '/api/lobby/games',
    async (req, reply) => {
      const jurisdiction = req.query.jurisdiction;
      const category = req.query.category;
      const tenantId = req.tenant?.id ?? 'default';
      const key = lobbyCacheKey(tenantId, jurisdiction, category);
      const cached = (await cache.get(key)) as null | { games: unknown[]; count: number };
      if (cached) {
        reply.header('x-cache', 'HIT');
        return reply.send(cached);
      }
      deps.games.load();
      let games = deps.games.list();
      if (jurisdiction) {
        games = games.filter((g) => g.jurisdictions.includes(jurisdiction));
      }
      if (category) {
        games = games.filter((g) => g.category === category);
      }
      const payload = {
        games: games.map((g) => ({
          id: g.id,
          title: g.title,
          supplier: g.supplier,
          year: g.year,
          topology: g.topology,
          mGap: g.mGap,
          category: g.category,
          rtp: g.rtp,
          jurisdictions: g.jurisdictions,
          thumbnail: g.thumbnail ?? `/thumbnails/${g.id}.png`,
        })),
        count: games.length,
      };
      await cache.set(key, payload, { ttlMs });
      reply.header('x-cache', 'MISS');
      return reply.send(payload);
    }
  );

  // Explicit invalidation hook (called by games admin / install pipeline).
  app.post('/api/lobby/_invalidate', { preHandler: requireRole('admin') }, async (req, reply) => {
    const n = await invalidateLobbyCache(cache, req.tenant?.id);
    return reply.send({ ok: true, evicted: n });
  });

  // CORTI W206-SECURITY — lobby.launch consumes a session so requires player+.
  app.post<{ Body: LaunchBody }>('/api/lobby/launch', { preHandler: requireRole('player') }, async (req, reply) => {
    const body = req.body ?? ({} as LaunchBody);
    if (!body.gameId || !body.sessionId) {
      return reply.code(400).send({ error: 'gameId_and_sessionId_required' });
    }
    deps.games.load();
    const game = deps.games.byId(body.gameId);
    if (!game) return reply.code(404).send({ error: 'game_not_found' });
    const session = deps.sessions.get(body.sessionId);
    if (!session) return reply.code(404).send({ error: 'session_not_found' });
    if (session.closed) return reply.code(403).send({ error: 'session_closed' });
    if (!game.jurisdictions.includes(session.jurisdiction)) {
      return reply.code(403).send({ error: 'game_not_allowed_in_jurisdiction' });
    }
    const sessionToken = sha256Hex(`${session.sessionId}:${game.id}:${Date.now()}`);
    return reply.send({
      launchUrl: `/play/${game.id}?session=${session.sessionId}&token=${sessionToken.slice(0, 16)}`,
      gameConfig: {
        gameId: game.id,
        irFile: game.irFile,
        rtp: game.rtp,
        topology: game.topology,
      },
      sessionToken,
    });
  });
}
