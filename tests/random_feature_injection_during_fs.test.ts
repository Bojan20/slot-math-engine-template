// W152 Wave 189 — Random Feature-Injection During FS vitest specs
// (70. solver, Vendor B M12 P1 GAP CLOSURE — Wizard of Oz Munchkinland).

import { describe, it, expect } from 'vitest';
import {
  analyzeRandomFeatureInjectionDuringFs,
  simulateRandomFeatureInjectionDuringFs,
  type RandomFeatureInjectionDuringFsConfig,
} from '../src/features/randomFeatureInjectionDuringFs.js';

const baseCfg: RandomFeatureInjectionDuringFsConfig = {
  numFreeSpins: 10,
  baseFsWinMean: 1.5,
  baseFsWinVar: 4,
  probInjectionPerFsSpin: 0.15,
  subFeatureMean: 8,
  subFeatureVar: 16,
  topTierSubFeatureShare: 0.1,
};

describe('Wave 189 — Random Feature-Injection During FS', () => {
  describe('validation', () => {
    it('rejects numFreeSpins < 1', () => {
      expect(() => analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, numFreeSpins: 0 })).toThrow();
    });
    it('rejects probInjection outside (0,1)', () => {
      expect(() =>
        analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, probInjectionPerFsSpin: 0 }),
      ).toThrow();
      expect(() =>
        analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, probInjectionPerFsSpin: 1 }),
      ).toThrow();
    });
    it('rejects negative baseFsWinMean', () => {
      expect(() =>
        analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, baseFsWinMean: -1 }),
      ).toThrow();
    });
    it('rejects negative subFeatureVar', () => {
      expect(() =>
        analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, subFeatureVar: -1 }),
      ).toThrow();
    });
    it('rejects topTierShare outside [0,1]', () => {
      expect(() =>
        analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, topTierSubFeatureShare: 1.5 }),
      ).toThrow();
    });
  });

  describe('closed-form correctness', () => {
    it('expectedTotalFsPayout = N·μ_Y + N·p·μ_V', () => {
      const r = analyzeRandomFeatureInjectionDuringFs(baseCfg);
      const expected =
        baseCfg.numFreeSpins * baseCfg.baseFsWinMean +
        baseCfg.numFreeSpins * baseCfg.probInjectionPerFsSpin * baseCfg.subFeatureMean;
      expect(r.expectedTotalFsPayout).toBeCloseTo(expected, 9);
    });

    it('varianceTotalFsPayout = N·σ²_Y + N·p·σ²_V + N·p(1-p)·μ²_V', () => {
      const r = analyzeRandomFeatureInjectionDuringFs(baseCfg);
      const N = baseCfg.numFreeSpins;
      const p = baseCfg.probInjectionPerFsSpin;
      const expected =
        N * baseCfg.baseFsWinVar +
        N * p * baseCfg.subFeatureVar +
        N * p * (1 - p) * baseCfg.subFeatureMean * baseCfg.subFeatureMean;
      expect(r.varianceTotalFsPayout).toBeCloseTo(expected, 9);
    });

    it('expectedInjectionsPerFsBonus = N·p', () => {
      const r = analyzeRandomFeatureInjectionDuringFs(baseCfg);
      expect(r.expectedInjectionsPerFsBonus).toBeCloseTo(
        baseCfg.numFreeSpins * baseCfg.probInjectionPerFsSpin,
        9,
      );
    });

    it('probAtLeastOneInjection = 1 − (1−p)^N', () => {
      const r = analyzeRandomFeatureInjectionDuringFs(baseCfg);
      const expected =
        1 - Math.pow(1 - baseCfg.probInjectionPerFsSpin, baseCfg.numFreeSpins);
      expect(r.probAtLeastOneInjection).toBeCloseTo(expected, 9);
    });

    it('probNoInjection + probAtLeastOneInjection = 1', () => {
      const r = analyzeRandomFeatureInjectionDuringFs(baseCfg);
      expect(r.probNoInjection + r.probAtLeastOneInjection).toBeCloseTo(1, 9);
    });

    it('oneInNFsBonusWithoutInjection = 1 / probAtLeastOne', () => {
      const r = analyzeRandomFeatureInjectionDuringFs(baseCfg);
      expect(r.oneInNFsBonusWithoutInjection).toBeCloseTo(1 / r.probAtLeastOneInjection, 6);
    });

    it('expectedBaseFsContribution = N·μ_Y', () => {
      const r = analyzeRandomFeatureInjectionDuringFs(baseCfg);
      expect(r.expectedBaseFsContribution).toBeCloseTo(
        baseCfg.numFreeSpins * baseCfg.baseFsWinMean,
        9,
      );
    });

    it('expectedInjectionContribution = N·p·μ_V', () => {
      const r = analyzeRandomFeatureInjectionDuringFs(baseCfg);
      expect(r.expectedInjectionContribution).toBeCloseTo(
        baseCfg.numFreeSpins * baseCfg.probInjectionPerFsSpin * baseCfg.subFeatureMean,
        9,
      );
    });

    it('base + injection contributions = total', () => {
      const r = analyzeRandomFeatureInjectionDuringFs(baseCfg);
      expect(
        r.expectedBaseFsContribution + r.expectedInjectionContribution,
      ).toBeCloseTo(r.expectedTotalFsPayout, 9);
    });

    it('injectionContributionShareOfFs ∈ [0, 1]', () => {
      const r = analyzeRandomFeatureInjectionDuringFs(baseCfg);
      expect(r.injectionContributionShareOfFs).toBeGreaterThanOrEqual(0);
      expect(r.injectionContributionShareOfFs).toBeLessThanOrEqual(1);
    });

    it('commercialUpliftVsBaseFs = 1 + p·μ_V/μ_Y', () => {
      const r = analyzeRandomFeatureInjectionDuringFs(baseCfg);
      const expected =
        1 +
        (baseCfg.probInjectionPerFsSpin * baseCfg.subFeatureMean) / baseCfg.baseFsWinMean;
      expect(r.commercialUpliftVsBaseFs).toBeCloseTo(expected, 9);
    });

    it('μ_Y = 0 → all payout from injection', () => {
      const r = analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, baseFsWinMean: 0 });
      expect(r.expectedBaseFsContribution).toBeCloseTo(0, 9);
      expect(r.injectionContributionShareOfFs).toBeCloseTo(1, 9);
    });

    it('p → 1 limit: all spins inject', () => {
      const r = analyzeRandomFeatureInjectionDuringFs({
        ...baseCfg,
        probInjectionPerFsSpin: 0.99,
      });
      expect(r.expectedInjectionsPerFsBonus).toBeCloseTo(baseCfg.numFreeSpins * 0.99, 9);
      expect(r.probAtLeastOneInjection).toBeGreaterThan(0.99);
    });

    it('probAllNSpinsTopTier = (p · topShare)^N', () => {
      const r = analyzeRandomFeatureInjectionDuringFs(baseCfg);
      const expected = Math.pow(
        baseCfg.probInjectionPerFsSpin * (baseCfg.topTierSubFeatureShare ?? 0),
        baseCfg.numFreeSpins,
      );
      expect(r.probAllNSpinsTopTier).toBeCloseTo(expected, 12);
    });

    it('topTierShare = 0 → probAllNSpinsTopTier = 0', () => {
      const r = analyzeRandomFeatureInjectionDuringFs({
        ...baseCfg,
        topTierSubFeatureShare: 0,
      });
      expect(r.probAllNSpinsTopTier).toBe(0);
    });
  });

  describe('monotonicity', () => {
    it('higher p_inject → higher E[S]', () => {
      const low = analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, probInjectionPerFsSpin: 0.05 });
      const high = analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, probInjectionPerFsSpin: 0.30 });
      expect(high.expectedTotalFsPayout).toBeGreaterThan(low.expectedTotalFsPayout);
    });

    it('higher sub-feature mean → higher E[S]', () => {
      const small = analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, subFeatureMean: 2 });
      const large = analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, subFeatureMean: 20 });
      expect(large.expectedTotalFsPayout).toBeGreaterThan(small.expectedTotalFsPayout);
    });

    it('higher N → higher E[S] linearno', () => {
      const r5 = analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, numFreeSpins: 5 });
      const r20 = analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, numFreeSpins: 20 });
      expect(r20.expectedTotalFsPayout / r5.expectedTotalFsPayout).toBeCloseTo(4, 1);
    });

    it('higher p_inject → higher P(at least one injection)', () => {
      const low = analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, probInjectionPerFsSpin: 0.02 });
      const high = analyzeRandomFeatureInjectionDuringFs({ ...baseCfg, probInjectionPerFsSpin: 0.50 });
      expect(high.probAtLeastOneInjection).toBeGreaterThan(low.probAtLeastOneInjection);
    });
  });

  describe('MC cross-validation', () => {
    const tightCfg: RandomFeatureInjectionDuringFsConfig = {
      numFreeSpins: 10,
      baseFsWinMean: 1.0,
      baseFsWinVar: 0.25,
      probInjectionPerFsSpin: 0.20,
      subFeatureMean: 5,
      subFeatureVar: 1,
    };

    it('CF E[S] within 5% rel of MC mean @ 30K FS bonuses', () => {
      const cf = analyzeRandomFeatureInjectionDuringFs(tightCfg);
      const mc = simulateRandomFeatureInjectionDuringFs(tightCfg, 30_000, 0xC0FFEE);
      const rel =
        Math.abs(cf.expectedTotalFsPayout - mc.meanTotalFsPayout) / mc.meanTotalFsPayout;
      expect(rel).toBeLessThan(0.05);
    });

    it('CF E[injections] within 5% rel of MC mean', () => {
      const cf = analyzeRandomFeatureInjectionDuringFs(tightCfg);
      const mc = simulateRandomFeatureInjectionDuringFs(tightCfg, 30_000, 0xBEEF_189);
      const rel =
        Math.abs(cf.expectedInjectionsPerFsBonus - mc.meanInjectionsPerBonus) /
        mc.meanInjectionsPerBonus;
      expect(rel).toBeLessThan(0.05);
    });

    it('CF P(at least one injection) within 2pp abs of MC', () => {
      const cf = analyzeRandomFeatureInjectionDuringFs(tightCfg);
      const mc = simulateRandomFeatureInjectionDuringFs(tightCfg, 30_000, 0xCAFE);
      const abs = Math.abs(cf.probAtLeastOneInjection - mc.observedProbAtLeastOneInjection);
      expect(abs).toBeLessThan(0.02);
    });

    it('CF stdDev within 15% rel of MC empirical stdDev', () => {
      const cf = analyzeRandomFeatureInjectionDuringFs(tightCfg);
      const mc = simulateRandomFeatureInjectionDuringFs(tightCfg, 30_000, 0xFEED);
      const rel = Math.abs(cf.stdDevTotalFsPayout - mc.stdDevTotalFsPayout) /
        Math.max(cf.stdDevTotalFsPayout, 1e-9);
      expect(rel).toBeLessThan(0.15);
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC', () => {
      const a = simulateRandomFeatureInjectionDuringFs(baseCfg, 500, 0xAA);
      const b = simulateRandomFeatureInjectionDuringFs(baseCfg, 500, 0xAA);
      expect(a.meanTotalFsPayout).toBe(b.meanTotalFsPayout);
    });
    it('different seeds → different MC', () => {
      const a = simulateRandomFeatureInjectionDuringFs(baseCfg, 500, 0xAA);
      const b = simulateRandomFeatureInjectionDuringFs(baseCfg, 500, 0xBB);
      expect(a.meanTotalFsPayout !== b.meanTotalFsPayout).toBe(true);
    });
  });

  describe('industry use-cases (Vendor B M12 Wizard of Oz Munchkinland)', () => {
    it("Wizard of Oz Munchkinland — Munchkin injection sa wilds + multiplier", () => {
      const cfg: RandomFeatureInjectionDuringFsConfig = {
        numFreeSpins: 15,
        baseFsWinMean: 1.2,
        baseFsWinVar: 3,
        probInjectionPerFsSpin: 0.18,
        subFeatureMean: 12, // Munchkin sub-feature value
        subFeatureVar: 25,
        topTierSubFeatureShare: 0.05,
      };
      const r = analyzeRandomFeatureInjectionDuringFs(cfg);
      expect(r.expectedTotalFsPayout).toBeGreaterThan(0);
      expect(r.probAtLeastOneInjection).toBeGreaterThan(0.9); // 15 spins, 18% rate → very likely
      expect(r.injectionContributionShareOfFs).toBeGreaterThan(0.5);
    });

    it("WMS sub-feature library extension — higher inject rate", () => {
      const cfg: RandomFeatureInjectionDuringFsConfig = {
        numFreeSpins: 10,
        baseFsWinMean: 1.0,
        baseFsWinVar: 2,
        probInjectionPerFsSpin: 0.30,
        subFeatureMean: 6,
        subFeatureVar: 12,
      };
      const r = analyzeRandomFeatureInjectionDuringFs(cfg);
      expect(r.expectedInjectionsPerFsBonus).toBeCloseTo(3, 1);
      expect(r.commercialUpliftVsBaseFs).toBeGreaterThan(1.5);
    });

    it("edge: long FS bonus (N=30) with rare injection", () => {
      const cfg: RandomFeatureInjectionDuringFsConfig = {
        numFreeSpins: 30,
        baseFsWinMean: 0.8,
        baseFsWinVar: 1,
        probInjectionPerFsSpin: 0.05,
        subFeatureMean: 20,
        subFeatureVar: 50,
      };
      const r = analyzeRandomFeatureInjectionDuringFs(cfg);
      expect(r.expectedInjectionsPerFsBonus).toBeCloseTo(1.5, 1);
      expect(r.probAtLeastOneInjection).toBeGreaterThan(0.78); // 1 − 0.95^30
    });

    it('edge: N=1 single FS spin', () => {
      const cfg: RandomFeatureInjectionDuringFsConfig = {
        numFreeSpins: 1,
        baseFsWinMean: 5,
        baseFsWinVar: 1,
        probInjectionPerFsSpin: 0.20,
        subFeatureMean: 20,
        subFeatureVar: 4,
      };
      const r = analyzeRandomFeatureInjectionDuringFs(cfg);
      expect(r.expectedTotalFsPayout).toBeCloseTo(5 + 0.20 * 20, 9);
      expect(r.probAtLeastOneInjection).toBeCloseTo(0.20, 9);
    });
  });
});
