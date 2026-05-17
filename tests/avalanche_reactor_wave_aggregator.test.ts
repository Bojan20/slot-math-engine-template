/**
 * W152 Wave 177 — Avalanche Reactor Remove-and-Drop Wave Aggregator tests
 * (🎯 60. solver MILESTONE).
 */
import { describe, it, expect } from 'vitest';
import {
  analyzeAvalancheReactorWaveAggregator,
  simulateAvalancheReactorWaveAggregator,
  type AvalancheReactorWaveAggregatorConfig,
} from '../src/features/avalancheReactorWaveAggregator.js';

// Reactoonz-class cfg: p=0.50 (~50% cluster-form prob per wave),
// E[L]=8 (avg cluster size ~8 symbols), Var[L]=20, T=40 (Quantum Leap threshold)
// → E[W] = 1, E[S] = 8, but with E[W]=1 most spins won't hit T=40.
const baseCfg: AvalancheReactorWaveAggregatorConfig = {
  probWaveContinues: 0.50,
  expectedRemovalsPerWave: 8,
  varianceRemovalsPerWave: 20,
  activationThreshold: 40,
};

describe('analyzeAvalancheReactorWaveAggregator — validation', () => {
  it('rejects probWaveContinues = 0', () => {
    expect(() =>
      analyzeAvalancheReactorWaveAggregator({ ...baseCfg, probWaveContinues: 0 }),
    ).toThrow(/probWaveContinues/);
  });
  it('rejects probWaveContinues = 1', () => {
    expect(() =>
      analyzeAvalancheReactorWaveAggregator({ ...baseCfg, probWaveContinues: 1 }),
    ).toThrow(/probWaveContinues/);
  });
  it('rejects negative expectedRemovalsPerWave', () => {
    expect(() =>
      analyzeAvalancheReactorWaveAggregator({ ...baseCfg, expectedRemovalsPerWave: -1 }),
    ).toThrow(/expectedRemovalsPerWave/);
  });
  it('rejects negative varianceRemovalsPerWave', () => {
    expect(() =>
      analyzeAvalancheReactorWaveAggregator({ ...baseCfg, varianceRemovalsPerWave: -0.01 }),
    ).toThrow(/varianceRemovalsPerWave/);
  });
  it('rejects activationThreshold ≤ 0', () => {
    expect(() =>
      analyzeAvalancheReactorWaveAggregator({ ...baseCfg, activationThreshold: 0 }),
    ).toThrow(/activationThreshold/);
  });
  it('rejects negative disclosure threshold', () => {
    expect(() =>
      analyzeAvalancheReactorWaveAggregator({
        ...baseCfg,
        disclosureRemovalThresholds: [-1],
      }),
    ).toThrow(/disclosureRemoval/);
  });
});

describe('analyzeAvalancheReactorWaveAggregator — Geometric wave moments', () => {
  it('E[W] = p/(1−p) (p=0.5 → 1.0)', () => {
    const r = analyzeAvalancheReactorWaveAggregator(baseCfg);
    expect(r.expectedWavesPerSpin).toBeCloseTo(1.0, 10);
  });
  it('Var[W] = p/(1−p)² (p=0.5 → 2.0)', () => {
    const r = analyzeAvalancheReactorWaveAggregator(baseCfg);
    expect(r.varianceWavesPerSpin).toBeCloseTo(2.0, 10);
  });
  it('E[W] monotone in p (p=0.2 → 0.25, p=0.7 → 2.333)', () => {
    const rLow = analyzeAvalancheReactorWaveAggregator({ ...baseCfg, probWaveContinues: 0.2 });
    const rHigh = analyzeAvalancheReactorWaveAggregator({ ...baseCfg, probWaveContinues: 0.7 });
    expect(rLow.expectedWavesPerSpin).toBeCloseTo(0.25, 10);
    expect(rHigh.expectedWavesPerSpin).toBeCloseTo(7 / 3, 10);
    expect(rHigh.expectedWavesPerSpin).toBeGreaterThan(rLow.expectedWavesPerSpin);
  });
});

