/**
 * CORTI 200.4-BACKEND — session lifecycle endpoints.
 *
 *  POST   /api/session/create
 *  GET    /api/session/:sessionId
 *  DELETE /api/session/:sessionId
 *  POST   /api/session/:sessionId/spin
 */

import type { FastifyInstance } from 'fastify';
import { sha256Hex, canonicalize } from '../lib/hashChain.js';
import type { SessionStore, Jurisdiction } from '../state/sessions.js';
import type { WalletStore } from '../state/wallet.js';
import type { AuditStore } from '../state/audit.js';
import type { GamesRegistry } from '../state/games.js';

export interface SessionRouteDeps {
  sessions: SessionStore;
  wallet: WalletStore;
  audit: AuditStore;
  games: GamesRegistry;
  /** Inject for tests. */
  rng?: (seed: string, spinNo: number) => { winMinor: number };
}

interface CreateBody {
  playerId: string;
  jurisdiction?: Jurisdiction;
  lossLimitMinor?: number;
}

interface SpinBody {
  gameId: string;
  betMinor: number;
  seed?: string;
  autoplay?: boolean;
}

/** Deterministic mock spin engine — not the real engine, just enough to
 *  exercise the wallet/audit plumbing. RTP ≈ 0.95 by design. */
function defaultRng(seed: string, spinNo: number): { winMinor: number } {
  const h = sha256Hex(`${seed}:${spinNo}`);
  // First 8 hex chars → uniform [0,1).
  const u = parseInt(h.slice(0, 8), 16) / 0x100000000;
  // 70% no win, 25% small win (0.5-2x), 4.9% medium (5-20x), 0.1% big (50-200x).
  if (u < 0.7) return { winMinor: 0 };
  if (u < 0.95) return { winMinor: Math.floor((0.5 + u * 1.5) * 100) };
  if (u < 0.999) return { winMinor: Math.floor((5 + u * 15) * 100) };
  return { winMinor: Math.floor((50 + u * 150) * 100) };
}

export async function registerSessionRoutes(
  app: FastifyInstance,
  deps: SessionRouteDeps
): Promise<void> {
  const rng = deps.rng ?? defaultRng;

  app.post<{ Body: CreateBody }>('/api/session/create', async (req, reply) => {
    const body = req.body ?? ({} as CreateBody);
    if (!body.playerId) {
      return reply.code(400).send({ error: 'playerId_required' });
    }
    try {
      const session = deps.sessions.create({
        playerId: body.playerId,
        jurisdiction: body.jurisdiction,
        ...(body.lossLimitMinor !== undefined
          ? { lossLimitMinor: body.lossLimitMinor }
          : {}),
      });
      deps.audit.append({
        sessionId: session.sessionId,
        type: 'session.created',
        payload: {
          playerId: session.playerId,
          jurisdiction: session.jurisdiction,
          lossLimitMinor: session.lossLimitMinor,
        },
      });
      // Ensure wallet exists for this player.
      const wallet = deps.wallet.getOrCreate(session.playerId);
      return reply.code(201).send({
        sessionId: session.sessionId,
        playerId: session.playerId,
        jurisdiction: session.jurisdiction,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        balanceMinor: wallet.balanceMinor,
        currency: wallet.currency,
        lossLimitMinor: session.lossLimitMinor,
      });
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : 'invalid_input' });
    }
  });

  app.get<{ Params: { sessionId: string } }>(
    '/api/session/:sessionId',
    async (req, reply) => {
      const session = deps.sessions.get(req.params.sessionId);
      if (!session) return reply.code(404).send({ error: 'not_found' });
      const wallet = deps.wallet.balance(session.playerId);
      return reply.send({
        sessionId: session.sessionId,
        playerId: session.playerId,
        jurisdiction: session.jurisdiction,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastSpinAt: session.lastSpinAt,
        totalSpins: session.totalSpins,
        totalWageredMinor: session.totalWageredMinor,
        totalWonMinor: session.totalWonMinor,
        netResultMinor: session.netResultMinor,
        lossLimitMinor: session.lossLimitMinor,
        lossLimitReached: session.lossLimitReached,
        closed: session.closed,
        balanceMinor: wallet?.balanceMinor ?? 0,
        currency: wallet?.currency ?? 'EUR',
      });
    }
  );

  app.delete<{ Params: { sessionId: string } }>(
    '/api/session/:sessionId',
    async (req, reply) => {
      const summary = deps.sessions.close(req.params.sessionId);
      if (!summary) return reply.code(404).send({ error: 'not_found' });
      deps.audit.append({
        sessionId: req.params.sessionId,
        type: 'session.closed',
        payload: summary,
      });
      return reply.send(summary);
    }
  );

  app.post<{
    Params: { sessionId: string };
    Body: SpinBody;
  }>('/api/session/:sessionId/spin', async (req, reply) => {
    const sessionId = req.params.sessionId;
    const body = req.body ?? ({} as SpinBody);

    if (!body.gameId) return reply.code(400).send({ error: 'gameId_required' });
    if (body.betMinor == null || body.betMinor <= 0) {
      return reply.code(400).send({ error: 'invalid_bet' });
    }
    const decision = deps.sessions.decideSpin(sessionId, {
      gameId: body.gameId,
      betMinor: body.betMinor,
      ...(body.autoplay !== undefined ? { autoplay: body.autoplay } : {}),
    });
    if (!decision.allowed) {
      return reply.code(403).send({ error: decision.reason, waitMs: decision.waitMs });
    }
    const session = deps.sessions.get(sessionId)!;
    const game = deps.games.byId(body.gameId);
    if (!game) return reply.code(404).send({ error: 'game_not_found' });
    if (!game.jurisdictions.includes(session.jurisdiction)) {
      return reply.code(403).send({ error: 'game_not_allowed_in_jurisdiction' });
    }

    // Wallet debit (atomic).
    const wagerTx = deps.wallet.wager(session.playerId, body.betMinor);
    if (!wagerTx) {
      return reply.code(402).send({ error: 'insufficient_funds' });
    }

    const seed = body.seed ?? sessionId;
    const { winMinor } = rng(seed, session.totalSpins);
    if (winMinor > 0) {
      deps.wallet.credit(session.playerId, winMinor);
    }
    deps.sessions.recordSpin(sessionId, { betMinor: body.betMinor, winMinor });

    const spinId = `spin-${sessionId}-${session.totalSpins.toString(16).padStart(8, '0')}`;
    const spinPayload = {
      spinId,
      gameId: body.gameId,
      betMinor: body.betMinor,
      winMinor,
      seed,
      timestamp: new Date().toISOString(),
    };
    const merkleCommit = sha256Hex(canonicalize(spinPayload));
    deps.audit.append({
      sessionId,
      type: 'spin',
      payload: { ...spinPayload, merkleCommit },
    });

    const wallet = deps.wallet.balance(session.playerId)!;
    return reply.send({
      spinId,
      result: { winMinor, gameId: body.gameId },
      balanceMinor: wallet.balanceMinor,
      winMinor,
      merkleCommit,
      lossLimitReached: deps.sessions.get(sessionId)!.lossLimitReached,
    });
  });
}
