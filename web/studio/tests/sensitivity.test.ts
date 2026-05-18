// W199 — SENSITIVITY tab tests.
//
// Validates the parameter-sweep pipeline projected on top of the real
// engine bridge (computeLiveRTP from `../src/engine.ts`). We do NOT test
// the RTP estimator directly — that has its own coverage in the root
// project's 5000+ vitest specs.

import { describe, it, expect } from 'vitest';
import type { StudioVariant } from '../src/types.js';
import {
  detectNumericParams,
  runSweep,
  runSweepAsync,
  runHeatmap,
  snapshotVariant,
  abDelta,
  toCSV,
  cloneVariant,
  applyParam,
  appendHistory,
  readHistory,
  toHistoryEntry,
  catmullRomPath,
  heatColor,
  DEFAULT_SAMPLE_COUNT,
  HEATMAP_COLS,
  HEATMAP_ROWS,
} from '../src/sensitivity.js';

function makeVariant(overrides: Partial<StudioVariant> = {}): StudioVariant {
  const base: StudioVariant = {
    id: 'var-sens',
    name: 'SensTest',
    tierCounts: { HP: 3, MP: 3, LP: 3, WILD: 1, SCATTER: 1, MULT: 0 },
    symbols: [
      { tier: 'HP', id: 'HP1', name: 'Sapphire', icon: 'diamond', weight: 3.5, pay: { x3: 50, x4: 150, x5: 500 } },
      { tier: 'HP', id: 'HP2', name: 'Ruby',     icon: 'prism',   weight: 3.5, pay: { x3: 50, x4: 150, x5: 500 } },
      { tier: 'HP', id: 'HP3', name: 'Emerald',  icon: 'crystal', weight: 3.5, pay: { x3: 50, x4: 150, x5: 500 } },
      { tier: 'MP', id: 'MP1', name: 'Crown',    icon: 'hexagon', weight: 5.2, pay: { x3: 20, x4: 60,  x5: 200 } },
      { tier: 'MP', id: 'MP2', name: 'Compass',  icon: 'star5',   weight: 5.2, pay: { x3: 20, x4: 60,  x5: 200 } },
      { tier: 'MP', id: 'MP3', name: 'Coin',     icon: 'octagon', weight: 5.2, pay: { x3: 20, x4: 60,  x5: 200 } },
      { tier: 'LP', id: 'LP1', name: 'Sphere',   icon: 'pebble',  weight: 8.0, pay: { x3: 5,  x4: 20,  x5: 75  } },
      { tier: 'LP', id: 'LP2', name: 'Block',    icon: 'wave',    weight: 8.0, pay: { x3: 5,  x4: 20,  x5: 75  } },
      { tier: 'LP', id: 'LP3', name: 'Spire',    icon: 'arc',     weight: 8.0, pay: { x3: 5,  x4: 20,  x5: 75  } },
      { tier: 'WILD', id: 'WILD1', name: 'Wild', icon: 'wild',    weight: 1.5, pay: { x3: 0, x4: 0, x5: 0 } },
      { tier: 'SCATTER', id: 'SCATTER1', name: 'Scatter', icon: 'scatter', weight: 1.5, pay: { x3: 5, x4: 20, x5: 100 } },
    ],
    reels: [],
    rtp: 95.4,
    rtpTarget: 95.5,
    hit: 27.8,
    sigma: 8.4,
    maxWin: 5000,
    vola: 'MID',
    activePreset: 'standard',
    activity: [],
    lastSavedAt: Date.now(),
  };
  return { ...base, ...overrides };
}

