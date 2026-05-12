import {
  type RGJurisdiction,
  type RGLimits,
  type RGSessionState,
  type RGDecision,
  type RGEvent,
  type AMLConfig,
  type AMLState,
  MIN_SPIN_MS,
} from './types.js';

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface RGSessionOptions {
  sessionId?: string;
  jurisdiction?: RGJurisdiction;
  limits?: RGLimits;
  aml?: AMLConfig;
  /** Override the session start timestamp (useful for deterministic tests). */
  startTime?: number;
}

export class RGSession {
  private readonly sessionId: string;
  private readonly jurisdiction: RGJurisdiction;
  private readonly limits: RGLimits;
  private readonly amlConfig: AMLConfig;
  private readonly startTime: number;

  private totalWagered = 0;
  private totalWon = 0;
  private netLoss = 0;
  private spinCount = 0;
  private lastRealityCheckAt: number | null;
  private lastSpinCompletedAt = 0;

  private readonly eventLog: RGEvent[] = [];

  // AML state
  private amlState: AMLState = {
    recentSpinTimestamps: [],
    consecutiveWins: 0,
    totalWins: 0,
    totalSpins: 0,
    flagged: false,
  };
  private amlVelocityFired = false;
  private amlWinRateFired = false;

  constructor(opts: RGSessionOptions = {}) {
    const now = opts.startTime ?? Date.now();
    this.sessionId = opts.sessionId ?? uuid();
    this.jurisdiction = opts.jurisdiction ?? 'default';
    this.limits = opts.limits ?? {};
    this.amlConfig = opts.aml ?? {};
    this.startTime = now;
    // lastRealityCheckAt is initialized lazily on the first recordSpin call
    // to ensure deterministic behaviour when tests pass explicit nowMs.
    this.lastRealityCheckAt = null;
  }

  checkSpinAllowed(wager: number, nowMs?: number): RGDecision {
    const now = nowMs ?? Date.now();

    // 1. Self-exclusion
    if (this.limits.selfExcluded) {
      return { allow: false, reason: 'self_excluded', message: 'Player is self-excluded.' };
    }

    // 2. Max wager per spin
    if (
      this.limits.maxWagerPerSpin !== undefined &&
      wager > this.limits.maxWagerPerSpin
    ) {
      return {
        allow: false,
        reason: 'max_wager_exceeded',
        message: `Wager ${wager} exceeds limit ${this.limits.maxWagerPerSpin}.`,
      };
    }

    // 3. Min spin time (only after the first spin has been recorded)
    if (this.lastSpinCompletedAt > 0) {
      const minMs = MIN_SPIN_MS[this.jurisdiction];
      const elapsed = now - this.lastSpinCompletedAt;
      if (minMs > 0 && elapsed < minMs) {
        return {
          allow: false,
          reason: 'min_spin_time_not_elapsed',
          message: `Must wait ${minMs - elapsed}ms more before spinning.`,
        };
      }
    }

    // 4. Session duration
    if (
      this.limits.maxSessionDurationMs !== undefined &&
      now - this.startTime >= this.limits.maxSessionDurationMs
    ) {
      return {
        allow: false,
        reason: 'max_session_duration',
        message: 'Session duration limit reached.',
      };
    }

    // 5. Session loss limit
    if (
      this.limits.maxLossPerSession !== undefined &&
      this.netLoss >= this.limits.maxLossPerSession
    ) {
      return {
        allow: false,
        reason: 'max_loss_session',
        message: 'Session loss limit reached.',
      };
    }

    return { allow: true };
  }

