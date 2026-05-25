// W152 Wave 185 — Per-Reel Cash-Bag × Per-Row-Multiplier Coupled Accumulator vitest specs
// (66. solver, Vendor B M1 P0 GAP CLOSURE — Dragon Spin CrossLink Water).

import { describe, it, expect } from 'vitest';
import {
  analyzePerReelBagRowMultiplierCoupled,
  simulatePerReelBagRowMultiplierCoupled,
  type PerReelBagRowMultiplierConfig,
} from '../src/features/perReelBagRowMultiplierCoupled.js';

const baseCfg: PerReelBagRowMultiplierConfig = {
  numReels: 5,
  numRows: 4,
  probCoinLandPerCell: 0.10,
  expectedCoinValue: 2,
  varianceCoinValue: 1,
  multiplierByRowCoinCount: [1, 1, 2, 5, 10, 25],
};

describe('Wave 185 — Per-Reel Cash-Bag × Per-Row-Multiplier Coupled Accumulator', () => {
  describe('validation', () => {
    it('rejects numReels < 1', () => {
      expect(() => analyzePerReelBagRowMultiplierCoupled({ ...baseCfg, numReels: 0 })).toThrow(
        /numReels must be integer ≥ 1/,
      );
    });

    it('rejects numRows < 1', () => {
      expect(() => analyzePerReelBagRowMultiplierCoupled({ ...baseCfg, numRows: 0 })).toThrow(
        /numRows must be integer ≥ 1/,
      );
    });

    it('rejects probCoinLandPerCell outside (0,1)', () => {
      expect(() =>
        analyzePerReelBagRowMultiplierCoupled({ ...baseCfg, probCoinLandPerCell: 0 }),
      ).toThrow(/probCoinLandPerCell/);
      expect(() =>
        analyzePerReelBagRowMultiplierCoupled({ ...baseCfg, probCoinLandPerCell: 1 }),
      ).toThrow(/probCoinLandPerCell/);
    });

    it('rejects negative expectedCoinValue', () => {
      expect(() =>
        analyzePerReelBagRowMultiplierCoupled({ ...baseCfg, expectedCoinValue: -1 }),
      ).toThrow(/expectedCoinValue/);
    });

    it('rejects negative varianceCoinValue', () => {
      expect(() =>
        analyzePerReelBagRowMultiplierCoupled({ ...baseCfg, varianceCoinValue: -1 }),
      ).toThrow(/varianceCoinValue/);
    });

    it('rejects multiplierByRowCoinCount wrong length', () => {
      expect(() =>
        analyzePerReelBagRowMultiplierCoupled({ ...baseCfg, multiplierByRowCoinCount: [1, 2, 5] }),
      ).toThrow(/must have length/);
    });

    it('rejects negative multiplier', () => {
      expect(() =>
        analyzePerReelBagRowMultiplierCoupled({
          ...baseCfg,
          multiplierByRowCoinCount: [1, 1, -1, 5, 10, 25],
        }),
      ).toThrow(/must be ≥ 0/);
    });
  });

  describe('closed-form correctness', () => {
    it('rowCoinCountPmf sums to 1', () => {
      const r = analyzePerReelBagRowMultiplierCoupled(baseCfg);
      const s = r.rowCoinCountPmf.reduce((a, b) => a + b, 0);
      expect(s).toBeCloseTo(1, 9);
    });

    it('expectedRowCoinCount = N · q', () => {
      const r = analyzePerReelBagRowMultiplierCoupled(baseCfg);
      expect(r.expectedRowCoinCount).toBeCloseTo(
        baseCfg.numReels * baseCfg.probCoinLandPerCell,
        9,
      );
    });

    it('expectedReelBag = M · q · μ_V (Wald)', () => {
      const r = analyzePerReelBagRowMultiplierCoupled(baseCfg);
      expect(r.expectedReelBag).toBeCloseTo(
        baseCfg.numRows * baseCfg.probCoinLandPerCell * baseCfg.expectedCoinValue,
        9,
      );
    });

    it('expectedTotalPayoutPerSpin = M · expectedRowContribution', () => {
      const r = analyzePerReelBagRowMultiplierCoupled(baseCfg);
      expect(r.expectedTotalPayoutPerSpin).toBeCloseTo(
        baseCfg.numRows * r.expectedRowContribution,
        8,
      );
    });

    it('varianceTotalPayoutPerSpin = M · varianceRowContribution (rows iid)', () => {
      const r = analyzePerReelBagRowMultiplierCoupled(baseCfg);
      expect(r.varianceTotalPayoutPerSpin).toBeCloseTo(
        baseCfg.numRows * r.varianceRowContribution,
        8,
      );
    });

    it('expectedRowMultiplier = Σ pmf[c] · m_c', () => {
      const r = analyzePerReelBagRowMultiplierCoupled(baseCfg);
      let expected = 0;
      for (let c = 0; c <= baseCfg.numReels; c++) {
        expected += r.rowCoinCountPmf[c] * baseCfg.multiplierByRowCoinCount[c];
      }
      expect(r.expectedRowMultiplier).toBeCloseTo(expected, 9);
    });

    it('probAllRowsFull = (q^N)^M', () => {
      const r = analyzePerReelBagRowMultiplierCoupled(baseCfg);
      const expected = Math.pow(
        Math.pow(baseCfg.probCoinLandPerCell, baseCfg.numReels),
        baseCfg.numRows,
      );
      expect(r.probAllRowsFull).toBeCloseTo(expected, 12);
    });

    it('expectedRowsFull = M · q^N', () => {
      const r = analyzePerReelBagRowMultiplierCoupled(baseCfg);
      const expected =
        baseCfg.numRows * Math.pow(baseCfg.probCoinLandPerCell, baseCfg.numReels);
      expect(r.expectedRowsFull).toBeCloseTo(expected, 12);
    });

    it('probAtLeastOneRowFull = 1 − (1 − q^N)^M', () => {
      const r = analyzePerReelBagRowMultiplierCoupled(baseCfg);
      const probRowFull = Math.pow(baseCfg.probCoinLandPerCell, baseCfg.numReels);
      const expected = 1 - Math.pow(1 - probRowFull, baseCfg.numRows);
      expect(r.probAtLeastOneRowFull).toBeCloseTo(expected, 12);
    });

    it('oneInNSpinsAtLeastOneRowFull = 1 / probAtLeastOneRowFull', () => {
      const r = analyzePerReelBagRowMultiplierCoupled(baseCfg);
      if (r.probAtLeastOneRowFull > 0) {
        expect(r.oneInNSpinsAtLeastOneRowFull).toBeCloseTo(1 / r.probAtLeastOneRowFull, 6);
      }
    });

    it('flat multiplier (m_c = 1 svuda) → expectedTotalPayout = M·μ_V·N·q baseline', () => {
      const N = baseCfg.numReels;
      const r = analyzePerReelBagRowMultiplierCoupled({
        ...baseCfg,
        multiplierByRowCoinCount: new Array(N + 1).fill(1),
      });
      const expected =
        baseCfg.numRows * baseCfg.expectedCoinValue * N * baseCfg.probCoinLandPerCell;
      expect(r.expectedTotalPayoutPerSpin).toBeCloseTo(expected, 9);
      expect(r.commercialUpliftVsFlatMultiplier).toBeCloseTo(1, 9);
    });

    it('zero coin value → zero total payout', () => {
      const r = analyzePerReelBagRowMultiplierCoupled({ ...baseCfg, expectedCoinValue: 0 });
      expect(r.expectedTotalPayoutPerSpin).toBe(0);
    });

    it('zero multiplier everywhere → zero total payout', () => {
      const N = baseCfg.numReels;
      const r = analyzePerReelBagRowMultiplierCoupled({
        ...baseCfg,
        multiplierByRowCoinCount: new Array(N + 1).fill(0),
      });
      expect(r.expectedTotalPayoutPerSpin).toBe(0);
    });

    it('commercialUpliftVsFlatMultiplier ≥ 1 when multiplier increases with c (escalating)', () => {
      const r = analyzePerReelBagRowMultiplierCoupled(baseCfg);
      expect(r.commercialUpliftVsFlatMultiplier).toBeGreaterThan(1);
    });

    it('expectedHighestRowMultiplier ≥ expectedRowMultiplier (max ≥ mean)', () => {
      const r = analyzePerReelBagRowMultiplierCoupled(baseCfg);
      expect(r.expectedHighestRowMultiplier).toBeGreaterThanOrEqual(r.expectedRowMultiplier - 1e-9);
    });
  });

  describe('monotonicity', () => {
    it('higher q → more coins → higher E[Y]', () => {
      const rLow = analyzePerReelBagRowMultiplierCoupled({ ...baseCfg, probCoinLandPerCell: 0.05 });
      const rHigh = analyzePerReelBagRowMultiplierCoupled({ ...baseCfg, probCoinLandPerCell: 0.30 });
      expect(rHigh.expectedTotalPayoutPerSpin).toBeGreaterThan(rLow.expectedTotalPayoutPerSpin);
    });

    it('higher μ_V → linear scaling of E[Y]', () => {
      const r1 = analyzePerReelBagRowMultiplierCoupled({ ...baseCfg, expectedCoinValue: 1 });
      const r3 = analyzePerReelBagRowMultiplierCoupled({ ...baseCfg, expectedCoinValue: 3 });
      expect(r3.expectedTotalPayoutPerSpin / r1.expectedTotalPayoutPerSpin).toBeCloseTo(3, 1);
    });

    it('larger grid → higher E[Y]', () => {
      const small = analyzePerReelBagRowMultiplierCoupled({
        ...baseCfg,
        numReels: 3,
        numRows: 3,
        multiplierByRowCoinCount: [1, 1, 2, 5], // length N+1 = 4
      });
      const large = analyzePerReelBagRowMultiplierCoupled({
        ...baseCfg,
        numReels: 6,
        numRows: 5,
        multiplierByRowCoinCount: [1, 1, 2, 5, 10, 25, 100], // length N+1 = 7
      });
      expect(large.expectedTotalPayoutPerSpin).toBeGreaterThan(small.expectedTotalPayoutPerSpin);
    });

    it('steeper multiplier ramp → higher commercial uplift', () => {
      const N = baseCfg.numReels;
      const shallow = analyzePerReelBagRowMultiplierCoupled({
        ...baseCfg,
        multiplierByRowCoinCount: [1, 1, 2, 3, 4, 5],
      });
      const steep = analyzePerReelBagRowMultiplierCoupled({
        ...baseCfg,
        multiplierByRowCoinCount: [1, 1, 2, 10, 50, 500],
      });
      expect(steep.commercialUpliftVsFlatMultiplier).toBeGreaterThan(
        shallow.commercialUpliftVsFlatMultiplier,
      );
      void N;
    });
  });

  describe('MC cross-validation', () => {
    const tightCfg: PerReelBagRowMultiplierConfig = {
      numReels: 5,
      numRows: 4,
      probCoinLandPerCell: 0.20,
      expectedCoinValue: 2,
      varianceCoinValue: 0.5,
      multiplierByRowCoinCount: [1, 1, 2, 5, 10, 25],
    };

    it('CF E[Y] within 5% rel of MC mean @ 20K spins', () => {
      const cf = analyzePerReelBagRowMultiplierCoupled(tightCfg);
      const mc = simulatePerReelBagRowMultiplierCoupled(tightCfg, 20_000, 0xC0FFEE);
      const rel =
        Math.abs(cf.expectedTotalPayoutPerSpin - mc.meanTotalPayoutPerSpin) /
        Math.max(mc.meanTotalPayoutPerSpin, 1e-9);
      expect(rel).toBeLessThan(0.07);
    });

    it('CF E[reel bag] within 4% rel of MC mean', () => {
      const cf = analyzePerReelBagRowMultiplierCoupled(tightCfg);
      const mc = simulatePerReelBagRowMultiplierCoupled(tightCfg, 20_000, 0xBEEF_185);
      const rel = Math.abs(cf.expectedReelBag - mc.meanReelBag) / mc.meanReelBag;
      expect(rel).toBeLessThan(0.05);
    });

    it('CF E[row multiplier] within 3% rel of MC mean', () => {
      const cf = analyzePerReelBagRowMultiplierCoupled(tightCfg);
      const mc = simulatePerReelBagRowMultiplierCoupled(tightCfg, 20_000, 0xCAFE);
      const rel = Math.abs(cf.expectedRowMultiplier - mc.meanRowMultiplier) / mc.meanRowMultiplier;
      expect(rel).toBeLessThan(0.04);
    });

    it('CF P(at least one row full) within 2pp abs of MC', () => {
      const cf = analyzePerReelBagRowMultiplierCoupled(tightCfg);
      const mc = simulatePerReelBagRowMultiplierCoupled(tightCfg, 20_000, 0xFEED);
      const abs = Math.abs(cf.probAtLeastOneRowFull - mc.observedProbAtLeastOneRowFull);
      expect(abs).toBeLessThan(0.03);
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC', () => {
      const a = simulatePerReelBagRowMultiplierCoupled(baseCfg, 500, 0xAA);
      const b = simulatePerReelBagRowMultiplierCoupled(baseCfg, 500, 0xAA);
      expect(a.meanTotalPayoutPerSpin).toBe(b.meanTotalPayoutPerSpin);
      expect(a.meanReelBag).toBe(b.meanReelBag);
    });

    it('different seeds → different MC', () => {
      const a = simulatePerReelBagRowMultiplierCoupled(baseCfg, 500, 0xAA);
      const b = simulatePerReelBagRowMultiplierCoupled(baseCfg, 500, 0xBB);
      expect(a.meanTotalPayoutPerSpin !== b.meanTotalPayoutPerSpin).toBe(true);
    });
  });

  describe('industry use-cases (Vendor B M1 Dragon Spin CrossLink Water)', () => {
    it('Dragon Spin CrossLink Water classic 5×4 grid with escalating row multipliers', () => {
      const cfg: PerReelBagRowMultiplierConfig = {
        numReels: 5,
        numRows: 4,
        probCoinLandPerCell: 0.12,
        expectedCoinValue: 3,
        varianceCoinValue: 2,
        multiplierByRowCoinCount: [1, 1, 2, 5, 10, 25],
      };
      const r = analyzePerReelBagRowMultiplierCoupled(cfg);
      expect(r.expectedTotalPayoutPerSpin).toBeGreaterThan(0);
      expect(r.commercialUpliftVsFlatMultiplier).toBeGreaterThan(1);
      // probability "1 in X" sve 4 rows fully filled — very rare
      expect(r.probAllRowsFull).toBeLessThan(0.001);
    });

    it('Dragon Spin variant — higher q + flat lookup → near-baseline payout', () => {
      const cfg: PerReelBagRowMultiplierConfig = {
        numReels: 5,
        numRows: 4,
        probCoinLandPerCell: 0.30,
        expectedCoinValue: 2,
        varianceCoinValue: 1,
        multiplierByRowCoinCount: [1, 1, 1, 1, 1, 1], // flat
      };
      const r = analyzePerReelBagRowMultiplierCoupled(cfg);
      expect(r.commercialUpliftVsFlatMultiplier).toBeCloseTo(1, 6);
    });

    it('extreme top-tier reward (m_5 = 1000×) significantly raises E[Y]', () => {
      const baseR = analyzePerReelBagRowMultiplierCoupled(baseCfg);
      const extremeR = analyzePerReelBagRowMultiplierCoupled({
        ...baseCfg,
        multiplierByRowCoinCount: [1, 1, 2, 5, 10, 1000],
      });
      expect(extremeR.expectedTotalPayoutPerSpin).toBeGreaterThan(baseR.expectedTotalPayoutPerSpin);
    });

    it('edge: 1×1 grid degenerates to single Bernoulli × multiplier', () => {
      const cfg: PerReelBagRowMultiplierConfig = {
        numReels: 1,
        numRows: 1,
        probCoinLandPerCell: 0.5,
        expectedCoinValue: 10,
        varianceCoinValue: 0,
        multiplierByRowCoinCount: [0, 3], // 0 coins = 0 mult, 1 coin = 3× mult
      };
      const r = analyzePerReelBagRowMultiplierCoupled(cfg);
      // E[Y] = P(c=1)·m_1·1·μ_V = 0.5·3·10 = 15
      expect(r.expectedTotalPayoutPerSpin).toBeCloseTo(15, 9);
    });
  });
});
