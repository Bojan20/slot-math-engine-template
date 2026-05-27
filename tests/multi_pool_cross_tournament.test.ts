// W202 / PHASE 9.2 — Multi-Pool Cross-Tournament Network Solver vitest specs
// (105. solver, second PHASE 9 wave: M titles × D days networked tournament).

import { describe, it, expect } from 'vitest';
import {
  solveMultiPoolCrossTournament,
  type MultiPoolCrossTournamentConfig,
  type NetworkTitleDayCell,
} from '../src/features/multiPoolCrossTournament.js';

function uniformCell(over: Partial<NetworkTitleDayCell> = {}): NetworkTitleDayCell {
  return {
    spinsPerPlayer: 100,
    contributionRate: 0.02,
    betPerSpin: 1,
    perSpinPayoutMean: 0.94,
    perSpinPayoutVariance: 4.0,
    ...over,
  };
}

const baseCfg: MultiPoolCrossTournamentConfig = {
  nPlayers: 10,
  titleDayGrid: [
    [uniformCell({ label: 'A' }), uniformCell({ label: 'A' })],
    [uniformCell({ label: 'B' }), uniformCell({ label: 'B' })],
    [uniformCell({ label: 'C' }), uniformCell({ label: 'C' })],
  ], // 3 titles × 2 days
  prizeStructure: { kind: 'winner-take-all' },
};

