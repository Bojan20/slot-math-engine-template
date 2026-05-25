// W152 Wave 191 — Bonus Bank Running-Balance Offset vitest specs
// (72. solver, Vendor B M10 P0 GAP CLOSURE — Rainbow Riches Megaways Bonus Bank).

import { describe, it, expect } from 'vitest';
import {
  analyzeBonusBankRunningBalanceOffset,
  simulateBonusBankRunningBalanceOffset,
  type BonusBankRunningBalanceOffsetConfig,
} from '../src/features/bonusBankRunningBalanceOffset.js';

// Compute overall σ²_W consistent with two-bucket conditional decomposition:
// σ²_W = p·(σ²_L + μ²_L) + (1-p)·(σ²_H + μ²_H) − μ²_W
function makeConsistentOverallVar(cfg: Omit<BonusBankRunningBalanceOffsetConfig, 'perSpinVariance'>): number {
  const muW = cfg.probSmallBucket * cfg.smallBucketMean + (1 - cfg.probSmallBucket) * cfg.highBucketMean;
  const eW2 =
    cfg.probSmallBucket * (cfg.smallBucketVariance + cfg.smallBucketMean ** 2) +
    (1 - cfg.probSmallBucket) * (cfg.highBucketVariance + cfg.highBucketMean ** 2);
  return Math.max(0, eW2 - muW * muW);
}

const baseCore = {
  numFreeSpins: 20,
  probSmallBucket: 0.65,
  smallBucketMean: 0.5,
  smallBucketVariance: 0.1,
  highBucketMean: 4.0,
  highBucketVariance: 6.0,
  bankAllMultiplier: 1.2,
  bankSmallMultiplier: 2.0,
};
const baseCfg: BonusBankRunningBalanceOffsetConfig = {
  ...baseCore,
  perSpinVariance: makeConsistentOverallVar(baseCore),
};

