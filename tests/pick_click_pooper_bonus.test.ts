/**
 * W152 Wave 173 — Pick-and-Click Pooper Bonus Analyzer tests.
 */
import { describe, it, expect } from 'vitest';
import {
  analyzePickClickPooperBonus,
  simulatePickClickPooperBonus,
  uncappedExpectedRevealsNhg,
  uncappedVarianceRevealsNhg,
  type PickClickPooperBonusConfig,
} from '../src/features/pickClickPooperBonus.js';

const baseCfg: PickClickPooperBonusConfig = {
  totalBoxes: 20,
  pooperBoxes: 5,
  prizeValueMean: 10,
  prizeValueVar: 9,
};

describe('analyzePickClickPooperBonus — validation', () => {
  it('rejects totalBoxes < 2', () => {
    expect(() => analyzePickClickPooperBonus({ ...baseCfg, totalBoxes: 1 })).toThrow(/totalBoxes/);
  });
  it('rejects non-integer totalBoxes', () => {
    expect(() => analyzePickClickPooperBonus({ ...baseCfg, totalBoxes: 5.5 })).toThrow(
      /totalBoxes/,
    );
  });
  it('rejects pooperBoxes < 1', () => {
    expect(() => analyzePickClickPooperBonus({ ...baseCfg, pooperBoxes: 0 })).toThrow(
      /pooperBoxes/,
    );
  });
  it('rejects pooperBoxes ≥ totalBoxes', () => {
    expect(() =>
      analyzePickClickPooperBonus({ ...baseCfg, totalBoxes: 5, pooperBoxes: 5 }),
    ).toThrow(/pooperBoxes/);
  });
  it('rejects negative prizeValueMean', () => {
    expect(() => analyzePickClickPooperBonus({ ...baseCfg, prizeValueMean: -1 })).toThrow(
      /prizeValueMean/,
    );
  });
  it('rejects negative prizeValueVar', () => {
    expect(() => analyzePickClickPooperBonus({ ...baseCfg, prizeValueVar: -0.01 })).toThrow(
      /prizeValueVar/,
    );
  });
  it('rejects non-integer maxReveals', () => {
    expect(() => analyzePickClickPooperBonus({ ...baseCfg, maxReveals: 2.7 })).toThrow(
      /maxReveals/,
    );
  });
  it('rejects negative disclosure threshold', () => {
    expect(() =>
      analyzePickClickPooperBonus({ ...baseCfg, disclosureRevealThresholds: [-1] }),
    ).toThrow(/disclosure/);
  });
});

describe('analyzePickClickPooperBonus — closed-form moments (uncapped NHG)', () => {
  it('E[T] = M / (K + 1) for default cfg (N=20, K=5 → M=15, E[T]=15/6=2.5)', () => {
    const r = analyzePickClickPooperBonus(baseCfg);
    expect(r.expectedReveals).toBeCloseTo(2.5, 10);
    expect(uncappedExpectedRevealsNhg(20, 5)).toBeCloseTo(2.5, 10);
  });
  it('Var[T] = M(N+1)K / ((K+1)²(K+2)) for default cfg (15·21·5 / 36·7 = 1575/252 ≈ 6.25)', () => {
    const r = analyzePickClickPooperBonus(baseCfg);
    const expected = (15 * 21 * 5) / (36 * 7);
    expect(r.varianceReveals).toBeCloseTo(expected, 8);
    expect(uncappedVarianceRevealsNhg(20, 5)).toBeCloseTo(expected, 8);
  });
  it('stdDev[T] = sqrt(Var[T])', () => {
    const r = analyzePickClickPooperBonus(baseCfg);
    expect(r.stdDevReveals).toBeCloseTo(Math.sqrt(r.varianceReveals), 10);
  });
  it('P(T = 0) = K / N for default cfg (5/20 = 0.25)', () => {
    const r = analyzePickClickPooperBonus(baseCfg);
    expect(r.probZeroReveals).toBeCloseTo(0.25, 10);
    expect(r.oneInNRoundsZeroPicks).toBeCloseTo(4, 10);
  });
});

describe('analyzePickClickPooperBonus — Wald payout', () => {
  it('E[S] = E[T] · μ_V', () => {
    const r = analyzePickClickPooperBonus(baseCfg);
    expect(r.expectedTotalPayout).toBeCloseTo(r.expectedReveals * baseCfg.prizeValueMean, 10);
  });
  it('Var[S] = E[T]·σ²_V + Var[T]·μ_V²', () => {
    const r = analyzePickClickPooperBonus(baseCfg);
    const expected =
      r.expectedReveals * baseCfg.prizeValueVar +
      r.varianceReveals * baseCfg.prizeValueMean * baseCfg.prizeValueMean;
    expect(r.varianceTotalPayout).toBeCloseTo(expected, 8);
  });
  it('E[S] = 0 when μ_V = 0 (degenerate prize)', () => {
    const r = analyzePickClickPooperBonus({ ...baseCfg, prizeValueMean: 0 });
    expect(r.expectedTotalPayout).toBeCloseTo(0, 10);
  });
  it('stdDev[S] = sqrt(Var[S])', () => {
    const r = analyzePickClickPooperBonus(baseCfg);
    expect(r.stdDevTotalPayout).toBeCloseTo(Math.sqrt(r.varianceTotalPayout), 10);
  });
});

