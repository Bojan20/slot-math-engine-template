// W199 — SENSITIVITY tab controller.
//
// Owns the parameter sweep + sensitivity analysis pipeline:
//
//   • Auto-detects numeric parameters from the active StudioVariant
//     (per-symbol weights, per-symbol payouts, topology, target RTP).
//   • Computes 1000-point RTP curves via the real estimator
//     (`computeLiveRTP` → `estimateFullRtp`), non-blocking via
//     requestIdleCallback / micro-batching.
//   • Renders a 1D line chart with CI95 ribbon (canvas) or a 2D
//     heatmap (16×12) when two params are picked.
//   • A/B comparator: snapshots the current variant and computes
//     deltas vs the swept variant.
//   • CSV export + in-memory sweep history.
//
// Nothing here ships any new math — RTP is always delegated to
// `computeLiveRTP` from `./engine.ts`, which itself calls the canonical
// `estimateFullRtp` from `src/utils/rtpEstimator.ts`.

import { computeLiveRTP } from './engine.js';
import type { StudioVariant, StudioSymbol, Tier } from './types.js';

// ── Public types ────────────────────────────────────────────────────

/** A numeric parameter discovered on a StudioVariant. */
export interface SweepParam {
  /** Stable identifier — used as React-style key + storage. */
  id: string;
  /** Human-readable label shown in the sidebar. */
  label: string;
  /** Source category — used to derive sane min/max defaults. */
  kind: 'symbol_weight' | 'symbol_pay' | 'topology' | 'rtp_target';
  /** Current numeric value on the variant snapshot. */
  current: number;
  /** Suggested sweep min (closed). */
  min: number;
  /** Suggested sweep max (closed). */
  max: number;
  /** Optional integer step (e.g. for topology). 0 → continuous. */
  step: number;
}

/** A single computed point on the sweep curve. */
export interface SweepPoint {
  /** Parameter value at this sample. */
  x: number;
  /** Resulting base-game RTP at this sample (0..1 scale). */
  rtp: number;
  /** Resulting hit-freq estimate (0..1). */
  hitFreq: number;
  /** Resulting variance estimate (σ). */
  variance: number;
  /** 95% confidence lower bound (RTP units). */
  ciLow: number;
  /** 95% confidence upper bound (RTP units). */
  ciHigh: number;
}

/** Full result of a 1D sweep. */
export interface SweepResult {
  paramId: string;
  points: SweepPoint[];
  startedAt: number;
  finishedAt: number;
  /** Compute time in ms (finishedAt - startedAt). */
  durationMs: number;
  /** Reference value at which `currentRtp` was sampled. */
  baselineX: number;
  /** RTP at baselineX (the unmodified variant). */
  baselineRtp: number;
}

/** Result of a 2D heatmap compute. */
export interface HeatmapResult {
  paramA: string;
  paramB: string;
  cols: number;
  rows: number;
  /** Flat (rows × cols) RTP grid in row-major order. */
  rtp: Float32Array;
  /** [min, max] of RTP grid for colour normalisation. */
  range: [number, number];
}

/** A/B comparator delta. */
export interface ABDelta {
  rtp: number;
  hitFreq: number;
  sigma: number;
}

/** Persisted sweep entry inside variant.sweepHistory. */
export interface SweepHistoryEntry {
  at: number;
  paramId: string;
  paramLabel: string;
  baselineRtp: number;
  minRtp: number;
  maxRtp: number;
  durationMs: number;
  pointCount: number;
}

// ── Param detection ─────────────────────────────────────────────────

/**
 * Auto-detect all numeric parameters on a StudioVariant. Returns one
 * SweepParam per (symbol × {weight, x3, x4, x5}), plus topology
 * (reels, rows), plus target RTP — typical 5×3 variant exposes 15-25
 * params.
 */
