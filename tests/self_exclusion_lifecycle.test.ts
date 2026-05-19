/**
 * W225 — Self-Exclusion (GAMSTOP) Lifecycle Markov Analyzer tests.
 *
 * 32 specs covering:
 *   - validation (8)
 *   - stationary distribution (4)
 *   - annual time decomposition (3)
 *   - SE episode rate (2)
 *   - first-passage times (3)
 *   - harm reduction score (2)
 *   - UKGC RTS 7B compliance (3)
 *   - monotonicity invariants (3)
 *   - MC cross-validation (2)
 *   - determinism (1)
 *   - industry use-case (UKGC + AU BetStop) (1)
 */

import { describe, it, expect } from 'vitest';
import {
  solveSelfExclusionLifecycle,
  simulateSelfExclusionLifecycle,
} from '../src/features/selfExclusionLifecycle.js';

const baseCfg = {
  selfExclusionOnsetRatePerDay: 0.003, // ~1 SE per year on average
  meanSelfExclusionDurationDays: 180,  // 6mo UKGC min
  permanentAbsorptionRatePerDay: 1e-4, // ~27y to permanent on average
  coolingPeriodHours: 24,
  minSelfExclusionDurationDays: 180,
  maxSelfExclusionDurationDays: 1825,
};

describe('selfExclusion — validation', () => {
  it('rejects onset rate out of (0, 1)', () => {
    expect(() => solveSelfExclusionLifecycle({ ...baseCfg, selfExclusionOnsetRatePerDay: 0 })).toThrow();
    expect(() => solveSelfExclusionLifecycle({ ...baseCfg, selfExclusionOnsetRatePerDay: 1 })).toThrow();
  });
  it('rejects meanSelfExclusionDurationDays ≤ 0', () => {
    expect(() => solveSelfExclusionLifecycle({ ...baseCfg, meanSelfExclusionDurationDays: 0 })).toThrow();
  });
  it('rejects permanent rate out of (0, 1)', () => {
    expect(() => solveSelfExclusionLifecycle({ ...baseCfg, permanentAbsorptionRatePerDay: 0 })).toThrow();
  });
  it('rejects coolingPeriodHours ≤ 0', () => {
    expect(() => solveSelfExclusionLifecycle({ ...baseCfg, coolingPeriodHours: 0 })).toThrow();
  });
  it('rejects minSelfExclusionDurationDays ≤ 0', () => {
    expect(() => solveSelfExclusionLifecycle({ ...baseCfg, minSelfExclusionDurationDays: 0 })).toThrow();
  });
  it('rejects maxSelfExclusionDurationDays ≤ min', () => {
    expect(() =>
      solveSelfExclusionLifecycle({ ...baseCfg, maxSelfExclusionDurationDays: 100 }),
    ).toThrow();
  });
  it('rejects non-finite rate', () => {
    expect(() => solveSelfExclusionLifecycle({ ...baseCfg, selfExclusionOnsetRatePerDay: NaN })).toThrow();
  });
  it('rejects non-finite duration', () => {
    expect(() => solveSelfExclusionLifecycle({ ...baseCfg, meanSelfExclusionDurationDays: Infinity })).toThrow();
  });
});

describe('selfExclusion — stationary distribution', () => {
  it('π_a + π_e = 1', () => {
    const r = solveSelfExclusionLifecycle(baseCfg);
    expect(r.stationaryFractionActive + r.stationaryFractionExcluded).toBeCloseTo(1, 9);
  });
  it('π_e / π_a = λ_se · D_se', () => {
    const r = solveSelfExclusionLifecycle(baseCfg);
    const expected = baseCfg.selfExclusionOnsetRatePerDay * baseCfg.meanSelfExclusionDurationDays;
    expect(r.stationaryFractionExcluded / r.stationaryFractionActive).toBeCloseTo(expected, 6);
  });
  it('low λ_se: π_e small (mostly ACTIVE)', () => {
    const r = solveSelfExclusionLifecycle({ ...baseCfg, selfExclusionOnsetRatePerDay: 0.0001 });
    expect(r.stationaryFractionActive).toBeGreaterThan(0.9);
  });
  it('high λ_se: π_e dominant (mostly EXCLUDED)', () => {
    const r = solveSelfExclusionLifecycle({ ...baseCfg, selfExclusionOnsetRatePerDay: 0.05, meanSelfExclusionDurationDays: 365 });
    expect(r.stationaryFractionExcluded).toBeGreaterThan(0.5);
  });
});

describe('selfExclusion — annual time decomposition', () => {
  it('expectedDaysActivePerYear = π_a · 365', () => {
    const r = solveSelfExclusionLifecycle(baseCfg);
    expect(r.expectedDaysActivePerYear).toBeCloseTo(r.stationaryFractionActive * 365, 6);
  });
  it('expectedDaysExcludedPerYear = π_e · 365', () => {
    const r = solveSelfExclusionLifecycle(baseCfg);
    expect(r.expectedDaysExcludedPerYear).toBeCloseTo(r.stationaryFractionExcluded * 365, 6);
  });
  it('days_active + days_excluded = 365', () => {
    const r = solveSelfExclusionLifecycle(baseCfg);
    expect(r.expectedDaysActivePerYear + r.expectedDaysExcludedPerYear).toBeCloseTo(365, 6);
  });
});

describe('selfExclusion — annual SE episode rate', () => {
  it('annualSE = π_a · 365 · λ_se', () => {
    const r = solveSelfExclusionLifecycle(baseCfg);
    const expected = r.stationaryFractionActive * 365 * baseCfg.selfExclusionOnsetRatePerDay;
    expect(r.annualSelfExclusionEpisodes).toBeCloseTo(expected, 6);
  });
  it('annualSE > 0', () => {
    const r = solveSelfExclusionLifecycle(baseCfg);
    expect(r.annualSelfExclusionEpisodes).toBeGreaterThan(0);
  });
});

