/**
 * W152 Wave 52 — Sticky Cash + Reveal Multiplier tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveStickyCashReveal,
  simulateStickyCashReveal,
  meanCash,
  meanCashSquared,
  meanReveal,
  varianceReveal,
  type StickyCashRevealConfig,
} from '../src/features/stickyCashReveal.js';

const baseCfg = (overrides: Partial<StickyCashRevealConfig> = {}): StickyCashRevealConfig => ({
  gridSize: 20,
  spinsInWindow: 10,
  pCapturePerEmptyPerSpin: 0.10,
  cashValueDistribution: [
    { valueX: 1, weight: 6 },
    { valueX: 2, weight: 3 },
    { valueX: 5, weight: 1 },
  ],
  revealMultiplierDistribution: [
    { multiplier: 1, weight: 60 },
    { multiplier: 2, weight: 25 },
    { multiplier: 5, weight: 10 },
    { multiplier: 10, weight: 4 },
    { multiplier: 100, weight: 1 },
  ],
  ...overrides,
});

// ── Helpers ───────────────────────────────────────────────────────────────

describe('meanCash', () => {
  it('weighted mean', () => {
    const d = [
      { valueX: 1, weight: 6 },
      { valueX: 2, weight: 3 },
      { valueX: 5, weight: 1 },
    ];
    // (6+6+5) / 10 = 17/10 = 1.7
    expect(meanCash(d)).toBeCloseTo(1.7, 10);
  });
});

describe('meanCashSquared', () => {
  it('weighted E[V²]', () => {
    const d = [
      { valueX: 1, weight: 6 },
      { valueX: 2, weight: 3 },
      { valueX: 5, weight: 1 },
    ];
    // (6×1 + 3×4 + 1×25) / 10 = 43/10 = 4.3
    expect(meanCashSquared(d)).toBeCloseTo(4.3, 10);
  });
});

describe('meanReveal & varianceReveal', () => {
  it('reveal mean', () => {
    const d = [
      { multiplier: 1, weight: 60 },
      { multiplier: 2, weight: 25 },
      { multiplier: 5, weight: 10 },
      { multiplier: 10, weight: 4 },
      { multiplier: 100, weight: 1 },
    ];
    // (60 + 50 + 50 + 40 + 100) / 100 = 300/100 = 3.0
    expect(meanReveal(d)).toBeCloseTo(3.0, 10);
  });
  it('reveal variance ≥ 0', () => {
    expect(varianceReveal([{ multiplier: 1, weight: 1 }])).toBeCloseTo(0, 10);
  });
});

// ── Validation ─────────────────────────────────────────────────────────────

describe('validate', () => {
  it('rejects gridSize ≤ 0', () => {
    expect(() => solveStickyCashReveal(baseCfg({ gridSize: 0 }))).toThrow();
  });
  it('rejects spinsInWindow ≤ 0', () => {
    expect(() => solveStickyCashReveal(baseCfg({ spinsInWindow: 0 }))).toThrow();
  });
  it('rejects pCapture outside (0,1)', () => {
    expect(() => solveStickyCashReveal(baseCfg({ pCapturePerEmptyPerSpin: 0 }))).toThrow();
    expect(() => solveStickyCashReveal(baseCfg({ pCapturePerEmptyPerSpin: 1 }))).toThrow();
    expect(() => solveStickyCashReveal(baseCfg({ pCapturePerEmptyPerSpin: -0.1 }))).toThrow();
  });
  it('rejects empty cashValueDistribution', () => {
    expect(() => solveStickyCashReveal(baseCfg({ cashValueDistribution: [] }))).toThrow();
  });
  it('rejects negative valueX', () => {
    expect(() =>
      solveStickyCashReveal(baseCfg({ cashValueDistribution: [{ valueX: -1, weight: 1 }] })),
    ).toThrow();
  });
  it('rejects empty revealMultiplierDistribution', () => {
    expect(() => solveStickyCashReveal(baseCfg({ revealMultiplierDistribution: [] }))).toThrow();
  });
  it('rejects negative multiplier', () => {
    expect(() =>
      solveStickyCashReveal(baseCfg({ revealMultiplierDistribution: [{ multiplier: -1, weight: 1 }] })),
    ).toThrow();
  });
});

// ── Structural correctness ─────────────────────────────────────────────────

describe('solveStickyCashReveal — structural', () => {
  it('q = 1 - (1-p)^N', () => {
    const cfg = baseCfg({ gridSize: 20, spinsInWindow: 10, pCapturePerEmptyPerSpin: 0.10 });
    const r = solveStickyCashReveal(cfg);
    expect(r.pCellOccupied).toBeCloseTo(1 - Math.pow(0.9, 10), 10);
  });
  it('E[occupied] = G × q', () => {
    const cfg = baseCfg();
    const r = solveStickyCashReveal(cfg);
    expect(r.expectedOccupiedCells).toBeCloseTo(cfg.gridSize * r.pCellOccupied, 10);
  });
  it('E[T] = G × q × E[V]', () => {
    const cfg = baseCfg();
    const r = solveStickyCashReveal(cfg);
    const eV = meanCash(cfg.cashValueDistribution);
    expect(r.expectedTotalCash).toBeCloseTo(cfg.gridSize * r.pCellOccupied * eV, 10);
  });
  it('E[Y] = E[T] × E[M]', () => {
    const cfg = baseCfg();
    const r = solveStickyCashReveal(cfg);
    expect(r.expectedPayoutPerEpisode).toBeCloseTo(r.expectedTotalCash * r.expectedRevealMultiplier, 10);
  });
  it('Var[Y] = E[T]²·Var[M] + Var[T]·E[M]² + Var[T]·Var[M]', () => {
    const cfg = baseCfg();
    const r = solveStickyCashReveal(cfg);
    const eT = r.expectedTotalCash;
    const varT = r.varianceTotalCash;
    const eM = r.expectedRevealMultiplier;
    const varM = r.varianceRevealMultiplier;
    const expected = eT * eT * varM + varT * eM * eM + varT * varM;
    expect(r.variancePayoutPerEpisode).toBeCloseTo(expected, 10);
  });
  it('σ[Y] = sqrt(Var[Y])', () => {
    const r = solveStickyCashReveal(baseCfg());
    expect(r.stdDevPayoutPerEpisode).toBeCloseTo(Math.sqrt(r.variancePayoutPerEpisode), 10);
  });
  it('occupiedCellsPmf is binomial: P(K=0) = (1-q)^G', () => {
    const cfg = baseCfg();
    const r = solveStickyCashReveal(cfg);
    const zero = r.occupiedCellsPmf.find((e) => e.k === 0);
    if (zero) {
      expect(zero.probability).toBeCloseTo(Math.pow(1 - r.pCellOccupied, cfg.gridSize), 10);
    }
  });
  it('occupiedCellsPmf sums to 1', () => {
    const r = solveStickyCashReveal(baseCfg());
    const sum = r.occupiedCellsPmf.reduce((a, e) => a + e.probability, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});

// ── Monotonicity ─────────────────────────────────────────────────────────

describe('solveStickyCashReveal — monotonicity', () => {
  it('higher pCapture ⇒ higher E[Y]', () => {
    const a = solveStickyCashReveal(baseCfg({ pCapturePerEmptyPerSpin: 0.05 }));
    const b = solveStickyCashReveal(baseCfg({ pCapturePerEmptyPerSpin: 0.20 }));
    expect(b.expectedPayoutPerEpisode).toBeGreaterThan(a.expectedPayoutPerEpisode);
  });
  it('more spins ⇒ higher E[Y]', () => {
    const a = solveStickyCashReveal(baseCfg({ spinsInWindow: 5 }));
    const b = solveStickyCashReveal(baseCfg({ spinsInWindow: 50 }));
    expect(b.expectedPayoutPerEpisode).toBeGreaterThan(a.expectedPayoutPerEpisode);
  });
  it('larger grid ⇒ higher E[Y]', () => {
    const a = solveStickyCashReveal(baseCfg({ gridSize: 10 }));
    const b = solveStickyCashReveal(baseCfg({ gridSize: 40 }));
    expect(b.expectedPayoutPerEpisode).toBeGreaterThan(a.expectedPayoutPerEpisode);
  });
  it('reveal-mult linear scaling: dist scaled 2× → E[Y] scaled 2×', () => {
    const cfg = baseCfg();
    const r1 = solveStickyCashReveal(cfg);
    const r2 = solveStickyCashReveal(
      baseCfg({
        revealMultiplierDistribution: cfg.revealMultiplierDistribution.map((d) => ({
          multiplier: d.multiplier * 2,
          weight: d.weight,
        })),
      }),
    );
    expect(r2.expectedPayoutPerEpisode).toBeCloseTo(r1.expectedPayoutPerEpisode * 2, 8);
  });
  it('p → 0 ⇒ E[Y] → 0', () => {
    const r = solveStickyCashReveal(baseCfg({ pCapturePerEmptyPerSpin: 1e-6 }));
    expect(r.expectedPayoutPerEpisode).toBeLessThan(0.01);
  });
});

// ── MC cross-validation ─────────────────────────────────────────────────────

describe('solveStickyCashReveal — MC cross-validation', () => {
  it('E[Y] matches MC mean at 50K episodes (rel ≤ 5%)', () => {
    const cfg = baseCfg();
    const cf = solveStickyCashReveal(cfg);
    const mc = simulateStickyCashReveal(cfg, 50_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedPayoutPerEpisode - mc.observedMeanPayout) / cf.expectedPayoutPerEpisode;
    expect(rel).toBeLessThan(0.05);
  });
  it('E[occupied] matches MC closely (rel ≤ 1%)', () => {
    const cfg = baseCfg();
    const cf = solveStickyCashReveal(cfg);
    const mc = simulateStickyCashReveal(cfg, 50_000, 0xbeefbabe);
    const rel = Math.abs(cf.expectedOccupiedCells - mc.observedMeanOccupiedCells) / cf.expectedOccupiedCells;
    expect(rel).toBeLessThan(0.01);
  });
  it('P(Y=0) matches MC zero-payout fraction', () => {
    const cfg = baseCfg({ pCapturePerEmptyPerSpin: 0.02, spinsInWindow: 3 });
    const cf = solveStickyCashReveal(cfg);
    const mc = simulateStickyCashReveal(cfg, 50_000, 0xdecafbad);
    // For low p and small N, many episodes will have zero cash (also zero payout)
    expect(Math.abs(cf.probZeroPayout - mc.observedZeroPayoutFraction)).toBeLessThan(0.02);
  });
  it('E[M] matches MC mean reveal', () => {
    const cfg = baseCfg();
    const cf = solveStickyCashReveal(cfg);
    const mc = simulateStickyCashReveal(cfg, 50_000, 0xa55a55a);
    const rel = Math.abs(cf.expectedRevealMultiplier - mc.observedMeanRevealMult) / cf.expectedRevealMultiplier;
    expect(rel).toBeLessThan(0.05);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────

describe('solveStickyCashReveal — edges', () => {
  it('single-value cash + single mult ⇒ E[Y] = G × q × v × m', () => {
    const cfg: StickyCashRevealConfig = {
      gridSize: 10,
      spinsInWindow: 5,
      pCapturePerEmptyPerSpin: 0.2,
      cashValueDistribution: [{ valueX: 3, weight: 1 }],
      revealMultiplierDistribution: [{ multiplier: 4, weight: 1 }],
    };
    const r = solveStickyCashReveal(cfg);
    const q = 1 - Math.pow(0.8, 5);
    expect(r.expectedPayoutPerEpisode).toBeCloseTo(10 * q * 3 * 4, 10);
    expect(r.varianceRevealMultiplier).toBe(0); // deterministic mult
  });
  it('zero-cash distribution ⇒ E[Y] = 0', () => {
    const cfg = baseCfg({ cashValueDistribution: [{ valueX: 0, weight: 1 }] });
    const r = solveStickyCashReveal(cfg);
    expect(r.expectedPayoutPerEpisode).toBe(0);
  });
  it('zero-mult distribution ⇒ E[Y] = 0', () => {
    const cfg = baseCfg({ revealMultiplierDistribution: [{ multiplier: 0, weight: 1 }] });
    const r = solveStickyCashReveal(cfg);
    expect(r.expectedPayoutPerEpisode).toBe(0);
    expect(r.probZeroPayout).toBe(1);
  });
  it('huge N saturates: q → 1', () => {
    const r = solveStickyCashReveal(baseCfg({ spinsInWindow: 1000 }));
    expect(r.pCellOccupied).toBeGreaterThan(0.999);
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe('solveStickyCashReveal — determinism', () => {
  it('identical inputs ⇒ bit-exact outputs', () => {
    const a = solveStickyCashReveal(baseCfg());
    const b = solveStickyCashReveal(baseCfg());
    expect(a.expectedPayoutPerEpisode).toBe(b.expectedPayoutPerEpisode);
    expect(a.variancePayoutPerEpisode).toBe(b.variancePayoutPerEpisode);
    expect(a.probZeroPayout).toBe(b.probZeroPayout);
  });
  it('MC same seed ⇒ identical results', () => {
    const cfg = baseCfg();
    const a = simulateStickyCashReveal(cfg, 1000, 42);
    const b = simulateStickyCashReveal(cfg, 1000, 42);
    expect(a.observedMeanPayout).toBe(b.observedMeanPayout);
    expect(a.observedVariancePayout).toBe(b.observedVariancePayout);
  });
});