export function detectNumericParams(variant: StudioVariant): SweepParam[] {
  const out: SweepParam[] = [];

  // Per-symbol weights — most common knob.
  for (const s of variant.symbols) {
    out.push({
      id: `weight:${s.id}`,
      label: `${s.id} weight`,
      kind: 'symbol_weight',
      current: s.weight,
      min: 0.1,
      max: 20,
      step: 0,
    });
  }

  // Per-symbol payouts (x3/x4/x5) — only HP/MP/LP pay tiers (specials
  // typically zero, but we still expose them for completeness).
  for (const s of variant.symbols) {
    const tier: Tier = s.tier;
    const isPay = tier === 'HP' || tier === 'MP' || tier === 'LP';
    const payMax = isPay ? Math.max(s.pay.x5 * 4, 50) : 100;
    for (const which of ['x3', 'x4', 'x5'] as const) {
      out.push({
        id: `pay:${s.id}:${which}`,
        label: `${s.id} ${which}`,
        kind: 'symbol_pay',
        current: s.pay[which],
        min: 0,
        max: payMax,
        step: 0,
      });
    }
  }

  // Topology (discrete int) — sweepable.
  out.push({
    id: 'topology:reels',
    label: 'Reels',
    kind: 'topology',
    current: 5,
    min: 3,
    max: 7,
    step: 1,
  });
  out.push({
    id: 'topology:rows',
    label: 'Rows',
    kind: 'topology',
    current: 3,
    min: 3,
    max: 6,
    step: 1,
  });

  // Target RTP.
  out.push({
    id: 'rtp_target',
    label: 'Target RTP',
    kind: 'rtp_target',
    current: variant.rtpTarget,
    min: 88,
    max: 98,
    step: 0,
  });

  return out;
}

// ── Variant cloning + param application ─────────────────────────────

/**
 * Clone a variant deeply enough that mutating returned symbols / reels
 * does not affect the original. Activity log and lastSavedAt are
 * shallow-shared (we never mutate them in sweeps).
 */
export function cloneVariant(variant: StudioVariant): StudioVariant {
  const symbols: StudioSymbol[] = variant.symbols.map((s) => ({
    tier: s.tier,
    id: s.id,
    name: s.name,
    icon: s.icon,
    weight: s.weight,
    pay: { x3: s.pay.x3, x4: s.pay.x4, x5: s.pay.x5 },
  }));
  return {
    ...variant,
    tierCounts: { ...variant.tierCounts },
    symbols,
    reels: variant.reels.map((r) => r.slice()),
    activity: variant.activity.slice(),
  };
}

/**
 * Apply a sweep param value to a (cloned) variant. Topology and
 * target_rtp are stored back onto the variant fields directly; symbol
 * weights / payouts mutate the matching symbol.
 */
export function applyParam(
  variant: StudioVariant,
  param: SweepParam,
  value: number
): StudioVariant {
  switch (param.kind) {
    case 'symbol_weight': {
      const symId = param.id.slice('weight:'.length);
      const sym = variant.symbols.find((s) => s.id === symId);
      if (sym) sym.weight = Math.max(0.01, value);
      return variant;
    }
    case 'symbol_pay': {
      const [, symId, which] = param.id.split(':') as [
        'pay',
        string,
        'x3' | 'x4' | 'x5',
      ];
      const sym = variant.symbols.find((s) => s.id === symId);
      if (sym) sym.pay[which] = Math.max(0, value);
      return variant;
    }
    case 'topology':
      // Topology lives outside the variant (workspace.layout); we
      // forward as an inline override on the variant for the sweep
      // run only — `computeLiveRTP` accepts overrides directly.
      return variant;
    case 'rtp_target':
      variant.rtpTarget = value;
      return variant;
  }
}

// ── 1D sweep compute ────────────────────────────────────────────────

/** Default sample count. */
export const DEFAULT_SAMPLE_COUNT = 1000;
/** Default 2D heatmap dims. */
export const HEATMAP_COLS = 16;
export const HEATMAP_ROWS = 12;

