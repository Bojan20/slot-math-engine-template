// CORTI 200.8 — Theme pack expansion tests.
//
// Validates the 6 new theme JSONs (egyptian, roman, greek, norse,
// aztec, pirate, fairytale, underwater, wildwest, asiandragon) live
// on disk + carry palette + iconMap + ambientSounds + animation
// defaults. The existing 4 themes (geological/cosmic/botanical/
// mineral) are tested by art-pipeline.test.ts so we don't duplicate.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = fileURLToPath(new URL('.', import.meta.url));
const THEME_DIR  = resolve(__dirname, '../themes');

const NEW_THEMES = ['egyptian', 'roman', 'greek', 'norse', 'aztec', 'pirate', 'fairytale', 'underwater', 'wildwest', 'asiandragon'];

describe('Theme expansion — file presence', () => {
  for (const t of NEW_THEMES) {
    it(`${t}.json exists`, () => {
      expect(existsSync(resolve(THEME_DIR, `${t}.json`))).toBe(true);
    });
  }

  it('themes directory contains ≥ 10 theme JSON files', () => {
    const files = readdirSync(THEME_DIR).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(10);
  });
});

describe('Theme expansion — shape', () => {
  for (const t of NEW_THEMES) {
    it(`${t} has palette + iconMap + ambient + animation defaults`, () => {
      const def = JSON.parse(readFileSync(resolve(THEME_DIR, `${t}.json`), 'utf8'));
      expect(def.id).toBe(t);
      expect(def.palette.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(def.palette.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(def.iconMap.HP1).toBeTruthy();
      expect(def.ambientSounds.length).toBeGreaterThanOrEqual(2);
      expect(def.animationDefaults.spinDuration).toBeGreaterThan(0);
    });
  }
});
