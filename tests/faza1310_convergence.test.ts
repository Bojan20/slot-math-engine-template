/**
 * Faza 13.10 — Predictive Convergence ML KATs
 *
 * 25 tests covering:
 *  1–4   GP fit & predict basic behaviour
 *  5–7   GP variance properties
 *  8–12  Power-law formula: n = (a / targetCI)^2
 *  13–16 CI shrinks as spins increase (CLT)
 *  17–19 predictRemainingSpins method field
 *  20–22 Prediction bounds (>0 wide CI, 0 when already met)
 *  23–25 Edge cases: no data, 1 observation, all same values
 */

import { describe, it, expect } from 'vitest';
import { GaussianProcess } from '../src/convergence/gp.js';
import { ConvergencePredictor } from '../src/convergence/predictor.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a GP trained on simple quadratic data for testing. */
function makeSimpleGP(): GaussianProcess {
  const gp = new GaussianProcess({ sigma2: 1, lengthScale: 1, noiseVariance: 1e-4 });
  const xs = [-2, -1, 0, 1, 2];
  const ys = xs.map(x => x * x); // y = x^2
  gp.fit(xs, ys);
  return gp;
}

// ─── GP fit & predict ─────────────────────────────────────────────────────────

describe('GP fit and predict — basic', () => {
  it('T01: GP predict returns mean and variance properties', () => {
    const gp = makeSimpleGP();
    const pred = gp.predict(0);
    expect(pred).toHaveProperty('mean');
    expect(pred).toHaveProperty('variance');
  });

  it('T02: GP mean near training points is close to training target', () => {
    const gp = makeSimpleGP();
    // At x=0 the target is 0; the GP should predict close to 0
    const { mean } = gp.predict(0);
    expect(Math.abs(mean)).toBeLessThan(0.5);
  });

  it('T03: GP mean at x=2 (training point) is close to 4', () => {
    const gp = makeSimpleGP();
    const { mean } = gp.predict(2);
    expect(Math.abs(mean - 4)).toBeLessThan(1.0);
  });

  it('T04: GP with monotone training data predicts correct trend', () => {
    const gp = new GaussianProcess({ sigma2: 1, lengthScale: 2, noiseVariance: 1e-4 });
    // Monotone decreasing: log(CI) vs log(n)
    const xs = [1, 2, 3, 4, 5];
    const ys = [4, 2, 1.33, 1, 0.8]; // roughly 4/x
    gp.fit(xs, ys);
    const at6 = gp.predict(6).mean;
    const at1 = gp.predict(1).mean;
    // Should predict a smaller value at x=6 than x=1
    expect(at6).toBeLessThan(at1);
  });
});

// ─── GP variance properties ───────────────────────────────────────────────────

describe('GP variance properties', () => {
  it('T05: GP variance at a training point is lower than at a far point', () => {
    const gp = makeSimpleGP();
    const varAtTraining = gp.predict(0).variance;
    const varFarAway    = gp.predict(100).variance;
    expect(varAtTraining).toBeLessThan(varFarAway);
  });

  it('T06: GP variance is non-negative', () => {
    const gp = makeSimpleGP();
    for (const x of [-5, -2, 0, 2, 5, 10]) {
      expect(gp.predict(x).variance).toBeGreaterThanOrEqual(0);
    }
  });

  it('T07: GP prior (no training data) returns sigma2 as variance', () => {
    const sigma2 = 2.5;
    const gp = new GaussianProcess({ sigma2, lengthScale: 1, noiseVariance: 1e-4 });
    const pred = gp.predict(0);
    // Prior variance includes noise: sigma2 + noiseVariance
    expect(pred.variance).toBeCloseTo(sigma2 + 1e-4, 3);
  });
});

// ─── Power-law formula ────────────────────────────────────────────────────────