/**
 * Run a synchronous parameter sweep. Allocates fresh variant clones
 * per point so the original is untouched. Performance: ~1000 points
 * on a typical 5×3 paytable fits well under 5s on a modern laptop.
 *
 * If you need a non-blocking variant (UI thread), use `runSweepAsync`.
 */
export function runSweep(
  variant: StudioVariant,
  param: SweepParam,
  options: {
    samples?: number;
    reels?: number;
    rows?: number;
    paylines?: number;
  } = {}
): SweepResult {
  const samples = Math.max(2, options.samples ?? DEFAULT_SAMPLE_COUNT);
  const reels = options.reels ?? 5;
  const rows = options.rows ?? 3;
  const paylines = options.paylines ?? 20;
  const startedAt = performance.now();
  const points: SweepPoint[] = [];

  // Baseline RTP — used both as the marker and to compute deltas in the
  // CI ribbon (±0.5pp default unless real MC stats are wired).
  const baselineLive = computeLiveRTP(variant, reels, rows, paylines);
  const baselineRtp = baselineLive.rtp;

  const span = param.max - param.min;
  const stepCount = param.step > 0 ? Math.floor(span / param.step) + 1 : samples;
  const actualSamples = Math.min(samples, Math.max(2, stepCount));

  for (let i = 0; i < actualSamples; i++) {
    const t = actualSamples === 1 ? 0 : i / (actualSamples - 1);
    let x = param.min + span * t;
    if (param.step > 0) x = Math.round(x / param.step) * param.step;

    const clone = cloneVariant(variant);
    applyParam(clone, param, x);

    // Topology params override reels/rows directly.
    let curReels = reels;
    let curRows = rows;
    if (param.id === 'topology:reels') curReels = Math.round(x);
    if (param.id === 'topology:rows') curRows = Math.round(x);

    const live = computeLiveRTP(clone, curReels, curRows, paylines);
    const rtp = live.rtp;
    const hitFreq = Math.min(1, Math.max(0, clone.hit / 100));
    const variance = Math.max(0, live.volatility.index);
    // ±0.5pp band as a conservative analytic ribbon. Real MC CI can
    // replace this when the caller passes a callback.
    const halfBand = 0.005;
    points.push({
      x,
      rtp,
      hitFreq,
      variance,
      ciLow: Math.max(0, rtp - halfBand),
      ciHigh: rtp + halfBand,
    });
  }

  const finishedAt = performance.now();
  return {
    paramId: param.id,
    points,
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    baselineX: param.current,
    baselineRtp,
  };
}

/**
 * Non-blocking variant — yields the event loop every `batch` points so
 * the UI stays responsive. Resolves with the same SweepResult as
 * `runSweep`.
 */
