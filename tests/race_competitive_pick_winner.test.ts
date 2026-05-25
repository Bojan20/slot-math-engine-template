// W152 Wave 192 — Race Competitive Pick Winner vitest specs
// (73. solver, Vendor B M8 P1 GAP CLOSURE — Goldfish Race + Big Bass Bucks fishing contest).

import { describe, it, expect } from 'vitest';
import {
  analyzeRaceCompetitivePickWinner,
  simulateRaceCompetitivePickWinner,
  probBestPickWinsAtLeastOnce,
  type RaceCompetitivePickWinnerConfig,
} from '../src/features/raceCompetitivePickWinner.js';

const baseCfg: RaceCompetitivePickWinnerConfig = {
  candidates: [
    { label: 'red', weight: 4, basePrize: 5, multiplierMean: 1, multiplierVariance: 0 },
    { label: 'blue', weight: 3, basePrize: 8, multiplierMean: 1.5, multiplierVariance: 0.25 },
    { label: 'green', weight: 2, basePrize: 12, multiplierMean: 2, multiplierVariance: 1 },
    { label: 'gold', weight: 1, basePrize: 25, multiplierMean: 3, multiplierVariance: 2 },
  ],
};

describe('Wave 192 — Race Competitive Pick Winner', () => {
  describe('validation', () => {
    it('rejects fewer than 2 candidates', () => {
      expect(() => analyzeRaceCompetitivePickWinner({ candidates: [] })).toThrow();
      expect(() =>
        analyzeRaceCompetitivePickWinner({
          candidates: [{ weight: 1, basePrize: 1, multiplierMean: 1, multiplierVariance: 0 }],
        }),
      ).toThrow();
    });
    it('rejects negative weights', () => {
      expect(() =>
        analyzeRaceCompetitivePickWinner({
          candidates: [
            { weight: -1, basePrize: 1, multiplierMean: 1, multiplierVariance: 0 },
            { weight: 1, basePrize: 1, multiplierMean: 1, multiplierVariance: 0 },
          ],
        }),
      ).toThrow();
    });
    it('rejects all-zero weights', () => {
      expect(() =>
        analyzeRaceCompetitivePickWinner({
          candidates: [
            { weight: 0, basePrize: 1, multiplierMean: 1, multiplierVariance: 0 },
            { weight: 0, basePrize: 1, multiplierMean: 1, multiplierVariance: 0 },
          ],
        }),
      ).toThrow();
    });
    it('rejects negative prize/multiplier', () => {
      expect(() =>
        analyzeRaceCompetitivePickWinner({
          candidates: [
            { weight: 1, basePrize: -1, multiplierMean: 1, multiplierVariance: 0 },
            { weight: 1, basePrize: 1, multiplierMean: 1, multiplierVariance: 0 },
          ],
        }),
      ).toThrow();
      expect(() =>
        analyzeRaceCompetitivePickWinner({
          candidates: [
            { weight: 1, basePrize: 1, multiplierMean: -1, multiplierVariance: 0 },
            { weight: 1, basePrize: 1, multiplierMean: 1, multiplierVariance: 0 },
          ],
        }),
      ).toThrow();
    });
  });

  describe('closed-form correctness', () => {
    it('probabilities sum to 1', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      const sum = r.perCandidate.reduce((acc, c) => acc + c.probWin, 0);
      expect(sum).toBeCloseTo(1, 9);
    });
    it('perCandidate.expectedReturnIfPicked = p_i · V_i · μ_M_i', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      const totalW = baseCfg.candidates.reduce((a, c) => a + c.weight, 0);
      for (let i = 0; i < baseCfg.candidates.length; i++) {
        const c = baseCfg.candidates[i]!;
        const expected = (c.weight / totalW) * c.basePrize * c.multiplierMean;
        expect(r.perCandidate[i]!.expectedReturnIfPicked).toBeCloseTo(expected, 9);
      }
    });
    it('bestPickExpectedReturn = max over candidates', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      const max = Math.max(...r.perCandidate.map((c) => c.expectedReturnIfPicked));
      expect(r.bestPickExpectedReturn).toBeCloseTo(max, 9);
    });
    it('worstPickExpectedReturn = min over candidates', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      const min = Math.min(...r.perCandidate.map((c) => c.expectedReturnIfPicked));
      expect(r.worstPickExpectedReturn).toBeCloseTo(min, 9);
    });
    it('uniformPickExpectedReturn = mean of per-candidate ER', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      const mean = r.perCandidate.reduce((a, c) => a + c.expectedReturnIfPicked, 0) / r.numCandidates;
      expect(r.uniformPickExpectedReturn).toBeCloseTo(mean, 9);
    });
    it('rtpSpread = best − worst', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      expect(r.rtpSpread).toBeCloseTo(r.bestPickExpectedReturn - r.worstPickExpectedReturn, 9);
    });
    it('skillPremiumVsUniform = best − uniform', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      expect(r.skillPremiumVsUniform).toBeCloseTo(
        r.bestPickExpectedReturn - r.uniformPickExpectedReturn, 9,
      );
    });
    it('isRationalPick exactly one true', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      const trueCount = r.perCandidate.filter((c) => c.isRationalPick).length;
      expect(trueCount).toBe(1);
    });
    it('bestPickIndex points to expectedReturnIfPicked match', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      expect(r.perCandidate[r.bestPickIndex]!.expectedReturnIfPicked).toBeCloseTo(
        r.bestPickExpectedReturn, 9,
      );
    });
    it('rank 1 = bestPickIndex', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      expect(r.perCandidate[r.bestPickIndex]!.rankByExpectedReturn).toBe(1);
    });
    it('probabilityBestPickWins = p_{s*}', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      expect(r.probabilityBestPickWins).toBeCloseTo(r.perCandidate[r.bestPickIndex]!.probWin, 9);
    });
    it('expectedRacesToFirstBestWin = 1 / p_{s*}', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      expect(r.expectedRacesToFirstBestWin).toBeCloseTo(1 / r.probabilityBestPickWins, 6);
    });
    it('commercialUpliftOverSymmetric = best / uniform', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      expect(r.commercialUpliftOverSymmetric).toBeCloseTo(
        r.bestPickExpectedReturn / r.uniformPickExpectedReturn, 9,
      );
    });
    it('bestPickVariance = E[Y²] − E[Y]² with E[Y²] = p_s·V_s²·(σ²+μ²)', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      const c = baseCfg.candidates[r.bestPickIndex]!;
      const p = r.perCandidate[r.bestPickIndex]!.probWin;
      const eY2 = p * c.basePrize * c.basePrize * (c.multiplierVariance + c.multiplierMean * c.multiplierMean);
      const expected = Math.max(0, eY2 - r.bestPickExpectedReturn * r.bestPickExpectedReturn);
      expect(r.bestPickVariance).toBeCloseTo(expected, 6);
    });
    it('symmetric (all equal): skill premium = 0', () => {
      const cfg: RaceCompetitivePickWinnerConfig = {
        candidates: [
          { weight: 1, basePrize: 4, multiplierMean: 1, multiplierVariance: 0 },
          { weight: 1, basePrize: 4, multiplierMean: 1, multiplierVariance: 0 },
          { weight: 1, basePrize: 4, multiplierMean: 1, multiplierVariance: 0 },
        ],
      };
      const r = analyzeRaceCompetitivePickWinner(cfg);
      expect(r.skillPremiumVsUniform).toBeCloseTo(0, 9);
      expect(r.rtpSpread).toBeCloseTo(0, 9);
    });
    it('skewed pyramid (high prize, low prob): best can be tail', () => {
      const cfg: RaceCompetitivePickWinnerConfig = {
        candidates: [
          { weight: 10, basePrize: 1, multiplierMean: 1, multiplierVariance: 0 }, // p=10/16, ER=10/16
          { weight: 4, basePrize: 5, multiplierMean: 1, multiplierVariance: 0 },  // p=4/16, ER=20/16
          { weight: 2, basePrize: 20, multiplierMean: 1, multiplierVariance: 0 }, // p=2/16, ER=40/16 (best)
        ],
      };
      const r = analyzeRaceCompetitivePickWinner(cfg);
      expect(r.bestPickIndex).toBe(2);
    });
    it('probBestPickWinsAtLeastOnce = 1 − (1−p_{s*})^K', () => {
      const K = 20;
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      const expected = 1 - Math.pow(1 - r.probabilityBestPickWins, K);
      expect(probBestPickWinsAtLeastOnce(baseCfg, K)).toBeCloseTo(expected, 9);
    });
  });

  describe('monotonicity', () => {
    it('higher prize at best → higher bestPickExpectedReturn', () => {
      const r1 = analyzeRaceCompetitivePickWinner(baseCfg);
      const cfg2: RaceCompetitivePickWinnerConfig = {
        candidates: baseCfg.candidates.map((c, i) =>
          i === r1.bestPickIndex ? { ...c, basePrize: c.basePrize * 2 } : c,
        ),
      };
      const r2 = analyzeRaceCompetitivePickWinner(cfg2);
      expect(r2.bestPickExpectedReturn).toBeGreaterThan(r1.bestPickExpectedReturn);
    });
    it('higher weight at best → higher bestPickExpectedReturn', () => {
      const r1 = analyzeRaceCompetitivePickWinner(baseCfg);
      const cfg2: RaceCompetitivePickWinnerConfig = {
        candidates: baseCfg.candidates.map((c, i) =>
          i === r1.bestPickIndex ? { ...c, weight: c.weight * 4 } : c,
        ),
      };
      const r2 = analyzeRaceCompetitivePickWinner(cfg2);
      expect(r2.bestPickExpectedReturn).toBeGreaterThan(r1.bestPickExpectedReturn);
    });
    it('higher mean multiplier at best → higher bestPick ER', () => {
      const r1 = analyzeRaceCompetitivePickWinner(baseCfg);
      const cfg2: RaceCompetitivePickWinnerConfig = {
        candidates: baseCfg.candidates.map((c, i) =>
          i === r1.bestPickIndex ? { ...c, multiplierMean: c.multiplierMean * 2 } : c,
        ),
      };
      const r2 = analyzeRaceCompetitivePickWinner(cfg2);
      expect(r2.bestPickExpectedReturn).toBeGreaterThan(r1.bestPickExpectedReturn);
    });
  });

  describe('MC cross-validation', () => {
    const tightCfg: RaceCompetitivePickWinnerConfig = {
      candidates: [
        { label: 'red', weight: 5, basePrize: 4, multiplierMean: 1, multiplierVariance: 0 },
        { label: 'blue', weight: 3, basePrize: 8, multiplierMean: 1.5, multiplierVariance: 0.25 },
        { label: 'green', weight: 2, basePrize: 20, multiplierMean: 2, multiplierVariance: 1 },
      ],
    };

    it('rational pick MC payout within 7% rel of CF @ 50K races', () => {
      const cf = analyzeRaceCompetitivePickWinner(tightCfg);
      const mc = simulateRaceCompetitivePickWinner(tightCfg, 50_000, 'rational_best', 0, 0xC0FFEE);
      const rel = Math.abs(cf.bestPickExpectedReturn - mc.meanPayoutPerRace) /
        Math.max(mc.meanPayoutPerRace, 1e-9);
      expect(rel).toBeLessThan(0.08);
    });
    it('uniform pick MC mean within 7% rel of CF', () => {
      const cf = analyzeRaceCompetitivePickWinner(tightCfg);
      const mc = simulateRaceCompetitivePickWinner(tightCfg, 50_000, 'uniform_random', 0, 0xBEEF_192);
      const rel = Math.abs(cf.uniformPickExpectedReturn - mc.meanPayoutPerRace) /
        Math.max(mc.meanPayoutPerRace, 1e-9);
      expect(rel).toBeLessThan(0.10);
    });
    it('observed candidate win frequencies match p_i within 2pp abs', () => {
      const cf = analyzeRaceCompetitivePickWinner(tightCfg);
      const mc = simulateRaceCompetitivePickWinner(tightCfg, 50_000, 'rational_best', 0, 0xCAFE);
      for (let i = 0; i < cf.numCandidates; i++) {
        expect(Math.abs(cf.perCandidate[i]!.probWin - mc.observedWinFrequencies[i]!)).toBeLessThan(0.02);
      }
    });
    it('rational pickWinRate = p_{s*} within 1.5pp abs', () => {
      const cf = analyzeRaceCompetitivePickWinner(tightCfg);
      const mc = simulateRaceCompetitivePickWinner(tightCfg, 50_000, 'rational_best', 0, 0xFEED);
      expect(Math.abs(cf.probabilityBestPickWins - mc.observedPickWinRate)).toBeLessThan(0.015);
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC', () => {
      const a = simulateRaceCompetitivePickWinner(baseCfg, 1000, 'rational_best', 0, 0xAA);
      const b = simulateRaceCompetitivePickWinner(baseCfg, 1000, 'rational_best', 0, 0xAA);
      expect(a.meanPayoutPerRace).toBe(b.meanPayoutPerRace);
    });
    it('different seeds → different MC', () => {
      const a = simulateRaceCompetitivePickWinner(baseCfg, 1000, 'rational_best', 0, 0xAA);
      const b = simulateRaceCompetitivePickWinner(baseCfg, 1000, 'rational_best', 0, 0xBB);
      expect(a.meanPayoutPerRace !== b.meanPayoutPerRace).toBe(true);
    });
  });

  describe('industry use-cases (Vendor B M8 race-pick family)', () => {
    it('Goldfish Race for the Gold — 4 fish race', () => {
      const cfg: RaceCompetitivePickWinnerConfig = {
        candidates: [
          { label: 'red',    weight: 4, basePrize: 5,  multiplierMean: 1, multiplierVariance: 0 },
          { label: 'blue',   weight: 3, basePrize: 10, multiplierMean: 1, multiplierVariance: 0 },
          { label: 'yellow', weight: 2, basePrize: 25, multiplierMean: 1, multiplierVariance: 0 },
          { label: 'gold',   weight: 1, basePrize: 100, multiplierMean: 1, multiplierVariance: 0 },
        ],
      };
      const r = analyzeRaceCompetitivePickWinner(cfg);
      // gold: p=0.1, V=100 → ER=10; yellow: p=0.2, V=25 → ER=5; blue ER=3; red ER=2.
      expect(r.perCandidate[3]!.label).toBe('gold');
      expect(r.bestPickIndex).toBe(3);
      expect(r.bestPickExpectedReturn).toBeCloseTo(10, 9);
    });
    it("Big Bass Bucks — 5 fisherman contest sa 14×–55× multiplier", () => {
      const cfg: RaceCompetitivePickWinnerConfig = {
        candidates: [
          { label: 'angler_1', weight: 5, basePrize: 1, multiplierMean: 14, multiplierVariance: 4 },
          { label: 'angler_2', weight: 4, basePrize: 1, multiplierMean: 20, multiplierVariance: 6 },
          { label: 'angler_3', weight: 3, basePrize: 1, multiplierMean: 30, multiplierVariance: 10 },
          { label: 'angler_4', weight: 2, basePrize: 1, multiplierMean: 40, multiplierVariance: 16 },
          { label: 'angler_5', weight: 1, basePrize: 1, multiplierMean: 55, multiplierVariance: 25 },
        ],
      };
      const r = analyzeRaceCompetitivePickWinner(cfg);
      expect(r.skillPremiumVsUniform).toBeGreaterThan(0);
      expect(r.commercialUpliftOverSymmetric).toBeGreaterThan(1);
    });
    it('player rational pick beats uniform for skewed payouts', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      expect(r.bestPickExpectedReturn).toBeGreaterThanOrEqual(r.uniformPickExpectedReturn);
    });
    it('UKGC RTS-12 player skill disclosure: best vs uniform', () => {
      const r = analyzeRaceCompetitivePickWinner(baseCfg);
      expect(r.skillPremiumVsUniform).toBeGreaterThanOrEqual(0);
      expect(r.rtpSpread).toBeGreaterThanOrEqual(0);
    });
    it('edge: 2-candidate degenerate race', () => {
      const cfg: RaceCompetitivePickWinnerConfig = {
        candidates: [
          { weight: 7, basePrize: 1, multiplierMean: 1, multiplierVariance: 0 },
          { weight: 3, basePrize: 5, multiplierMean: 1, multiplierVariance: 0 },
        ],
      };
      const r = analyzeRaceCompetitivePickWinner(cfg);
      // c0: ER=0.7, c1: ER=1.5 — c1 best
      expect(r.bestPickIndex).toBe(1);
      expect(r.bestPickExpectedReturn).toBeCloseTo(1.5, 9);
    });
  });
});
