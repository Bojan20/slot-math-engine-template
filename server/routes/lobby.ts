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

export interface LobbyRouteDeps {
  games: GamesRegistry;
  sessions: SessionStore;
}

interface LaunchBody {
  gameId: string;
  sessionId: string;
}

export async function registerLobbyRoutes(
  app: FastifyInstance,
  deps: LobbyRouteDeps
): Promise<void> {
  app.get<{ Querystring: { jurisdiction?: string; category?: string } }>(
    '/api/lobby/games',
    async (req, reply) => {
      const jurisdiction = req.query.jurisdiction;
      const category = req.query.category;
      deps.games.load();
      let games = deps.games.list();
      if (jurisdiction) {
        games = games.filter((g) => g.jurisdictions.includes(jurisdiction));
      }
      if (category) {
        games = games.filter((g) => g.category === category);
      }
      return reply.send({
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
      });
    }
  );

  app.post<{ Body: LaunchBody }>('/api/lobby/launch', async (req, reply) => {
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
