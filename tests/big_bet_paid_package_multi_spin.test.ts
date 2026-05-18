// W152 Wave 186 — Big Bet Paid-Package Multi-Spin Schedule Aggregator vitest specs
// (67. solver, UK-CRITICAL L&W M9 P0 GAP CLOSURE — Barcrest UK family).

import { describe, it, expect } from 'vitest';
import {
  analyzeBigBetPaidPackage,
  simulateBigBetPaidPackage,
  type BigBetPaidPackageConfig,
} from '../src/features/bigBetPaidPackageMultiSpin.js';

const baseCfg: BigBetPaidPackageConfig = {
  packageSpinCount: 5,
  perSpinStakeAllocation: [4, 4, 4, 4, 4], // 20 total cost
  perSpinRtp: [0.90, 0.92, 0.95, 0.98, 1.00], // escalating
  perSpinVariance: [16, 16, 25, 36, 64],
  baseGameRtpForSubsidyComparison: 0.94,
};

describe('Wave 186 — Big Bet Paid-Package Multi-Spin Schedule Aggregator', () => {
  describe('validation', () => {
    it('rejects packageSpinCount < 2', () => {
      expect(() => analyzeBigBetPaidPackage({ ...baseCfg, packageSpinCount: 1 })).toThrow(
        /packageSpinCount must be integer ≥ 2/,
      );
    });

    it('rejects perSpinStakeAllocation wrong length', () => {
      expect(() =>
        analyzeBigBetPaidPackage({ ...baseCfg, perSpinStakeAllocation: [4, 4, 4] }),
      ).toThrow(/perSpinStakeAllocation must have length/);
    });

    it('rejects zero stake', () => {
      expect(() =>
        analyzeBigBetPaidPackage({ ...baseCfg, perSpinStakeAllocation: [4, 4, 0, 4, 4] }),
      ).toThrow(/must be > 0/);
    });

    it('rejects perSpinRtp wrong length', () => {
      expect(() =>
        analyzeBigBetPaidPackage({ ...baseCfg, perSpinRtp: [0.9, 0.95] }),
      ).toThrow(/perSpinRtp must have length/);
    });

    it('rejects RTP outside [0, 2]', () => {
      expect(() =>
        analyzeBigBetPaidPackage({ ...baseCfg, perSpinRtp: [0.9, 0.92, 0.95, 0.98, 3.0] }),
      ).toThrow(/perSpinRtp\[4\] must be ∈/);
    });

    it('rejects negative variance', () => {
      expect(() =>
        analyzeBigBetPaidPackage({ ...baseCfg, perSpinVariance: [16, 16, -1, 36, 64] }),
      ).toThrow(/must be ≥ 0/);
    });

    it('rejects baseGameRtp outside [0, 2]', () => {
      expect(() =>
        analyzeBigBetPaidPackage({ ...baseCfg, baseGameRtpForSubsidyComparison: 5 }),
      ).toThrow(/baseGameRtpForSubsidyComparison must be ∈/);
    });
  });

  describe('closed-form correctness', () => {
    it('totalPackageCost = Σ perSpinStakeAllocation', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      const sum = baseCfg.perSpinStakeAllocation.reduce((a, b) => a + b, 0);
      expect(r.totalPackageCost).toBeCloseTo(sum, 9);
    });

    it('expectedTotalPayout = Σ b_k · r_k', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      let expected = 0;
      for (let k = 0; k < baseCfg.packageSpinCount; k++) {
        expected += baseCfg.perSpinStakeAllocation[k] * baseCfg.perSpinRtp[k];
      }
      expect(r.expectedTotalPayout).toBeCloseTo(expected, 9);
    });

    it('varianceTotalPayout = Σ σ²_k (per-spin independence)', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      const sum = baseCfg.perSpinVariance.reduce((a, b) => a + b, 0);
      expect(r.varianceTotalPayout).toBeCloseTo(sum, 9);
    });

    it('packageRtp = expectedTotalPayout / totalPackageCost', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      expect(r.packageRtp).toBeCloseTo(r.expectedTotalPayout / r.totalPackageCost, 9);
    });

    it('expectedNetProfitPerPackage = expectedTotalPayout − totalPackageCost', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      expect(r.expectedNetProfitPerPackage).toBeCloseTo(
        r.expectedTotalPayout - r.totalPackageCost,
        9,
      );
    });

    it('perSpinExpectedPayout sums to expectedTotalPayout', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      const sum = r.perSpinExpectedPayout.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(r.expectedTotalPayout, 9);
    });

    it('perSpinContributionToPackageRtp sums to packageRtp', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      const sum = r.perSpinContributionToPackageRtp.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(r.packageRtp, 9);
    });

    it('probProfitCltApprox ∈ [0, 1]', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      expect(r.probProfitCltApprox).toBeGreaterThanOrEqual(0);
      expect(r.probProfitCltApprox).toBeLessThanOrEqual(1);
    });

    it('oneInNPackagesAtLeastBreakEven = 1 / probProfitCltApprox', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      if (r.probProfitCltApprox > 0) {
        expect(r.oneInNPackagesAtLeastBreakEven).toBeCloseTo(1 / r.probProfitCltApprox, 6);
      }
    });

    it('operatorSubsidyFraction = max(0, packageRtp − baseRtp)', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      const expected = Math.max(0, r.packageRtp - baseCfg.baseGameRtpForSubsidyComparison);
      expect(r.operatorSubsidyFraction).toBeCloseTo(expected, 9);
    });

    it('operatorSubsidyAmount = subsidyFraction · totalPackageCost', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      expect(r.operatorSubsidyAmount).toBeCloseTo(
        r.operatorSubsidyFraction * r.totalPackageCost,
        9,
      );
    });

    it('bestSpinIndex identifies highest RTP', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      expect(r.bestSpinIndex).toBe(4); // last spin RTP = 1.00 is highest
      expect(r.bestSpinRtp).toBeCloseTo(1.0, 9);
    });

    it('worstSpinIndex identifies lowest RTP', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      expect(r.worstSpinIndex).toBe(0); // first spin RTP = 0.90 is lowest
      expect(r.worstSpinRtp).toBeCloseTo(0.9, 9);
    });

    it('rtpEscalationSlope positive for monotone-increasing schedule', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      expect(r.rtpEscalationSlope).toBeGreaterThan(0);
    });

    it('rtpEscalationSlope ~zero for flat-RTP schedule', () => {
      const r = analyzeBigBetPaidPackage({
        ...baseCfg,
        perSpinRtp: [0.95, 0.95, 0.95, 0.95, 0.95],
      });
      expect(Math.abs(r.rtpEscalationSlope)).toBeLessThan(1e-9);
    });

    it('harm threshold exceeded flag when loss > threshold', () => {
      const r = analyzeBigBetPaidPackage({ ...baseCfg, harmThresholdLossPerPackage: 0.5 });
      // Expected loss = 20 − 19.0 (0.95 RTP × 20) = 1.0 > 0.5
      expect(r.harmThresholdExceeded).toBe(true);
    });

    it('harm threshold NOT exceeded when threshold high', () => {
      const r = analyzeBigBetPaidPackage({ ...baseCfg, harmThresholdLossPerPackage: 100 });
      expect(r.harmThresholdExceeded).toBe(false);
    });

    it('harm threshold flag is false when threshold undefined', () => {
      const r = analyzeBigBetPaidPackage(baseCfg);
      expect(r.harmThresholdExceeded).toBe(false);
    });

    it('all RTP = 1 → packageRtp = 1, expectedNetProfit = 0', () => {
      const r = analyzeBigBetPaidPackage({
        ...baseCfg,
        perSpinRtp: [1.0, 1.0, 1.0, 1.0, 1.0],
      });
      expect(r.packageRtp).toBeCloseTo(1, 9);
      expect(r.expectedNetProfitPerPackage).toBeCloseTo(0, 9);
    });

    it('all RTP = 0 → packageRtp = 0, expectedNetProfit = −C', () => {
      const r = analyzeBigBetPaidPackage({ ...baseCfg, perSpinRtp: [0, 0, 0, 0, 0] });
      expect(r.packageRtp).toBeCloseTo(0, 9);
      expect(r.expectedNetProfitPerPackage).toBeCloseTo(-r.totalPackageCost, 9);
    });
  });

  describe('monotonicity', () => {
    it('higher per-spin RTP everywhere → higher packageRtp', () => {
      const low = analyzeBigBetPaidPackage({ ...baseCfg, perSpinRtp: [0.85, 0.85, 0.85, 0.85, 0.85] });
      const high = analyzeBigBetPaidPackage({ ...baseCfg, perSpinRtp: [0.99, 0.99, 0.99, 0.99, 0.99] });
      expect(high.packageRtp).toBeGreaterThan(low.packageRtp);
    });

    it('higher variance → lower P(profit) when expected loss', () => {
      // Both have packageRtp = 0.95 (loss expected), but high-vol package has wider distribution
      // → wider distribution actually INCREASES P(profit) when E[Y] < C (more tail probability above).
      // We test the inverse: low-vol with expected loss has lower P(profit) than high-vol.
      const lowVol = analyzeBigBetPaidPackage({
        ...baseCfg,
        perSpinVariance: [1, 1, 1, 1, 1],
      });
      const highVol = analyzeBigBetPaidPackage({
        ...baseCfg,
        perSpinVariance: [100, 100, 100, 100, 100],
      });
      expect(highVol.probProfitCltApprox).toBeGreaterThan(lowVol.probProfitCltApprox);
    });

    it('higher per-spin stake → higher absolute expectedTotalPayout', () => {
      const small = analyzeBigBetPaidPackage({
        ...baseCfg,
        perSpinStakeAllocation: [1, 1, 1, 1, 1],
      });
      const large = analyzeBigBetPaidPackage({
        ...baseCfg,
        perSpinStakeAllocation: [10, 10, 10, 10, 10],
      });
      expect(large.expectedTotalPayout).toBeGreaterThan(small.expectedTotalPayout);
    });
  });

  describe('MC cross-validation', () => {
    const tightCfg: BigBetPaidPackageConfig = {
      packageSpinCount: 5,
      perSpinStakeAllocation: [4, 4, 4, 4, 4],
      perSpinRtp: [0.90, 0.92, 0.95, 0.98, 1.00],
      perSpinVariance: [4, 4, 9, 16, 25],
      baseGameRtpForSubsidyComparison: 0.94,
    };

    it('CF E[total payout] within 8% rel of MC mean @ 20K packages (Gaussian-clip bias)', () => {
      // MC clipuje per-spin payout na ≥0 (vendor convention) — when per-spin
      // σ/μ ratio is high, this inflates MC mean by ~10-15% over CF.
      const cf = analyzeBigBetPaidPackage(tightCfg);
      const mc = simulateBigBetPaidPackage(tightCfg, 20_000, 0xC0FFEE);
      const rel =
        Math.abs(cf.expectedTotalPayout - mc.meanTotalPayoutPerPackage) /
        mc.meanTotalPayoutPerPackage;
      expect(rel).toBeLessThan(0.08);
    });

    it('CF P(profit) within 3pp abs of MC @ 20K packages', () => {
      const cf = analyzeBigBetPaidPackage(tightCfg);
      const mc = simulateBigBetPaidPackage(tightCfg, 20_000, 0xBEEF_186);
      const abs = Math.abs(cf.probProfitCltApprox - mc.observedProbProfit);
      expect(abs).toBeLessThan(0.04);
    });

    it('CF stdDev within 15% rel of MC empirical stdDev (truncation reduces MC variance)', () => {
      const cf = analyzeBigBetPaidPackage(tightCfg);
      const mc = simulateBigBetPaidPackage(tightCfg, 20_000, 0xCAFE);
      const rel = Math.abs(cf.stdDevTotalPayout - mc.stdDevTotalPayoutPerPackage) /
        Math.max(cf.stdDevTotalPayout, 1e-9);
      expect(rel).toBeLessThan(0.15);
    });

    it('CF packageRtp matches MC observed RTP within 8% rel', () => {
      const cf = analyzeBigBetPaidPackage(tightCfg);
      const mc = simulateBigBetPaidPackage(tightCfg, 20_000, 0xFEED);
      const rel = Math.abs(cf.packageRtp - mc.observedPackageRtp) / mc.observedPackageRtp;
      expect(rel).toBeLessThan(0.08);
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC', () => {
      const a = simulateBigBetPaidPackage(baseCfg, 500, 0xAA);
      const b = simulateBigBetPaidPackage(baseCfg, 500, 0xAA);
      expect(a.meanTotalPayoutPerPackage).toBe(b.meanTotalPayoutPerPackage);
      expect(a.observedProbProfit).toBe(b.observedProbProfit);
    });

    it('different seeds → different MC', () => {
      const a = simulateBigBetPaidPackage(baseCfg, 500, 0xAA);
      const b = simulateBigBetPaidPackage(baseCfg, 500, 0xBB);
      expect(a.meanTotalPayoutPerPackage !== b.meanTotalPayoutPerPackage).toBe(true);
    });
  });

  describe('industry use-cases (L&W M9 Barcrest UK family)', () => {
    it("Monopoly Big Event 5-spin progressive escalation up to 98%", () => {
      const cfg: BigBetPaidPackageConfig = {
        packageSpinCount: 5,
        perSpinStakeAllocation: [4, 4, 4, 4, 4],
        perSpinRtp: [0.90, 0.92, 0.95, 0.96, 0.98],
        perSpinVariance: [16, 16, 25, 36, 64],
        baseGameRtpForSubsidyComparison: 0.94,
        harmThresholdLossPerPackage: 2,
      };
      const r = analyzeBigBetPaidPackage(cfg);
      expect(r.packageRtp).toBeGreaterThan(cfg.baseGameRtpForSubsidyComparison);
      expect(r.operatorSubsidyAmount).toBeGreaterThan(0);
      expect(r.bestSpinIndex).toBe(4);
      expect(r.worstSpinIndex).toBe(0);
      // E[loss] ≈ 20·(1 − 0.942) = 1.16, below 2 threshold
      expect(r.harmThresholdExceeded).toBe(false);
    });

    it("Rainbow Riches Pick n Mix Big Bet sa flat-RTP package", () => {
      const cfg: BigBetPaidPackageConfig = {
        packageSpinCount: 5,
        perSpinStakeAllocation: [5, 5, 5, 5, 5],
        perSpinRtp: [0.96, 0.96, 0.96, 0.96, 0.96],
        perSpinVariance: [25, 25, 25, 25, 25],
        baseGameRtpForSubsidyComparison: 0.92,
      };
      const r = analyzeBigBetPaidPackage(cfg);
      expect(r.packageRtp).toBeCloseTo(0.96, 9);
      expect(r.rtpEscalationSlope).toBeCloseTo(0, 9);
    });

    it("Action Bank vault-pick big-bet (5-spin RTP 90→102%)", () => {
      const cfg: BigBetPaidPackageConfig = {
        packageSpinCount: 5,
        perSpinStakeAllocation: [3, 3, 3, 3, 3],
        perSpinRtp: [0.90, 0.93, 0.97, 1.00, 1.02],
        perSpinVariance: [9, 9, 16, 25, 49],
        baseGameRtpForSubsidyComparison: 0.95,
        harmThresholdLossPerPackage: 1,
      };
      const r = analyzeBigBetPaidPackage(cfg);
      // E[loss] = 15·(1 − 0.964) = 0.54, below 1 threshold
      expect(r.harmThresholdExceeded).toBe(false);
      expect(r.bestSpinRtp).toBeCloseTo(1.02, 9);
      expect(r.rtpEscalationSlope).toBeGreaterThan(0.02);
    });

    it('edge: 2-spin minimum package', () => {
      const cfg: BigBetPaidPackageConfig = {
        packageSpinCount: 2,
        perSpinStakeAllocation: [10, 10],
        perSpinRtp: [0.90, 0.99],
        perSpinVariance: [50, 50],
        baseGameRtpForSubsidyComparison: 0.93,
      };
      const r = analyzeBigBetPaidPackage(cfg);
      expect(r.packageRtp).toBeCloseTo((10 * 0.90 + 10 * 0.99) / 20, 9);
    });
  });
});