describe('W202 — Multi-Pool Cross-Tournament Network Solver', () => {
  describe('validation', () => {
    it('rejects nPlayers < 2', () => {
      expect(() => solveMultiPoolCrossTournament({ ...baseCfg, nPlayers: 1 })).toThrow();
    });

    it('rejects empty titleDayGrid', () => {
      expect(() =>
        solveMultiPoolCrossTournament({ ...baseCfg, titleDayGrid: [] }),
      ).toThrow();
    });

    it('rejects ragged titleDayGrid (different day count per title)', () => {
      expect(() =>
        solveMultiPoolCrossTournament({
          ...baseCfg,
          titleDayGrid: [[uniformCell()], [uniformCell(), uniformCell()]],
        }),
      ).toThrow();
    });

    it('rejects negative cell values', () => {
      expect(() =>
        solveMultiPoolCrossTournament({
          ...baseCfg,
          titleDayGrid: [[uniformCell({ spinsPerPlayer: -1 })]],
        }),
      ).toThrow();
      expect(() =>
        solveMultiPoolCrossTournament({
          ...baseCfg,
          titleDayGrid: [[uniformCell({ contributionRate: 1.5 })]],
        }),
      ).toThrow();
      expect(() =>
        solveMultiPoolCrossTournament({
          ...baseCfg,
          titleDayGrid: [[uniformCell({ perSpinPayoutVariance: -1 })]],
        }),
      ).toThrow();
    });

    it('rejects bad multiDayPolicy', () => {
      expect(() =>
        solveMultiPoolCrossTournament({
          ...baseCfg,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          multiDayPolicy: 'monthly' as any,
        }),
      ).toThrow();
    });
  });

  describe('pool structure (3 titles × 2 days)', () => {
    it('poolTotal = sum over all cells', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      // Each cell: 10 players × 100 spins × 0.02 × 1 = 20
      // 3 titles × 2 days × 20 = 120
      expect(r.poolTotal).toBe(120);
    });

    it('perTitle.contributionToPool sums to poolTotal', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      const sum = r.perTitle.reduce((a, t) => a + t.contributionToPool, 0);
      expect(sum).toBeCloseTo(r.poolTotal, 9);
    });

    it('perTitle.shareOfPool sums to 1', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      const sum = r.perTitle.reduce((a, t) => a + t.shareOfPool, 0);
      expect(sum).toBeCloseTo(1, 9);
    });

    it('uniform grid: each title share = 1/M', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      for (const t of r.perTitle) {
        expect(t.shareOfPool).toBeCloseTo(1 / 3, 9);
      }
    });

    it('non-uniform contribution: high-cell title share > 1/M', () => {
      const cfg: MultiPoolCrossTournamentConfig = {
        ...baseCfg,
        titleDayGrid: [
          [uniformCell({ contributionRate: 0.1 }), uniformCell({ contributionRate: 0.1 })],
          [uniformCell(), uniformCell()],
          [uniformCell(), uniformCell()],
        ],
      };
      const r = solveMultiPoolCrossTournament(cfg);
      expect(r.perTitle[0].shareOfPool).toBeGreaterThan(1 / 3);
      expect(r.perTitle[1].shareOfPool).toBeLessThan(1 / 3);
      expect(r.perTitle[2].shareOfPool).toBeLessThan(1 / 3);
    });
  });

  describe('audit metadata', () => {
    it('reports M, D, N correctly', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      expect(r.audit.nTitles).toBe(3);
      expect(r.audit.nDays).toBe(2);
      expect(r.audit.nPlayers).toBe(10);
    });

    it('totalSpinsPerPlayer aggregates across all (t,d)', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      expect(r.audit.totalSpinsPerPlayer).toBe(100 * 3 * 2);
    });

    it('multiDayPolicy defaults to "cumulative"', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      expect(r.audit.multiDayPolicy).toBe('cumulative');
    });

    it('per-title contribution variance is 0 for uniform grid', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      expect(r.audit.perTitleContributionVarianceAcrossTitles).toBeCloseTo(0, 6);
    });
  });

  describe('rank distribution + symmetry', () => {
    it('every rank: P = 1/N for identical players', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      for (const row of r.rankBreakdown) {
        expect(row.probabilityThisRank).toBeCloseTo(1 / 10, 9);
      }
    });

    it('Σ rank probabilities = 1', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      const s = r.rankBreakdown.reduce((a, x) => a + x.probabilityThisRank, 0);
      expect(s).toBeCloseTo(1, 9);
    });

    it('expectedPrizePerPlayer = Σ P × prize = poolPaidOut / N', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      const sum = r.rankBreakdown.reduce((a, x) => a + x.expectedPrizeContribution, 0);
      expect(r.expectedPrizePerPlayer).toBeCloseTo(sum, 9);
      expect(r.expectedPrizePerPlayer).toBeCloseTo(r.poolPaidOut / 10, 9);
    });
  });

  describe('multi-day carry-over policy', () => {
    it('"cumulative" + WTA: rank-1 gets full poolTotal', () => {
      const r = solveMultiPoolCrossTournament({
        ...baseCfg,
        multiDayPolicy: 'cumulative',
      });
      expect(r.rankBreakdown[0].prize).toBe(r.poolTotal);
    });

    it('"per-day-reset": rank-1 gets D × (poolPerDay × structure-share-1)', () => {
      const r = solveMultiPoolCrossTournament({
        ...baseCfg,
        multiDayPolicy: 'per-day-reset',
      });
      // pool per day = 60; WTA → rank-1 gets 60 per day × 2 days = 120
      expect(r.rankBreakdown[0].prize).toBeCloseTo(r.poolTotal, 9);
    });

    it('both policies pay out the same total under WTA + identical days', () => {
      const r1 = solveMultiPoolCrossTournament({
        ...baseCfg,
        multiDayPolicy: 'cumulative',
      });
      const r2 = solveMultiPoolCrossTournament({
        ...baseCfg,
        multiDayPolicy: 'per-day-reset',
      });
      expect(r1.poolPaidOut).toBeCloseTo(r2.poolPaidOut, 9);
    });

    it('"per-day-reset" + top-3 flat distributes per-day equally', () => {
      const r = solveMultiPoolCrossTournament({
        ...baseCfg,
        prizeStructure: { kind: 'top-n-flat', topN: 3 },
        multiDayPolicy: 'per-day-reset',
      });
      // poolPerDay = 60 / 3 = 20 per top-3 rank per day. D=2 → 40 per rank total
      expect(r.rankBreakdown[0].prize).toBeCloseTo(40, 9);
      expect(r.rankBreakdown[1].prize).toBeCloseTo(40, 9);
      expect(r.rankBreakdown[2].prize).toBeCloseTo(40, 9);
      for (let i = 3; i < 10; i++) expect(r.rankBreakdown[i].prize).toBe(0);
    });
  });

  describe('per-player session total (Normal CLT)', () => {
    it('expectedSessionTotal = Σ S_{t,d} · μ_t (uniform grid)', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      // 6 cells, each 100 spins × μ=0.94 = 94; 6 × 94 = 564
      expect(r.expectedSessionTotal).toBeCloseTo(564, 9);
    });

    it('varianceSessionTotal = Σ S_{t,d} · σ²_t · bet²', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      // 6 cells × 100 spins × σ²=4 × bet²=1 = 2400
      expect(r.varianceSessionTotal).toBeCloseTo(2400, 9);
    });

    it('stdDevSessionTotal = √variance', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      expect(r.stdDevSessionTotal).toBeCloseTo(Math.sqrt(2400), 9);
    });

    it('heterogeneous-title variance is additive across titles', () => {
      const cfg: MultiPoolCrossTournamentConfig = {
        ...baseCfg,
        titleDayGrid: [
          [uniformCell({ perSpinPayoutVariance: 1 }), uniformCell({ perSpinPayoutVariance: 1 })],
          [uniformCell({ perSpinPayoutVariance: 4 }), uniformCell({ perSpinPayoutVariance: 4 })],
          [uniformCell({ perSpinPayoutVariance: 9 }), uniformCell({ perSpinPayoutVariance: 9 })],
        ],
      };
      const r = solveMultiPoolCrossTournament(cfg);
      // expected var = 2*(100*1) + 2*(100*4) + 2*(100*9) = 200 + 800 + 1800 = 2800
      expect(r.varianceSessionTotal).toBeCloseTo(2800, 9);
    });
  });

  describe('RTP composition', () => {
    it('rtpPerSpinBaseAverage = weighted-avg μ / bet', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      expect(r.rtpPerSpinBaseAverage).toBeCloseTo(0.94, 9);
    });

    it('rtpPerSpinTournament = c (under WTA full payout, uniform contribution)', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      expect(r.rtpPerSpinTournament).toBeCloseTo(0.02, 9);
    });

    it('rtpPerSpinCombined = base + tournament', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      expect(r.rtpPerSpinCombined).toBeCloseTo(0.96, 9);
    });

    it('residual pool → reduced tournament RTP', () => {
      const r = solveMultiPoolCrossTournament({
        ...baseCfg,
        nPlayers: 100,
        titleDayGrid: [
          [uniformCell(), uniformCell()],
          [uniformCell(), uniformCell()],
          [uniformCell(), uniformCell()],
        ],
        prizeStructure: {
          kind: 'percentile-bracket',
          brackets: [{ topPercentile: 0.1, shareOfPool: 0.6 }], // 40 % residual
        },
      });
      // tournament RTP = 0.02 × 0.6 = 0.012
      expect(r.rtpPerSpinTournament).toBeCloseTo(0.012, 6);
    });
  });

  describe('title-skew skill premium', () => {
    it('identical-title grid: skew premium = 0', () => {
      const r = solveMultiPoolCrossTournament(baseCfg);
      expect(r.titleSkewSkillPremium).toBeCloseTo(0, 9);
    });

    it('heterogeneous μ across titles: premium > 0', () => {
      const cfg: MultiPoolCrossTournamentConfig = {
        ...baseCfg,
        titleDayGrid: [
          [uniformCell({ perSpinPayoutMean: 0.85 }), uniformCell({ perSpinPayoutMean: 0.85 })],
          [uniformCell({ perSpinPayoutMean: 0.94 }), uniformCell({ perSpinPayoutMean: 0.94 })],
          [uniformCell({ perSpinPayoutMean: 0.99 }), uniformCell({ perSpinPayoutMean: 0.99 })],
        ],
      };
      const r = solveMultiPoolCrossTournament(cfg);
      expect(r.titleSkewSkillPremium).toBeGreaterThan(0);
      expect(r.bestTitleByMean).toBe(2); // 0.99
      expect(r.worstTitleByMean).toBe(0); // 0.85
    });

    it('skew premium grows with √(ln N)', () => {
      const cfg = (N: number): MultiPoolCrossTournamentConfig => ({
        nPlayers: N,
        titleDayGrid: [
          [uniformCell({ perSpinPayoutMean: 0.85 }), uniformCell({ perSpinPayoutMean: 0.85 })],
          [uniformCell({ perSpinPayoutMean: 0.94 }), uniformCell({ perSpinPayoutMean: 0.94 })],
          [uniformCell({ perSpinPayoutMean: 0.99 }), uniformCell({ perSpinPayoutMean: 0.99 })],
        ],
        prizeStructure: { kind: 'winner-take-all' },
      });
      const r10 = solveMultiPoolCrossTournament(cfg(10));
      const r1000 = solveMultiPoolCrossTournament(cfg(1000));
      const ratio = r1000.titleSkewSkillPremium / r10.titleSkewSkillPremium;
      expect(ratio).toBeGreaterThan(1.5);
      expect(ratio).toBeLessThan(2);
    });
  });

  describe('best/worst title identification', () => {
    it('bestTitleByMean = argmax μ; worstTitleByMean = argmin μ', () => {
      const cfg: MultiPoolCrossTournamentConfig = {
        ...baseCfg,
        titleDayGrid: [
          [uniformCell({ perSpinPayoutMean: 0.93 }), uniformCell({ perSpinPayoutMean: 0.93 })],
          [uniformCell({ perSpinPayoutMean: 0.97 }), uniformCell({ perSpinPayoutMean: 0.97 })],
          [uniformCell({ perSpinPayoutMean: 0.91 }), uniformCell({ perSpinPayoutMean: 0.91 })],
        ],
      };
      const r = solveMultiPoolCrossTournament(cfg);
      expect(r.bestTitleByMean).toBe(1);
      expect(r.worstTitleByMean).toBe(2);
    });
  });

  describe('acceptance — 6 industry-config network tournaments', () => {
    const configs: Array<{ name: string; cfg: MultiPoolCrossTournamentConfig }> = [
      {
        name: 'Pragmatic Drops & Wins — 50 titles × 7 days × 1000 players',
        cfg: {
          nPlayers: 1000,
          titleDayGrid: Array.from({ length: 50 }, () =>
            Array.from({ length: 7 }, () =>
              uniformCell({ spinsPerPlayer: 50, contributionRate: 0.01 }),
            ),
          ),
          prizeStructure: {
            kind: 'percentile-bracket',
            brackets: [
              { topPercentile: 0.01, shareOfPool: 0.4 },
              { topPercentile: 0.05, shareOfPool: 0.3 },
              { topPercentile: 0.2, shareOfPool: 0.3 },
            ],
          },
        },
      },
      {
        name: 'BTG Megaways Race — 20 titles × 7 days × 500 players',
        cfg: {
          nPlayers: 500,
          titleDayGrid: Array.from({ length: 20 }, () =>
            Array.from({ length: 7 }, () =>
              uniformCell({ spinsPerPlayer: 20, contributionRate: 0.015 }),
            ),
          ),
          prizeStructure: { kind: 'exponential-decay', topN: 50, alpha: 0.3 },
          multiDayPolicy: 'cumulative',
        },
      },
      {
        name: 'IGT TournXpress — 5 titles × 1 day × 50 players (operator-funded WTA)',
        cfg: {
          nPlayers: 50,
          titleDayGrid: Array.from({ length: 5 }, () => [
            uniformCell({ spinsPerPlayer: 500, contributionRate: 0.1 }),
          ]),
          prizeStructure: { kind: 'winner-take-all' },
        },
      },
      {
        name: 'L&W WinPower — 15 titles × 7 days × 300 players (per-day reset)',
        cfg: {
          nPlayers: 300,
          titleDayGrid: Array.from({ length: 15 }, () =>
            Array.from({ length: 7 }, () =>
              uniformCell({ spinsPerPlayer: 80, contributionRate: 0.02 }),
            ),
          ),
          prizeStructure: { kind: 'exponential-decay', topN: 20, alpha: 0.4 },
          multiDayPolicy: 'per-day-reset',
        },
      },
      {
        name: 'Hacksaw Race — 12 titles × 3 days × 200 players Top-10 flat',
        cfg: {
          nPlayers: 200,
          titleDayGrid: Array.from({ length: 12 }, () =>
            Array.from({ length: 3 }, () =>
              uniformCell({ spinsPerPlayer: 100, contributionRate: 0.03 }),
            ),
          ),
          prizeStructure: { kind: 'top-n-flat', topN: 10 },
        },
      },
      {
        name: 'Vendor B Cross-Property — 25 titles × 7 days × 1000 players',
        cfg: {
          nPlayers: 1000,
          titleDayGrid: Array.from({ length: 25 }, () =>
            Array.from({ length: 7 }, () =>
              uniformCell({ spinsPerPlayer: 60, contributionRate: 0.018 }),
            ),
          ),
          prizeStructure: {
            kind: 'percentile-bracket',
            brackets: [
              { topPercentile: 0.01, shareOfPool: 0.5 },
              { topPercentile: 0.05, shareOfPool: 0.3 },
              { topPercentile: 0.25, shareOfPool: 0.2 },
            ],
          },
        },
      },
    ];

    for (const { name, cfg } of configs) {
      it(`[${name}] poolTotal = sum across all (t,d) cells`, () => {
        const r = solveMultiPoolCrossTournament(cfg);
        let expected = 0;
        for (const row of cfg.titleDayGrid) {
          for (const c of row) {
            expected += cfg.nPlayers * c.spinsPerPlayer * c.contributionRate * c.betPerSpin;
          }
        }
        expect(r.poolTotal).toBeCloseTo(expected, 6);
      });

      it(`[${name}] perTitle.shareOfPool sums to 1`, () => {
        const r = solveMultiPoolCrossTournament(cfg);
        const sum = r.perTitle.reduce((a, t) => a + t.shareOfPool, 0);
        expect(sum).toBeCloseTo(1, 9);
      });

      it(`[${name}] expectedPrizePerPlayer = poolPaidOut / N`, () => {
        const r = solveMultiPoolCrossTournament(cfg);
        expect(r.expectedPrizePerPlayer).toBeCloseTo(r.poolPaidOut / cfg.nPlayers, 9);
      });

      it(`[${name}] varianceSessionTotal additive over all (t,d) cells`, () => {
        const r = solveMultiPoolCrossTournament(cfg);
        let expected = 0;
        for (const row of cfg.titleDayGrid) {
          for (const c of row) {
            expected += c.spinsPerPlayer * c.perSpinPayoutVariance * c.betPerSpin * c.betPerSpin;
          }
        }
        expect(r.varianceSessionTotal).toBeCloseTo(expected, 6);
      });
    }
  });
});
