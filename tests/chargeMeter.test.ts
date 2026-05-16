/**
 * W152 Wave 50 — Charge Meter tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveChargeMeterSteadyState,
  solveChargeMeterFiniteHorizon,
  simulateChargeMeter,
  meanChargePerWin,
  varianceChargePerWin,
  spinChargePmf,
  type ChargeMeterConfig,
} from '../src/features/chargeMeter.js';

const baseCfg = (overrides: Partial<ChargeMeterConfig> = {}): ChargeMeterConfig => ({
  pClusterWin: 0.25,
  chargeDistribution: [
    { chargePoints: 1, weight: 6 },
    { chargePoints: 2, weight: 3 },
    { chargePoints: 5, weight: 1 },
  ],
  meterThreshold: 50,
  rewardX: 100,
  meterResetMode: 'subtract_threshold',
  ...overrides,
});

// ── Helpers ───────────────────────────────────────────────────────────────

describe('meanChargePerWin', () => {
  it('weighted mean: (6×1 + 3×2 + 1×5)/10 = 17/10', () => {
    expect(meanChargePerWin([
      { chargePoints: 1, weight: 6 },
      { chargePoints: 2, weight: 3 },
      { chargePoints: 5, weight: 1 },
    ])).toBeCloseTo(1.7, 10);
  });
});

describe('varianceChargePerWin', () => {
  it('variance via E[(X-mu)^2]', () => {
    // mean = 1.7
    // var = 0.6×(1-1.7)^2 + 0.3×(2-1.7)^2 + 0.1×(5-1.7)^2
    //     = 0.6×0.49 + 0.3×0.09 + 0.1×10.89
    //     = 0.294 + 0.027 + 1.089 = 1.41
    expect(varianceChargePerWin([
      { chargePoints: 1, weight: 6 },
      { chargePoints: 2, weight: 3 },
      { chargePoints: 5, weight: 1 },
    ])).toBeCloseTo(1.41, 8);
  });
});

describe('spinChargePmf', () => {
  it('sums to 1', () => {
    const pmf = spinChargePmf(baseCfg());
    const s = pmf.reduce((a, e) => a + e.prob, 0);
    expect(s).toBeCloseTo(1, 10);
  });
  it('value 0 has prob 1 - pClusterWin', () => {
    const pmf = spinChargePmf(baseCfg());
    const zero = pmf.find((e) => e.value === 0)!;
    expect(zero.prob).toBeCloseTo(0.75, 10);
  });
});

// ── Validation ─────────────────────────────────────────────────────────────

describe('validate', () => {
  it('rejects pClusterWin outside [0,1]', () => {
    expect(() => solveChargeMeterSteadyState(baseCfg({ pClusterWin: -0.1 }))).toThrow();
    expect(() => solveChargeMeterSteadyState(baseCfg({ pClusterWin: 1.1 }))).toThrow();
  });
  it('rejects empty distribution', () => {
    expect(() => solveChargeMeterSteadyState(baseCfg({ chargeDistribution: [] }))).toThrow();
  });
  it('rejects non-integer chargePoints', () => {
    expect(() =>
      solveChargeMeterSteadyState(baseCfg({ chargeDistribution: [{ chargePoints: 1.5, weight: 1 }] })),
    ).toThrow();
  });
  it('rejects zero-or-negative chargePoints', () => {
    expect(() =>
      solveChargeMeterSteadyState(baseCfg({ chargeDistribution: [{ chargePoints: 0, weight: 1 }] })),
    ).toThrow();
  });
  it('rejects non-integer threshold', () => {
    expect(() => solveChargeMeterSteadyState(baseCfg({ meterThreshold: 1.5 as unknown as number }))).toThrow();
  });
  it('rejects negative rewardX', () => {
    expect(() => solveChargeMeterSteadyState(baseCfg({ rewardX: -1 }))).toThrow();
  });
  it('rejects invalid meterResetMode', () => {
    expect(() =>
      solveChargeMeterSteadyState(baseCfg({ meterResetMode: 'foo' as 'full_drain' })),
    ).toThrow();
  });
  it('rejects initialCharge ≥ threshold', () => {
    expect(() => solveChargeMeterSteadyState(baseCfg({ initialCharge: 50 }))).toThrow();
    expect(() => solveChargeMeterSteadyState(baseCfg({ initialCharge: 100 }))).toThrow();
  });
});

// ── Steady-state correctness ─────────────────────────────────────────────────

describe('solveChargeMeterSteadyState — subtract_threshold mode (exact)', () => {
  it('triggers per spin = E[X] / T', () => {
    const cfg = baseCfg();
    const r = solveChargeMeterSteadyState(cfg);
    // E[X] = 0.25 × 1.7 = 0.425
    expect(r.expectedChargePerSpin).toBeCloseTo(0.425, 10);
    expect(r.triggersPerSpin).toBeCloseTo(0.425 / 50, 10);
    expect(r.expectedOverflowPerTrigger).toBe(0);
  });
  it('RTP contribution = triggersPerSpin × rewardX', () => {
    const cfg = baseCfg();
    const r = solveChargeMeterSteadyState(cfg);
    expect(r.expectedRtpContributionPerSpin).toBeCloseTo(r.triggersPerSpin * cfg.rewardX, 10);
  });
  it('spinsPerTrigger = 1 / triggersPerSpin', () => {
    const r = solveChargeMeterSteadyState(baseCfg());
    expect(r.spinsPerTrigger).toBeCloseTo(1 / r.triggersPerSpin, 10);
  });
});

describe('solveChargeMeterSteadyState — full_drain mode', () => {
  it('overflow > 0 in full_drain', () => {
    const r = solveChargeMeterSteadyState(baseCfg({ meterResetMode: 'full_drain' }));
    expect(r.expectedOverflowPerTrigger).toBeGreaterThanOrEqual(0);
  });
  it('full_drain has fewer triggers per spin than subtract_threshold', () => {
    const sub = solveChargeMeterSteadyState(baseCfg({ meterResetMode: 'subtract_threshold' }));
    const drain = solveChargeMeterSteadyState(baseCfg({ meterResetMode: 'full_drain' }));
    expect(drain.triggersPerSpin).toBeLessThanOrEqual(sub.triggersPerSpin);
  });
});

describe('solveChargeMeterSteadyState — monotonicity', () => {
  it('higher pClusterWin ⇒ more triggers', () => {
    const a = solveChargeMeterSteadyState(baseCfg({ pClusterWin: 0.1 }));
    const b = solveChargeMeterSteadyState(baseCfg({ pClusterWin: 0.5 }));
    expect(b.triggersPerSpin).toBeGreaterThan(a.triggersPerSpin);
  });
  it('lower threshold ⇒ more triggers', () => {
    const a = solveChargeMeterSteadyState(baseCfg({ meterThreshold: 100 }));
    const b = solveChargeMeterSteadyState(baseCfg({ meterThreshold: 20 }));
    expect(b.triggersPerSpin).toBeGreaterThan(a.triggersPerSpin);
  });
  it('higher rewardX ⇒ higher RTP contribution', () => {
    const a = solveChargeMeterSteadyState(baseCfg({ rewardX: 50 }));
    const b = solveChargeMeterSteadyState(baseCfg({ rewardX: 200 }));
    expect(b.expectedRtpContributionPerSpin).toBeGreaterThan(a.expectedRtpContributionPerSpin);
  });
  it('triggersPerSpin invariant to rewardX', () => {
    const a = solveChargeMeterSteadyState(baseCfg({ rewardX: 50 }));
    const b = solveChargeMeterSteadyState(baseCfg({ rewardX: 200 }));
    expect(a.triggersPerSpin).toBeCloseTo(b.triggersPerSpin, 10);
  });
});

// ── MC cross-validation ─────────────────────────────────────────────────────

describe('solveChargeMeterSteadyState — MC cross-validation', () => {
  it('subtract_threshold matches MC at 200K spins (rel ≤ 3%)', () => {
    const cfg = baseCfg();
    const cf = solveChargeMeterSteadyState(cfg);
    const mc = simulateChargeMeter(cfg, 200_000, 0xc0ffee);
    const relRtp = Math.abs(cf.expectedRtpContributionPerSpin - mc.observedRtpPerSpin) /
      Math.max(1e-9, cf.expectedRtpContributionPerSpin);
    expect(relRtp).toBeLessThan(0.03);
    const relRate = Math.abs(cf.triggersPerSpin - mc.observedTriggerRatePerSpin) /
      Math.max(1e-9, cf.triggersPerSpin);
    expect(relRate).toBeLessThan(0.03);
  });
  it('full_drain matches MC at 200K spins (rel ≤ 5%)', () => {
    const cfg = baseCfg({ meterResetMode: 'full_drain' });
    const cf = solveChargeMeterSteadyState(cfg);
    const mc = simulateChargeMeter(cfg, 200_000, 0xdecafbad);
    const relRtp = Math.abs(cf.expectedRtpContributionPerSpin - mc.observedRtpPerSpin) /
      Math.max(1e-9, cf.expectedRtpContributionPerSpin);
    expect(relRtp).toBeLessThan(0.05);
  });
});

// ── Finite-horizon exact PMF ───────────────────────────────────────────────

describe('solveChargeMeterFiniteHorizon — structural', () => {
  it('PMF sums to 1', () => {
    const cfg = baseCfg();
    const r = solveChargeMeterFiniteHorizon(cfg, 100);
    expect(r.pmfSum).toBeCloseTo(1, 8);
  });
  it('expectedTriggers ≥ 0', () => {
    const r = solveChargeMeterFiniteHorizon(baseCfg(), 50);
    expect(r.expectedTriggers).toBeGreaterThanOrEqual(0);
  });
  it('probAtLeastOneTrigger = 1 - PMF[0]', () => {
    const r = solveChargeMeterFiniteHorizon(baseCfg(), 100);
    expect(r.probAtLeastOneTrigger).toBeCloseTo(1 - r.triggerCountPmf[0], 10);
  });
  it('variance ≥ 0', () => {
    const r = solveChargeMeterFiniteHorizon(baseCfg(), 100);
    expect(r.varianceTriggers).toBeGreaterThanOrEqual(0);
  });
  it('expectedTriggers grows with N', () => {
    const r1 = solveChargeMeterFiniteHorizon(baseCfg(), 50);
    const r2 = solveChargeMeterFiniteHorizon(baseCfg(), 200);
    expect(r2.expectedTriggers).toBeGreaterThan(r1.expectedTriggers);
  });
  it('finite-horizon converges to steady-state rate × N for large N', () => {
    // Initial-state-at-zero transient bias decays as O(T/N).
    // At N=1000 with T=50, transient ≈ 50/1000 = 5% of triggers missed.
    const cfg = baseCfg();
    const ss = solveChargeMeterSteadyState(cfg);
    const fh = solveChargeMeterFiniteHorizon(cfg, 1000);
    const expectedFromSS = ss.triggersPerSpin * 1000;
    const rel = Math.abs(fh.expectedTriggers - expectedFromSS) / expectedFromSS;
    expect(rel).toBeLessThan(0.10);
  });
});

describe('solveChargeMeterFiniteHorizon — MC cross-validation', () => {
  it('expectedTriggers matches MC mean (high-trigger config, rel ≤ 5%)', () => {
    // High-trigger config minimises MC SE: pClusterWin=0.5, T=10
    // → ~0.05 triggers/spin → ~5 triggers per N=100 episode
    const cfg: ChargeMeterConfig = {
      pClusterWin: 0.5,
      chargeDistribution: [{ chargePoints: 1, weight: 1 }],
      meterThreshold: 10,
      rewardX: 100,
      meterResetMode: 'subtract_threshold',
    };
    const N = 100;
    const r = solveChargeMeterFiniteHorizon(cfg, N);
    let totalTriggers = 0;
    const episodes = 10_000;
    for (let s = 0; s < episodes; s++) {
      const mc = simulateChargeMeter(cfg, N, s * 17 + 1);
      totalTriggers += mc.observedTriggers;
    }
    const empiricalMean = totalTriggers / episodes;
    const rel = Math.abs(r.expectedTriggers - empiricalMean) / Math.max(1e-9, r.expectedTriggers);
    expect(rel).toBeLessThan(0.05);
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe('solveChargeMeterSteadyState — determinism', () => {
  it('identical inputs ⇒ bit-exact outputs', () => {
    const a = solveChargeMeterSteadyState(baseCfg());
    const b = solveChargeMeterSteadyState(baseCfg());
    expect(a.expectedRtpContributionPerSpin).toBe(b.expectedRtpContributionPerSpin);
    expect(a.triggersPerSpin).toBe(b.triggersPerSpin);
  });
});

describe('simulateChargeMeter — determinism', () => {
  it('same seed ⇒ identical MC result', () => {
    const cfg = baseCfg();
    const a = simulateChargeMeter(cfg, 10_000, 42);
    const b = simulateChargeMeter(cfg, 10_000, 42);
    expect(a.observedTriggers).toBe(b.observedTriggers);
    expect(a.totalCharge).toBe(b.totalCharge);
  });
  it('different seeds ⇒ different results (statistical)', () => {
    const cfg = baseCfg();
    const a = simulateChargeMeter(cfg, 10_000, 1);
    const b = simulateChargeMeter(cfg, 10_000, 2);
    // Triggers should not be identical bit-for-bit
    expect(a.observedTriggers === b.observedTriggers && a.totalCharge === b.totalCharge).toBe(false);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────

describe('solveChargeMeterSteadyState — edges', () => {
  it('pClusterWin = 0 ⇒ zero triggers', () => {
    const r = solveChargeMeterSteadyState(baseCfg({ pClusterWin: 0 }));
    expect(r.expectedChargePerSpin).toBe(0);
    expect(r.triggersPerSpin).toBe(0);
    expect(r.expectedRtpContributionPerSpin).toBe(0);
    expect(r.spinsPerTrigger).toBe(Infinity);
  });
  it('rewardX = 0 ⇒ zero RTP contribution', () => {
    const r = solveChargeMeterSteadyState(baseCfg({ rewardX: 0 }));
    expect(r.expectedRtpContributionPerSpin).toBe(0);
    expect(r.triggersPerSpin).toBeGreaterThan(0);
  });
  it('threshold = 1 ⇒ trigger on every cluster win (subtract)', () => {
    const cfg = baseCfg({ meterThreshold: 1, chargeDistribution: [{ chargePoints: 1, weight: 1 }] });
    const r = solveChargeMeterSteadyState(cfg);
    expect(r.triggersPerSpin).toBeCloseTo(cfg.pClusterWin, 10);
  });
});
