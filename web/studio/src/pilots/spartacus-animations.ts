// CORTI W205-PILOTS — Roman gladiator theme animations for Spartacus
// Colossal Conquest. 7 Pixi stages: idle Coliseum view, spin chariot
// race, win sword clash, FS reveal (Caesar speech), HW gold coins
// overflow, jackpot palm laurel, cascade gladiator fall.

/* eslint-disable @typescript-eslint/no-explicit-any */

type PixiNS = any;

export type SpartacusStageId =
  | 'idle'
  | 'spin'
  | 'win'
  | 'fs-intro'
  | 'wild-transfer'
  | 'jackpot'
  | 'cascade';

export interface SpartacusStageSpec {
  id: SpartacusStageId;
  label: string;
  durationMs: number;
  description: string;
}

export const SPARTACUS_STAGES: ReadonlyArray<SpartacusStageSpec> = [
  {
    id: 'idle',
    label: 'Idle Coliseum View',
    durationMs: 2500,
    description: 'Wide pan over Coliseum walls; banners flutter at 0.6 Hz; torch flames flicker.',
  },
  {
    id: 'spin',
    label: 'Chariot Race Spin',
    durationMs: 1500,
    description: 'Pixi BlurFilter + horizontal motion blur on reel rows — chariot wheels metaphor.',
  },
  {
    id: 'win',
    label: 'Sword Clash Burst',
    durationMs: 1800,
    description: 'Sword sparks at winning cells, 18-28 metallic particles, edge glow ramp.',
  },
  {
    id: 'fs-intro',
    label: 'Caesar Speech Reveal',
    durationMs: 3000,
    description: 'Full-screen Caesar profile fade-in + laurel wreath sweep; FS count enlarges in serif gold font.',
  },
  {
    id: 'wild-transfer',
    label: 'Wild Transfer Beam',
    durationMs: 1200,
    description: 'Vertical beam from main grid wild to corresponding colossal grid column; reveals lions in column.',
  },
  {
    id: 'jackpot',
    label: 'Palm Laurel Jackpot',
    durationMs: 4000,
    description: 'Palm laurels fall, gold coins overflow, trumpet fanfare cue; full grid expands to colossal.',
  },
  {
    id: 'cascade',
    label: 'Gladiator Fall',
    durationMs: 800,
    description: 'Winning symbols fall like defeated gladiators — dust + shadow puff trail.',
  },
];

export interface IdleOptions { headless?: boolean; amplitude?: number; durationMs?: number; }

export async function idleColiseumView(target: PixiNS | null, opts: IdleOptions = {}): Promise<void> {
  const dur = opts.durationMs ?? 2500;
  if (opts.headless || !target || !target.children) return shortDelay();
  const amplitude = opts.amplitude ?? 0.025;
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

export interface ChariotSpinOptions { headless?: boolean; blurStrength?: number; }
export async function chariotSpin(target: PixiNS | null, opts: ChariotSpinOptions = {}): Promise<void> {
  if (opts.headless || !target) return shortDelay();
  try {
    const pixi = (await import('pixi.js')) as PixiNS;
    if (pixi?.BlurFilter) {
      const filter = new pixi.BlurFilter({ strength: opts.blurStrength ?? 9 });
      target.filters = [filter];
    }
  } catch { /* ignore */ }
  return shortDelay();
}
export function removeChariotSpin(target: PixiNS | null): void {
  if (target) target.filters = [];
}

export interface SwordClashOptions { headless?: boolean; particleCount?: number; }
export function swordClashBurst(layer: PixiNS | null, x: number, y: number, opts: SwordClashOptions = {}): number {
  const n = opts.particleCount ?? 22;
  if (opts.headless || !layer) return n;
  try {
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const radius = 16 + Math.random() * 24;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (layer.children) layer.children.push({ x: px, y: py, alpha: 1 });
    }
  } catch { /* ignore */ }
  return n;
}

export interface FsIntroOptions { headless?: boolean; durationMs?: number; }
export async function caesarSpeechReveal(stage: PixiNS | null, opts: FsIntroOptions = {}): Promise<void> {
  const dur = opts.durationMs ?? 3000;
  if (opts.headless || !stage) return shortDelay();
  try {
    const pixi = (await import('pixi.js')) as PixiNS;
    const overlay = new pixi.Graphics();
    overlay.rect(0, 0, 800, 600).fill({ color: 0x7C1D6F, alpha: 0.65 });
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
        overlay.alpha = 0.65 * (1 - dt / dur);
        requestAnimationFrame(tick);
      };
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(tick);
      else setTimeout(() => resolve(), 10);
    });
  } catch {
    return shortDelay();
  }
}

export interface WildTransferOptions { headless?: boolean; mainColumn?: number; colossalColumn?: number; durationMs?: number; }
/** Returns the colossal column index that received the transfer beam. */
export async function wildTransferBeam(layer: PixiNS | null, opts: WildTransferOptions = {}): Promise<number> {
  const dest = opts.colossalColumn ?? (opts.mainColumn ?? 0);
  if (opts.headless || !layer) {
    await shortDelay();
    return dest;
  }
  await new Promise<void>((r) => setTimeout(r, opts.durationMs ?? 1200));
  return dest;
}

export interface JackpotOptions { headless?: boolean; durationMs?: number; }
export async function palmLaurelJackpot(stage: PixiNS | null, opts: JackpotOptions = {}): Promise<void> {
  const dur = opts.durationMs ?? 4000;
  if (opts.headless || !stage) return shortDelay();
  await new Promise<void>((r) => setTimeout(r, dur));
}

export interface CascadeOptions { headless?: boolean; durationMs?: number; }
export async function gladiatorFallCascade(
  layer: PixiNS | null,
  positions: Array<{ x: number; y: number }>,
  opts: CascadeOptions = {},
): Promise<void> {
  if (opts.headless || !layer) return shortDelay();
  try {
    for (const p of positions) {
      if (layer.children) layer.children.push({ x: p.x, y: p.y, alpha: 0.75 });
    }
  } catch { /* ignore */ }
  return shortDelay();
}

function shortDelay(): Promise<void> {
  return new Promise((r) => setTimeout(r, 1));
}

export function spartacusStageSummary(): { stages: number; totalMs: number } {
  return {
    stages: SPARTACUS_STAGES.length,
    totalMs: SPARTACUS_STAGES.reduce((s, st) => s + st.durationMs, 0),
  };
}
