/**
 * CORTI W207-ANALYTICS — ML-lite RTP drift detector.
 *
 *  Welford running mean + M2 for online z-score
 *  EWMA (α=0.05) for trend smoothing
 *  Sliding windows: last 100 / 1000 / 10000 spins
 *
 * Alert triggers (any one fires):
 *   1. 1000-spin rolling RTP delta > 2pp from stated RTP
 *   2. z-score on running stats > 3.0 (≈99.7% confidence)
 *   3. 3 consecutive outliers (|z| > 2) in the last samples
 *
 * Alerts go to:
 *   - in-memory log (queryable via `recentAlerts`)
 *   - all registered webhook URLs (POST JSON)
 *   - registered local listeners (synchronous)
 */

export interface DriftAlert {
  gameId: string;
  severity: 'info' | 'warning' | 'critical';
  observed: number;
  expected: number;
  delta: number;
  zScore: number;
  trigger: 'rolling_window' | 'z_score' | 'consecutive_outliers';
  spins: number;
  timestamp: string;
}

export type DriftListener = (a: DriftAlert) => void;

export interface DetectorOptions {
  /** Smoothing for EWMA (0..1). Default 0.05. */
  ewmaAlpha?: number;
  /** Z-score threshold for triggering. Default 3.0. */
  zThreshold?: number;
  /** Outlier threshold for "3 consecutive". Default 2.0. */
  outlierThreshold?: number;
  /** Rolling window delta threshold in *percent points* (e.g. 2 = 2pp). Default 2. */
  rollingDeltaPp?: number;
  /** Minimum spins before alerts fire. Default 100. */
  minSpins?: number;
  /** Clock for deterministic tests. */
  now?: () => number;
  /** Optional webhook URLs to POST alerts. */
  webhooks?: string[];
}

interface GameState {
  gameId: string;
  expected: number;
  spins: number;
  // Welford
  mean: number;
  m2: number;
  // EWMA
  ewma: number;
  // Sliding windows
  win100: number[];
  win1000: number[];
  win10000: number[];
  consecutiveOutliers: number;
}

function newGameState(gameId: string, expected: number): GameState {
  return {
    gameId,
    expected,
    spins: 0,
    mean: 0,
    m2: 0,
    ewma: expected,
    win100: [],
    win1000: [],
    win10000: [],
    consecutiveOutliers: 0,
  };
}

export class RtpDriftDetector {
  private readonly games = new Map<string, GameState>();
  private readonly alerts: DriftAlert[] = [];
  private readonly alertsCap = 1_000;
  private readonly listeners = new Set<DriftListener>();
  private readonly opts: Required<Omit<DetectorOptions, 'webhooks'>> & { webhooks: string[] };

  constructor(opts: DetectorOptions = {}) {
    this.opts = {
      ewmaAlpha: opts.ewmaAlpha ?? 0.05,
      zThreshold: opts.zThreshold ?? 3.0,
      outlierThreshold: opts.outlierThreshold ?? 2.0,
      rollingDeltaPp: opts.rollingDeltaPp ?? 2,
      minSpins: opts.minSpins ?? 100,
      now: opts.now ?? (() => Date.now()),
      webhooks: opts.webhooks ?? [],
    };
  }

  /** Configure (or update) an expected RTP for a game. */
  setExpected(gameId: string, expected: number): void {
    const s = this.games.get(gameId) ?? newGameState(gameId, expected);
    s.expected = expected;
    if (s.spins === 0) s.ewma = expected;
    this.games.set(gameId, s);
  }

