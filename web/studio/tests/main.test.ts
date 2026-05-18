// Studio engine-bridge tests. We do NOT test the engine itself (that's
// covered by the 5351 vitest specs in the root project) — we test the
// PROJECTION layer: studio variant → IR → validate → round-trip.

import { describe, it, expect } from 'vitest';
import { buildIRFromVariant, computeLiveRTP, validateIRBlob, roundTripIR } from '../src/engine.js';
import type { StudioVariant } from '../src/types.js';

function makeVariant(overrides: Partial<StudioVariant> = {}): StudioVariant {
  const base: StudioVariant = {
    id: 'var-test',
    name: 'Test',
    tierCounts: { HP: 3, MP: 3, LP: 3, WILD: 1, SCATTER: 1, MULT: 0 },
    symbols: [
      { tier: 'HP', id: 'HP1', name: 'Sapphire', icon: 'diamond', weight: 3.5, pay: { x3: 50, x4: 150, x5: 500 } },
      { tier: 'HP', id: 'HP2', name: 'Ruby', icon: 'prism', weight: 3.5, pay: { x3: 50, x4: 150, x5: 500 } },
      { tier: 'HP', id: 'HP3', name: 'Emerald', icon: 'crystal', weight: 3.5, pay: { x3: 50, x4: 150, x5: 500 } },
      { tier: 'MP', id: 'MP1', name: 'Crown', icon: 'hexagon', weight: 5.2, pay: { x3: 20, x4: 60, x5: 200 } },
      { tier: 'MP', id: 'MP2', name: 'Compass', icon: 'star5', weight: 5.2, pay: { x3: 20, x4: 60, x5: 200 } },
      { tier: 'MP', id: 'MP3', name: 'Coin', icon: 'octagon', weight: 5.2, pay: { x3: 20, x4: 60, x5: 200 } },
      { tier: 'LP', id: 'LP1', name: 'Sphere', icon: 'pebble', weight: 8.0, pay: { x3: 5, x4: 20, x5: 75 } },
      { tier: 'LP', id: 'LP2', name: 'Block', icon: 'wave', weight: 8.0, pay: { x3: 5, x4: 20, x5: 75 } },
      { tier: 'LP', id: 'LP3', name: 'Spire', icon: 'arc', weight: 8.0, pay: { x3: 5, x4: 20, x5: 75 } },
      { tier: 'WILD', id: 'WILD1', name: 'Wild', icon: 'wild', weight: 1.5, pay: { x3: 0, x4: 0, x5: 0 } },
      { tier: 'SCATTER', id: 'SCATTER1', name: 'Scatter', icon: 'scatter', weight: 1.5, pay: { x3: 5, x4: 20, x5: 100 } },
    ],
    reels: [],
    rtp: 95.42,
    rtpTarget: 95.5,
    hit: 27.83,
    sigma: 8.41,
    maxWin: 5000,
    vola: 'MID',
    activePreset: 'standard',
    activity: [],
    lastSavedAt: Date.now(),
  };
  return { ...base, ...overrides };
}

describe('engine bridge — buildIRFromVariant', () => {
  it('produces a SlotGameIR with the expected top-level keys', () => {
    const ir = buildIRFromVariant(makeVariant(), { workspaceName: 'WS', variantId: 'var-test' });
    expect(ir.schema_version).toBe('1.0.0');
    expect(ir.meta.name).toContain('WS');
    expect(ir.symbols.length).toBe(11);
    expect(ir.reels.mode).toBe('weighted');
    expect(ir.evaluation.kind).toBe('lines');
    expect(Object.keys(ir.paytable).length).toBe(11);
  });

  it('marks the wild symbol with substitutes "*"', () => {
    const ir = buildIRFromVariant(makeVariant(), { workspaceName: 'WS', variantId: 'var-test' });
    const wild = ir.symbols.find((s) => s.id === 'WILD1');
    expect(wild?.substitutes).toBe('*');
  });

  it('adds free_spins feature when a scatter is present', () => {
    const ir = buildIRFromVariant(makeVariant(), { workspaceName: 'WS', variantId: 'var-test' });
    expect(ir.features.some((f) => f.kind === 'free_spins')).toBe(true);
  });

  it('omits free_spins when scatter tier count is 0', () => {
    const v = makeVariant();
    v.symbols = v.symbols.filter((s) => s.tier !== 'SCATTER');
    v.tierCounts.SCATTER = 0;
    const ir = buildIRFromVariant(v, { workspaceName: 'WS', variantId: 'var-test' });
    expect(ir.features.length).toBe(0);
  });
});

describe('engine bridge — validateIRBlob', () => {
  it('accepts a freshly built IR', () => {
    const ir = buildIRFromVariant(makeVariant(), { workspaceName: 'WS', variantId: 'var-test' });
    const report = validateIRBlob(ir);
    expect(report.ok).toBe(true);
    expect(report.issueCount).toBe(0);
  });

  it('rejects an obviously invalid blob', () => {
    const report = validateIRBlob({ schema_version: 'nope', meta: {} });
    expect(report.ok).toBe(false);
    expect(report.issueCount).toBeGreaterThan(0);
  });

  it('rejects a partial-shape blob (missing topology)', () => {
    const ir = buildIRFromVariant(makeVariant(), { workspaceName: 'WS', variantId: 'var-test' });
    const mutable = ir as unknown as Record<string, unknown>;
    delete mutable.topology;
    const report = validateIRBlob(mutable);
    expect(report.ok).toBe(false);
  });
});

describe('engine bridge — round-trip', () => {
  it('survives JSON.stringify → JSON.parse → validate cycle', () => {
    const ir = buildIRFromVariant(makeVariant(), { workspaceName: 'WS', variantId: 'var-test' });
    const rt = roundTripIR(ir);
    expect(rt.ok).toBe(true);
    expect(rt.issues).toEqual([]);
  });
});

describe('engine bridge — computeLiveRTP', () => {
  it('returns a non-zero RTP for a populated variant', () => {
    const live = computeLiveRTP(makeVariant(), 5, 3, 20);
    expect(live.fromEngine).toBe(true);
    expect(live.rtp).toBeGreaterThan(0);
    expect(live.computedAtMs).toBeGreaterThanOrEqual(0);
    expect(['Low', 'Medium', 'High', 'Very High']).toContain(live.volatility.class);
  });

  it('handles empty paytable gracefully (fallback path)', () => {
    const v = makeVariant();
    v.symbols = [];
    const live = computeLiveRTP(v, 5, 3, 20);
    // estimateFullRtp with empty paytable returns 0 — that counts as
    // engine-OK, not a fallback. We only assert it doesn't throw.
    expect(typeof live.rtp).toBe('number');
  });
});
