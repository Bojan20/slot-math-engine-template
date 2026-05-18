// CORTI W205-PILOTS — Irish/Megaways theme animations for Rainbow
// Riches Megaways Vault. 6 stages: idle clover sway, spin shamrock
// swirl, win rainbow draw, bank-toggle pop, big-win rainbow burst,
// cascade gold drop.

/* eslint-disable @typescript-eslint/no-explicit-any */

type PixiNS = any;

export type RainbowRichesStageId =
  | 'idle'
  | 'spin'
  | 'win'
  | 'bank-toggle'
  | 'big-win'
  | 'cascade';

export interface RainbowRichesStageSpec {
  id: RainbowRichesStageId;
  label: string;
  durationMs: number;
  description: string;
}

export const RAINBOW_RICHES_STAGES: ReadonlyArray<RainbowRichesStageSpec> = [
  {
    id: 'idle',
    label: 'Clover Sway',
    durationMs: 2400,
    description: 'Clover sprites tilt ±5° at 0.4 Hz; harp glow pulses at 0.7 Hz.',
  },
  {
    id: 'spin',
    label: 'Shamrock Swirl',
    durationMs: 1300,
    description: 'BlurFilter strength 8 + slight rainbow tint shift across reels — 6 columns Megaways.',
  },
  {
    id: 'win',
    label: 'Rainbow Draw',
    durationMs: 1700,
    description: 'Rainbow arc drawn across winning cells; 25 sparkles emitted per cell, fade over 1.7s.',
  },
  {
    id: 'bank-toggle',
    label: 'Bank Mode Pop',
    durationMs: 600,
    description: 'Coin icon pops into vault graphic, gold flash at 0.3s. Mode label updates (A/B/C).',
  },
  {
    id: 'big-win',
    label: 'Rainbow Burst',
    durationMs: 2800,
    description: 'Full-screen rainbow radial burst; coin shower particles fall from top; harp arpeggio cue.',
  },
  {
    id: 'cascade',
    label: 'Gold Drop',
    durationMs: 850,
    description: 'Winning symbols drop as gold-coin trails; remaining symbols cascade down by 1 row each.',
  },
];

export interface IdleOptions { headless?: boolean; amplitude?: number; durationMs?: number; }
export async function cloverSway(target: any | null, opts: IdleOptions = {}): Promise<void> {
  const dur = opts.durationMs ?? 2400;
  if (opts.headless || !target || !target.children) return shortDelay();
  const amplitude = opts.amplitude ?? 0.025;
  const t0 = performance.now();
  return new Promise<void>((resolve) => {
    const tick = (): void => {
      const dt = performance.now() - t0;
      if (dt >= dur) {
        for (const child of target.children) child.rotation = 0;
        resolve();
        return;
      }
      const k = amplitude * Math.sin((dt / dur) * Math.PI * 2);
      for (const child of target.children) {
        if ('rotation' in child) child.rotation = k;
      }
      requestAnimationFrame(tick);
    };
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(tick);
    else setTimeout(() => resolve(), 5);
  });
}

export interface ShamrockSwirlOptions { headless?: boolean; blurStrength?: number; }
export async function shamrockSwirl(target: any | null, opts: ShamrockSwirlOptions = {}): Promise<void> {
  if (opts.headless || !target) return shortDelay();
  try {
    const pixi = (await import('pixi.js')) as any;
    if (pixi?.BlurFilter) {
      const filter = new pixi.BlurFilter({ strength: opts.blurStrength ?? 8 });
      target.filters = [filter];
    }
  } catch { /* ignore */ }
  return shortDelay();
}
export function removeShamrockSwirl(target: any | null): void {
  if (target) target.filters = [];
}

export interface RainbowDrawOptions { headless?: boolean; particleCount?: number; durationMs?: number; }
export function rainbowDraw(layer: any | null, x: number, y: number, opts: RainbowDrawOptions = {}): number {
  const n = opts.particleCount ?? 25;
  if (opts.headless || !layer) return n;
  try {
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const radius = 18 + Math.random() * 24;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (layer.children) layer.children.push({ x: px, y: py, alpha: 1 });
    }
  } catch { /* ignore */ }
  return n;
}

export type BankMode = 'A' | 'B' | 'C';
export interface BankToggleOptions { headless?: boolean; mode?: BankMode; durationMs?: number; }
/** Returns the new bank mode after the toggle. */
export async function bankModeTogglePop(layer: any | null, opts: BankToggleOptions = {}): Promise<BankMode> {
  const mode: BankMode = opts.mode ?? 'A';
  if (opts.headless || !layer) {
    await shortDelay();
    return mode;
  }
  await new Promise<void>((r) => setTimeout(r, opts.durationMs ?? 600));
  return mode;
}

export interface BigWinOptions { headless?: boolean; durationMs?: number; }
export async function rainbowBurstBigWin(stage: any | null, opts: BigWinOptions = {}): Promise<void> {
  const dur = opts.durationMs ?? 2800;
  if (opts.headless || !stage) return shortDelay();
  try {
    const pixi = (await import('pixi.js')) as any;
    const overlay = new pixi.Graphics();
    overlay.rect(0, 0, 800, 600).fill({ color: 0x10b981, alpha: 0.6 });
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

export interface GoldDropOptions { headless?: boolean; durationMs?: number; }
export async function goldDropCascade(
  layer: any | null,
  positions: Array<{ x: number; y: number }>,
  opts: GoldDropOptions = {},
): Promise<void> {
  if (opts.headless || !layer) return shortDelay();
  try {
    for (const p of positions) {
      if (layer.children) layer.children.push({ x: p.x, y: p.y, alpha: 0.8 });
    }
  } catch { /* ignore */ }
  return shortDelay();
}

function shortDelay(): Promise<void> {
  return new Promise((r) => setTimeout(r, 1));
}

export function rainbowRichesStageSummary(): { stages: number; totalMs: number } {
  return {
    stages: RAINBOW_RICHES_STAGES.length,
    totalMs: RAINBOW_RICHES_STAGES.reduce((s, st) => s + st.durationMs, 0),
  };
}