describe('sensitivity — param detection', () => {
  it('auto-detects 15+ numeric params for an 11-symbol 5x3 variant', () => {
    const params = detectNumericParams(makeVariant());
    // 11 symbols × (1 weight + 3 pays) + 2 topology + 1 rtp = 47
    expect(params.length).toBeGreaterThanOrEqual(15);
    expect(params.length).toBe(11 * 4 + 2 + 1);
  });

  it('derives sweep min/max for symbol_weight on canonical bounds', () => {
    const params = detectNumericParams(makeVariant());
    const w = params.find((p) => p.id === 'weight:HP1');
    expect(w).toBeDefined();
    expect(w!.kind).toBe('symbol_weight');
    expect(w!.min).toBe(0.1);
    expect(w!.max).toBe(20);
    expect(w!.current).toBe(3.5);
  });

  it('derives integer topology params with step=1', () => {
    const params = detectNumericParams(makeVariant());
    const reels = params.find((p) => p.id === 'topology:reels');
    const rows = params.find((p) => p.id === 'topology:rows');
    expect(reels?.step).toBe(1);
    expect(rows?.step).toBe(1);
  });

  it('derives target RTP param with [88, 98] range', () => {
    const params = detectNumericParams(makeVariant());
    const rtp = params.find((p) => p.id === 'rtp_target');
    expect(rtp).toBeDefined();
    expect(rtp!.min).toBe(88);
    expect(rtp!.max).toBe(98);
  });
});

describe('sensitivity — cloneVariant + applyParam', () => {
  it('cloneVariant produces a deep symbol copy', () => {
    const a = makeVariant();
    const b = cloneVariant(a);
    b.symbols[0]!.weight = 999;
    expect(a.symbols[0]!.weight).toBe(3.5);
    expect(b.symbols[0]!.weight).toBe(999);
  });

  it('applyParam mutates the weight on a cloned variant', () => {
    const a = makeVariant();
    const b = cloneVariant(a);
    const params = detectNumericParams(b);
    const w = params.find((p) => p.id === 'weight:HP1')!;
    applyParam(b, w, 7.2);
    expect(b.symbols.find((s) => s.id === 'HP1')!.weight).toBeCloseTo(7.2);
  });

  it('applyParam mutates pay x5 on a cloned variant', () => {
    const v = cloneVariant(makeVariant());
    const params = detectNumericParams(v);
    const p = params.find((p) => p.id === 'pay:HP1:x5')!;
    applyParam(v, p, 999);
    expect(v.symbols.find((s) => s.id === 'HP1')!.pay.x5).toBe(999);
  });
});

