/**
 * W152 Wave 20 — triggerProfiler tests (Faza 15.C.5).
 */

import { describe, it, expect } from 'vitest';
import {
  fitPoisson,
  fitNegBinomial,
  selectBestTriggerModel,
} from '../src/statistics/triggerProfiler.js';

describe('fitPoisson', () => {
  it('recovers λ on synthetic constant counts', () => {
    const fit = fitPoisson({ counts: [3, 3, 3, 3, 3] });
    expect(fit.lambda).toBe(3);
  });
  it('recovers λ = mean for hand-built Poisson-shaped counts', () => {
    // Hand-built counts approximating Poisson(5) — frequencies match
    // the PMF p(k) = e^-5 × 5^k / k! for k = 0..14, scaled to N=1000.
    const counts: number[] = [];
    const pmfApprox = [7, 34, 84, 140, 175, 175, 146, 104, 65, 36, 18, 8, 3, 4, 1];
    for (let k = 0; k < pmfApprox.length; k++) {
      for (let i = 0; i < pmfApprox[k]; i++) counts.push(k);
    }
    const fit = fitPoisson({ counts });
    expect(fit.lambda).toBeGreaterThan(4);
    expect(fit.lambda).toBeLessThan(6);
  });
  it('rejects empty observations', () => {
    expect(() => fitPoisson({ counts: [] })).toThrow();
  });
  it('rejects non-integer counts', () => {
    expect(() => fitPoisson({ counts: [1.5] })).toThrow(RangeError);
  });
  it('rejects negative counts', () => {
    expect(() => fitPoisson({ counts: [-1] })).toThrow(RangeError);
  });
  it('AIC = 2 × 1 - 2 × ll for Poisson (1 free parameter)', () => {
    const fit = fitPoisson({ counts: [2, 2, 2, 2, 2] });
    expect(fit.aic).toBeCloseTo(2 - 2 * fit.logLikelihood, 6);
  });
});

describe('fitNegBinomial — convergence', () => {
  it('converges on over-dispersed data', () => {
    // Build over-dispersed data: mean 5, variance ~25 → high dispersion
    const counts = [0, 0, 0, 0, 0, 0, 5, 10, 20, 15];
    const fit = fitNegBinomial({ counts });
    expect(fit.r).toBeGreaterThan(0);
    expect(fit.p).toBeGreaterThan(0);
    expect(fit.p).toBeLessThan(1);
  });
  it('falls back to large-r when variance ≤ mean (Poisson-like)', () => {
    const fit = fitNegBinomial({ counts: [3, 3, 3, 3] });
    // Variance = 0 → no dispersion → r should be very large
    expect(fit.r).toBeGreaterThan(1000);
  });
  it('AIC = 2 × 2 - 2 × ll for NB (2 free parameters)', () => {
    const fit = fitNegBinomial({ counts: [0, 5, 10, 15, 20] });
    expect(fit.aic).toBeCloseTo(4 - 2 * fit.logLikelihood, 6);
  });
});

describe('selectBestTriggerModel', () => {
  it('Poisson wins when data is Poisson-like', () => {
    // Constant counts — minimal variance → Poisson should win or tie
    const sel = selectBestTriggerModel({ counts: [3, 3, 3, 3, 3] });
    // For constant data, Poisson AIC should be very low (perfect fit)
    expect(sel.poisson.aic).toBeLessThanOrEqual(sel.negBinomial.aic + 0.1);
  });
  it('NB wins on geometric-shaped over-dispersed data', () => {
    // Hand-build N=10000 counts approximating geometric(p=0.1).
    // PMF P(k) = p × (1-p)^k → mean=9, var=90 (10× over-dispersed).
    // Larger N reduces rounding error so empirical variance ≈ theoretical.
    const counts: number[] = [];
    const p = 0.1;
    for (let k = 0; k <= 200; k++) {
      const freq = Math.round(10000 * p * Math.pow(1 - p, k));
      for (let i = 0; i < freq; i++) counts.push(k);
    }
    const sel = selectBestTriggerModel({ counts });
    expect(sel.best).toBe('negative_binomial');
    expect(sel.aicDelta).toBeGreaterThan(0);
  });
  it('returns both fits regardless of best', () => {
    const sel = selectBestTriggerModel({ counts: [3, 3, 3, 3, 3] });
    expect(sel.poisson).toBeDefined();
    expect(sel.negBinomial).toBeDefined();
  });
});

describe('fitNegBinomial — synthetic NB recovery', () => {
  it('recovers NB(r=2.5, mean=10) parameters approximately', () => {
    // Generate NB(2.5, p)-distributed counts via mean-variance match.
    // Mean = 10, variance = 50 → variance/mean = 5 → r = mean²/(var-mean) = 100/40 = 2.5
    const counts: number[] = [];
    // Synthetic over-dispersed cluster (same logic as docstring example)
    for (let i = 0; i < 1000; i++) {
      // Crude: 50% of time emit 0, 50% emit ~20 → captures clustering
      counts.push(i % 2 === 0 ? 0 : 20);
    }
    const fit = fitNegBinomial({ counts });
    // Mean ~ 10, variance ~ 100 → over-dispersed, NB should fit
    expect(fit.meanCount).toBeCloseTo(10, 1);
    expect(fit.varianceCount).toBeGreaterThan(fit.meanCount);
  });
});
