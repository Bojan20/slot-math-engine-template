/**
 * W152 Wave 18 — stripReverser tests (Faza 15.A.13).
 */

import { describe, it, expect } from 'vitest';
import {
  reverseEngineerStrip,
  renderReport,
} from '../src/sim/stripReverser.js';

describe('reverseEngineerStrip', () => {
  it('ranks correct candidate as top-1 on perfect match', () => {
    const correctStrip = ['A', 'B', 'C', 'A', 'B'];
    const wrongStrip = ['Z', 'Y', 'X', 'Z', 'Y'];
    const report = reverseEngineerStrip({
      observedStops: [0, 1, 2, 3, 4],
      observedSymbols: ['A', 'B', 'C', 'A', 'B'],
      candidates: { correct: correctStrip, wrong: wrongStrip },
    });
    expect(report.topMatch?.candidateName).toBe('correct');
    expect(report.topMatch?.matchRatio).toBe(1.0);
    expect(report.unambiguous).toBe(true);
  });
  it('reports low matchRatio for unrelated strip', () => {
    const report = reverseEngineerStrip({
      observedStops: [0, 1, 2],
      observedSymbols: ['A', 'B', 'C'],
      candidates: { random: ['X', 'Y', 'Z'] },
    });
    expect(report.topMatch?.matchRatio).toBe(0);
  });
  it('handles modular wrap on stops > strip length', () => {
    const strip = ['A', 'B'];
    const report = reverseEngineerStrip({
      observedStops: [10, 21], // 10 % 2 = 0 → A; 21 % 2 = 1 → B
      observedSymbols: ['A', 'B'],
      candidates: { wrap: strip },
    });
    expect(report.topMatch?.matchRatio).toBe(1.0);
  });
  it('throws on length mismatch', () => {
    expect(() =>
      reverseEngineerStrip({
        observedStops: [0],
        observedSymbols: ['A', 'B'],
        candidates: { x: ['A'] },
      }),
    ).toThrow();
  });
  it('throws on empty candidates', () => {
    expect(() =>
      reverseEngineerStrip({
        observedStops: [0],
        observedSymbols: ['A'],
        candidates: {},
      }),
    ).toThrow(/empty/);
  });
  it('throws on candidate with empty strip', () => {
    expect(() =>
      reverseEngineerStrip({
        observedStops: [0],
        observedSymbols: ['A'],
        candidates: { broken: [] },
      }),
    ).toThrow(/empty strip/);
  });
  it('top-1 accuracy on synthetic 5-candidate fixture (acceptance gate)', () => {
    // Build 5 candidate strips. One of them is the "real" one used to
    // generate observed data. Repeat across 100 random observation
    // sequences — expect ≥ 95 % top-1 identification.
    const symbols = ['A', 'B', 'C', 'D', 'E'];
    const real: string[] = [];
    for (let i = 0; i < 30; i++) real.push(symbols[i % symbols.length]);
    const candidates: Record<string, ReadonlyArray<string>> = {
      real: real,
      // 4 distractors with shifted/randomised symbols.
      shifted1: real.map((_, i) => symbols[(i + 1) % symbols.length]),
      shifted2: real.map((_, i) => symbols[(i + 2) % symbols.length]),
      reversed: real.slice().reverse(),
      shuffled: ['B', 'D', 'A', 'E', 'C'].concat(real.slice(5)),
    };
    let correct = 0;
    const TRIALS = 100;
    let seed = 1234;
    function rng(): number {
      seed = (seed * 1664525 + 1013904223) % 0x100000000;
      return seed / 0x100000000;
    }
    for (let t = 0; t < TRIALS; t++) {
      // Generate 30 observations from `real`.
      const observedStops: number[] = [];
      const observedSymbols: string[] = [];
      for (let i = 0; i < 30; i++) {
        const stop = Math.floor(rng() * 30);
        observedStops.push(stop);
        observedSymbols.push(real[stop]);
      }
      const report = reverseEngineerStrip({ observedStops, observedSymbols, candidates });
      if (report.topMatch?.candidateName === 'real') correct++;
    }
    expect(correct / TRIALS).toBeGreaterThanOrEqual(0.95);
  });
});

describe('renderReport', () => {
  it('produces human-readable text', () => {
    const report = reverseEngineerStrip({
      observedStops: [0, 1],
      observedSymbols: ['A', 'B'],
      candidates: { c1: ['A', 'B'], c2: ['X', 'Y'] },
    });
    const text = renderReport(report);
    expect(text).toMatch(/Strip Reverse-Engineering Report/);
    expect(text).toMatch(/Top match: c1/);
    expect(text).toMatch(/Unambiguous: YES/);
  });
});