describe('sensitivity — runSweep (sync)', () => {
  it('computes the expected number of points for a small sample', () => {
    const v = makeVariant();
    const params = detectNumericParams(v);
    const w = params.find((p) => p.id === 'weight:HP1')!;
    const r = runSweep(v, w, { samples: 50 });
    expect(r.points.length).toBe(50);
    expect(r.paramId).toBe('weight:HP1');
    expect(r.baselineRtp).toBeGreaterThanOrEqual(0);
  });

  it('produces monotonically-spaced x values across [min,max]', () => {
    const v = makeVariant();
    const w = detectNumericParams(v).find((p) => p.id === 'weight:HP1')!;
    const r = runSweep(v, w, { samples: 10 });
    expect(r.points[0]!.x).toBeCloseTo(w.min, 3);
    expect(r.points[r.points.length - 1]!.x).toBeCloseTo(w.max, 3);
    for (let i = 1; i < r.points.length; i++) {
      expect(r.points[i]!.x).toBeGreaterThan(r.points[i - 1]!.x - 1e-6);
    }
  });

  it('each point exposes RTP, hitFreq, variance, and CI bounds', () => {
    const v = makeVariant();
    const w = detectNumericParams(v).find((p) => p.id === 'weight:HP1')!;
    const r = runSweep(v, w, { samples: 5 });
    for (const p of r.points) {
      expect(typeof p.rtp).toBe('number');
      expect(typeof p.hitFreq).toBe('number');
      expect(typeof p.variance).toBe('number');
      expect(p.ciLow).toBeLessThanOrEqual(p.rtp + 1e-6);
      expect(p.ciHigh).toBeGreaterThanOrEqual(p.rtp - 1e-6);
    }
  });

  it('1000-point sweep completes in under 5 seconds', () => {
    const v = makeVariant();
    const w = detectNumericParams(v).find((p) => p.id === 'weight:HP1')!;
    const t0 = Date.now();
    const r = runSweep(v, w, { samples: DEFAULT_SAMPLE_COUNT });
    const elapsed = Date.now() - t0;
    expect(r.points.length).toBe(DEFAULT_SAMPLE_COUNT);
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('sensitivity — runSweepAsync', () => {
  it('emits progress callbacks and resolves with a SweepResult', async () => {
    const v = makeVariant();
    const w = detectNumericParams(v).find((p) => p.id === 'weight:HP1')!;
    let lastDone = 0;
    const r = await runSweepAsync(v, w, {
      samples: 60,
      batchSize: 20,
      onProgress: (done) => {
        lastDone = done;
      },
    });
    expect(r.points.length).toBe(60);
    expect(lastDone).toBe(60);
  });
});

describe('sensitivity — runHeatmap', () => {
  it('returns a cols × rows grid with sensible range', () => {
    const v = makeVariant();
    const params = detectNumericParams(v);
    const a = params.find((p) => p.id === 'weight:HP1')!;
    const b = params.find((p) => p.id === 'weight:LP1')!;
    const hm = runHeatmap(v, a, b, { cols: HEATMAP_COLS, rows: HEATMAP_ROWS });
    expect(hm.rtp.length).toBe(HEATMAP_COLS * HEATMAP_ROWS);
    expect(hm.cols).toBe(HEATMAP_COLS);
    expect(hm.rows).toBe(HEATMAP_ROWS);
    expect(hm.range[1]).toBeGreaterThanOrEqual(hm.range[0]);
  });

  it('produces 192 cells with 16x12 default', () => {
    const v = makeVariant();
    const params = detectNumericParams(v);
    const a = params.find((p) => p.id === 'weight:HP1')!;
    const b = params.find((p) => p.id === 'weight:MP1')!;
    const hm = runHeatmap(v, a, b);
    expect(hm.rtp.length).toBe(192);
  });
});

describe('sensitivity — A/B comparator', () => {
  it('abDelta correctly computes b − a', () => {
    const a = { rtp: 0.954, hitFreq: 0.27, sigma: 8.4 };
    const b = { rtp: 0.962, hitFreq: 0.29, sigma: 9.1 };
    const d = abDelta(a, b);
    expect(d.rtp).toBeCloseTo(0.008, 4);
    expect(d.hitFreq).toBeCloseTo(0.02, 4);
    expect(d.sigma).toBeCloseTo(0.7, 4);
  });

  it('snapshotVariant returns rtp/hitFreq/sigma triple', () => {
    const snap = snapshotVariant(makeVariant());
    expect(snap.rtp).toBeGreaterThanOrEqual(0);
    expect(snap.hitFreq).toBeGreaterThanOrEqual(0);
    expect(snap.sigma).toBeGreaterThanOrEqual(0);
  });
});

describe('sensitivity — CSV export', () => {
  it('produces the canonical header row + one line per point', () => {
    const v = makeVariant();
    const w = detectNumericParams(v).find((p) => p.id === 'weight:HP1')!;
    const r = runSweep(v, w, { samples: 10 });
    const csv = toCSV(r);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('param_value,rtp,hit_freq,variance,ci_low,ci_high');
    expect(lines.length).toBe(11); // header + 10 rows
    // Each row has exactly 6 fields
    expect(lines[1]!.split(',').length).toBe(6);
  });
});

describe('sensitivity — history persistence', () => {
  it('appendHistory + readHistory round-trips on the variant', () => {
    const v = makeVariant();
    const w = detectNumericParams(v).find((p) => p.id === 'weight:HP1')!;
    const r = runSweep(v, w, { samples: 4 });
    appendHistory(v, toHistoryEntry(r, 'HP1 weight'));
    appendHistory(v, toHistoryEntry(r, 'HP1 weight'));
    const h = readHistory(v);
    expect(h.length).toBe(2);
    expect(h[0]!.paramId).toBe('weight:HP1');
    expect(h[0]!.pointCount).toBe(4);
  });
});

describe('sensitivity — helpers', () => {
  it('catmullRomPath returns an M+C path string', () => {
    const path = catmullRomPath([
      [0, 0],
      [10, 5],
      [20, 8],
      [30, 6],
    ]);
    expect(path.startsWith('M ')).toBe(true);
    expect(path).toContain('C ');
  });

  it('heatColor maps 0 → cyan-ish, 1 → amber-ish', () => {
    const lo = heatColor(0);
    const hi = heatColor(1);
    expect(lo).toMatch(/^rgb\(/);
    expect(hi).toMatch(/^rgb\(/);
    expect(lo).not.toBe(hi);
  });
});