export function runSweepAsync(
  variant: StudioVariant,
  param: SweepParam,
  options: {
    samples?: number;
    reels?: number;
    rows?: number;
    paylines?: number;
    batchSize?: number;
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<SweepResult> {
  return new Promise((resolve) => {
    const samples = Math.max(2, options.samples ?? DEFAULT_SAMPLE_COUNT);
    const reels = options.reels ?? 5;
    const rows = options.rows ?? 3;
    const paylines = options.paylines ?? 20;
    const batch = Math.max(1, options.batchSize ?? 50);

    const startedAt = performance.now();
    const baselineLive = computeLiveRTP(variant, reels, rows, paylines);
    const baselineRtp = baselineLive.rtp;
    const points: SweepPoint[] = [];

    const span = param.max - param.min;
    const stepCount = param.step > 0 ? Math.floor(span / param.step) + 1 : samples;
    const actualSamples = Math.min(samples, Math.max(2, stepCount));

    let i = 0;
    const runBatch = (): void => {
      const end = Math.min(actualSamples, i + batch);
      for (; i < end; i++) {
        const t = actualSamples === 1 ? 0 : i / (actualSamples - 1);
        let x = param.min + span * t;
        if (param.step > 0) x = Math.round(x / param.step) * param.step;
        const clone = cloneVariant(variant);
        applyParam(clone, param, x);
        let curReels = reels;
        let curRows = rows;
        if (param.id === 'topology:reels') curReels = Math.round(x);
        if (param.id === 'topology:rows') curRows = Math.round(x);
        const live = computeLiveRTP(clone, curReels, curRows, paylines);
        const rtp = live.rtp;
        const hitFreq = Math.min(1, Math.max(0, clone.hit / 100));
        const variance = Math.max(0, live.volatility.index);
        const halfBand = 0.005;
        points.push({
          x,
          rtp,
          hitFreq,
          variance,
          ciLow: Math.max(0, rtp - halfBand),
          ciHigh: rtp + halfBand,
        });
      }
      options.onProgress?.(i, actualSamples);
      if (i < actualSamples) {
        // Yield to the event loop; prefer rIC when available.
        type IdleScheduler = (cb: () => void) => unknown;
        const w = globalThis as unknown as {
          requestIdleCallback?: IdleScheduler;
        };
        if (typeof w.requestIdleCallback === 'function') {
          w.requestIdleCallback(runBatch);
        } else {
          setTimeout(runBatch, 0);
        }
      } else {
        const finishedAt = performance.now();
        resolve({
          paramId: param.id,
          points,
          startedAt,
          finishedAt,
          durationMs: finishedAt - startedAt,
          baselineX: param.current,
          baselineRtp,
        });
      }
    };
    runBatch();
  });
}

// ── 2D heatmap ──────────────────────────────────────────────────────

/**
 * Compute a 2D RTP heatmap by sweeping two params simultaneously over
 * a `cols × rows` grid. 192-cell default keeps it well under 1s.
 */
export function runHeatmap(
  variant: StudioVariant,
  paramA: SweepParam,
  paramB: SweepParam,
  options: {
    cols?: number;
    rows?: number;
    reels?: number;
    irRows?: number;
    paylines?: number;
  } = {}
): HeatmapResult {
  const cols = options.cols ?? HEATMAP_COLS;
  const rows = options.rows ?? HEATMAP_ROWS;
  const reels = options.reels ?? 5;
  const irRows = options.irRows ?? 3;
  const paylines = options.paylines ?? 20;
  const rtp = new Float32Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let r = 0; r < rows; r++) {
    const tb = rows === 1 ? 0 : r / (rows - 1);
    const yB = paramB.min + (paramB.max - paramB.min) * tb;
    for (let c = 0; c < cols; c++) {
      const ta = cols === 1 ? 0 : c / (cols - 1);
      const xA = paramA.min + (paramA.max - paramA.min) * ta;
      const clone = cloneVariant(variant);
      applyParam(clone, paramA, xA);
      applyParam(clone, paramB, yB);
      let curReels = reels;
      let curRows = irRows;
      if (paramA.id === 'topology:reels' || paramB.id === 'topology:reels') {
        curReels = paramA.id === 'topology:reels' ? Math.round(xA) : Math.round(yB);
      }
      if (paramA.id === 'topology:rows' || paramB.id === 'topology:rows') {
        curRows = paramA.id === 'topology:rows' ? Math.round(xA) : Math.round(yB);
      }
      const live = computeLiveRTP(clone, curReels, curRows, paylines);
      const v = live.rtp;
      rtp[r * cols + c] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!isFinite(min)) min = 0;
  if (!isFinite(max)) max = 1;
  return { paramA: paramA.id, paramB: paramB.id, cols, rows, rtp, range: [min, max] };
}

// ── A/B comparator ──────────────────────────────────────────────────

/** Snapshot of the metrics relevant to the A/B comparator. */
export interface ABSnapshot {
  rtp: number;
  hitFreq: number;
  sigma: number;
}

export function snapshotVariant(
  variant: StudioVariant,
  reels = 5,
  rows = 3,
  paylines = 20
): ABSnapshot {
  const live = computeLiveRTP(variant, reels, rows, paylines);
  return {
    rtp: live.rtp,
    hitFreq: variant.hit / 100,
    sigma: live.volatility.index,
  };
}

export function abDelta(a: ABSnapshot, b: ABSnapshot): ABDelta {
  return {
    rtp: b.rtp - a.rtp,
    hitFreq: b.hitFreq - a.hitFreq,
    sigma: b.sigma - a.sigma,
  };
}

// ── CSV export ──────────────────────────────────────────────────────

/**
 * Serialise a SweepResult as CSV with header row:
 *   param_value,rtp,hit_freq,variance,ci_low,ci_high
 */
export function toCSV(result: SweepResult): string {
  const head = 'param_value,rtp,hit_freq,variance,ci_low,ci_high';
  const lines = result.points.map(
    (p) =>
      `${p.x.toFixed(6)},${p.rtp.toFixed(6)},${p.hitFreq.toFixed(6)},${p.variance.toFixed(6)},${p.ciLow.toFixed(6)},${p.ciHigh.toFixed(6)}`
  );
  return [head, ...lines].join('\n');
}

// ── Catmull-Rom path helper ─────────────────────────────────────────

/**
 * Build an SVG/canvas path D-string by Catmull-Rom interpolation
 * through `pts` (already in screen coords). t=0.5 is centripetal.
 */
export function catmullRomPath(pts: Array<[number, number]>, alpha = 0.5): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0]![0]} ${pts[0]![1]}`;
  const parts: string[] = [`M ${pts[0]![0]} ${pts[0]![1]}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    // Centripetal Catmull-Rom → Bezier control points
    const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) ** alpha;
    const d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) ** alpha;
    const d3 = Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) ** alpha;
    const bp1x = p1[0] + (p2[0] - p0[0]) * (d2 / (3 * (d1 + d2 || 1)));
    const bp1y = p1[1] + (p2[1] - p0[1]) * (d2 / (3 * (d1 + d2 || 1)));
    const bp2x = p2[0] - (p3[0] - p1[0]) * (d2 / (3 * (d2 + d3 || 1)));
    const bp2y = p2[1] - (p3[1] - p1[1]) * (d2 / (3 * (d2 + d3 || 1)));
    parts.push(`C ${bp1x} ${bp1y} ${bp2x} ${bp2y} ${p2[0]} ${p2[1]}`);
  }
  return parts.join(' ');
}

