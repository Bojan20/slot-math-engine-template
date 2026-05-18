/**
 * CORTI W207-ANALYTICS — RTP drift detector (Welford + EWMA + z-score).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RtpDriftDetector } from '../lib/rtp-drift-detector.js';

describe('RtpDriftDetector', () => {
  let det: RtpDriftDetector;
  beforeEach(() => {
    det = new RtpDriftDetector({ minSpins: 10, rollingDeltaPp: 2, zThreshold: 3, ewmaAlpha: 0.05 });
    det.setExpected('g1', 0.96);
  });

  it('does not alert under minSpins', () => {
    for (let i = 0; i < 9; i++) {
      const a = det.record('g1', 1, 0.96, 0.96);
      expect(a).toBeNull();
    }
  });

  it('Welford mean equals the arithmetic mean over identical samples', () => {
    for (let i = 0; i < 200; i++) det.record('g1', 1, 0.96);
    const s = det.snapshot('g1')!;
    expect(s.mean).toBeCloseTo(0.96, 6);
    expect(s.variance).toBeCloseTo(0, 6);
  });

  it('EWMA converges toward the running sample mean', () => {
    for (let i = 0; i < 500; i++) det.record('g1', 1, 0.5);
    const s = det.snapshot('g1')!;
    expect(s.ewma).toBeGreaterThan(0.45);
    expect(s.ewma).toBeLessThan(0.55);
  });

  it('triggers a rolling_window alert when 1000-spin mean drifts > 2pp', () => {
    const d = new RtpDriftDetector({
      minSpins: 100,
      rollingDeltaPp: 2,
      zThreshold: 99, // disable z-score
      outlierThreshold: 99, // disable consecutive
    });
    d.setExpected('g', 0.96);
    let last = null;
    // Big drift: pay 0.5 vs expected 0.96 — 1000-spin window will be 0.5.
    for (let i = 0; i < 1000; i++) {
      last = d.record('g', 1, 0.5);
    }
    expect(last).not.toBeNull();
    expect(last!.trigger).toBe('rolling_window');
    expect(Math.abs(last!.delta)).toBeGreaterThan(0.02);
  });

  it('triggers a z_score alert when running mean is far from expected', () => {
    const d = new RtpDriftDetector({
      minSpins: 100,
      rollingDeltaPp: 999, // disable rolling
      zThreshold: 3,
      outlierThreshold: 99, // disable consecutive
    });
    d.setExpected('g', 0.96);
    // Tight distribution around 0.60 — mean is far from expected 0.96.
    // Small std-dev → big z-score, since z = (mean-expected) / (std/√n).
    let alert = null;
    for (let i = 0; i < 500; i++) {
      // alternate 0.59 / 0.61 → mean ≈ 0.60, small variance.
      alert = d.record('g', 1, i % 2 === 0 ? 0.59 : 0.61) ?? alert;
    }
    expect(alert).not.toBeNull();
    expect(alert!.trigger).toBe('z_score');
  });

  it('triggers consecutive_outliers after 3 outlier samples in a row', () => {
    const d = new RtpDriftDetector({
      minSpins: 10,
      rollingDeltaPp: 999,
      zThreshold: 999,
      outlierThreshold: 1.0,
    });
    d.setExpected('g', 0.96);
    // Build small variance with stable samples first.
    for (let i = 0; i < 50; i++) d.record('g', 1, 0.96);
    // Now feed extreme samples — should cross outlier threshold ≥3x.
    let last = null;
    for (let i = 0; i < 3; i++) last = d.record('g', 1, 50);
    expect(last).not.toBeNull();
    expect(last!.trigger).toBe('consecutive_outliers');
  });

  it('alert severity escalates with delta magnitude', () => {
    const d = new RtpDriftDetector({ minSpins: 100, rollingDeltaPp: 2, zThreshold: 999, outlierThreshold: 999 });
    d.setExpected('g', 0.96);
    let last = null;
    for (let i = 0; i < 1000; i++) last = d.record('g', 1, 0.5); // delta ≈ 0.46
    expect(last!.severity).toBe('critical');
  });

  it('listeners receive every alert', () => {
    const d = new RtpDriftDetector({ minSpins: 100, rollingDeltaPp: 2, zThreshold: 999, outlierThreshold: 999 });
    d.setExpected('g', 0.96);
    const events: string[] = [];
    d.onAlert((a) => events.push(a.trigger));
    for (let i = 0; i < 1000; i++) d.record('g', 1, 0.5);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((t) => t === 'rolling_window')).toBe(true);
  });

  it('recentAlerts filters by gameId', () => {
    const d = new RtpDriftDetector({ minSpins: 100, rollingDeltaPp: 2, zThreshold: 999, outlierThreshold: 999 });
    d.setExpected('a', 0.96);
    d.setExpected('b', 0.96);
    for (let i = 0; i < 1000; i++) d.record('a', 1, 0.5);
    for (let i = 0; i < 1000; i++) d.record('b', 1, 0.8);
    expect(d.recentAlerts('a').every((x) => x.gameId === 'a')).toBe(true);
    expect(d.recentAlerts('b').every((x) => x.gameId === 'b')).toBe(true);
  });

  it('snapshot() returns null for an unknown game', () => {
    expect(det.snapshot('nope')).toBeNull();
  });

  it('reset() clears state and alerts', () => {
    for (let i = 0; i < 200; i++) det.record('g1', 1, 0.5);
    expect(det.recentAlerts().length).toBeGreaterThan(0);
    det.reset();
    expect(det.recentAlerts().length).toBe(0);
    expect(det.snapshot('g1')).toBeNull();
  });

  it('record() does nothing when bet ≤ 0', () => {
    const a = det.record('g1', 0, 0);
    expect(a).toBeNull();
    expect(det.snapshot('g1')!.spins).toBe(0);
  });
});
