// CORTI 200.2 — Symbol/Art pipeline spec suite.
//
// 13 specs covering:
//   - SVG / PNG / WebP icon upload validation (size, MIME, script guard)
//   - IconLibrary CRUD (add/get/rename/delete/list)
//   - Theme registry (4 themes present + getTheme lookup)
//   - applyTheme — variant re-skin + per-symbol override
//   - Animation default + clamp range
//   - Audio engine cue list (6 preloaded)
//   - Audio upload validation
//   - ZIP pack round-trip (export → import)
//   - CSS-var application on host element
//   - Round-trip persistence shape (icon library snapshot)

import { describe, it, expect } from 'vitest';
import {
  validateIcon,
  validateAudio,
  IconLibrary,
  makeIconId,
  THEMES,
  listThemes,
  getTheme,
  applyTheme,
  defaultAnimation,
  clampAnimation,
  createAudioEngine,
  exportIconPack,
  importIconPack,
  PRELOADED_AUDIO_CUES,
  MAX_ICON_BYTES,
  MAX_AUDIO_BYTES,
  type CustomIcon,
  type AnimationState,
} from '../src/art-pipeline.js';

function makeSvgIcon(name = 'star'): CustomIcon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="cyan"/></svg>`;
  return {
    id: makeIconId(),
    name,
    family: 'svg',
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`,
    byteSize: svg.length,
    createdAt: Date.now(),
  };
}

describe('art-pipeline · icon upload validation', () => {
  it('accepts a clean SVG and reports family=svg', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>';
    const v = validateIcon('star.svg', svg.length, svg);
    expect(v.ok).toBe(true);
    expect(v.family).toBe('svg');
    expect(v.mime).toBe('image/svg+xml');
  });

  it('rejects SVG with <script> tag', () => {
    const svg = '<svg><script>alert(1)</script><circle/></svg>';
    const v = validateIcon('bad.svg', svg.length, svg);
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/script/i);
  });

  it('rejects SVG with inline event handler', () => {
    const svg = '<svg><circle onclick="x()" r="10"/></svg>';
    const v = validateIcon('bad.svg', svg.length, svg);
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/event handler/i);
  });

  it('rejects file larger than 100KB', () => {
    const v = validateIcon('huge.png', MAX_ICON_BYTES + 1);
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/too large/i);
  });

  it('accepts PNG by extension (no text needed)', () => {
    const v = validateIcon('thumb.png', 5000);
    expect(v.ok).toBe(true);
    expect(v.family).toBe('png');
  });

  it('accepts WebP by extension', () => {
    const v = validateIcon('thumb.webp', 5000);
    expect(v.ok).toBe(true);
    expect(v.family).toBe('webp');
  });

  it('rejects unknown extensions', () => {
    const v = validateIcon('virus.exe', 100);
    expect(v.ok).toBe(false);
  });
});

describe('art-pipeline · audio upload validation', () => {
  it('preloaded cue list contains 6 sounds', () => {
    expect(PRELOADED_AUDIO_CUES).toHaveLength(6);
    expect(PRELOADED_AUDIO_CUES).toContain('reel-spin');
    expect(PRELOADED_AUDIO_CUES).toContain('win-big');
  });

  it('accepts .mp3 audio under cap', () => {
    const v = validateAudio('cue.mp3', 50_000);
    expect(v.ok).toBe(true);
    expect(v.mime).toBe('audio/mpeg');
  });

  it('rejects audio above 200KB', () => {
    const v = validateAudio('cue.mp3', MAX_AUDIO_BYTES + 1);
    expect(v.ok).toBe(false);
  });

  it('rejects unknown audio extension', () => {
    const v = validateAudio('cue.wav', 1000);
    expect(v.ok).toBe(false);
  });
});

describe('art-pipeline · icon library CRUD', () => {
  it('add / get / rename / delete works', () => {
    const lib = new IconLibrary();
    const ic = makeSvgIcon('phoenix');
    lib.add(ic);
    expect(lib.count()).toBe(1);
    expect(lib.get(ic.id)?.name).toBe('phoenix');
    expect(lib.rename(ic.id, 'firebird')).toBe(true);
    expect(lib.get(ic.id)?.name).toBe('firebird');
    expect(lib.remove(ic.id)).toBe(true);
    expect(lib.count()).toBe(0);
  });

  it('list returns newest-first', () => {
    const lib = new IconLibrary();
    const a = makeSvgIcon('a'); a.createdAt = 100;
    const b = makeSvgIcon('b'); b.createdAt = 200;
    lib.add(a); lib.add(b);
    expect(lib.list()[0]!.id).toBe(b.id);
  });
});

