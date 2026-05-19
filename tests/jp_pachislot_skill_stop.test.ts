import { describe, it, expect } from 'vitest';
import { solveJpPachislot, simulateJpPachislot } from '../src/features/jpPachislotSkillStop.js';

const baseCfg = {
  targetRtp: 0.95,
  pachislotType: 6 as const,
  playerSkillMultiplier: 1.02,
  betPerSpin: 150,
  spinsPerHour: 360,
  dailyPlayHours: 4,
  paybackCycleHours: 3.5,
  jagraCertified: true,
};

describe('jpPachislot — validation', () => {
  it('rejects RTP out of [0.55, 1.30]', () => {
    expect(() => solveJpPachislot({ ...baseCfg, targetRtp: 0.30 })).toThrow();
    expect(() => solveJpPachislot({ ...baseCfg, targetRtp: 1.50 })).toThrow();
  });
  it('rejects invalid type', () => {
    expect(() => solveJpPachislot({ ...baseCfg, pachislotType: 7 as any })).toThrow();
  });
  it('rejects skill multiplier > 1.10', () => {
    expect(() => solveJpPachislot({ ...baseCfg, playerSkillMultiplier: 1.50 })).toThrow();
  });
  it('rejects negative bet', () => {
    expect(() => solveJpPachislot({ ...baseCfg, betPerSpin: -100 })).toThrow();
  });
  it('rejects too many hours', () => {
    expect(() => solveJpPachislot({ ...baseCfg, dailyPlayHours: 20 })).toThrow();
  });
});

describe('jpPachislot — math', () => {
  it('effectiveRtp = target × skill', () => {
    const r = solveJpPachislot(baseCfg);
    expect(r.effectiveRtp).toBeCloseTo(0.95 * 1.02, 6);
  });
  it('hourly loss = spins × bet × (1 − rtp)', () => {
    const r = solveJpPachislot(baseCfg);
    const expected = 360 * 150 * (1 - 0.95 * 1.02);
    expect(r.expectedHourlyLoss).toBeCloseTo(expected, 0);
  });
  it('daily loss = hourly × hours', () => {
    const r = solveJpPachislot(baseCfg);
    expect(r.expectedDailyLoss).toBeCloseTo(r.expectedHourlyLoss * 4, 0);
  });
  it('Type 6 max RTP 1.19', () => {
    const r = solveJpPachislot({ ...baseCfg, targetRtp: 1.19, playerSkillMultiplier: 1.0 });
    expect(r.rtpWithinTypeLimits).toBe(true);
  });
  it('Type 6 fail when effRtp > 1.19', () => {
    const r = solveJpPachislot({ ...baseCfg, targetRtp: 1.18, playerSkillMultiplier: 1.10, pachislotType: 6 });
    expect(r.rtpWithinTypeLimits).toBe(false);
  });
});

describe('jpPachislot — 風営法 compliance', () => {
  it('compliant for clean defaults', () => {
    const r = solveJpPachislot(baseCfg);
    expect(r.isCompliantFueiho).toBe(true);
  });
  it('non-compliant when payback cycle > 4h', () => {
    const r = solveJpPachislot({ ...baseCfg, paybackCycleHours: 6 });
    expect(r.isCompliantFueiho).toBe(false);
  });
  it('non-compliant when no JAGRA cert', () => {
    const r = solveJpPachislot({ ...baseCfg, jagraCertified: false });
    expect(r.isCompliantFueiho).toBe(false);
  });
});

describe('jpPachislot — MC', () => {
  it('MC mean exists', () => {
    const mc = simulateJpPachislot(baseCfg, 12345, 300);
    expect(typeof mc.observedDailyLossMean).toBe('number');
  });
  it('determinism', () => {
    const a = simulateJpPachislot(baseCfg, 42, 100);
    const b = simulateJpPachislot(baseCfg, 42, 100);
    expect(a.observedDailyLossMean).toBe(b.observedDailyLossMean);
  });
});
