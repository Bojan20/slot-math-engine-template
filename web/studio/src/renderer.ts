// W198 — Pixi.js v8 Slot Reel Renderer.
//
// Self-contained Pixi v8 renderer that consumes a SlotGameIR plus a
// `SpinResult` (grid + stop positions + win lines) and animates a 5-reel
// slot scroll with anticipation pause + win-line draw. The engine wire
// itself lives in `playEngine.ts` — this module is purely visual.
//
// Design pivots:
//   - Asymmetric offset: reels 2 and 4 are shifted -12px on Y vs the
//     baseline rest position (Corti baseline tweak).
//   - Per-reel sequential stop with 120ms cascade.
//   - Anticipation pause: if ≥2 scatter visible in pre-last reels the
//     last reel holds 500ms with a subtle pulse before deceleration.
//   - Win lines drawn 1.5s after final stop with dashed glow.
//   - Win symbols pulse cyan 1.2s.
//
// jsdom note: when window.HTMLCanvasElement.prototype.getContext is not
// available (Node test env) the renderer falls back to a "headless"
// shadow mode that still tracks stop positions / win lines for
// assertion purposes — see `createSlotRenderer({ headless: true })`.

import type { SlotGameIR } from '@engine/ir/types.js';

// ── Pixi import: deferred so the test env can run without a WebGL
// canvas. The renderer dynamically imports pixi.js inside `mount()`.
// `PixiNS` is just for typing the references we hold; the actual
// classes are looked up at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PixiNS = any;

// Public types ────────────────────────────────────────────────────────

export interface PlayWin {
  /** [reel, row] pairs of the winning cells. */
  positions: Array<[number, number]>;
  /** Payline index (lines mode) — undefined for ways/cluster/scatter. */
  paylineIndex?: number;
  /** Payout (total-bet multiplier). */
  payout: number;
  /** Symbol id that paid. */
  symbolId: string;
}

export interface SpinResult {
  /** grid[row][reel] = symbol id (3 rows × 5 reels by default). */
  grid: string[][];
  /** stopPositions[reel] = strip index. */
  stopPositions: number[];
  /** Total win as a total-bet multiplier (sum of all line wins). */
  totalWin: number;
  /** Per-line winning detail (positions + payout). */
  wins: PlayWin[];
  /** Total scatters visible on grid (anticipation trigger uses this). */
  scatterCount: number;
}

export interface SlotRenderer {
  mount(container: HTMLElement, ir: SlotGameIR): Promise<void>;
  spin(opts: { seed: number; result: SpinResult }): Promise<void>;
  destroy(): void;
  setIR(ir: SlotGameIR): void;
  /** Test hook — returns the last computed stop positions. */
  _debugStopPositions?(): number[];
}

export interface CreateRendererOptions {
  /** Skip Pixi entirely (jsdom / unit tests). */
  headless?: boolean;
  /** Override the per-reel stop cascade delay (default 120ms). */
  reelStopDelayMs?: number;
  /** Override the steady scroll duration window (default [500, 800]). */
  steadyMsRange?: [number, number];
}

// ── Symbol → SVG icon mapping ────────────────────────────────────────
//
// The IR symbol pool uses generic ids like "HP1", "WILD1", "SCATTER1"
// that don't map 1:1 to the 40 SVG icons in `symbols/lib/`. We pick an
// icon deterministically from the symbol id so re-renders are stable.

const ICON_POOL = [
  'diamond', 'crystal', 'prism', 'shard', 'hexagon', 'octagon', 'star5',
  'star6', 'pentagon', 'triangle', 'circle', 'pebble', 'wave', 'arc',
  'spiral', 'sigil', 'sun', 'moon', 'leaf', 'flame', 'mountain', 'eye',
  'gear', 'key', 'anchor', 'orbit', 'sonar', 'chevron', 'knot', 'lattice',
  'keystone', 'obelisk', 'vortex', 'drop', 'arrow',
];

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export function symbolIconFor(symbolId: string, kind?: string): string {
  // Special role overrides → fixed glyph.
  if (kind === 'wild' || symbolId.toUpperCase().startsWith('WILD')) return 'wild';
  if (kind === 'scatter' || symbolId.toUpperCase().startsWith('SCATTER')) return 'scatter';
  if (kind === 'bonus' || symbolId.toUpperCase().startsWith('BONUS')) return 'bonus';
  if (kind === 'multiplier' || symbolId.toUpperCase().startsWith('MULT')) return 'mult';
  const idx = hashStr(symbolId) % ICON_POOL.length;
  return ICON_POOL[idx]!;
}