describe('analyzePickClickPooperBonus — survival thresholds', () => {
  it('P(T ≥ 0) = 1 (always at least 0 reveals)', () => {
    const r = analyzePickClickPooperBonus({ ...baseCfg, disclosureRevealThresholds: [0] });
    expect(r.survivalAtThresholds[0].probAtLeastK).toBeCloseTo(1, 8);
  });
  it('P(T ≥ k) monotone non-increasing in k', () => {
    const r = analyzePickClickPooperBonus({
      ...baseCfg,
      disclosureRevealThresholds: [1, 2, 3, 5, 8],
    });
    for (let i = 1; i < r.survivalAtThresholds.length; i++) {
      expect(r.survivalAtThresholds[i].probAtLeastK).toBeLessThanOrEqual(
        r.survivalAtThresholds[i - 1].probAtLeastK + 1e-12,
      );
    }
  });
  it('oneInNRounds = 1 / probAtLeastK', () => {
    const r = analyzePickClickPooperBonus({ ...baseCfg, disclosureRevealThresholds: [3] });
    expect(r.survivalAtThresholds[0].oneInNRounds).toBeCloseTo(
      1 / r.survivalAtThresholds[0].probAtLeastK,
      6,
    );
  });
});

describe('analyzePickClickPooperBonus — cap effect', () => {
  it('cap = M gives same E[T] as uncapped formula', () => {
    const r = analyzePickClickPooperBonus({ ...baseCfg, maxReveals: 15 });
    expect(r.expectedReveals).toBeCloseTo(uncappedExpectedRevealsNhg(20, 5), 8);
    expect(r.effectiveCap).toBe(15);
  });
  it('tight cap = 1 → E[T] ≤ 1', () => {
    const r = analyzePickClickPooperBonus({ ...baseCfg, maxReveals: 1 });
    expect(r.expectedReveals).toBeLessThanOrEqual(1);
    expect(r.effectiveCap).toBe(1);
  });
  it('tight cap = 1 → P(T = 1) = P(first draw is prize) = M / N = 15/20 = 0.75', () => {
    const r = analyzePickClickPooperBonus({ ...baseCfg, maxReveals: 1 });
    // probZeroReveals = K/N = 0.25, probReachesCap (=1) = M/N = 0.75
    expect(r.probZeroReveals).toBeCloseTo(0.25, 10);
    expect(r.probReachesCap).toBeCloseTo(0.75, 10);
  });
  it('effectiveCap = min(maxReveals, M) clipped to M when maxReveals too large', () => {
    const r = analyzePickClickPooperBonus({ ...baseCfg, maxReveals: 999 });
    expect(r.effectiveCap).toBe(15);
  });
});

describe('analyzePickClickPooperBonus — monotonicity', () => {
  it('E[T] decreases as pooperBoxes K increases (more poopers = bonus ends sooner)', () => {
    const rLow = analyzePickClickPooperBonus({ ...baseCfg, pooperBoxes: 2 });
    const rHigh = analyzePickClickPooperBonus({ ...baseCfg, pooperBoxes: 10 });
    expect(rLow.expectedReveals).toBeGreaterThan(rHigh.expectedReveals);
  });
  it('E[T] increases as totalBoxes increases (more prizes = bonus runs longer)', () => {
    const rSmall = analyzePickClickPooperBonus({ ...baseCfg, totalBoxes: 10 });
    const rBig = analyzePickClickPooperBonus({ ...baseCfg, totalBoxes: 50 });
    expect(rBig.expectedReveals).toBeGreaterThan(rSmall.expectedReveals);
  });
  it('probZeroReveals = K/N strictly increases in K', () => {
    const rLow = analyzePickClickPooperBonus({ ...baseCfg, pooperBoxes: 2 });
    const rHigh = analyzePickClickPooperBonus({ ...baseCfg, pooperBoxes: 10 });
    expect(rHigh.probZeroReveals).toBeGreaterThan(rLow.probZeroReveals);
  });
});

