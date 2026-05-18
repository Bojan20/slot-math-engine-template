// W209 Agent B — White-label theming engine.
//
// A theme is a static descriptor:
//   { palette, typography, symbol_pack, audio_pack, animation_style, cabinet_wrapper }
//
// applyTheme(themeId) mutates a target studio state (palette CSS vars,
// symbol/audio/animation refs, cabinet chrome) and notifies subscribers.
// Pure client-side — no backend, no fetch, no fs.
//
// Cyan + onyx base palette (v5 onyx + cyan) is the constant — themes
// override only accent / deep / highlight tokens to keep brand-consistent
// chrome across reskins.
//
// Used by:
//   - re-skin wizard (web/marketplace/src/reskin-wizard.ts)
//   - studio render layer (CSS var binding)
//   - kernel preview pane

import { asianDragon } from './themes/asian-dragon.js';
import { underwater } from './themes/underwater.js';
import { sciFi } from './themes/sci-fi.js';
import { mythological } from './themes/mythological.js';
import { royal } from './themes/royal.js';
import { space } from './themes/space.js';
import { fairyTale } from './themes/fairy-tale.js';
import { urbanCash } from './themes/urban-cash.js';

export type ThemeId =
  | 'asian-dragon'
  | 'underwater'
  | 'sci-fi'
  | 'mythological'
  | 'royal'
  | 'space'
  | 'fairy-tale'
  | 'urban-cash';

export interface ThemePalette {
  /** Brand base (cyan v5 onyx anchor — NEVER overridden by themes). */
  primary: string;
  /** Theme-specific accent (gold / pearl / plasma / etc). */
  accent: string;
  /** Deep / background gradient stop. */
  deep: string;
  /** Highlight / glow / win-flash tint. */
  highlight: string;
  /** Warning / err / state colors inherit from base; provided for completeness. */
  warn: string;
  err: string;
}

export interface ThemeTypography {
  display: string;
  body: string;
  numeric: string;
}

export type AnimationStyle =
  | 'crimson-burst'
  | 'pearl-shimmer'
  | 'plasma-pulse'
  | 'flame-rise'
  | 'gold-sparkle'
  | 'star-warp'
  | 'sparkle-dust'
  | 'neon-flicker';

export type CabinetWrapper =
  | 'lacquered-bezel'
  | 'coral-ring'
  | 'chrome-hex'
  | 'stone-arch'
  | 'royal-velvet'
  | 'starship-hull'
  | 'enchanted-vine'
  | 'graffiti-frame';

export interface Theme {
  id: ThemeId;
  displayName: string;
  description: string;
  palette: ThemePalette;
  typography: ThemeTypography;
  symbol_pack: string;
  audio_pack: string;
  animation_style: AnimationStyle;
  cabinet_wrapper: CabinetWrapper;
}

/** Registry — all 8 default themes, source-of-truth. */
export const THEMES: Record<ThemeId, Theme> = {
  'asian-dragon': asianDragon,
  underwater,
  'sci-fi': sciFi,
  mythological,
  royal,
  space,
  'fairy-tale': fairyTale,
  'urban-cash': urbanCash,
};

export const ALL_THEME_IDS: ThemeId[] = [
  'asian-dragon',
  'underwater',
  'sci-fi',
  'mythological',
  'royal',
  'space',
  'fairy-tale',
  'urban-cash',
];

/** Currently-applied theme in module state. */
let activeTheme: ThemeId = 'asian-dragon';

/** Listeners notified after applyTheme. */
const listeners = new Set<(id: ThemeId, theme: Theme) => void>();

/** Studio "state" we mutate when a theme is applied. */
export interface ThemedState {
  symbolPack: string;
  audioPack: string;
  animationStyle: AnimationStyle;
  cabinetWrapper: CabinetWrapper;
  paletteVars: Record<string, string>;
}

/** Default snapshot — what `state` looks like before any theme is applied. */
export function defaultThemedState(): ThemedState {
  return {
    symbolPack: 'generic',
    audioPack: 'generic',
    animationStyle: 'crimson-burst',
    cabinetWrapper: 'lacquered-bezel',
    paletteVars: {},
  };
}

/** Convert a palette into the CSS-var dictionary used by studio chrome. */
export function paletteToCssVars(p: ThemePalette): Record<string, string> {
  return {
    '--accent': p.accent,
    '--deep': p.deep,
    '--highlight': p.highlight,
    '--warn': p.warn,
    '--err': p.err,
    // primary intentionally NOT overridden — themes keep the cyan v5 anchor.
  };
}

/** Apply CSS vars to a DOM element (no-op when document is undefined). */
export function applyCssVars(vars: Record<string, string>, target?: HTMLElement): void {
  if (typeof document === 'undefined') return;
  const el = target ?? document.documentElement;
  if (!el) return;
  for (const [k, v] of Object.entries(vars)) {
    el.style.setProperty(k, v);
  }
}

/**
 * Mutate the supplied state object with the theme, set CSS vars,
 * and notify subscribers. Returns the resolved theme so callers can
 * read display metadata.
 */
export function applyTheme(themeId: ThemeId, state?: ThemedState): Theme {
  const theme = THEMES[themeId];
  if (!theme) throw new Error(`unknown theme: ${themeId}`);

  const vars = paletteToCssVars(theme.palette);
  if (state) {
    state.symbolPack = theme.symbol_pack;
    state.audioPack = theme.audio_pack;
    state.animationStyle = theme.animation_style;
    state.cabinetWrapper = theme.cabinet_wrapper;
    state.paletteVars = vars;
  }
  applyCssVars(vars);
  activeTheme = themeId;

  for (const cb of listeners) {
    try {
      cb(themeId, theme);
    } catch {
      /* ignore listener errors */
    }
  }
  return theme;
}

export function getActiveTheme(): ThemeId {
  return activeTheme;
}

export function getTheme(id: ThemeId): Theme {
  const theme = THEMES[id];
  if (!theme) throw new Error(`unknown theme: ${id}`);
  return theme;
}

export function listThemes(): Theme[] {
  return ALL_THEME_IDS.map((id) => THEMES[id]);
}

export function onThemeChange(cb: (id: ThemeId, theme: Theme) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Validation helper used by the re-skin wizard before export. */
export function validateTheme(t: Partial<Theme>): { ok: boolean; errors: string[] } {
  const errs: string[] = [];
  if (!t.id) errs.push('missing id');
  if (!t.palette) errs.push('missing palette');
  else {
    for (const k of ['primary', 'accent', 'deep', 'highlight', 'warn', 'err'] as const) {
      if (!t.palette[k]) errs.push(`palette.${k} missing`);
      else if (!/^#[0-9A-Fa-f]{6}$/.test(t.palette[k])) errs.push(`palette.${k} not hex6`);
    }
  }
  if (!t.symbol_pack) errs.push('missing symbol_pack');
  if (!t.audio_pack) errs.push('missing audio_pack');
  if (!t.animation_style) errs.push('missing animation_style');
  if (!t.cabinet_wrapper) errs.push('missing cabinet_wrapper');
  return { ok: errs.length === 0, errors: errs };
}

/** Reset hook for tests. */
export function __resetThemeEngineForTests(): void {
  activeTheme = 'asian-dragon';
  listeners.clear();
}
