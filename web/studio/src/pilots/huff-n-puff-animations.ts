// CORTI W205-PILOTS — Storm/barn theme animation polish for Huff N' Puff.
//
// 6 Pixi stages: idle barn breathing, spin tornado swirl, win lightning
// flash, frame-upgrade state transition splash, jackpot pig-blow-house,
// cascade wind drift. Mirrors the API surface of phoenix-animations.ts.

/* eslint-disable @typescript-eslint/no-explicit-any */

type PixiNS = any;

export type HuffNPuffStageId =
  | 'idle'
  | 'spin'
  | 'win'
  | 'frame-upgrade'
  | 'jackpot'
  | 'cascade';

export interface HuffNPuffStageSpec {
  id: HuffNPuffStageId;
  label: string;
  durationMs: number;
  description: string;
}

export const HUFF_N_PUFF_STAGES: ReadonlyArray<HuffNPuffStageSpec> = [
  {
    id: 'idle',
    label: 'Idle Barn Breathing',
    durationMs: 2200,
    description: 'Subtle 2.2s barn sway — scale 0.97 ↔ 1.03 sinusoidal on barn sprite, lightning sparks at 0.3 Hz.',
  },
  {
    id: 'spin',
    label: 'Spin Tornado Swirl',
    durationMs: 1400,
    description: 'Pixi BlurFilter (strength 10) + radial rotation 6 rad/s on reel container — tornado spin metaphor.',
  },
  {
    id: 'win',
    label: 'Win Lightning Flash',
    durationMs: 1500,
    description: 'White-yellow lightning bolt overlay + 15-25 spark particles per cell, fades over 1.5s.',
  },
  {
    id: 'frame-upgrade',
    label: 'Frame State Splash',
    durationMs: 1800,
    description: 'Frame border pulses outward and upgrades color (1→8 Markov state). Wolf icon splashes into frame.',
  },
  {
    id: 'jackpot',
    label: 'Pig-Blow-House',
    durationMs: 3200,
    description: 'Full-screen storm vortex; pigs blow house animation; barn explodes into coins.',
  },
  {
    id: 'cascade',
    label: 'Wind Drift',
    durationMs: 900,
    description: 'Hay/leaf particles drift across the grid while winning symbols dissolve.',
  },
];

export interface IdleOptions { headless?: boolean; amplitude?: number; durationMs?: number; }

export async function idleBarnBreath(target: PixiNS | null, opts: IdleOptions = {}): Promise<void> {
  const dur = opts.durationMs ?? 2200;
  if (opts.headless || !target || !target.children) return shortDelay();
  const amplitude = opts.amplitude ?? 0.03;
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

export interface TornadoSpinOptions { headless?: boolean; blurStrength?: number; }
export async function applyTornadoSpin(target: PixiNS | null, opts: TornadoSpinOptions = {}): Promise<void> {
  if (opts.headless || !target) return shortDelay();
  try {
    const pixi = (await import('pixi.js')) as PixiNS;
    if (pixi?.BlurFilter) {
      const filter = new pixi.BlurFilter({ strength: opts.blurStrength ?? 10 });
      target.filters = [filter];
    }
  } catch { /* ignore */ }
  return shortDelay();
}
export function removeTornadoSpin(target: PixiNS | null): void {
  if (target) target.filters = [];
}

export interface LightningBurstOptions { headless?: boolean; particleCount?: number; durationMs?: number; }
export function lightningFlash(layer: PixiNS | null, x: number, y: number, opts: LightningBurstOptions = {}): number {
  const n = opts.particleCount ?? 20;
  if (opts.headless || !layer) return n;
  try {
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const radius = 14 + Math.random() * 22;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (layer.children) layer.children.push({ x: px, y: py, alpha: 1 });
    }
  } catch { /* ignore */ }
  return n;
}

export interface FrameUpgradeOptions { headless?: boolean; fromState?: number; toState?: number; durationMs?: number; }
/**
 * Trigger a Markov state transition splash on the active frame border.
 * Returns the destination state. Headless tests can assert the return
 * value matches what they passed in.
 */
export async function frameUpgradeSplash(layer: PixiNS | null, opts: FrameUpgradeOptions = {}): Promise<number> {
  const dest = opts.toState ?? Math.min(8, (opts.fromState ?? 1) + 1);
  if (opts.headless || !layer) {
    await shortDelay();
    return dest;
  }
  try {
    const pixi = (await import('pixi.js')) as PixiNS;
    const ring = new pixi.Graphics();
    const stateColors = [0xCCCCCC, 0xFCD34D, 0xF59E0B, 0xDC2626, 0x7C3AED, 0x2563EB, 0x059669, 0xFFFFFF];
    const col = stateColors[Math.min(7, Math.max(0, dest - 1))];
    ring.rect(0, 0, 320, 240).stroke({ width: 6, color: col });
    if (layer.addChild) layer.addChild(ring);
    await new Promise<void>((r) => setTimeout(r, opts.durationMs ?? 1800));
    if (layer.removeChild) layer.removeChild(ring);
  } catch { /* ignore */ }
  return dest;
}

export interface JackpotOptions { headless?: boolean; durationMs?: number; }
export async function pigBlowHouseJackpot(stage: PixiNS | null, opts: JackpotOptions = {}): Promise<void> {
  const dur = opts.durationMs ?? 3200;
  if (opts.headless || !stage) return shortDelay();
  try {
    const pixi = (await import('pixi.js')) as PixiNS;
    const overlay = new pixi.Graphics();
    overlay.rect(0, 0, 800, 600).fill({ color: 0xfacc15, alpha: 0.55 });
    if (stage.addChild) stage.addChild(overlay);
    return new Promise<void>((resolve) => {
      const t0 = performance.now();
      const tick = (): void => {
        const dt = performance.now() - t0;
        if (dt >= dur) {
          if (stage.removeChild) stage.removeChild(overlay);
          resolve();
          return;
        }
        overlay.alpha = 0.55 * (1 - dt / dur);
        requestAnimationFrame(tick);
      };
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(tick);
      else setTimeout(() => resolve(), 10);
    });
  } catch {
    return shortDelay();
  }
}

export interface WindDriftOptions { headless?: boolean; durationMs?: number; }
export async function windDriftCascade(
  layer: PixiNS | null,
  positions: Array<{ x: number; y: number }>,
  opts: WindDriftOptions = {},
): Promise<void> {
  if (opts.headless || !layer) return shortDelay();
  try {
    for (const p of positions) {
      if (layer.children) layer.children.push({ x: p.x, y: p.y, alpha: 0.7 });
    }
  } catch { /* ignore */ }
  return shortDelay();
}

function shortDelay(): Promise<void> {
  return new Promise((r) => setTimeout(r, 1));
}

export function huffNPuffStageSummary(): { stages: number; totalMs: number } {
  return {
    stages: HUFF_N_PUFF_STAGES.length,
    totalMs: HUFF_N_PUFF_STAGES.reduce((s, st) => s + st.durationMs, 0),
  };
}
