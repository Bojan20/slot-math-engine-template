/**
 * W152 Wave 16 — 3D RTP heatmap tests.
 */

import { describe, it, expect } from 'vitest';
import { Heatmap3d } from '../src/observability/heatmap3d.js';

const HOUR = 60 * 60 * 1000;

describe('Heatmap3d construction guards', () => {
  it('throws on non-positive bucketWidthMs', () => {
    expect(() => new Heatmap3d({ bucketWidthMs: 0 })).toThrow(RangeError);
    expect(() => new Heatmap3d({ bucketWidthMs: -1 })).toThrow(RangeError);
    expect(() => new Heatmap3d({ bucketWidthMs: NaN })).toThrow(RangeError);
  });
  it('accepts default 1-hour bucket', () => {
    const h = new Heatmap3d();
    expect(h.bucketStartFor(HOUR + 30000)).toBe(HOUR);
  });
});

describe('Heatmap3d.bucketStartFor', () => {
  it('floors timestamps to bucket boundary', () => {
    const h = new Heatmap3d({ bucketWidthMs: HOUR });
    expect(h.bucketStartFor(0)).toBe(0);
    expect(h.bucketStartFor(HOUR - 1)).toBe(0);
    expect(h.bucketStartFor(HOUR)).toBe(HOUR);
    expect(h.bucketStartFor(HOUR + 1)).toBe(HOUR);
  });
});

describe('Heatmap3d.record — happy path', () => {
  it('creates and aggregates a single cell', () => {
    const h = new Heatmap3d({ clock: () => 0 });
    h.record({ symbol: 'WILD', position: 0, payoutUnits: 50, betUnits: 100 });
    h.record({ symbol: 'WILD', position: 0, payoutUnits: 30, betUnits: 100 });
    const cell = h.cellAt(0, 'WILD', 0);
    expect(cell).not.toBeNull();
    expect(cell!.spins).toBe(2);
    expect(cell!.totalPayoutUnits).toBe(80);
    expect(cell!.totalBetUnits).toBe(200);
    expect(cell!.rtp).toBeCloseTo(0.4, 9);
  });

  it('partitions by symbol + position', () => {
    const h = new Heatmap3d({ clock: () => 0 });
    h.record({ symbol: 'A', position: 0, payoutUnits: 10, betUnits: 100 });
    h.record({ symbol: 'A', position: 1, payoutUnits: 20, betUnits: 100 });
    h.record({ symbol: 'B', position: 0, payoutUnits: 30, betUnits: 100 });
    expect(h.cellCount()).toBe(3);
  });

  it('partitions by time bucket', () => {
    let now = 0;
    const h = new Heatmap3d({ clock: () => now });
    h.record({ symbol: 'A', position: 0, payoutUnits: 10, betUnits: 100 });
    now = HOUR + 1;
    h.record({ symbol: 'A', position: 0, payoutUnits: 50, betUnits: 100 });
    expect(h.buckets()).toEqual([0, HOUR]);
    expect(h.cellAt(0, 'A', 0)!.rtp).toBeCloseTo(0.1);
    expect(h.cellAt(HOUR, 'A', 0)!.rtp).toBeCloseTo(0.5);
  });

  it('honours timestampMs override on record', () => {
    const h = new Heatmap3d({ clock: () => 99999 });
    h.record({
      symbol: 'A',
      position: 0,
      payoutUnits: 10,
      betUnits: 100,
      timestampMs: 0,
    });
    expect(h.buckets()).toEqual([0]);
  });

  it('cellAt returns null for untouched coords', () => {
    const h = new Heatmap3d({ clock: () => 0 });
    h.record({ symbol: 'A', position: 0, payoutUnits: 0, betUnits: 0 });
    expect(h.cellAt(0, 'B', 0)).toBeNull();
    expect(h.cellAt(0, 'A', 5)).toBeNull();
    expect(h.cellAt(HOUR, 'A', 0)).toBeNull();
  });
});

describe('Heatmap3d.record — input guards', () => {
  it('rejects negative payout/bet', () => {
    const h = new Heatmap3d({ clock: () => 0 });
    expect(() => h.record({ symbol: 'A', position: 0, payoutUnits: -1, betUnits: 0 })).toThrow();
    expect(() => h.record({ symbol: 'A', position: 0, payoutUnits: 0, betUnits: -1 })).toThrow();
  });
  it('rejects non-finite payout/bet', () => {
    const h = new Heatmap3d({ clock: () => 0 });
    expect(() => h.record({ symbol: 'A', position: 0, payoutUnits: Infinity, betUnits: 0 })).toThrow();
    expect(() => h.record({ symbol: 'A', position: 0, payoutUnits: NaN, betUnits: 0 })).toThrow();
  });
  it('rejects negative or non-integer position', () => {
    const h = new Heatmap3d({ clock: () => 0 });
    expect(() => h.record({ symbol: 'A', position: -1, payoutUnits: 0, betUnits: 0 })).toThrow();
    expect(() => h.record({ symbol: 'A', position: 0.5, payoutUnits: 0, betUnits: 0 })).toThrow();
  });
});

