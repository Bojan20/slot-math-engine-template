// W203 / PHASE 9.3 — Skill-Based Variance-Adjusted Ranking vitest specs
// (106. solver, UKGC RTS-12 2024 bet-size-fair tournament).

import { describe, it, expect } from 'vitest';
import {
  solveSkillVarianceAdjustedRanking,
  simulateSkillVarianceAdjustedRanking,
  type SkillVarianceAdjustedRankingConfig,
  type SkillRankingPlayerConfig,
} from '../src/features/skillVarianceAdjustedRanking.js';

function mkPlayer(over: Partial<SkillRankingPlayerConfig> = {}): SkillRankingPlayerConfig {
  return {
    mean: 0.94,
    variance: 4.0,
    betSize: 1,
    ...over,
  };
}

const flatCfg: SkillVarianceAdjustedRankingConfig = {
  players: [mkPlayer({ label: 'p1' }), mkPlayer({ label: 'p2' }), mkPlayer({ label: 'p3' })],
  spinsPerPlayer: 100,
  contributionRate: 0.02,
};

const mixedCfg: SkillVarianceAdjustedRankingConfig = {
  players: [
    mkPlayer({ label: 'low-bet', betSize: 1 }),
    mkPlayer({ label: 'mid-bet', betSize: 5 }),
    mkPlayer({ label: 'high-bet', betSize: 25 }),
  ],
  spinsPerPlayer: 100,
  contributionRate: 0.02,
};

