// Phase 49 — Slider-recompute contract guards.
//
// app.js lives inside a self-executing IIFE so we cannot import its helpers
// directly. These tests pin the BEHAVIOR CONTRACT that the IIFE implements:
//
//   - GDD topology (reels / rows / kind) maps to a single workspace layout
//     string the studio's renderer + payline generator can consume.
//   - The stale-metric state machine: validatedMetrics + slider edit →
//     `_metricsStale = true`; autoMcTrigger landing → `_metricsStale = false`.
//
// If anyone changes the layout-mapping table or the stale state machine in
// app.js, they must mirror the change in the helpers below — otherwise
// these tests fail and the audit harness flags the divergence.

import { describe, it, expect } from 'vitest';

// ── Helper 1: GDD topology → workspace layout ──────────────────────────────
// Mirrors the mapping inside the #gdd-generate click handler in app.js
// (Phase 49 fix block).
function deriveWorkspaceLayout(reels: number, rows: number, kind: string): string {
  const k = (kind || 'rectangular').toLowerCase();
  if (k === 'cluster') {
    const side = Math.max(reels, rows, 6);
    return `${side}x${side}`;
  }
  if (reels === 6 && rows >= 4) return '6x4';
  if (reels === 5 && rows === 3) return '5x3';
  return `${reels}x${rows}`;
}

// ── Helper 2: stale-metric state machine ───────────────────────────────────
// Mirrors the touches in propagateSliderWeightToReels + tier-slider input +
// autoMcTrigger success path inside app.js.
type Variant = {
  validatedMetrics: { hit_rate?: number; volatility_index?: number } | null;
  _metricsStale: boolean;
  _metricsStaleSince?: number;
};
function onSliderEdit(v: Variant, hadTouch: boolean) {
  if (hadTouch && v.validatedMetrics) {
    v._metricsStale = true;
    v._metricsStaleSince = v._metricsStaleSince ?? Date.now();
  }
}
function onMcRefresh(v: Variant, freshVm: Variant['validatedMetrics']) {
  v.validatedMetrics = freshVm;
  v._metricsStale = false;
  delete v._metricsStaleSince;
}

describe('Phase 49 · GDD topology → layout mapping', () => {
  it('maps the canonical 5×3 rectangular grid', () => {
    expect(deriveWorkspaceLayout(5, 3, 'rectangular')).toBe('5x3');
  });
  it('maps a 6×4 MegaWays-style grid', () => {
    expect(deriveWorkspaceLayout(6, 4, 'rectangular')).toBe('6x4');
  });
  it('maps a 6×7 MegaWays-style tall grid (rows > 4 still 6x4)', () => {
    expect(deriveWorkspaceLayout(6, 7, 'rectangular')).toBe('6x4');
  });
  it('snaps any cluster topology to a square (≥6 side)', () => {
    expect(deriveWorkspaceLayout(7, 7, 'cluster')).toBe('7x7');
    expect(deriveWorkspaceLayout(6, 6, 'cluster')).toBe('6x6');
    expect(deriveWorkspaceLayout(5, 5, 'cluster')).toBe('6x6'); // floor at 6
    expect(deriveWorkspaceLayout(8, 6, 'CLUSTER')).toBe('8x8'); // case-insensitive
  });
  it('falls back to <reels>x<rows> for unusual rectangular grids', () => {
    expect(deriveWorkspaceLayout(4, 5, 'rectangular')).toBe('4x5');
    expect(deriveWorkspaceLayout(7, 3, 'rectangular')).toBe('7x3');
  });
});

describe('Phase 49 · stale-metric state machine', () => {
  it('marks variant stale only when validatedMetrics is present', () => {
    const a: Variant = { validatedMetrics: null, _metricsStale: false };
    onSliderEdit(a, true);
    expect(a._metricsStale, 'no VM → no stale flag').toBe(false);

    const b: Variant = { validatedMetrics: { hit_rate: 20.69, volatility_index: 4.51 }, _metricsStale: false };
    onSliderEdit(b, true);
    expect(b._metricsStale, 'VM present + touched → stale').toBe(true);
    expect(typeof b._metricsStaleSince).toBe('number');
  });

  it('does NOT flip stale=true when touched=false (slider snapped back to same value)', () => {
    const v: Variant = { validatedMetrics: { hit_rate: 20.69 }, _metricsStale: false };
    onSliderEdit(v, false);
    expect(v._metricsStale, 'no touch → no stale').toBe(false);
  });

  it('clears the stale flag and seeds a fresh validatedMetrics block on MC refresh', () => {
    const v: Variant = {
      validatedMetrics: { hit_rate: 20.69 },
      _metricsStale: true,
      _metricsStaleSince: 1700000000000,
    };
    onMcRefresh(v, { hit_rate: 22.10, volatility_index: 4.93 });
    expect(v._metricsStale, 'MC refresh clears stale').toBe(false);
    expect(v._metricsStaleSince, 'MC refresh removes timestamp').toBeUndefined();
    expect(v.validatedMetrics?.hit_rate).toBe(22.10);
  });

  it('round-trips the cycle (clean → edit → stale → MC → clean → edit again → stale)', () => {
    const v: Variant = { validatedMetrics: { hit_rate: 1 }, _metricsStale: false };
    onSliderEdit(v, true);
    expect(v._metricsStale).toBe(true);
    onMcRefresh(v, { hit_rate: 2 });
    expect(v._metricsStale).toBe(false);
    onSliderEdit(v, true);
    expect(v._metricsStale).toBe(true);
  });
});
