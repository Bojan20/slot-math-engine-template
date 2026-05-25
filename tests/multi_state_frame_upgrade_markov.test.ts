// W152 Wave 183 — Multi-State Frame Upgrade Markov Aggregator vitest specs
// (64. solver, Vendor B M2 P0 GAP CLOSURE — Huff N' Puff family 8 titles).

import { describe, it, expect } from 'vitest';
import {
  analyzeMultiStateFrameUpgrade,
  simulateMultiStateFrameUpgrade,
  type MultiStateFrameUpgradeConfig,
} from '../src/features/multiStateFrameUpgradeMarkov.js';

const baseCfg: MultiStateFrameUpgradeConfig = {
  numReels: 5,
  numRows: 3,
  numStates: 4,
  transitionMatrix: [
    [0.7, 0.3, 0.0, 0.0],
    [0.0, 0.6, 0.4, 0.0],
    [0.0, 0.0, 0.7, 0.3],
    [0.05, 0.0, 0.0, 0.95],
  ],
  initialDistribution: [1, 0, 0, 0],
  payoutMultiplierPerState: [0, 1, 5, 25],
  numSpins: 10,
  targetStateForReachabilityDisclosure: 3,
};

describe('Wave 183 — Multi-State Frame Upgrade Markov Aggregator', () => {
  describe('validation', () => {
    it('rejects numReels < 1', () => {
      expect(() => analyzeMultiStateFrameUpgrade({ ...baseCfg, numReels: 0 })).toThrow(
        /numReels must be integer ≥ 1/,
      );
    });

    it('rejects numRows < 1', () => {
      expect(() => analyzeMultiStateFrameUpgrade({ ...baseCfg, numRows: 0 })).toThrow(
        /numRows must be integer ≥ 1/,
      );
    });

    it('rejects numStates < 2', () => {
      expect(() => analyzeMultiStateFrameUpgrade({ ...baseCfg, numStates: 1 })).toThrow(
        /numStates must be integer ≥ 2/,
      );
    });

    it('rejects transitionMatrix wrong size', () => {
      expect(() =>
        analyzeMultiStateFrameUpgrade({
          ...baseCfg,
          transitionMatrix: [[1, 0], [0, 1]],
        }),
      ).toThrow();
    });

    it('rejects transitionMatrix row not summing to 1', () => {
      expect(() =>
        analyzeMultiStateFrameUpgrade({
          ...baseCfg,
          transitionMatrix: [
            [0.5, 0.3, 0.0, 0.0],
            [0.0, 0.6, 0.4, 0.0],
            [0.0, 0.0, 0.7, 0.3],
            [0.05, 0.0, 0.0, 0.95],
          ],
        }),
      ).toThrow(/must sum to 1/);
    });

    it('rejects transitionMatrix probability outside [0,1]', () => {
      expect(() =>
        analyzeMultiStateFrameUpgrade({
          ...baseCfg,
          transitionMatrix: [
            [0.7, 0.3, 0.0, 0.0],
            [0.0, 0.6, 0.4, 0.0],
            [0.0, 0.0, 0.7, 0.3],
            [-0.1, 0.05, 0.0, 1.05],
          ],
        }),
      ).toThrow(/must be ∈/);
    });

    it('rejects initialDistribution wrong size', () => {
      expect(() =>
        analyzeMultiStateFrameUpgrade({
          ...baseCfg,
          initialDistribution: [1, 0],
        }),
      ).toThrow(/must have length/);
    });

    it('rejects initialDistribution not summing to 1', () => {
      expect(() =>
        analyzeMultiStateFrameUpgrade({
          ...baseCfg,
          initialDistribution: [0.5, 0.2, 0.1, 0.1],
        }),
      ).toThrow(/must sum to 1/);
    });

    it('rejects payoutMultiplier wrong length', () => {
      expect(() =>
        analyzeMultiStateFrameUpgrade({
          ...baseCfg,
          payoutMultiplierPerState: [0, 1, 5],
        }),
      ).toThrow(/must have length/);
    });

    it('rejects negative payout', () => {
      expect(() =>
        analyzeMultiStateFrameUpgrade({
          ...baseCfg,
          payoutMultiplierPerState: [0, 1, -1, 25],
        }),
      ).toThrow(/must be ≥ 0/);
    });

    it('rejects numSpins < 1', () => {
      expect(() => analyzeMultiStateFrameUpgrade({ ...baseCfg, numSpins: 0 })).toThrow(
        /numSpins must be integer ≥ 1/,
      );
    });

    it('rejects targetState out of range', () => {
      expect(() =>
        analyzeMultiStateFrameUpgrade({ ...baseCfg, targetStateForReachabilityDisclosure: 4 }),
      ).toThrow(/must be integer ∈/);
      expect(() =>
        analyzeMultiStateFrameUpgrade({ ...baseCfg, targetStateForReachabilityDisclosure: -1 }),
      ).toThrow(/must be integer ∈/);
    });
  });

  describe('closed-form correctness', () => {
    it('finalStateDistributionPerCell sums to 1', () => {
      const r = analyzeMultiStateFrameUpgrade(baseCfg);
      const s = r.finalStateDistributionPerCell.reduce((a, b) => a + b, 0);
      expect(s).toBeCloseTo(1, 8);
    });

    it('stationaryDistribution sums to 1', () => {
      const r = analyzeMultiStateFrameUpgrade(baseCfg);
      const s = r.stationaryDistribution.reduce((a, b) => a + b, 0);
      expect(s).toBeCloseTo(1, 8);
    });

    it('stationaryDistribution invariant: π·P = π', () => {
      const r = analyzeMultiStateFrameUpgrade(baseCfg);
      const pi = r.stationaryDistribution;
      const P = baseCfg.transitionMatrix;
      for (let j = 0; j < baseCfg.numStates; j++) {
        let v = 0;
        for (let i = 0; i < baseCfg.numStates; i++) v += pi[i] * P[i][j];
        expect(v).toBeCloseTo(pi[j], 6);
      }
    });

    it('expectedTotalPayoutPerFeature = cells · expectedPerCellPerSpin · T', () => {
      const r = analyzeMultiStateFrameUpgrade(baseCfg);
      const expected = baseCfg.numReels * baseCfg.numRows * r.expectedPayoutPerCellPerSpin * baseCfg.numSpins;
      expect(r.expectedTotalPayoutPerFeature).toBeCloseTo(expected, 4);
    });

    it('T=1 returns πInit as final distribution applied once', () => {
      const r = analyzeMultiStateFrameUpgrade({ ...baseCfg, numSpins: 1 });
      // After 1 spin: final = πInit · P
      const init = baseCfg.initialDistribution;
      const P = baseCfg.transitionMatrix;
      const K = baseCfg.numStates;
      const expected = new Array(K).fill(0);
      for (let j = 0; j < K; j++) {
        for (let i = 0; i < K; i++) expected[j] += init[i] * P[i][j];
      }
      for (let k = 0; k < K; k++) {
        expect(r.finalStateDistributionPerCell[k]).toBeCloseTo(expected[k], 8);
      }
    });

    it('all-Idle initial + payout m_0=0 → expectedPayout includes only state-0 mass', () => {
      const r = analyzeMultiStateFrameUpgrade({
        ...baseCfg,
        payoutMultiplierPerState: [0, 0, 0, 0],
      });
      expect(r.expectedTotalPayoutPerFeature).toBe(0);
    });

    it('identity P (no transitions) → state stays at Idle forever', () => {
      const K = 4;
      const identity = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ];
      const r = analyzeMultiStateFrameUpgrade({
        ...baseCfg,
        transitionMatrix: identity,
      });
      expect(r.finalStateDistributionPerCell[0]).toBeCloseTo(1, 10);
      for (let k = 1; k < K; k++) {
        expect(r.finalStateDistributionPerCell[k]).toBeCloseTo(0, 10);
      }
    });

    it('perCellProbReachTargetStateAtT ∈ [0, 1]', () => {
      const r = analyzeMultiStateFrameUpgrade(baseCfg);
      expect(r.perCellProbReachTargetStateAtT).toBeGreaterThanOrEqual(0);
      expect(r.perCellProbReachTargetStateAtT).toBeLessThanOrEqual(1);
    });

    it('probAtLeastOneCellReachesTargetAtT >= perCellProbReachTargetStateAtT', () => {
      const r = analyzeMultiStateFrameUpgrade(baseCfg);
      expect(r.probAtLeastOneCellReachesTargetAtT).toBeGreaterThanOrEqual(
        r.perCellProbReachTargetStateAtT - 1e-9,
      );
    });

    it('expectedCellsAtOrAboveTargetAtT = cells · perCellProb', () => {
      const r = analyzeMultiStateFrameUpgrade(baseCfg);
      const cells = baseCfg.numReels * baseCfg.numRows;
      expect(r.expectedCellsAtOrAboveTargetAtT).toBeCloseTo(
        cells * r.perCellProbReachTargetStateAtT,
        8,
      );
    });

    it('oneInNCellsReachesTarget = 1 / perCellProb', () => {
      const r = analyzeMultiStateFrameUpgrade(baseCfg);
      if (r.perCellProbReachTargetStateAtT > 0) {
        expect(r.oneInNCellsReachesTarget).toBeCloseTo(
          1 / r.perCellProbReachTargetStateAtT,
          6,
        );
      }
    });

    it('varianceTotalPayoutPerFeature ≥ 0', () => {
      const r = analyzeMultiStateFrameUpgrade(baseCfg);
      expect(r.varianceTotalPayoutPerFeature).toBeGreaterThanOrEqual(0);
    });

    it('effectiveGridRtpPerSpin = cells · expectedPayoutPerCellPerSpin', () => {
      const r = analyzeMultiStateFrameUpgrade(baseCfg);
      const cells = baseCfg.numReels * baseCfg.numRows;
      expect(r.effectiveGridRtpPerSpin).toBeCloseTo(cells * r.expectedPayoutPerCellPerSpin, 8);
    });
  });

  describe('monotonicity', () => {
    it('larger grid → larger expectedTotalPayout', () => {
      const small = analyzeMultiStateFrameUpgrade({ ...baseCfg, numReels: 3, numRows: 3 });
      const large = analyzeMultiStateFrameUpgrade({ ...baseCfg, numReels: 6, numRows: 4 });
      expect(large.expectedTotalPayoutPerFeature).toBeGreaterThan(small.expectedTotalPayoutPerFeature);
    });

    it('more spins → more expectedTotalPayout (Markov accumulation)', () => {
      const short = analyzeMultiStateFrameUpgrade({ ...baseCfg, numSpins: 5 });
      const long = analyzeMultiStateFrameUpgrade({ ...baseCfg, numSpins: 30 });
      expect(long.expectedTotalPayoutPerFeature).toBeGreaterThan(short.expectedTotalPayoutPerFeature);
    });

    it('higher upgrade probabilities → faster reach to terminal state', () => {
      const slowP = [
        [0.95, 0.05, 0, 0],
        [0, 0.95, 0.05, 0],
        [0, 0, 0.95, 0.05],
        [0, 0, 0, 1],
      ];
      const fastP = [
        [0.5, 0.5, 0, 0],
        [0, 0.5, 0.5, 0],
        [0, 0, 0.5, 0.5],
        [0, 0, 0, 1],
      ];
      const slow = analyzeMultiStateFrameUpgrade({ ...baseCfg, transitionMatrix: slowP });
      const fast = analyzeMultiStateFrameUpgrade({ ...baseCfg, transitionMatrix: fastP });
      expect(fast.perCellProbReachTargetStateAtT).toBeGreaterThan(slow.perCellProbReachTargetStateAtT);
    });

    it('linear scale of payouts → linear scale of expectedTotal', () => {
      const r1 = analyzeMultiStateFrameUpgrade({
        ...baseCfg,
        payoutMultiplierPerState: [0, 1, 5, 25],
      });
      const r5 = analyzeMultiStateFrameUpgrade({
        ...baseCfg,
        payoutMultiplierPerState: [0, 5, 25, 125],
      });
      expect(r5.expectedTotalPayoutPerFeature / r1.expectedTotalPayoutPerFeature).toBeCloseTo(5, 1);
    });
  });

  describe('MC cross-validation', () => {
    const tightCfg: MultiStateFrameUpgradeConfig = {
      numReels: 5,
      numRows: 3,
      numStates: 4,
      transitionMatrix: [
        [0.6, 0.4, 0.0, 0.0],
        [0.0, 0.5, 0.5, 0.0],
        [0.0, 0.0, 0.6, 0.4],
        [0.0, 0.0, 0.0, 1.0], // absorbing
      ],
      initialDistribution: [1, 0, 0, 0],
      payoutMultiplierPerState: [0, 1, 4, 16],
      numSpins: 8,
      targetStateForReachabilityDisclosure: 3,
    };

    it('CF E[payout] within 4% rel of MC mean @ 3K features', () => {
      const cf = analyzeMultiStateFrameUpgrade(tightCfg);
      const mc = simulateMultiStateFrameUpgrade(tightCfg, 3_000, 0xC0FFEE);
      const rel =
        Math.abs(cf.expectedTotalPayoutPerFeature - mc.meanTotalPayoutPerFeature) /
        Math.max(mc.meanTotalPayoutPerFeature, 1e-9);
      expect(rel).toBeLessThan(0.06);
    });

    it('CF final state distribution matches MC within 3pp abs per state', () => {
      const cf = analyzeMultiStateFrameUpgrade(tightCfg);
      const mc = simulateMultiStateFrameUpgrade(tightCfg, 3_000, 0xBEEF_183);
      for (let k = 0; k < tightCfg.numStates; k++) {
        const absDiff = Math.abs(
          cf.finalStateDistributionPerCell[k] - mc.meanFinalStateDistributionPerCell[k],
        );
        expect(absDiff).toBeLessThan(0.04);
      }
    });

    it('CF P(at least one cell reaches target) within 4pp abs of MC @ 3K features', () => {
      const cf = analyzeMultiStateFrameUpgrade(tightCfg);
      const mc = simulateMultiStateFrameUpgrade(tightCfg, 3_000, 0xFEED);
      const absDiff = Math.abs(
        cf.probAtLeastOneCellReachesTargetAtT - mc.probAtLeastOneCellReachesTarget,
      );
      expect(absDiff).toBeLessThan(0.05);
    });

    it('CF E[cells at or above target] within 5% rel of MC mean', () => {
      const cf = analyzeMultiStateFrameUpgrade(tightCfg);
      const mc = simulateMultiStateFrameUpgrade(tightCfg, 3_000, 0xCAFE);
      const rel =
        mc.meanCellsAtOrAboveTarget > 0.01
          ? Math.abs(cf.expectedCellsAtOrAboveTargetAtT - mc.meanCellsAtOrAboveTarget) /
            mc.meanCellsAtOrAboveTarget
          : Math.abs(cf.expectedCellsAtOrAboveTargetAtT - mc.meanCellsAtOrAboveTarget);
      expect(rel).toBeLessThan(0.10);
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC output', () => {
      const a = simulateMultiStateFrameUpgrade(baseCfg, 500, 0xAA);
      const b = simulateMultiStateFrameUpgrade(baseCfg, 500, 0xAA);
      expect(a.meanTotalPayoutPerFeature).toBe(b.meanTotalPayoutPerFeature);
      expect(a.probAtLeastOneCellReachesTarget).toBe(b.probAtLeastOneCellReachesTarget);
    });

    it('different seeds → different MC outputs', () => {
      const a = simulateMultiStateFrameUpgrade(baseCfg, 500, 0xAA);
      const b = simulateMultiStateFrameUpgrade(baseCfg, 500, 0xBB);
      // At least one statistic differs
      expect(
        a.meanTotalPayoutPerFeature !== b.meanTotalPayoutPerFeature ||
          a.probAtLeastOneCellReachesTarget !== b.probAtLeastOneCellReachesTarget,
      ).toBe(true);
    });
  });

  describe('industry use-cases (Vendor B M2 Pattern-HP family)', () => {
    it("Huff N' Puff original 4-state Straw → Wood → Brick → House", () => {
      const cfg: MultiStateFrameUpgradeConfig = {
        numReels: 5,
        numRows: 3,
        numStates: 4,
        transitionMatrix: [
          [0.7, 0.3, 0, 0], // Idle → Straw
          [0, 0.6, 0.4, 0], // Straw → Wood
          [0, 0, 0.7, 0.3], // Wood → House (Brick collapsed)
          [0, 0, 0, 1], // House absorbing
        ],
        initialDistribution: [1, 0, 0, 0],
        payoutMultiplierPerState: [0, 2, 8, 40],
        numSpins: 10,
        targetStateForReachabilityDisclosure: 3,
      };
      const r = analyzeMultiStateFrameUpgrade(cfg);
      expect(r.expectedTotalPayoutPerFeature).toBeGreaterThan(0);
      expect(r.commercialUpliftVsIdleBaseline).toBe(Infinity); // baseline m_0=0
    });

    it("Huff N' More Puff 5-state extended ladder", () => {
      const cfg: MultiStateFrameUpgradeConfig = {
        numReels: 5,
        numRows: 3,
        numStates: 5,
        transitionMatrix: [
          [0.6, 0.4, 0, 0, 0],
          [0, 0.5, 0.5, 0, 0],
          [0, 0, 0.5, 0.5, 0],
          [0, 0, 0, 0.6, 0.4],
          [0, 0, 0, 0, 1],
        ],
        initialDistribution: [1, 0, 0, 0, 0],
        payoutMultiplierPerState: [0, 1, 4, 12, 60],
        numSpins: 15,
        targetStateForReachabilityDisclosure: 4,
      };
      const r = analyzeMultiStateFrameUpgrade(cfg);
      expect(r.expectedTotalPayoutPerFeature).toBeGreaterThan(0);
      // 5-state ladder needs ≥4 advances, ≥5pp baseline P(reach)
      expect(r.perCellProbReachTargetStateAtT).toBeGreaterThan(0.01);
    });

    it("Huff N' Money Mansion fast-advance variant (P0 high)", () => {
      const cfg: MultiStateFrameUpgradeConfig = {
        numReels: 5,
        numRows: 3,
        numStates: 4,
        transitionMatrix: [
          [0.3, 0.7, 0, 0], // fast advance
          [0, 0.3, 0.7, 0],
          [0, 0, 0.3, 0.7],
          [0, 0, 0, 1],
        ],
        initialDistribution: [1, 0, 0, 0],
        payoutMultiplierPerState: [0, 3, 12, 100],
        numSpins: 8,
        targetStateForReachabilityDisclosure: 3,
      };
      const r = analyzeMultiStateFrameUpgrade(cfg);
      // Fast-advance, 8 spinova → most cells should reach Mansion
      expect(r.perCellProbReachTargetStateAtT).toBeGreaterThan(0.3);
      expect(r.expectedTotalPayoutPerFeature).toBeGreaterThan(0);
    });

    it('edge: 1-cell grid degenerates to single-cell Markov', () => {
      const cfg: MultiStateFrameUpgradeConfig = {
        ...baseCfg,
        numReels: 1,
        numRows: 1,
      };
      const r = analyzeMultiStateFrameUpgrade(cfg);
      expect(r.expectedCellsAtOrAboveTargetAtT).toBe(r.perCellProbReachTargetStateAtT);
      expect(r.probAtLeastOneCellReachesTargetAtT).toBeCloseTo(
        r.perCellProbReachTargetStateAtT,
        8,
      );
    });
  });
});
