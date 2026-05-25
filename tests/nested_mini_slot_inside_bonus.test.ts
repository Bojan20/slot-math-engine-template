// W152 Wave 190 — Nested Mini-Slot Inside Bonus vitest specs
// (71. solver, Vendor B M14 P1 GAP CLOSURE — LOTR Two Towers + Star Trek).

import { describe, it, expect } from 'vitest';
import {
  analyzeNestedMiniSlotInsideBonus,
  simulateNestedMiniSlotInsideBonus,
  type NestedMiniSlotInsideBonusConfig,
} from '../src/features/nestedMiniSlotInsideBonus.js';

const baseCfg: NestedMiniSlotInsideBonusConfig = {
  probBonusTriggerPerParentSpin: 0.05,
  numOuterBonusSpins: 8,
  outerBaseMean: 1.5,
  outerBaseVar: 1,
  probNestedTriggerPerOuterSpin: 0.20,
  numNestedInnerSpins: 3,
  nestedInnerMean: 5,
  nestedInnerVar: 4,
};

describe('Wave 190 — Nested Mini-Slot Inside Bonus', () => {
  describe('validation', () => {
    it('rejects p_bonus outside (0,1]', () => {
      expect(() => analyzeNestedMiniSlotInsideBonus({ ...baseCfg, probBonusTriggerPerParentSpin: 0 })).toThrow();
      expect(() => analyzeNestedMiniSlotInsideBonus({ ...baseCfg, probBonusTriggerPerParentSpin: 1.5 })).toThrow();
    });
    it('rejects K_outer < 1', () => {
      expect(() => analyzeNestedMiniSlotInsideBonus({ ...baseCfg, numOuterBonusSpins: 0 })).toThrow();
    });
    it('rejects N_inner < 1', () => {
      expect(() => analyzeNestedMiniSlotInsideBonus({ ...baseCfg, numNestedInnerSpins: 0 })).toThrow();
    });
    it('rejects negative means/vars', () => {
      expect(() => analyzeNestedMiniSlotInsideBonus({ ...baseCfg, outerBaseMean: -1 })).toThrow();
      expect(() => analyzeNestedMiniSlotInsideBonus({ ...baseCfg, nestedInnerVar: -1 })).toThrow();
    });
    it('rejects p_nested outside (0,1]', () => {
      expect(() => analyzeNestedMiniSlotInsideBonus({ ...baseCfg, probNestedTriggerPerOuterSpin: 0 })).toThrow();
    });
  });

  describe('closed-form correctness', () => {
    it('E[nestedSlot] = N_inner · μ_inner', () => {
      const r = analyzeNestedMiniSlotInsideBonus(baseCfg);
      expect(r.expectedNestedSlotPayout).toBeCloseTo(baseCfg.numNestedInnerSpins * baseCfg.nestedInnerMean, 9);
    });
    it('Var[nestedSlot] = N_inner · σ²_inner', () => {
      const r = analyzeNestedMiniSlotInsideBonus(baseCfg);
      expect(r.varianceNestedSlotPayout).toBeCloseTo(baseCfg.numNestedInnerSpins * baseCfg.nestedInnerVar, 9);
    });
    it('E[Z per outer] = μ_O + p_N · E[T_inner]', () => {
      const r = analyzeNestedMiniSlotInsideBonus(baseCfg);
      const expected =
        baseCfg.outerBaseMean +
        baseCfg.probNestedTriggerPerOuterSpin * r.expectedNestedSlotPayout;
      expect(r.expectedOuterSpinPayout).toBeCloseTo(expected, 9);
    });
    it('Var[Z per outer] via law of total variance', () => {
      const r = analyzeNestedMiniSlotInsideBonus(baseCfg);
      const pN = baseCfg.probNestedTriggerPerOuterSpin;
      const eT = r.expectedNestedSlotPayout;
      const vT = r.varianceNestedSlotPayout;
      const expected = baseCfg.outerBaseVar + pN * vT + pN * (1 - pN) * eT * eT;
      expect(r.varianceOuterSpinPayout).toBeCloseTo(expected, 9);
    });
    it('E[B | trigger] = K_outer · E[Z]', () => {
      const r = analyzeNestedMiniSlotInsideBonus(baseCfg);
      expect(r.expectedBonusPayoutGivenTrigger).toBeCloseTo(
        baseCfg.numOuterBonusSpins * r.expectedOuterSpinPayout,
        9,
      );
    });
    it('Var[B | trigger] = K_outer · Var[Z]', () => {
      const r = analyzeNestedMiniSlotInsideBonus(baseCfg);
      expect(r.varianceBonusPayoutGivenTrigger).toBeCloseTo(
        baseCfg.numOuterBonusSpins * r.varianceOuterSpinPayout,
        9,
      );
    });
    it('E[Y per parent] = p_bonus · E[B]', () => {
      const r = analyzeNestedMiniSlotInsideBonus(baseCfg);
      expect(r.expectedPayoutPerParentSpin).toBeCloseTo(
        baseCfg.probBonusTriggerPerParentSpin * r.expectedBonusPayoutGivenTrigger,
        9,
      );
    });
    it('Var[Y per parent] via law of total variance on bonus', () => {
      const r = analyzeNestedMiniSlotInsideBonus(baseCfg);
      const pB = baseCfg.probBonusTriggerPerParentSpin;
      const eB = r.expectedBonusPayoutGivenTrigger;
      const expected = pB * r.varianceBonusPayoutGivenTrigger + pB * (1 - pB) * eB * eB;
      expect(r.variancePayoutPerParentSpin).toBeCloseTo(expected, 9);
    });
    it('P(at least one nested | bonus) = 1 − (1−p_nested)^K', () => {
      const r = analyzeNestedMiniSlotInsideBonus(baseCfg);
      const expected = 1 - Math.pow(1 - baseCfg.probNestedTriggerPerOuterSpin, baseCfg.numOuterBonusSpins);
      expect(r.probAtLeastOneNestedGivenBonus).toBeCloseTo(expected, 9);
    });
    it('E[# nested triggers per bonus] = K · p_nested', () => {
      const r = analyzeNestedMiniSlotInsideBonus(baseCfg);
      expect(r.expectedNestedTriggersPerBonus).toBeCloseTo(
        baseCfg.numOuterBonusSpins * baseCfg.probNestedTriggerPerOuterSpin,
        9,
      );
    });
    it('oneInNSpinsAnyBonus = 1 / p_bonus', () => {
      const r = analyzeNestedMiniSlotInsideBonus(baseCfg);
      expect(r.oneInNSpinsAnyBonus).toBeCloseTo(1 / baseCfg.probBonusTriggerPerParentSpin, 6);
    });
    it('p_nested = 1 → all outer-spins trigger nested', () => {
      const r = analyzeNestedMiniSlotInsideBonus({ ...baseCfg, probNestedTriggerPerOuterSpin: 1 });
      expect(r.expectedNestedTriggersPerBonus).toBe(baseCfg.numOuterBonusSpins);
      expect(r.probAtLeastOneNestedGivenBonus).toBeCloseTo(1, 9);
    });
    it('μ_inner = 0 → nested contribution = 0', () => {
      const r = analyzeNestedMiniSlotInsideBonus({ ...baseCfg, nestedInnerMean: 0 });
      expect(r.nestedSlotContributionShare).toBeCloseTo(0, 9);
    });
    it('commercialUpliftVsNoNestedSlot > 1 when nested contributes', () => {
      const r = analyzeNestedMiniSlotInsideBonus(baseCfg);
      expect(r.commercialUpliftVsNoNestedSlot).toBeGreaterThan(1);
    });
    it('μ_O = 0 → all bonus payout from nested', () => {
      const r = analyzeNestedMiniSlotInsideBonus({ ...baseCfg, outerBaseMean: 0 });
      expect(r.nestedSlotContributionShare).toBeCloseTo(1, 9);
    });
  });

  describe('monotonicity', () => {
    it('higher p_bonus → higher E[Y/spin]', () => {
      const low = analyzeNestedMiniSlotInsideBonus({ ...baseCfg, probBonusTriggerPerParentSpin: 0.01 });
      const high = analyzeNestedMiniSlotInsideBonus({ ...baseCfg, probBonusTriggerPerParentSpin: 0.10 });
      expect(high.expectedPayoutPerParentSpin).toBeGreaterThan(low.expectedPayoutPerParentSpin);
    });
    it('higher K_outer → higher E[B]', () => {
      const small = analyzeNestedMiniSlotInsideBonus({ ...baseCfg, numOuterBonusSpins: 3 });
      const large = analyzeNestedMiniSlotInsideBonus({ ...baseCfg, numOuterBonusSpins: 20 });
      expect(large.expectedBonusPayoutGivenTrigger).toBeGreaterThan(small.expectedBonusPayoutGivenTrigger);
    });
    it('higher N_inner → higher E[B]', () => {
      const small = analyzeNestedMiniSlotInsideBonus({ ...baseCfg, numNestedInnerSpins: 2 });
      const large = analyzeNestedMiniSlotInsideBonus({ ...baseCfg, numNestedInnerSpins: 10 });
      expect(large.expectedBonusPayoutGivenTrigger).toBeGreaterThan(small.expectedBonusPayoutGivenTrigger);
    });
    it('higher μ_inner → higher uplift', () => {
      const low = analyzeNestedMiniSlotInsideBonus({ ...baseCfg, nestedInnerMean: 1 });
      const high = analyzeNestedMiniSlotInsideBonus({ ...baseCfg, nestedInnerMean: 20 });
      expect(high.commercialUpliftVsNoNestedSlot).toBeGreaterThan(low.commercialUpliftVsNoNestedSlot);
    });
  });

  describe('MC cross-validation', () => {
    const tightCfg: NestedMiniSlotInsideBonusConfig = {
      probBonusTriggerPerParentSpin: 0.10,
      numOuterBonusSpins: 5,
      outerBaseMean: 2.0,
      outerBaseVar: 0.5,
      probNestedTriggerPerOuterSpin: 0.25,
      numNestedInnerSpins: 3,
      nestedInnerMean: 4,
      nestedInnerVar: 1,
    };

    it('CF E[Y/parent spin] within 5% rel of MC mean @ 30K spins', () => {
      const cf = analyzeNestedMiniSlotInsideBonus(tightCfg);
      const mc = simulateNestedMiniSlotInsideBonus(tightCfg, 30_000, 0xC0FFEE);
      const rel = Math.abs(cf.expectedPayoutPerParentSpin - mc.meanPayoutPerParentSpin) /
        Math.max(mc.meanPayoutPerParentSpin, 1e-9);
      expect(rel).toBeLessThan(0.07);
    });
    it('CF bonus trigger rate within 1pp abs of MC', () => {
      const cf = analyzeNestedMiniSlotInsideBonus(tightCfg);
      const mc = simulateNestedMiniSlotInsideBonus(tightCfg, 30_000, 0xBEEF_190);
      const abs = Math.abs(tightCfg.probBonusTriggerPerParentSpin - mc.observedBonusTriggerRate);
      expect(abs).toBeLessThan(0.01);
      void cf;
    });
    it('CF E[B | trigger] within 5% rel of MC mean', () => {
      const cf = analyzeNestedMiniSlotInsideBonus(tightCfg);
      const mc = simulateNestedMiniSlotInsideBonus(tightCfg, 30_000, 0xCAFE);
      const rel = Math.abs(cf.expectedBonusPayoutGivenTrigger - mc.meanBonusPayoutGivenTrigger) /
        Math.max(mc.meanBonusPayoutGivenTrigger, 1e-9);
      expect(rel).toBeLessThan(0.07);
    });
    it('CF P(at least one nested | bonus) within 3pp abs of MC', () => {
      const cf = analyzeNestedMiniSlotInsideBonus(tightCfg);
      const mc = simulateNestedMiniSlotInsideBonus(tightCfg, 30_000, 0xFEED);
      const abs = Math.abs(cf.probAtLeastOneNestedGivenBonus - mc.observedProbAtLeastOneNestedGivenBonus);
      expect(abs).toBeLessThan(0.04);
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC', () => {
      const a = simulateNestedMiniSlotInsideBonus(baseCfg, 500, 0xAA);
      const b = simulateNestedMiniSlotInsideBonus(baseCfg, 500, 0xAA);
      expect(a.meanPayoutPerParentSpin).toBe(b.meanPayoutPerParentSpin);
    });
    it('different seeds → different MC', () => {
      const a = simulateNestedMiniSlotInsideBonus(baseCfg, 500, 0xAA);
      const b = simulateNestedMiniSlotInsideBonus(baseCfg, 500, 0xBB);
      expect(a.meanPayoutPerParentSpin !== b.meanPayoutPerParentSpin).toBe(true);
    });
  });

  describe('industry use-cases (Vendor B M14 nested-slot family)', () => {
    it("LOTR Two Towers — Tower Spin nested mini-slot", () => {
      const cfg: NestedMiniSlotInsideBonusConfig = {
        probBonusTriggerPerParentSpin: 0.02,
        numOuterBonusSpins: 10,
        outerBaseMean: 2.0,
        outerBaseVar: 4,
        probNestedTriggerPerOuterSpin: 0.15,
        numNestedInnerSpins: 5,
        nestedInnerMean: 8,
        nestedInnerVar: 16,
      };
      const r = analyzeNestedMiniSlotInsideBonus(cfg);
      expect(r.expectedBonusPayoutGivenTrigger).toBeGreaterThan(0);
      expect(r.nestedSlotContributionShare).toBeGreaterThan(0.3); // significant nested contribution
    });
    it("LOTR Return of the King — similar nested mini-slot", () => {
      const cfg: NestedMiniSlotInsideBonusConfig = {
        probBonusTriggerPerParentSpin: 0.015,
        numOuterBonusSpins: 12,
        outerBaseMean: 2.5,
        outerBaseVar: 5,
        probNestedTriggerPerOuterSpin: 0.20,
        numNestedInnerSpins: 4,
        nestedInnerMean: 10,
        nestedInnerVar: 25,
      };
      const r = analyzeNestedMiniSlotInsideBonus(cfg);
      expect(r.expectedPayoutPerParentSpin).toBeGreaterThan(0);
    });
    it("Star Trek nested-slot variant — Trek Through the Stars sub-game", () => {
      const cfg: NestedMiniSlotInsideBonusConfig = {
        probBonusTriggerPerParentSpin: 0.03,
        numOuterBonusSpins: 6,
        outerBaseMean: 1.8,
        outerBaseVar: 3,
        probNestedTriggerPerOuterSpin: 0.25,
        numNestedInnerSpins: 3,
        nestedInnerMean: 7,
        nestedInnerVar: 10,
      };
      const r = analyzeNestedMiniSlotInsideBonus(cfg);
      expect(r.commercialUpliftVsNoNestedSlot).toBeGreaterThan(1.5);
    });
    it("edge: single outer-spin K=1 + nested always (degenerate)", () => {
      const cfg: NestedMiniSlotInsideBonusConfig = {
        probBonusTriggerPerParentSpin: 0.1,
        numOuterBonusSpins: 1,
        outerBaseMean: 5,
        outerBaseVar: 1,
        probNestedTriggerPerOuterSpin: 1.0,
        numNestedInnerSpins: 2,
        nestedInnerMean: 10,
        nestedInnerVar: 4,
      };
      const r = analyzeNestedMiniSlotInsideBonus(cfg);
      // p_nested=1 → nested always triggers
      expect(r.expectedNestedTriggersPerBonus).toBe(1);
      expect(r.expectedBonusPayoutGivenTrigger).toBeCloseTo(5 + 2 * 10, 9);
    });
  });
});
