/**
 * W152 Wave 107 — Pick Bonus N-Stage Tree tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solvePickBonusNStageTree,
  simulatePickBonusNStageTree,
  type PickBonusNStageConfig,
} from '../src/features/pickBonusNStageTree.js';

const baseCfg = (overrides: Partial<PickBonusNStageConfig> = {}): PickBonusNStageConfig => ({
  stages: [
    { label: 'tier_1', advanceProbability: 0.50, collectProbability: 0.40, collectPayoutX: 5 },
    { label: 'tier_2', advanceProbability: 0.40, collectProbability: 0.50, collectPayoutX: 25 },
    { label: 'tier_3', advanceProbability: 0.20, collectProbability: 0.70, collectPayoutX: 100 },
    { label: 'grand',  advanceProbability: 0,    collectProbability: 0.90, collectPayoutX: 1000 },
  ],
  ...overrides,
});

describe('validation', () => {
  it('rejects empty stages', () => {
    expect(() => solvePickBonusNStageTree({ stages: [] })).toThrow();
  });
  it('rejects duplicate label', () => {
    expect(() => solvePickBonusNStageTree({
      stages: [
        { label: 'a', advanceProbability: 0, collectProbability: 1, collectPayoutX: 10 },
        { label: 'a', advanceProbability: 0, collectProbability: 1, collectPayoutX: 20 },
      ],
    })).toThrow();
  });
  it('rejects advance + collect > 1', () => {
    expect(() => solvePickBonusNStageTree({
      stages: [{ label: 'x', advanceProbability: 0.7, collectProbability: 0.6, collectPayoutX: 10 }],
    })).toThrow();
  });
  it('rejects non-final stage with advance=0 then last has advance>0', () => {
    expect(() => solvePickBonusNStageTree({
      stages: [
        { label: 'a', advanceProbability: 0.5, collectProbability: 0.5, collectPayoutX: 5 },
        { label: 'b', advanceProbability: 0.5, collectProbability: 0.5, collectPayoutX: 10 },
      ],
    })).toThrow();
  });
  it('rejects negative payout', () => {
    expect(() => solvePickBonusNStageTree({
      stages: [{ label: 'x', advanceProbability: 0, collectProbability: 1, collectPayoutX: -1 }],
    })).toThrow();
  });
  it('rejects bad baseTrigger', () => {
    expect(() => solvePickBonusNStageTree(baseCfg({ baseTriggerProbabilityPerSpin: 1.5 }))).toThrow();
  });
});

describe('closed-form correctness', () => {
  it('P(reach 1) = 1', () => {
    const r = solvePickBonusNStageTree(baseCfg());
    expect(r.reachProbabilities[0]).toBeCloseTo(1, 10);
  });
  it('P(reach i) = Π advance_{j<i}', () => {
    const r = solvePickBonusNStageTree(baseCfg());
    // 0.5 (reach 2), 0.5·0.4 = 0.2 (reach 3), 0.2·0.2 = 0.04 (reach grand)
    expect(r.reachProbabilities[1]).toBeCloseTo(0.5, 8);
    expect(r.reachProbabilities[2]).toBeCloseTo(0.2, 8);
    expect(r.reachProbabilities[3]).toBeCloseTo(0.04, 8);
  });
  it('P(collect at i) = P(reach i) · collect_i', () => {
    const r = solvePickBonusNStageTree(baseCfg());
    expect(r.collectProbabilities[0]).toBeCloseTo(1 * 0.40, 8);    // 0.40
    expect(r.collectProbabilities[1]).toBeCloseTo(0.5 * 0.50, 8);  // 0.25
    expect(r.collectProbabilities[2]).toBeCloseTo(0.2 * 0.70, 8);  // 0.14
    expect(r.collectProbabilities[3]).toBeCloseTo(0.04 * 0.90, 8); // 0.036
  });
  it('E[Y] = Σ collect_i · v_i', () => {
    const r = solvePickBonusNStageTree(baseCfg());
    // 0.40·5 + 0.25·25 + 0.14·100 + 0.036·1000 = 2 + 6.25 + 14 + 36 = 58.25
    expect(r.expectedPayoutX).toBeCloseTo(58.25, 6);
  });
  it('Var[Y] = E[Y²] − E[Y]²', () => {
    const r = solvePickBonusNStageTree(baseCfg());
    // E[Y²] = 0.40·25 + 0.25·625 + 0.14·10000 + 0.036·1000000
    //       = 10 + 156.25 + 1400 + 36000 = 37566.25
    // Var = 37566.25 − 58.25² = 37566.25 − 3393.0625 = 34173.1875
    expect(r.variancePayoutX).toBeCloseTo(34173.1875, 2);
  });
  it('P(reach top) = Π advance_{j<L}', () => {
    const r = solvePickBonusNStageTree(baseCfg());
    expect(r.probReachTopStage).toBeCloseTo(0.04, 8);
  });
  it('P(collect anywhere) + P(end with 0) = 1', () => {
    const r = solvePickBonusNStageTree(baseCfg());
    expect(r.probCollectAnywhere + r.probEndWithZero).toBeCloseTo(1, 10);
  });
  it('max payout identified', () => {
    const r = solvePickBonusNStageTree(baseCfg());
    expect(r.maxPayoutX).toBe(1000);
  });
  it('single-stage deterministic collect', () => {
    const r = solvePickBonusNStageTree({
      stages: [{ label: 'only', advanceProbability: 0, collectProbability: 1, collectPayoutX: 50 }],
    });
    expect(r.expectedPayoutX).toBe(50);
    expect(r.variancePayoutX).toBe(0);
    expect(r.probCollectAnywhere).toBe(1);
  });
  it('all-end (no collect) → E[Y]=0', () => {
    const r = solvePickBonusNStageTree({
      stages: [{ label: 'x', advanceProbability: 0, collectProbability: 0, collectPayoutX: 100 }],
    });
    expect(r.expectedPayoutX).toBe(0);
    expect(r.probCollectAnywhere).toBe(0);
    expect(r.probEndWithZero).toBe(1);
  });
  it('per-base-spin contribution if baseTrigger set', () => {
    const r = solvePickBonusNStageTree(baseCfg({ baseTriggerProbabilityPerSpin: 0.01 }));
    expect(r.expectedFeaturePayoutPerBaseSpin).toBeCloseTo(0.01 * 58.25, 6);
  });
});

describe('monotonicity', () => {
  it('higher advance probabilities ⇒ higher P(reach top)', () => {
    const a = solvePickBonusNStageTree(baseCfg());
    const cfgB = baseCfg();
    cfgB.stages = cfgB.stages.map((s, i) =>
      i < cfgB.stages.length - 1 ? { ...s, advanceProbability: 0.9, collectProbability: 0.05 } : s,
    );
    const b = solvePickBonusNStageTree(cfgB);
    expect(b.probReachTopStage).toBeGreaterThan(a.probReachTopStage);
  });
  it('higher top-tier payout ⇒ higher E[Y]', () => {
    const a = solvePickBonusNStageTree(baseCfg());
    const cfgB = baseCfg();
    cfgB.stages = [...cfgB.stages];
    cfgB.stages[3] = { ...cfgB.stages[3], collectPayoutX: 10000 };
    const b = solvePickBonusNStageTree(cfgB);
    expect(b.expectedPayoutX).toBeGreaterThan(a.expectedPayoutX);
  });
});

describe('MC cross-validation', () => {
  it('MC E[Y] matches CF (rel ≤ 3% at 100K episodes)', () => {
    const cfg = baseCfg();
    const cf = solvePickBonusNStageTree(cfg);
    const mc = simulatePickBonusNStageTree(cfg, 100_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedPayoutX - mc.observedMeanPayoutX) / cf.expectedPayoutX;
    expect(rel).toBeLessThan(0.03);
  });
  it('MC Var[Y] matches CF (rel ≤ 25% at 100K episodes)', () => {
    const cfg = baseCfg();
    const cf = solvePickBonusNStageTree(cfg);
    const mc = simulatePickBonusNStageTree(cfg, 100_000, 0xbeefbabe);
    const rel = Math.abs(cf.variancePayoutX - mc.observedVariancePayoutX) / cf.variancePayoutX;
    expect(rel).toBeLessThan(0.25);
  });
  it('MC reach distribution matches CF (rel ≤ 5%)', () => {
    const cfg = baseCfg();
    const cf = solvePickBonusNStageTree(cfg);
    const mc = simulatePickBonusNStageTree(cfg, 100_000, 0xfeedface);
    for (let i = 0; i < cf.reachProbabilities.length; i++) {
      if (cf.reachProbabilities[i] > 0.02) {
        const rel = Math.abs(cf.reachProbabilities[i] - mc.observedReachHistogram[i]) /
          cf.reachProbabilities[i];
        expect(rel).toBeLessThan(0.05);
      }
    }
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solvePickBonusNStageTree(baseCfg());
    const b = solvePickBonusNStageTree(baseCfg());
    expect(a.expectedPayoutX).toBe(b.expectedPayoutX);
  });
  it('MC same seed → identical', () => {
    const a = simulatePickBonusNStageTree(baseCfg(), 1000, 42);
    const b = simulatePickBonusNStageTree(baseCfg(), 1000, 42);
    expect(a.totalPayoutX).toBe(b.totalPayoutX);
  });
});

describe('industry use-cases', () => {
  it('NetEnt-style classic 3-tier pick-til-pop', () => {
    const r = solvePickBonusNStageTree({
      stages: [
        { label: 'silver', advanceProbability: 0.40, collectProbability: 0.50, collectPayoutX: 10 },
        { label: 'gold',   advanceProbability: 0.20, collectProbability: 0.70, collectPayoutX: 50 },
        { label: 'platinum', advanceProbability: 0, collectProbability: 0.85, collectPayoutX: 500 },
      ],
    });
    expect(r.probReachTopStage).toBeCloseTo(0.08, 8); // 0.4·0.2
    expect(r.expectedPayoutX).toBeGreaterThan(0);
  });
  it('Microgaming-style 5-tier with grand jackpot', () => {
    const r = solvePickBonusNStageTree({
      stages: [
        { label: 'tier_1', advanceProbability: 0.5,  collectProbability: 0.4,  collectPayoutX: 5 },
        { label: 'tier_2', advanceProbability: 0.4,  collectProbability: 0.5,  collectPayoutX: 25 },
        { label: 'tier_3', advanceProbability: 0.3,  collectProbability: 0.6,  collectPayoutX: 100 },
        { label: 'tier_4', advanceProbability: 0.2,  collectProbability: 0.7,  collectPayoutX: 500 },
        { label: 'grand',  advanceProbability: 0,    collectProbability: 0.95, collectPayoutX: 5000 },
      ],
    });
    expect(r.expectedPayoutX).toBeGreaterThan(0);
    expect(r.probReachTopStage).toBeCloseTo(0.5 * 0.4 * 0.3 * 0.2, 8); // 0.012
  });
});
