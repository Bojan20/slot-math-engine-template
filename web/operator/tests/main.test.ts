// Operator dashboard unit tests. We test the PROJECTION layer:
// filters, A/B promotion gate, compliance aggregation, RTP series.
// DOM rendering is not under test here — that's covered by the live
// vite dev server + manual QA.

import { describe, it, expect } from 'vitest';
import { filterGames, filterSubmissions, sortBy } from '@shared/filters.js';
import { toCsv } from '@shared/csv.js';
import {
  computeCompliance,
  isAnomaly,
  makeRtpSeries,
  promoteWinner,
  hashStr,
  mulberry32,
} from '../src/data.js';
import gamesJson from '../data/mock-games.json' assert { type: 'json' };
import abJson from '../data/mock-ab-tests.json' assert { type: 'json' };
import subsJson from '../data/mock-submissions.json' assert { type: 'json' };
import type { OperatorGame, ABTest, Submission } from '@shared/types.js';

const GAMES = gamesJson.games as OperatorGame[];
const ABS   = abJson.tests as ABTest[];
const SUBS  = subsJson.submissions as Submission[];

describe('operator · mock-data integrity', () => {
  it('mock-games.json contains 64 well-formed games (≥60 required)', () => {
    expect(GAMES.length).toBeGreaterThanOrEqual(60);
    for (const g of GAMES) {
      expect(g.gameId).toMatch(/^[\w-]+$/);
      expect(g.rtp).toBeGreaterThan(0.85);
      expect(g.rtp).toBeLessThan(1.0);
      expect(['live', 'paused', 'draft', 'archived', 'pending']).toContain(g.status);
    }
  });

  it('mock-ab-tests.json has 10 entries with valid A/B variants', () => {
    expect(ABS.length).toBe(10);
    for (const t of ABS) {
      expect(t.variantA.rtp).toBeGreaterThan(0);
      expect(t.variantB.rtp).toBeGreaterThan(0);
      expect(t.trafficSplitB).toBeGreaterThanOrEqual(0);
      expect(t.trafficSplitB).toBeLessThanOrEqual(1);
    }
  });

  it('mock-submissions.json has 20 entries with reviewable status', () => {
    expect(SUBS.length).toBe(20);
    const statuses = new Set(SUBS.map((s) => s.status));
    expect(statuses.size).toBeGreaterThanOrEqual(3);
  });
});

describe('operator · game library filter', () => {
  it('returns all games for an empty filter', () => {
    expect(filterGames(GAMES, {}).length).toBe(GAMES.length);
  });

  it('search matches name and pid (case-insensitive)', () => {
    const r = filterGames(GAMES, { search: 'wizard' });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].name.toLowerCase()).toContain('wizard');
  });

  it('jurisdiction filter only returns games deployed there', () => {
    const r = filterGames(GAMES, { jurisdiction: 'UKGC' });
    expect(r.length).toBeGreaterThan(0);
    for (const g of r) expect(g.jurisdictions).toContain('UKGC');
  });

  it('rtp range is inclusive on both sides', () => {
    const r = filterGames(GAMES, { rtpMin: 0.96, rtpMax: 0.97 });
    for (const g of r) {
      expect(g.rtp).toBeGreaterThanOrEqual(0.96);
      expect(g.rtp).toBeLessThanOrEqual(0.97);
    }
  });

  it('status="any" is a no-op', () => {
    const a = filterGames(GAMES, { status: 'any' });
    expect(a.length).toBe(GAMES.length);
  });
});

