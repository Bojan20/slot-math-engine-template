// W209 Agent B — Theme engine specs.
//
// Covers: registry shape, applyTheme mutation, palette CSS-var mapping,
// listener notifications, validateTheme rejects malformed inputs,
// listThemes returns 8, palette overrides do NOT touch primary.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALL_THEME_IDS,
  THEMES,
  applyTheme,
  defaultThemedState,
  getActiveTheme,
  getTheme,
  listThemes,
  onThemeChange,
  paletteToCssVars,
  validateTheme,
  __resetThemeEngineForTests,
  type Theme,
  type ThemeId,
  type ThemedState,
} from '../src/theming/theme-engine.js';

describe('theme-engine · registry', () => {
  beforeEach(() => __resetThemeEngineForTests());

  it('exposes exactly 8 theme ids', () => {
    expect(ALL_THEME_IDS.length).toBe(8);
    const want: ThemeId[] = [
      'asian-dragon',
      'underwater',
      'sci-fi',
      'mythological',
      'royal',
      'space',
      'fairy-tale',
      'urban-cash',
    ];
    for (const id of want) expect(ALL_THEME_IDS).toContain(id);
  });

  it('every theme has palette + typography + symbol_pack + audio_pack + animation_style + cabinet_wrapper', () => {
    for (const id of ALL_THEME_IDS) {
      const t = THEMES[id];
      expect(t.id).toBe(id);
      expect(t.displayName.length).toBeGreaterThan(0);
      expect(t.palette.primary).toBe('#22d3ee'); // cyan v5 anchor, never overridden
      expect(t.palette.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(t.palette.deep).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(t.palette.highlight).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(t.symbol_pack.length).toBeGreaterThan(0);
      expect(t.audio_pack.length).toBeGreaterThan(0);
      expect(t.typography.display.length).toBeGreaterThan(0);
    }
  });

  it('listThemes returns all 8 themes in registry order', () => {
    const ls = listThemes();
    expect(ls.length).toBe(8);
    expect(ls[0].id).toBe('asian-dragon');
    expect(ls[7].id).toBe('urban-cash');
  });

  it('getTheme returns the requested theme or throws on unknown', () => {
    expect(getTheme('royal').id).toBe('royal');
    expect(() => getTheme('xxx' as ThemeId)).toThrow();
  });
});

describe('theme-engine · applyTheme', () => {
  beforeEach(() => __resetThemeEngineForTests());

  it('mutates studio state to reflect theme symbol/audio/anim/cabinet', () => {
    const state: ThemedState = defaultThemedState();
    applyTheme('underwater', state);
    expect(state.symbolPack).toBe('underwater');
    expect(state.audioPack).toBe('ocean-deep');
    expect(state.animationStyle).toBe('pearl-shimmer');
    expect(state.cabinetWrapper).toBe('coral-ring');
  });

  it('writes the resolved palette CSS vars into state', () => {
    const state: ThemedState = defaultThemedState();
    applyTheme('mythological', state);
    expect(state.paletteVars['--accent']).toBe('#ff4500');
    expect(state.paletteVars['--deep']).toBe('#1a0000');
  });

  it('updates the active theme id', () => {
    applyTheme('space');
    expect(getActiveTheme()).toBe('space');
  });

  it('throws on unknown theme', () => {
    expect(() => applyTheme('bogus' as ThemeId)).toThrow();
  });

  it('notifies subscribers exactly once per applyTheme', () => {
    let calls = 0;
    let lastId: ThemeId | null = null;
    onThemeChange((id) => { calls++; lastId = id; });
    applyTheme('sci-fi');
    expect(calls).toBe(1);
    expect(lastId).toBe('sci-fi');
  });

  it('unsubscribe stops further callbacks', () => {
    let calls = 0;
    const off = onThemeChange(() => { calls++; });
    applyTheme('royal');
    off();
    applyTheme('fairy-tale');
    expect(calls).toBe(1);
  });
});

describe('theme-engine · palette → CSS vars', () => {
  it('paletteToCssVars never emits --primary (cyan anchor stays untouched)', () => {
    const vars = paletteToCssVars(THEMES['asian-dragon'].palette);
    expect(vars['--primary']).toBeUndefined();
    expect(vars['--accent']).toBe('#ffd700');
    expect(vars['--deep']).toBe('#1a0006');
    expect(vars['--highlight']).toBe('#fff8dc');
  });

  it('every theme produces 5 non-primary CSS vars', () => {
    for (const id of ALL_THEME_IDS) {
      const vars = paletteToCssVars(THEMES[id].palette);
      expect(Object.keys(vars).length).toBe(5);
    }
  });
});

describe('theme-engine · validateTheme', () => {
  it('valid theme passes', () => {
    const r = validateTheme(THEMES['urban-cash'] as Partial<Theme>);
    expect(r.ok).toBe(true);
    expect(r.errors.length).toBe(0);
  });

  it('rejects missing palette field', () => {
    const t = { ...THEMES['urban-cash'], palette: undefined } as unknown as Partial<Theme>;
    const r = validateTheme(t);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('missing palette');
  });

  it('rejects non-hex6 color in palette', () => {
    const broken: Partial<Theme> = {
      ...THEMES['urban-cash'],
      palette: { ...THEMES['urban-cash'].palette, accent: 'red' },
    };
    const r = validateTheme(broken);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('accent'))).toBe(true);
  });

  it('reports multiple missing fields at once', () => {
    const r = validateTheme({});
    expect(r.errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe('theme-engine · cabinet wrappers + animations cover all themes', () => {
  it('each theme has a unique cabinet_wrapper', () => {
    const wrappers = new Set(listThemes().map((t) => t.cabinet_wrapper));
    expect(wrappers.size).toBe(8);
  });

  it('each theme has a unique animation_style', () => {
    const anims = new Set(listThemes().map((t) => t.animation_style));
    expect(anims.size).toBe(8);
  });

  it('each theme has a unique symbol_pack', () => {
    const packs = new Set(listThemes().map((t) => t.symbol_pack));
    expect(packs.size).toBe(8);
  });
});
