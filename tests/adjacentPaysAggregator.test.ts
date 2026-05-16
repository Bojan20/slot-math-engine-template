/**
 * W152 Wave 140 — Adjacent Pays Aggregator tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveAdjacentPaysAggregator,
  simulateAdjacentPaysAggregator,
  type AdjacentPaysAggregatorConfig,
} from '../src/features/adjacentPaysAggregator.js';

const baseCfg = (overrides: Partial<AdjacentPaysAggregatorConfig> = {}): AdjacentPaysAggregatorConfig => ({
  reelCount: 5,
  paylineCount: 10,
  minMatchLength: 3,
  symbols: [
    { label: 'HI',  density: 0.15, paytable: [0, 0, 5,  20, 100] },
    { label: 'MID', density: 0.20, paytable: [0, 0, 2,  10, 50]  },
    { label: 'LO',  density: 0.25, paytable: [0, 0, 1,  4,  10]  },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects reelCount < 2', () => {
    expect(() => solveAdjacentPaysAggregator(baseCfg({ reelCount: 1 }))).toThrow();
  });
  it('rejects paylineCount < 1', () => {
    expect(() => solveAdjacentPaysAggregator(baseCfg({ paylineCount: 0 }))).toThrow();
  });
  it('rejects minMatchLength = 0', () => {
    expect(() => solveAdjacentPaysAggregator(baseCfg({ minMatchLength: 0 }))).toThrow();
  });
  it('rejects minMatchLength > reelCount', () => {
    expect(() => solveAdjacentPaysAggregator(baseCfg({ minMatchLength: 6 }))).toThrow();
  });
  it('rejects empty symbols', () => {
    expect(() => solveAdjacentPaysAggregator(baseCfg({ symbols: [] }))).toThrow();
  });
  it('rejects density 0', () => {
    expect(() => solveAdjacentPaysAggregator(baseCfg({
      symbols: [{ label: 'HI', density: 0, paytable: [0, 0, 5, 20, 100] }],
    }))).toThrow();
  });
  it('rejects density > 1', () => {
    expect(() => solveAdjacentPaysAggregator(baseCfg({
      symbols: [{ label: 'HI', density: 1.5, paytable: [0, 0, 5, 20, 100] }],
    }))).toThrow();
  });
  it('rejects density sum > 1', () => {
    expect(() => solveAdjacentPaysAggregator(baseCfg({
      symbols: [
        { label: 'A', density: 0.5, paytable: [0, 0, 5, 20, 100] },
        { label: 'B', density: 0.6, paytable: [0, 0, 5, 20, 100] },
      ],
    }))).toThrow();
  });
  it('rejects paytable wrong length', () => {
    expect(() => solveAdjacentPaysAggregator(baseCfg({
      symbols: [{ label: 'HI', density: 0.15, paytable: [0, 0, 5] }],
    }))).toThrow();
  });
  it('rejects negative paytable entry', () => {
    expect(() => solveAdjacentPaysAggregator(baseCfg({
      symbols: [{ label: 'HI', density: 0.15, paytable: [0, 0, 5, -1, 100] }],
    }))).toThrow();
  });
});

describe('run length PMF correctness', () => {
  it('PMF sums to 1 for each symbol', () => {
    const r = solveAdjacentPaysAggregator(baseCfg());
    for (const s of r.perSymbolRunDistribution) {
      const sum = s.runLengthPmf.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 8);
    }
  });
  it('P(longest run = 0) = (1-p)^N for given symbol', () => {
    const r = solveAdjacentPaysAggregator(baseCfg());
    // HI: p=0.15, N=5 → P(no HI anywhere) = 0.85^5 = 0.4437053125
    expect(r.perSymbolRunDistribution[0].runLengthPmf[0]).toBeCloseTo(Math.pow(0.85, 5), 8);
  });
  it('P(longest run = N) = p^N for given symbol', () => {
    const r = solveAdjacentPaysAggregator(baseCfg());
    // HI: 0.15^5
    expect(r.perSymbolRunDistribution[0].runLengthPmf[5]).toBeCloseTo(Math.pow(0.15, 5), 12);
  });
  it('lower density → higher P(run=0)', () => {
    const a = solveAdjacentPaysAggregator(baseCfg({
      symbols: [{ label: 'X', density: 0.1, paytable: [0, 0, 5, 20, 100] }],
    }));
    const b = solveAdjacentPaysAggregator(baseCfg({
      symbols: [{ label: 'X', density: 0.3, paytable: [0, 0, 5, 20, 100] }],
    }));
    expect(a.perSymbolRunDistribution[0].runLengthPmf[0]).toBeGreaterThan(b.perSymbolRunDistribution[0].runLengthPmf[0]);
  });
});

describe('expected pay correctness', () => {
  it('E[pay] > 0 with valid paytable', () => {
    const r = solveAdjacentPaysAggregator(baseCfg());
    expect(r.expectedPayPerSpin).toBeGreaterThan(0);
  });
  it('E[pay per spin] = L · E[pay per payline]', () => {
    const r = solveAdjacentPaysAggregator(baseCfg());
    expect(r.expectedPayPerSpin).toBeCloseTo(r.paylineCount * r.expectedPayPerPayline, 8);
  });
  it('Var[pay per spin] = L · Var[pay per payline] (cross-payline indep)', () => {
    const r = solveAdjacentPaysAggregator(baseCfg());
    expect(r.variancePayPerSpin).toBeCloseTo(r.paylineCount * r.variancePayPerPayline, 6);
  });
  it('Var ≥ 0', () => {
    const r = solveAdjacentPaysAggregator(baseCfg());
    expect(r.variancePayPerSpin).toBeGreaterThanOrEqual(0);
  });
  it('higher density → higher E[pay] for given paytable', () => {
    const a = solveAdjacentPaysAggregator(baseCfg({
      symbols: [{ label: 'X', density: 0.1, paytable: [0, 0, 5, 20, 100] }],
    }));
    const b = solveAdjacentPaysAggregator(baseCfg({
      symbols: [{ label: 'X', density: 0.3, paytable: [0, 0, 5, 20, 100] }],
    }));
    expect(b.expectedPayPerSpin).toBeGreaterThan(a.expectedPayPerSpin);
  });
});

describe('hit frequency', () => {
  it('hit freq monotonic in density', () => {
    const a = solveAdjacentPaysAggregator(baseCfg({
      symbols: [{ label: 'X', density: 0.1, paytable: [0, 0, 5, 20, 100] }],
    }));
    const b = solveAdjacentPaysAggregator(baseCfg({
      symbols: [{ label: 'X', density: 0.3, paytable: [0, 0, 5, 20, 100] }],
    }));
    expect(b.hitFrequencyPerSpin).toBeGreaterThan(a.hitFrequencyPerSpin);
  });
  it('hit_freq_per_payline ≤ count(symbols) (loose upper bound)', () => {
    const r = solveAdjacentPaysAggregator(baseCfg());
    expect(r.hitFrequencyPerPayline).toBeLessThanOrEqual(r.perSymbolRunDistribution.length);
  });
});

describe('adjacent vs LTR-anchored relationship', () => {
  it('adjacent run prob ≥ LTR anchored prob', () => {
    // For N=5, k_min=3, p=0.2 single symbol:
    // P(LTR-anchored ≥ 3) = p³ = 0.008
    // P(adjacent ≥ 3) computed via DP, must be ≥ 0.008
    const r = solveAdjacentPaysAggregator({
      reelCount: 5,
      paylineCount: 1,
      minMatchLength: 3,
      symbols: [{ label: 'X', density: 0.2, paytable: [0, 0, 1, 1, 1] }],
    });
    const adj = r.perSymbolRunDistribution[0].hitFrequency;
    expect(adj).toBeGreaterThanOrEqual(Math.pow(0.2, 3) - 1e-9);
  });
});

describe('corner cases', () => {
  it('density = 1 → P(run=N) = 1', () => {
    const r = solveAdjacentPaysAggregator({
      reelCount: 5,
      paylineCount: 1,
      minMatchLength: 3,
      symbols: [{ label: 'X', density: 1, paytable: [0, 0, 5, 20, 100] }],
    });
    expect(r.perSymbolRunDistribution[0].runLengthPmf[5]).toBeCloseTo(1, 10);
    expect(r.perSymbolRunDistribution[0].runLengthPmf[0]).toBeCloseTo(0, 10);
  });
  it('zero paytable → zero E[pay]', () => {
    const r = solveAdjacentPaysAggregator(baseCfg({
      symbols: [{ label: 'X', density: 0.2, paytable: [0, 0, 0, 0, 0] }],
    }));
    expect(r.expectedPayPerSpin).toBe(0);
  });
});

describe('industry parametrizations', () => {
  it('Aristocrat Buffalo-style 5×4 adjacent (k_min=3)', () => {
    const r = solveAdjacentPaysAggregator({
      reelCount: 5,
      paylineCount: 1024, // Buffalo 1024-ways style with adjacent flavor
      minMatchLength: 3,
      symbols: [
        { label: 'BUFFALO', density: 0.04, paytable: [0, 0, 50, 250, 2000] },
        { label: 'EAGLE',   density: 0.08, paytable: [0, 0, 25, 100, 500] },
        { label: 'WOLF',    density: 0.10, paytable: [0, 0, 15, 60, 300] },
      ],
    });
    expect(r.expectedPayPerSpin).toBeGreaterThan(0);
    expect(r.hitFrequencyPerSpin).toBeGreaterThan(0);
  });
  it("NextGen Foxin' Wins-style 5-reel 25-line adjacent", () => {
    const r = solveAdjacentPaysAggregator({
      reelCount: 5,
      paylineCount: 25,
      minMatchLength: 3,
      symbols: [
        { label: 'FOX',  density: 0.10, paytable: [0, 0, 10, 50, 500] },
        { label: 'CARD', density: 0.15, paytable: [0, 0, 2, 10, 50] },
      ],
    });
    expect(r.expectedPayPerSpin).toBeGreaterThan(0);
  });
  it('Konami 6-reel adjacent (k_min=2)', () => {
    const r = solveAdjacentPaysAggregator({
      reelCount: 6,
      paylineCount: 50,
      minMatchLength: 2,
      symbols: [
        { label: 'ROMAN', density: 0.12, paytable: [0, 2, 5, 20, 100, 500] },
      ],
    });
    expect(r.expectedPayPerSpin).toBeGreaterThan(0);
  });
});

describe('MC cross-validation', () => {
  it('MC E[pay per spin] matches CF (rel ≤ 6% at 200K spins)', () => {
    const cfg = baseCfg();
    const cf = solveAdjacentPaysAggregator(cfg);
    const mc = simulateAdjacentPaysAggregator(cfg, 200_000, 0xdeadbeef);
    const rel = Math.abs(cf.expectedPayPerSpin - mc.observedMeanPayPerSpin) /
      Math.max(cf.expectedPayPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.06);
  });
  it('MC max run never exceeds N', () => {
    const cfg = baseCfg();
    const mc = simulateAdjacentPaysAggregator(cfg, 50_000, 0x1234);
    expect(mc.observedMaxRunSeen).toBeLessThanOrEqual(cfg.reelCount);
  });
  it('MC P(run=0) matches CF P(run=0) sanity', () => {
    // Sanity check: simulate single symbol, low density, verify P(no run) matches.
    const cfg: AdjacentPaysAggregatorConfig = {
      reelCount: 5,
      paylineCount: 1,
      minMatchLength: 3,
      symbols: [{ label: 'X', density: 0.15, paytable: [0, 0, 1, 1, 1] }],
    };
    const cf = solveAdjacentPaysAggregator(cfg);
    // P(longest run ≥ 3) from CF
    const cfHitRate = cf.perSymbolRunDistribution[0].hitFrequency;
    const mc = simulateAdjacentPaysAggregator(cfg, 100_000, 0xcafe);
    // MC hit rate is approximately P(at least one ≥ 3-run)
    expect(Math.abs(cfHitRate - mc.observedHitRatePerSpin)).toBeLessThan(0.01);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveAdjacentPaysAggregator(baseCfg());
    const b = solveAdjacentPaysAggregator(baseCfg());
    expect(a.expectedPayPerSpin).toBe(b.expectedPayPerSpin);
  });
  it('MC same seed → identical', () => {
    const a = simulateAdjacentPaysAggregator(baseCfg(), 1000, 42);
    const b = simulateAdjacentPaysAggregator(baseCfg(), 1000, 42);
    expect(a.observedMeanPayPerSpin).toBe(b.observedMeanPayPerSpin);
  });
});

describe('distinctness vs W125', () => {
  it('adjacent allows runs starting at non-edge positions (W125 only edge-anchored)', () => {
    // For 5-reel, k_min=3, density 0.2:
    // W125 only counts runs starting at reel 1 (LTR) or ending at reel 5 (RTL).
    // W140 counts runs at positions 1-3, 2-4, 3-5 (3 positions for k=3).
    // So adjacent hit rate > 2× bi-directional hit rate roughly.
    const r = solveAdjacentPaysAggregator({
      reelCount: 5,
      paylineCount: 1,
      minMatchLength: 3,
      symbols: [{ label: 'X', density: 0.2, paytable: [0, 0, 1, 1, 1] }],
    });
    // P(adjacent ≥ 3) should clearly exceed P(LTR-anchored ≥ 3) = p^3 = 0.008
    expect(r.perSymbolRunDistribution[0].hitFrequency).toBeGreaterThan(0.008 * 1.5);
  });
});