describe('analyzeAvalancheReactorWaveAggregator — Wald compound moments', () => {
  it('E[S] = E[W]·E[L] (1·8 = 8)', () => {
    const r = analyzeAvalancheReactorWaveAggregator(baseCfg);
    expect(r.expectedSymbolsRemovedPerSpin).toBeCloseTo(8, 8);
  });
  it('Var[S] = E[W]·Var[L] + Var[W]·E[L]² (1·20 + 2·64 = 148)', () => {
    const r = analyzeAvalancheReactorWaveAggregator(baseCfg);
    expect(r.varianceSymbolsRemovedPerSpin).toBeCloseTo(148, 6);
  });
  it('stdDev[S] = sqrt(Var[S])', () => {
    const r = analyzeAvalancheReactorWaveAggregator(baseCfg);
    expect(r.stdDevSymbolsRemovedPerSpin).toBeCloseTo(Math.sqrt(148), 8);
  });
  it('E[S] = 0 when μ_L = 0 (no removals)', () => {
    const r = analyzeAvalancheReactorWaveAggregator({ ...baseCfg, expectedRemovalsPerWave: 0 });
    expect(r.expectedSymbolsRemovedPerSpin).toBe(0);
  });
});

describe('analyzeAvalancheReactorWaveAggregator — activation probability', () => {
  it('probActivationCLT ∈ [0, 1]', () => {
    const r = analyzeAvalancheReactorWaveAggregator(baseCfg);
    expect(r.probActivationCLT).toBeGreaterThanOrEqual(0);
    expect(r.probActivationCLT).toBeLessThanOrEqual(1);
  });
  it('probActivationCLT = 0.5 when T = E[S]', () => {
    // T = E[S] = 8 → z = 0 → P = 0.5
    const r = analyzeAvalancheReactorWaveAggregator({ ...baseCfg, activationThreshold: 8 });
    expect(r.probActivationCLT).toBeCloseTo(0.5, 2);
  });
  it('probActivationCLT decreases as T increases', () => {
    const r10 = analyzeAvalancheReactorWaveAggregator({ ...baseCfg, activationThreshold: 10 });
    const r100 = analyzeAvalancheReactorWaveAggregator({ ...baseCfg, activationThreshold: 100 });
    expect(r10.probActivationCLT).toBeGreaterThan(r100.probActivationCLT);
  });
  it('probActivationConservativeMarkov = min(1, E[S]/T) — bound, not exact', () => {
    const r = analyzeAvalancheReactorWaveAggregator(baseCfg);
    expect(r.probActivationConservativeMarkov).toBeCloseTo(8 / 40, 8);
  });
  it('oneInNSpinsActivation = 1 / probActivationCLT', () => {
    const r = analyzeAvalancheReactorWaveAggregator(baseCfg);
    expect(r.oneInNSpinsActivation).toBeCloseTo(1 / r.probActivationCLT, 4);
  });
  it('meanToThresholdRatio = E[S] / T', () => {
    const r = analyzeAvalancheReactorWaveAggregator(baseCfg);
    expect(r.meanToThresholdRatio).toBeCloseTo(8 / 40, 8);
  });
});

describe('analyzeAvalancheReactorWaveAggregator — survival thresholds', () => {
  it('removalSurvivalAtThresholds[0] for k = 0 ≈ 1 (always ≥ 0)', () => {
    const r = analyzeAvalancheReactorWaveAggregator({
      ...baseCfg,
      disclosureRemovalThresholds: [0.001],
    });
    expect(r.removalSurvivalAtThresholds[0].probAtLeastK).toBeGreaterThan(0.7);
  });
  it('removalSurvivalAtThresholds monotone non-increasing in k', () => {
    const r = analyzeAvalancheReactorWaveAggregator({
      ...baseCfg,
      disclosureRemovalThresholds: [5, 10, 20, 40, 80],
    });
    for (let i = 1; i < r.removalSurvivalAtThresholds.length; i++) {
      expect(r.removalSurvivalAtThresholds[i].probAtLeastK).toBeLessThanOrEqual(
        r.removalSurvivalAtThresholds[i - 1].probAtLeastK + 1e-12,
      );
    }
  });
  it('oneInNSpins inverse of probAtLeastK', () => {
    const r = analyzeAvalancheReactorWaveAggregator({
      ...baseCfg,
      disclosureRemovalThresholds: [20],
    });
    expect(r.removalSurvivalAtThresholds[0].oneInNSpins).toBeCloseTo(
      1 / r.removalSurvivalAtThresholds[0].probAtLeastK,
      4,
    );
  });
});