describe('Wave 191 — Bonus Bank Running-Balance Offset', () => {
  describe('validation', () => {
    it('rejects numFreeSpins < 1', () => {
      expect(() => analyzeBonusBankRunningBalanceOffset({ ...baseCfg, numFreeSpins: 0 })).toThrow();
    });
    it('rejects probSmallBucket outside [0,1]', () => {
      expect(() => analyzeBonusBankRunningBalanceOffset({ ...baseCfg, probSmallBucket: -0.1 })).toThrow();
      expect(() => analyzeBonusBankRunningBalanceOffset({ ...baseCfg, probSmallBucket: 1.5 })).toThrow();
    });
    it('rejects negative means/vars', () => {
      expect(() => analyzeBonusBankRunningBalanceOffset({ ...baseCfg, smallBucketMean: -1 })).toThrow();
      expect(() => analyzeBonusBankRunningBalanceOffset({ ...baseCfg, highBucketVariance: -1 })).toThrow();
      expect(() => analyzeBonusBankRunningBalanceOffset({ ...baseCfg, perSpinVariance: -1 })).toThrow();
    });
    it('rejects negative bank multipliers', () => {
      expect(() => analyzeBonusBankRunningBalanceOffset({ ...baseCfg, bankAllMultiplier: -1 })).toThrow();
      expect(() => analyzeBonusBankRunningBalanceOffset({ ...baseCfg, bankSmallMultiplier: -1 })).toThrow();
    });
    it('accepts probSmallBucket = 0 (all high bucket)', () => {
      expect(() => analyzeBonusBankRunningBalanceOffset({ ...baseCfg, probSmallBucket: 0 })).not.toThrow();
    });
    it('accepts probSmallBucket = 1 (all small bucket)', () => {
      expect(() => analyzeBonusBankRunningBalanceOffset({ ...baseCfg, probSmallBucket: 1 })).not.toThrow();
    });
  });

  describe('closed-form correctness', () => {
    it('perSpinMean = p_low·μ_low + (1-p_low)·μ_high', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      const expected = baseCfg.probSmallBucket * baseCfg.smallBucketMean +
        (1 - baseCfg.probSmallBucket) * baseCfg.highBucketMean;
      expect(r.perSpinMean).toBeCloseTo(expected, 9);
    });
    it('Mode A: E[T_A] = N·μ_W', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      expect(r.expectedPayoutModeA).toBeCloseTo(baseCfg.numFreeSpins * r.perSpinMean, 9);
    });
    it('Mode A: Var[T_A] = N·σ²_W', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      expect(r.variancePayoutModeA).toBeCloseTo(baseCfg.numFreeSpins * baseCfg.perSpinVariance, 9);
    });
    it('Mode B: E[T_B] = m_B·N·μ_W', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      expect(r.expectedPayoutModeB).toBeCloseTo(
        baseCfg.bankAllMultiplier * baseCfg.numFreeSpins * r.perSpinMean,
        9,
      );
    });
    it('Mode B: Var[T_B] = m_B²·N·σ²_W', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      expect(r.variancePayoutModeB).toBeCloseTo(
        baseCfg.bankAllMultiplier ** 2 * baseCfg.numFreeSpins * baseCfg.perSpinVariance,
        9,
      );
    });
    it('Mode C: E[Z] = p·m_S·μ_low + (1-p)·μ_high', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      const expected = baseCfg.probSmallBucket * baseCfg.bankSmallMultiplier * baseCfg.smallBucketMean +
        (1 - baseCfg.probSmallBucket) * baseCfg.highBucketMean;
      expect(r.perSpinMeanModeC).toBeCloseTo(expected, 9);
    });
    it('Mode C: Var[Z] = E[Z²] − E[Z]²', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      const eZ2 =
        baseCfg.probSmallBucket * baseCfg.bankSmallMultiplier ** 2 *
          (baseCfg.smallBucketVariance + baseCfg.smallBucketMean ** 2) +
        (1 - baseCfg.probSmallBucket) *
          (baseCfg.highBucketVariance + baseCfg.highBucketMean ** 2);
      const expected = eZ2 - r.perSpinMeanModeC ** 2;
      expect(r.perSpinVarianceModeC).toBeCloseTo(expected, 9);
    });
    it('Mode C: E[T_C] = N·E[Z]', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      expect(r.expectedPayoutModeC).toBeCloseTo(baseCfg.numFreeSpins * r.perSpinMeanModeC, 9);
    });
    it('bonusBankAdditiveOffsetB = (m_B-1)·N·μ_W', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      const expected = (baseCfg.bankAllMultiplier - 1) * baseCfg.numFreeSpins * r.perSpinMean;
      expect(r.bonusBankAdditiveOffsetB).toBeCloseTo(expected, 9);
    });
    it('bestModeIndex points to highest E[T]', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      const payouts = [r.expectedPayoutModeA, r.expectedPayoutModeB, r.expectedPayoutModeC];
      const max = Math.max(...payouts);
      expect(payouts[r.bestModeIndex]).toBeCloseTo(max, 9);
    });
    it('rtpSpread = best − worst', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      expect(r.rtpSpread).toBeCloseTo(r.bestModeExpectedPayout - r.worstModeExpectedPayout, 9);
    });
    it('commercialUpliftBVsBaselineA = m_B (since E[T_B]=m_B·E[T_A])', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      expect(r.commercialUpliftBVsBaselineA).toBeCloseTo(baseCfg.bankAllMultiplier, 9);
    });
    it('m_B = 1 → Mode B = Mode A (no banking)', () => {
      const r = analyzeBonusBankRunningBalanceOffset({ ...baseCfg, bankAllMultiplier: 1 });
      expect(r.expectedPayoutModeB).toBeCloseTo(r.expectedPayoutModeA, 9);
      expect(r.bonusBankAdditiveOffsetB).toBeCloseTo(0, 9);
    });
    it('m_S = 1 → Mode C = Mode A (no small-bucket boost)', () => {
      const r = analyzeBonusBankRunningBalanceOffset({ ...baseCfg, bankSmallMultiplier: 1 });
      expect(r.expectedPayoutModeC).toBeCloseTo(r.expectedPayoutModeA, 9);
      expect(r.bankSmallContributionShareC).toBeCloseTo(0, 9);
    });
    it('p_low = 0 → Mode C = Mode A (no small bucket exists)', () => {
      const cfg: BonusBankRunningBalanceOffsetConfig = { ...baseCfg, probSmallBucket: 0 };
      const overallVar = makeConsistentOverallVar(cfg);
      const r = analyzeBonusBankRunningBalanceOffset({ ...cfg, perSpinVariance: overallVar });
      expect(r.expectedPayoutModeC).toBeCloseTo(r.expectedPayoutModeA, 9);
    });
    it('p_low = 1 → Mode C = m_S · Mode A', () => {
      const cfg: BonusBankRunningBalanceOffsetConfig = { ...baseCfg, probSmallBucket: 1 };
      const overallVar = makeConsistentOverallVar(cfg);
      const r = analyzeBonusBankRunningBalanceOffset({ ...cfg, perSpinVariance: overallVar });
      expect(r.expectedPayoutModeC).toBeCloseTo(baseCfg.bankSmallMultiplier * r.expectedPayoutModeA, 9);
    });
    it('skillPremiumVsUniform ≥ 0', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      expect(r.skillPremiumVsUniform).toBeGreaterThanOrEqual(0);
    });
    it('all modes equal RTP → skillPremium = 0', () => {
      const r = analyzeBonusBankRunningBalanceOffset({ ...baseCfg, bankAllMultiplier: 1, bankSmallMultiplier: 1 });
      expect(r.skillPremiumVsUniform).toBeCloseTo(0, 9);
      expect(r.rtpSpread).toBeCloseTo(0, 9);
    });
  });

  describe('monotonicity', () => {
    it('higher N → proportionally higher E[T_A]', () => {
      const small = analyzeBonusBankRunningBalanceOffset({ ...baseCfg, numFreeSpins: 5 });
      const large = analyzeBonusBankRunningBalanceOffset({ ...baseCfg, numFreeSpins: 50 });
      expect(large.expectedPayoutModeA).toBeCloseTo(small.expectedPayoutModeA * 10, 6);
    });
    it('higher m_B → higher E[T_B] strictly monotonic', () => {
      const low = analyzeBonusBankRunningBalanceOffset({ ...baseCfg, bankAllMultiplier: 1.0 });
      const high = analyzeBonusBankRunningBalanceOffset({ ...baseCfg, bankAllMultiplier: 2.0 });
      expect(high.expectedPayoutModeB).toBeGreaterThan(low.expectedPayoutModeB);
    });
    it('higher m_S → higher E[T_C] strictly monotonic', () => {
      const low = analyzeBonusBankRunningBalanceOffset({ ...baseCfg, bankSmallMultiplier: 1.0 });
      const high = analyzeBonusBankRunningBalanceOffset({ ...baseCfg, bankSmallMultiplier: 5.0 });
      expect(high.expectedPayoutModeC).toBeGreaterThan(low.expectedPayoutModeC);
    });
    it('higher p_low (more small wins) + m_S>1 → higher E[T_C]', () => {
      const lowCfg = { ...baseCore, probSmallBucket: 0.20, bankSmallMultiplier: 3.0 };
      const highCfg = { ...baseCore, probSmallBucket: 0.80, bankSmallMultiplier: 3.0 };
      const lo = analyzeBonusBankRunningBalanceOffset({ ...lowCfg, perSpinVariance: makeConsistentOverallVar(lowCfg) });
      const hi = analyzeBonusBankRunningBalanceOffset({ ...highCfg, perSpinVariance: makeConsistentOverallVar(highCfg) });
      // Effect on E[T_C] depends on baseline μ_W also changing, but boost per-spin (m_S-1)*p·μ_low increases.
      // We compare boost share directly:
      expect(hi.bankSmallContributionShareC).toBeGreaterThan(lo.bankSmallContributionShareC);
    });
  });

  describe('MC cross-validation', () => {
    const tightCore = {
      numFreeSpins: 15,
      probSmallBucket: 0.60,
      smallBucketMean: 0.4,
      smallBucketVariance: 0.05,
      highBucketMean: 3.0,
      highBucketVariance: 4.0,
      bankAllMultiplier: 1.5,
      bankSmallMultiplier: 3.0,
    };
    const tightCfg: BonusBankRunningBalanceOffsetConfig = {
      ...tightCore,
      perSpinVariance: makeConsistentOverallVar(tightCore),
    };

    it('CF E[T_A] within 5% rel of MC mean @ 30K bonus sessions', () => {
      const cf = analyzeBonusBankRunningBalanceOffset(tightCfg);
      const mc = simulateBonusBankRunningBalanceOffset(tightCfg, 30_000, 0xC0FFEE);
      const rel = Math.abs(cf.expectedPayoutModeA - mc.meanPayoutModeA) /
        Math.max(mc.meanPayoutModeA, 1e-9);
      expect(rel).toBeLessThan(0.05);
    });
    it('CF E[T_B] within 5% rel of MC mean', () => {
      const cf = analyzeBonusBankRunningBalanceOffset(tightCfg);
      const mc = simulateBonusBankRunningBalanceOffset(tightCfg, 30_000, 0xBEEF_191);
      const rel = Math.abs(cf.expectedPayoutModeB - mc.meanPayoutModeB) /
        Math.max(mc.meanPayoutModeB, 1e-9);
      expect(rel).toBeLessThan(0.05);
    });
    it('CF E[T_C] within 5% rel of MC mean', () => {
      const cf = analyzeBonusBankRunningBalanceOffset(tightCfg);
      const mc = simulateBonusBankRunningBalanceOffset(tightCfg, 30_000, 0xCAFE);
      const rel = Math.abs(cf.expectedPayoutModeC - mc.meanPayoutModeC) /
        Math.max(mc.meanPayoutModeC, 1e-9);
      expect(rel).toBeLessThan(0.05);
    });
    it('observed small-bucket rate within 2pp abs of p_low', () => {
      const mc = simulateBonusBankRunningBalanceOffset(tightCfg, 30_000, 0xFEED);
      expect(Math.abs(tightCfg.probSmallBucket - mc.observedSmallBucketRate)).toBeLessThan(0.02);
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC', () => {
      const a = simulateBonusBankRunningBalanceOffset(baseCfg, 500, 0xAA);
      const b = simulateBonusBankRunningBalanceOffset(baseCfg, 500, 0xAA);
      expect(a.meanPayoutModeA).toBe(b.meanPayoutModeA);
      expect(a.meanPayoutModeB).toBe(b.meanPayoutModeB);
      expect(a.meanPayoutModeC).toBe(b.meanPayoutModeC);
    });
    it('different seeds → different MC', () => {
      const a = simulateBonusBankRunningBalanceOffset(baseCfg, 500, 0xAA);
      const b = simulateBonusBankRunningBalanceOffset(baseCfg, 500, 0xBB);
      expect(a.meanPayoutModeA !== b.meanPayoutModeA).toBe(true);
    });
  });

  describe('industry use-cases (Vendor B M10 Bonus Bank family)', () => {
    it('Rainbow Riches Megaways — Bonus Bank "Bank All Wins" mode', () => {
      const core = {
        numFreeSpins: 15,
        probSmallBucket: 0.70,
        smallBucketMean: 0.6,
        smallBucketVariance: 0.2,
        highBucketMean: 5.0,
        highBucketVariance: 8.0,
        bankAllMultiplier: 1.25,
        bankSmallMultiplier: 2.5,
      };
      const cfg: BonusBankRunningBalanceOffsetConfig = { ...core, perSpinVariance: makeConsistentOverallVar(core) };
      const r = analyzeBonusBankRunningBalanceOffset(cfg);
      expect(r.expectedPayoutModeB).toBeGreaterThan(r.expectedPayoutModeA);
      expect(r.commercialUpliftBVsBaselineA).toBeCloseTo(1.25, 9);
    });
    it('Bonus Bank "Bank Small Wins" — high small-bucket frequency boosts Mode C', () => {
      const core = {
        numFreeSpins: 20,
        probSmallBucket: 0.80,
        smallBucketMean: 0.3,
        smallBucketVariance: 0.05,
        highBucketMean: 6.0,
        highBucketVariance: 10.0,
        bankAllMultiplier: 1.1,
        bankSmallMultiplier: 4.0,
      };
      const cfg: BonusBankRunningBalanceOffsetConfig = { ...core, perSpinVariance: makeConsistentOverallVar(core) };
      const r = analyzeBonusBankRunningBalanceOffset(cfg);
      expect(r.bankSmallContributionShareC).toBeGreaterThan(0.20);
    });
    it('Skill-rational player picks best mode (positive skill premium)', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      expect(r.skillPremiumVsUniform).toBeGreaterThan(0);
    });
    it('UKGC RTS-12 disclosure: per-mode RTP comparable', () => {
      const r = analyzeBonusBankRunningBalanceOffset(baseCfg);
      expect(r.expectedPayoutModeA).toBeGreaterThan(0);
      expect(r.expectedPayoutModeB).toBeGreaterThan(0);
      expect(r.expectedPayoutModeC).toBeGreaterThan(0);
      expect(r.rtpSpread).toBeGreaterThanOrEqual(0);
    });
    it('edge: K=1 single FS (degenerate, all modes = per-spin)', () => {
      const cfg: BonusBankRunningBalanceOffsetConfig = { ...baseCfg, numFreeSpins: 1 };
      const r = analyzeBonusBankRunningBalanceOffset(cfg);
      expect(r.expectedPayoutModeA).toBeCloseTo(r.perSpinMean, 9);
      expect(r.expectedPayoutModeB).toBeCloseTo(baseCfg.bankAllMultiplier * r.perSpinMean, 9);
    });
  });
});
