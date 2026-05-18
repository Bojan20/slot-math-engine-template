/**
 * CORTI W207-ANALYTICS — real-time analytics ingestion pipeline.
 *
 * Buffers events in a bounded in-memory deque (oldest-evicted FIFO) with
 * an optional Postgres backend that mirrors writes for durability.
 * Real-time stats are derived from the buffer:
 *   - events/sec  — sliding 60s window
 *   - errors/min  — sliding 60s window of `error` category
 *   - sessions    — unique session_id count
 *   - rolling RTP — per-game windowed average over last N spins (default 1000)
 *
 * Subscribers (e.g. the GaaS WebSocket fan-out) can register listeners
 * via `onEvent(cb)` and receive every emitted event synchronously.
 */

import type { PgConnection } from '../db/connection.js';

export type AnalyticsCategory =
  | 'spin'
  | 'win'
  | 'loss'
  | 'feature_trigger'
  | 'session_start'
  | 'session_end'
  | 'wallet_op'
  | 'cert_submission'
  | 'error';

export interface AnalyticsEvent {
  /** Monotonic per-store id; assigned on ingest. */
  eventId: number;
  /** Event category — drives downstream aggregation. */
  category: AnalyticsCategory;
  /** ISO timestamp. */
  timestamp: string;
  /** Optional session reference. */
  sessionId?: string;
  /** Optional game reference (required for spin/win/loss). */
  gameId?: string;
  /** Bet/win value in major units. */
  value?: number;
  /** Bet amount (for spin events; useful for RTP). */
  bet?: number;
  /** Free-form payload — opaque to the pipeline. */
  payload?: Record<string, unknown>;
}

export type AnalyticsListener = (ev: AnalyticsEvent) => void;

export interface AnalyticsStoreOptions {
  /** Buffer cap (oldest events evicted). Default 10_000. */
  bufferCap?: number;
  /** Rolling RTP window size per game (spins). Default 1000. */
  rtpWindow?: number;
  /** Optional Postgres backend for durable mirror writes. */
  pg?: PgConnection | null;
  /** Clock injection for deterministic tests. */
  now?: () => number;
}

export interface AnalyticsStats {
  bufferSize: number;
  totalIngested: number;
  eventsPerSec: number;
  errorsPerMin: number;
  sessionCount: number;
  categoryCounts: Record<AnalyticsCategory, number>;
}

export interface PerGameRtp {
  gameId: string;
  spins: number;
  bet: number;
  win: number;
  rtp: number;
  windowRtp: number;
}

interface SpinSample {
  bet: number;
  win: number;
  ts: number;
}

export class AnalyticsStore {
  private readonly buffer: AnalyticsEvent[] = [];
  private readonly bufferCap: number;
  private readonly rtpWindow: number;
  private readonly pg: PgConnection | null;
  private readonly now: () => number;
  private nextId = 1;
  private totalIngested = 0;
  private readonly listeners = new Set<AnalyticsListener>();
  private readonly categoryCounts: Record<AnalyticsCategory, number> = {
    spin: 0, win: 0, loss: 0, feature_trigger: 0,
    session_start: 0, session_end: 0, wallet_op: 0,
    cert_submission: 0, error: 0,
  };
  private readonly perGame = new Map<string, SpinSample[]>();
  private readonly perGameTotals = new Map<string, { bet: number; win: number; spins: number }>();
  private readonly sessions = new Set<string>();
  /** Persist failures collected in dev; counted only. */
  private pgWriteFailures = 0;

