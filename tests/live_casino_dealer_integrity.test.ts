import { describe, it, expect } from 'vitest';
import { solveLiveDealer, simulateLiveDealer } from '../src/features/liveCasinoDealerIntegrity.js';

const baseCfg = {
  perSpinErrorProbability: 0.0005,
  spinsPerShift: 300,
  shiftsPerYear: 700,
  avgChipErrorValue: 100,
  chipTrackingDetectionRate: 0.98,
  reconciliationStd: 50,
  alertZThreshold: 3.0,
  auditCadenceDays: 30,
};

describe('liveDealer — validation', () => {
  it('rejects bad error prob', () => {
    expect(() => solveLiveDealer({ ...baseCfg, perSpinErrorProbability: 0 })).toThrow();
    expect(() => solveLiveDealer({ ...baseCfg, perSpinErrorProbability: 0.5 })).toThrow();
  });
  it('rejects spinsPerShift < 1', () => {
    expect(() => solveLiveDealer({ ...baseCfg, spinsPerShift: 0 })).toThrow();
  });
  it('rejects detectionRate out of (0, 1]', () => {
    expect(() => solveLiveDealer({ ...baseCfg, chipTrackingDetectionRate: 1.5 })).toThrow();
  });
  it('rejects negative reconciliationStd', () => {
    expect(() => solveLiveDealer({ ...baseCfg, reconciliationStd: -10 })).toThrow();
  });
  it('rejects non-finite avgChipErrorValue', () => {
    expect(() => solveLiveDealer({ ...baseCfg, avgChipErrorValue: NaN })).toThrow();
  });
});

describe('liveDealer — math', () => {
  it('annual errors > 0', () => {
    const r = solveLiveDealer(baseCfg);
    expect(r.expectedAnnualErrors).toBeGreaterThan(0);
  });
  it('detected ≤ total errors', () => {
    const r = solveLiveDealer(baseCfg);
    expect(r.detectedAnnualErrors).toBeLessThanOrEqual(r.expectedAnnualErrors);
  });
  it('annual cost = errors · chipValue', () => {
    const r = solveLiveDealer(baseCfg);
    expect(r.expectedAnnualErrorCost).toBeCloseTo(r.expectedAnnualErrors * baseCfg.avgChipErrorValue, 2);
  });
  it('higher detection → fewer undetected', () => {
    const a = solveLiveDealer({ ...baseCfg, chipTrackingDetectionRate: 0.7 });
    const b = solveLiveDealer({ ...baseCfg, chipTrackingDetectionRate: 0.99 });
    expect(b.undetectedAnnualErrors).toBeLessThan(a.undetectedAnnualErrors);
  });
});

describe('liveDealer — NJ DGE compliance', () => {
  it('compliant for clean defaults', () => {
    const r = solveLiveDealer(baseCfg);
    expect(r.isCompliantNjDge).toBe(true);
  });
  it('non-compliant when detection < 95%', () => {
    const r = solveLiveDealer({ ...baseCfg, chipTrackingDetectionRate: 0.80 });
    expect(r.isCompliantNjDge).toBe(false);
  });
  it('non-compliant when audit cadence > 30d', () => {
    const r = solveLiveDealer({ ...baseCfg, auditCadenceDays: 90 });
    expect(r.isCompliantNjDge).toBe(false);
  });
});

describe('liveDealer — integrity score', () => {
  it('∈ [0, 1]', () => {
    const r = solveLiveDealer(baseCfg);
    expect(r.dealerIntegrityScore).toBeGreaterThanOrEqual(0);
    expect(r.dealerIntegrityScore).toBeLessThanOrEqual(1);
  });
});

describe('liveDealer — MC', () => {
  it('MC mean within 15% of CF', () => {
    const cf = solveLiveDealer(baseCfg);
    const mc = simulateLiveDealer(baseCfg, 12345, 100);
    const rel = Math.abs(mc.observedExpectedAnnualErrors - cf.expectedAnnualErrors) / cf.expectedAnnualErrors;
    expect(rel).toBeLessThan(0.15);
  });
  it('determinism', () => {
    const a = simulateLiveDealer(baseCfg, 42, 100);
    const b = simulateLiveDealer(baseCfg, 42, 100);
    expect(a.observedExpectedAnnualErrors).toBe(b.observedExpectedAnnualErrors);
  });
});
