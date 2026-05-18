/**
 * CORTI 200.4-BACKEND — in-memory session store with jurisdiction-aware
 * responsible-gambling limits enforcement.
 *
 * UKGC rules implemented:
 *  - Minimum spin pacing 2500ms between spins.
 *  - Autoplay strictly banned (any `autoplay: true` flag throws).
 *  - Optional per-session loss limit; once exceeded, the session is
 *    flagged `lossLimitReached` and spins return an error.
 *
 * MGA / SE / other jurisdictions can override these via the
 * `jurisdictionPolicy` table below.
 */

export type Jurisdiction = 'UKGC' | 'MGA' | 'SE' | 'NJ' | 'GENERIC';

export interface JurisdictionPolicy {
  minSpinPacingMs: number;
  allowAutoplay: boolean;
  defaultLossLimitMinor: number;
  sessionTimeoutMs: number;
}

export const JURISDICTION_POLICIES: Record<Jurisdiction, JurisdictionPolicy> = {
  UKGC: {
    minSpinPacingMs: 2500,
    allowAutoplay: false,
    defaultLossLimitMinor: 50_000, // 500.00
    sessionTimeoutMs: 60 * 60 * 1000, // 1h
  },
  MGA: {
    minSpinPacingMs: 1500,
    allowAutoplay: true,
    defaultLossLimitMinor: 100_000,
    sessionTimeoutMs: 4 * 60 * 60 * 1000, // 4h
  },
  SE: {
    minSpinPacingMs: 2000,
    allowAutoplay: false,
    defaultLossLimitMinor: 50_000,
    sessionTimeoutMs: 60 * 60 * 1000,
  },
  NJ: {
    minSpinPacingMs: 1000,
    allowAutoplay: true,
    defaultLossLimitMinor: 200_000,
    sessionTimeoutMs: 8 * 60 * 60 * 1000,
  },
  GENERIC: {
    minSpinPacingMs: 1000,
    allowAutoplay: true,
    defaultLossLimitMinor: 0, // unlimited
    sessionTimeoutMs: 4 * 60 * 60 * 1000,
  },
};

export interface SessionCreateInput {
  playerId: string;
  jurisdiction?: Jurisdiction;
  lossLimitMinor?: number;
}

export interface SessionState {
  sessionId: string;
  playerId: string;
  jurisdiction: Jurisdiction;
  policy: JurisdictionPolicy;
  createdAt: string;
  expiresAt: string;
  lastSpinAt: number | null; // epoch ms
  totalSpins: number;
  totalWageredMinor: number;
  totalWonMinor: number;
  netResultMinor: number; // negative = loss
  lossLimitMinor: number;
  lossLimitReached: boolean;
  closed: boolean;
}

export interface SpinInput {
  gameId: string;
  betMinor: number;
  seed?: string;
  autoplay?: boolean;
}

export interface SpinDecision {
  allowed: boolean;
  reason?: string;
  waitMs?: number;
}

export interface SessionCloseSummary {
  closed: true;
  totalWageredMinor: number;
  totalWonMinor: number;
  netResultMinor: number;
}

let counter = 0;
function newSessionId(): string {
  counter++;
  return `sess-${Date.now().toString(36)}-${counter.toString(16).padStart(6, '0')}`;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionState>();

  create(input: SessionCreateInput): SessionState {
    const jurisdiction: Jurisdiction = input.jurisdiction ?? 'GENERIC';
    const policy = JURISDICTION_POLICIES[jurisdiction];
    if (!policy) {
      throw new RangeError(`SessionStore.create: unknown jurisdiction "${jurisdiction}"`);
    }
    if (!input.playerId || typeof input.playerId !== 'string') {
      throw new RangeError('SessionStore.create: playerId required');
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
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): SessionState | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /** Returns whether a spin would be allowed, plus the reason if not. */
  decideSpin(sessionId: string, input: SpinInput, nowMs = Date.now()): SpinDecision {
    const session = this.sessions.get(sessionId);
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

  /** Record the outcome of a spin against the session. */
  recordSpin(
    sessionId: string,
    input: { betMinor: number; winMinor: number },
    nowMs = Date.now()
  ): SessionState {
    const session = this.sessions.get(sessionId);
    if (!session) throw new RangeError(`recordSpin: unknown session "${sessionId}"`);
    if (session.closed) throw new RangeError(`recordSpin: session "${sessionId}" closed`);
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
    return session;
  }

  close(sessionId: string): SessionCloseSummary | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.closed = true;
    return {
      closed: true,
      totalWageredMinor: session.totalWageredMinor,
      totalWonMinor: session.totalWonMinor,
      netResultMinor: session.netResultMinor,
    };
  }

  size(): number {
    return this.sessions.size;
  }

  reset(): void {
    this.sessions.clear();
  }
}
