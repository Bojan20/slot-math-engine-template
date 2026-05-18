// CORTI 200.2 — Symbol/Art Pipeline.
//
// Production-grade pipeline that lets designers:
//   1. Upload custom SVG/PNG/WebP icons (per-symbol or to a workspace
//      icon library) with strict validation (size, MIME, no <script>).
//   2. Pick a pre-built theme (Geological / Cosmic / Botanical / Mineral)
//      that re-skins the variant's symbol icons + applies a CSS-var
//      palette.
//   3. Edit a 5-stage animation timeline (idle / spin / win / FS intro
//      / H&W reveal) and persist it on the variant.
//   4. Trigger audio cues via Web Audio API (preloaded sample bank +
//      user-uploaded custom cues) with master volume + mute support.
//   5. Export / import the entire custom-icon library as a ZIP pack.
//
// Designed to be deterministic and SSR-safe: every browser-only API
// (FileReader, AudioContext, JSZip, document) is guarded so the module
// is fully importable from a Node/vitest environment.

// ── Theme registry ──────────────────────────────────────────────────

export interface ThemeDef {
  id: string;
  name: string;
  description: string;
  palette: {
    primary: string;
    accent: string;
    deep: string;
    highlight: string;
  };
  background: string;
  iconMap: Record<string, string>;
}

import GEOLOGICAL from '../themes/geological.json';
import COSMIC from '../themes/cosmic.json';
import BOTANICAL from '../themes/botanical.json';
import MINERAL from '../themes/mineral.json';

export const THEMES: Record<string, ThemeDef> = {
  geological: GEOLOGICAL as ThemeDef,
  cosmic: COSMIC as ThemeDef,
  botanical: BOTANICAL as ThemeDef,
  mineral: MINERAL as ThemeDef,
};

export function listThemes(): ThemeDef[] {
  return Object.values(THEMES);
}

export function getTheme(id: string): ThemeDef | null {
  return THEMES[id] ?? null;
}

// ── Animation timeline ──────────────────────────────────────────────

export type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface AnimationState {
  idle: {
    durationSec: number; // 1..5
    easing: Easing;
  };
  spin: {
    blurPx: number; // 0..10
    speed: number;  // 1..3
  };
  win: {
    durationSec: number; // 0.5..2
    glowColor: string;   // #RRGGBB
  };
  fsIntro: {
    style: 'bounce' | 'slide' | 'zoom';
  };
  hwReveal: {
    style: 'sequential' | 'random' | 'wave';
  };
}

export function defaultAnimation(): AnimationState {
  return {
    idle: { durationSec: 2, easing: 'ease-in-out' },
    spin: { blurPx: 4, speed: 2 },
    win: { durationSec: 1.2, glowColor: '#22D3EE' },
    fsIntro: { style: 'bounce' },
    hwReveal: { style: 'sequential' },
  };
}

