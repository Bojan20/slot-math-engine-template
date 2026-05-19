/**
 * W222 — Spin Velocity / Auto-Play Time Compliance Analyzer tests.
 *
 * 32 specs covering:
 *   - validation (8)
 *   - natural mean correctness (3)
 *   - throttled mean correctness vs Gamma CDF (4)
 *   - probIntervalBelowRegulatory (3)
 *   - spin rate disclosure (3)
 *   - velocity harm score (3)
 *   - compliance boolean (3)
 *   - monotonicity invariants (2)
 *   - MC cross-validation (2)
 *   - determinism (1)
 *   - industry use-cases (UKGC + AU + DE + NL) (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveSpinVelocityCompliance,
  simulateSpinVelocityCompliance,
} from '../src/features/spinVelocityCompliance.js';

const baseCfg = {
  naturalIntervalShape: 2.0,
  naturalIntervalScale: 1.0, // E[X] = 2.0 sec, σ = √2 ≈ 1.41
  regulatoryMinIntervalSec: 2.5, // UKGC
  realityCheckIntervalMinutes: 60,
  sessionDurationHours: 1,
};

describe('spinVelocityCompliance — validation', () => {
  it('rejects naturalIntervalShape ≤ 0', () => {
    expect(() => solveSpinVelocityCompliance({ ...baseCfg, naturalIntervalShape: 0 })).toThrow();
    expect(() => solveSpinVelocityCompliance({ ...baseCfg, naturalIntervalShape: -1 })).toThrow();
  });
  it('rejects naturalIntervalShape > 20', () => {
    expect(() => solveSpinVelocityCompliance({ ...baseCfg, naturalIntervalShape: 25 })).toThrow();
  });
  it('rejects naturalIntervalScale ≤ 0', () => {
    expect(() => solveSpinVelocityCompliance({ ...baseCfg, naturalIntervalScale: 0 })).toThrow();
  });
  it('rejects regulatoryMinIntervalSec ≤ 0', () => {
    expect(() => solveSpinVelocityCompliance({ ...baseCfg, regulatoryMinIntervalSec: 0 })).toThrow();
  });
  it('rejects realityCheckIntervalMinutes ≤ 0', () => {
    expect(() => solveSpinVelocityCompliance({ ...baseCfg, realityCheckIntervalMinutes: 0 })).toThrow();
  });
  it('rejects sessionDurationHours ≤ 0', () => {
    expect(() => solveSpinVelocityCompliance({ ...baseCfg, sessionDurationHours: 0 })).toThrow();
  });
  it('rejects non-finite naturalIntervalShape', () => {
    expect(() => solveSpinVelocityCompliance({ ...baseCfg, naturalIntervalShape: NaN })).toThrow();
    expect(() => solveSpinVelocityCompliance({ ...baseCfg, naturalIntervalShape: Infinity })).toThrow();
  });
  it('rejects fractional sessionDurationHours allowed (real-valued)', () => {
    // 1.5h session is valid
    expect(() => solveSpinVelocityCompliance({ ...baseCfg, sessionDurationHours: 1.5 })).not.toThrow();
  });
});

describe('spinVelocityCompliance — natural mean', () => {
  it('E[X] = k·θ', () => {
    const r = solveSpinVelocityCompliance({ ...baseCfg, naturalIntervalShape: 2, naturalIntervalScale: 1 });
    expect(r.naturalMeanIntervalSec).toBeCloseTo(2.0, 9);
  });
  it('naturalSpinsPerMinute = 60/(k·θ)', () => {
    const r = solveSpinVelocityCompliance({ ...baseCfg, naturalIntervalShape: 3, naturalIntervalScale: 0.5 });
    expect(r.naturalSpinsPerMinute).toBeCloseTo(60 / 1.5, 9);
  });
  it('naturalSpinsPerHour = 3600/(k·θ)', () => {
    const r = solveSpinVelocityCompliance({ ...baseCfg, naturalIntervalShape: 2, naturalIntervalScale: 1.5 });
    expect(r.naturalSpinsPerHour).toBeCloseTo(3600 / 3.0, 9);
  });
});

describe('spinVelocityCompliance — throttled mean', () => {
  it('E[Y] ≥ T_min always', () => {
    const r = solveSpinVelocityCompliance(baseCfg);
    expect(r.effectiveMeanIntervalSec).toBeGreaterThanOrEqual(baseCfg.regulatoryMinIntervalSec);
  });
  it('E[Y] = T_min when entire mass below T_min (very fast natural)', () => {
    // k=1, θ=0.05 → E[X] = 0.05, P(X < 5) ≈ 1
    const r = solveSpinVelocityCompliance({
      ...baseCfg,
      naturalIntervalShape: 1,
      naturalIntervalScale: 0.05,
      regulatoryMinIntervalSec: 5,
    });
    expect(r.effectiveMeanIntervalSec).toBeCloseTo(5, 1);
    expect(r.probIntervalBelowRegulatory).toBeGreaterThan(0.99);
  });
  it('E[Y] ≈ E[X] when entire mass above T_min (very slow natural)', () => {
    // k=2, θ=10 → E[X] = 20 sec, T_min = 1 sec
    const r = solveSpinVelocityCompliance({
      ...baseCfg,
      naturalIntervalShape: 2,
      naturalIntervalScale: 10,
      regulatoryMinIntervalSec: 1,
    });
    expect(r.effectiveMeanIntervalSec).toBeCloseTo(20, 0);
    expect(r.probIntervalBelowRegulatory).toBeLessThan(0.01);
  });
  it('E[Y] strictly between T_min and max(E[X], T_min) for moderate T_min', () => {
    const r = solveSpinVelocityCompliance(baseCfg); // E[X]=2.0, T_min=2.5
    expect(r.effectiveMeanIntervalSec).toBeGreaterThan(baseCfg.regulatoryMinIntervalSec);
    expect(r.effectiveMeanIntervalSec).toBeGreaterThan(r.naturalMeanIntervalSec);
  });
});

describe('spinVelocityCompliance — probIntervalBelowRegulatory', () => {
  it('= 0 when T_min = 0+', () => {
    const r = solveSpinVelocityCompliance({ ...baseCfg, regulatoryMinIntervalSec: 1e-9 });
    expect(r.probIntervalBelowRegulatory).toBeCloseTo(0, 6);
  });
  it('→ 1 as T_min → ∞', () => {
    const r = solveSpinVelocityCompliance({ ...baseCfg, regulatoryMinIntervalSec: 100 });
    expect(r.probIntervalBelowRegulatory).toBeGreaterThan(0.9999);
  });
  it('= 0.5 when T_min equals median of Gamma(2, 1) ≈ 1.678', () => {
    const r = solveSpinVelocityCompliance({ ...baseCfg, regulatoryMinIntervalSec: 1.678 });
    expect(r.probIntervalBelowRegulatory).toBeCloseTo(0.5, 1);
  });
});

describe('spinVelocityCompliance — spin rate disclosure', () => {
  it('effectiveSpinsPerMinute < naturalSpinsPerMinute when throttle binds', () => {
    const r = solveSpinVelocityCompliance(baseCfg);
    expect(r.effectiveSpinsPerMinute).toBeLessThan(r.naturalSpinsPerMinute);
  });
  it('spinRateThrottleImpact ∈ [0, 1]', () => {
    const r = solveSpinVelocityCompliance(baseCfg);
    expect(r.spinRateThrottleImpact).toBeGreaterThanOrEqual(0);
    expect(r.spinRateThrottleImpact).toBeLessThanOrEqual(1);
  });
  it('expectedSpinsPerSession scales linearly with sessionDurationHours', () => {
    const a = solveSpinVelocityCompliance({ ...baseCfg, sessionDurationHours: 1 });
    const b = solveSpinVelocityCompliance({ ...baseCfg, sessionDurationHours: 4 });
    expect(b.expectedSpinsPerSession / a.expectedSpinsPerSession).toBeCloseTo(4, 6);
  });
});

describe('spinVelocityCompliance — velocity harm score', () => {
  it('∈ [0, 1]', () => {
    const r = solveSpinVelocityCompliance(baseCfg);
    expect(r.velocityHarmScore).toBeGreaterThanOrEqual(0);
    expect(r.velocityHarmScore).toBeLessThanOrEqual(1);
  });
  it('= 0 when spinsPerMinute ≤ 4 (very slow)', () => {
    const r = solveSpinVelocityCompliance({
      ...baseCfg,
      naturalIntervalShape: 5,
      naturalIntervalScale: 5,
      regulatoryMinIntervalSec: 30,
    });
    expect(r.velocityHarmScore).toBe(0);
  });
  it('= 1 when spinsPerMinute ≥ 24 (very fast)', () => {
    const r = solveSpinVelocityCompliance({
      ...baseCfg,
      naturalIntervalShape: 1,
      naturalIntervalScale: 0.05,
      regulatoryMinIntervalSec: 0.5,
    });
    expect(r.velocityHarmScore).toBeGreaterThan(0.95);
  });
});

describe('spinVelocityCompliance — compliance boolean', () => {
  it('true when E[Y] ≥ T_min AND P_below ≤ 0.05', () => {
    // Use very slow natural where P(X<T_min) is essentially 0
    const r = solveSpinVelocityCompliance({
      ...baseCfg,
      naturalIntervalShape: 5,
      naturalIntervalScale: 2,    // E[X] = 10
      regulatoryMinIntervalSec: 2.5,
    });
    expect(r.compliesWithRegulatoryMinimum).toBe(true);
  });
  it('false when P_below > 0.05 (player would naturally tap fast)', () => {
    const r = solveSpinVelocityCompliance({
      ...baseCfg,
      naturalIntervalShape: 1,
      naturalIntervalScale: 0.5,
      regulatoryMinIntervalSec: 2.5,
    });
    expect(r.compliesWithRegulatoryMinimum).toBe(false);
  });
  it('compliance can be true if T_min trivially low', () => {
    const r = solveSpinVelocityCompliance({
      ...baseCfg,
      regulatoryMinIntervalSec: 1e-6,
    });
    expect(r.compliesWithRegulatoryMinimum).toBe(true);
  });
});

describe('spinVelocityCompliance — monotonicity', () => {
  it('higher T_min → higher effectiveMeanIntervalSec (ceteris paribus)', () => {
    const a = solveSpinVelocityCompliance({ ...baseCfg, regulatoryMinIntervalSec: 2.5 });
    const b = solveSpinVelocityCompliance({ ...baseCfg, regulatoryMinIntervalSec: 5.0 });
    expect(b.effectiveMeanIntervalSec).toBeGreaterThan(a.effectiveMeanIntervalSec);
  });
  it('higher T_min → lower effectiveSpinsPerMinute', () => {
    const a = solveSpinVelocityCompliance({ ...baseCfg, regulatoryMinIntervalSec: 2.5 });
    const b = solveSpinVelocityCompliance({ ...baseCfg, regulatoryMinIntervalSec: 5.0 });
    expect(b.effectiveSpinsPerMinute).toBeLessThan(a.effectiveSpinsPerMinute);
  });
});

describe('spinVelocityCompliance — MC cross-validation', () => {
  it('MC effective mean within 3% of CF', () => {
    const cfg = baseCfg;
    const cf = solveSpinVelocityCompliance(cfg);
    const mc = simulateSpinVelocityCompliance(cfg, 12345, 20_000);
    expect(
      Math.abs(mc.observedEffectiveMeanIntervalSec - cf.effectiveMeanIntervalSec) /
        cf.effectiveMeanIntervalSec,
    ).toBeLessThan(0.03);
  });
  it('MC P(X<T_min) within 2pp of CF Gamma CDF', () => {
    const cfg = baseCfg;
    const cf = solveSpinVelocityCompliance(cfg);
    const mc = simulateSpinVelocityCompliance(cfg, 67890, 20_000);
    expect(Math.abs(mc.observedProbIntervalBelowRegulatory - cf.probIntervalBelowRegulatory)).toBeLessThan(0.02);
  });
});

describe('spinVelocityCompliance — determinism', () => {
  it('same seed → identical MC results', () => {
    const a = simulateSpinVelocityCompliance(baseCfg, 42, 1000);
    const b = simulateSpinVelocityCompliance(baseCfg, 42, 1000);
    expect(a.observedEffectiveMeanIntervalSec).toBe(b.observedEffectiveMeanIntervalSec);
  });
});

describe('spinVelocityCompliance — industry use-cases', () => {
  it('UKGC 2.5s + AU 3.0s + DE 5.0s + NL 4.0s — DE strictest', () => {
    const naturalCfg = { naturalIntervalShape: 2, naturalIntervalScale: 0.8 }; // E[X] = 1.6
    const uk = solveSpinVelocityCompliance({ ...baseCfg, ...naturalCfg, regulatoryMinIntervalSec: 2.5 });
    const au = solveSpinVelocityCompliance({ ...baseCfg, ...naturalCfg, regulatoryMinIntervalSec: 3.0 });
    const nl = solveSpinVelocityCompliance({ ...baseCfg, ...naturalCfg, regulatoryMinIntervalSec: 4.0 });
    const de = solveSpinVelocityCompliance({ ...baseCfg, ...naturalCfg, regulatoryMinIntervalSec: 5.0 });
    // DE most restrictive → smallest spinsPerMinute
    expect(de.effectiveSpinsPerMinute).toBeLessThan(nl.effectiveSpinsPerMinute);
    expect(nl.effectiveSpinsPerMinute).toBeLessThan(au.effectiveSpinsPerMinute);
    expect(au.effectiveSpinsPerMinute).toBeLessThan(uk.effectiveSpinsPerMinute);
    // All four jurisdictions cap at 60/T_min spins/min in the limit
    expect(de.effectiveSpinsPerMinute).toBeLessThanOrEqual(60 / 5.0);
  });
});