describe('selfExclusion — first-passage times', () => {
  it('expectedDaysToFirstSE = 1/λ_se', () => {
    const r = solveSelfExclusionLifecycle(baseCfg);
    expect(r.expectedDaysToFirstSE).toBeCloseTo(1 / baseCfg.selfExclusionOnsetRatePerDay, 6);
  });
  it('expectedDaysToPermanent = 1/λ_p', () => {
    const r = solveSelfExclusionLifecycle(baseCfg);
    expect(r.expectedDaysToPermanent).toBeCloseTo(1 / baseCfg.permanentAbsorptionRatePerDay, 6);
  });
  it('expectedYearsToPermanent = days/365', () => {
    const r = solveSelfExclusionLifecycle(baseCfg);
    expect(r.expectedYearsToPermanent).toBeCloseTo(r.expectedDaysToPermanent / 365, 9);
  });
});

describe('selfExclusion — harm reduction', () => {
  it('= π_e', () => {
    const r = solveSelfExclusionLifecycle(baseCfg);
    expect(r.harmReductionScoreFromSE).toBeCloseTo(r.stationaryFractionExcluded, 9);
  });
  it('∈ [0, 1]', () => {
    const r = solveSelfExclusionLifecycle(baseCfg);
    expect(r.harmReductionScoreFromSE).toBeGreaterThanOrEqual(0);
    expect(r.harmReductionScoreFromSE).toBeLessThanOrEqual(1);
  });
});

describe('selfExclusion — UKGC RTS 7B compliance', () => {
  it('true for default UKGC config (min 180d / max 1825d / 24h cooling)', () => {
    const r = solveSelfExclusionLifecycle(baseCfg);
    expect(r.isCompliantUkgcRts7b).toBe(true);
  });
  it('false when min duration < 180 days (6 months)', () => {
    const r = solveSelfExclusionLifecycle({ ...baseCfg, minSelfExclusionDurationDays: 90 });
    expect(r.isCompliantUkgcRts7b).toBe(false);
  });
  it('false when cooling period < 24h', () => {
    const r = solveSelfExclusionLifecycle({ ...baseCfg, coolingPeriodHours: 12 });
    expect(r.isCompliantUkgcRts7b).toBe(false);
  });
});

describe('selfExclusion — monotonicity', () => {
  it('higher λ_se → higher π_e', () => {
    const a = solveSelfExclusionLifecycle({ ...baseCfg, selfExclusionOnsetRatePerDay: 0.001 });
    const b = solveSelfExclusionLifecycle({ ...baseCfg, selfExclusionOnsetRatePerDay: 0.01 });
    expect(b.stationaryFractionExcluded).toBeGreaterThan(a.stationaryFractionExcluded);
  });
  it('longer D_se → higher π_e (ceteris paribus)', () => {
    const a = solveSelfExclusionLifecycle({ ...baseCfg, meanSelfExclusionDurationDays: 180 });
    const b = solveSelfExclusionLifecycle({ ...baseCfg, meanSelfExclusionDurationDays: 1825 });
    expect(b.stationaryFractionExcluded).toBeGreaterThan(a.stationaryFractionExcluded);
  });
  it('higher λ_p → faster permanent absorption (smaller E[T_perm])', () => {
    const a = solveSelfExclusionLifecycle({ ...baseCfg, permanentAbsorptionRatePerDay: 1e-5 });
    const b = solveSelfExclusionLifecycle({ ...baseCfg, permanentAbsorptionRatePerDay: 1e-3 });
    expect(b.expectedDaysToPermanent).toBeLessThan(a.expectedDaysToPermanent);
  });
});

describe('selfExclusion — MC cross-validation', () => {
  it('MC fraction-active within 8pp of CF stationary (continuous→discrete gap)', () => {
    const cf = solveSelfExclusionLifecycle(baseCfg);
    const mc = simulateSelfExclusionLifecycle(baseCfg, 12345, 200, 1825);
    expect(
      Math.abs(mc.observedFractionActive - cf.stationaryFractionActive),
    ).toBeLessThan(0.08);
  });
  it('MC E[first SE day] within 25% of CF (Exponential variance is high)', () => {
    const cf = solveSelfExclusionLifecycle(baseCfg);
    const mc = simulateSelfExclusionLifecycle(baseCfg, 67890, 200, 1825);
    const rel =
      Math.abs(mc.observedExpectedDaysToFirstSE - cf.expectedDaysToFirstSE) /
      cf.expectedDaysToFirstSE;
    expect(rel).toBeLessThan(0.25);
  });
});

describe('selfExclusion — determinism', () => {
  it('same seed → identical MC', () => {
    const a = simulateSelfExclusionLifecycle(baseCfg, 42, 100, 365);
    const b = simulateSelfExclusionLifecycle(baseCfg, 42, 100, 365);
    expect(a.observedFractionActive).toBe(b.observedFractionActive);
  });
});

describe('selfExclusion — industry use-cases', () => {
  it('UKGC RTS 7B baseline + AU BetStop comparison', () => {
    const ukgc = solveSelfExclusionLifecycle(baseCfg);
    const auBetstop = solveSelfExclusionLifecycle({
      ...baseCfg,
      meanSelfExclusionDurationDays: 365,  // AU NCPF default 12mo (stricter)
    });
    // AU stricter → longer SE → higher π_e
    expect(auBetstop.stationaryFractionExcluded).toBeGreaterThan(ukgc.stationaryFractionExcluded);
    expect(ukgc.isCompliantUkgcRts7b).toBe(true);
    expect(auBetstop.isCompliantUkgcRts7b).toBe(true);
  });
});
