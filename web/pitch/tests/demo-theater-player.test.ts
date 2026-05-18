/**
 * W211 Faza 700.0 — Demo Theater player UI tests.
 *
 * Validates the pure state reducers and renderers without booting
 * jsdom. Mirrors the test style of main.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  createPlayer,
  loadTimeline,
  togglePlay,
  setSpeed,
  setPersona,
  skipDay,
  rewindDay,
  seek,
  tick,
  filterForPersona,
  keyMetrics,
} from '../src/demo-theater-player/state.js';
import {
  renderPlayer,
  renderProgressBar,
  renderPersonaSwitcher,
  renderControls,
  renderKeyMetrics,
  renderFeed,
} from '../src/demo-theater-player/render.js';
import type { Timeline, TimelineEvent } from '../src/demo-theater-player/types.js';

function mockTimeline(): Timeline {
  const events: TimelineEvent[] = [];
  for (let d = 0; d <= 30; d++) {
    events.push({ type: 'canary', day: d, ts: '00:00 UTC', payload: { stage: Math.min(4, Math.floor(d / 7)), rollout_percent: 100, gates_passed: 4, health_score: 0.97 } });
    events.push({ type: 'spin', day: d, ts: '08:00 UTC', payload: { gameId: 'quick-hit-dragons', bet: 1, rtp_running: 0.96, latency_ms: 28 } });
    events.push({ type: 'lab', day: d, ts: '00:00 UTC', payload: { stage: 'pre_submission', days_in_stage: d, lab_name: 'GLI' } });
  }
  events.push({ type: 'anomaly', day: 8, ts: '09:17 UTC', payload: { type: 'wallet_timeout', severity: 'medium', message: 'demo anomaly' } });
  const dailyCounts = Array.from({ length: 31 }, (_, d) => ({
    day: d,
    total: 3,
    byType: { canary: 1, spin: 1, lab: 1 },
    spinVolume: d * 1000,
    canary: { stage: Math.min(4, Math.floor(d / 7)), rolloutPercent: 100 },
    lab: { stage: 'pre_submission', daysInStage: d },
  }));
  return {
    seed: 42,
    days: 30,
    persona: 'cto',
    speed: 300,
    startedAt: new Date(0).toISOString(),
    finishedAt: new Date(0).toISOString(),
    wallTimeMs: 0,
    totalEvents: events.length,
    dailyCounts,
    events,
    consoleLines: ['Day 8, 09:17 UTC: ANOMALY — demo anomaly.'],
  };
}

describe('demo theater player · reducers', () => {
  it('createPlayer returns sane defaults', () => {
    const p = createPlayer();
    expect(p.playheadDay).toBe(0);
    expect(p.speed).toBe(1);
    expect(p.paused).toBe(true);
    expect(p.timeline).toBe(null);
  });

  it('loadTimeline mounts a timeline and resets the playhead', () => {
    const p = loadTimeline(createPlayer(), mockTimeline());
    expect(p.timeline?.days).toBe(30);
    expect(p.playheadDay).toBe(0);
    expect(p.persona).toBe('cto');
  });

  it('togglePlay flips paused', () => {
    const p = loadTimeline(createPlayer(), mockTimeline());
    expect(togglePlay(p).paused).toBe(false);
    expect(togglePlay(togglePlay(p)).paused).toBe(true);
  });

  it('setSpeed snaps to nearest preset', () => {
    const p = loadTimeline(createPlayer(), mockTimeline());
    expect(setSpeed(p, 3).speed).toBe(2);
    expect(setSpeed(p, 5).speed).toBe(5);
    expect(setSpeed(p, 0.4).speed).toBe(0.5);
  });

  it('setPersona swaps persona', () => {
    const p = loadTimeline(createPlayer(), mockTimeline());
    expect(setPersona(p, 'cmo').persona).toBe('cmo');
  });

  it('skipDay and rewindDay step the playhead', () => {
    let p = loadTimeline(createPlayer(), mockTimeline());
    p = skipDay(p);
    p = skipDay(p);
    expect(p.playheadDay).toBe(2);
    p = rewindDay(p);
    expect(p.playheadDay).toBe(1);
  });

  it('seek clamps to [0, days]', () => {
    const p = loadTimeline(createPlayer(), mockTimeline());
    expect(seek(p, -10).playheadDay).toBe(0);
    expect(seek(p, 1000).playheadDay).toBe(30);
    expect(seek(p, 15).playheadDay).toBe(15);
  });

  it('tick advances playhead while playing and returns crossed events', () => {
    let p = loadTimeline(createPlayer(), mockTimeline());
    p = togglePlay(p);
    const { state: s2, crossed } = tick(p, 10000);
    expect(s2.playheadDay).toBeGreaterThan(p.playheadDay);
    expect(crossed.length).toBeGreaterThan(0);
  });

  it('tick is a no-op while paused', () => {
    const p = loadTimeline(createPlayer(), mockTimeline());
    const { state: s2, crossed } = tick(p, 10000);
    expect(s2.playheadDay).toBe(p.playheadDay);
    expect(crossed.length).toBe(0);
  });

  it('filterForPersona narrows events appropriately', () => {
    const t = mockTimeline();
    expect(filterForPersona(t.events, 'cto').length).toBeGreaterThan(0);
    expect(filterForPersona(t.events, 'cmo').every((e) => ['spin', 'operator', 'lab'].includes(e.type))).toBe(true);
  });

  it('keyMetrics exposes canary stage at the playhead', () => {
    let p = loadTimeline(createPlayer(), mockTimeline());
    p = seek(p, 21);
    const km = keyMetrics(p);
    expect(km.currentDay).toBe(21);
    expect(km.daysRemaining).toBe(9);
  });
});

describe('demo theater player · renderers', () => {
  it('renderPlayer produces a string containing all panels', () => {
    const p = loadTimeline(createPlayer(), mockTimeline());
    const html = renderPlayer(p);
    expect(html).toContain('theater-player');
    expect(html).toContain('tp-progress');
    expect(html).toContain('tp-personas');
    expect(html).toContain('tp-controls');
  });

  it('renderProgressBar reflects playhead', () => {
    let p = loadTimeline(createPlayer(), mockTimeline());
    p = seek(p, 15);
    const html = renderProgressBar(p);
    expect(html).toContain('Day 15');
  });

  it('renderPersonaSwitcher highlights active persona', () => {
    let p = loadTimeline(createPlayer(), mockTimeline());
    p = setPersona(p, 'cfo');
    const html = renderPersonaSwitcher(p);
    expect(html).toMatch(/is-active[^>]*>CFO/);
  });

  it('renderControls includes a Play/Pause button', () => {
    const p = loadTimeline(createPlayer(), mockTimeline());
    expect(renderControls(p)).toContain('Play');
  });

  it('renderKeyMetrics reports playhead day', () => {
    let p = loadTimeline(createPlayer(), mockTimeline());
    p = seek(p, 7);
    expect(renderKeyMetrics(p)).toContain('Day 7');
  });

  it('renderFeed renders three columns', () => {
    let p = loadTimeline(createPlayer(), mockTimeline());
    p = seek(p, 10);
    const html = renderFeed(p);
    expect(html).toContain('Spins');
    expect(html).toContain('Canary');
    expect(html).toContain('Alerts');
  });
});