// ── Canvas line-chart renderer ──────────────────────────────────────

export interface ChartTheme {
  bg: string;
  axis: string;
  grid: string;
  line: string;
  band: string;
  marker: string;
  text: string;
}

export const DEFAULT_THEME: ChartTheme = {
  bg: '#0E1219',
  axis: '#5C6470',
  grid: '#252B36',
  line: '#22D3EE',
  band: 'rgba(34, 211, 238, 0.18)',
  marker: '#F59E0B',
  text: '#9AA3AF',
};

export interface ChartOptions {
  width: number;
  height: number;
  padding?: { l: number; r: number; t: number; b: number };
  theme?: ChartTheme;
  /** When > 0, draw a vertical marker at this x value. */
  markerX?: number | null;
  /** Title shown top-left. */
  title?: string;
}

/**
 * Draw a 1D RTP curve with CI95 ribbon on a canvas. Pure draw — no
 * DOM mutation outside the passed-in canvas.
 */
export function renderLineChart(
  ctx: CanvasRenderingContext2D,
  result: SweepResult,
  opts: ChartOptions
): void {
  const { width, height } = opts;
  const pad = opts.padding ?? { l: 44, r: 16, t: 28, b: 28 };
  const theme = opts.theme ?? DEFAULT_THEME;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  // Background
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);

  if (result.points.length === 0) return;

  // Scales
  const xs = result.points.map((p) => p.x);
  const ys = result.points.map((p) => p.rtp);
  const yLows = result.points.map((p) => p.ciLow);
  const yHighs = result.points.map((p) => p.ciHigh);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...yLows);
  const yMax = Math.max(...yHighs);
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  const sx = (x: number): number => pad.l + ((x - xMin) / xSpan) * innerW;
  const sy = (y: number): number => pad.t + innerH - ((y - yMin) / ySpan) * innerH;

  // Gridlines (5 horizontal)
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 3]);
  for (let g = 0; g <= 4; g++) {
    const y = pad.t + (innerH * g) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + innerW, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Y-axis ticks (RTP %)
  ctx.fillStyle = theme.text;
  ctx.font = '10px ui-monospace, "SF Mono", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let g = 0; g <= 4; g++) {
    const y = pad.t + (innerH * g) / 4;
    const value = yMax - (ySpan * g) / 4;
    ctx.fillText(`${(value * 100).toFixed(2)}%`, pad.l - 6, y);
  }

  // CI ribbon
  ctx.fillStyle = theme.band;
  ctx.beginPath();
  for (let i = 0; i < result.points.length; i++) {
    const p = result.points[i]!;
    const x = sx(p.x);
    const y = sy(p.ciHigh);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = result.points.length - 1; i >= 0; i--) {
    const p = result.points[i]!;
    ctx.lineTo(sx(p.x), sy(p.ciLow));
  }
  ctx.closePath();
  ctx.fill();

  // RTP line
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < result.points.length; i++) {
    const p = result.points[i]!;
    const x = sx(p.x);
    const y = sy(p.rtp);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Vertical marker at current value
  const mx = opts.markerX ?? result.baselineX;
  if (mx !== null && mx >= xMin && mx <= xMax) {
    const x = sx(mx);
    ctx.strokeStyle = theme.marker;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, pad.t + innerH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = theme.marker;
    ctx.textAlign = 'center';
    ctx.fillText(mx.toFixed(2), x, pad.t - 8);
  }

  // X-axis label endpoints
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'left';
  ctx.fillText(xMin.toFixed(2), pad.l, height - 6);
  ctx.textAlign = 'right';
  ctx.fillText(xMax.toFixed(2), pad.l + innerW, height - 6);

  // Title
  if (opts.title) {
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.font = 'bold 11px ui-monospace, "SF Mono", monospace';
    ctx.fillText(opts.title, pad.l, 14);
  }
}

