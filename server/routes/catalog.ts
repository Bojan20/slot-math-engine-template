/**
 * W208 Faza 400.1 — Catalog read endpoint.
 *
 *   GET  /api/catalog                 → full catalog (cached 5 min)
 *   GET  /api/catalog/:gameId         → single entry (cached 5 min)
 *   POST /api/catalog/_invalidate     → drop the per-tenant catalog cache
 *
 * The catalog read is heavy enough on cold start (full IR-library JSON
 * traversal) to be worth caching aggressively; it changes only when the
 * games registry is updated.
 */

import type { FastifyInstance } from 'fastify';
import type { GamesRegistry } from '../state/games.js';
import { createCache, type Cache } from '../lib/cache.js';
import { requireRole } from '../state/rbac.js';

export interface CatalogRouteDeps {
  games: GamesRegistry;
  cache?: Cache<unknown>;
  cacheTtlMs?: number;
}

function catalogKey(tenantId: string, gameId?: string): string {
  return gameId ? `catalog:${tenantId}:byId:${gameId}` : `catalog:${tenantId}:all`;
}

export function invalidateCatalogCache(cache: Cache<unknown>, tenantId?: string): Promise<number> {
  if (tenantId) return cache.delByPrefix(`catalog:${tenantId}:`);
  return cache.delByPrefix('catalog:');
}

export async function registerCatalogRoutes(
  app: FastifyInstance,
  deps: CatalogRouteDeps
): Promise<void> {
  const cache: Cache<unknown> = deps.cache ?? createCache<unknown>({ namespace: 'svc' });
  const ttlMs = deps.cacheTtlMs ?? 5 * 60_000;

  app.get('/api/catalog', async (req, reply) => {
    const tenantId = req.tenant?.id ?? 'default';
    const ck = catalogKey(tenantId);
    const hit = await cache.get(ck);
    if (hit) {
      reply.header('x-cache', 'HIT');
      return reply.send(hit);
    }
    deps.games.load();
    const items = deps.games.list().map((g) => ({
      id: g.id,
      title: g.title,
      supplier: g.supplier,
      year: g.year,
      topology: g.topology,
      mGap: g.mGap,
      category: g.category,
      rtp: g.rtp,
      jurisdictions: g.jurisdictions,
      irFile: g.irFile,
      thumbnail: g.thumbnail ?? `/thumbnails/${g.id}.png`,
    }));
    const payload = { count: items.length, items };
    await cache.set(ck, payload, { ttlMs });
    reply.header('x-cache', 'MISS');
    return reply.send(payload);
  });

  app.get<{ Params: { gameId: string } }>('/api/catalog/:gameId', async (req, reply) => {
    const tenantId = req.tenant?.id ?? 'default';
    const ck = catalogKey(tenantId, req.params.gameId);
    const hit = await cache.get(ck);
    if (hit) {
      reply.header('x-cache', 'HIT');
      return reply.send(hit);
    }
    deps.games.load();
    const g = deps.games.byId(req.params.gameId);
    if (!g) return reply.code(404).send({ error: 'game_not_found' });
    const payload = {
      id: g.id,
      title: g.title,
      supplier: g.supplier,
      year: g.year,
      topology: g.topology,
      mGap: g.mGap,
      category: g.category,
      rtp: g.rtp,
      jurisdictions: g.jurisdictions,
      irFile: g.irFile,
      thumbnail: g.thumbnail ?? `/thumbnails/${g.id}.png`,
    };
    await cache.set(ck, payload, { ttlMs });
    reply.header('x-cache', 'MISS');
    return reply.send(payload);
  });

  app.post('/api/catalog/_invalidate', { preHandler: requireRole('admin') }, async (req, reply) => {
    const n = await invalidateCatalogCache(cache, req.tenant?.id);
    return reply.send({ ok: true, evicted: n });
  });
}
