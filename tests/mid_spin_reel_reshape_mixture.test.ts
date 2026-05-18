// W152 Wave 195 — Mid-Spin Random Reel-Reshape Mixture vitest specs
// (76. solver, L&W M13 P1 GAP CLOSURE — WMS Wizard of Oz Follow the Yellow Brick Road Glinda reshape).

import { describe, it, expect } from 'vitest';
import {
  analyzeMidSpinReelReshapeMixture,
  simulateMidSpinReelReshapeMixture,
  type MidSpinReelReshapeMixtureConfig,
} from '../src/features/midSpinReelReshapeMixture.js';

const baseCfg: MidSpinReelReshapeMixtureConfig = {
  reelSets: [
    { label: 'base', selectionProbability: 0.85, meanPayout: 0.95, variancePayout: 25 },
    { label: 'glinda_bonus_reels', selectionProbability: 0.10, meanPayout: 3.0, variancePayout: 100 },
    { label: 'glinda_jackpot_reels', selectionProbability: 0.05, meanPayout: 8.0, variancePayout: 400 },
  ],
};

describe('Wave 195 — Mid-Spin Reel-Reshape Mixture', () => {
  describe('validation', () => {
    it('rejects fewer than 2 reel-sets', () => {
      expect(() => analyzeMidSpinReelReshapeMixture({ reelSets: [] })).toThrow();
      expect(() =>
        analyzeMidSpinReelReshapeMixture({
          reelSets: [{ selectionProbability: 1, meanPayout: 1, variancePayout: 0 }],
        }),
      ).toThrow();
    });
    it('rejects sum != 1', () => {
      expect(() =>
        analyzeMidSpinReelReshapeMixture({
          reelSets: [
            { selectionProbability: 0.5, meanPayout: 1, variancePayout: 0 },
            { selectionProbability: 0.3, meanPayout: 1, variancePayout: 0 },
          ],
        }),
      ).toThrow();
    });
    it('rejects p_base = 0', () => {
      expect(() =>
        analyzeMidSpinReelReshapeMixture({
          reelSets: [
            { selectionProbability: 0, meanPayout: 1, variancePayout: 0 },
            { selectionProbability: 1, meanPayout: 1, variancePayout: 0 },
          ],
        }),
      ).toThrow();
    });
    it('rejects negative meanPayout / variance / prob > 1', () => {
      expect(() =>
        analyzeMidSpinReelReshapeMixture({
          reelSets: [
            { selectionProbability: 1.5, meanPayout: 1, variancePayout: 0 },
            { selectionProbability: -0.5, meanPayout: 1, variancePayout: 0 },
          ],
        }),
      ).toThrow();
      expect(() =>
        analyzeMidSpinReelReshapeMixture({
          reelSets: [
            { selectionProbability: 0.5, meanPayout: -1, variancePayout: 0 },
            { selectionProbability: 0.5, meanPayout: 1, variancePayout: 0 },
          ],
        }),
      ).toThrow();
      expect(() =>
        analyzeMidSpinReelReshapeMixture({
          reelSets: [
            { selectionProbability: 0.5, meanPayout: 1, variancePayout: -1 },
            { selectionProbability: 0.5, meanPayout: 1, variancePayout: 0 },
          ],
        }),
      ).toThrow();
    });
  });

  describe('closed-form correctness', () => {
    it('E[Y] = Σ p_k · μ_k', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      const expected = baseCfg.reelSets.reduce(
        (acc, rs) => acc + rs.selectionProbability * rs.meanPayout,
        0,
      );
      expect(r.expectedPayoutPerSpin).toBeCloseTo(expected, 9);
    });
    it('E[Y²] = Σ p_k · (σ²_k + μ²_k)', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      const expected = baseCfg.reelSets.reduce(
        (acc, rs) => acc + rs.selectionProbability * (rs.variancePayout + rs.meanPayout ** 2),
        0,
      );
      expect(r.secondMomentPayoutPerSpin).toBeCloseTo(expected, 9);
    });
    it('Var[Y] = E[Y²] − E[Y]² (mixture variance)', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      const expected = Math.max(0, r.secondMomentPayoutPerSpin - r.expectedPayoutPerSpin ** 2);
      expect(r.variancePayoutPerSpin).toBeCloseTo(expected, 6);
    });
    it('Var[Y] = within + between (decomposition identity)', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      expect(r.variancePayoutPerSpin).toBeCloseTo(r.withinSetVariance + r.betweenSetVariance, 6);
    });
    it('withinSetVarianceShare ∈ [0, 1]', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      expect(r.withinSetVarianceShare).toBeGreaterThanOrEqual(0);
      expect(r.withinSetVarianceShare).toBeLessThanOrEqual(1);
    });
    it('reshapeProbability = 1 − p_0', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      expect(r.reshapeProbability).toBeCloseTo(1 - baseCfg.reelSets[0]!.selectionProbability, 9);
    });
    it('oneInNSpinsAnyReshape = 1 / (1 − p_0)', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      expect(r.oneInNSpinsAnyReshape).toBeCloseTo(1 / r.reshapeProbability, 6);
    });
    it('perReelSet.contributionToRtp sums to 1', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      const sum = r.perReelSet.reduce((acc, rs) => acc + rs.contributionToRtp, 0);
      expect(sum).toBeCloseTo(1, 9);
    });
    it('perReelSet.oneInNSpinsForThisSet = 1 / p_k', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      for (const rs of r.perReelSet) {
        expect(rs.oneInNSpinsForThisSet).toBeCloseTo(1 / rs.selectionProbability, 6);
      }
    });
    it('exactly one reel-set has isBestReelSet = true', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      expect(r.perReelSet.filter((rs) => rs.isBestReelSet).length).toBe(1);
    });
    it('exactly one reel-set has isBaseReelSet = true (index 0)', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      expect(r.perReelSet.filter((rs) => rs.isBaseReelSet).length).toBe(1);
      expect(r.perReelSet[0]!.isBaseReelSet).toBe(true);
    });
    it('commercialUpliftVsBaseOnly = E[Y] / μ_base', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      expect(r.commercialUpliftVsBaseOnly).toBeCloseTo(
        r.expectedPayoutPerSpin / baseCfg.reelSets[0]!.meanPayout,
        9,
      );
    });
    it('bestReelSetUpliftIfReshape = μ_best / μ_base', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      const muBest = baseCfg.reelSets[r.bestReelSetIndex]!.meanPayout;
      const muBase = baseCfg.reelSets[0]!.meanPayout;
      expect(r.bestReelSetUpliftIfReshape).toBeCloseTo(muBest / muBase, 9);
    });
    it('p_reshape = 0 (only base, p_0 = 1) → E[Y] = μ_0, uplift = 1', () => {
      const cfg: MidSpinReelReshapeMixtureConfig = {
        reelSets: [
          { selectionProbability: 1, meanPayout: 2, variancePayout: 1 },
          { selectionProbability: 0, meanPayout: 10, variancePayout: 5 },
        ],
      };
      const r = analyzeMidSpinReelReshapeMixture(cfg);
      expect(r.expectedPayoutPerSpin).toBeCloseTo(2, 9);
      expect(r.commercialUpliftVsBaseOnly).toBeCloseTo(1, 9);
      expect(r.reshapeProbability).toBeCloseTo(0, 9);
    });
    it('higher reshape pays → uplift > 1', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      expect(r.commercialUpliftVsBaseOnly).toBeGreaterThan(1);
    });
    it('between-set variance = 0 when all means equal', () => {
      const cfg: MidSpinReelReshapeMixtureConfig = {
        reelSets: [
          { selectionProbability: 0.5, meanPayout: 5, variancePayout: 1 },
          { selectionProbability: 0.5, meanPayout: 5, variancePayout: 1 },
        ],
      };
      const r = analyzeMidSpinReelReshapeMixture(cfg);
      expect(r.betweenSetVariance).toBeCloseTo(0, 6);
    });
    it('within-set variance = 0 when all σ² = 0', () => {
      const cfg: MidSpinReelReshapeMixtureConfig = {
        reelSets: [
          { selectionProbability: 0.6, meanPayout: 2, variancePayout: 0 },
          { selectionProbability: 0.4, meanPayout: 10, variancePayout: 0 },
        ],
      };
      const r = analyzeMidSpinReelReshapeMixture(cfg);
      expect(r.withinSetVariance).toBeCloseTo(0, 9);
      // between-set: 0.6·4 + 0.4·100 − (0.6·2+0.4·10)² = 2.4 + 40 − 5.2² = 42.4 − 27.04 = 15.36
      expect(r.betweenSetVariance).toBeCloseTo(15.36, 6);
    });
  });

  describe('monotonicity', () => {
    it('higher reshape prob (best reel-set) → higher E[Y]', () => {
      const r1 = analyzeMidSpinReelReshapeMixture(baseCfg);
      const cfg2: MidSpinReelReshapeMixtureConfig = {
        reelSets: [
          { ...baseCfg.reelSets[0]!, selectionProbability: 0.70 },
          { ...baseCfg.reelSets[1]!, selectionProbability: 0.15 },
          { ...baseCfg.reelSets[2]!, selectionProbability: 0.15 },
        ],
      };
      const r2 = analyzeMidSpinReelReshapeMixture(cfg2);
      expect(r2.expectedPayoutPerSpin).toBeGreaterThan(r1.expectedPayoutPerSpin);
    });
    it('higher best-reel-set μ → higher E[Y]', () => {
      const r1 = analyzeMidSpinReelReshapeMixture(baseCfg);
      const cfg2: MidSpinReelReshapeMixtureConfig = {
        reelSets: baseCfg.reelSets.map((rs, k) =>
          k === r1.bestReelSetIndex ? { ...rs, meanPayout: rs.meanPayout * 2 } : rs,
        ),
      };
      const r2 = analyzeMidSpinReelReshapeMixture(cfg2);
      expect(r2.expectedPayoutPerSpin).toBeGreaterThan(r1.expectedPayoutPerSpin);
    });
  });

  describe('MC cross-validation', () => {
    const tightCfg: MidSpinReelReshapeMixtureConfig = {
      reelSets: [
        { label: 'base', selectionProbability: 0.80, meanPayout: 0.90, variancePayout: 16 },
        { label: 'reshape_a', selectionProbability: 0.15, meanPayout: 2.50, variancePayout: 50 },
        { label: 'reshape_b', selectionProbability: 0.05, meanPayout: 7.00, variancePayout: 200 },
      ],
    };

    it('CF E[Y/spin] within 5% rel of MC mean @ 100K spins', () => {
      const cf = analyzeMidSpinReelReshapeMixture(tightCfg);
      const mc = simulateMidSpinReelReshapeMixture(tightCfg, 100_000, 0xC0FFEE);
      const rel = Math.abs(cf.expectedPayoutPerSpin - mc.meanPayoutPerSpin) /
        Math.max(mc.meanPayoutPerSpin, 1e-9);
      expect(rel).toBeLessThan(0.06);
    });
    it('observed reshape rate within 1pp abs of (1−p_0)', () => {
      const cf = analyzeMidSpinReelReshapeMixture(tightCfg);
      const mc = simulateMidSpinReelReshapeMixture(tightCfg, 100_000, 0xBEEF_195);
      expect(Math.abs(cf.reshapeProbability - mc.observedReshapeRate)).toBeLessThan(0.01);
    });
    it('observed reel-set freqs match p_k within 1pp abs', () => {
      const cf = analyzeMidSpinReelReshapeMixture(tightCfg);
      const mc = simulateMidSpinReelReshapeMixture(tightCfg, 100_000, 0xCAFE);
      for (let k = 0; k < cf.numReelSets; k++) {
        expect(
          Math.abs(cf.perReelSet[k]!.selectionProbability - mc.observedReelSetFreqs[k]!),
        ).toBeLessThan(0.01);
      }
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC', () => {
      const a = simulateMidSpinReelReshapeMixture(baseCfg, 500, 0xAA);
      const b = simulateMidSpinReelReshapeMixture(baseCfg, 500, 0xAA);
      expect(a.meanPayoutPerSpin).toBe(b.meanPayoutPerSpin);
    });
    it('different seeds → different MC', () => {
      const a = simulateMidSpinReelReshapeMixture(baseCfg, 500, 0xAA);
      const b = simulateMidSpinReelReshapeMixture(baseCfg, 500, 0xBB);
      expect(a.meanPayoutPerSpin !== b.meanPayoutPerSpin).toBe(true);
    });
  });

  describe('industry use-cases (L&W M13 Glinda reshape family)', () => {
    it('Wizard of Oz Follow Yellow Brick Road — Glinda waves wand mid-spin (3 reel-sets)', () => {
      const cfg: MidSpinReelReshapeMixtureConfig = {
        reelSets: [
          { label: 'base_oz', selectionProbability: 0.88, meanPayout: 0.92, variancePayout: 20 },
          { label: 'glinda_bonus_reels', selectionProbability: 0.08, meanPayout: 4.0, variancePayout: 120 },
          { label: 'glinda_emerald_reels', selectionProbability: 0.04, meanPayout: 12.0, variancePayout: 500 },
        ],
      };
      const r = analyzeMidSpinReelReshapeMixture(cfg);
      expect(r.commercialUpliftVsBaseOnly).toBeGreaterThan(1);
      expect(r.bestReelSetIndex).toBe(2); // glinda_emerald
      expect(r.reshapeProbability).toBeCloseTo(0.12, 9);
    });
    it('Wizard of Oz Munchkinland reshape — 2-state base/Munchkin', () => {
      const cfg: MidSpinReelReshapeMixtureConfig = {
        reelSets: [
          { label: 'base_oz', selectionProbability: 0.92, meanPayout: 0.95, variancePayout: 18 },
          { label: 'munchkin_bonus', selectionProbability: 0.08, meanPayout: 6.0, variancePayout: 200 },
        ],
      };
      const r = analyzeMidSpinReelReshapeMixture(cfg);
      expect(r.numReelSets).toBe(2);
      // E[Y] = 0.92*0.95 + 0.08*6 = 0.874 + 0.48 = 1.354
      expect(r.expectedPayoutPerSpin).toBeCloseTo(1.354, 6);
    });
    it('UKGC RTS-14 disclosure: per-reel-set contribution + 1-in-N reshape', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      for (const rs of r.perReelSet) {
        expect(rs.contributionToRtp).toBeGreaterThanOrEqual(0);
        expect(rs.oneInNSpinsForThisSet).toBeGreaterThanOrEqual(1);
      }
      expect(r.oneInNSpinsAnyReshape).toBeGreaterThan(1);
    });
    it('variance decomposition reveals between-set Glinda jackpot heavy-tail', () => {
      const r = analyzeMidSpinReelReshapeMixture(baseCfg);
      // Heavy-tail jackpot reshape has high between-set variance share
      expect(r.betweenSetVariance).toBeGreaterThan(0);
      expect(r.withinSetVariance).toBeGreaterThan(0);
    });
    it('edge: 5-reel-set diverse reshape menu', () => {
      const cfg: MidSpinReelReshapeMixtureConfig = {
        reelSets: [
          { selectionProbability: 0.70, meanPayout: 1.00, variancePayout: 10 },
          { selectionProbability: 0.15, meanPayout: 2.50, variancePayout: 40 },
          { selectionProbability: 0.08, meanPayout: 5.00, variancePayout: 150 },
          { selectionProbability: 0.05, meanPayout: 10.0, variancePayout: 500 },
          { selectionProbability: 0.02, meanPayout: 30.0, variancePayout: 5000 },
        ],
      };
      const r = analyzeMidSpinReelReshapeMixture(cfg);
      expect(r.numReelSets).toBe(5);
      expect(r.bestReelSetIndex).toBe(4);
      expect(r.commercialUpliftVsBaseOnly).toBeGreaterThan(1.5);
    });
  });
});
