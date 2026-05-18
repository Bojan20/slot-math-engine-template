// W152 Wave 194 — Arcade-Shooter Survival Level Progression vitest specs
// (75. solver, L&W M16 P1 GAP CLOSURE — Stellar Jackpots wrapper iz Lightning Box).

import { describe, it, expect } from 'vitest';
import {
  analyzeArcadeShooterSurvivalLevels,
  simulateArcadeShooterSurvivalLevels,
  type ArcadeShooterSurvivalLevelsConfig,
} from '../src/features/arcadeShooterSurvivalLevels.js';

const baseCfg: ArcadeShooterSurvivalLevelsConfig = {
  levels: [
    { label: 'l1', probPass: 0.8, reward: 2 },
    { label: 'l2', probPass: 0.7, reward: 4 },
    { label: 'l3', probPass: 0.6, reward: 8 },
    { label: 'l4', probPass: 0.5, reward: 16 },
    { label: 'l5', probPass: 0.4, reward: 32 },
    { label: 'l6', probPass: 0.3, reward: 64 },
  ],
  jackpotTiers: [
    { label: 'mini',  selectionWeight: 60, meanPayout: 50,    variancePayout: 100 },
    { label: 'minor', selectionWeight: 30, meanPayout: 200,   variancePayout: 400 },
    { label: 'major', selectionWeight: 9,  meanPayout: 1000,  variancePayout: 2500 },
    { label: 'grand', selectionWeight: 1,  meanPayout: 10000, variancePayout: 1000000 },
  ],
};

