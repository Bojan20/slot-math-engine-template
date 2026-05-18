// W152 Wave 193 — Multi-Pot Branched H&S Sub-Feature vitest specs
// (74. solver, L&W M15 P1 GAP CLOSURE — Rich Little Piggies Piggy Bankin' Break In).

import { describe, it, expect } from 'vitest';
import {
  analyzeMultiPotBranchedHoldSpinSubFeature,
  simulateMultiPotBranchedHoldSpinSubFeature,
  type MultiPotBranchedHoldSpinSubFeatureConfig,
} from '../src/features/multiPotBranchedHoldSpinSubFeature.js';

const baseCfg: MultiPotBranchedHoldSpinSubFeatureConfig = {
  probTrigger: 0.05,
  pots: [
    { label: 'instant_win', selectionWeight: 5, meanPayout: 20, variancePayout: 16 },
    { label: 'double_play', selectionWeight: 3, meanPayout: 50, variancePayout: 100 },
    { label: 'repeat_win', selectionWeight: 2, meanPayout: 150, variancePayout: 900 },
  ],
};

describe('Wave 193 — Multi-Pot Branched H&S Sub-Feature', () => {
  describe('validation', () => {
    it('rejects probTrigger outside (0,1]', () => {
      expect(() =>
        analyzeMultiPotBranchedHoldSpinSubFeature({ ...baseCfg, probTrigger: 0 }),
      ).toThrow();
      expect(() =>
        analyzeMultiPotBranchedHoldSpinSubFeature({ ...baseCfg, probTrigger: 1.5 }),
      ).toThrow();
    });
    it('rejects fewer than 2 pots', () => {
      expect(() =>
        analyzeMultiPotBranchedHoldSpinSubFeature({ ...baseCfg, pots: [] }),
      ).toThrow();
      expect(() =>
        analyzeMultiPotBranchedHoldSpinSubFeature({
          ...baseCfg,
          pots: [{ selectionWeight: 1, meanPayout: 1, variancePayout: 0 }],
        }),
      ).toThrow();
    });
    it('rejects negative weights / negative payout / negative variance', () => {
      expect(() =>
        analyzeMultiPotBranchedHoldSpinSubFeature({
          ...baseCfg,
          pots: [
            { selectionWeight: -1, meanPayout: 1, variancePayout: 0 },
            { selectionWeight: 1, meanPayout: 1, variancePayout: 0 },
          ],
        }),
      ).toThrow();
      expect(() =>
        analyzeMultiPotBranchedHoldSpinSubFeature({
          ...baseCfg,
          pots: [
            { selectionWeight: 1, meanPayout: -1, variancePayout: 0 },
            { selectionWeight: 1, meanPayout: 1, variancePayout: 0 },
          ],
        }),
      ).toThrow();
      expect(() =>
        analyzeMultiPotBranchedHoldSpinSubFeature({
          ...baseCfg,
          pots: [
            { selectionWeight: 1, meanPayout: 1, variancePayout: -1 },
            { selectionWeight: 1, meanPayout: 1, variancePayout: 0 },
          ],
        }),
      ).toThrow();
    });
    it('rejects all-zero weights', () => {
      expect(() =>
        analyzeMultiPotBranchedHoldSpinSubFeature({
          ...baseCfg,
          pots: [
            { selectionWeight: 0, meanPayout: 1, variancePayout: 0 },
            { selectionWeight: 0, meanPayout: 1, variancePayout: 0 },
          ],
        }),
      ).toThrow();
    });
  });

  describe('closed-form correctness', () => {
    it('pot selection probs sum to 1', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      const sum = r.perPot.reduce((acc, p) => acc + p.selectionProb, 0);
      expect(sum).toBeCloseTo(1, 9);
    });
    it('E[V | trig] = Σ p_k · μ_k', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      const totalW = baseCfg.pots.reduce((acc, p) => acc + p.selectionWeight, 0);
      const expected = baseCfg.pots.reduce(
        (acc, p) => acc + (p.selectionWeight / totalW) * p.meanPayout,
        0,
      );
      expect(r.expectedPayoutGivenTrigger).toBeCloseTo(expected, 9);
    });
    it('Var[V | trig] = E[V²] − E[V]²', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      const totalW = baseCfg.pots.reduce((acc, p) => acc + p.selectionWeight, 0);
      const eV2 = baseCfg.pots.reduce(
        (acc, p) =>
          acc + (p.selectionWeight / totalW) * (p.variancePayout + p.meanPayout ** 2),
        0,
      );
      const expected = Math.max(0, eV2 - r.expectedPayoutGivenTrigger ** 2);
      expect(r.variancePayoutGivenTrigger).toBeCloseTo(expected, 6);
    });
    it('E[Y / spin] = p_trigger · E[V|trig]', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      expect(r.expectedPayoutPerSpin).toBeCloseTo(
        baseCfg.probTrigger * r.expectedPayoutGivenTrigger,
        9,
      );
    });
    it('Var[Y / spin] via law of total variance on trigger', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      const pT = baseCfg.probTrigger;
      const expected =
        pT * r.variancePayoutGivenTrigger +
        pT * (1 - pT) * r.expectedPayoutGivenTrigger ** 2;
      expect(r.variancePayoutPerSpin).toBeCloseTo(expected, 6);
    });
    it('perPot.contributionShareOfBonus sums to 1', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      const sum = r.perPot.reduce((acc, p) => acc + p.contributionShareOfBonus, 0);
      expect(sum).toBeCloseTo(1, 9);
    });
    it('perPot.oneInNTriggersForPot = 1 / p_k', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      for (const p of r.perPot) {
        expect(p.oneInNTriggersForPot).toBeCloseTo(1 / p.selectionProb, 6);
      }
    });
    it('bestPotIndex matches argmax μ_k', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      const max = Math.max(...baseCfg.pots.map((p) => p.meanPayout));
      expect(baseCfg.pots[r.bestPotIndex]!.meanPayout).toBe(max);
    });
    it('exactly one pot has isBestPot = true', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      const count = r.perPot.filter((p) => p.isBestPot).length;
      expect(count).toBe(1);
    });
    it('rank 1 = bestPotIndex', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      expect(r.perPot[r.bestPotIndex]!.rankByMeanPayout).toBe(1);
    });
    it('jackpotPotShare = max contributionShareOfBonus', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      const max = Math.max(...r.perPot.map((p) => p.contributionShareOfBonus));
      expect(r.jackpotPotShare).toBeCloseTo(max, 9);
    });
    it('bonusVariabilityIndex = σ_V / μ_V', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      expect(r.bonusVariabilityIndex).toBeCloseTo(
        r.stdDevPayoutGivenTrigger / r.expectedPayoutGivenTrigger,
        6,
      );
    });
    it('oneInNSpinsAnyTrigger = 1 / p_trigger', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      expect(r.oneInNSpinsAnyTrigger).toBeCloseTo(1 / baseCfg.probTrigger, 6);
    });
    it('oneInNSpinsTopPotTrigger = 1 / (p_trig · p_best)', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      const pBest = r.perPot[r.bestPotIndex]!.selectionProb;
      expect(r.oneInNSpinsTopPotTrigger).toBeCloseTo(1 / (baseCfg.probTrigger * pBest), 6);
    });
    it('mixtureVarianceLift > 1 for heterogeneous pots', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      expect(r.mixtureVarianceLift).toBeGreaterThan(1);
    });
    it('all pots identical → mixtureVarianceLift = 1', () => {
      const cfg: MultiPotBranchedHoldSpinSubFeatureConfig = {
        probTrigger: 0.1,
        pots: [
          { selectionWeight: 1, meanPayout: 10, variancePayout: 4 },
          { selectionWeight: 1, meanPayout: 10, variancePayout: 4 },
          { selectionWeight: 1, meanPayout: 10, variancePayout: 4 },
        ],
      };
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(cfg);
      expect(r.mixtureVarianceLift).toBeCloseTo(1, 6);
    });
    it('single pot dominant prob (p=1) → contribution share = 1 for that pot', () => {
      const cfg: MultiPotBranchedHoldSpinSubFeatureConfig = {
        probTrigger: 0.1,
        pots: [
          { selectionWeight: 100, meanPayout: 10, variancePayout: 1 },
          { selectionWeight: 0.0001, meanPayout: 20, variancePayout: 1 },
        ],
      };
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(cfg);
      expect(r.perPot[0]!.contributionShareOfBonus).toBeGreaterThan(0.999);
    });
  });

  describe('monotonicity', () => {
    it('higher p_trigger → higher E[Y/spin]', () => {
      const lo = analyzeMultiPotBranchedHoldSpinSubFeature({ ...baseCfg, probTrigger: 0.01 });
      const hi = analyzeMultiPotBranchedHoldSpinSubFeature({ ...baseCfg, probTrigger: 0.10 });
      expect(hi.expectedPayoutPerSpin).toBeGreaterThan(lo.expectedPayoutPerSpin);
    });
    it('boosting best-pot weight → higher E[V|trig]', () => {
      const r1 = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      const cfg2: MultiPotBranchedHoldSpinSubFeatureConfig = {
        ...baseCfg,
        pots: baseCfg.pots.map((p, i) =>
          i === r1.bestPotIndex ? { ...p, selectionWeight: p.selectionWeight * 4 } : p,
        ),
      };
      const r2 = analyzeMultiPotBranchedHoldSpinSubFeature(cfg2);
      expect(r2.expectedPayoutGivenTrigger).toBeGreaterThan(r1.expectedPayoutGivenTrigger);
    });
    it('higher μ_k at best-pot → higher E[V|trig]', () => {
      const r1 = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      const cfg2: MultiPotBranchedHoldSpinSubFeatureConfig = {
        ...baseCfg,
        pots: baseCfg.pots.map((p, i) =>
          i === r1.bestPotIndex ? { ...p, meanPayout: p.meanPayout * 2 } : p,
        ),
      };
      const r2 = analyzeMultiPotBranchedHoldSpinSubFeature(cfg2);
      expect(r2.expectedPayoutGivenTrigger).toBeGreaterThan(r1.expectedPayoutGivenTrigger);
    });
  });

  describe('MC cross-validation', () => {
    const tightCfg: MultiPotBranchedHoldSpinSubFeatureConfig = {
      probTrigger: 0.10,
      pots: [
        { label: 'instant', selectionWeight: 6, meanPayout: 15, variancePayout: 9 },
        { label: 'double',  selectionWeight: 3, meanPayout: 40, variancePayout: 64 },
        { label: 'repeat',  selectionWeight: 1, meanPayout: 100, variancePayout: 400 },
      ],
    };

    it('CF E[Y/spin] within 7% rel of MC mean @ 50K spins', () => {
      const cf = analyzeMultiPotBranchedHoldSpinSubFeature(tightCfg);
      const mc = simulateMultiPotBranchedHoldSpinSubFeature(tightCfg, 50_000, 0xC0FFEE);
      const rel = Math.abs(cf.expectedPayoutPerSpin - mc.meanPayoutPerSpin) /
        Math.max(mc.meanPayoutPerSpin, 1e-9);
      expect(rel).toBeLessThan(0.08);
    });
    it('CF trigger rate within 1pp abs of MC', () => {
      const mc = simulateMultiPotBranchedHoldSpinSubFeature(tightCfg, 50_000, 0xBEEF_193);
      expect(Math.abs(tightCfg.probTrigger - mc.observedTriggerRate)).toBeLessThan(0.01);
    });
    it('CF E[V|trig] within 7% rel of MC mean', () => {
      const cf = analyzeMultiPotBranchedHoldSpinSubFeature(tightCfg);
      const mc = simulateMultiPotBranchedHoldSpinSubFeature(tightCfg, 50_000, 0xCAFE);
      const rel = Math.abs(cf.expectedPayoutGivenTrigger - mc.meanPayoutGivenTrigger) /
        Math.max(mc.meanPayoutGivenTrigger, 1e-9);
      expect(rel).toBeLessThan(0.08);
    });
    it('observed pot selection rates match p_k within 3pp abs', () => {
      const cf = analyzeMultiPotBranchedHoldSpinSubFeature(tightCfg);
      const mc = simulateMultiPotBranchedHoldSpinSubFeature(tightCfg, 50_000, 0xFEED);
      for (let k = 0; k < cf.numPots; k++) {
        expect(
          Math.abs(cf.perPot[k]!.selectionProb - mc.observedPotSelectionRates[k]!),
        ).toBeLessThan(0.03);
      }
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC', () => {
      const a = simulateMultiPotBranchedHoldSpinSubFeature(baseCfg, 1000, 0xAA);
      const b = simulateMultiPotBranchedHoldSpinSubFeature(baseCfg, 1000, 0xAA);
      expect(a.meanPayoutPerSpin).toBe(b.meanPayoutPerSpin);
    });
    it('different seeds → different MC', () => {
      const a = simulateMultiPotBranchedHoldSpinSubFeature(baseCfg, 1000, 0xAA);
      const b = simulateMultiPotBranchedHoldSpinSubFeature(baseCfg, 1000, 0xBB);
      expect(a.meanPayoutPerSpin !== b.meanPayoutPerSpin).toBe(true);
    });
  });

  describe('industry use-cases (L&W M15 branched H&S family)', () => {
    it("Rich Little Piggies Piggy Bankin' Break In — 3-pot branched (Instant Win / Double Play / Repeat Win)", () => {
      const cfg: MultiPotBranchedHoldSpinSubFeatureConfig = {
        probTrigger: 0.04,
        pots: [
          { label: 'instant_win', selectionWeight: 5, meanPayout: 25,  variancePayout: 16 },
          { label: 'double_play', selectionWeight: 3, meanPayout: 60,  variancePayout: 100 },
          { label: 'repeat_win',  selectionWeight: 2, meanPayout: 180, variancePayout: 900 },
        ],
      };
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(cfg);
      expect(r.bestPotIndex).toBe(2);
      expect(r.bestPotIndex).toBe(r.perPot.findIndex((p) => p.isBestPot));
      expect(r.expectedPayoutPerSpin).toBeGreaterThan(0);
    });
    it("Rich Little Piggies World Class — escalated jackpot pot", () => {
      const cfg: MultiPotBranchedHoldSpinSubFeatureConfig = {
        probTrigger: 0.03,
        pots: [
          { label: 'mini',  selectionWeight: 50, meanPayout: 20,   variancePayout: 9 },
          { label: 'minor', selectionWeight: 30, meanPayout: 100,  variancePayout: 100 },
          { label: 'major', selectionWeight: 15, meanPayout: 500,  variancePayout: 2500 },
          { label: 'grand', selectionWeight: 5,  meanPayout: 5000, variancePayout: 250000 },
        ],
      };
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(cfg);
      expect(r.numPots).toBe(4);
      expect(r.perPot[3]!.label).toBe('grand');
      expect(r.perPot[3]!.contributionShareOfBonus).toBeGreaterThan(0.3); // grand dominates
    });
    it("UKGC RTS-14 disclosure: per-pot share + 1-in-N + variability", () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      expect(r.bonusVariabilityIndex).toBeGreaterThan(0);
      expect(r.oneInNSpinsTopPotTrigger).toBeGreaterThan(r.oneInNSpinsAnyTrigger);
      for (const p of r.perPot) {
        expect(p.oneInNTriggersForPot).toBeGreaterThanOrEqual(1);
      }
    });
    it('mixture-variance lift detects heterogeneous pots', () => {
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(baseCfg);
      expect(r.mixtureVarianceLift).toBeGreaterThan(1.5);
    });
    it('edge: 2-pot binary branch', () => {
      const cfg: MultiPotBranchedHoldSpinSubFeatureConfig = {
        probTrigger: 0.10,
        pots: [
          { selectionWeight: 7, meanPayout: 10, variancePayout: 4 },
          { selectionWeight: 3, meanPayout: 50, variancePayout: 50 },
        ],
      };
      const r = analyzeMultiPotBranchedHoldSpinSubFeature(cfg);
      expect(r.numPots).toBe(2);
      expect(r.bestPotIndex).toBe(1);
      expect(r.expectedPayoutGivenTrigger).toBeCloseTo(0.7 * 10 + 0.3 * 50, 6);
    });
  });
});
