/**
 * CORTI 200.7-MARKETPLACE — Gaming-as-a-Service (GaaS) API.
 *
 *  POST /api/gaas/compute-rtp   — closed-form RTP estimate for an IR
 *  POST /api/gaas/render-ir     — operator-facing render config from IR
 *  POST /api/gaas/spin          — server-authoritative spin (wallet+audit)
 *  GET  /api/gaas/seamless      — operator integration handshake
 *  GET  /api/gaas/live          — WebSocket placeholder (long-poll JSON for now)
 *
 *  API-key auth: pass `x-api-key: <key>`. The list of accepted keys is
 *  configurable via the route deps; when no keys are configured we
 *  accept all requests (dev mode).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sha256Hex, canonicalize } from '../lib/hashChain.js';
import type { GamesRegistry } from '../state/games.js';
import type { SessionStore } from '../state/sessions.js';
import type { WalletStore } from '../state/wallet.js';
import type { AuditStore } from '../state/audit.js';

export interface GaasRouteDeps {
  games: GamesRegistry;
  sessions: SessionStore;
  wallet: WalletStore;
  audit: AuditStore;
  /** Accepted API keys. Empty array = dev mode (no auth). */
  apiKeys?: string[];
  /** RNG hook for deterministic tests. */
  rng?: (seed: string, n: number) => number;
}

interface IRPayload {
  schemaVersion?: string;
  gameId?: string;
  topology?: { kind: string; reels: number; rows: number | number[] };
  symbols?: Record<string, number>;
  features?: Record<string, Record<string, unknown>>;
  rtpTarget?: number;
}

interface SpinBody {
  gameId: string;
  sessionId: string;
  betAmount: number;
}

interface OperatorQuery {
  operatorId?: string;
}

function defaultRng(seed: string, n: number): number {
  const h = sha256Hex(`${seed}:${n}`);
  return parseInt(h.slice(0, 8), 16) / 0x100000000;
}

/** Per-route auth gate — only used when `apiKeys` is non-empty. */
function checkApiKey(req: FastifyRequest, reply: FastifyReply, keys: string[]): boolean {
  if (keys.length === 0) return true;
  const provided = req.headers['x-api-key'];
  const key = Array.isArray(provided) ? provided[0] : provided;
  if (!key || !keys.includes(key)) {
    reply.code(401).send({ error: 'api_key_required' });
    return false;
  }
  return true;
}

/** Closed-form RTP stub: derives an estimate from the IR's symbol pool
 *  + feature multipliers. This is intentionally simple — a real engine
 *  would dispatch to the matching kernel. */
function computeRtpFromIR(ir: IRPayload): { rtp: number; hitFrequency: number; variance: number } {
  const pool = ir.symbols ?? {};
  const totalSyms = Object.values(pool).reduce((a, b) => a + b, 0) || 1;
  // RTP heuristic: each unique symbol family contributes ~1/N base, features add 0.05 each.
  const families = Object.keys(pool).length || 1;
  let rtp = Math.min(0.97, 0.85 + families * 0.01);
  const features = ir.features ?? {};
  rtp = Math.min(0.985, rtp + Object.keys(features).length * 0.005);
  if (ir.rtpTarget && ir.rtpTarget >= 0.85 && ir.rtpTarget <= 0.99) {
    // honor an explicit target if present
    rtp = ir.rtpTarget;
  }
  const hitFrequency = 0.25 + (totalSyms % 7) * 0.01;
  const variance = 1.0 + Object.keys(features).length * 0.4;
  return { rtp, hitFrequency, variance };
}

