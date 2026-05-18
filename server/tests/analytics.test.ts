/**
 * CORTI W207-ANALYTICS — analytics ingestion pipeline.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyticsStore } from '../state/analytics.js';
import { PgConnection } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { fakePoolFactory } from './fake-pg.js';

describe('AnalyticsStore (in-memory)', () => {
  let store: AnalyticsStore;
  beforeEach(() => {
    store = new AnalyticsStore({ bufferCap: 10, rtpWindow: 5 });
  });

  it('assigns monotonic eventIds and timestamps on ingest', () => {
    const a = store.ingest({ category: 'spin', sessionId: 's1', gameId: 'g1', bet: 1, value: 0 });
    const b = store.ingest({ category: 'win', sessionId: 's1', gameId: 'g1', bet: 1, value: 5 });
    expect(a.eventId).toBe(1);
    expect(b.eventId).toBe(2);
    expect(a.timestamp).toMatch(/T/);
  });

  it('buffer cap is enforced — oldest events evicted', () => {
    for (let i = 0; i < 25; i++) {
      store.ingest({ category: 'spin', sessionId: `s${i}`, gameId: 'g1', bet: 1, value: 0 });
    }
    const recent = store.recent(100);
    expect(recent.length).toBe(10);
    expect(recent[0].eventId).toBe(16);
    expect(recent[9].eventId).toBe(25);
  });

  it('totalIngested tracks all events even after eviction', () => {
    for (let i = 0; i < 25; i++) {
      store.ingest({ category: 'spin', sessionId: 's', gameId: 'g', bet: 1, value: 0 });
    }
    const s = store.stats();
    expect(s.totalIngested).toBe(25);
    expect(s.bufferSize).toBe(10);
  });

  it('categoryCounts increment per category', () => {
    store.ingest({ category: 'spin', sessionId: 's', gameId: 'g', bet: 1, value: 0 });
    store.ingest({ category: 'win', sessionId: 's', gameId: 'g', bet: 1, value: 5 });
    store.ingest({ category: 'win', sessionId: 's', gameId: 'g', bet: 1, value: 3 });
    store.ingest({ category: 'error', payload: { msg: 'boom' } });
    const s = store.stats();
    expect(s.categoryCounts.spin).toBe(1);
    expect(s.categoryCounts.win).toBe(2);
    expect(s.categoryCounts.error).toBe(1);
  });

  it('sessionCount returns distinct session ids only', () => {
    store.ingest({ category: 'session_start', sessionId: 's1' });
    store.ingest({ category: 'session_start', sessionId: 's2' });
    store.ingest({ category: 'spin', sessionId: 's1', gameId: 'g', bet: 1, value: 0 });
    const s = store.stats();
    expect(s.sessionCount).toBe(2);
  });

  it('per-game rolling RTP averages over the window', () => {
    // 5 spins, bet=1 each, wins [2, 0, 0, 0, 0] → window RTP = 0.40
    for (const win of [2, 0, 0, 0, 0]) {
      const cat = win > 0 ? 'win' : 'loss';
      store.ingest({ category: cat, sessionId: 's', gameId: 'g', bet: 1, value: win });
    }
    const rtp = store.perGameRtp().find((r) => r.gameId === 'g')!;
    expect(rtp.spins).toBe(5);
    expect(rtp.rtp).toBeCloseTo(0.4, 5);
    expect(rtp.windowRtp).toBeCloseTo(0.4, 5);
  });

  it('window slides when more spins arrive than rtpWindow', () => {
    for (let i = 0; i < 10; i++) {
      store.ingest({ category: 'win', sessionId: 's', gameId: 'g', bet: 1, value: 1 });
    }
    // Now flush window with zeros — rtpWindow=5
    for (let i = 0; i < 5; i++) {
      store.ingest({ category: 'loss', sessionId: 's', gameId: 'g', bet: 1, value: 0 });
    }
    const rtp = store.perGameRtp().find((r) => r.gameId === 'g')!;
    expect(rtp.spins).toBe(15);
    expect(rtp.windowRtp).toBe(0);
    expect(rtp.rtp).toBeCloseTo(10 / 15, 5);
  });

  it('listeners receive every ingested event synchronously', () => {
    const seen: number[] = [];
    store.onEvent((e) => seen.push(e.eventId));
    store.ingest({ category: 'spin', sessionId: 's', gameId: 'g', bet: 1, value: 0 });
    store.ingest({ category: 'win', sessionId: 's', gameId: 'g', bet: 1, value: 1 });
    expect(seen).toEqual([1, 2]);
  });

  it('listeners can unsubscribe and stop receiving', () => {
    const seen: number[] = [];
    const off = store.onEvent((e) => seen.push(e.eventId));
    store.ingest({ category: 'spin', sessionId: 's' });
    off();
    store.ingest({ category: 'spin', sessionId: 's' });
    expect(seen).toEqual([1]);
  });

  it('events/sec uses a 60s sliding window of timestamps', () => {
    let t = 1_000_000;
    const s = new AnalyticsStore({ bufferCap: 1000, now: () => t });
    for (let i = 0; i < 60; i++) {
      t += 1000;
      s.ingest({ category: 'spin', sessionId: 'sx' });
    }
    const stats = s.stats();
    expect(stats.eventsPerSec).toBeCloseTo(60 / 60, 5);
  });

  it('byCategory filters the buffer in insertion order', () => {
    store.ingest({ category: 'spin', sessionId: 's', gameId: 'g', bet: 1, value: 0 });
    store.ingest({ category: 'win', sessionId: 's', gameId: 'g', bet: 1, value: 2 });
    store.ingest({ category: 'win', sessionId: 's', gameId: 'g', bet: 1, value: 4 });
    const wins = store.byCategory('win');
    expect(wins.length).toBe(2);
    expect(wins.map((e) => e.value)).toEqual([2, 4]);
  });

  it('rollingRtpSeries returns per-sample RTP values', () => {
    store.ingest({ category: 'win', sessionId: 's', gameId: 'g', bet: 2, value: 4 }); // RTP 2.0
    store.ingest({ category: 'win', sessionId: 's', gameId: 'g', bet: 1, value: 0.5 }); // 0.5
    const series = store.rollingRtpSeries('g');
    expect(series).toEqual([2, 0.5]);
  });

  it('reset() clears state but listeners are kept', () => {
    const seen: number[] = [];
    store.onEvent((e) => seen.push(e.eventId));
    store.ingest({ category: 'spin', sessionId: 's' });
    store.reset();
    store.ingest({ category: 'spin', sessionId: 's' });
    expect(store.stats().totalIngested).toBe(1);
    // Listener still fires — eventId restarts at 1.
    expect(seen).toEqual([1, 1]);
  });
});

describe('AnalyticsStore (Postgres backend)', () => {
  let conn: PgConnection;
  let store: AnalyticsStore;

  beforeEach(async () => {
    conn = new PgConnection({ poolFactory: fakePoolFactory() });
    await runMigrations(conn);
    store = new AnalyticsStore({ pg: conn });
  });

  it('writes ingested events to the analytics_events table', async () => {
    store.ingest({ category: 'spin', sessionId: 's1', gameId: 'g1', bet: 1, value: 0 });
    store.ingest({ category: 'win', sessionId: 's1', gameId: 'g1', bet: 1, value: 5 });
    // Allow the best-effort persist to flush.
    await new Promise((r) => setImmediate(r));
    const r = await conn.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM analytics_events'
    );
    expect(Number(r.rows[0].count)).toBe(2);
  });

  it('loadFromPg replays rows into a fresh store', async () => {
    store.ingest({ category: 'spin', sessionId: 's1', gameId: 'g1', bet: 1, value: 0 });
    store.ingest({ category: 'win', sessionId: 's1', gameId: 'g1', bet: 1, value: 3 });
    await new Promise((r) => setImmediate(r));

    const reborn = new AnalyticsStore({ pg: conn });
    const loaded = await reborn.loadFromPg();
    expect(loaded).toBe(2);
    expect(reborn.stats().bufferSize).toBe(2);
    expect(reborn.stats().categoryCounts.win).toBe(1);
    expect(reborn.perGameRtp().find((r) => r.gameId === 'g1')?.spins).toBe(2);
  });
});
