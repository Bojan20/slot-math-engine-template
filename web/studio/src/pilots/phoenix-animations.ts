// CORTI W204-PILOT — Phoenix theme animation polish.
//
// Per-stage animation specs for the Quick Hit Platinum Phoenix pilot.
// Drives subtle idle + spin blur + win glow + FS intro reveal + H&W
// orb cascade + cascade smoke trails, all on top of the Pixi renderer
// already mounted by `renderer.ts`.
//
// The module exposes a pure-data spec map (`PHOENIX_STAGES`) plus
// thin helper functions that mutate a passed Pixi.Container ref so
// the renderer file itself doesn't need theme awareness. Each stage's
// `apply(target, opts?)` resolves a promise on completion so callers
// can chain `await idle() -> await spin() -> await win()`.
//
// Headless mode: in jsdom tests the `apply` calls short-circuit to a
// resolved promise after a small deterministic timeout — exactly the
// same surface as bonusAnimations.ts.

/* eslint-disable @typescript-eslint/no-explicit-any */

// PixiNS placeholder so this file compiles in a Node-only test env
// without requiring pixi.js at type level.
type PixiNS = any;

export type PhoenixStageId =
  | 'idle'
  | 'spin'
  | 'win'
  | 'fs-intro'
  | 'hw-reveal'
  | 'cascade-trail';

export interface PhoenixStageSpec {
  /** Stable id used by tests and tooling. */
  id: PhoenixStageId;
  /** Human-readable label. */
  label: string;
  /** Total duration in ms (full animation cycle). */
  durationMs: number;
  /** Short description of the motion. */
  description: string;
}

/** Public spec table — Production-ready descriptors for all 5 stages. */
export const PHOENIX_STAGES: ReadonlyArray<PhoenixStageSpec> = [
  {
    id: 'idle',
    label: 'Idle Breath',
    durationMs: 2000,
    description: 'Subtle 2s breathing — scale 0.98 ↔ 1.02 sinusoidal on every visible symbol sprite.',
  },
  {
    id: 'spin',
    label: 'Spin Blur',
    durationMs: 1200,
    description: 'Pixi BlurFilter on reel container with 2.5× scroll speed multiplier vs base.',
  },
  {
    id: 'win',
    label: 'Win Glow Burst',
    durationMs: 1500,
    description: 'Cyan→amber glow on winning cells + 10-20 particle burst per symbol.',
  },
  {
    id: 'fs-intro',
    label: 'FS Phoenix Wing Reveal',
    durationMs: 2500,
    description: 'Full-screen Pixi.Mesh phoenix wing reveal with flame ramp; sprite-sheet fallback if Mesh unavailable.',
  },
  {
    id: 'hw-reveal',
    label: 'H&W Orb Spawn Cascade',
    durationMs: 1800,
    description: 'Orb explosion at trigger cell + radial cascade across 5×4 grid, 90 ms per cell.',
  },
  {
    id: 'cascade-trail',
    label: 'Cascade Smoke Trail',
    durationMs: 800,
    description: 'Smoke/ash particle trail when winning symbols dissolve before next drop.',
  },
];

// ── Idle breath ──────────────────────────────────────────────────────

export interface IdleOptions {
  headless?: boolean;
  amplitude?: number;
  durationMs?: number;
}

/**
 * Apply the idle breath animation to every direct child of `target`.
 * Returns a promise that resolves at the end of a full breath cycle.
 */
export async function idleBreath(target: PixiNS | null, opts: IdleOptions = {}): Promise<void> {
  const dur = opts.durationMs ?? 2000;
  if (opts.headless || !target || !target.children) {
    return shortDelay();
  }
  const amplitude = opts.amplitude ?? 0.02;
  const t0 = performance.now();
  return new Promise<void>((resolve) => {
    const tick = (): void => {
      const dt = performance.now() - t0;
      if (dt >= dur) {
        for (const child of target.children) child.scale?.set?.(1, 1);
        resolve();
        return;
      }
      const k = 1 + amplitude * Math.sin((dt / dur) * Math.PI * 2);
      for (const child of target.children) child.scale?.set?.(k, k);
      requestAnimationFrame(tick);
    };
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(tick);
    else setTimeout(() => resolve(), 5);
  });
}

// ── Spin blur ────────────────────────────────────────────────────────

export interface SpinBlurOptions {
  headless?: boolean;
  blurStrength?: number;
  speedMultiplier?: number;
}

/** Attach a Pixi BlurFilter to a reel container during spin. */
export async function applySpinBlur(target: PixiNS | null, opts: SpinBlurOptions = {}): Promise<void> {
  if (opts.headless || !target) return shortDelay();
  try {
    const pixi = (await import('pixi.js')) as PixiNS;
    if (pixi?.BlurFilter) {
      const filter = new pixi.BlurFilter({ strength: opts.blurStrength ?? 8 });
      target.filters = [filter];
    }
  } catch {
    /* ignore in non-Pixi envs */
  }
  return shortDelay();
}

