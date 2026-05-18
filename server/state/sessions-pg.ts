/**
 * CORTI W206-PERSISTENCE — Postgres-backed SessionStore.
 *
 * Mirrors the API surface of `SessionStore` (state/sessions.ts) but
 * persists every record to `sessions(session_id, …, state JSONB)`. The
 * `state` column holds the full mutable shape so column changes don't
 * require schema migrations for unrelated fields.
 *
 * Used when `USE_POSTGRES=true`. The in-memory store remains the
 * default for unit tests and dev.
 */

import type { PgConnection } from '../db/connection.js';
import {
  JURISDICTION_POLICIES,
  type Jurisdiction,
  type JurisdictionPolicy,
  type SessionCreateInput,
  type SessionState,
  type SpinInput,
  type SpinDecision,
  type SessionCloseSummary,
} from './sessions.js';

interface SessionRow {
  session_id: string;
  player_id: string;
  jurisdiction: string;
  created_at: Date;
  expires_at: Date;
  last_spin_at: Date | null;
  state: SessionState;
  closed_at: Date | null;
}

let counter = 0;
function newSessionId(): string {
  counter++;
  return `sess-${Date.now().toString(36)}-${counter.toString(16).padStart(6, '0')}`;
}

export class PostgresSessionStore {
  constructor(private readonly conn: PgConnection) {}

  async create(input: SessionCreateInput): Promise<SessionState> {
    const jurisdiction: Jurisdiction = input.jurisdiction ?? 'GENERIC';
    const policy: JurisdictionPolicy = JURISDICTION_POLICIES[jurisdiction];
    if (!policy) {
      throw new RangeError(`PostgresSessionStore.create: unknown jurisdiction "${jurisdiction}"`);
    }
    if (!input.playerId || typeof input.playerId !== 'string') {
      throw new RangeError('PostgresSessionStore.create: playerId required');
    }
    const now = new Date();
    const sessionId = newSessionId();
    const lossLimit = input.lossLimitMinor ?? policy.defaultLossLimitMinor;
    const session: SessionState = {
      sessionId,
      playerId: input.playerId,
      jurisdiction,
      policy,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + policy.sessionTimeoutMs).toISOString(),
      lastSpinAt: null,
      totalSpins: 0,
      totalWageredMinor: 0,
      totalWonMinor: 0,
      netResultMinor: 0,
      lossLimitMinor: lossLimit,
      lossLimitReached: false,
      closed: false,
    };
    await this.conn.query(
      `INSERT INTO sessions (session_id, player_id, jurisdiction, created_at, expires_at, last_spin_at, state, closed_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6::jsonb, NULL)`,
      [
        sessionId,
        session.playerId,
        jurisdiction,
        session.createdAt,
        session.expiresAt,
        JSON.stringify(session),
      ]
    );
    return session;
  }

  async get(sessionId: string): Promise<SessionState | null> {
    const r = await this.conn.query<SessionRow>(
      `SELECT session_id, player_id, jurisdiction, created_at, expires_at, last_spin_at, state, closed_at
       FROM sessions WHERE session_id = $1`,
      [sessionId]
    );
    if (r.rows.length === 0) return null;
    return r.rows[0].state;
  }

  async decideSpin(
    sessionId: string,
    input: SpinInput,
    nowMs = Date.now()
  ): Promise<SpinDecision> {
    const session = await this.get(sessionId);
    if (!session) return { allowed: false, reason: 'session_not_found' };
    if (session.closed) return { allowed: false, reason: 'session_closed' };
    if (new Date(session.expiresAt).getTime() <= nowMs) {
      return { allowed: false, reason: 'session_expired' };
    }
    if (input.autoplay === true && !session.policy.allowAutoplay) {
      return { allowed: false, reason: 'autoplay_banned_in_jurisdiction' };
    }
    if (input.betMinor == null || input.betMinor <= 0) {
      return { allowed: false, reason: 'invalid_bet' };
    }
    if (session.lossLimitReached) {
      return { allowed: false, reason: 'loss_limit_reached' };
    }
    if (session.lastSpinAt != null) {
      const elapsed = nowMs - session.lastSpinAt;
      if (elapsed < session.policy.minSpinPacingMs) {
        return {
          allowed: false,
          reason: 'spin_pacing_violation',
          waitMs: session.policy.minSpinPacingMs - elapsed,
        };
      }
    }
    return { allowed: true };
  }

  async recordSpin(
    sessionId: string,
    input: { betMinor: number; winMinor: number },
    nowMs = Date.now()
  ): Promise<SessionState> {
    return this.conn.withTransaction(async (client) => {
      const r = await client.query<SessionRow>(
        `SELECT state FROM sessions WHERE session_id = $1 FOR UPDATE`,
        [sessionId]
      );
      if (r.rows.length === 0) {
        throw new RangeError(`recordSpin: unknown session "${sessionId}"`);
      }
      const session: SessionState = r.rows[0].state;
      if (session.closed) {
        throw new RangeError(`recordSpin: session "${sessionId}" closed`);
      }
      session.totalSpins += 1;
      session.totalWageredMinor += input.betMinor;
      session.totalWonMinor += input.winMinor;
      session.netResultMinor = session.totalWonMinor - session.totalWageredMinor;
      session.lastSpinAt = nowMs;
      if (
        session.lossLimitMinor > 0 &&
        -session.netResultMinor >= session.lossLimitMinor
      ) {
        session.lossLimitReached = true;
      }
      await client.query(
        `UPDATE sessions SET state = $1::jsonb, last_spin_at = to_timestamp($2 / 1000.0) WHERE session_id = $3`,
        [JSON.stringify(session), nowMs, sessionId]
      );
      return session;
    });
  }

  async close(sessionId: string): Promise<SessionCloseSummary | null> {
    return this.conn.withTransaction(async (client) => {
      const r = await client.query<SessionRow>(
        `SELECT state FROM sessions WHERE session_id = $1 FOR UPDATE`,
        [sessionId]
      );
      if (r.rows.length === 0) return null;
      const session: SessionState = r.rows[0].state;
      session.closed = true;
      await client.query(
        `UPDATE sessions SET state = $1::jsonb, closed_at = NOW() WHERE session_id = $2`,
        [JSON.stringify(session), sessionId]
      );
      return {
        closed: true,
        totalWageredMinor: session.totalWageredMinor,
        totalWonMinor: session.totalWonMinor,
        netResultMinor: session.netResultMinor,
      };
    });
  }

  async size(): Promise<number> {
    const r = await this.conn.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM sessions'
    );
    return Number(r.rows[0].count);
  }

  async reset(): Promise<void> {
    await this.conn.query('DELETE FROM sessions');
  }
}