describe('Heatmap3d.compareBuckets', () => {
  it('reports per-cell drift sorted by absDelta', () => {
    let now = 0;
    const h = new Heatmap3d({ clock: () => now });
    // Bucket 0
    h.record({ symbol: 'A', position: 0, payoutUnits: 50, betUnits: 100 }); // RTP 0.5
    h.record({ symbol: 'B', position: 0, payoutUnits: 90, betUnits: 100 }); // RTP 0.9
    // Bucket HOUR
    now = HOUR;
    h.record({ symbol: 'A', position: 0, payoutUnits: 80, betUnits: 100 }); // RTP 0.8 (delta +0.3)
    h.record({ symbol: 'B', position: 0, payoutUnits: 95, betUnits: 100 }); // RTP 0.95 (delta +0.05)
    const rows = h.compareBuckets(0, HOUR);
    expect(rows[0].symbol).toBe('A'); // larger absDelta first
    expect(rows[0].absDelta).toBeCloseTo(0.3, 9);
    expect(rows[0].relDelta).toBeCloseTo(0.6, 9);
  });

  it('handles cells unique to one side', () => {
    const h = new Heatmap3d({ clock: () => 0 });
    h.record({ symbol: 'A', position: 0, payoutUnits: 50, betUnits: 100 });
    const rows = h.compareBuckets(0, HOUR);
    expect(rows).toHaveLength(1);
    expect(rows[0].rtpA).toBeCloseTo(0.5);
    expect(rows[0].rtpB).toBe(0);
  });

  it('relDelta is null when rtpA is 0', () => {
    let now = 0;
    const h = new Heatmap3d({ clock: () => now });
    h.record({ symbol: 'A', position: 0, payoutUnits: 0, betUnits: 100 });
    now = HOUR;
    h.record({ symbol: 'A', position: 0, payoutUnits: 50, betUnits: 100 });
    const rows = h.compareBuckets(0, HOUR);
    expect(rows[0].rtpA).toBe(0);
    expect(rows[0].relDelta).toBeNull();
  });
});

describe('Heatmap3d.toJSON / toDenseTensor', () => {
  it('toJSON returns flat sorted array', () => {
    let now = 0;
    const h = new Heatmap3d({ clock: () => now });
    h.record({ symbol: 'B', position: 1, payoutUnits: 10, betUnits: 100 });
    h.record({ symbol: 'A', position: 0, payoutUnits: 20, betUnits: 100 });
    now = HOUR;
    h.record({ symbol: 'A', position: 0, payoutUnits: 30, betUnits: 100 });
    const json = h.toJSON();
    expect(json).toHaveLength(3);
    // Sort: bucket → symbol → position
    expect(json[0]).toMatchObject({ bucketStartMs: 0, symbol: 'A', position: 0 });
    expect(json[1]).toMatchObject({ bucketStartMs: 0, symbol: 'B', position: 1 });
    expect(json[2]).toMatchObject({ bucketStartMs: HOUR, symbol: 'A', position: 0 });
  });

  it('toDenseTensor produces a dense [bucket][symbol][position] cube', () => {
    let now = 0;
    const h = new Heatmap3d({ clock: () => now });
    h.record({ symbol: 'A', position: 0, payoutUnits: 50, betUnits: 100 });
    h.record({ symbol: 'B', position: 2, payoutUnits: 75, betUnits: 100 });
    now = HOUR;
    h.record({ symbol: 'A', position: 1, payoutUnits: 20, betUnits: 100 });
    const t = h.toDenseTensor();
    expect(t.buckets).toEqual([0, HOUR]);
    expect(t.symbols).toEqual(['A', 'B']);
    expect(t.positions).toEqual([0, 1, 2]);
    expect(t.rtpTensor.length).toBe(2);
    expect(t.rtpTensor[0][0]).toEqual([0.5, 0, 0]); // bucket 0, A
    expect(t.rtpTensor[0][1]).toEqual([0, 0, 0.75]); // bucket 0, B
    expect(t.rtpTensor[1][0]).toEqual([0, 0.2, 0]); // bucket HOUR, A
    expect(t.rtpTensor[1][1]).toEqual([0, 0, 0]); // bucket HOUR, B (untouched)
  });

  it('toDenseTensor on empty heatmap returns empty axes', () => {
    const h = new Heatmap3d();
    const t = h.toDenseTensor();
    expect(t.buckets).toEqual([]);
    expect(t.symbols).toEqual([]);
    expect(t.positions).toEqual([]);
    expect(t.rtpTensor).toEqual([]);
  });
});