describe('operator · RTP monitoring', () => {
  it('makeRtpSeries returns the requested bucket count and stable order', () => {
    const g = GAMES[0];
    const s = makeRtpSeries(g, 24);
    expect(s.length).toBe(24);
    for (let i = 1; i < s.length; i++) expect(s[i].timestamp).toBeGreaterThan(s[i - 1].timestamp);
  });

  it('series is deterministic by gameId (mulberry32 + fnv-1a)', () => {
    const a = makeRtpSeries(GAMES[0], 12);
    const b = makeRtpSeries(GAMES[0], 12);
    expect(a.map((s) => s.rtp)).toEqual(b.map((s) => s.rtp));
  });

  it('isAnomaly flags > 2pp deviation', () => {
    const baseline = 0.95;
    const series = [
      { gameId: 'x', timestamp: 0, rtp: 0.95, spins: 1 },
      { gameId: 'x', timestamp: 0, rtp: 0.91, spins: 1 },
    ];
    expect(isAnomaly(series, baseline, 0.02)).toBe(true);
  });

  it('hashStr + mulberry32 produce reproducible PRNG output', () => {
    const r1 = mulberry32(hashStr('lw-001'));
    const r2 = mulberry32(hashStr('lw-001'));
    for (let i = 0; i < 8; i++) expect(r1()).toBe(r2());
  });
});

describe('operator · A/B promotion gate', () => {
  it('returns null when delta < 1pp', () => {
    const t: ABTest = { ...ABS[2] };
    expect(promoteWinner(t, 1)).toBe(null);
  });

  it('returns "B" when variant B beats A by >= 1pp', () => {
    const t: ABTest = {
      testId: 'x', gameId: 'g', startedAt: '2026-01-01', status: 'running', jurisdiction: 'UKGC', trafficSplitB: 0.5,
      variantA: { rtp: 0.94, spinsToDate: 1, winRate: 0.3 },
      variantB: { rtp: 0.955, spinsToDate: 1, winRate: 0.31 },
    };
    expect(promoteWinner(t, 1)).toBe('B');
  });

  it('returns "A" when variant A beats B by >= 1pp', () => {
    const t: ABTest = {
      testId: 'x', gameId: 'g', startedAt: '2026-01-01', status: 'running', jurisdiction: 'UKGC', trafficSplitB: 0.5,
      variantA: { rtp: 0.965, spinsToDate: 1, winRate: 0.3 },
      variantB: { rtp: 0.95, spinsToDate: 1, winRate: 0.31 },
    };
    expect(promoteWinner(t, 1)).toBe('A');
  });
});

describe('operator · submission queue', () => {
  it('filterSubmissions matches by status', () => {
    const r = filterSubmissions(SUBS, { status: 'approved' });
    expect(r.length).toBeGreaterThan(0);
    for (const s of r) expect(s.status).toBe('approved');
  });

  it('filterSubmissions matches operator/name search', () => {
    const r = filterSubmissions(SUBS, { search: 'cascade' });
    expect(r.length).toBeGreaterThan(0);
    for (const s of r) expect(s.gameName.toLowerCase()).toContain('cascade');
  });

  it('sortBy desc on submittedAt newest-first', () => {
    const r = sortBy(SUBS, (s) => s.submittedAt, 'desc');
    for (let i = 1; i < r.length; i++) expect(r[i - 1].submittedAt >= r[i].submittedAt).toBe(true);
  });
});

describe('operator · compliance overview', () => {
  it('returns one row per of the 15 supported jurisdictions', () => {
    const cells = computeCompliance(GAMES, SUBS);
    expect(cells.length).toBe(15);
  });

  it('live counts sum >= number of live deployments (multi-jur games count multiple times)', () => {
    const cells = computeCompliance(GAMES, SUBS);
    const totalLive = cells.reduce((a, c) => a + c.liveCount, 0);
    const liveGames = GAMES.filter((g) => g.status === 'live' && g.jurisdictions.length > 0);
    expect(totalLive).toBeGreaterThanOrEqual(liveGames.length);
  });

  it('records violations for rejected and needs_revision submissions', () => {
    const cells = computeCompliance(GAMES, SUBS);
    const total = cells.reduce((a, c) => a + c.violationCount, 0);
    const rejNeeds = SUBS.filter((s) => s.status === 'rejected' || s.status === 'needs_revision').length;
    expect(total).toBe(rejNeeds);
  });
});

describe('operator · csv shared helper sanity', () => {
  it('emits an RFC 4180-lite header + body', () => {
    const csv = toCsv([{ a: 1, b: 'two,3' }], ['a', 'b']);
    expect(csv.split('\n')[0]).toBe('a,b');
    expect(csv).toContain('"two,3"');
  });
});