describe('art-pipeline · theme registry', () => {
  it('exports all 4 themes', () => {
    expect(listThemes()).toHaveLength(4);
    expect(THEMES.geological).toBeDefined();
    expect(THEMES.cosmic).toBeDefined();
    expect(THEMES.botanical).toBeDefined();
    expect(THEMES.mineral).toBeDefined();
  });

  it('each theme has palette + iconMap', () => {
    for (const t of listThemes()) {
      expect(t.palette.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(t.palette.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(t.iconMap.HP1).toBeTruthy();
      expect(t.iconMap.WILD1).toBe('wild');
    }
  });

  it('getTheme returns null for unknown id', () => {
    expect(getTheme('unknown')).toBeNull();
    expect(getTheme('cosmic')!.id).toBe('cosmic');
  });

  it('applyTheme re-skins symbols + counts changes', () => {
    const symbols = [
      { id: 'HP1', icon: 'diamond' },
      { id: 'HP2', icon: 'diamond' },
      { id: 'WILD1', icon: 'wild' },
    ];
    const n = applyTheme('cosmic', { symbols });
    expect(n).toBeGreaterThan(0);
    expect(symbols[0]!.icon).toBe('star5'); // per cosmic theme
    expect(symbols[2]!.icon).toBe('wild');
  });

  it('custom uploaded icon overrides theme re-skin', () => {
    const symbols = [
      { id: 'HP1', icon: 'diamond', customIconData: 'data:image/png;base64,XYZ' },
      { id: 'HP2', icon: 'diamond' },
    ];
    applyTheme('cosmic', { symbols });
    expect(symbols[0]!.icon).toBe('diamond'); // unchanged (has custom data)
    expect(symbols[1]!.icon).toBe('star6');
  });

  it('applyTheme sets CSS custom properties when host provided', () => {
    // Fake element with style.setProperty
    const props: Record<string, string> = {};
    const host = {
      style: {
        setProperty(k: string, v: string) { props[k] = v; },
      },
    } as unknown as HTMLElement;
    applyTheme('mineral', { cssVarHost: host, symbols: [] });
    expect(props['--theme-primary']).toBe('#22D3EE');
    expect(props['--theme-deep']).toBe('#0F172A');
  });
});

describe('art-pipeline · animation timeline', () => {
  it('defaultAnimation has 5 stages with valid ranges', () => {
    const a = defaultAnimation();
    expect(a.idle.durationSec).toBeGreaterThanOrEqual(1);
    expect(a.spin.blurPx).toBeGreaterThanOrEqual(0);
    expect(a.win.glowColor).toMatch(/^#/);
    expect(a.fsIntro.style).toBe('bounce');
    expect(a.hwReveal.style).toBe('sequential');
  });

  it('clampAnimation enforces ranges', () => {
    const a: Partial<AnimationState> = {
      idle: { durationSec: 99, easing: 'linear' },
      spin: { blurPx: -5, speed: 7 },
      win: { durationSec: 0.1, glowColor: 'not-a-color' },
    };
    const c = clampAnimation(a);
    expect(c.idle.durationSec).toBe(5);
    expect(c.spin.blurPx).toBe(0);
    expect(c.spin.speed).toBe(3);
    expect(c.win.durationSec).toBe(0.5);
    expect(c.win.glowColor).toBe('#22D3EE'); // fallback
  });

  it('persists onto a variant-like host (no-op when assigned)', () => {
    const variant = { animation: defaultAnimation() };
    variant.animation = clampAnimation({
      ...variant.animation,
      idle: { ...variant.animation.idle, durationSec: 3 },
    });
    expect(variant.animation.idle.durationSec).toBe(3);
  });
});

describe('art-pipeline · audio engine', () => {
  it('lists 6 preloaded cue ids without AudioContext', () => {
    const eng = createAudioEngine();
    const list = eng.list();
    expect(list.length).toBe(6);
    expect(eng.getState().muted).toBe(false);
    expect(eng.getState().masterVolume).toBeGreaterThan(0);
  });

  it('mute toggle persists in state', () => {
    const eng = createAudioEngine();
    eng.setMuted(true);
    expect(eng.getState().muted).toBe(true);
    eng.setMuted(false);
    expect(eng.getState().muted).toBe(false);
  });

  it('volume clamps to [0,1]', () => {
    const eng = createAudioEngine();
    eng.setVolume(2.5);
    expect(eng.getState().masterVolume).toBe(1);
    eng.setVolume(-1);
    expect(eng.getState().masterVolume).toBe(0);
  });
});

describe('art-pipeline · ZIP pack round-trip', () => {
  it('export → import preserves icon count + names', async () => {
    const icons = [makeSvgIcon('one'), makeSvgIcon('two'), makeSvgIcon('three')];
    const blob = await exportIconPack(icons);
    expect(blob.size).toBeGreaterThan(0);
    const restored = await importIconPack(blob);
    expect(restored).toHaveLength(3);
    const names = restored.map((i) => i.name).sort();
    expect(names).toEqual(['one', 'three', 'two']);
  });

  it('round-trip: upload-style add → snapshot → restore', () => {
    const lib = new IconLibrary();
    const a = makeSvgIcon('alpha');
    const b = makeSvgIcon('beta');
    lib.add(a); lib.add(b);
    const snap = lib.snapshot();
    expect(snap).toHaveLength(2);
    const lib2 = new IconLibrary();
    lib2.importAll(snap);
    expect(lib2.count()).toBe(2);
    expect(lib2.get(a.id)?.name).toBe('alpha');
    expect(lib2.get(b.id)?.name).toBe('beta');
  });
});
