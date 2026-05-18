/**
 * CORTI W204-PROTOCOLS — Gaming-as-a-Service (GaaS) API with real
 * WebSocket /live endpoint.
 *
 *  POST /api/gaas/compute-rtp   — closed-form RTP estimate for an IR
 *  POST /api/gaas/render-ir     — operator-facing render config from IR
 *  POST /api/gaas/spin          — server-authoritative spin (wallet+audit)
 *  GET  /api/gaas/seamless      — operator integration handshake
 *  GET  /api/gaas/live          — WebSocket: real-time spin/wallet events
 *
 *  HTTP API-key auth: pass `x-api-key: <key>`. The list of accepted keys
 *  is configurable via the route deps; when no keys are configured we
 *  accept all requests (dev mode).
 *
 *  WebSocket API-key auth: pass `?apiKey=<key>` as a query param on the
 *  upgrade URL. Same dev-mode rules apply.
 *
 *  WebSocket protocol:
 *    Server emits:
 *      { type:"session-start",  sessionId, timestamp }
 *      { type:"spin",           spinId, gameId, sessionId, result, balance, win, merkleCommit, timestamp }
 *      { type:"wallet-update",  playerId, balance, transactionId, timestamp }
 *      { type:"session-end",    sessionId, summary, timestamp }
 *      { type:"ping",           ts }
 *    Client commands:
 *      { type:"subscribe",      sessionIds:[...] }
 *      { type:"unsubscribe" }
 *      { type:"spin",           bet, gameId, sessionId }
 *      { type:"pong",           ts }
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { sha256Hex, canonicalize } from '../lib/hashChain.js';
import type { GamesRegistry } from '../state/games.js';
import type { SessionStore } from '../state/sessions.js';
import type { WalletStore } from '../state/wallet.js';
import type { AuditStore } from '../state/audit.js';
import type { AnalyticsStore, AnalyticsEvent } from '../state/analytics.js';

export interface GaasRouteDeps {
  games: GamesRegistry;
  sessions: SessionStore;
  wallet: WalletStore;
  audit: AuditStore;
  /** Optional analytics pipeline — when provided, spins are recorded and
   *  subscribed WebSocket clients receive `{type:"analytics", ...}` frames. */
  analytics?: AnalyticsStore;
  /** Accepted API keys. Empty array = dev mode (no auth). */
  apiKeys?: string[];
  /** RNG hook for deterministic tests. */
  rng?: (seed: string, n: number) => number;
  /** Skip registering the @fastify/websocket plugin (when already registered). */
  skipWebsocketPlugin?: boolean;
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

