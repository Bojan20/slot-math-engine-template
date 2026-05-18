// W152 Wave 196 — Stacked Multi-Wheel Composition vitest specs
// (77. solver, L&W M6 P1 FINAL GAP CLOSURE — Bally Triple Cash Wheel + Quick Hit Cash Wheel family).
// **16/16 L&W KIMI gaps now closed.** 🏆

import { describe, it, expect } from 'vitest';
import {
  analyzeStackedMultiWheelComposition,
  simulateStackedMultiWheelComposition,
  type StackedMultiWheelCompositionConfig,
} from '../src/features/stackedMultiWheelComposition.js';

const baseCfg: StackedMultiWheelCompositionConfig = {
  wheels: [
    {
      label: 'wheel_1',
      slices: [
        { label: 'low', probability: 0.5, payout: 2 },
        { label: 'med', probability: 0.3, payout: 5 },
        { label: 'high', probability: 0.15, payout: 10 },
        { label: 'top', probability: 0.05, payout: 50 },
      ],
    },
    {
      label: 'wheel_2',
      slices: [
        { label: 'low', probability: 0.4, payout: 3 },
        { label: 'med', probability: 0.35, payout: 8 },
        { label: 'high', probability: 0.2, payout: 20 },
        { label: 'top', probability: 0.05, payout: 100 },
      ],
    },
    {
      label: 'wheel_3',
      slices: [
        { label: 'low', probability: 0.35, payout: 5 },
        { label: 'med', probability: 0.4, payout: 12 },
        { label: 'high', probability: 0.2, payout: 30 },
        { label: 'top', probability: 0.05, payout: 200 },
      ],
    },
  ],
};