  constructor(opts: AnalyticsStoreOptions = {}) {
    this.bufferCap = Math.max(1, opts.bufferCap ?? 10_000);
    this.rtpWindow = Math.max(1, opts.rtpWindow ?? 1000);
    this.pg = opts.pg ?? null;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Subscribe to live events. Returns an unsubscribe handle. */
  onEvent(cb: AnalyticsListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Ingest a single event. Mirror to Postgres best-effort. */
  ingest(ev: Omit<AnalyticsEvent, 'eventId' | 'timestamp'> & { timestamp?: string }): AnalyticsEvent {
    const sealed: AnalyticsEvent = {
      ...ev,
      eventId: this.nextId++,
      timestamp: ev.timestamp ?? new Date(this.now()).toISOString(),
    };
    this.buffer.push(sealed);
    while (this.buffer.length > this.bufferCap) this.buffer.shift();
    this.totalIngested++;
    this.categoryCounts[sealed.category]++;
    if (sealed.sessionId) this.sessions.add(sealed.sessionId);

    if (sealed.gameId && (sealed.category === 'spin' || sealed.category === 'win' || sealed.category === 'loss')) {
      this.recordSpin(sealed);
    }

    // Best-effort durable mirror — failure does not block in-memory pipeline.
    if (this.pg) {
      void this.persist(sealed).catch(() => {
        this.pgWriteFailures++;
      });
    }

    for (const l of this.listeners) {
      try { l(sealed); } catch { /* swallow listener errors */ }
    }
    return sealed;
  }

  private recordSpin(ev: AnalyticsEvent): void {
    const gid = ev.gameId!;
    const bet = typeof ev.bet === 'number' ? ev.bet : 1;
    const win = typeof ev.value === 'number' ? ev.value : 0;
    const tot = this.perGameTotals.get(gid) ?? { bet: 0, win: 0, spins: 0 };
    tot.bet += bet;
    tot.win += win;
    tot.spins += 1;
    this.perGameTotals.set(gid, tot);
    const arr = this.perGame.get(gid) ?? [];
    arr.push({ bet, win, ts: this.now() });
    while (arr.length > this.rtpWindow) arr.shift();
    this.perGame.set(gid, arr);
  }

  private async persist(ev: AnalyticsEvent): Promise<void> {
    if (!this.pg) return;
    await this.pg.query(
      `INSERT INTO analytics_events
         (event_id, category, session_id, game_id, bet, value, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        ev.eventId,
        ev.category,
        ev.sessionId ?? null,
        ev.gameId ?? null,
        ev.bet ?? null,
        ev.value ?? null,
        JSON.stringify(ev.payload ?? null),
        ev.timestamp,
      ]
    );
  }

  /** Most-recent N events (newest last). */
  recent(limit = 100): AnalyticsEvent[] {
    if (limit >= this.buffer.length) return this.buffer.slice();
    return this.buffer.slice(this.buffer.length - limit);
  }

  /** Filter buffer entries by category. */
  byCategory(cat: AnalyticsCategory): AnalyticsEvent[] {
    return this.buffer.filter((e) => e.category === cat);
  }

  /** Per-game rolling-RTP samples + cumulative aggregates. */
  perGameRtp(): PerGameRtp[] {
    const out: PerGameRtp[] = [];
    for (const [gid, tot] of this.perGameTotals.entries()) {
      const win = this.perGame.get(gid) ?? [];
      const windowBet = win.reduce((a, b) => a + b.bet, 0);
      const windowWin = win.reduce((a, b) => a + b.win, 0);
      out.push({
        gameId: gid,
        spins: tot.spins,
        bet: tot.bet,
        win: tot.win,
        rtp: tot.bet > 0 ? tot.win / tot.bet : 0,
        windowRtp: windowBet > 0 ? windowWin / windowBet : 0,
      });
    }
    return out;
  }

  /** Return rolling RTP samples for a single game (oldest first). */
  rollingRtpSeries(gameId: string): number[] {
    const arr = this.perGame.get(gameId) ?? [];
    return arr.map((s) => (s.bet > 0 ? s.win / s.bet : 0));
  }

  stats(): AnalyticsStats {
    const cutoff = this.now() - 60_000;
    let lastMinuteEvents = 0;
    let lastMinuteErrors = 0;
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const ts = Date.parse(this.buffer[i].timestamp);
      if (ts < cutoff) break;
      lastMinuteEvents++;
      if (this.buffer[i].category === 'error') lastMinuteErrors++;
    }
    return {
      bufferSize: this.buffer.length,
      totalIngested: this.totalIngested,
      eventsPerSec: lastMinuteEvents / 60,
      errorsPerMin: lastMinuteErrors,
      sessionCount: this.sessions.size,
      categoryCounts: { ...this.categoryCounts },
    };
  }

  /** Failures observed during best-effort durable mirror writes. */
  pgFailureCount(): number {
    return this.pgWriteFailures;
  }

  /** Reset state — primarily for tests. */
  reset(): void {
    this.buffer.length = 0;
    this.nextId = 1;
    this.totalIngested = 0;
    for (const k of Object.keys(this.categoryCounts) as AnalyticsCategory[]) {
      this.categoryCounts[k] = 0;
    }
    this.perGame.clear();
    this.perGameTotals.clear();
    this.sessions.clear();
    this.pgWriteFailures = 0;
  }

  /** Replay buffer from Postgres backend (e.g. after restart). */
  async loadFromPg(limit = 10_000): Promise<number> {
    if (!this.pg) return 0;
    const r = await this.pg.query<{
      event_id: number;
      category: AnalyticsCategory;
      session_id: string | null;
      game_id: string | null;
      bet: number | null;
      value: number | null;
      payload: unknown;
      created_at: Date;
    }>(
      `SELECT event_id, category, session_id, game_id, bet, value, payload, created_at
         FROM analytics_events
         ORDER BY event_id DESC LIMIT $1`,
      [limit]
    );
    // Re-insert oldest-first to preserve order.
    const rows = r.rows.slice().reverse();
    for (const row of rows) {
      const ev: AnalyticsEvent = {
        eventId: row.event_id,
        category: row.category,
        timestamp: row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
        sessionId: row.session_id ?? undefined,
        gameId: row.game_id ?? undefined,
        bet: row.bet ?? undefined,
        value: row.value ?? undefined,
        payload: (row.payload as Record<string, unknown> | null) ?? undefined,
      };
      this.buffer.push(ev);
      while (this.buffer.length > this.bufferCap) this.buffer.shift();
      this.totalIngested++;
      this.categoryCounts[ev.category]++;
      if (ev.sessionId) this.sessions.add(ev.sessionId);
      if (ev.gameId && (ev.category === 'spin' || ev.category === 'win' || ev.category === 'loss')) {
        this.recordSpin(ev);
      }
      this.nextId = Math.max(this.nextId, ev.eventId + 1);
    }
    return rows.length;
  }
}
