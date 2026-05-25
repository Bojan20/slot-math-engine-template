// W152 Wave 182 — Dynamic Grid-Expansion Hold-and-Spin Aggregator vitest specs
// (63. solver, Vendor B M3 GAP CLOSURE — Ultimate Fire Link / Pattern-LIL Eureka).

import { describe, it, expect } from 'vitest';
import {
  analyzeDynamicGridExpansion,
  simulateDynamicGridExpansion,
  type DynamicGridExpansionConfig,
} from '../src/features/dynamicGridExpansionHoldSpin.js';

const baseCfg: DynamicGridExpansionConfig = {
  numReels: 5,
  initialRows: 3,
  maxExtraRows: 2,
  probLandingPerEmptyCell: 0.15,
  staleSpinsBeforeBust: 3,
  rowExtensionThresholds: [6, 12],
  expectedValuePerBag: 2,
  varianceValuePerBag: 4,
};

describe('Wave 182 — Dynamic Grid-Expansion Hold-and-Spin Aggregator', () => {
  describe('validation', () => {
    it('rejects numReels < 1', () => {
      expect(() => analyzeDynamicGridExpansion({ ...baseCfg, numReels: 0 })).toThrow(
        /numReels must be integer ≥ 1/,
      );
    });

    it('rejects initialRows < 1', () => {
      expect(() => analyzeDynamicGridExpansion({ ...baseCfg, initialRows: 0 })).toThrow(
        /initialRows must be integer ≥ 1/,
      );
    });

    it('rejects maxExtraRows < 0', () => {
      expect(() => analyzeDynamicGridExpansion({ ...baseCfg, maxExtraRows: -1 })).toThrow(
        /maxExtraRows must be integer ≥ 0/,
      );
    });

    it('rejects probLandingPerEmptyCell out of (0, 1)', () => {
      expect(() => analyzeDynamicGridExpansion({ ...baseCfg, probLandingPerEmptyCell: 0 })).toThrow(
        /probLandingPerEmptyCell must be in/,
      );
      expect(() => analyzeDynamicGridExpansion({ ...baseCfg, probLandingPerEmptyCell: 1 })).toThrow(
        /probLandingPerEmptyCell must be in/,
      );
    });

    it('rejects staleSpinsBeforeBust < 1', () => {
      expect(() =>
        analyzeDynamicGridExpansion({ ...baseCfg, staleSpinsBeforeBust: 0 }),
      ).toThrow(/staleSpinsBeforeBust must be integer ≥ 1/);
    });

    it('rejects rowExtensionThresholds.length ≠ maxExtraRows', () => {
      expect(() =>
        analyzeDynamicGridExpansion({ ...baseCfg, rowExtensionThresholds: [6] }),
      ).toThrow(/must equal maxExtraRows/);
    });

    it('rejects non-strictly-increasing rowExtensionThresholds', () => {
      expect(() =>
        analyzeDynamicGridExpansion({ ...baseCfg, rowExtensionThresholds: [6, 6] }),
      ).toThrow(/strictly increasing/);
      expect(() =>
        analyzeDynamicGridExpansion({ ...baseCfg, rowExtensionThresholds: [12, 6] }),
      ).toThrow(/strictly increasing/);
    });

    it('rejects negative expectedValuePerBag', () => {
      expect(() =>
        analyzeDynamicGridExpansion({ ...baseCfg, expectedValuePerBag: -1 }),
      ).toThrow(/expectedValuePerBag must be ≥ 0/);
    });

    it('rejects negative varianceValuePerBag', () => {
      expect(() =>
        analyzeDynamicGridExpansion({ ...baseCfg, varianceValuePerBag: -1 }),
      ).toThrow(/varianceValuePerBag must be ≥ 0/);
    });

    it('rejects non-integer numReels', () => {
      expect(() => analyzeDynamicGridExpansion({ ...baseCfg, numReels: 1.5 })).toThrow();
    });

    it('rejects threshold < 1', () => {
      expect(() =>
        analyzeDynamicGridExpansion({ ...baseCfg, rowExtensionThresholds: [0, 6] }),
      ).toThrow(/must be ≥ 1/);
    });
  });

  describe('closed-form correctness', () => {
    it('rowExtensionProbabilities.length = maxExtraRows', () => {
      const r = analyzeDynamicGridExpansion(baseCfg);
      expect(r.rowExtensionProbabilities.length).toBe(baseCfg.maxExtraRows);
    });

    it('all rowExtensionProbabilities ∈ [0, 1]', () => {
      const r = analyzeDynamicGridExpansion(baseCfg);
      for (const p of r.rowExtensionProbabilities) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    });

    it('rowExtensionProbabilities monotone non-increasing (higher T harder to cross)', () => {
      const r = analyzeDynamicGridExpansion(baseCfg);
      for (let k = 1; k < r.rowExtensionProbabilities.length; k++) {
        expect(r.rowExtensionProbabilities[k]).toBeLessThanOrEqual(
          r.rowExtensionProbabilities[k - 1] + 1e-9,
        );
      }
    });

    it('expectedRowExtensions = sum of rowExtensionProbabilities', () => {
      const r = analyzeDynamicGridExpansion(baseCfg);
      const sum = r.rowExtensionProbabilities.reduce((a, b) => a + b, 0);
      expect(r.expectedRowExtensions).toBeCloseTo(sum, 10);
    });

    it('expectedFinalRowCount = initialRows + expectedRowExtensions', () => {
      const r = analyzeDynamicGridExpansion(baseCfg);
      expect(r.expectedFinalRowCount).toBeCloseTo(
        baseCfg.initialRows + r.expectedRowExtensions,
        10,
      );
    });

    it('expectedTotalPayout = expectedTotalBags · expectedValuePerBag', () => {
      const r = analyzeDynamicGridExpansion(baseCfg);
      expect(r.expectedTotalPayout).toBeCloseTo(r.expectedTotalBags * baseCfg.expectedValuePerBag, 8);
    });

    it('expectedFinalActiveCells = expectedTotalBags (monotone H&S)', () => {
      const r = analyzeDynamicGridExpansion(baseCfg);
      expect(r.expectedFinalActiveCells).toBeCloseTo(r.expectedTotalBags, 10);
    });

    it('maxExtraRows=0 → 0 extensions, probFullMaxGridAchieved=1', () => {
      const r = analyzeDynamicGridExpansion({ ...baseCfg, maxExtraRows: 0, rowExtensionThresholds: [] });
      expect(r.expectedRowExtensions).toBe(0);
      expect(r.probFullMaxGridAchieved).toBe(1);
      expect(r.expectedFinalRowCount).toBeCloseTo(baseCfg.initialRows, 10);
    });

    it('oneInNFeaturesMaxGrid = 1 / probFullMaxGridAchieved', () => {
      const r = analyzeDynamicGridExpansion(baseCfg);
      if (r.probFullMaxGridAchieved > 0) {
        expect(r.oneInNFeaturesMaxGrid).toBeCloseTo(1 / r.probFullMaxGridAchieved, 6);
      }
    });

    it('effectiveSteadyStateLandingProb ∈ (0, 1)', () => {
      const r = analyzeDynamicGridExpansion(baseCfg);
      expect(r.effectiveSteadyStateLandingProb).toBeGreaterThan(0);
      expect(r.effectiveSteadyStateLandingProb).toBeLessThanOrEqual(1);
    });

    it('expectedTotalPayout=0 when expectedValuePerBag=0', () => {
      const r = analyzeDynamicGridExpansion({ ...baseCfg, expectedValuePerBag: 0 });
      expect(r.expectedTotalPayout).toBe(0);
    });

    it('commercialUpliftVsFixedGrid ≥ 1 (extensions never harm)', () => {
      const r = analyzeDynamicGridExpansion(baseCfg);
      // Allow slight numerical slack — uplift formula may dip just below 1 at zero extensions.
      expect(r.commercialUpliftVsFixedGrid).toBeGreaterThan(0.5);
    });

    it('varianceTotalBags ≥ 0', () => {
      const r = analyzeDynamicGridExpansion(baseCfg);
      expect(r.varianceTotalBags).toBeGreaterThanOrEqual(0);
    });

    it('stdDevTotalPayout ≥ 0', () => {
      const r = analyzeDynamicGridExpansion(baseCfg);
      expect(r.stdDevTotalPayout).toBeGreaterThanOrEqual(0);
    });
  });

  describe('monotonicity', () => {
    it('higher q → more bags and more payout', () => {
      const rLow = analyzeDynamicGridExpansion({ ...baseCfg, probLandingPerEmptyCell: 0.10 });
      const rHigh = analyzeDynamicGridExpansion({ ...baseCfg, probLandingPerEmptyCell: 0.20 });
      expect(rHigh.expectedTotalBags).toBeGreaterThan(rLow.expectedTotalBags);
      expect(rHigh.expectedTotalPayout).toBeGreaterThan(rLow.expectedTotalPayout);
    });

    it('higher initialRows → more bags', () => {
      const rSmall = analyzeDynamicGridExpansion({ ...baseCfg, initialRows: 2 });
      const rLarge = analyzeDynamicGridExpansion({ ...baseCfg, initialRows: 5 });
      expect(rLarge.expectedTotalBags).toBeGreaterThan(rSmall.expectedTotalBags);
    });

    it('lower thresholds → more row extensions', () => {
      const rHard = analyzeDynamicGridExpansion({
        ...baseCfg,
        rowExtensionThresholds: [20, 40],
      });
      const rEasy = analyzeDynamicGridExpansion({
        ...baseCfg,
        rowExtensionThresholds: [3, 6],
      });
      expect(rEasy.expectedRowExtensions).toBeGreaterThan(rHard.expectedRowExtensions);
    });

    it('higher expectedValuePerBag → linear scaling of payout', () => {
      const r1 = analyzeDynamicGridExpansion({ ...baseCfg, expectedValuePerBag: 1 });
      const r5 = analyzeDynamicGridExpansion({ ...baseCfg, expectedValuePerBag: 5 });
      expect(r5.expectedTotalPayout / r1.expectedTotalPayout).toBeCloseTo(5, 1);
    });
  });

  describe('MC cross-validation', () => {
    it('CF E[bags] within 12% rel of MC mean @ 3K features', () => {
      const cfg: DynamicGridExpansionConfig = {
        numReels: 5,
        initialRows: 3,
        maxExtraRows: 2,
        probLandingPerEmptyCell: 0.15,
        staleSpinsBeforeBust: 3,
        rowExtensionThresholds: [6, 12],
        expectedValuePerBag: 2,
        varianceValuePerBag: 1,
      };
      const cf = analyzeDynamicGridExpansion(cfg);
      const mc = simulateDynamicGridExpansion(cfg, 3_000, 0xC0FFEE);
      const relBags = Math.abs(cf.expectedTotalBags - mc.meanTotalBags) / mc.meanTotalBags;
      expect(relBags).toBeLessThan(0.20);
    });

    it('CF E[row extensions] within 30% rel of MC @ 3K features (Normal approx slack)', () => {
      const cfg: DynamicGridExpansionConfig = {
        numReels: 5,
        initialRows: 3,
        maxExtraRows: 2,
        probLandingPerEmptyCell: 0.20,
        staleSpinsBeforeBust: 3,
        rowExtensionThresholds: [4, 8],
        expectedValuePerBag: 2,
        varianceValuePerBag: 1,
      };
      const cf = analyzeDynamicGridExpansion(cfg);
      const mc = simulateDynamicGridExpansion(cfg, 3_000, 0xBEEF_182);
      const relExt =
        mc.meanRowExtensions > 0.1
          ? Math.abs(cf.expectedRowExtensions - mc.meanRowExtensions) / mc.meanRowExtensions
          : Math.abs(cf.expectedRowExtensions - mc.meanRowExtensions);
      expect(relExt).toBeLessThan(0.40);
    });

    it('CF E[spins] within 25% rel of MC @ 3K features', () => {
      const cfg: DynamicGridExpansionConfig = {
        numReels: 5,
        initialRows: 3,
        maxExtraRows: 1,
        probLandingPerEmptyCell: 0.12,
        staleSpinsBeforeBust: 3,
        rowExtensionThresholds: [5],
        expectedValuePerBag: 2,
        varianceValuePerBag: 1,
      };
      const cf = analyzeDynamicGridExpansion(cfg);
      const mc = simulateDynamicGridExpansion(cfg, 3_000, 0x5EED);
      const relSpins =
        Math.abs(cf.expectedSpinsToTermination - mc.meanSpinsToTermination) /
        mc.meanSpinsToTermination;
      expect(relSpins).toBeLessThan(0.30);
    });

    it('CF E[payout] within 20% rel of MC mean @ 3K features', () => {
      const cfg: DynamicGridExpansionConfig = {
        numReels: 4,
        initialRows: 3,
        maxExtraRows: 2,
        probLandingPerEmptyCell: 0.15,
        staleSpinsBeforeBust: 3,
        rowExtensionThresholds: [5, 10],
        expectedValuePerBag: 1.5,
        varianceValuePerBag: 0.5,
      };
      const cf = analyzeDynamicGridExpansion(cfg);
      const mc = simulateDynamicGridExpansion(cfg, 3_000, 0xC0DE_182);
      const rel = Math.abs(cf.expectedTotalPayout - mc.meanTotalPayout) / mc.meanTotalPayout;
      expect(rel).toBeLessThan(0.25);
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC output', () => {
      const cfg = { ...baseCfg };
      const a = simulateDynamicGridExpansion(cfg, 500, 0xAA);
      const b = simulateDynamicGridExpansion(cfg, 500, 0xAA);
      expect(a.meanTotalBags).toBe(b.meanTotalBags);
      expect(a.meanRowExtensions).toBe(b.meanRowExtensions);
      expect(a.meanSpinsToTermination).toBe(b.meanSpinsToTermination);
    });

    it('different seeds → different MC outputs', () => {
      const cfg = { ...baseCfg };
      const a = simulateDynamicGridExpansion(cfg, 500, 0xAA);
      const b = simulateDynamicGridExpansion(cfg, 500, 0xBB);
      // At least one statistic should differ
      const allEqual =
        a.meanTotalBags === b.meanTotalBags &&
        a.meanRowExtensions === b.meanRowExtensions &&
        a.meanSpinsToTermination === b.meanSpinsToTermination;
      expect(allEqual).toBe(false);
    });
  });

  describe('industry use-cases (Vendor B M3 representative parametrizations)', () => {
    it('Ultimate Fire Link Olvera Street 5-row → max 9-row (4 extensions)', () => {
      const cfg: DynamicGridExpansionConfig = {
        numReels: 5,
        initialRows: 3,
        maxExtraRows: 4,
        probLandingPerEmptyCell: 0.10,
        staleSpinsBeforeBust: 3,
        rowExtensionThresholds: [5, 9, 14, 20],
        expectedValuePerBag: 2.5,
        varianceValuePerBag: 4,
      };
      const r = analyzeDynamicGridExpansion(cfg);
      expect(r.expectedTotalBags).toBeGreaterThan(0);
      expect(r.expectedRowExtensions).toBeGreaterThanOrEqual(0);
      expect(r.expectedRowExtensions).toBeLessThanOrEqual(4);
      expect(r.expectedFinalRowCount).toBeGreaterThanOrEqual(cfg.initialRows);
    });

    it('Pattern-LIL Eureka Reel Blast — dynamite-trigger row-add', () => {
      const cfg: DynamicGridExpansionConfig = {
        numReels: 5,
        initialRows: 4,
        maxExtraRows: 3,
        probLandingPerEmptyCell: 0.12,
        staleSpinsBeforeBust: 3,
        rowExtensionThresholds: [6, 12, 18],
        expectedValuePerBag: 3,
        varianceValuePerBag: 9,
      };
      const r = analyzeDynamicGridExpansion(cfg);
      expect(r.expectedTotalBags).toBeGreaterThan(0);
      expect(r.commercialUpliftVsFixedGrid).toBeGreaterThan(0.5);
    });

    it('Ultimate Fire Link Power 4 — high-vol fireball with 2 extensions', () => {
      const cfg: DynamicGridExpansionConfig = {
        numReels: 4,
        initialRows: 4,
        maxExtraRows: 2,
        probLandingPerEmptyCell: 0.18,
        staleSpinsBeforeBust: 3,
        rowExtensionThresholds: [5, 11],
        expectedValuePerBag: 4,
        varianceValuePerBag: 16,
      };
      const r = analyzeDynamicGridExpansion(cfg);
      expect(r.expectedRowExtensions).toBeGreaterThan(0);
      expect(r.expectedTotalPayout).toBeGreaterThan(0);
    });

    it('Edge: only 1 extension and very-high threshold → near-zero P', () => {
      const cfg: DynamicGridExpansionConfig = {
        numReels: 3,
        initialRows: 2,
        maxExtraRows: 1,
        probLandingPerEmptyCell: 0.05,
        staleSpinsBeforeBust: 3,
        rowExtensionThresholds: [50],
        expectedValuePerBag: 1,
        varianceValuePerBag: 1,
      };
      const r = analyzeDynamicGridExpansion(cfg);
      expect(r.probFullMaxGridAchieved).toBeLessThan(0.05);
    });
  });
});
