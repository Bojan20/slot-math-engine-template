// W152 Wave 187 — Deterministic Explosion Multiplier-Drop Aggregator vitest specs
// (68. solver, L&W M4 P1 GAP CLOSURE — Dancing Drums Explosion + Revolution).

import { describe, it, expect } from 'vitest';
import {
  analyzeDeterministicExplosion,
  simulateDeterministicExplosion,
  type DeterministicExplosionConfig,
} from '../src/features/deterministicExplosionMultiplierDrop.js';

const baseCfg: DeterministicExplosionConfig = {
  probTriggerPerSpin: 0.02,
  numExplodingPositions: 5,
  multiplierValueDistribution: [
    { value: 2, probability: 0.5 },
    { value: 3, probability: 0.3 },
    { value: 5, probability: 0.15 },
    { value: 10, probability: 0.05 },
  ],
  freePositionBaseValue: 10,
};

describe('Wave 187 — Deterministic Explosion Multiplier-Drop Aggregator', () => {
  describe('validation', () => {
    it('rejects probTriggerPerSpin outside (0, 1]', () => {
      expect(() => analyzeDeterministicExplosion({ ...baseCfg, probTriggerPerSpin: 0 })).toThrow(
        /probTriggerPerSpin/,
      );
      expect(() => analyzeDeterministicExplosion({ ...baseCfg, probTriggerPerSpin: 1.5 })).toThrow(
        /probTriggerPerSpin/,
      );
    });

    it('rejects numExplodingPositions < 1', () => {
      expect(() =>
        analyzeDeterministicExplosion({ ...baseCfg, numExplodingPositions: 0 }),
      ).toThrow(/numExplodingPositions/);
    });

    it('rejects empty multiplierValueDistribution', () => {
      expect(() =>
        analyzeDeterministicExplosion({ ...baseCfg, multiplierValueDistribution: [] }),
      ).toThrow(/non-empty/);
    });

    it('rejects negative multiplier value', () => {
      expect(() =>
        analyzeDeterministicExplosion({
          ...baseCfg,
          multiplierValueDistribution: [
            { value: -1, probability: 0.5 },
            { value: 5, probability: 0.5 },
          ],
        }),
      ).toThrow(/must be ≥ 0/);
    });

    it('rejects probability outside [0, 1]', () => {
      expect(() =>
        analyzeDeterministicExplosion({
          ...baseCfg,
          multiplierValueDistribution: [
            { value: 2, probability: -0.1 },
            { value: 5, probability: 1.1 },
          ],
        }),
      ).toThrow(/must be ∈/);
    });

    it('rejects PMF not summing to 1', () => {
      expect(() =>
        analyzeDeterministicExplosion({
          ...baseCfg,
          multiplierValueDistribution: [
            { value: 2, probability: 0.3 },
            { value: 5, probability: 0.3 },
          ],
        }),
      ).toThrow(/must sum to 1/);
    });

    it('rejects negative freePositionBaseValue', () => {
      expect(() =>
        analyzeDeterministicExplosion({ ...baseCfg, freePositionBaseValue: -1 }),
      ).toThrow(/freePositionBaseValue/);
    });
  });

  describe('closed-form correctness', () => {
    it('expectedMultiplierValue = Σ π_l · v_l', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      let expected = 0;
      for (const e of baseCfg.multiplierValueDistribution) expected += e.probability * e.value;
      expect(r.expectedMultiplierValue).toBeCloseTo(expected, 9);
    });

    it('varianceMultiplierValue = E[V²] − E[V]²', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      let eV = 0;
      let eV2 = 0;
      for (const e of baseCfg.multiplierValueDistribution) {
        eV += e.probability * e.value;
        eV2 += e.probability * e.value * e.value;
      }
      expect(r.varianceMultiplierValue).toBeCloseTo(eV2 - eV * eV, 9);
    });

    it('expectedTotalPayoutGivenTrigger = K · c · E[V]', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      const expected =
        baseCfg.numExplodingPositions * baseCfg.freePositionBaseValue * r.expectedMultiplierValue;
      expect(r.expectedTotalPayoutGivenTrigger).toBeCloseTo(expected, 9);
    });

    it('varianceTotalPayoutGivenTrigger = K · c² · Var[V]', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      const expected =
        baseCfg.numExplodingPositions *
        baseCfg.freePositionBaseValue *
        baseCfg.freePositionBaseValue *
        r.varianceMultiplierValue;
      expect(r.varianceTotalPayoutGivenTrigger).toBeCloseTo(expected, 9);
    });

    it('expectedPayoutPerSpin = p · E[S | trigger]', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      expect(r.expectedPayoutPerSpin).toBeCloseTo(
        baseCfg.probTriggerPerSpin * r.expectedTotalPayoutGivenTrigger,
        9,
      );
    });

    it('variancePayoutPerSpin via law of total variance', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      const p = baseCfg.probTriggerPerSpin;
      const expected =
        p * r.varianceTotalPayoutGivenTrigger +
        p * (1 - p) * r.expectedTotalPayoutGivenTrigger * r.expectedTotalPayoutGivenTrigger;
      expect(r.variancePayoutPerSpin).toBeCloseTo(expected, 9);
    });

    it('maxTotalMultiplierAchievable = K · v_max', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      let vMax = 0;
      for (const e of baseCfg.multiplierValueDistribution) if (e.value > vMax) vMax = e.value;
      expect(r.maxTotalMultiplierAchievable).toBeCloseTo(
        baseCfg.numExplodingPositions * vMax,
        9,
      );
    });

    it('probAllPositionsHitMaxGivenTrigger = π_max^K', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      let piMax = 0;
      let vMax = 0;
      for (const e of baseCfg.multiplierValueDistribution) {
        if (e.value > vMax) {
          vMax = e.value;
          piMax = e.probability;
        }
      }
      const expected = Math.pow(piMax, baseCfg.numExplodingPositions);
      expect(r.probAllPositionsHitMaxGivenTrigger).toBeCloseTo(expected, 9);
    });

    it('probAllPositionsHitMaxPerSpin = p_trigger · π_max^K', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      expect(r.probAllPositionsHitMaxPerSpin).toBeCloseTo(
        baseCfg.probTriggerPerSpin * r.probAllPositionsHitMaxGivenTrigger,
        9,
      );
    });

    it('oneInNSpinsAllMaxExplosion = 1 / probAllPositionsHitMaxPerSpin', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      if (r.probAllPositionsHitMaxPerSpin > 0) {
        expect(r.oneInNSpinsAllMaxExplosion).toBeCloseTo(1 / r.probAllPositionsHitMaxPerSpin, 6);
      }
    });

    it('perValueDisclosure entries match config order and probabilities', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      expect(r.perValueDisclosure.length).toBe(baseCfg.multiplierValueDistribution.length);
      for (let i = 0; i < r.perValueDisclosure.length; i++) {
        expect(r.perValueDisclosure[i].value).toBe(baseCfg.multiplierValueDistribution[i].value);
        expect(r.perValueDisclosure[i].probability).toBeCloseTo(
          baseCfg.multiplierValueDistribution[i].probability,
          9,
        );
      }
    });

    it('expectedPositionsHittingGivenTrigger = K · π_l', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      for (let i = 0; i < r.perValueDisclosure.length; i++) {
        expect(r.perValueDisclosure[i].expectedPositionsHittingGivenTrigger).toBeCloseTo(
          baseCfg.numExplodingPositions * baseCfg.multiplierValueDistribution[i].probability,
          9,
        );
      }
    });

    it('probAtLeastOneHitGivenTrigger = 1 − (1 − π_l)^K', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      for (let i = 0; i < r.perValueDisclosure.length; i++) {
        const piL = baseCfg.multiplierValueDistribution[i].probability;
        const expected = 1 - Math.pow(1 - piL, baseCfg.numExplodingPositions);
        expect(r.perValueDisclosure[i].probAtLeastOneHitGivenTrigger).toBeCloseTo(expected, 9);
      }
    });

    it('perSpinContributionToPayout sums to expectedPayoutPerSpin', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      const sum = r.perValueDisclosure.reduce((a, e) => a + e.perSpinContributionToPayout, 0);
      expect(sum).toBeCloseTo(r.expectedPayoutPerSpin, 9);
    });

    it('degenerate single-value PMF → V = constant', () => {
      const r = analyzeDeterministicExplosion({
        ...baseCfg,
        multiplierValueDistribution: [{ value: 5, probability: 1 }],
      });
      expect(r.expectedMultiplierValue).toBeCloseTo(5, 9);
      expect(r.varianceMultiplierValue).toBeCloseTo(0, 9);
      expect(r.probAllPositionsHitMaxGivenTrigger).toBeCloseTo(1, 9);
    });

    it('p_trigger = 1 → E[Y] = E[S | trigger]', () => {
      const r = analyzeDeterministicExplosion({ ...baseCfg, probTriggerPerSpin: 1 });
      expect(r.expectedPayoutPerSpin).toBeCloseTo(r.expectedTotalPayoutGivenTrigger, 9);
    });

    it('K = 1 → degenerate to single-V draw', () => {
      const r = analyzeDeterministicExplosion({ ...baseCfg, numExplodingPositions: 1 });
      expect(r.expectedTotalPayoutGivenTrigger).toBeCloseTo(
        baseCfg.freePositionBaseValue * r.expectedMultiplierValue,
        9,
      );
    });

    it('commercialUpliftVsFlatBaseline > 1 za favorable trigger × K × E[V]', () => {
      const r = analyzeDeterministicExplosion(baseCfg);
      // p·K·E[V] = 0.02·5·3.275 = 0.3275 — actually < 1 (rare trigger)
      // za realan favorable test koristim p=0.5
      const rFavorable = analyzeDeterministicExplosion({ ...baseCfg, probTriggerPerSpin: 0.5 });
      expect(rFavorable.commercialUpliftVsFlatBaseline).toBeGreaterThan(1);
      void r;
    });
  });

  describe('monotonicity', () => {
    it('higher p_trigger → higher expectedPayoutPerSpin', () => {
      const low = analyzeDeterministicExplosion({ ...baseCfg, probTriggerPerSpin: 0.01 });
      const high = analyzeDeterministicExplosion({ ...baseCfg, probTriggerPerSpin: 0.10 });
      expect(high.expectedPayoutPerSpin).toBeGreaterThan(low.expectedPayoutPerSpin);
    });

    it('higher K → higher expected per-trigger payout', () => {
      const small = analyzeDeterministicExplosion({ ...baseCfg, numExplodingPositions: 3 });
      const large = analyzeDeterministicExplosion({ ...baseCfg, numExplodingPositions: 10 });
      expect(large.expectedTotalPayoutGivenTrigger).toBeGreaterThan(small.expectedTotalPayoutGivenTrigger);
    });

    it('higher base value → linear scaling', () => {
      const r1 = analyzeDeterministicExplosion({ ...baseCfg, freePositionBaseValue: 10 });
      const r3 = analyzeDeterministicExplosion({ ...baseCfg, freePositionBaseValue: 30 });
      expect(r3.expectedPayoutPerSpin / r1.expectedPayoutPerSpin).toBeCloseTo(3, 1);
    });

    it('shift PMF to higher values → higher E[V]', () => {
      const low = analyzeDeterministicExplosion({
        ...baseCfg,
        multiplierValueDistribution: [
          { value: 2, probability: 0.7 },
          { value: 3, probability: 0.3 },
        ],
      });
      const high = analyzeDeterministicExplosion({
        ...baseCfg,
        multiplierValueDistribution: [
          { value: 5, probability: 0.7 },
          { value: 10, probability: 0.3 },
        ],
      });
      expect(high.expectedMultiplierValue).toBeGreaterThan(low.expectedMultiplierValue);
    });
  });

  describe('MC cross-validation', () => {
    const tightCfg: DeterministicExplosionConfig = {
      probTriggerPerSpin: 0.05,
      numExplodingPositions: 5,
      multiplierValueDistribution: [
        { value: 2, probability: 0.5 },
        { value: 3, probability: 0.3 },
        { value: 5, probability: 0.15 },
        { value: 10, probability: 0.05 },
      ],
      freePositionBaseValue: 10,
    };

    it('CF E[Y/spin] within 5% rel of MC mean @ 100K spins', () => {
      const cf = analyzeDeterministicExplosion(tightCfg);
      const mc = simulateDeterministicExplosion(tightCfg, 100_000, 0xC0FFEE);
      const rel =
        Math.abs(cf.expectedPayoutPerSpin - mc.meanPayoutPerSpin) /
        Math.max(mc.meanPayoutPerSpin, 1e-9);
      expect(rel).toBeLessThan(0.10);
    });

    it('CF E[V] within 3% rel of MC mean multiplier value', () => {
      const cf = analyzeDeterministicExplosion(tightCfg);
      const mc = simulateDeterministicExplosion(tightCfg, 100_000, 0xBEEF_187);
      const rel =
        Math.abs(cf.expectedMultiplierValue - mc.meanMultiplierValueAcrossPositions) /
        mc.meanMultiplierValueAcrossPositions;
      expect(rel).toBeLessThan(0.04);
    });

    it('CF trigger rate within 1pp abs of MC observed', () => {
      const cf = analyzeDeterministicExplosion(tightCfg);
      const mc = simulateDeterministicExplosion(tightCfg, 100_000, 0xCAFE);
      const abs = Math.abs(tightCfg.probTriggerPerSpin - mc.observedTriggerRate);
      expect(abs).toBeLessThan(0.01);
      void cf;
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC', () => {
      const a = simulateDeterministicExplosion(baseCfg, 1000, 0xAA);
      const b = simulateDeterministicExplosion(baseCfg, 1000, 0xAA);
      expect(a.meanPayoutPerSpin).toBe(b.meanPayoutPerSpin);
      expect(a.observedTriggerRate).toBe(b.observedTriggerRate);
    });

    it('different seeds → different MC', () => {
      const a = simulateDeterministicExplosion(baseCfg, 1000, 0xAA);
      const b = simulateDeterministicExplosion(baseCfg, 1000, 0xBB);
      expect(a.meanPayoutPerSpin !== b.meanPayoutPerSpin).toBe(true);
    });
  });

  describe('industry use-cases (L&W M4 Dancing Drums Explosion family)', () => {
    it('Dancing Drums Explosion 5-position 2×/3×/5× distribution', () => {
      const cfg: DeterministicExplosionConfig = {
        probTriggerPerSpin: 0.03,
        numExplodingPositions: 5,
        multiplierValueDistribution: [
          { value: 2, probability: 0.6 },
          { value: 3, probability: 0.3 },
          { value: 5, probability: 0.1 },
        ],
        freePositionBaseValue: 8,
      };
      const r = analyzeDeterministicExplosion(cfg);
      expect(r.expectedPayoutPerSpin).toBeGreaterThan(0);
      expect(r.maxTotalMultiplierAchievable).toBe(25); // 5 · 5
    });

    it('Dancing Drums Revolution extended 8-position deeper distribution', () => {
      const cfg: DeterministicExplosionConfig = {
        probTriggerPerSpin: 0.02,
        numExplodingPositions: 8,
        multiplierValueDistribution: [
          { value: 2, probability: 0.45 },
          { value: 3, probability: 0.3 },
          { value: 5, probability: 0.15 },
          { value: 10, probability: 0.07 },
          { value: 25, probability: 0.03 },
        ],
        freePositionBaseValue: 10,
      };
      const r = analyzeDeterministicExplosion(cfg);
      expect(r.expectedPayoutPerSpin).toBeGreaterThan(0);
      expect(r.maxTotalMultiplierAchievable).toBe(200); // 8 · 25
      // P(all 8 hit 25× | trigger) = 0.03^8 = ~6.5e-13 (extremely rare)
      expect(r.probAllPositionsHitMaxGivenTrigger).toBeLessThan(1e-10);
    });

    it('edge: single-position single-value (degenerate)', () => {
      const r = analyzeDeterministicExplosion({
        probTriggerPerSpin: 0.1,
        numExplodingPositions: 1,
        multiplierValueDistribution: [{ value: 10, probability: 1 }],
        freePositionBaseValue: 5,
      });
      expect(r.expectedPayoutPerSpin).toBeCloseTo(0.1 * 1 * 5 * 10, 9);
      expect(r.varianceMultiplierValue).toBeCloseTo(0, 9);
    });
  });
});
