/**
 * W152 Wave 17 — loadReelsFromIR / materialiseWeightedReel tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  loadReelsFromIR,
  materialiseWeightedReel,
  totalStops,
} from '../src/model/reelsFromIR.js';
import type { SlotGameIR } from '../src/ir/types.js';

const FIXTURE_TEXT = readFileSync(
  resolve(__dirname, 'fixtures/reference/3x5-5lines.json'),
  'utf-8',
);

describe('materialiseWeightedReel', () => {
  it('produces strip with exact symbol counts', () => {
    const strip = materialiseWeightedReel({ A: 3, B: 2, C: 1 });
    expect(strip).toHaveLength(6);
    expect(strip.filter((s) => s === 'A')).toHaveLength(3);
    expect(strip.filter((s) => s === 'B')).toHaveLength(2);
    expect(strip.filter((s) => s === 'C')).toHaveLength(1);
  });

  it('orders symbols alphabetically (byte-stable)', () => {
    const strip = materialiseWeightedReel({ Z: 1, A: 1, M: 1 });
    expect(strip).toEqual(['A', 'M', 'Z']);
  });

  it('handles single-symbol weight=1', () => {
    expect(materialiseWeightedReel({ X: 1 })).toEqual(['X']);
  });

  it('throws on non-integer weight', () => {
    expect(() => materialiseWeightedReel({ A: 1.5 } as Record<string, number>)).toThrow(RangeError);
  });

  it('throws on negative weight', () => {
    expect(() => materialiseWeightedReel({ A: -1 })).toThrow(RangeError);
  });

  it('throws on all-zero weights', () => {
    expect(() => materialiseWeightedReel({ A: 0, B: 0 })).toThrow(/empty strip/);
  });
});

describe('loadReelsFromIR — weighted mode', () => {
  it('materialises base reels from a real fixture', () => {
    const ir = JSON.parse(FIXTURE_TEXT) as SlotGameIR;
    const loaded = loadReelsFromIR(ir);
    expect(loaded.mode).toBe('weighted');
    expect(loaded.baseReels).toHaveLength(3); // 3-reel fixture
    for (const reel of loaded.baseReels) {
      expect(reel.length).toBeGreaterThan(0);
    }
  });

  it('returns null fsReels when IR omits free_spins', () => {
    const ir: SlotGameIR = {
      schema_version: '1.0.0',
      meta: { id: 'x', name: 'X', version: '1.0.0' },
      topology: { kind: 'rectangular', reels: 1, rows: 1 },
      symbols: [{ id: 'A', name: 'A', kind: 'lp' }],
      reels: { mode: 'weighted', base: [{ A: 1 }] },
      paytable: {},
      evaluation: { kind: 'lines', paylines: [[0]], direction: 'ltr' },
      features: [],
      rng: { kind: 'pcg64', default_seed: 0 },
      bet: { currency: 'EUR', base_bet: 1, denominations: [1] },
    } as unknown as SlotGameIR;
    const loaded = loadReelsFromIR(ir);
    expect(loaded.fsReels).toBeNull();
  });

  it('materialises FS reels when IR provides them', () => {
    const ir: SlotGameIR = {
      schema_version: '1.0.0',
      meta: { id: 'x', name: 'X', version: '1.0.0' },
      topology: { kind: 'rectangular', reels: 1, rows: 1 },
      symbols: [{ id: 'A', name: 'A', kind: 'lp' }, { id: 'B', name: 'B', kind: 'hp' }],
      reels: {
        mode: 'weighted',
        base: [{ A: 5 }],
        free_spins: [{ A: 2, B: 3 }],
      },
      paytable: {},
      evaluation: { kind: 'lines', paylines: [[0]], direction: 'ltr' },
      features: [],
      rng: { kind: 'pcg64', default_seed: 0 },
      bet: { currency: 'EUR', base_bet: 1, denominations: [1] },
    } as unknown as SlotGameIR;
    const loaded = loadReelsFromIR(ir);
    expect(loaded.fsReels).not.toBeNull();
    expect(loaded.fsReels![0]).toHaveLength(5);
  });
});

describe('loadReelsFromIR — strips mode', () => {
  it('returns base reels verbatim', () => {
    const ir = {
      schema_version: '1.0.0',
      meta: { id: 'x', name: 'X', version: '1.0.0' },
      topology: { kind: 'rectangular', reels: 1, rows: 1 },
      symbols: [{ id: 'A', name: 'A', kind: 'lp' }, { id: 'B', name: 'B', kind: 'hp' }],
      reels: { mode: 'strips', base: [['A', 'B', 'A', 'A', 'B']] },
      paytable: {},
      evaluation: { kind: 'lines', paylines: [[0]], direction: 'ltr' },
      features: [],
      rng: { kind: 'pcg64', default_seed: 0 },
      bet: { currency: 'EUR', base_bet: 1, denominations: [1] },
    } as unknown as SlotGameIR;
    const loaded = loadReelsFromIR(ir);
    expect(loaded.mode).toBe('strips');
    expect(loaded.baseReels[0]).toEqual(['A', 'B', 'A', 'A', 'B']);
  });

  it('returns a defensive copy (caller mutating loaded.baseReels does not affect IR)', () => {
    const baseStrip = ['A', 'B', 'A'];
    const ir = {
      schema_version: '1.0.0',
      meta: { id: 'x', name: 'X', version: '1.0.0' },
      topology: { kind: 'rectangular', reels: 1, rows: 1 },
      symbols: [{ id: 'A', name: 'A', kind: 'lp' }],
      reels: { mode: 'strips', base: [baseStrip] },
      paytable: {},
      evaluation: { kind: 'lines', paylines: [[0]], direction: 'ltr' },
      features: [],
      rng: { kind: 'pcg64', default_seed: 0 },
      bet: { currency: 'EUR', base_bet: 1, denominations: [1] },
    } as unknown as SlotGameIR;
    const loaded = loadReelsFromIR(ir);
    loaded.baseReels[0].push('CHANGED');
    expect(baseStrip).toEqual(['A', 'B', 'A']);
  });
});

describe('loadReelsFromIR — guards', () => {
  it('throws on missing reels', () => {
    expect(() => loadReelsFromIR({} as SlotGameIR)).toThrow(/missing/);
  });

  it('throws on unsupported mode', () => {
    const bad = {
      reels: { mode: 'no_such', base: [] },
    } as unknown as SlotGameIR;
    expect(() => loadReelsFromIR(bad)).toThrow(/unsupported/);
  });
});

describe('totalStops', () => {
  it('sums base + fs', () => {
    const loaded = {
      baseReels: [['A', 'B'], ['A']],
      fsReels: [['B', 'B', 'B']],
      mode: 'strips' as const,
    };
    expect(totalStops(loaded)).toEqual({ base: 3, fs: 3 });
  });
  it('returns fs=0 when fsReels is null', () => {
    expect(
      totalStops({ baseReels: [['A']], fsReels: null, mode: 'strips' }),
    ).toEqual({ base: 1, fs: 0 });
  });
});