export function clampAnimation(a: Partial<AnimationState>): AnimationState {
  const d = defaultAnimation();
  const out: AnimationState = {
    idle: {
      durationSec: clamp(a.idle?.durationSec ?? d.idle.durationSec, 1, 5),
      easing: (a.idle?.easing ?? d.idle.easing) as Easing,
    },
    spin: {
      blurPx: clamp(a.spin?.blurPx ?? d.spin.blurPx, 0, 10),
      speed: clamp(a.spin?.speed ?? d.spin.speed, 1, 3),
    },
    win: {
      durationSec: clamp(a.win?.durationSec ?? d.win.durationSec, 0.5, 2),
      glowColor: /^#[0-9A-Fa-f]{6}$/.test(a.win?.glowColor ?? '')
        ? a.win!.glowColor
        : d.win.glowColor,
    },
    fsIntro: { style: (a.fsIntro?.style ?? d.fsIntro.style) },
    hwReveal: { style: (a.hwReveal?.style ?? d.hwReveal.style) },
  };
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

// ── Icon upload + validation ────────────────────────────────────────

export const MAX_ICON_BYTES = 100 * 1024; // 100 KB
export const MAX_AUDIO_BYTES = 200 * 1024; // 200 KB
export const VALID_ICON_MIMES = ['image/svg+xml', 'image/png', 'image/webp'];
export const VALID_AUDIO_MIMES = ['audio/mpeg', 'audio/mp3', 'audio/ogg'];

export interface IconValidation {
  ok: boolean;
  error?: string;
  /** Detected MIME type. */
  mime?: string;
  /** Detected family (svg|png|webp). */
  family?: 'svg' | 'png' | 'webp';
}

/**
 * Validate an icon by file name + raw text/bytes. Caller is expected
 * to pass:
 *   - filename (with extension)
 *   - bytes (size only — used for size cap)
 *   - text (SVG content if applicable — used for <script> guard)
 */
export function validateIcon(
  filename: string,
  byteSize: number,
  text?: string,
): IconValidation {
  if (byteSize > MAX_ICON_BYTES) {
    return { ok: false, error: `File too large (${byteSize} > ${MAX_ICON_BYTES})` };
  }
  const lower = filename.toLowerCase();
  if (lower.endsWith('.svg')) {
    if (!text) return { ok: false, error: 'SVG content missing' };
    if (/<\s*script[\s>]/i.test(text)) {
      return { ok: false, error: 'SVG contains <script> — refused' };
    }
    if (/on\w+\s*=\s*["']/i.test(text)) {
      return { ok: false, error: 'SVG contains inline event handler — refused' };
    }
    if (!/<svg[\s>]/i.test(text)) {
      return { ok: false, error: 'Not a valid SVG document' };
    }
    return { ok: true, mime: 'image/svg+xml', family: 'svg' };
  }
  if (lower.endsWith('.png')) {
    return { ok: true, mime: 'image/png', family: 'png' };
  }
  if (lower.endsWith('.webp')) {
    return { ok: true, mime: 'image/webp', family: 'webp' };
  }
  return {
    ok: false,
    error: 'Unsupported extension — must be .svg, .png, or .webp',
  };
}

export interface AudioValidation {
  ok: boolean;
  error?: string;
  mime?: string;
}

export function validateAudio(filename: string, byteSize: number): AudioValidation {
  if (byteSize > MAX_AUDIO_BYTES) {
    return { ok: false, error: `Audio too large (${byteSize} > ${MAX_AUDIO_BYTES})` };
  }
  const lower = filename.toLowerCase();
  if (lower.endsWith('.mp3')) return { ok: true, mime: 'audio/mpeg' };
  if (lower.endsWith('.ogg')) return { ok: true, mime: 'audio/ogg' };
  return {
    ok: false,
    error: 'Unsupported extension — must be .mp3 or .ogg',
  };
}

// ── Icon library (in-memory + variant-level) ────────────────────────

export interface CustomIcon {
  id: string;          // stable: e.g. "icon_1715812345_ab12"
  name: string;        // display name (default = filename without ext)
  family: 'svg' | 'png' | 'webp';
  /** data:image/...;base64,... or data:image/svg+xml;base64,... */
  dataUrl: string;
  /** Approx byte size, for budget tracking. */
  byteSize: number;
  createdAt: number;
}

export function makeIconId(): string {
  return `icon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class IconLibrary {
  private icons = new Map<string, CustomIcon>();

  add(icon: CustomIcon): void {
    this.icons.set(icon.id, icon);
  }
  remove(id: string): boolean {
    return this.icons.delete(id);
  }
  rename(id: string, newName: string): boolean {
    const ic = this.icons.get(id);
    if (!ic) return false;
    ic.name = newName.slice(0, 64);
    return true;
  }
  get(id: string): CustomIcon | undefined {
    return this.icons.get(id);
  }
  list(): CustomIcon[] {
    return Array.from(this.icons.values()).sort((a, b) => b.createdAt - a.createdAt);
  }
  count(): number {
    return this.icons.size;
  }
  clear(): void {
    this.icons.clear();
  }
  /** Bulk import (used when restoring from persisted state or ZIP). */
  importAll(icons: CustomIcon[]): void {
    for (const ic of icons) this.icons.set(ic.id, ic);
  }
  /** Plain array snapshot — for JSON persist. */
  snapshot(): CustomIcon[] {
    return this.list();
  }
}

// ── ZIP pack export / import ────────────────────────────────────────

/**
 * Export an icon library to a ZIP blob. Each icon is stored as
 * `<id>.<ext>` plus a `manifest.json` describing the names.
 *
 * Note: JSZip is dynamically imported so the module stays tree-shake
 * friendly + node-test-safe.
 */
export async function exportIconPack(icons: CustomIcon[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const manifest: Array<{ id: string; name: string; family: string; file: string }> = [];
  for (const ic of icons) {
    const ext = ic.family === 'svg' ? 'svg' : ic.family === 'png' ? 'png' : 'webp';
    const file = `${ic.id}.${ext}`;
    // Strip the data URL prefix to get the base64 body.
    const m = ic.dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (m) {
      zip.file(file, m[1]!, { base64: true });
    } else if (ic.dataUrl.startsWith('data:image/svg+xml;utf8,')) {
      const txt = decodeURIComponent(ic.dataUrl.slice('data:image/svg+xml;utf8,'.length));
      zip.file(file, txt);
    }
    manifest.push({ id: ic.id, name: ic.name, family: ic.family, file });
  }
  zip.file('manifest.json', JSON.stringify({ version: 1, icons: manifest }, null, 2));
  return zip.generateAsync({ type: 'blob' });
}

/**
 * Import a ZIP icon pack. Returns the freshly parsed CustomIcon list
 * (caller decides whether to merge or replace the library).
 */
export async function importIconPack(blob: Blob | ArrayBuffer | Uint8Array): Promise<CustomIcon[]> {
  const { default: JSZip } = await import('jszip');
  // JSZip is picky in node (no native Blob.arrayBuffer in some envs).
  // Normalise to ArrayBuffer.
  let payload: ArrayBuffer | Uint8Array;
  if (blob instanceof ArrayBuffer) {
    payload = blob;
  } else if (blob instanceof Uint8Array) {
    payload = blob;
  } else if (typeof (blob as Blob).arrayBuffer === 'function') {
    payload = await (blob as Blob).arrayBuffer();
  } else {
    throw new Error('Unsupported pack source');
  }
  const zip = await JSZip.loadAsync(payload);
  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) throw new Error('manifest.json missing in pack');
  const manifest = JSON.parse(await manifestEntry.async('string')) as {
    version: number;
    icons: Array<{ id: string; name: string; family: 'svg' | 'png' | 'webp'; file: string }>;
  };
  if (!manifest || !Array.isArray(manifest.icons)) {
    throw new Error('Invalid pack manifest');
  }
  const out: CustomIcon[] = [];
  for (const entry of manifest.icons) {
    const f = zip.file(entry.file);
    if (!f) continue;
    if (entry.family === 'svg') {
      const txt = await f.async('string');
      // Re-validate to keep <script>-free invariant.
      const v = validateIcon(entry.file, txt.length, txt);
      if (!v.ok) continue;
      out.push({
        id: entry.id,
        name: entry.name,
        family: 'svg',
        dataUrl: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(txt)))}`,
        byteSize: txt.length,
        createdAt: Date.now(),
      });
    } else {
      const u8 = await f.async('uint8array');
      const mime = entry.family === 'png' ? 'image/png' : 'image/webp';
      out.push({
        id: entry.id,
        name: entry.name,
        family: entry.family,
        dataUrl: `data:${mime};base64,${u8ToBase64(u8)}`,
        byteSize: u8.length,
        createdAt: Date.now(),
      });
    }
  }
  return out;
}