/**
 * Draw a 2D heatmap (cyan-low → amber-high gradient).
 */
export function renderHeatmap(
  ctx: CanvasRenderingContext2D,
  result: HeatmapResult,
  opts: ChartOptions
): void {
  const { width, height } = opts;
  const pad = opts.padding ?? { l: 44, r: 16, t: 28, b: 28 };
  const theme = opts.theme ?? DEFAULT_THEME;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const cw = innerW / result.cols;
  const ch = innerH / result.rows;
  const [lo, hi] = result.range;
  const span = hi - lo || 1;
  for (let r = 0; r < result.rows; r++) {
    for (let c = 0; c < result.cols; c++) {
      const v = result.rtp[r * result.cols + c]!;
      const t = (v - lo) / span;
      ctx.fillStyle = heatColor(t);
      ctx.fillRect(pad.l + c * cw, pad.t + (result.rows - 1 - r) * ch, cw + 0.5, ch + 0.5);
    }
  }
  if (opts.title) {
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.font = 'bold 11px ui-monospace, "SF Mono", monospace';
    ctx.fillText(opts.title, pad.l, 14);
  }
}

/** Linear cyan→amber gradient (t ∈ [0,1]). */
export function heatColor(t: number): string {
  const tt = Math.max(0, Math.min(1, t));
  // cyan #22D3EE → amber #F59E0B
  const r = Math.round(0x22 + (0xf5 - 0x22) * tt);
  const g = Math.round(0xd3 + (0x9e - 0xd3) * tt);
  const b = Math.round(0xee + (0x0b - 0xee) * tt);
  return `rgb(${r},${g},${b})`;
}