// ── Layout constants ────────────────────────────────────────────────

const CELL_W = 96;
const CELL_H = 96;
const CELL_GAP = 8;
const REELS = 5;
const ROWS = 3;
// Asymmetric offset — reels at index 1 (2nd) and 3 (4th) shifted up 12px.
const REEL_Y_OFFSET = [0, -12, 0, -12, 0];

const ACCEL_MS_DEFAULT = 300;
const DECEL_MS_DEFAULT = 200;
const STOP_CASCADE_DEFAULT = 120;
const ANTICIPATION_MS = 500;
const WIN_LINE_DELAY_MS = 1500;
const WIN_PULSE_MS = 1200;

// ── Implementation ──────────────────────────────────────────────────

interface RendererState {
  pixi: PixiNS | null;
  app: PixiNS | null;
  container: HTMLElement | null;
  ir: SlotGameIR | null;
  textureCache: Map<string, PixiNS> | null;
  reelContainers: PixiNS[];
  symbolPool: string[];
  destroyed: boolean;
  lastStopPositions: number[];
  lastWinLines: number[];
  headless: boolean;
  reelStopDelayMs: number;
  steadyMsRange: [number, number];
  /** Per-reel symbol sprite arrays (kept for win highlighting). */
  reelSprites: PixiNS[][];
  /** Win line overlay graphics. */
  winLayer: PixiNS | null;
}

function makeState(opts: CreateRendererOptions): RendererState {
  return {
    pixi: null,
    app: null,
    container: null,
    ir: null,
    textureCache: null,
    reelContainers: [],
    symbolPool: [],
    destroyed: false,
    lastStopPositions: [],
    lastWinLines: [],
    headless: !!opts.headless,
    reelStopDelayMs: opts.reelStopDelayMs ?? STOP_CASCADE_DEFAULT,
    steadyMsRange: opts.steadyMsRange ?? [500, 800],
    reelSprites: [],
    winLayer: null,
  };
}

/**
 * Generate a deterministic SVG data URL from a glyph id by inlining the
 * stroke-only SVG. Pixi v8 happily loads `data:image/svg+xml` URLs.
 */