describe('Wave 196 — Stacked Multi-Wheel Composition (FINAL L&W GAP)', () => {
  describe('validation', () => {
    it('rejects fewer than 2 wheels', () => {
      expect(() => analyzeStackedMultiWheelComposition({ wheels: [] })).toThrow();
      expect(() =>
        analyzeStackedMultiWheelComposition({
          wheels: [{ slices: [{ probability: 1, payout: 1 }, { probability: 0, payout: 5 }] }],
        }),
      ).toThrow();
    });
    it('rejects fewer than 2 slices per wheel', () => {
      expect(() =>
        analyzeStackedMultiWheelComposition({
          wheels: [
            { slices: [{ probability: 1, payout: 1 }] },
            { slices: [{ probability: 0.5, payout: 1 }, { probability: 0.5, payout: 2 }] },
          ],
        }),
      ).toThrow();
    });
    it('rejects probabilities not summing to 1', () => {
      expect(() =>
        analyzeStackedMultiWheelComposition({
          wheels: [
            { slices: [{ probability: 0.5, payout: 1 }, { probability: 0.3, payout: 2 }] },
            { slices: [{ probability: 0.5, payout: 1 }, { probability: 0.5, payout: 2 }] },
          ],
        }),
      ).toThrow();
    });
    it('rejects negative payout / out-of-range probability', () => {
      expect(() =>
        analyzeStackedMultiWheelComposition({
          wheels: [
            { slices: [{ probability: 0.5, payout: -1 }, { probability: 0.5, payout: 2 }] },
            { slices: [{ probability: 0.5, payout: 1 }, { probability: 0.5, payout: 2 }] },
          ],
        }),
      ).toThrow();
      expect(() =>
        analyzeStackedMultiWheelComposition({
          wheels: [
            { slices: [{ probability: 1.5, payout: 1 }, { probability: -0.5, payout: 2 }] },
            { slices: [{ probability: 0.5, payout: 1 }, { probability: 0.5, payout: 2 }] },
          ],
        }),
      ).toThrow();
    });
  });

  describe('closed-form correctness', () => {
    it('E[Y] = Σ μ_i (linearity)', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      const expected = r.perWheel.reduce((acc, wd) => acc + wd.expectedPayout, 0);
      expect(r.expectedTotalPayout).toBeCloseTo(expected, 9);
    });
    it('Var[Y] = Σ σ²_i (independence)', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      const expected = r.perWheel.reduce((acc, wd) => acc + wd.variancePayout, 0);
      expect(r.varianceTotalPayout).toBeCloseTo(expected, 9);
    });
    it('per-wheel μ_i = Σ p_{i,j} · V_{i,j}', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      for (let i = 0; i < baseCfg.wheels.length; i++) {
        const expected = baseCfg.wheels[i]!.slices.reduce(
          (acc, sl) => acc + sl.probability * sl.payout, 0,
        );
        expect(r.perWheel[i]!.expectedPayout).toBeCloseTo(expected, 9);
      }
    });
    it('per-wheel σ²_i = E[W²] − μ²', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      for (let i = 0; i < baseCfg.wheels.length; i++) {
        const w = baseCfg.wheels[i]!;
        const mu = w.slices.reduce((acc, sl) => acc + sl.probability * sl.payout, 0);
        const e2 = w.slices.reduce((acc, sl) => acc + sl.probability * sl.payout * sl.payout, 0);
        const variance = Math.max(0, e2 - mu * mu);
        expect(r.perWheel[i]!.variancePayout).toBeCloseTo(variance, 6);
      }
    });
    it('contributionToTotalRtp sums to 1', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      const sum = r.perWheel.reduce((acc, wd) => acc + wd.contributionToTotalRtp, 0);
      expect(sum).toBeCloseTo(1, 9);
    });
    it('varianceContribution sums to 1', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      const sum = r.perWheel.reduce((acc, wd) => acc + wd.varianceContribution, 0);
      expect(sum).toBeCloseTo(1, 9);
    });
    it('exactly one wheel has isBestWheel = true', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      expect(r.perWheel.filter((wd) => wd.isBestWheel).length).toBe(1);
    });
    it('per-wheel exactly one slice has isTopSlice = true', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      for (const wd of r.perWheel) {
        expect(wd.slices.filter((s) => s.isTopSlice).length).toBe(1);
      }
    });
    it('probabilityAllTopSlice = Π p_{i,top}', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      const expected = r.perWheel.reduce((acc, wd) => acc * wd.topSliceProbability, 1);
      expect(r.probabilityAllTopSlice).toBeCloseTo(expected, 12);
    });
    it('probabilityAtLeastOneTopSlice = 1 − Π (1−p_{i,top})', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      const expected = 1 - r.perWheel.reduce((acc, wd) => acc * (1 - wd.topSliceProbability), 1);
      expect(r.probabilityAtLeastOneTopSlice).toBeCloseTo(expected, 9);
    });
    it('oneInNSpinsAllTopJackpot = 1 / Π p_{i,top}', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      expect(r.oneInNSpinsAllTopJackpot).toBeCloseTo(1 / r.probabilityAllTopSlice, 0);
    });
    it('commercialUpliftVsSingleWheel = E[Y] / μ_best', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      const muBest = r.perWheel[r.bestWheelIndex]!.expectedPayout;
      expect(r.commercialUpliftVsSingleWheel).toBeCloseTo(r.expectedTotalPayout / muBest, 9);
    });
    it('independenceVarianceRatio = σ_Y / Σ σ_i (< 1 for independent wheels)', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      const expected = r.stdDevTotalPayout / r.sumStdDevs;
      expect(r.independenceVarianceRatio).toBeCloseTo(expected, 9);
      expect(r.independenceVarianceRatio).toBeLessThan(1); // independence shrinkage
    });
    it('identical wheels → independenceVarianceRatio = 1/√N', () => {
      const slice = [
        { probability: 0.5, payout: 5 },
        { probability: 0.5, payout: 15 },
      ];
      const cfg: StackedMultiWheelCompositionConfig = {
        wheels: [{ slices: slice }, { slices: slice }, { slices: slice }, { slices: slice }],
      };
      const r = analyzeStackedMultiWheelComposition(cfg);
      expect(r.independenceVarianceRatio).toBeCloseTo(1 / Math.sqrt(4), 6);
    });
    it('all slices identical → variance = 0', () => {
      const cfg: StackedMultiWheelCompositionConfig = {
        wheels: [
          { slices: [{ probability: 0.5, payout: 10 }, { probability: 0.5, payout: 10 }] },
          { slices: [{ probability: 0.5, payout: 10 }, { probability: 0.5, payout: 10 }] },
        ],
      };
      const r = analyzeStackedMultiWheelComposition(cfg);
      expect(r.varianceTotalPayout).toBeCloseTo(0, 9);
      expect(r.expectedTotalPayout).toBeCloseTo(20, 9);
    });
  });

  describe('monotonicity', () => {
    it('adding a wheel → higher E[Y]', () => {
      const r1 = analyzeStackedMultiWheelComposition({
        wheels: [baseCfg.wheels[0]!, baseCfg.wheels[1]!],
      });
      const r2 = analyzeStackedMultiWheelComposition(baseCfg);
      expect(r2.expectedTotalPayout).toBeGreaterThan(r1.expectedTotalPayout);
    });
    it('higher slice payouts → higher E[Y]', () => {
      const cfg2: StackedMultiWheelCompositionConfig = {
        wheels: baseCfg.wheels.map((w) => ({
          ...w,
          slices: w.slices.map((sl) => ({ ...sl, payout: sl.payout * 2 })),
        })),
      };
      const r1 = analyzeStackedMultiWheelComposition(baseCfg);
      const r2 = analyzeStackedMultiWheelComposition(cfg2);
      expect(r2.expectedTotalPayout).toBeCloseTo(2 * r1.expectedTotalPayout, 6);
    });
    it('shifting probability to top slice → higher E[Y]', () => {
      const cfg2: StackedMultiWheelCompositionConfig = {
        wheels: [
          {
            slices: [
              { probability: 0.4, payout: 2 }, // was 0.5
              { probability: 0.3, payout: 5 },
              { probability: 0.15, payout: 10 },
              { probability: 0.15, payout: 50 }, // was 0.05 — boost top
            ],
          },
          baseCfg.wheels[1]!,
          baseCfg.wheels[2]!,
        ],
      };
      const r1 = analyzeStackedMultiWheelComposition(baseCfg);
      const r2 = analyzeStackedMultiWheelComposition(cfg2);
      expect(r2.expectedTotalPayout).toBeGreaterThan(r1.expectedTotalPayout);
    });
  });

  describe('MC cross-validation', () => {
    const tightCfg: StackedMultiWheelCompositionConfig = {
      wheels: [
        { label: 'w1', slices: [
          { probability: 0.6, payout: 3 },
          { probability: 0.3, payout: 8 },
          { probability: 0.1, payout: 40 },
        ] },
        { label: 'w2', slices: [
          { probability: 0.5, payout: 4 },
          { probability: 0.4, payout: 10 },
          { probability: 0.1, payout: 50 },
        ] },
        { label: 'w3', slices: [
          { probability: 0.4, payout: 5 },
          { probability: 0.5, payout: 12 },
          { probability: 0.1, payout: 80 },
        ] },
      ],
    };

    it('CF E[Y/spin] within 3% rel of MC mean @ 100K spins', () => {
      const cf = analyzeStackedMultiWheelComposition(tightCfg);
      const mc = simulateStackedMultiWheelComposition(tightCfg, 100_000, 0xC0FFEE);
      const rel = Math.abs(cf.expectedTotalPayout - mc.meanTotalPayout) /
        Math.max(mc.meanTotalPayout, 1e-9);
      expect(rel).toBeLessThan(0.03);
    });
    it('per-wheel MC means within 5% rel of CF', () => {
      const cf = analyzeStackedMultiWheelComposition(tightCfg);
      const mc = simulateStackedMultiWheelComposition(tightCfg, 100_000, 0xBEEF_196);
      for (let i = 0; i < cf.numWheels; i++) {
        const rel = Math.abs(cf.perWheel[i]!.expectedPayout - mc.perWheelMeans[i]!) /
          Math.max(mc.perWheelMeans[i]!, 1e-9);
        expect(rel).toBeLessThan(0.05);
      }
    });
    it('observed P(all top) within 1pp abs of CF (large N spins)', () => {
      const cf = analyzeStackedMultiWheelComposition(tightCfg);
      const mc = simulateStackedMultiWheelComposition(tightCfg, 500_000, 0xCAFE);
      expect(Math.abs(cf.probabilityAllTopSlice - mc.observedAllTopSliceRate)).toBeLessThan(0.005);
    });
    it('observed P(at least one top) within 2pp abs of CF', () => {
      const cf = analyzeStackedMultiWheelComposition(tightCfg);
      const mc = simulateStackedMultiWheelComposition(tightCfg, 100_000, 0xFEED);
      expect(
        Math.abs(cf.probabilityAtLeastOneTopSlice - mc.observedAtLeastOneTopSliceRate),
      ).toBeLessThan(0.02);
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC', () => {
      const a = simulateStackedMultiWheelComposition(baseCfg, 500, 0xAA);
      const b = simulateStackedMultiWheelComposition(baseCfg, 500, 0xAA);
      expect(a.meanTotalPayout).toBe(b.meanTotalPayout);
    });
    it('different seeds → different MC', () => {
      const a = simulateStackedMultiWheelComposition(baseCfg, 500, 0xAA);
      const b = simulateStackedMultiWheelComposition(baseCfg, 500, 0xBB);
      expect(a.meanTotalPayout !== b.meanTotalPayout).toBe(true);
    });
  });

  describe('industry use-cases (L&W M6 Triple Cash Wheel family)', () => {
    it('Bally Triple Cash Wheel — 3 stacked wheels', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      expect(r.numWheels).toBe(3);
      expect(r.expectedTotalPayout).toBeGreaterThan(0);
      expect(r.varianceTotalPayout).toBeGreaterThan(0);
    });
    it('Quick Hit Cash Wheel — wheel composition mechanism', () => {
      const cfg: StackedMultiWheelCompositionConfig = {
        wheels: [
          { label: 'cash_wheel', slices: [
            { label: 'mini',  probability: 0.50, payout: 5 },
            { label: 'minor', probability: 0.30, payout: 20 },
            { label: 'major', probability: 0.15, payout: 100 },
            { label: 'grand', probability: 0.05, payout: 1000 },
          ] },
          { label: 'multiplier_wheel', slices: [
            { label: '1x', probability: 0.5, payout: 1 },
            { label: '2x', probability: 0.3, payout: 2 },
            { label: '5x', probability: 0.15, payout: 5 },
            { label: '10x', probability: 0.05, payout: 10 },
          ] },
        ],
      };
      const r = analyzeStackedMultiWheelComposition(cfg);
      expect(r.numWheels).toBe(2);
      expect(r.probabilityAllTopSlice).toBeCloseTo(0.05 * 0.05, 9);
      expect(r.oneInNSpinsAllTopJackpot).toBeCloseTo(400, 0);
    });
    it('joint grand jackpot rare (Π all-top)', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      expect(r.probabilityAllTopSlice).toBeCloseTo(0.05 * 0.05 * 0.05, 9);
      expect(r.oneInNSpinsAllTopJackpot).toBeCloseTo(1 / (0.05 ** 3), 0);
    });
    it('UKGC RTS-14 disclosure: per-wheel contribution + top-slice + 1-in-N', () => {
      const r = analyzeStackedMultiWheelComposition(baseCfg);
      for (const wd of r.perWheel) {
        expect(wd.contributionToTotalRtp).toBeGreaterThan(0);
        expect(wd.topSliceProbability).toBeGreaterThan(0);
        expect(wd.oneInNSpinsForThisWheelTopSlice).toBeGreaterThan(1);
      }
    });
    it('edge: 5-wheel stack', () => {
      const wheel = baseCfg.wheels[0]!;
      const cfg: StackedMultiWheelCompositionConfig = {
        wheels: [wheel, wheel, wheel, wheel, wheel],
      };
      const r = analyzeStackedMultiWheelComposition(cfg);
      expect(r.numWheels).toBe(5);
      // Identical 5 wheels: P(all top) = 0.05^5
      expect(r.probabilityAllTopSlice).toBeCloseTo(0.05 ** 5, 12);
    });
  });
});
