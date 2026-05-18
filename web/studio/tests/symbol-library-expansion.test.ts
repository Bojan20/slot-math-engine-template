// CORTI 200.8 — Symbol library expansion tests.
//
// Validates the 8-pack expansion produced by
// `scripts/generate-symbol-library.mjs`. Asserts 200+ total SVGs,
// stroke-only convention, and viewBox 0 0 64 64.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname    = fileURLToPath(new URL('.', import.meta.url));
const STUDIO_ROOT  = resolve(__dirname, '..');
const LIB_ROOT     = resolve(STUDIO_ROOT, 'symbols/lib');
const INDEX_PATH   = resolve(LIB_ROOT, 'index.json');

const PACKS = ['fruit', 'card', 'gem', 'animal', 'ancient', 'scifi', 'universal', 'accent'];

function listSvgs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.svg'));
}

describe('Symbol library expansion — 8 pack directories', () => {
  for (const pack of PACKS) {
    it(`pack ${pack}/ exists and contains SVGs`, () => {
      const dir = resolve(LIB_ROOT, pack);
      expect(statSync(dir).isDirectory()).toBe(true);
      expect(listSvgs(dir).length).toBeGreaterThanOrEqual(10);
    });
  }
});

describe('Symbol library expansion — total counts', () => {
  it('grand total ≥ 200 SVGs (base + 8 packs)', () => {
    const baseCount = listSvgs(LIB_ROOT).length;
    const packCount = PACKS.reduce((a, p) => a + listSvgs(resolve(LIB_ROOT, p)).length, 0);
    expect(baseCount + packCount).toBeGreaterThanOrEqual(200);
  });

  it('fruit pack has at least 20 SVGs', () => {
    expect(listSvgs(resolve(LIB_ROOT, 'fruit')).length).toBeGreaterThanOrEqual(20);
  });

  it('card pack has at least 20 SVGs', () => {
    expect(listSvgs(resolve(LIB_ROOT, 'card')).length).toBeGreaterThanOrEqual(20);
  });

  it('gem pack has at least 20 SVGs', () => {
    expect(listSvgs(resolve(LIB_ROOT, 'gem')).length).toBeGreaterThanOrEqual(20);
  });

  it('animal pack has at least 20 SVGs', () => {
    expect(listSvgs(resolve(LIB_ROOT, 'animal')).length).toBeGreaterThanOrEqual(20);
  });

  it('ancient pack has at least 20 SVGs', () => {
    expect(listSvgs(resolve(LIB_ROOT, 'ancient')).length).toBeGreaterThanOrEqual(20);
  });

  it('scifi pack has at least 20 SVGs', () => {
    expect(listSvgs(resolve(LIB_ROOT, 'scifi')).length).toBeGreaterThanOrEqual(20);
  });

  it('universal pack has at least 20 SVGs', () => {
    expect(listSvgs(resolve(LIB_ROOT, 'universal')).length).toBeGreaterThanOrEqual(20);
  });

  it('accent pack has at least 20 SVGs', () => {
    expect(listSvgs(resolve(LIB_ROOT, 'accent')).length).toBeGreaterThanOrEqual(20);
  });
});

describe('Symbol library expansion — SVG conventions', () => {
  it('every pack SVG uses 64×64 viewBox', () => {
    for (const pack of PACKS) {
      const dir = resolve(LIB_ROOT, pack);
      for (const f of listSvgs(dir)) {
        const svg = readFileSync(resolve(dir, f), 'utf8');
        expect(svg, `${pack}/${f}`).toContain('viewBox="0 0 64 64"');
      }
    }
  });

  it('every pack SVG uses stroke="currentColor"', () => {
    for (const pack of PACKS) {
      const dir = resolve(LIB_ROOT, pack);
      for (const f of listSvgs(dir)) {
        const svg = readFileSync(resolve(dir, f), 'utf8');
        expect(svg, `${pack}/${f}`).toContain('stroke="currentColor"');
      }
    }
  });

  it('index.json catalog exists with packs section', () => {
    expect(existsSync(INDEX_PATH)).toBe(true);
    const idx = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
    expect(idx.packs).toBeDefined();
    expect(idx.packs.length).toBeGreaterThanOrEqual(8);
  });
});
