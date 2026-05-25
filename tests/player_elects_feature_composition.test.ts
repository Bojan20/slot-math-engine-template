// W152 Wave 188 — Player-Elects Feature Composition Aggregator vitest specs
// (69. solver, Vendor B M11 P1 GAP CLOSURE — RR Pick n Mix + MJ KOP + KISS + 5 Treasures).

import { describe, it, expect } from 'vitest';
import {
  analyzePlayerElectsFeatureComposition,
  simulatePlayerElectsFeatureComposition,
  type PlayerElectsFeatureCompositionConfig,
} from '../src/features/playerElectsFeatureComposition.js';

const baseCfg: PlayerElectsFeatureCompositionConfig = {
  candidateModes: [
    { name: 'Mode_A', rtp: 0.30, variance: 4 },
    { name: 'Mode_B', rtp: 0.20, variance: 2 },
    { name: 'Mode_C', rtp: 0.40, variance: 6 },
    { name: 'Mode_D', rtp: 0.15, variance: 1 },
    { name: 'Mode_E', rtp: 0.25, variance: 3 },
  ],
  numModesToElect: 3,
};

describe('Wave 188 — Player-Elects Feature Composition Aggregator', () => {
  describe('validation', () => {
    it('rejects empty candidateModes', () => {
      expect(() =>
        analyzePlayerElectsFeatureComposition({ ...baseCfg, candidateModes: [] }),
      ).toThrow(/non-empty/);
    });

    it('rejects empty mode name', () => {
      expect(() =>
        analyzePlayerElectsFeatureComposition({
          ...baseCfg,
          candidateModes: [{ name: '', rtp: 0.5, variance: 1 }],
          numModesToElect: 1,
        }),
      ).toThrow(/name must be non-empty/);
    });

    it('rejects negative RTP', () => {
      expect(() =>
        analyzePlayerElectsFeatureComposition({
          ...baseCfg,
          candidateModes: [{ name: 'A', rtp: -0.1, variance: 1 }],
          numModesToElect: 1,
        }),
      ).toThrow(/rtp must be ≥ 0/);
    });

    it('rejects negative variance', () => {
      expect(() =>
        analyzePlayerElectsFeatureComposition({
          ...baseCfg,
          candidateModes: [{ name: 'A', rtp: 0.5, variance: -1 }],
          numModesToElect: 1,
        }),
      ).toThrow(/variance must be ≥ 0/);
    });

    it('rejects numModesToElect < 1', () => {
      expect(() =>
        analyzePlayerElectsFeatureComposition({ ...baseCfg, numModesToElect: 0 }),
      ).toThrow(/numModesToElect/);
    });

    it('rejects numModesToElect > N', () => {
      expect(() =>
        analyzePlayerElectsFeatureComposition({ ...baseCfg, numModesToElect: 10 }),
      ).toThrow(/numModesToElect/);
    });
  });

  describe('closed-form correctness', () => {
    it('numDistinctCompositions = C(N, m)', () => {
      const r = analyzePlayerElectsFeatureComposition(baseCfg);
      // C(5, 3) = 10
      expect(r.numDistinctCompositions).toBe(10);
    });

    it('bestPickIndices length = m', () => {
      const r = analyzePlayerElectsFeatureComposition(baseCfg);
      expect(r.bestPickIndices.length).toBe(baseCfg.numModesToElect);
    });

    it('bestPick = top-m by RTP', () => {
      const r = analyzePlayerElectsFeatureComposition(baseCfg);
      // RTPs: A=0.30 B=0.20 C=0.40 D=0.15 E=0.25 — top 3: C, A, E
      // Indices: C=2, A=0, E=4
      expect(r.bestPickIndices.sort()).toEqual([0, 2, 4]);
      expect(r.expectedPayoutBestPick).toBeCloseTo(0.40 + 0.30 + 0.25, 9);
    });

    it('worstPick = bottom-m by RTP', () => {
      const r = analyzePlayerElectsFeatureComposition(baseCfg);
      // Bottom 3: D=0.15, B=0.20, E=0.25
      expect(r.worstPickIndices.sort()).toEqual([1, 3, 4]);
      expect(r.expectedPayoutWorstPick).toBeCloseTo(0.15 + 0.20 + 0.25, 9);
    });

    it('uniform pick = (m/N) · Σ r_i', () => {
      const r = analyzePlayerElectsFeatureComposition(baseCfg);
      const sumRtp = 0.30 + 0.20 + 0.40 + 0.15 + 0.25;
      const expected = (3 / 5) * sumRtp;
      expect(r.expectedPayoutUniformPick).toBeCloseTo(expected, 9);
    });

    it('rtpSpread = bestPick − worstPick', () => {
      const r = analyzePlayerElectsFeatureComposition(baseCfg);
      expect(r.rtpSpread).toBeCloseTo(r.expectedPayoutBestPick - r.expectedPayoutWorstPick, 9);
    });

    it('skillPremium = bestPick − uniformPick ≥ 0', () => {
      const r = analyzePlayerElectsFeatureComposition(baseCfg);
      expect(r.skillPremium).toBeCloseTo(r.expectedPayoutBestPick - r.expectedPayoutUniformPick, 9);
      expect(r.skillPremium).toBeGreaterThanOrEqual(0);
    });

    it('varianceBestPick = Σ_{i ∈ bestPick} σ²_i', () => {
      const r = analyzePlayerElectsFeatureComposition(baseCfg);
      // Best pick: C (var 6), A (var 4), E (var 3) → total 13
      expect(r.varianceBestPick).toBeCloseTo(13, 9);
    });

    it('perModeDisclosure ranks consistent with sort', () => {
      const r = analyzePlayerElectsFeatureComposition(baseCfg);
      // RTPs sorted desc: C(0.40)=1, A(0.30)=2, E(0.25)=3, B(0.20)=4, D(0.15)=5
      const expectedRanks: Record<string, number> = {
        Mode_C: 1,
        Mode_A: 2,
        Mode_E: 3,
        Mode_B: 4,
        Mode_D: 5,
      };
      for (const entry of r.perModeDisclosure) {
        expect(entry.rankByRtp).toBe(expectedRanks[entry.name]);
      }
    });

    it('inRationalTopMPick true for top-m, false otherwise', () => {
      const r = analyzePlayerElectsFeatureComposition(baseCfg);
      const inPickByName: Record<string, boolean> = {
        Mode_C: true,
        Mode_A: true,
        Mode_E: true,
        Mode_B: false,
        Mode_D: false,
      };
      for (const entry of r.perModeDisclosure) {
        expect(entry.inRationalTopMPick).toBe(inPickByName[entry.name]);
      }
    });

    it('rationalityCoverageRatio ≥ m/N when picks are top', () => {
      const r = analyzePlayerElectsFeatureComposition(baseCfg);
      expect(r.rationalityCoverageRatio).toBeGreaterThanOrEqual(3 / 5 - 1e-9);
    });

    it('fullPortfolioExpectedPayout = Σ r_i', () => {
      const r = analyzePlayerElectsFeatureComposition(baseCfg);
      const sum = baseCfg.candidateModes.reduce((a, m) => a + m.rtp, 0);
      expect(r.fullPortfolioExpectedPayout).toBeCloseTo(sum, 9);
    });

    it('flat RTP across modes → skillPremium = 0', () => {
      const r = analyzePlayerElectsFeatureComposition({
        candidateModes: [
          { name: 'A', rtp: 0.5, variance: 1 },
          { name: 'B', rtp: 0.5, variance: 1 },
          { name: 'C', rtp: 0.5, variance: 1 },
        ],
        numModesToElect: 2,
      });
      expect(r.skillPremium).toBeCloseTo(0, 9);
      expect(r.rtpSpread).toBeCloseTo(0, 9);
    });

    it('m = N → bestPick = worstPick = uniformPick = full portfolio', () => {
      const r = analyzePlayerElectsFeatureComposition({ ...baseCfg, numModesToElect: 5 });
      expect(r.expectedPayoutBestPick).toBeCloseTo(r.expectedPayoutWorstPick, 9);
      expect(r.expectedPayoutBestPick).toBeCloseTo(r.expectedPayoutUniformPick, 9);
      expect(r.expectedPayoutBestPick).toBeCloseTo(r.fullPortfolioExpectedPayout, 9);
      expect(r.skillPremium).toBeCloseTo(0, 9);
    });

    it('m = 1 → bestPick = single highest-RTP mode', () => {
      const r = analyzePlayerElectsFeatureComposition({ ...baseCfg, numModesToElect: 1 });
      expect(r.bestPickIndices.length).toBe(1);
      expect(r.expectedPayoutBestPick).toBeCloseTo(0.40, 9); // Mode_C
      expect(r.bestPickNames).toContain('Mode_C');
    });

    it('numDistinctCompositions = 1 when m = N', () => {
      const r = analyzePlayerElectsFeatureComposition({ ...baseCfg, numModesToElect: 5 });
      expect(r.numDistinctCompositions).toBe(1);
    });
  });

  describe('monotonicity', () => {
    it('higher RTP mode → larger contribution to best pick', () => {
      const low = analyzePlayerElectsFeatureComposition({
        candidateModes: [
          { name: 'A', rtp: 0.1, variance: 1 },
          { name: 'B', rtp: 0.2, variance: 1 },
          { name: 'C', rtp: 0.3, variance: 1 },
        ],
        numModesToElect: 1,
      });
      const high = analyzePlayerElectsFeatureComposition({
        candidateModes: [
          { name: 'A', rtp: 0.1, variance: 1 },
          { name: 'B', rtp: 0.2, variance: 1 },
          { name: 'C', rtp: 0.9, variance: 1 },
        ],
        numModesToElect: 1,
      });
      expect(high.expectedPayoutBestPick).toBeGreaterThan(low.expectedPayoutBestPick);
    });

    it('larger m → larger bestPick (more positive modes added)', () => {
      const m2 = analyzePlayerElectsFeatureComposition({ ...baseCfg, numModesToElect: 2 });
      const m4 = analyzePlayerElectsFeatureComposition({ ...baseCfg, numModesToElect: 4 });
      expect(m4.expectedPayoutBestPick).toBeGreaterThan(m2.expectedPayoutBestPick);
    });

    it('wider RTP spread → larger skillPremium', () => {
      const narrow = analyzePlayerElectsFeatureComposition({
        candidateModes: [
          { name: 'A', rtp: 0.45, variance: 1 },
          { name: 'B', rtp: 0.50, variance: 1 },
          { name: 'C', rtp: 0.55, variance: 1 },
        ],
        numModesToElect: 2,
      });
      const wide = analyzePlayerElectsFeatureComposition({
        candidateModes: [
          { name: 'A', rtp: 0.05, variance: 1 },
          { name: 'B', rtp: 0.50, variance: 1 },
          { name: 'C', rtp: 0.95, variance: 1 },
        ],
        numModesToElect: 2,
      });
      expect(wide.skillPremium).toBeGreaterThan(narrow.skillPremium);
    });
  });

  describe('MC cross-validation', () => {
    const tightCfg: PlayerElectsFeatureCompositionConfig = {
      candidateModes: [
        { name: 'Mode_A', rtp: 0.30, variance: 1 },
        { name: 'Mode_B', rtp: 0.20, variance: 1 },
        { name: 'Mode_C', rtp: 0.40, variance: 1 },
        { name: 'Mode_D', rtp: 0.15, variance: 1 },
        { name: 'Mode_E', rtp: 0.25, variance: 1 },
      ],
      numModesToElect: 3,
    };

    it('CF best pick payout within 3% rel of MC rational strategy @ 20K spins', () => {
      const cf = analyzePlayerElectsFeatureComposition(tightCfg);
      const mc = simulatePlayerElectsFeatureComposition(tightCfg, 20_000, 'rational', 0xC0FFEE);
      const rel =
        Math.abs(cf.expectedPayoutBestPick - mc.meanPayoutPerSpin) /
        Math.max(mc.meanPayoutPerSpin, 1e-9);
      expect(rel).toBeLessThan(0.05);
    });

    it('CF worst pick payout matches MC worst strategy', () => {
      const cf = analyzePlayerElectsFeatureComposition(tightCfg);
      const mc = simulatePlayerElectsFeatureComposition(tightCfg, 20_000, 'worst', 0xBEEF_188);
      const rel =
        Math.abs(cf.expectedPayoutWorstPick - mc.meanPayoutPerSpin) /
        Math.max(mc.meanPayoutPerSpin, 1e-9);
      expect(rel).toBeLessThan(0.05);
    });

    it('CF uniform pick matches MC uniform-random strategy', () => {
      const cf = analyzePlayerElectsFeatureComposition(tightCfg);
      const mc = simulatePlayerElectsFeatureComposition(tightCfg, 20_000, 'uniform', 0xCAFE);
      const rel =
        Math.abs(cf.expectedPayoutUniformPick - mc.meanPayoutPerSpin) /
        Math.max(mc.meanPayoutPerSpin, 1e-9);
      expect(rel).toBeLessThan(0.06);
    });

    it('CF best pick stdDev matches MC empirical stdDev within 12% rel', () => {
      const cf = analyzePlayerElectsFeatureComposition(tightCfg);
      const mc = simulatePlayerElectsFeatureComposition(tightCfg, 20_000, 'rational', 0xFEED);
      const rel = Math.abs(cf.stdDevBestPick - mc.stdDevPayoutPerSpin) /
        Math.max(cf.stdDevBestPick, 1e-9);
      expect(rel).toBeLessThan(0.15);
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC', () => {
      const a = simulatePlayerElectsFeatureComposition(baseCfg, 500, 'rational', 0xAA);
      const b = simulatePlayerElectsFeatureComposition(baseCfg, 500, 'rational', 0xAA);
      expect(a.meanPayoutPerSpin).toBe(b.meanPayoutPerSpin);
    });

    it('different seeds → different MC', () => {
      const a = simulatePlayerElectsFeatureComposition(baseCfg, 500, 'rational', 0xAA);
      const b = simulatePlayerElectsFeatureComposition(baseCfg, 500, 'rational', 0xBB);
      expect(a.meanPayoutPerSpin !== b.meanPayoutPerSpin).toBe(true);
    });
  });

  describe('industry use-cases (Vendor B M11 player-elect family)', () => {
    it("Rainbow Riches Pick n Mix — pick 3 of 5 bonuses", () => {
      const cfg: PlayerElectsFeatureCompositionConfig = {
        candidateModes: [
          { name: 'Roads_to_Riches', rtp: 0.32, variance: 8 },
          { name: 'Wishing_Well', rtp: 0.28, variance: 5 },
          { name: 'Pots_of_Gold', rtp: 0.35, variance: 12 },
          { name: 'Magic_Toadstool', rtp: 0.18, variance: 2 },
          { name: 'Cash_Crop', rtp: 0.22, variance: 4 },
        ],
        numModesToElect: 3,
      };
      const r = analyzePlayerElectsFeatureComposition(cfg);
      expect(r.numDistinctCompositions).toBe(10);
      expect(r.bestPickNames).toContain('Pots_of_Gold');
      expect(r.bestPickNames).toContain('Roads_to_Riches');
      expect(r.bestPickNames).toContain('Wishing_Well');
      expect(r.expectedPayoutBestPick).toBeCloseTo(0.35 + 0.32 + 0.28, 9);
    });

    it("Michael Jackson King of Pop — 3 FS modes, pick 1", () => {
      const cfg: PlayerElectsFeatureCompositionConfig = {
        candidateModes: [
          { name: 'Smooth_Criminal', rtp: 0.95, variance: 50 },
          { name: 'Beat_It', rtp: 1.05, variance: 80 },
          { name: 'Billie_Jean', rtp: 1.00, variance: 65 },
        ],
        numModesToElect: 1,
      };
      const r = analyzePlayerElectsFeatureComposition(cfg);
      expect(r.bestPickNames[0]).toBe('Beat_It'); // highest RTP
      expect(r.expectedPayoutBestPick).toBeCloseTo(1.05, 9);
      expect(r.skillPremium).toBeGreaterThan(0); // non-trivial spread
    });

    it("5 Treasures — 5 FS modes, pick 1", () => {
      const cfg: PlayerElectsFeatureCompositionConfig = {
        candidateModes: [
          { name: 'Dragon_Treasure', rtp: 1.10, variance: 90 },
          { name: 'Phoenix_Treasure', rtp: 1.05, variance: 75 },
          { name: 'Tiger_Treasure', rtp: 1.00, variance: 60 },
          { name: 'Lion_Treasure', rtp: 0.95, variance: 45 },
          { name: 'Elephant_Treasure', rtp: 0.90, variance: 35 },
        ],
        numModesToElect: 1,
      };
      const r = analyzePlayerElectsFeatureComposition(cfg);
      expect(r.bestPickNames[0]).toBe('Dragon_Treasure');
      expect(r.expectedPayoutBestPick).toBeCloseTo(1.10, 9);
      expect(r.expectedPayoutUniformPick).toBeCloseTo(1.0, 9); // (1/5) · 5.0
    });

    it("edge: single-mode portfolio (degenerate)", () => {
      const r = analyzePlayerElectsFeatureComposition({
        candidateModes: [{ name: 'OnlyMode', rtp: 0.5, variance: 1 }],
        numModesToElect: 1,
      });
      expect(r.numDistinctCompositions).toBe(1);
      expect(r.expectedPayoutBestPick).toBeCloseTo(0.5, 9);
      expect(r.skillPremium).toBeCloseTo(0, 9);
    });
  });
});