function u8ToBase64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  // btoa is available in both browser + modern node.
  if (typeof btoa !== 'undefined') return btoa(s);
  // Node fallback.
  return Buffer.from(u8).toString('base64');
}

// ── Audio engine (Web Audio API) ─────────────────────────────────────

export const PRELOADED_AUDIO_CUES = [
  'reel-spin',
  'reel-stop',
  'win-small',
  'win-big',
  'fs-intro',
  'hw-orb-land',
] as const;

export type AudioCueId = (typeof PRELOADED_AUDIO_CUES)[number] | string;

export interface AudioEngineState {
  muted: boolean;
  masterVolume: number; // 0..1
}

export interface AudioEngine {
  preloadDefaults(): Promise<void>;
  loadCustom(id: AudioCueId, buffer: ArrayBuffer): Promise<void>;
  play(id: AudioCueId, opts?: { loop?: boolean }): void;
  stop(id: AudioCueId): void;
  setMuted(muted: boolean): void;
  setVolume(v: number): void;
  list(): AudioCueId[];
  getState(): AudioEngineState;
}

/**
 * Default cue frequencies (used when the placeholder audio file isn't
 * available — we generate a 1-second tone via OscillatorNode).
 */
const FALLBACK_TONES: Record<string, number> = {
  'reel-spin': 220,
  'reel-stop': 330,
  'win-small': 523,
  'win-big': 660,
  'fs-intro': 392,
  'hw-orb-land': 466,
};

/**
 * Build the audio engine. The engine is fully usable in headless mode
 * — when AudioContext is unavailable (jsdom / node) every method
 * becomes a no-op but `list()` and `getState()` keep working.
 */