  recordSpin(wager: number, win: number, nowMs?: number): RGEvent[] {
    const now = nowMs ?? Date.now();
    const events: RGEvent[] = [];

    // Lazy-initialize the reality-check baseline to the first spin's timestamp.
    if (this.lastRealityCheckAt === null) {
      this.lastRealityCheckAt = now;
    }

    // Update counters
    this.totalWagered += wager;
    this.totalWon += win;
    this.netLoss = Math.max(0, this.totalWagered - this.totalWon);
    this.spinCount += 1;
    this.lastSpinCompletedAt = now;

    // Update AML state
    this.amlState.totalSpins += 1;
    this.amlState.recentSpinTimestamps.push(now);
    if (win > 0) {
      this.amlState.totalWins += 1;
      this.amlState.consecutiveWins += 1;
    } else {
      this.amlState.consecutiveWins = 0;
    }

    // AML velocity: sliding 60s window
    const windowStart = now - 60_000;
    this.amlState.recentSpinTimestamps = this.amlState.recentSpinTimestamps.filter(
      (ts) => ts > windowStart,
    );
    const spinsInWindow = this.amlState.recentSpinTimestamps.length;
    const maxSpinsPerMinute = this.amlConfig.maxSpinsPerMinute;
    if (
      !this.amlVelocityFired &&
      maxSpinsPerMinute !== undefined &&
      spinsInWindow > maxSpinsPerMinute
    ) {
      this.amlVelocityFired = true;
      this.amlState.flagged = true;
      this.amlState.flagReason = 'velocity';
      const event: RGEvent = {
        kind: 'aml_velocity_flag',
        sessionId: this.sessionId,
        timestamp: now,
        detail: { spinsInWindow, maxSpinsPerMinute },
      };
      events.push(event);
      this.eventLog.push(event);
    }

    // AML win-rate sigma: after 30+ spins
    if (
      !this.amlWinRateFired &&
      this.amlState.totalSpins >= 30 &&
      this.amlConfig.winRateSigmaThreshold !== undefined
    ) {
      const n = this.amlState.totalSpins;
      const p = 0.35; // expected win rate
      const actualRate = this.amlState.totalWins / n;
      const stdErr = Math.sqrt((p * (1 - p)) / n);
      const sigma = Math.abs(actualRate - p) / stdErr;
      if (sigma > this.amlConfig.winRateSigmaThreshold) {
        this.amlWinRateFired = true;
        this.amlState.flagged = true;
        this.amlState.flagReason = this.amlState.flagReason ?? 'win_rate_sigma';
        const event: RGEvent = {
          kind: 'aml_velocity_flag',
          sessionId: this.sessionId,
          timestamp: now,
          detail: { actualRate, expectedRate: p, sigma, threshold: this.amlConfig.winRateSigmaThreshold },
        };
        events.push(event);
        this.eventLog.push(event);
      }
    }

    // Reality check (lastRealityCheckAt is non-null here — initialized above)
    if (
      this.limits.realityCheckIntervalMs !== undefined &&
      now - (this.lastRealityCheckAt as number) >= this.limits.realityCheckIntervalMs
    ) {
      this.lastRealityCheckAt = now;
      const event: RGEvent = {
        kind: 'reality_check_due',
        sessionId: this.sessionId,
        timestamp: now,
        detail: {
          totalWagered: this.totalWagered,
          totalWon: this.totalWon,
          netLoss: this.netLoss,
          spinCount: this.spinCount,
        },
      };
      events.push(event);
      this.eventLog.push(event);
    }

    // Session limit warning at 80%
    if (
      this.limits.maxLossPerSession !== undefined &&
      this.netLoss >= this.limits.maxLossPerSession * 0.8
    ) {
      const event: RGEvent = {
        kind: 'session_limit_warning',
        sessionId: this.sessionId,
        timestamp: now,
        detail: {
          netLoss: this.netLoss,
          limit: this.limits.maxLossPerSession,
          pct: this.netLoss / this.limits.maxLossPerSession,
        },
      };
      events.push(event);
      this.eventLog.push(event);
    }

    return events;
  }

  getState(): Readonly<RGSessionState> {
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      totalWagered: this.totalWagered,
      totalWon: this.totalWon,
      netLoss: this.netLoss,
      spinCount: this.spinCount,
      lastRealityCheckAt: this.lastRealityCheckAt ?? this.startTime,
      jurisdiction: this.jurisdiction,
      limits: { ...this.limits },
    };
  }

  cashOutHoldRequired(amount: number): { required: boolean; reason?: string } {
    const threshold = this.amlConfig.cashOutHoldThreshold;
    if (threshold !== undefined && amount >= threshold) {
      return { required: true, reason: `Cash-out amount ${amount} meets AML hold threshold ${threshold}.` };
    }
    return { required: false };
  }

  getEventLog(): readonly RGEvent[] {
    return this.eventLog;
  }

  getAMLState(): Readonly<AMLState> {
    return { ...this.amlState, recentSpinTimestamps: [...this.amlState.recentSpinTimestamps] };
  }
}
