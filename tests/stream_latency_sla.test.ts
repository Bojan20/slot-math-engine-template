import { describe, it, expect } from 'vitest';
import { solveStreamLatency, simulateStreamLatency } from '../src/features/streamLatencySla.js';

const baseCfg = {
  medianLatencyMs: 200,
  latencyLogStd: 0.4,
  slaThresholdMs: 500,
  spinsPerDay: 1_000_000,
  refundPerBreach: 1,
  operatorAnnualRevenue: 100_000_000,
};

describe('streamLatency — validation', () => {
  it('rejects bad inputs', () => {
    expect(() => solveStreamLatency({ ...baseCfg, medianLatencyMs: 0 })).toThrow();
    expect(() => solveStreamLatency({ ...baseCfg, latencyLogStd: 0 })).toThrow();
    expect(() => solveStreamLatency({ ...baseCfg, slaThresholdMs: 0 })).toThrow();
    expect(() => solveStreamLatency({ ...baseCfg, spinsPerDay: 0 })).toThrow();
    expect(() => solveStreamLatency({ ...baseCfg, refundPerBreach: -1 })).toThrow();
  });
});

describe('streamLatency — math', () => {
  it('mean > median for log-normal', () => {
    const r = solveStreamLatency(baseCfg);
    expect(r.meanLatencyMs).toBeGreaterThan(baseCfg.medianLatencyMs);
  });
  it('p99 > mean', () => {
    const r = solveStreamLatency(baseCfg);
    expect(r.p99LatencyMs).toBeGreaterThan(r.meanLatencyMs);
  });
  it('probSlaBreach ∈ [0, 1]', () => {
    const r = solveStreamLatency(baseCfg);
    expect(r.probSlaBreach).toBeGreaterThanOrEqual(0);
    expect(r.probSlaBreach).toBeLessThanOrEqual(1);
  });
  it('higher threshold → lower breach prob', () => {
    const a = solveStreamLatency({ ...baseCfg, slaThresholdMs: 200 });
    const b = solveStreamLatency({ ...baseCfg, slaThresholdMs: 1000 });
    expect(b.probSlaBreach).toBeLessThan(a.probSlaBreach);
  });
});

describe('streamLatency — UKGC RTS 14F', () => {
  it('compliant for clean defaults', () => {
    const r = solveStreamLatency(baseCfg);
    expect(r.isCompliantUkgcRts14f).toBe(true);
  });
  it('non-compliant when threshold > 500ms', () => {
    const r = solveStreamLatency({ ...baseCfg, slaThresholdMs: 1000 });
    expect(r.isCompliantUkgcRts14f).toBe(false);
  });
  it('non-compliant when breach > 5%', () => {
    const r = solveStreamLatency({ ...baseCfg, latencyLogStd: 1.5 });
    expect(r.isCompliantUkgcRts14f).toBe(false);
  });
});

describe('streamLatency — MC', () => {
  it('MC breach prob within 2pp of CF', () => {
    const cf = solveStreamLatency(baseCfg);
    const mc = simulateStreamLatency(baseCfg, 12345, 5000);
    expect(Math.abs(mc.observedProbSlaBreach - cf.probSlaBreach)).toBeLessThan(0.02);
  });
  it('determinism', () => {
    const a = simulateStreamLatency(baseCfg, 42, 200);
    const b = simulateStreamLatency(baseCfg, 42, 200);
    expect(a.observedProbSlaBreach).toBe(b.observedProbSlaBreach);
  });
});