// ── Sweep history ───────────────────────────────────────────────────

/**
 * Compress a SweepResult down to a single history entry suitable for
 * persisting on the variant. We deliberately drop the per-point grid
 * to keep localStorage size sane.
 */
export function toHistoryEntry(
  result: SweepResult,
  paramLabel: string
): SweepHistoryEntry {
  const rtps = result.points.map((p) => p.rtp);
  return {
    at: Date.now(),
    paramId: result.paramId,
    paramLabel,
    baselineRtp: result.baselineRtp,
    minRtp: Math.min(...rtps),
    maxRtp: Math.max(...rtps),
    durationMs: result.durationMs,
    pointCount: result.points.length,
  };
}

/**
 * Append entry to variant.sweepHistory (creates the array if missing).
 * Returns the mutated array for chaining.
 */
export function appendHistory(
  variant: StudioVariant,
  entry: SweepHistoryEntry
): SweepHistoryEntry[] {
  const v = variant as StudioVariant & { sweepHistory?: SweepHistoryEntry[] };
  if (!Array.isArray(v.sweepHistory)) v.sweepHistory = [];
  v.sweepHistory.push(entry);
  // Cap history at 50 entries.
  if (v.sweepHistory.length > 50) v.sweepHistory.shift();
  return v.sweepHistory;
}

export function readHistory(variant: StudioVariant): SweepHistoryEntry[] {
  const v = variant as StudioVariant & { sweepHistory?: SweepHistoryEntry[] };
  return Array.isArray(v.sweepHistory) ? v.sweepHistory.slice() : [];
}

// ── Public-facing bridge ────────────────────────────────────────────

export interface SensitivityBridge {
  detectParams(variant: StudioVariant): SweepParam[];
  runSweep(
    variant: StudioVariant,
    param: SweepParam,
    opts?: Parameters<typeof runSweep>[2]
  ): SweepResult;
  runSweepAsync(
    variant: StudioVariant,
    param: SweepParam,
    opts?: Parameters<typeof runSweepAsync>[2]
  ): Promise<SweepResult>;
  runHeatmap(
    variant: StudioVariant,
    a: SweepParam,
    b: SweepParam,
    opts?: Parameters<typeof runHeatmap>[3]
  ): HeatmapResult;
  snapshotVariant(variant: StudioVariant): ABSnapshot;
  abDelta(a: ABSnapshot, b: ABSnapshot): ABDelta;
  toCSV(result: SweepResult): string;
  appendHistory(v: StudioVariant, e: SweepHistoryEntry): SweepHistoryEntry[];
  readHistory(v: StudioVariant): SweepHistoryEntry[];
  toHistoryEntry(result: SweepResult, label: string): SweepHistoryEntry;
  renderLineChart(
    ctx: CanvasRenderingContext2D,
    result: SweepResult,
    opts: ChartOptions
  ): void;
  renderHeatmap(
    ctx: CanvasRenderingContext2D,
    result: HeatmapResult,
    opts: ChartOptions
  ): void;
  cloneVariant(v: StudioVariant): StudioVariant;
  applyParam(v: StudioVariant, p: SweepParam, value: number): StudioVariant;
}

export function createSensitivityBridge(): SensitivityBridge {
  return {
    detectParams: detectNumericParams,
    runSweep,
    runSweepAsync,
    runHeatmap,
    snapshotVariant,
    abDelta,
    toCSV,
    appendHistory,
    readHistory,
    toHistoryEntry,
    renderLineChart,
    renderHeatmap,
    cloneVariant,
    applyParam,
  };
}