describe('analyzeAvalancheReactorWaveAggregator — monotonicity', () => {
  it('E[S] increases as probWaveContinues increases', () => {
    const rLow = analyzeAvalancheReactorWaveAggregator({ ...baseCfg, probWaveContinues: 0.3 });
    const rHigh = analyzeAvalancheReactorWaveAggregator({ ...baseCfg, probWaveContinues: 0.7 });
    expect(rHigh.expectedSymbolsRemovedPerSpin).toBeGreaterThan(rLow.expectedSymbolsRemovedPerSpin);
  });
  it('E[S] increases as expectedRemovalsPerWave increases', () => {
    const rLow = analyzeAvalancheReactorWaveAggregator({ ...baseCfg, expectedRemovalsPerWave: 4 });
    const rHigh = analyzeAvalancheReactorWaveAggregator({ ...baseCfg, expectedRemovalsPerWave: 16 });
    expect(rHigh.expectedSymbolsRemovedPerSpin).toBeGreaterThan(rLow.expectedSymbolsRemovedPerSpin);
  });
  it('probActivation increases as E[S] increases (higher p or higher E[L])', () => {
    const rLow = analyzeAvalancheReactorWaveAggregator({ ...baseCfg, probWaveContinues: 0.3 });
    const rHigh = analyzeAvalancheReactorWaveAggregator({ ...baseCfg, probWaveContinues: 0.7 });
    expect(rHigh.probActivationCLT).toBeGreaterThan(rLow.probActivationCLT);
  });
});

describe('analyzeAvalancheReactorWaveAggregator — Monte Carlo cross-validation', () => {
  it('MC E[W] within 5% of CF (p=0.5 → 1.0)', () => {
    const cf = analyzeAvalancheReactorWaveAggregator(baseCfg);
    const mc = simulateAvalancheReactorWaveAggregator(baseCfg, 50_000, 0xa5a5);
    const rel = Math.abs(mc.meanWavesPerSpin - cf.expectedWavesPerSpin) / cf.expectedWavesPerSpin;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[S] within 5% of CF (Wald identity, 1·8 = 8)', () => {
    const cf = analyzeAvalancheReactorWaveAggregator(baseCfg);
    const mc = simulateAvalancheReactorWaveAggregator(baseCfg, 50_000, 0x1234);
    const rel =
      Math.abs(mc.meanSymbolsRemovedPerSpin - cf.expectedSymbolsRemovedPerSpin) /
      cf.expectedSymbolsRemovedPerSpin;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC stdDev[S] within 15% of CF (Wald variance)', () => {
    const cf = analyzeAvalancheReactorWaveAggregator(baseCfg);
    const mc = simulateAvalancheReactorWaveAggregator(baseCfg, 100_000, 0x5678);
    const rel =
      Math.abs(mc.stdDevSymbolsRemovedPerSpin - cf.stdDevSymbolsRemovedPerSpin) /
      cf.stdDevSymbolsRemovedPerSpin;
    expect(rel).toBeLessThan(0.15);
  });
  it('MC activation prob within 5pp of CLT for high E[W]=19 (p=0.95 makes CLT approx valid)', () => {
    // For compound Geometric+L sums, CLT validity requires E[W] >> 1 so P(W=0)
    // point mass becomes negligible. p=0.95 → E[W]=19, P(W=0)=0.05.
    const cfg: AvalancheReactorWaveAggregatorConfig = {
      probWaveContinues: 0.95,
      expectedRemovalsPerWave: 8,
      varianceRemovalsPerWave: 20,
      activationThreshold: 40,
    };
    const cf = analyzeAvalancheReactorWaveAggregator(cfg);
    const mc = simulateAvalancheReactorWaveAggregator(cfg, 100_000, 0x9abc);
    const abs = Math.abs(mc.probActivation - cf.probActivationCLT);
    expect(abs).toBeLessThan(0.05);
  });
});

