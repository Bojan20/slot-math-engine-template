// CORTI 200.8 — production stats dashboard data tests.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT  = resolve(__dirname, '../../..');
const DATA_PATH  = resolve(REPO_ROOT, 'web/production/data.json');
const AUDIO_PATH = resolve(REPO_ROOT, 'web/studio/audio/library.json');

let data: { games: Array<{ id: string; daily_revenue_usd: number; rtp: number; hit_freq: number; error_rate: number; hourly_revenue_usd: number[]; jurisdiction: string; cabinet: string }>; jurisdictions: string[]; cabinets: string[] };
let audio: { cues: Array<{ id: string; tier: string; duration_s: number }>; tiers: string[] };

beforeAll(() => {
  data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  audio = JSON.parse(readFileSync(AUDIO_PATH, 'utf8'));
});

describe('Production stats dashboard data', () => {
  it('data.json exists', () => {
    expect(existsSync(DATA_PATH)).toBe(true);
  });

  it('contains at least 50 production games', () => {
    expect(data.games.length).toBeGreaterThanOrEqual(50);
  });

  it('every game has daily_revenue between $1K and $50K', () => {
    for (const g of data.games) {
      expect(g.daily_revenue_usd).toBeGreaterThanOrEqual(1000);
      expect(g.daily_revenue_usd).toBeLessThanOrEqual(50000);
    }
  });

  it('every game has 24 hourly_revenue points', () => {
    for (const g of data.games) {
      expect(g.hourly_revenue_usd.length).toBe(24);
    }
  });

  it('every game has RTP in [0.92, 0.98]', () => {
    for (const g of data.games) {
      expect(g.rtp).toBeGreaterThanOrEqual(0.92);
      expect(g.rtp).toBeLessThanOrEqual(0.98);
    }
  });

  it('error rates are below 1%', () => {
    for (const g of data.games) {
      expect(g.error_rate).toBeLessThan(0.01);
    }
  });

  it('jurisdictions list has at least 5 entries', () => {
    expect(data.jurisdictions.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Audio library — cue catalog', () => {
  it('library.json exists', () => {
    expect(existsSync(AUDIO_PATH)).toBe(true);
  });

  it('contains at least 60 audio cues', () => {
    expect(audio.cues.length).toBeGreaterThanOrEqual(60);
  });

  it('every cue has id + tier + duration_s', () => {
    for (const cue of audio.cues) {
      expect(cue.id.length).toBeGreaterThan(0);
      expect(audio.tiers).toContain(cue.tier);
      expect(cue.duration_s).toBeGreaterThan(0);
      expect(cue.duration_s).toBeLessThanOrEqual(5);
    }
  });

  it('exposes 7 tier categories', () => {
    expect(audio.tiers).toEqual(['spin', 'stop', 'win', 'fs', 'hw', 'cascade', 'ui']);
  });

  it('every tier has at least 10 cues', () => {
    for (const tier of audio.tiers) {
      const inTier = audio.cues.filter((c) => c.tier === tier);
      expect(inTier.length, tier).toBeGreaterThanOrEqual(10);
    }
  });

  it('cue ids are unique', () => {
    const ids = audio.cues.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