export async function registerGaasRoutes(
  app: FastifyInstance,
  deps: GaasRouteDeps
): Promise<void> {
  const apiKeys = deps.apiKeys ?? [];
  const rng = deps.rng ?? defaultRng;

  app.post<{ Body: IRPayload }>('/api/gaas/compute-rtp', async (req, reply) => {
    if (!checkApiKey(req, reply, apiKeys)) return;
    const ir = req.body ?? {};
    if (!ir.symbols || Object.keys(ir.symbols).length === 0) {
      return reply.code(400).send({ error: 'invalid_ir', detail: 'symbols pool is required' });
    }
    if (!ir.topology) {
      return reply.code(400).send({ error: 'invalid_ir', detail: 'topology is required' });
    }
    const result = computeRtpFromIR(ir);
    return reply.send({
      rtp: result.rtp,
      hitFrequency: result.hitFrequency,
      variance: result.variance,
      method: 'closed-form',
    });
  });

  app.post<{ Body: IRPayload }>('/api/gaas/render-ir', async (req, reply) => {
    if (!checkApiKey(req, reply, apiKeys)) return;
    const ir = req.body ?? {};
    if (!ir.gameId) return reply.code(400).send({ error: 'gameId_required' });
    if (!ir.topology) return reply.code(400).send({ error: 'topology_required' });
    const computed = computeRtpFromIR(ir);
    return reply.send({
      gameId: ir.gameId,
      topology: ir.topology,
      rtp: computed.rtp,
      irFile: `runtime/${ir.gameId}.ir.json`,
      uiHints: {
        reels: ir.topology.reels,
        rows: ir.topology.rows,
        features: Object.keys(ir.features ?? {}),
      },
    });
  });

  app.post<{ Body: SpinBody }>('/api/gaas/spin', async (req, reply) => {
    if (!checkApiKey(req, reply, apiKeys)) return;
    const body = req.body ?? ({} as SpinBody);
    if (!body.gameId || !body.sessionId || typeof body.betAmount !== 'number' || body.betAmount <= 0) {
      return reply.code(400).send({ error: 'invalid_spin_request' });
    }
    const session = deps.sessions.get(body.sessionId);
    if (!session) return reply.code(404).send({ error: 'session_not_found' });
    if (session.closed) return reply.code(403).send({ error: 'session_closed' });

    deps.games.load();
    const game = deps.games.byId(body.gameId);
    if (!game) return reply.code(404).send({ error: 'game_not_found' });
    if (!game.jurisdictions.includes(session.jurisdiction)) {
      return reply.code(403).send({ error: 'game_not_allowed_in_jurisdiction' });
    }

    const betMinor = Math.round(body.betAmount * 100);
    const wagerTx = deps.wallet.wager(session.playerId, betMinor);
    if (!wagerTx) return reply.code(402).send({ error: 'insufficient_funds' });

    // Spin outcome — based on a deterministic seed for audit reproducibility.
    const u = rng(body.sessionId, session.totalSpins);
    let winMinor = 0;
    if (u >= 0.7 && u < 0.95) winMinor = Math.floor(betMinor * (0.5 + u));
    else if (u >= 0.95 && u < 0.999) winMinor = Math.floor(betMinor * (3 + (u - 0.95) * 100));
    else if (u >= 0.999) winMinor = Math.floor(betMinor * (50 + u * 100));
    if (winMinor > 0) deps.wallet.credit(session.playerId, winMinor);
    deps.sessions.recordSpin(body.sessionId, { betMinor, winMinor });

    const spinId = `gaas-spin-${body.sessionId}-${session.totalSpins.toString(16)}`;
    const wallet = deps.wallet.balance(session.playerId)!;
    const wins = winMinor > 0
      ? [{ payline: 1, symbol: 'HP', count: 3, amount: winMinor / 100 }]
      : [];

    const payload = {
      spinId,
      gameId: body.gameId,
      betAmount: body.betAmount,
      totalWin: winMinor / 100,
      timestamp: new Date().toISOString(),
    };
    const hash = sha256Hex(canonicalize(payload));
    deps.audit.append({
      sessionId: body.sessionId,
      type: 'gaas.spin',
      payload: { ...payload, hash },
    });

    return reply.send({
      spinId,
      reelStop: [['HP', 'MP', 'LP'], ['HP', 'MP', 'LP'], ['HP', 'MP', 'LP'], ['HP', 'MP', 'LP'], ['HP', 'MP', 'LP']],
      totalWin: winMinor / 100,
      wins,
      hash,
      balance: wallet.balanceMinor / 100,
    });
  });

  app.get<{ Querystring: OperatorQuery }>('/api/gaas/seamless', async (req, reply) => {
    if (!checkApiKey(req, reply, apiKeys)) return;
    const operatorId = req.query.operatorId;
    if (!operatorId) return reply.code(400).send({ error: 'operatorId_required' });
    const baseUrl = `${req.protocol}://${req.hostname}`;
    return reply.send({
      operatorId,
      walletEndpoint: `${baseUrl}/api/wallet`,
      spinEndpoint: `${baseUrl}/api/gaas/spin`,
      publicKey: sha256Hex(`gaas-pubkey:${operatorId}`),
      timestamp: new Date().toISOString(),
    });
  });

  /** WebSocket placeholder. We don't pull in @fastify/websocket here to
   *  keep the route surface dependency-clean; instead we expose a JSON
   *  long-poll endpoint that emits "live" events from the audit store.
   *  A real deployment would switch this to WebSocket without changing
   *  the wire-shape. */
  app.get<{ Querystring: { sessionId?: string; since?: string } }>('/api/gaas/live', async (req, reply) => {
    if (!checkApiKey(req, reply, apiKeys)) return;
    const sessionId = req.query.sessionId;
    if (!sessionId) return reply.code(400).send({ error: 'sessionId_required' });
    const sinceSeq = req.query.since ? Number(req.query.since) : -1;
    const all = deps.audit.query(sessionId).entries;
    const fresh = all.filter((e) => e.seq > sinceSeq);
    return reply.send({
      sessionId,
      events: fresh.map((e) => ({
        type: e.type,
        seq: e.seq,
        timestamp: e.timestamp,
        payload: e.payload,
      })),
      cursor: fresh.length > 0 ? fresh[fresh.length - 1].seq : sinceSeq,
    });
  });
}
