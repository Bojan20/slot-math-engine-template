import { describe, it, expect } from 'vitest';
import { solveAiHallucination, simulateAiHallucination } from '../src/features/customerServiceAiHallucinationRisk.js';

const baseCfg = {
  perQueryHallucinationProb: 0.02,
  annualQueries: 1_000_000,
  humanSamplingRate: 0.10,
  humanDetectionRate: 0.95,
  costPerUncorrectedHallucination: 500,
  costPerHumanReview: 5,
  operatorAnnualRevenue: 50_000_000,
};

describe('aiHallucination — validation', () => {
  it('rejects bad hallucinationProb', () => {
    expect(() => solveAiHallucination({ ...baseCfg, perQueryHallucinationProb: 0 })).toThrow();
    expect(() => solveAiHallucination({ ...baseCfg, perQueryHallucinationProb: 0.7 })).toThrow();
  });
  it('rejects bad samplingRate', () => {
    expect(() => solveAiHallucination({ ...baseCfg, humanSamplingRate: 1.5 })).toThrow();
  });
  it('rejects bad detectionRate', () => {
    expect(() => solveAiHallucination({ ...baseCfg, humanDetectionRate: 0 })).toThrow();
  });
  it('rejects negative costs', () => {
    expect(() => solveAiHallucination({ ...baseCfg, costPerUncorrectedHallucination: -1 })).toThrow();
    expect(() => solveAiHallucination({ ...baseCfg, costPerHumanReview: -1 })).toThrow();
  });
});

describe('aiHallucination — math', () => {
  it('total hallucinations = queries × prob', () => {
    const r = solveAiHallucination(baseCfg);
    expect(r.expectedHallucinationsPerYear).toBeCloseTo(20000, 0);
  });
  it('detected ≤ total', () => {
    const r = solveAiHallucination(baseCfg);
    expect(r.detectedHallucinations).toBeLessThanOrEqual(r.expectedHallucinationsPerYear);
  });
  it('higher sampling → more detected', () => {
    const a = solveAiHallucination({ ...baseCfg, humanSamplingRate: 0.05 });
    const b = solveAiHallucination({ ...baseCfg, humanSamplingRate: 0.50 });
    expect(b.detectedHallucinations).toBeGreaterThan(a.detectedHallucinations);
  });
});

describe('aiHallucination — EU AI Act Art. 14', () => {
  it('compliant for clean defaults', () => {
    const r = solveAiHallucination(baseCfg);
    expect(r.isCompliantEuAiActArt14).toBe(true);
  });
  it('non-compliant sampling < 5%', () => {
    const r = solveAiHallucination({ ...baseCfg, humanSamplingRate: 0.02 });
    expect(r.isCompliantEuAiActArt14).toBe(false);
  });
  it('non-compliant detection < 0.9', () => {
    const r = solveAiHallucination({ ...baseCfg, humanDetectionRate: 0.8 });
    expect(r.isCompliantEuAiActArt14).toBe(false);
  });
});

describe('aiHallucination — MC', () => {
  it('MC mean within 10% of CF', () => {
    const cf = solveAiHallucination(baseCfg);
    const mc = simulateAiHallucination(baseCfg, 12345, 100);
    const rel = Math.abs(mc.observedHallucinationsMean - cf.expectedHallucinationsPerYear) / cf.expectedHallucinationsPerYear;
    expect(rel).toBeLessThan(0.10);
  });
  it('determinism', () => {
    const a = simulateAiHallucination(baseCfg, 42, 100);
    const b = simulateAiHallucination(baseCfg, 42, 100);
    expect(a.observedHallucinationsMean).toBe(b.observedHallucinationsMean);
  });
});