  /** Subscribe to alerts. Returns unsubscribe. */
  onAlert(cb: DriftListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Webhook subscription — POST {alert} JSON. */
  addWebhook(url: string): void {
    if (!this.opts.webhooks.includes(url)) this.opts.webhooks.push(url);
  }

  /** Record a single spin sample. Returns an alert if triggered. */
  record(gameId: string, bet: number, win: number, expected?: number): DriftAlert | null {
    if (bet <= 0) return null;
    const rtpSample = win / bet;
    const s = this.games.get(gameId) ?? newGameState(gameId, expected ?? 0.96);
    if (typeof expected === 'number') s.expected = expected;
    s.spins += 1;
    // Welford update
    const delta = rtpSample - s.mean;
    s.mean += delta / s.spins;
    const delta2 = rtpSample - s.mean;
    s.m2 += delta * delta2;
    // EWMA update
    s.ewma = this.opts.ewmaAlpha * rtpSample + (1 - this.opts.ewmaAlpha) * s.ewma;
    // Sliding windows
    s.win100.push(rtpSample);
    if (s.win100.length > 100) s.win100.shift();
    s.win1000.push(rtpSample);
    if (s.win1000.length > 1000) s.win1000.shift();
    s.win10000.push(rtpSample);
    if (s.win10000.length > 10_000) s.win10000.shift();
    // Outlier tracking — based on z-score against running stats
    const variance = s.spins > 1 ? s.m2 / (s.spins - 1) : 0;
    const std = Math.sqrt(variance);
    const z = std > 0 ? (s.mean - s.expected) / (std / Math.sqrt(s.spins)) : 0;
    const sampleZ = std > 0 ? Math.abs(rtpSample - s.mean) / std : 0;
    if (sampleZ > this.opts.outlierThreshold) {
      s.consecutiveOutliers += 1;
    } else {
      s.consecutiveOutliers = 0;
    }
    this.games.set(gameId, s);

    if (s.spins < this.opts.minSpins) return null;

    let trigger: DriftAlert['trigger'] | null = null;
    let observed = s.mean;
    if (s.win1000.length >= Math.min(1000, this.opts.minSpins)) {
      const wmean = s.win1000.reduce((a, b) => a + b, 0) / s.win1000.length;
      const deltaPp = Math.abs(wmean - s.expected) * 100;
      if (deltaPp > this.opts.rollingDeltaPp) {
        trigger = 'rolling_window';
        observed = wmean;
      }
    }
    if (!trigger && Math.abs(z) > this.opts.zThreshold) {
      trigger = 'z_score';
    }
    if (!trigger && s.consecutiveOutliers >= 3) {
      trigger = 'consecutive_outliers';
    }
    if (!trigger) return null;

    const absDelta = Math.abs(observed - s.expected);
    const severity: DriftAlert['severity'] =
      absDelta > 0.05 ? 'critical' : absDelta > 0.02 ? 'warning' : 'info';
    const alert: DriftAlert = {
      gameId,
      severity,
      observed,
      expected: s.expected,
      delta: observed - s.expected,
      zScore: z,
      trigger,
      spins: s.spins,
      timestamp: new Date(this.opts.now()).toISOString(),
    };
    this.alerts.push(alert);
    while (this.alerts.length > this.alertsCap) this.alerts.shift();
    for (const l of this.listeners) {
      try { l(alert); } catch { /* swallow listener errors */ }
    }
    void this.fireWebhooks(alert);
    return alert;
  }

  private async fireWebhooks(alert: DriftAlert): Promise<void> {
    if (this.opts.webhooks.length === 0) return;
    // Use global fetch when available; older Node test runners may lack it.
    const f: typeof fetch | undefined = (globalThis as { fetch?: typeof fetch }).fetch;
    if (!f) return;
    await Promise.all(
      this.opts.webhooks.map((url) =>
        f(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(alert),
        }).catch(() => undefined)
      )
    );
  }

  /** Current per-game running mean & EWMA snapshot. */
  snapshot(gameId: string): {
    spins: number;
    mean: number;
    expected: number;
    ewma: number;
    variance: number;
    rolling1000: number;
  } | null {
    const s = this.games.get(gameId);
    if (!s) return null;
    const variance = s.spins > 1 ? s.m2 / (s.spins - 1) : 0;
    const wmean = s.win1000.length > 0
      ? s.win1000.reduce((a, b) => a + b, 0) / s.win1000.length
      : 0;
    return {
      spins: s.spins,
      mean: s.mean,
      expected: s.expected,
      ewma: s.ewma,
      variance,
      rolling1000: wmean,
    };
  }

  /** All games tracked. */
  trackedGames(): string[] {
    return Array.from(this.games.keys());
  }

  /** Latest alerts (newest last), optionally filtered by game id. */
  recentAlerts(gameId?: string, limit = 100): DriftAlert[] {
    const filtered = gameId
      ? this.alerts.filter((a) => a.gameId === gameId)
      : this.alerts;
    if (limit >= filtered.length) return filtered.slice();
    return filtered.slice(filtered.length - limit);
  }

  /** Reset — primarily for tests. */
  reset(): void {
    this.games.clear();
    this.alerts.length = 0;
  }
}