describe('analyzePickClickPooperBonus — Monte Carlo cross-validation', () => {
  it('MC E[T] within 5% of CF (Aristocrat 5 Dragons cfg N=20 K=5)', () => {
    const cf = analyzePickClickPooperBonus(baseCfg);
    const mc = simulatePickClickPooperBonus(baseCfg, 20000, 0xa5a5);
    const rel = Math.abs(mc.meanReveals - cf.expectedReveals) / cf.expectedReveals;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC stdDev[T] within 15% of CF', () => {
    const cf = analyzePickClickPooperBonus(baseCfg);
    const mc = simulatePickClickPooperBonus(baseCfg, 20000, 0x1234);
    const rel = Math.abs(mc.stdDevReveals - cf.stdDevReveals) / cf.stdDevReveals;
    expect(rel).toBeLessThan(0.15);
  });
  it('MC E[S] within 5% of CF', () => {
    const cf = analyzePickClickPooperBonus(baseCfg);
    const mc = simulatePickClickPooperBonus(baseCfg, 20000, 0x5678);
    const rel = Math.abs(mc.meanTotalPayout - cf.expectedTotalPayout) / cf.expectedTotalPayout;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC P(T = 0) within 1pp of CF (= K/N = 0.25)', () => {
    const cf = analyzePickClickPooperBonus(baseCfg);
    const mc = simulatePickClickPooperBonus(baseCfg, 20000, 0x9abc);
    const abs = Math.abs(mc.probZeroReveals - cf.probZeroReveals);
    expect(abs).toBeLessThan(0.01);
  });
  it('MC survival P(T ≥ 3) within 2pp of CF', () => {
    const cfg = { ...baseCfg, disclosureRevealThresholds: [3] };
    const cf = analyzePickClickPooperBonus(cfg);
    const mc = simulatePickClickPooperBonus(cfg, 20000, 0xdef0);
    const abs = Math.abs(
      mc.empiricalSurvival[0].probAtLeastK - cf.survivalAtThresholds[0].probAtLeastK,
    );
    expect(abs).toBeLessThan(0.02);
  });
});

describe('analyzePickClickPooperBonus — determinism', () => {
  it('two identical calls produce identical results', () => {
    const r1 = analyzePickClickPooperBonus(baseCfg);
    const r2 = analyzePickClickPooperBonus(baseCfg);
    expect(r1.expectedReveals).toBe(r2.expectedReveals);
    expect(r1.varianceTotalPayout).toBe(r2.varianceTotalPayout);
  });
  it('same seed → same MC result', () => {
    const m1 = simulatePickClickPooperBonus(baseCfg, 500, 0xdeadbeef);
    const m2 = simulatePickClickPooperBonus(baseCfg, 500, 0xdeadbeef);
    expect(m1.meanReveals).toBeCloseTo(m2.meanReveals, 12);
    expect(m1.meanTotalPayout).toBeCloseTo(m2.meanTotalPayout, 12);
  });
});

describe('analyzePickClickPooperBonus — industry iconic configs', () => {
  it('Aristocrat 5 Dragons (N=20 K=5) — E[T]=2.5, P(T=0)=0.25, 1-in-4 first-pick pooper', () => {
    const r = analyzePickClickPooperBonus({
      totalBoxes: 20,
      pooperBoxes: 5,
      prizeValueMean: 5,
      prizeValueVar: 4,
    });
    expect(r.expectedReveals).toBeCloseTo(2.5, 6);
    expect(r.probZeroReveals).toBeCloseTo(0.25, 6);
    expect(r.oneInNRoundsZeroPicks).toBeCloseTo(4, 6);
  });
  it('Bally Quick Hit (N=12 K=2) pick-a-prize — E[T] = 10/3 ≈ 3.33', () => {
    const r = analyzePickClickPooperBonus({
      totalBoxes: 12,
      pooperBoxes: 2,
      prizeValueMean: 8,
      prizeValueVar: 6,
    });
    expect(r.expectedReveals).toBeCloseTo(10 / 3, 6);
    expect(r.probZeroReveals).toBeCloseTo(2 / 12, 6);
  });
  it('NetEnt Gonzo bonus (N=15 K=3) — E[T] = 12/4 = 3.0, P(reach ≥ 5) ≈ multi-pick rare', () => {
    const cfg: PickClickPooperBonusConfig = {
      totalBoxes: 15,
      pooperBoxes: 3,
      prizeValueMean: 6,
      prizeValueVar: 4,
      disclosureRevealThresholds: [1, 3, 5],
    };
    const r = analyzePickClickPooperBonus(cfg);
    expect(r.expectedReveals).toBeCloseTo(3.0, 6);
    expect(r.survivalAtThresholds.length).toBe(3);
    expect(r.survivalAtThresholds[0].probAtLeastK).toBeGreaterThan(
      r.survivalAtThresholds[2].probAtLeastK,
    );
  });
});