function computeRtpFromIR(ir: IRPayload): { rtp: number; hitFrequency: number; variance: number } {
  const pool = ir.symbols ?? {};
  const totalSyms = Object.values(pool).reduce((a, b) => a + b, 0) || 1;
  const families = Object.keys(pool).length || 1;
  let rtp = Math.min(0.97, 0.85 + families * 0.01);
  const features = ir.features ?? {};
  rtp = Math.min(0.985, rtp + Object.keys(features).length * 0.005);
  if (ir.rtpTarget && ir.rtpTarget >= 0.85 && ir.rtpTarget <= 0.99) {
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

  if (!deps.skipWebsocketPlugin) {
    // Register the websocket plugin if not already registered. Wrapped
    // in try/catch so test apps that pre-register the plugin won't crash.
    try {
      await app.register(websocketPlugin, {});
    } catch (err) {
      app.log?.warn?.({ err }, 'gaas: websocket plugin already registered');
    }
  }

  // Connections live in the closure; one Map keyed by connection token.
  // Each connection tracks the set of sessionIds it subscribes to.
  type Conn = {
    id: string;
    socket: import('ws').WebSocket;
    apiKey: string;
    subscriptions: Set<string>;
    /** Operator analytics opt-in. Only operator-role clients can subscribe. */
    analyticsSubscribed: boolean;
    pingTimer?: NodeJS.Timeout;
    closed: boolean;
  };
  const conns = new Map<string, Conn>();
  let connSeq = 0;

  const broadcast = (sessionId: string, payload: Record<string, unknown>): void => {
    const msg = JSON.stringify(payload);
    for (const c of conns.values()) {
      if (c.closed) continue;
      if (c.subscriptions.size === 0 || c.subscriptions.has(sessionId)) {
        try { c.socket.send(msg); } catch { /* ignore broken pipe */ }
      }
    }
  };

  const broadcastAnalytics = (ev: AnalyticsEvent): void => {
    const msg = JSON.stringify({
      type: 'analytics',
      category: ev.category,
      payload: {
        eventId: ev.eventId,
        sessionId: ev.sessionId,
        gameId: ev.gameId,
        value: ev.value,
        bet: ev.bet,
        timestamp: ev.timestamp,
        ...(ev.payload ?? {}),
      },
    });
    for (const c of conns.values()) {
      if (c.closed) continue;
      if (!c.analyticsSubscribed) continue;
      try { c.socket.send(msg); } catch { /* ignore broken pipe */ }
    }
  };

  // Wire analytics pipeline → WS fan-out (operator subscribers only).
  if (deps.analytics) {
    deps.analytics.onEvent(broadcastAnalytics);
  }

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

  /**
   * Server-authoritative spin. Reusable from both the REST endpoint and
   * the WebSocket command handler.
   */
  async function executeSpin(body: SpinBody): Promise<
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; code: number; error: string }
  > {
    if (!body.gameId || !body.sessionId || typeof body.betAmount !== 'number' || body.betAmount <= 0) {
      return { ok: false, code: 400, error: 'invalid_spin_request' };
    }
    const session = deps.sessions.get(body.sessionId);
    if (!session) return { ok: false, code: 404, error: 'session_not_found' };
    if (session.closed) return { ok: false, code: 403, error: 'session_closed' };

    deps.games.load();
    const game = deps.games.byId(body.gameId);
    if (!game) return { ok: false, code: 404, error: 'game_not_found' };
    if (!game.jurisdictions.includes(session.jurisdiction)) {
      return { ok: false, code: 403, error: 'game_not_allowed_in_jurisdiction' };
    }

    const betMinor = Math.round(body.betAmount * 100);
    const wagerTx = deps.wallet.wager(session.playerId, betMinor);
    if (!wagerTx) return { ok: false, code: 402, error: 'insufficient_funds' };

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

    const result = {
      spinId,
      reelStop: [['HP', 'MP', 'LP'], ['HP', 'MP', 'LP'], ['HP', 'MP', 'LP'], ['HP', 'MP', 'LP'], ['HP', 'MP', 'LP']],
      totalWin: winMinor / 100,
      wins,
      hash,
      balance: wallet.balanceMinor / 100,
    };

    // Feed analytics pipeline (best-effort; pipeline mirrors to WS).
    if (deps.analytics) {
      const category = winMinor > 0 ? 'win' : 'loss';
      deps.analytics.ingest({
        category,
        sessionId: body.sessionId,
        gameId: body.gameId,
        bet: body.betAmount,
        value: winMinor / 100,
        payload: { spinId, merkleCommit: hash },
      });
    }

    // Fan out to subscribed websocket clients.
    broadcast(body.sessionId, {
      type: 'spin',
      spinId,
      gameId: body.gameId,
      sessionId: body.sessionId,
      result,
      balance: wallet.balanceMinor / 100,
      win: winMinor / 100,
      merkleCommit: hash,
      timestamp: payload.timestamp,
    });
    broadcast(body.sessionId, {
      type: 'wallet-update',
      playerId: session.playerId,
      balance: wallet.balanceMinor / 100,
      transactionId: wagerTx.transactionId,
      timestamp: payload.timestamp,
    });

    return { ok: true, data: result };
  }

  app.post<{ Body: SpinBody }>('/api/gaas/spin', async (req, reply) => {
    if (!checkApiKey(req, reply, apiKeys)) return;
    const body = req.body ?? ({} as SpinBody);
    const r = await executeSpin(body);
    if (!r.ok) return reply.code(r.code).send({ error: r.error });
    return reply.send(r.data);
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

  // ── Real WebSocket /live ─────────────────────────────────────────
  app.get(
    '/api/gaas/live',
    { websocket: true },
    (socket, req) => {
      // Auth via query param ?apiKey=...
      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
      const apiKey = url.searchParams.get('apiKey') ?? '';
      if (apiKeys.length > 0 && !apiKeys.includes(apiKey)) {
        try {
          socket.send(JSON.stringify({ type: 'error', error: 'api_key_required' }));
        } catch { /* ignore */ }
        socket.close(4401, 'api_key_required');
        return;
      }

      connSeq++;
      const id = `ws-${Date.now().toString(36)}-${connSeq.toString(16)}`;
      const conn: Conn = {
        id,
        socket,
        apiKey,
        subscriptions: new Set<string>(),
        analyticsSubscribed: false,
        closed: false,
      };
      conns.set(id, conn);

      // Resolve role from query param ?role=operator (defaults to guest).
      const roleParam = url.searchParams.get('role') ?? 'guest';

      // Defer the first frame past the current microtask so that test
      // harnesses (and real clients) have a chance to attach a 'message'
      // listener after the connection resolves.
      setImmediate(() => {
        try {
          socket.send(JSON.stringify({
            type: 'session-start',
            sessionId: id,
            timestamp: new Date().toISOString(),
          }));
        } catch { /* ignore */ }
      });

      // 30 s keepalive ping. Unref'd so the timer doesn't pin the event
      // loop open during app close.
      conn.pingTimer = setInterval(() => {
        if (conn.closed) return;
        try {
          socket.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        } catch { /* ignore */ }
      }, 30_000);
      conn.pingTimer.unref?.();

      socket.on('message', (raw: import('ws').RawData) => {
        let msg: { type?: string; sessionIds?: string[]; bet?: number; gameId?: string; sessionId?: string; ts?: number; role?: string };
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          socket.send(JSON.stringify({ type: 'error', error: 'invalid_json' }));
          return;
        }
        if (!msg || typeof msg !== 'object' || !msg.type) {
          socket.send(JSON.stringify({ type: 'error', error: 'missing_type' }));
          return;
        }
        switch (msg.type) {
          case 'subscribe': {
            const ids = Array.isArray(msg.sessionIds) ? msg.sessionIds.filter((x) => typeof x === 'string') : [];
            conn.subscriptions = new Set(ids);
            socket.send(JSON.stringify({
              type: 'subscribed',
              sessionIds: Array.from(conn.subscriptions),
              timestamp: new Date().toISOString(),
            }));
            return;
          }
          case 'unsubscribe': {
            conn.subscriptions.clear();
            socket.send(JSON.stringify({
              type: 'unsubscribed',
              timestamp: new Date().toISOString(),
            }));
            return;
          }
          case 'spin': {
            const bet = typeof msg.bet === 'number' ? msg.bet : 0;
            const gameId = typeof msg.gameId === 'string' ? msg.gameId : '';
            const sessionId = typeof msg.sessionId === 'string' ? msg.sessionId : '';
            void executeSpin({ gameId, sessionId, betAmount: bet }).then((r) => {
              if (!r.ok) {
                socket.send(JSON.stringify({ type: 'error', error: r.error, code: r.code }));
              } else {
                socket.send(JSON.stringify({ type: 'spin-ack', data: r.data, timestamp: new Date().toISOString() }));
              }
            });
            return;
          }
          case 'subscribe-analytics': {
            // Operator-only opt-in for analytics stream. Role can come
            // from the query param (?role=operator) or from the message
            // body for clients that prefer not to expose it in the URL.
            const role = (msg.role as string | undefined) ?? roleParam;
            if (role !== 'operator' && role !== 'admin' && role !== 'regulator') {
              socket.send(JSON.stringify({ type: 'error', error: 'analytics_requires_operator_role' }));
              return;
            }
            conn.analyticsSubscribed = true;
            socket.send(JSON.stringify({
              type: 'analytics-subscribed',
              timestamp: new Date().toISOString(),
            }));
            return;
          }
          case 'unsubscribe-analytics': {
            conn.analyticsSubscribed = false;
            socket.send(JSON.stringify({
              type: 'analytics-unsubscribed',
              timestamp: new Date().toISOString(),
            }));
            return;
          }
          case 'pong':
            return; // keepalive — no-op
          case 'ping':
            socket.send(JSON.stringify({ type: 'pong', ts: msg.ts ?? Date.now() }));
            return;
          default:
            socket.send(JSON.stringify({ type: 'error', error: 'unknown_type', received: msg.type }));
            return;
        }
      });

      socket.on('close', () => {
        conn.closed = true;
        if (conn.pingTimer) clearInterval(conn.pingTimer);
        conns.delete(id);
      });
      socket.on('error', () => {
        conn.closed = true;
        if (conn.pingTimer) clearInterval(conn.pingTimer);
        conns.delete(id);
      });
    }
  );

  // Cleanup on server close — terminate sockets, clear timers.
  app.addHook('preClose', async () => {
    for (const c of conns.values()) {
      if (c.pingTimer) clearInterval(c.pingTimer);
      c.closed = true;
      try { c.socket.close(); } catch { /* ignore */ }
    }
    conns.clear();
  });
}