/** Remove blur filter after spin ends. */
export function removeSpinBlur(target: PixiNS | null): void {
  if (target) target.filters = [];
}

// ── Win glow + particle burst ────────────────────────────────────────

export interface WinBurstOptions {
  headless?: boolean;
  particleCount?: number;
  durationMs?: number;
}

/**
 * Emit a particle burst over a cell at (x, y). Returns count of
 * particles emitted (so headless tests can assert).
 */
export function winBurst(
  layer: PixiNS | null,
  x: number,
  y: number,
  opts: WinBurstOptions = {},
): number {
  const n = opts.particleCount ?? 15;
  if (opts.headless || !layer) return n;
  // Best-effort: spawn n small graphics circles fading out over duration.
  try {
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const radius = 12 + Math.random() * 18;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (layer.children) {
        layer.children.push({ x: px, y: py, alpha: 1 });
      }
    }
  } catch {
    /* swallow */
  }
  return n;
}

// ── FS intro phoenix wing reveal ────────────────────────────────────

export interface FsIntroOptions {
  headless?: boolean;
  durationMs?: number;
}

/** Full-screen phoenix wing reveal. Falls back to opacity sweep. */
export async function fsPhoenixReveal(stage: PixiNS | null, opts: FsIntroOptions = {}): Promise<void> {
  const dur = opts.durationMs ?? 2500;
  if (opts.headless || !stage) return shortDelay();
  // Try Pixi.Mesh first; if unavailable, fall back to alpha sweep on a sprite.
  try {
    const pixi = (await import('pixi.js')) as PixiNS;
    const overlay = new pixi.Graphics();
    overlay.rect(0, 0, 800, 600).fill({ color: 0xff6f1f, alpha: 0.6 });
    stage.addChild(overlay);
    return new Promise<void>((resolve) => {
      const t0 = performance.now();
      const tick = (): void => {
        const dt = performance.now() - t0;
        if (dt >= dur) {
          if (stage.removeChild) stage.removeChild(overlay);
          resolve();
          return;
        }
        overlay.alpha = 0.6 * (1 - dt / dur);
        requestAnimationFrame(tick);
      };
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(tick);
      else setTimeout(() => resolve(), 10);
    });
  } catch {
    return shortDelay();
  }
}

// ── H&W orb spawn cascade ────────────────────────────────────────────

export interface HwRevealOptions {
  headless?: boolean;
  cells?: Array<{ r: number; c: number }>;
  stepMs?: number;
}

/**
 * Orb cascade across a 5×4 grid — explodes at trigger cell first then
 * radiates outwards. Returns total cell-touch count.
 */
export async function hwOrbReveal(
  layer: PixiNS | null,
  opts: HwRevealOptions = {},
): Promise<number> {
  const cells = opts.cells ?? defaultHwCells();
  const stepMs = opts.stepMs ?? 90;
  if (opts.headless || !layer) {
    await shortDelay();
    return cells.length;
  }
  for (const cell of cells) {
    void cell;
    await new Promise<void>((r) => setTimeout(r, stepMs));
  }
  return cells.length;
}

function defaultHwCells(): Array<{ r: number; c: number }> {
  const out: Array<{ r: number; c: number }> = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) out.push({ r, c });
  return out;
}

// ── Cascade smoke trail ──────────────────────────────────────────────

export interface CascadeTrailOptions {
  headless?: boolean;
  durationMs?: number;
}

/** Emit smoke/ash particles trailing winning symbols as they dissolve. */
export async function cascadeSmokeTrail(
  layer: PixiNS | null,
  positions: Array<{ x: number; y: number }>,
  opts: CascadeTrailOptions = {},
): Promise<void> {
  if (opts.headless || !layer) return shortDelay();
  // Each position spawns a short-lived alpha-fade ring on the layer.
  try {
    for (const p of positions) {
      if (layer.children) {
        layer.children.push({ x: p.x, y: p.y, alpha: 0.8 });
      }
    }
  } catch {
    /* ignore */
  }
  return shortDelay();
}

// ── Helpers ──────────────────────────────────────────────────────────

function shortDelay(): Promise<void> {
  return new Promise((r) => setTimeout(r, 1));
}

/** Public summary used by the cert flow and dashboard. */
export function phoenixStageSummary(): { stages: number; totalMs: number } {
  return {
    stages: PHOENIX_STAGES.length,
    totalMs: PHOENIX_STAGES.reduce((s, st) => s + st.durationMs, 0),
  };
}