describe('Wave 194 — Arcade-Shooter Survival Level Progression', () => {
  describe('validation', () => {
    it('rejects empty levels', () => {
      expect(() =>
        analyzeArcadeShooterSurvivalLevels({ levels: [], jackpotTiers: baseCfg.jackpotTiers }),
      ).toThrow();
    });
    it('rejects probPass outside (0,1]', () => {
      expect(() =>
        analyzeArcadeShooterSurvivalLevels({
          levels: [{ probPass: 0, reward: 0 }],
          jackpotTiers: baseCfg.jackpotTiers,
        }),
      ).toThrow();
      expect(() =>
        analyzeArcadeShooterSurvivalLevels({
          levels: [{ probPass: 1.5, reward: 0 }],
          jackpotTiers: baseCfg.jackpotTiers,
        }),
      ).toThrow();
    });
    it('rejects negative reward / negative jackpot fields', () => {
      expect(() =>
        analyzeArcadeShooterSurvivalLevels({
          levels: [{ probPass: 0.5, reward: -1 }],
          jackpotTiers: baseCfg.jackpotTiers,
        }),
      ).toThrow();
      expect(() =>
        analyzeArcadeShooterSurvivalLevels({
          levels: baseCfg.levels,
          jackpotTiers: [{ selectionWeight: -1, meanPayout: 1, variancePayout: 0 }],
        }),
      ).toThrow();
      expect(() =>
        analyzeArcadeShooterSurvivalLevels({
          levels: baseCfg.levels,
          jackpotTiers: [{ selectionWeight: 1, meanPayout: -1, variancePayout: 0 }],
        }),
      ).toThrow();
    });
    it('rejects empty / all-zero jackpot tiers', () => {
      expect(() =>
        analyzeArcadeShooterSurvivalLevels({ levels: baseCfg.levels, jackpotTiers: [] }),
      ).toThrow();
      expect(() =>
        analyzeArcadeShooterSurvivalLevels({
          levels: baseCfg.levels,
          jackpotTiers: [
            { selectionWeight: 0, meanPayout: 1, variancePayout: 0 },
            { selectionWeight: 0, meanPayout: 1, variancePayout: 0 },
          ],
        }),
      ).toThrow();
    });
  });

  describe('closed-form correctness', () => {
    it('S_{L+1} = ∏ p_i', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      const expected = baseCfg.levels.reduce((acc, lv) => acc * lv.probPass, 1);
      expect(r.probabilityCompleteRun).toBeCloseTo(expected, 9);
    });
    it('perLevel survival probs are decreasing (monotone forward chain)', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      for (let i = 1; i < r.numLevels; i++) {
        expect(r.perLevel[i]!.probReached).toBeLessThanOrEqual(r.perLevel[i - 1]!.probReached + 1e-12);
      }
    });
    it('Σ P(exit at k) + P(complete) = 1', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      const sumExit = r.perLevel.reduce((acc, lv) => acc + lv.probExitAtLevel, 0);
      expect(sumExit + r.probabilityCompleteRun).toBeCloseTo(1, 9);
    });
    it('perLevel.probPassed = probReached · probPass', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      for (const lv of r.perLevel) {
        expect(lv.probPassed).toBeCloseTo(lv.probReached * lv.probPass, 9);
      }
    });
    it('expectedLevelRewards = Σ S_{k+1} · V_k', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      const expected = r.perLevel.reduce((acc, lv) => acc + lv.probPassed * lv.reward, 0);
      expect(r.expectedLevelRewards).toBeCloseTo(expected, 9);
    });
    it('expectedJackpotContribution = S_{L+1} · μ_J', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      expect(r.expectedJackpotContribution).toBeCloseTo(
        r.probabilityCompleteRun * r.jackpotMeanGivenComplete,
        9,
      );
    });
    it('expectedPayoutPerRun = level rewards + jackpot contribution', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      expect(r.expectedPayoutPerRun).toBeCloseTo(
        r.expectedLevelRewards + r.expectedJackpotContribution,
        9,
      );
    });
    it('perJackpotTier.selectionProb sum to 1', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      const sum = r.perJackpotTier.reduce((acc, t) => acc + t.selectionProbWithinComplete, 0);
      expect(sum).toBeCloseTo(1, 9);
    });
    it('perJackpotTier.probHit = S_{L+1} · π_k', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      for (const t of r.perJackpotTier) {
        expect(t.probabilityHitThisTier).toBeCloseTo(
          r.probabilityCompleteRun * t.selectionProbWithinComplete, 9,
        );
      }
    });
    it('probabilityGrandJackpot = S_{L+1} · π_{best}', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      const bestIdx = baseCfg.jackpotTiers.findIndex(
        (t) => t.meanPayout === Math.max(...baseCfg.jackpotTiers.map((x) => x.meanPayout)),
      );
      const expected = r.probabilityCompleteRun * r.perJackpotTier[bestIdx]!.selectionProbWithinComplete;
      expect(r.probabilityGrandJackpot).toBeCloseTo(expected, 9);
    });
    it('oneInNRunsToComplete = 1 / S_{L+1}', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      expect(r.oneInNRunsToComplete).toBeCloseTo(1 / r.probabilityCompleteRun, 6);
    });
    it('expectedLevelReached ≥ 1, ≤ L+1', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      expect(r.expectedLevelReached).toBeGreaterThanOrEqual(1);
      expect(r.expectedLevelReached).toBeLessThanOrEqual(r.numLevels + 1);
    });
    it('jackpotShareOfRtp ∈ [0,1]', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      expect(r.jackpotShareOfRtp).toBeGreaterThanOrEqual(0);
      expect(r.jackpotShareOfRtp).toBeLessThanOrEqual(1);
    });
    it('all-p=1 degenerate: complete every time, S_{L+1}=1', () => {
      const cfg: ArcadeShooterSurvivalLevelsConfig = {
        levels: [
          { probPass: 1, reward: 5 },
          { probPass: 1, reward: 10 },
        ],
        jackpotTiers: [{ selectionWeight: 1, meanPayout: 100, variancePayout: 0 }],
      };
      const r = analyzeArcadeShooterSurvivalLevels(cfg);
      expect(r.probabilityCompleteRun).toBeCloseTo(1, 9);
      expect(r.expectedPayoutPerRun).toBeCloseTo(5 + 10 + 100, 9);
    });
    it('single-level, no jackpot reward: E[Y] = p · V_1', () => {
      const cfg: ArcadeShooterSurvivalLevelsConfig = {
        levels: [{ probPass: 0.5, reward: 20 }],
        jackpotTiers: [{ selectionWeight: 1, meanPayout: 0, variancePayout: 0 }],
      };
      const r = analyzeArcadeShooterSurvivalLevels(cfg);
      expect(r.expectedPayoutPerRun).toBeCloseTo(0.5 * 20, 9);
    });
    it('variance non-negative', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      expect(r.variancePayoutPerRun).toBeGreaterThanOrEqual(0);
    });
  });

  describe('monotonicity', () => {
    it('higher per-level pass prob → higher P(complete) and E[Y]', () => {
      const lo: ArcadeShooterSurvivalLevelsConfig = {
        levels: baseCfg.levels.map((lv) => ({ ...lv, probPass: lv.probPass * 0.7 })),
        jackpotTiers: baseCfg.jackpotTiers,
      };
      const hi: ArcadeShooterSurvivalLevelsConfig = {
        levels: baseCfg.levels.map((lv) => ({ ...lv, probPass: Math.min(1, lv.probPass * 1.2) })),
        jackpotTiers: baseCfg.jackpotTiers,
      };
      const rLo = analyzeArcadeShooterSurvivalLevels(lo);
      const rHi = analyzeArcadeShooterSurvivalLevels(hi);
      expect(rHi.probabilityCompleteRun).toBeGreaterThan(rLo.probabilityCompleteRun);
      expect(rHi.expectedPayoutPerRun).toBeGreaterThan(rLo.expectedPayoutPerRun);
    });
    it('higher level rewards → higher E[Y]', () => {
      const hi: ArcadeShooterSurvivalLevelsConfig = {
        levels: baseCfg.levels.map((lv) => ({ ...lv, reward: lv.reward * 2 })),
        jackpotTiers: baseCfg.jackpotTiers,
      };
      const rBase = analyzeArcadeShooterSurvivalLevels(baseCfg);
      const rHi = analyzeArcadeShooterSurvivalLevels(hi);
      expect(rHi.expectedPayoutPerRun).toBeGreaterThan(rBase.expectedPayoutPerRun);
    });
    it('higher jackpot mean → higher E[Y] and jackpotShareOfRtp', () => {
      const hi: ArcadeShooterSurvivalLevelsConfig = {
        levels: baseCfg.levels,
        jackpotTiers: baseCfg.jackpotTiers.map((t) => ({ ...t, meanPayout: t.meanPayout * 3 })),
      };
      const rBase = analyzeArcadeShooterSurvivalLevels(baseCfg);
      const rHi = analyzeArcadeShooterSurvivalLevels(hi);
      expect(rHi.expectedPayoutPerRun).toBeGreaterThan(rBase.expectedPayoutPerRun);
      expect(rHi.jackpotShareOfRtp).toBeGreaterThan(rBase.jackpotShareOfRtp);
    });
  });

  describe('MC cross-validation', () => {
    const tightCfg: ArcadeShooterSurvivalLevelsConfig = {
      levels: [
        { probPass: 0.7, reward: 3 },
        { probPass: 0.6, reward: 6 },
        { probPass: 0.5, reward: 12 },
        { probPass: 0.4, reward: 24 },
      ],
      jackpotTiers: [
        { label: 'mini',  selectionWeight: 70, meanPayout: 100,  variancePayout: 50 },
        { label: 'minor', selectionWeight: 25, meanPayout: 500,  variancePayout: 500 },
        { label: 'grand', selectionWeight: 5,  meanPayout: 5000, variancePayout: 100000 },
      ],
    };

    it('CF E[Y/run] within 7% rel of MC mean @ 100K runs', () => {
      const cf = analyzeArcadeShooterSurvivalLevels(tightCfg);
      const mc = simulateArcadeShooterSurvivalLevels(tightCfg, 100_000, 0xC0FFEE);
      const rel = Math.abs(cf.expectedPayoutPerRun - mc.meanPayoutPerRun) /
        Math.max(mc.meanPayoutPerRun, 1e-9);
      expect(rel).toBeLessThan(0.08);
    });
    it('CF P(complete) within 1pp abs of MC', () => {
      const cf = analyzeArcadeShooterSurvivalLevels(tightCfg);
      const mc = simulateArcadeShooterSurvivalLevels(tightCfg, 100_000, 0xBEEF_194);
      expect(Math.abs(cf.probabilityCompleteRun - mc.observedCompleteRate)).toBeLessThan(0.01);
    });
    it('CF E[level reached] within 2% rel of MC', () => {
      const cf = analyzeArcadeShooterSurvivalLevels(tightCfg);
      const mc = simulateArcadeShooterSurvivalLevels(tightCfg, 100_000, 0xCAFE);
      const rel = Math.abs(cf.expectedLevelReached - mc.observedExpectedLevelReached) /
        Math.max(mc.observedExpectedLevelReached, 1e-9);
      expect(rel).toBeLessThan(0.02);
    });
    it('observed jackpot-tier freqs match π_k within 3pp abs', () => {
      const cf = analyzeArcadeShooterSurvivalLevels(tightCfg);
      const mc = simulateArcadeShooterSurvivalLevels(tightCfg, 200_000, 0xFEED);
      for (let k = 0; k < cf.numJackpotTiers; k++) {
        expect(
          Math.abs(cf.perJackpotTier[k]!.selectionProbWithinComplete - mc.observedJackpotTierFreqs[k]!),
        ).toBeLessThan(0.03);
      }
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC', () => {
      const a = simulateArcadeShooterSurvivalLevels(baseCfg, 500, 0xAA);
      const b = simulateArcadeShooterSurvivalLevels(baseCfg, 500, 0xAA);
      expect(a.meanPayoutPerRun).toBe(b.meanPayoutPerRun);
    });
    it('different seeds → different MC', () => {
      const a = simulateArcadeShooterSurvivalLevels(baseCfg, 500, 0xAA);
      const b = simulateArcadeShooterSurvivalLevels(baseCfg, 500, 0xBB);
      expect(a.meanPayoutPerRun !== b.meanPayoutPerRun).toBe(true);
    });
  });

  describe('industry use-cases (L&W M16 Stellar Jackpots family)', () => {
    it('Stellar Jackpots wrapper — 6-level arcade-shooter', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      expect(r.numLevels).toBe(6);
      expect(r.numJackpotTiers).toBe(4);
      expect(r.probabilityCompleteRun).toBeGreaterThan(0);
      expect(r.probabilityCompleteRun).toBeLessThan(0.1); // rare
      expect(r.probabilityGrandJackpot).toBeLessThan(r.probabilityCompleteRun);
    });
    it('Thundering Bison style — escalating reward + survival decay', () => {
      const cfg: ArcadeShooterSurvivalLevelsConfig = {
        levels: [
          { label: 'bison_l1', probPass: 0.85, reward: 1 },
          { label: 'bison_l2', probPass: 0.70, reward: 3 },
          { label: 'bison_l3', probPass: 0.50, reward: 10 },
          { label: 'bison_l4', probPass: 0.30, reward: 30 },
        ],
        jackpotTiers: [
          { selectionWeight: 1, meanPayout: 5000, variancePayout: 50000 },
        ],
      };
      const r = analyzeArcadeShooterSurvivalLevels(cfg);
      // p_complete = 0.85·0.70·0.50·0.30 = 0.08925
      expect(r.probabilityCompleteRun).toBeCloseTo(0.85 * 0.70 * 0.50 * 0.30, 6);
    });
    it('UKGC RTS-14 disclosure: per-level + per-tier + jackpot share', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      for (const lv of r.perLevel) {
        expect(lv.probReached).toBeGreaterThanOrEqual(0);
        expect(lv.probReached).toBeLessThanOrEqual(1);
      }
      for (const t of r.perJackpotTier) {
        expect(t.oneInNRunsForTier).toBeGreaterThan(1);
      }
      expect(r.jackpotShareOfRtp).toBeGreaterThan(0);
    });
    it('expected level reached < L+1 (some runs fail)', () => {
      const r = analyzeArcadeShooterSurvivalLevels(baseCfg);
      expect(r.expectedLevelReached).toBeLessThan(r.numLevels + 1);
    });
    it('all-fail-instant corner (p=0.001) → near-zero complete', () => {
      const cfg: ArcadeShooterSurvivalLevelsConfig = {
        levels: [
          { probPass: 0.001, reward: 1 },
          { probPass: 0.001, reward: 1 },
        ],
        jackpotTiers: [{ selectionWeight: 1, meanPayout: 1000, variancePayout: 0 }],
      };
      const r = analyzeArcadeShooterSurvivalLevels(cfg);
      expect(r.probabilityCompleteRun).toBeCloseTo(1e-6, 9);
      expect(r.oneInNRunsToComplete).toBeCloseTo(1e6, 0);
    });
  });
});