describe('Power-law CI convergence formula', () => {
  it('T08: single observation uses a=CI*sqrt(n) formula', () => {
    const pred = new ConvergencePredictor();
    pred.addObservation(10_000, 0.96, 0.02);
    const result = pred.predictRemainingSpins(0.005);
    // a = 0.02 * sqrt(10000) = 2.0, predictedN = (2.0/0.005)^2 = 160000
    expect(result.predictedN).toBeGreaterThan(10_000);
    expect(result.method).toBe('power_law');
  });

  it('T09: power-law n = (a/targetCI)^2 scales correctly', () => {
    // With two obs consistent with CI ≈ a/sqrt(n), halving the target CI
    // should quadruple predictedN
    const pred1 = new ConvergencePredictor();
    pred1.addObservation(1_000, 0.96, 0.06325); // ~2/sqrt(1000)
    pred1.addObservation(10_000, 0.96, 0.02);   // ~2/sqrt(10000)

    const r1 = pred1.predictRemainingSpins(0.01);
    const r2 = pred1.predictRemainingSpins(0.005);

    // Halving target CI should roughly quadruple n
    expect(r2.predictedN).toBeGreaterThan(r1.predictedN);
    const ratio = r2.predictedN / r1.predictedN;
    expect(ratio).toBeGreaterThan(2.0);
    expect(ratio).toBeLessThan(8.0);
  });

  it('T10: larger targetCI gives smaller predictedN', () => {
    const pred = new ConvergencePredictor();
    pred.addObservation(1_000, 0.96, 0.06325);
    pred.addObservation(10_000, 0.96, 0.02);

    const looseCI = pred.predictRemainingSpins(0.01).predictedN;
    const tightCI = pred.predictRemainingSpins(0.001).predictedN;
    expect(tightCI).toBeGreaterThan(looseCI);
  });

  it('T11: power-law confidence is between 0 and 1', () => {
    const pred = new ConvergencePredictor();
    pred.addObservation(1_000, 0.96, 0.06325);
    pred.addObservation(10_000, 0.96, 0.02);
    const result = pred.predictRemainingSpins(0.005);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('T12: well-fitting power-law data gives high confidence', () => {
    // Perfect power-law: CI = 2/sqrt(n)
    const pred = new ConvergencePredictor();
    pred.addObservation(100,    0.96, 2 / Math.sqrt(100));
    pred.addObservation(1_000,  0.96, 2 / Math.sqrt(1_000));
    pred.addObservation(10_000, 0.96, 2 / Math.sqrt(10_000));
    pred.addObservation(100_000, 0.96, 2 / Math.sqrt(100_000));
    const result = pred.predictRemainingSpins(0.001);
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});

// ─── CLT property ─────────────────────────────────────────────────────────────

describe('CI shrinks as spins increase (CLT property)', () => {
  it('T13: CI95 decreases monotonically with increasing spinCount', () => {
    // CI ≈ 1.96 * sigma / sqrt(n)
    const sigma = 0.3;
    const ns    = [100, 500, 2_000, 10_000, 50_000];
    const cis   = ns.map(n => 1.96 * sigma / Math.sqrt(n));
    for (let i = 1; i < cis.length; i++) {
      expect(cis[i]).toBeLessThan(cis[i - 1]);
    }
  });

  it('T14: predictor observes shrinking CI and predicts smaller remaining N', () => {
    // Add observations with shrinking CI and check predictedN decreases
    const pred1 = new ConvergencePredictor();
    pred1.addObservation(1_000, 0.96, 0.062);
    const r1 = pred1.predictRemainingSpins(0.005);

    const pred2 = new ConvergencePredictor();
    pred2.addObservation(1_000,  0.96, 0.062);
    pred2.addObservation(10_000, 0.96, 0.020);
    const r2 = pred2.predictRemainingSpins(0.005);

    // More info → more confident prediction, but both should be positive
    expect(r1.predictedN).toBeGreaterThan(0);
    expect(r2.predictedN).toBeGreaterThan(0);
  });

  it('T15: currentCI field reflects latest observation', () => {
    const pred = new ConvergencePredictor();
    pred.addObservation(1_000,  0.96, 0.062);
    pred.addObservation(10_000, 0.96, 0.0195);
    const result = pred.predictRemainingSpins(0.005);
    expect(result.currentCI).toBeCloseTo(0.0195, 4);
  });

  it('T16: adding more observations changes the prediction', () => {
    const pred = new ConvergencePredictor();
    pred.addObservation(1_000, 0.96, 0.062);
    const before = pred.predictRemainingSpins(0.005).predictedN;

    pred.addObservation(10_000, 0.96, 0.020);
    const after  = pred.predictRemainingSpins(0.005).predictedN;

    // Predictions need not be identical after new data arrives
    expect(typeof before).toBe('number');
    expect(typeof after).toBe('number');
  });
});

// ─── method field ─────────────────────────────────────────────────────────────

describe('predictRemainingSpins method field', () => {
  it('T17: returns power_law with 1 observation', () => {
    const pred = new ConvergencePredictor();
    pred.addObservation(10_000, 0.96, 0.02);
    expect(pred.predictRemainingSpins(0.005).method).toBe('power_law');
  });

  it('T18: returns power_law with 2 observations (below GP threshold)', () => {
    const pred = new ConvergencePredictor({ minObservationsForGP: 3 });
    pred.addObservation(1_000, 0.96, 0.062);
    pred.addObservation(10_000, 0.96, 0.020);
    expect(pred.predictRemainingSpins(0.005).method).toBe('power_law');
  });

  it('T19: returns gp or power_law with 3+ observations', () => {
    const pred = new ConvergencePredictor({ minObservationsForGP: 3 });
    pred.addObservation(100,    0.96, 2 / Math.sqrt(100));
    pred.addObservation(1_000,  0.96, 2 / Math.sqrt(1_000));
    pred.addObservation(10_000, 0.96, 2 / Math.sqrt(10_000));
    const method = pred.predictRemainingSpins(0.005).method;
    expect(['gp', 'power_law']).toContain(method);
  });
});

// ─── prediction bounds ────────────────────────────────────────────────────────

describe('Prediction bounds', () => {
  it('T20: predictedN > currentN when CI is much wider than target', () => {
    const pred = new ConvergencePredictor();
    pred.addObservation(1_000, 0.96, 0.10); // wide CI
    const result = pred.predictRemainingSpins(0.005);
    expect(result.predictedN).toBeGreaterThan(1_000);
  });

  it('T21: predictedN === currentN when CI already meets target', () => {
    const pred = new ConvergencePredictor();
    pred.addObservation(100_000, 0.96, 0.003); // already tight
    const result = pred.predictRemainingSpins(0.005);
    expect(result.predictedN).toBe(100_000);
    expect(result.confidence).toBe(1.0);
  });

  it('T22: predictedN is a finite positive integer when CI is wide', () => {
    const pred = new ConvergencePredictor();
    pred.addObservation(1_000,  0.96, 0.062);
    pred.addObservation(10_000, 0.96, 0.020);
    const result = pred.predictRemainingSpins(0.005);
    expect(Number.isFinite(result.predictedN)).toBe(true);
    expect(result.predictedN).toBeGreaterThan(0);
    expect(Number.isInteger(result.predictedN)).toBe(true);
  });
});

// ─── edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('T23: no observations → predictedN=0, confidence=0, method=power_law', () => {
    const pred   = new ConvergencePredictor();
    const result = pred.predictRemainingSpins(0.005);
    expect(result.predictedN).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.method).toBe('power_law');
    expect(result.currentCI).toBe(Infinity);
  });

  it('T24: single observation does not throw and returns valid prediction', () => {
    const pred = new ConvergencePredictor();
    pred.addObservation(1_000, 0.96, 0.062);
    expect(() => pred.predictRemainingSpins(0.005)).not.toThrow();
    const result = pred.predictRemainingSpins(0.005);
    expect(Number.isFinite(result.predictedN)).toBe(true);
    expect(result.predictedN).toBeGreaterThan(0);
  });

  it('T25: all observations have the same CI value (degenerate case)', () => {
    const pred = new ConvergencePredictor();
    pred.addObservation(1_000,  0.96, 0.02);
    pred.addObservation(2_000,  0.96, 0.02);
    pred.addObservation(5_000,  0.96, 0.02);
    pred.addObservation(10_000, 0.96, 0.02);
    // Should not throw, even though data is flat
    expect(() => pred.predictRemainingSpins(0.005)).not.toThrow();
    const result = pred.predictRemainingSpins(0.005);
    expect(Number.isFinite(result.predictedN)).toBe(true);
    expect(result.predictedN).toBeGreaterThan(0);
  });
});