export function createAudioEngine(): AudioEngine {
  const state: AudioEngineState = { muted: false, masterVolume: 0.7 };
  const buffers = new Map<AudioCueId, AudioBuffer | null>();
  const active = new Map<AudioCueId, AudioBufferSourceNode>();
  // Mark preloaded cues even when no AudioContext exists so list() is honest.
  for (const id of PRELOADED_AUDIO_CUES) buffers.set(id, null);

  // Audio context — lazily created on first user interaction (browser
  // policy). Null in node / jsdom.
  let ctx: AudioContext | null = null;
  const HAS_AUDIO = typeof globalThis !== 'undefined'
    && typeof (globalThis as { AudioContext?: unknown }).AudioContext === 'function';

  function ensureCtx(): AudioContext | null {
    if (!HAS_AUDIO) return null;
    if (!ctx) {
      try {
        ctx = new (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext();
      } catch { ctx = null; }
    }
    return ctx;
  }

  async function preloadDefaults(): Promise<void> {
    // In production we'd `fetch(new URL('../audio/<id>.mp3', import.meta.url))`
    // and decodeAudioData. Browsers without those files fall back to
    // synth tones. Node tests skip entirely.
    const c = ensureCtx();
    if (!c) return;
    for (const id of PRELOADED_AUDIO_CUES) {
      try {
        const res = await fetch(new URL(`../audio/${id}.mp3`, import.meta.url).href);
        if (!res.ok) throw new Error('not found');
        const ab = await res.arrayBuffer();
        const buf = await c.decodeAudioData(ab);
        buffers.set(id, buf);
      } catch {
        // Synth fallback: 1-second sine tone.
        buffers.set(id, synthTone(c, FALLBACK_TONES[id] ?? 440, 1));
      }
    }
  }

  async function loadCustom(id: AudioCueId, buffer: ArrayBuffer): Promise<void> {
    const c = ensureCtx();
    if (!c) {
      // Even without ctx, mark as registered.
      buffers.set(id, null);
      return;
    }
    try {
      const buf = await c.decodeAudioData(buffer.slice(0));
      buffers.set(id, buf);
    } catch (err) {
      throw new Error(`decode failed: ${(err as Error).message}`);
    }
  }

  function play(id: AudioCueId, opts?: { loop?: boolean }): void {
    if (state.muted) return;
    const c = ensureCtx();
    if (!c) return;
    const buf = buffers.get(id);
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = !!opts?.loop;
    const g = c.createGain();
    g.gain.value = state.masterVolume;
    src.connect(g).connect(c.destination);
    src.start();
    active.set(id, src);
  }

  function stop(id: AudioCueId): void {
    const src = active.get(id);
    if (!src) return;
    try { src.stop(); } catch { /* ignore */ }
    active.delete(id);
  }

  function setMuted(muted: boolean): void {
    state.muted = !!muted;
    if (muted) for (const id of Array.from(active.keys())) stop(id);
  }
  function setVolume(v: number): void {
    state.masterVolume = clamp(v, 0, 1);
  }
  function list(): AudioCueId[] {
    return Array.from(buffers.keys());
  }
  function getState(): AudioEngineState {
    return { ...state };
  }

  return { preloadDefaults, loadCustom, play, stop, setMuted, setVolume, list, getState };
}

/** Generate a 1-second sine tone as a fallback synth cue. */
function synthTone(ctx: AudioContext, freq: number, dur: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * dur);
  const buf = ctx.createBuffer(1, len, rate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    const env = Math.min(1, t * 20) * Math.min(1, (dur - t) * 8);
    ch[i] = Math.sin(2 * Math.PI * freq * t) * 0.25 * env;
  }
  return buf;
}

// ── Theme application ──────────────────────────────────────────────

export interface ThemeApplyTarget {
  /** Workspace-level CSS custom property prefix (e.g. ":root" or per-variant). */
  cssVarHost?: HTMLElement;
  /** Per-variant symbol list to re-skin (mutated in place). */
  symbols: Array<{ id: string; icon: string; customIconData?: string }>;
}

/**
 * Apply a theme by:
 *   1. Walking each variant symbol and assigning the theme's
 *      `iconMap[symbol.id]` as the new `icon` (unless the symbol
 *      already has a `customIconData` override, in which case the
 *      uploaded icon wins).
 *   2. Setting CSS custom properties on the host element.
 *
 * Returns the count of symbols whose icon was changed.
 */
export function applyTheme(themeId: string, target: ThemeApplyTarget): number {
  const theme = getTheme(themeId);
  if (!theme) return 0;
  let changed = 0;
  for (const sym of target.symbols) {
    // Per-symbol custom icon overrides the theme.
    if (sym.customIconData) continue;
    const mapped = theme.iconMap[sym.id];
    if (mapped && mapped !== sym.icon) {
      sym.icon = mapped;
      changed++;
    }
  }
  if (target.cssVarHost) {
    const el = target.cssVarHost;
    el.style.setProperty('--theme-primary', theme.palette.primary);
    el.style.setProperty('--theme-accent', theme.palette.accent);
    el.style.setProperty('--theme-deep', theme.palette.deep);
    el.style.setProperty('--theme-highlight', theme.palette.highlight);
    el.style.setProperty('--theme-bg', theme.background);
  }
  return changed;
}

// ── File reader helper (browser only) ───────────────────────────────

/** Read a File as a data: URL. Browser only; returns null in node. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader not available'));
      return;
    }
    const r = new FileReader();
    r.onerror = () => reject(new Error('read failed'));
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(file);
  });
}

/** Read a File as text. Browser only. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader not available'));
      return;
    }
    const r = new FileReader();
    r.onerror = () => reject(new Error('read failed'));
    r.onload = () => resolve(r.result as string);
    r.readAsText(file);
  });
}