function svgDataUrl(glyph: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="80" height="80">${SVG_PATH[glyph] ?? SVG_PATH.diamond}</svg>`;
  // Use encodeURIComponent to avoid base64 dependency.
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Inline glyph path map — minimal subset shared with the inline sprite
// in index.html (`<symbol id="g-…"/>`). Each path string is a single
// stroke-only path that renders as a 64×64 viewBox.
const SVG_PATH: Record<string, string> = {
  diamond: '<path d="M32 8 L 56 32 L 32 56 L 8 32 Z" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  crystal: '<path d="M22 8 L 42 8 L 54 24 L 32 58 L 10 24 Z" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  prism: '<path d="M32 8 L 54 24 L 46 54 L 18 54 L 10 24 Z" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  shard: '<path d="M16 10 L 48 14 L 52 50 L 22 54 L 12 36 Z" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  hexagon: '<path d="M32 8 L 54 20 L 54 44 L 32 56 L 10 44 L 10 20 Z" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  octagon: '<path d="M22 10 L 42 10 L 54 22 L 54 42 L 42 54 L 22 54 L 10 42 L 10 22 Z" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  star5: '<path d="M32 6 L 39 25 L 59 25 L 43 38 L 49 57 L 32 46 L 15 57 L 21 38 L 5 25 L 25 25 Z" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  star6: '<path d="M32 8 L 54 46 L 10 46 Z M 32 56 L 10 18 L 54 18 Z" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  pentagon: '<path d="M32 8 L 56 26 L 46 54 L 18 54 L 8 26 Z" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  triangle: '<path d="M32 10 L 54 50 L 10 50 Z" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  circle: '<circle cx="32" cy="32" r="22" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  pebble: '<path d="M14 30 C 14 18, 26 12, 36 14 C 48 16, 52 26, 50 38 C 48 50, 36 54, 26 52 C 16 50, 14 42, 14 30 Z" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  wave: '<path d="M8 28 C 16 20, 24 36, 32 28 C 40 20, 48 36, 56 28 M 8 40 C 16 32, 24 48, 32 40 C 40 32, 48 48, 56 40" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round"/>',
  arc: '<path d="M10 48 A 22 22 0 0 1 54 48 M 18 48 A 14 14 0 0 1 46 48 M 26 48 A 6 6 0 0 1 38 48" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round"/>',
  spiral: '<path d="M32 32 m-2 0 a 2 2 0 1 1 4 0 a 6 6 0 1 1 -10 0 a 12 12 0 1 1 22 0 a 20 20 0 1 1 -36 0" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  sigil: '<circle cx="32" cy="32" r="22" fill="none" stroke="#22D3EE" stroke-width="2"/><path d="M32 10 L 24 50 L 50 28 L 14 28 L 40 50 Z" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  sun: '<circle cx="32" cy="32" r="10" fill="none" stroke="#22D3EE" stroke-width="2"/><path d="M32 6 L 32 14 M 32 50 L 32 58 M 6 32 L 14 32 M 50 32 L 58 32 M 14 14 L 20 20 M 44 44 L 50 50 M 50 14 L 44 20 M 14 50 L 20 44" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round"/>',
  moon: '<path d="M44 12 C 28 14, 18 26, 18 38 C 18 50, 28 56, 40 56 C 32 52, 26 44, 26 34 C 26 24, 34 16, 44 12 Z" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  leaf: '<path d="M12 52 C 12 24, 32 8, 54 8 C 54 32, 38 52, 12 52 Z M 12 52 L 40 22" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  flame: '<path d="M32 6 C 38 16, 50 22, 48 36 C 46 50, 36 58, 32 58 C 28 58, 18 50, 16 36 C 14 24, 22 22, 26 30 C 24 18, 28 12, 32 6 Z" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  mountain: '<path d="M6 52 L 22 24 L 32 38 L 44 18 L 58 52 Z" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  eye: '<path d="M6 32 C 14 18, 24 14, 32 14 C 40 14, 50 18, 58 32 C 50 46, 40 50, 32 50 C 24 50, 14 46, 6 32 Z" fill="none" stroke="#22D3EE" stroke-width="2"/><circle cx="32" cy="32" r="7" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  gear: '<circle cx="32" cy="32" r="8" fill="none" stroke="#22D3EE" stroke-width="2"/><path d="M32 6 L 32 14 M 32 50 L 32 58 M 6 32 L 14 32 M 50 32 L 58 32 M 14 14 L 20 20 M 44 44 L 50 50 M 50 14 L 44 20 M 14 50 L 20 44" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round"/>',
  key: '<circle cx="20" cy="32" r="10" fill="none" stroke="#22D3EE" stroke-width="2"/><path d="M30 32 L 56 32 M 48 32 L 48 40 M 40 32 L 40 42" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round"/>',
  anchor: '<circle cx="32" cy="14" r="4" fill="none" stroke="#22D3EE" stroke-width="2"/><path d="M32 18 L 32 54 M 20 32 L 44 32 M 10 36 C 10 46, 22 54, 32 54 C 42 54, 54 46, 54 36" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  orbit: '<ellipse cx="32" cy="32" rx="22" ry="10" fill="none" stroke="#22D3EE" stroke-width="2"/><ellipse cx="32" cy="32" rx="22" ry="10" transform="rotate(60 32 32)" fill="none" stroke="#22D3EE" stroke-width="2"/><circle cx="32" cy="32" r="3" fill="#22D3EE"/>',
  sonar: '<circle cx="32" cy="32" r="3" fill="#22D3EE"/><circle cx="32" cy="32" r="10" fill="none" stroke="#22D3EE" stroke-width="2"/><circle cx="32" cy="32" r="18" fill="none" stroke="#22D3EE" stroke-width="1.5" stroke-dasharray="2 3"/>',
  chevron: '<path d="M16 18 L 32 32 L 48 18 M 16 36 L 32 50 L 48 36" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round"/>',
  knot: '<circle cx="22" cy="22" r="11" fill="none" stroke="#22D3EE" stroke-width="2"/><circle cx="42" cy="42" r="11" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  lattice: '<path d="M32 6 L 58 20 L 58 44 L 32 58 L 6 44 L 6 20 Z M 6 20 L 58 44 M 58 20 L 6 44 M 32 6 L 32 58" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  keystone: '<path d="M20 12 L 44 12 L 52 32 L 44 52 L 20 52 L 12 32 Z" fill="none" stroke="#22D3EE" stroke-width="2"/><circle cx="32" cy="32" r="6" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  obelisk: '<path d="M28 6 L 36 6 L 42 54 L 22 54 Z M 28 6 L 32 18 L 36 6 M 26 28 L 38 28 M 24 40 L 40 40" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  vortex: '<circle cx="32" cy="32" r="4" fill="none" stroke="#22D3EE" stroke-width="2"/><circle cx="32" cy="32" r="12" fill="none" stroke="#22D3EE" stroke-width="2"/><circle cx="32" cy="32" r="20" fill="none" stroke="#22D3EE" stroke-width="1.5" stroke-dasharray="2 4"/>',
  drop: '<path d="M32 6 C 20 22, 14 32, 14 42 C 14 52, 22 58, 32 58 C 42 58, 50 52, 50 42 C 50 32, 44 22, 32 6 Z" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  arrow: '<path d="M10 32 L 54 32 M 40 18 L 54 32 L 40 46" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round"/>',
  wild: '<path d="M32 6 L 38 24 L 58 24 L 42 36 L 48 56 L 32 44 L 16 56 L 22 36 L 6 24 L 26 24 Z" fill="none" stroke="#22D3EE" stroke-width="2.4"/>',
  scatter: '<circle cx="32" cy="32" r="4" fill="#22D3EE"/><circle cx="32" cy="32" r="12" fill="none" stroke="#22D3EE" stroke-width="2.4"/><circle cx="32" cy="32" r="20" fill="none" stroke="#22D3EE" stroke-width="1.5" stroke-dasharray="2 4"/>',
  bonus: '<rect x="8" y="20" width="48" height="36" rx="3" fill="none" stroke="#22D3EE" stroke-width="2"/><path d="M8 32 L 56 32 M 32 20 L 32 56" fill="none" stroke="#22D3EE" stroke-width="2"/>',
  mult: '<circle cx="32" cy="32" r="22" fill="none" stroke="#22D3EE" stroke-width="2"/><path d="M22 22 L 42 42 M 42 22 L 22 42" fill="none" stroke="#22D3EE" stroke-width="2"/>',
};

// ── Renderer factory ─────────────────────────────────────────────────

export function createSlotRenderer(opts: CreateRendererOptions = {}): SlotRenderer {
  const state = makeState(opts);

  async function mount(container: HTMLElement, ir: SlotGameIR): Promise<void> {
    state.container = container;
    state.ir = ir;
    state.symbolPool = ir.symbols.map((s) => s.id);

    if (state.headless) return;

    // Defer Pixi import so node/jsdom tests don't choke.
    const pixi = (await import('pixi.js')) as PixiNS;
    state.pixi = pixi;

    const app = new pixi.Application();
    const widthPx = REELS * CELL_W + (REELS - 1) * CELL_GAP + 32;
    const heightPx = ROWS * CELL_H + (ROWS - 1) * CELL_GAP + 32;
    await app.init({
      width: widthPx,
      height: heightPx,
      background: '#0B0E14',
      antialias: true,
      preference: 'webgl',
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    container.innerHTML = '';
    container.appendChild(app.canvas);
    state.app = app;

    // Pre-load textures for every symbol in the pool.
    const cache = new Map<string, PixiNS>();
    for (const s of ir.symbols) {
      const glyph = symbolIconFor(s.id, s.kind);
      const url = svgDataUrl(glyph);
      try {
        const tex = await pixi.Assets.load(url);
        cache.set(s.id, tex);
      } catch {
        // Texture load can fail in tests — fall back to a white texture.
        cache.set(s.id, pixi.Texture.WHITE);
      }
    }
    state.textureCache = cache;

    // Build reel containers + initial 3 visible sprites + 6 hidden buffer.
    const stage = app.stage as PixiNS;
    state.reelContainers = [];
    state.reelSprites = [];
    for (let r = 0; r < REELS; r++) {
      const reelC = new pixi.Container();
      reelC.x = 16 + r * (CELL_W + CELL_GAP);
      reelC.y = 16 + REEL_Y_OFFSET[r]!;
      const sprites: PixiNS[] = [];
      for (let row = 0; row < ROWS + 6; row++) {
        const symId = state.symbolPool[(r * ROWS + row) % state.symbolPool.length]!;
        const tex = cache.get(symId) ?? pixi.Texture.WHITE;
        const sprite = new pixi.Sprite(tex);
        sprite.width = CELL_W;
        sprite.height = CELL_H;
        sprite.y = row * (CELL_H + CELL_GAP);
        reelC.addChild(sprite);
        sprites.push(sprite);
      }
      stage.addChild(reelC);
      state.reelContainers.push(reelC);
      state.reelSprites.push(sprites);
    }

    // Win-line overlay (drawn on top of reels).
    state.winLayer = new pixi.Graphics();
    stage.addChild(state.winLayer);
  }

  function setIR(ir: SlotGameIR): void {
    state.ir = ir;
    state.symbolPool = ir.symbols.map((s) => s.id);
  }

  async function spin(arg: { seed: number; result: SpinResult }): Promise<void> {
    const { result } = arg;
    state.lastStopPositions = [...result.stopPositions];
    state.lastWinLines = result.wins.map((w) => w.paylineIndex ?? -1).filter((i) => i >= 0);

    if (state.headless || !state.app || !state.pixi) return;

    // Anticipation pre-check: count scatters in pre-last reels (0..REELS-2)
    // from the result grid.
    let scattersPreLast = 0;
    const ir = state.ir!;
    const scatterIds = new Set(
      ir.symbols.filter((s) => s.kind === 'scatter').map((s) => s.id),
    );
    for (let row = 0; row < result.grid.length; row++) {
      for (let c = 0; c < REELS - 1; c++) {
        const cell = result.grid[row]?.[c];
        if (cell && scatterIds.has(cell)) scattersPreLast++;
      }
    }
    const anticipate = scattersPreLast >= 2;

    const accel = ACCEL_MS_DEFAULT;
    const decel = DECEL_MS_DEFAULT;
    const cascade = state.reelStopDelayMs;
    const [steadyMin, steadyMax] = state.steadyMsRange;

    // Animate each reel sequentially.
    const pixi = state.pixi!;
    const reelPromises: Promise<void>[] = [];
    for (let r = 0; r < REELS; r++) {
      const isLast = r === REELS - 1;
      const steadyMs =
        steadyMin + ((hashStr(`${arg.seed}:${r}`) % 1000) / 1000) * (steadyMax - steadyMin);
      const holdMs = isLast && anticipate ? ANTICIPATION_MS : 0;
      const totalMs = accel + steadyMs + holdMs + decel + r * cascade;

      const reelC = state.reelContainers[r]!;
      const startY = reelC.y;
      // Final stop position offset = stop index modulo ROWS shifts visible.
      const stopOffset = (result.stopPositions[r] ?? 0) % (CELL_H + CELL_GAP);
      const finalY = 16 + REEL_Y_OFFSET[r]! - stopOffset;

      const p = new Promise<void>((resolve) => {
        const t0 = performance.now();
        const tick = (): void => {
          const now = performance.now();
          const dt = now - t0;
          if (dt >= totalMs) {
            reelC.y = finalY;
            if (state.app?.ticker) state.app.ticker.remove(tick);
            resolve();
            return;
          }
          // Compute scroll position: steady velocity then ease into stop.
          const phase = dt < accel ? dt / accel : 1;
          const remaining = Math.max(0, totalMs - dt);
          const stopEase = remaining < decel ? remaining / decel : 1;
          const speed = 8 * phase * stopEase;
          reelC.y = startY + Math.sin(dt * 0.02) * 2 - speed * dt * 0.05;
          // Wrap the visible window.
          const wrap = (CELL_H + CELL_GAP) * (ROWS + 3);
          if (reelC.y < -wrap) reelC.y = startY;
        };
        state.app!.ticker.add(tick);
      });
      reelPromises.push(p);
      void pixi;
    }

    await Promise.all(reelPromises);

    // Now snap the final grid: assign the result symbols to the 3 visible
    // sprite slots per reel.
    const cache = state.textureCache!;
    for (let r = 0; r < REELS; r++) {
      const sprites = state.reelSprites[r]!;
      for (let row = 0; row < ROWS; row++) {
        const symId = result.grid[row]?.[r] ?? state.symbolPool[0]!;
        const tex = cache.get(symId) ?? state.pixi!.Texture.WHITE;
        const sprite = sprites[row]!;
        sprite.texture = tex;
        sprite.y = row * (CELL_H + CELL_GAP);
      }
      // Hide buffer rows.
      for (let row = ROWS; row < sprites.length; row++) {
        sprites[row]!.visible = false;
      }
      state.reelContainers[r]!.y = 16 + REEL_Y_OFFSET[r]!;
    }

    // Draw win lines after a brief delay.
    if (result.wins.length > 0 && state.winLayer) {
      await delay(WIN_LINE_DELAY_MS);
      drawWinLines(state, result);
      pulseWinSprites(state, result);
    }
  }

  function destroy(): void {
    if (state.destroyed) return;
    state.destroyed = true;
    if (state.app) {
      try {
        state.app.destroy(true, { children: true, texture: true });
      } catch {
        /* ignore */
      }
    }
    state.app = null;
    state.pixi = null;
    state.textureCache?.clear();
    state.textureCache = null;
    state.reelContainers = [];
    state.reelSprites = [];
    if (state.container) state.container.innerHTML = '';
  }

  function _debugStopPositions(): number[] {
    return [...state.lastStopPositions];
  }

  return { mount, spin, destroy, setIR, _debugStopPositions };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function drawWinLines(state: RendererState, result: SpinResult): void {
  if (!state.winLayer || !state.pixi) return;
  const g = state.winLayer;
  g.clear();
  for (const win of result.wins) {
    if (!win.positions || win.positions.length === 0) continue;
    const pts: Array<[number, number]> = win.positions.map(([reel, row]) => [
      16 + reel * (CELL_W + CELL_GAP) + CELL_W / 2,
      16 + REEL_Y_OFFSET[reel]! + row * (CELL_H + CELL_GAP) + CELL_H / 2,
    ]);
    g.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
    g.stroke({ color: 0x22d3ee, width: 3, alpha: 0.9 });
  }
}

function pulseWinSprites(state: RendererState, result: SpinResult): void {
  if (!state.app || !state.pixi) return;
  const t0 = performance.now();
  const winCells = new Set<string>();
  for (const win of result.wins) {
    for (const [reel, row] of win.positions) winCells.add(`${reel},${row}`);
  }
  const tick = (): void => {
    const dt = performance.now() - t0;
    if (dt > WIN_PULSE_MS) {
      // Reset alpha and stop.
      for (let r = 0; r < REELS; r++) {
        const sprites = state.reelSprites[r];
        if (!sprites) continue;
        for (let row = 0; row < ROWS; row++) {
          const s = sprites[row];
          if (s) s.alpha = 1;
        }
      }
      state.app?.ticker.remove(tick);
      return;
    }
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(dt * 0.012));
    for (let r = 0; r < REELS; r++) {
      const sprites = state.reelSprites[r];
      if (!sprites) continue;
      for (let row = 0; row < ROWS; row++) {
        const s = sprites[row];
        if (!s) continue;
        s.alpha = winCells.has(`${r},${row}`) ? pulse : 1;
      }
    }
  };
  state.app.ticker.add(tick);
}