describe('W203 — Skill-Based Variance-Adjusted Ranking', () => {
  describe('validation', () => {
    it('rejects players array of length < 2', () => {
      expect(() =>
        solveSkillVarianceAdjustedRanking({ ...flatCfg, players: [mkPlayer()] }),
      ).toThrow();
      expect(() =>
        solveSkillVarianceAdjustedRanking({ ...flatCfg, players: [] }),
      ).toThrow();
    });

    it('rejects spinsPerPlayer < 1', () => {
      expect(() =>
        solveSkillVarianceAdjustedRanking({ ...flatCfg, spinsPerPlayer: 0 }),
      ).toThrow();
    });

    it('rejects contributionRate outside [0, 1]', () => {
      expect(() =>
        solveSkillVarianceAdjustedRanking({ ...flatCfg, contributionRate: -0.1 }),
      ).toThrow();
      expect(() =>
        solveSkillVarianceAdjustedRanking({ ...flatCfg, contributionRate: 1.1 }),
      ).toThrow();
    });

    it('rejects per-player negative values', () => {
      expect(() =>
        solveSkillVarianceAdjustedRanking({
          ...flatCfg,
          players: [mkPlayer({ mean: -1 }), mkPlayer()],
        }),
      ).toThrow();
      expect(() =>
        solveSkillVarianceAdjustedRanking({
          ...flatCfg,
          players: [mkPlayer({ variance: -1 }), mkPlayer()],
        }),
      ).toThrow();
      expect(() =>
        solveSkillVarianceAdjustedRanking({
          ...flatCfg,
          players: [mkPlayer({ betSize: 0 }), mkPlayer()],
        }),
      ).toThrow();
    });

    it('rejects non-finite priorRoiDelta', () => {
      expect(() =>
        solveSkillVarianceAdjustedRanking({
          ...flatCfg,
          players: [mkPlayer({ priorRoiDelta: Infinity }), mkPlayer()],
        }),
      ).toThrow();
    });
  });

  describe('pool structure (flat stakes)', () => {
    it('poolTotal = Σ S · c · bet', () => {
      const r = solveSkillVarianceAdjustedRanking(flatCfg);
      // 3 players × 100 × 0.02 × 1 = 6
      expect(r.poolTotal).toBe(6);
    });

    it('fundingShareSum = 1', () => {
      const r = solveSkillVarianceAdjustedRanking(flatCfg);
      expect(r.fundingShareSum).toBeCloseTo(1, 12);
    });

    it('flat stakes: every player fundingShare = 1/N', () => {
      const r = solveSkillVarianceAdjustedRanking(flatCfg);
      for (const p of r.perPlayer) {
        expect(p.fundingShare).toBeCloseTo(1 / 3, 12);
      }
    });

    it('flat stakes: BSHF = 1 for all', () => {
      const r = solveSkillVarianceAdjustedRanking(flatCfg);
      for (const p of r.perPlayer) {
        expect(p.betSizeHandicapFactor).toBeCloseTo(1, 12);
      }
    });
  });

  describe('pool structure (mixed stakes)', () => {
    it('poolTotal scales with bet sum', () => {
      const r = solveSkillVarianceAdjustedRanking(mixedCfg);
      // (1 + 5 + 25) × 100 × 0.02 = 62
      expect(r.poolTotal).toBe(62);
    });

    it('high-bet player fundingShare > low-bet player', () => {
      const r = solveSkillVarianceAdjustedRanking(mixedCfg);
      expect(r.perPlayer[2].fundingShare).toBeGreaterThan(r.perPlayer[0].fundingShare);
      expect(r.perPlayer[2].fundingShare).toBeCloseTo(25 / 31, 9);
      expect(r.perPlayer[0].fundingShare).toBeCloseTo(1 / 31, 9);
    });

    it('BSHF reflects bet ratio', () => {
      const r = solveSkillVarianceAdjustedRanking(mixedCfg);
      expect(r.perPlayer[2].betSizeHandicapFactor).toBeCloseTo(1, 9); // max-bet
      expect(r.perPlayer[1].betSizeHandicapFactor).toBeCloseTo(5 / 25, 9);
      expect(r.perPlayer[0].betSizeHandicapFactor).toBeCloseTo(1 / 25, 9);
    });

    it('audit reports min/max funding share indices', () => {
      const r = solveSkillVarianceAdjustedRanking(mixedCfg);
      expect(r.audit.minFundingShareIndex).toBe(0); // low-bet
      expect(r.audit.maxFundingShareIndex).toBe(2); // high-bet
    });

    it('betSpread / betSpreadRatio reported', () => {
      const r = solveSkillVarianceAdjustedRanking(mixedCfg);
      expect(r.betSpread).toBe(24);
      expect(r.betSpreadRatio).toBeCloseTo(25, 9);
    });
  });

  describe('expected raw session total', () => {
    it('E[T_raw] = S · μ · bet for each player', () => {
      const r = solveSkillVarianceAdjustedRanking(mixedCfg);
      expect(r.perPlayer[0].expectedRawSessionTotal).toBeCloseTo(100 * 0.94 * 1, 9);
      expect(r.perPlayer[1].expectedRawSessionTotal).toBeCloseTo(100 * 0.94 * 5, 9);
      expect(r.perPlayer[2].expectedRawSessionTotal).toBeCloseTo(100 * 0.94 * 25, 9);
    });

    it('rawSessionStdDev = bet · σ · √S', () => {
      const r = solveSkillVarianceAdjustedRanking(mixedCfg);
      expect(r.perPlayer[2].rawSessionStdDev).toBeCloseTo(25 * 2 * 10, 9);
    });
  });

  describe('skill premium (Gumbel currency)', () => {
    it('skillPremiumCurrency = √(2·ln N) · σ_T per player', () => {
      const r = solveSkillVarianceAdjustedRanking(flatCfg);
      const sigmaT = 1 * 2 * 10; // bet=1, σ=2, √S=10
      const expected = Math.sqrt(2 * Math.log(3)) * sigmaT;
      for (const p of r.perPlayer) {
        expect(p.skillPremiumCurrency).toBeCloseTo(expected, 6);
      }
    });

    it('high-bet player has larger skill premium currency (raw mode)', () => {
      const r = solveSkillVarianceAdjustedRanking(mixedCfg);
      expect(r.perPlayer[2].skillPremiumCurrency).toBeGreaterThan(
        r.perPlayer[0].skillPremiumCurrency * 20,
      );
    });
  });

  describe('bet-fairness adjustment metrics', () => {
    it('flat stakes: rawRankingMaxBetAdvantage = 0', () => {
      const r = solveSkillVarianceAdjustedRanking(flatCfg);
      expect(r.rawRankingMaxBetAdvantage).toBeCloseTo(0, 9);
    });

    it('mixed stakes: rawRankingMaxBetAdvantage > 0', () => {
      const r = solveSkillVarianceAdjustedRanking(mixedCfg);
      expect(r.rawRankingMaxBetAdvantage).toBeGreaterThan(0);
    });

    it('adjustedRankingMaxBetAdvantage = 0 by design', () => {
      const r = solveSkillVarianceAdjustedRanking(mixedCfg);
      expect(r.adjustedRankingMaxBetAdvantage).toBe(0);
    });

    it('fairnessGainFromAdjustment = raw − adjusted', () => {
      const r = solveSkillVarianceAdjustedRanking(mixedCfg);
      expect(r.fairnessGainFromAdjustment).toBeCloseTo(r.rawRankingMaxBetAdvantage, 9);
    });

    it('sessionStdDevSpread + ratio reported', () => {
      const r = solveSkillVarianceAdjustedRanking(mixedCfg);
      expect(r.audit.sessionStdDevSpread).toBeGreaterThan(0);
      expect(r.audit.sessionStdDevRatio).toBeCloseTo(25, 6);
    });
  });

  describe('prior-ROI handicap', () => {
    it('priorRoiHandicapActive = false when no shifts', () => {
      const r = solveSkillVarianceAdjustedRanking(flatCfg);
      expect(r.audit.priorRoiHandicapActive).toBe(false);
    });

    it('priorRoiHandicapActive = true when shift present', () => {
      const r = solveSkillVarianceAdjustedRanking({
        ...flatCfg,
        players: [mkPlayer({ priorRoiDelta: 0.5 }), mkPlayer(), mkPlayer()],
      });
      expect(r.audit.priorRoiHandicapActive).toBe(true);
    });

    it('priorRoiDelta echoed in per-player rows', () => {
      const r = solveSkillVarianceAdjustedRanking({
        ...flatCfg,
        players: [
          mkPlayer({ priorRoiDelta: 0.5 }),
          mkPlayer({ priorRoiDelta: -0.3 }),
          mkPlayer(),
        ],
      });
      expect(r.perPlayer[0].priorRoiDelta).toBe(0.5);
      expect(r.perPlayer[1].priorRoiDelta).toBe(-0.3);
      expect(r.perPlayer[2].priorRoiDelta).toBe(0);
    });
  });

  describe('MC convergence — bet-size fairness empirical proof', () => {
    it('mixed stakes RAW: top-rank frequency favours high-bet player', () => {
      const mc = simulateSkillVarianceAdjustedRanking(mixedCfg, 50_000);
      // High-bet player should win much more under RAW
      expect(mc.rawTopRankFrequency[2]).toBeGreaterThan(0.4);
      // Low-bet player should win much less under RAW
      expect(mc.rawTopRankFrequency[0]).toBeLessThan(0.2);
    });

    it('mixed stakes ADJUSTED: top-rank frequency ≈ uniform 1/N', () => {
      const mc = simulateSkillVarianceAdjustedRanking(mixedCfg, 50_000);
      for (const f of mc.adjustedTopRankFrequency) {
        expect(f).toBeGreaterThan(0.28); // ~1/3 − noise
        expect(f).toBeLessThan(0.38); // ~1/3 + noise
      }
    });

    it('adjusted std-dev << raw std-dev (fairness gain)', () => {
      const mc = simulateSkillVarianceAdjustedRanking(mixedCfg, 50_000);
      expect(mc.adjustedTopRankFrequencyStdDev).toBeLessThan(
        mc.rawTopRankFrequencyStdDev * 0.2,
      );
    });

    it('adjusted spread < raw spread for mixed stakes', () => {
      const mc = simulateSkillVarianceAdjustedRanking(mixedCfg, 50_000);
      expect(mc.adjustedTopRankFrequencySpread).toBeLessThan(
        mc.rawTopRankFrequencySpread * 0.3,
      );
    });

    it('flat stakes: raw ≈ adjusted (no fairness gap to close)', () => {
      const mc = simulateSkillVarianceAdjustedRanking(flatCfg, 30_000);
      expect(mc.rawTopRankFrequencyStdDev).toBeCloseTo(
        mc.adjustedTopRankFrequencyStdDev,
        2,
      );
    });

    it('Σ top-rank frequency = 1 (one winner per tournament)', () => {
      const mc = simulateSkillVarianceAdjustedRanking(mixedCfg, 10_000);
      const sumRaw = mc.rawTopRankFrequency.reduce((a, b) => a + b, 0);
      const sumAdj = mc.adjustedTopRankFrequency.reduce((a, b) => a + b, 0);
      expect(sumRaw).toBeCloseTo(1, 6);
      expect(sumAdj).toBeCloseTo(1, 6);
    });

    it('prior-ROI handicap shifts adjusted rank toward boosted player', () => {
      const cfg: SkillVarianceAdjustedRankingConfig = {
        ...flatCfg,
        players: [
          mkPlayer({ label: 'boosted', priorRoiDelta: 1.5 }),
          mkPlayer({ label: 'baseline' }),
          mkPlayer({ label: 'baseline' }),
        ],
      };
      const mc = simulateSkillVarianceAdjustedRanking(cfg, 20_000);
      // Boosted player should win > 1/3 under adjusted ranking
      expect(mc.adjustedTopRankFrequency[0]).toBeGreaterThan(0.5);
    });

    it('deterministic with fixed seed', () => {
      const mc1 = simulateSkillVarianceAdjustedRanking(mixedCfg, 1_000, 42);
      const mc2 = simulateSkillVarianceAdjustedRanking(mixedCfg, 1_000, 42);
      expect(mc1.rawTopRankFrequency).toEqual(mc2.rawTopRankFrequency);
      expect(mc1.adjustedTopRankFrequency).toEqual(mc2.adjustedTopRankFrequency);
    });
  });

  describe('acceptance — 6 industry-config bet-fair tournaments', () => {
    const buildPlayers = (n: number, betFn: (i: number) => number): SkillRankingPlayerConfig[] => {
      const out: SkillRankingPlayerConfig[] = [];
      for (let i = 0; i < n; i++) {
        out.push({ mean: 0.94, variance: 4.0, betSize: betFn(i), label: `p${i}` });
      }
      return out;
    };

    const configs: Array<{ name: string; cfg: SkillVarianceAdjustedRankingConfig }> = [
      {
        name: 'UKGC tournament — 50 players, uniform bet 1',
        cfg: {
          players: buildPlayers(50, () => 1),
          spinsPerPlayer: 200,
          contributionRate: 0.02,
        },
      },
      {
        name: 'Pragmatic D&W — 100 players, bet ∈ {0.5, 1, 2, 5, 10}',
        cfg: {
          players: buildPlayers(100, (i) => [0.5, 1, 2, 5, 10][i % 5]),
          spinsPerPlayer: 150,
          contributionRate: 0.01,
        },
      },
      {
        name: 'IGT VIP TournXpress — 20 players, bet escalating 1..40',
        cfg: {
          players: buildPlayers(20, (i) => 1 + i * 2),
          spinsPerPlayer: 300,
          contributionRate: 0.05,
        },
      },
      {
        name: 'Hacksaw mixed pool — 50 players, bet log-uniform 1..100',
        cfg: {
          players: buildPlayers(50, (i) => Math.pow(10, (i / 49) * 2)),
          spinsPerPlayer: 100,
          contributionRate: 0.03,
        },
      },
      {
        name: 'BTG flat-stake fair — 200 players, bet = 1',
        cfg: {
          players: buildPlayers(200, () => 1),
          spinsPerPlayer: 250,
          contributionRate: 0.015,
        },
      },
      {
        name: 'L&W VIP — 10 players, bet ∈ {5, 5, 10, 10, 20, 20, 50, 50, 100, 100}',
        cfg: {
          players: buildPlayers(10, (i) => [5, 5, 10, 10, 20, 20, 50, 50, 100, 100][i]),
          spinsPerPlayer: 500,
          contributionRate: 0.1,
        },
      },
    ];

    for (const { name, cfg } of configs) {
      it(`[${name}] poolTotal = Σ S·c·bet`, () => {
        const r = solveSkillVarianceAdjustedRanking(cfg);
        let expected = 0;
        for (const p of cfg.players) expected += cfg.spinsPerPlayer * cfg.contributionRate * p.betSize;
        expect(r.poolTotal).toBeCloseTo(expected, 6);
      });

      it(`[${name}] fundingShareSum = 1`, () => {
        const r = solveSkillVarianceAdjustedRanking(cfg);
        expect(r.fundingShareSum).toBeCloseTo(1, 9);
      });

      it(`[${name}] adjustedRankingMaxBetAdvantage = 0`, () => {
        const r = solveSkillVarianceAdjustedRanking(cfg);
        expect(r.adjustedRankingMaxBetAdvantage).toBe(0);
      });

      it(`[${name}] fairnessGainFromAdjustment ≥ 0`, () => {
        const r = solveSkillVarianceAdjustedRanking(cfg);
        expect(r.fairnessGainFromAdjustment).toBeGreaterThanOrEqual(0);
      });
    }
  });
});