describe('analyzeAvalancheReactorWaveAggregator — determinism', () => {
  it('two identical calls produce identical results', () => {
    const r1 = analyzeAvalancheReactorWaveAggregator(baseCfg);
    const r2 = analyzeAvalancheReactorWaveAggregator(baseCfg);
    expect(r1.expectedSymbolsRemovedPerSpin).toBe(r2.expectedSymbolsRemovedPerSpin);
    expect(r1.probActivationCLT).toBe(r2.probActivationCLT);
  });
  it('same seed → same MC result', () => {
    const m1 = simulateAvalancheReactorWaveAggregator(baseCfg, 1000, 0xdeadbeef);
    const m2 = simulateAvalancheReactorWaveAggregator(baseCfg, 1000, 0xdeadbeef);
    expect(m1.meanSymbolsRemovedPerSpin).toBeCloseTo(m2.meanSymbolsRemovedPerSpin, 12);
  });
});

describe('analyzeAvalancheReactorWaveAggregator — industry iconic configs', () => {
  it("Play'n GO Reactoonz Quantum Leap (p=0.45 E[L]=7 T=40) — low activation rate", () => {
    const r = analyzeAvalancheReactorWaveAggregator({
      probWaveContinues: 0.45,
      expectedRemovalsPerWave: 7,
      varianceRemovalsPerWave: 16,
      activationThreshold: 40,
    });
    expect(r.expectedWavesPerSpin).toBeCloseTo(0.45 / 0.55, 6);
    expect(r.expectedSymbolsRemovedPerSpin).toBeCloseTo((0.45 / 0.55) * 7, 6);
    // 1-in-X spins activation should be > 100 (low activation rate by design)
    expect(r.probActivationCLT).toBeLessThan(0.05);
  });
  it('ELK Reactor Energy (p=0.60 E[L]=5 T=10) — frequent activation', () => {
    const r = analyzeAvalancheReactorWaveAggregator({
      probWaveContinues: 0.60,
      expectedRemovalsPerWave: 5,
      varianceRemovalsPerWave: 9,
      activationThreshold: 10,
    });
    // E[W] = 1.5, E[S] = 7.5, T = 10 → activation moderately frequent
    expect(r.expectedSymbolsRemovedPerSpin).toBeCloseTo(7.5, 6);
    expect(r.probActivationCLT).toBeGreaterThan(0.1);
  });
  it('Hacksaw Tombstone Rip (p=0.70 E[L]=6 T=20) — high p sustained cascade', () => {
    const r = analyzeAvalancheReactorWaveAggregator({
      probWaveContinues: 0.70,
      expectedRemovalsPerWave: 6,
      varianceRemovalsPerWave: 12,
      activationThreshold: 20,
    });
    // E[W] = 7/3 ≈ 2.33, E[S] = 14, T = 20
    expect(r.expectedSymbolsRemovedPerSpin).toBeCloseTo(14, 6);
    expect(r.meanToThresholdRatio).toBeCloseTo(0.7, 4);
  });
  it('BTG Megaways evolution (p=0.40 E[L]=10 T=60) — heavy threshold rarely hit', () => {
    const r = analyzeAvalancheReactorWaveAggregator({
      probWaveContinues: 0.40,
      expectedRemovalsPerWave: 10,
      varianceRemovalsPerWave: 30,
      activationThreshold: 60,
    });
    // E[W] = 0.667, E[S] = 6.67, T = 60 → very rare activation
    expect(r.expectedSymbolsRemovedPerSpin).toBeCloseTo(20 / 3, 5);
    expect(r.probActivationCLT).toBeLessThan(0.01);
  });
});
