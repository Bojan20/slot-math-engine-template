/**
 * W152 Wave 179 — Sticky Multiplier FS Trail Aggregator tests.
 */
import { describe, it, expect } from 'vitest';
import {
  analyzeStickyMultiplierFsTrail,
  simulateStickyMultiplierFsTrail,
  type StickyMultiplierFsTrailConfig,
} from '../src/features/stickyMultiplierFsTrail.js';

// Bonanza Megaways-class cfg: N=12 FS, M_0=1, q=0.40 cluster-win-prob,
// Δ=1 deterministic increment (Bonanza always +1), σ²_Δ=0, Y=2× per spin
const baseCfg: StickyMultiplierFsTrailConfig = {
  numFreeSpins: 12,
  startMultiplier: 1,
  probIncrementPerSpin: 0.40,
  expectedIncrementValue: 1,
  varianceIncrementValue: 0,
  baseFsWinMean: 2,
  baseFsWinVar: 4,
};

describe('analyzeStickyMultiplierFsTrail — validation', () => {
  it('rejects numFreeSpins < 1', () => {
    expect(() => analyzeStickyMultiplierFsTrail({ ...baseCfg, numFreeSpins: 0 })).toThrow(
      /numFreeSpins/,
    );
  });
  it('rejects non-integer numFreeSpins', () => {
    expect(() => analyzeStickyMultiplierFsTrail({ ...baseCfg, numFreeSpins: 5.5 })).toThrow(
      /numFreeSpins/,
    );
  });
  it('rejects startMultiplier < 1', () => {
    expect(() => analyzeStickyMultiplierFsTrail({ ...baseCfg, startMultiplier: 0.5 })).toThrow(
      /startMultiplier/,
    );
  });
  it('rejects probIncrementPerSpin > 1', () => {
    expect(() =>
      analyzeStickyMultiplierFsTrail({ ...baseCfg, probIncrementPerSpin: 1.5 }),
    ).toThrow(/probIncrementPerSpin/);
  });
  it('rejects negative probIncrementPerSpin', () => {
    expect(() =>
      analyzeStickyMultiplierFsTrail({ ...baseCfg, probIncrementPerSpin: -0.1 }),
    ).toThrow(/probIncrementPerSpin/);
  });
  it('rejects negative expectedIncrementValue', () => {
    expect(() =>
      analyzeStickyMultiplierFsTrail({ ...baseCfg, expectedIncrementValue: -1 }),
    ).toThrow(/expectedIncrementValue/);
  });
  it('rejects negative varianceIncrementValue', () => {
    expect(() =>
      analyzeStickyMultiplierFsTrail({ ...baseCfg, varianceIncrementValue: -0.01 }),
    ).toThrow(/varianceIncrementValue/);
  });
  it('rejects negative baseFsWinMean', () => {
    expect(() => analyzeStickyMultiplierFsTrail({ ...baseCfg, baseFsWinMean: -1 })).toThrow(
      /baseFsWinMean/,
    );
  });
  it('rejects negative baseFsWinVar', () => {
    expect(() => analyzeStickyMultiplierFsTrail({ ...baseCfg, baseFsWinVar: -0.01 })).toThrow(
      /baseFsWinVar/,
    );
  });
  it('rejects multiplierTargetForSpinDisclosure < startMultiplier', () => {
    expect(() =>
      analyzeStickyMultiplierFsTrail({
        ...baseCfg,
        startMultiplier: 5,
        multiplierTargetForSpinDisclosure: 3,
      }),
    ).toThrow(/multiplierTargetForSpinDisclosure/);
  });
});

describe('analyzeStickyMultiplierFsTrail — Binomial increment moments', () => {
  it('E[N_inc] = N·q (12·0.40 = 4.8)', () => {
    const r = analyzeStickyMultiplierFsTrail(baseCfg);
    expect(r.expectedIncrementsPerFs).toBeCloseTo(4.8, 10);
  });
  it('Var[N_inc] = N·q·(1−q) (12·0.40·0.60 = 2.88)', () => {
    const r = analyzeStickyMultiplierFsTrail(baseCfg);
    expect(r.varianceIncrementsPerFs).toBeCloseTo(2.88, 10);
  });
});

describe('analyzeStickyMultiplierFsTrail — final multiplier', () => {
  it('E[M_N] = M_0 + N·q·μ_Δ (1 + 12·0.40·1 = 5.8)', () => {
    const r = analyzeStickyMultiplierFsTrail(baseCfg);
    expect(r.expectedFinalMultiplier).toBeCloseTo(5.8, 10);
  });
  it('Var[M_N] = N·q·(σ²_Δ + (1−q)·μ_Δ²) za Δ deterministic (σ²=0): = 12·0.4·0.6·1 = 2.88', () => {
    const r = analyzeStickyMultiplierFsTrail(baseCfg);
    expect(r.varianceFinalMultiplier).toBeCloseTo(2.88, 8);
  });
  it('stdDev[M_N] = sqrt(Var)', () => {
    const r = analyzeStickyMultiplierFsTrail(baseCfg);
    expect(r.stdDevFinalMultiplier).toBeCloseTo(Math.sqrt(r.varianceFinalMultiplier), 10);
  });
  it('E[M_N] = M_0 when q = 0 (no increments)', () => {
    const r = analyzeStickyMultiplierFsTrail({ ...baseCfg, probIncrementPerSpin: 0 });
    expect(r.expectedFinalMultiplier).toBe(baseCfg.startMultiplier);
  });
  it('Var[M_N] = 0 when q = 0', () => {
    const r = analyzeStickyMultiplierFsTrail({ ...baseCfg, probIncrementPerSpin: 0 });
    expect(r.varianceFinalMultiplier).toBe(0);
  });
});

describe('analyzeStickyMultiplierFsTrail — trail-sum payout (quadratic in N)', () => {
  it('E[S_FS] = μ_Y · (N·M_0 + q·μ_Δ·N(N-1)/2)', () => {
    const r = analyzeStickyMultiplierFsTrail(baseCfg);
    // μ_Y=2, N=12, M_0=1, q=0.4, μ_Δ=1 → 2·(12 + 0.4·12·11/2) = 2·(12 + 26.4) = 76.8
    expect(r.expectedTrailSumPayoutPerFs).toBeCloseTo(76.8, 6);
  });
  it('E[S_FS] grows quadratically in N (defining sticky-trail signature)', () => {
    const rN6 = analyzeStickyMultiplierFsTrail({ ...baseCfg, numFreeSpins: 6 });
    const rN12 = analyzeStickyMultiplierFsTrail({ ...baseCfg, numFreeSpins: 12 });
    const rN24 = analyzeStickyMultiplierFsTrail({ ...baseCfg, numFreeSpins: 24 });
    // Ratio N=24/N=6 should be much greater than 4 (linear) due to quadratic growth
    expect(rN24.expectedTrailSumPayoutPerFs / rN6.expectedTrailSumPayoutPerFs).toBeGreaterThan(8);
    // Mid-point check
    expect(rN12.expectedTrailSumPayoutPerFs / rN6.expectedTrailSumPayoutPerFs).toBeGreaterThan(3);
  });
  it('E[S_FS] = N · M_0 · μ_Y when q = 0 (flat multiplier baseline)', () => {
    const r = analyzeStickyMultiplierFsTrail({ ...baseCfg, probIncrementPerSpin: 0 });
    expect(r.expectedTrailSumPayoutPerFs).toBeCloseTo(12 * 1 * 2, 8);
  });
  it('E[S_FS] = 0 when μ_Y = 0', () => {
    const r = analyzeStickyMultiplierFsTrail({ ...baseCfg, baseFsWinMean: 0 });
    expect(r.expectedTrailSumPayoutPerFs).toBeCloseTo(0, 8);
  });
  it('stdDev[S_FS] > 0 with non-zero variance', () => {
    const r = analyzeStickyMultiplierFsTrail(baseCfg);
    expect(r.stdDevTrailSumPayoutPerFs).toBeGreaterThan(0);
  });
});

describe('analyzeStickyMultiplierFsTrail — commercial uplift', () => {
  it('commercialUpliftRatio = E[S_FS] / (μ_Y · N · M_0) > 1 when q > 0', () => {
    const r = analyzeStickyMultiplierFsTrail(baseCfg);
    expect(r.commercialUpliftRatio).toBeGreaterThan(1);
    // 76.8 / (2·12·1) = 3.2
    expect(r.commercialUpliftRatio).toBeCloseTo(3.2, 6);
  });
  it('commercialUpliftRatio = 1 when q = 0 (baseline)', () => {
    const r = analyzeStickyMultiplierFsTrail({ ...baseCfg, probIncrementPerSpin: 0 });
    expect(r.commercialUpliftRatio).toBeCloseTo(1, 10);
  });
  it('commercialUpliftRatio increases as q increases', () => {
    const rLow = analyzeStickyMultiplierFsTrail({ ...baseCfg, probIncrementPerSpin: 0.1 });
    const rHigh = analyzeStickyMultiplierFsTrail({ ...baseCfg, probIncrementPerSpin: 0.8 });
    expect(rHigh.commercialUpliftRatio).toBeGreaterThan(rLow.commercialUpliftRatio);
  });
});

describe('analyzeStickyMultiplierFsTrail — trajectory & target spin', () => {
  it('trajectory has length N', () => {
    const r = analyzeStickyMultiplierFsTrail(baseCfg);
    expect(r.multiplierTrajectoryExpectations.length).toBe(12);
  });
  it('trajectory[0] = M_0', () => {
    const r = analyzeStickyMultiplierFsTrail(baseCfg);
    expect(r.multiplierTrajectoryExpectations[0]).toBe(1);
  });
  it('trajectory is linearly increasing in t', () => {
    const r = analyzeStickyMultiplierFsTrail(baseCfg);
    for (let i = 1; i < r.multiplierTrajectoryExpectations.length; i++) {
      expect(r.multiplierTrajectoryExpectations[i]).toBeGreaterThanOrEqual(
        r.multiplierTrajectoryExpectations[i - 1],
      );
    }
  });
  it('expectedSpinsToReachMultiplierTarget linear formula (target=5, M_0=1, q·μ=0.4 → 10 spins)', () => {
    const r = analyzeStickyMultiplierFsTrail({
      ...baseCfg,
      multiplierTargetForSpinDisclosure: 5,
    });
    expect(r.expectedSpinsToReachMultiplierTarget).toBeCloseTo(10, 8);
  });
  it('expectedSpinsToReach = ∞ when q = 0', () => {
    const r = analyzeStickyMultiplierFsTrail({
      ...baseCfg,
      probIncrementPerSpin: 0,
      multiplierTargetForSpinDisclosure: 5,
    });
    expect(r.expectedSpinsToReachMultiplierTarget).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('analyzeStickyMultiplierFsTrail — monotonicity', () => {
  it('E[M_N] increases as N increases', () => {
    const rN6 = analyzeStickyMultiplierFsTrail({ ...baseCfg, numFreeSpins: 6 });
    const rN20 = analyzeStickyMultiplierFsTrail({ ...baseCfg, numFreeSpins: 20 });
    expect(rN20.expectedFinalMultiplier).toBeGreaterThan(rN6.expectedFinalMultiplier);
  });
  it('E[M_N] increases as q increases', () => {
    const rLow = analyzeStickyMultiplierFsTrail({ ...baseCfg, probIncrementPerSpin: 0.1 });
    const rHigh = analyzeStickyMultiplierFsTrail({ ...baseCfg, probIncrementPerSpin: 0.8 });
    expect(rHigh.expectedFinalMultiplier).toBeGreaterThan(rLow.expectedFinalMultiplier);
  });
  it('E[M_N] increases as μ_Δ increases', () => {
    const rLow = analyzeStickyMultiplierFsTrail({ ...baseCfg, expectedIncrementValue: 1 });
    const rHigh = analyzeStickyMultiplierFsTrail({ ...baseCfg, expectedIncrementValue: 10 });
    expect(rHigh.expectedFinalMultiplier).toBeGreaterThan(rLow.expectedFinalMultiplier);
  });
});

describe('analyzeStickyMultiplierFsTrail — Monte Carlo cross-validation', () => {
  it('MC E[N_inc] within 5% of CF', () => {
    const cf = analyzeStickyMultiplierFsTrail(baseCfg);
    const mc = simulateStickyMultiplierFsTrail(baseCfg, 20_000, 0xa5a5);
    const rel = Math.abs(mc.meanIncrementsPerFs - cf.expectedIncrementsPerFs) / cf.expectedIncrementsPerFs;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC E[M_N] within 5% of CF', () => {
    const cf = analyzeStickyMultiplierFsTrail(baseCfg);
    const mc = simulateStickyMultiplierFsTrail(baseCfg, 20_000, 0x1234);
    const rel = Math.abs(mc.meanFinalMultiplier - cf.expectedFinalMultiplier) / cf.expectedFinalMultiplier;
    expect(rel).toBeLessThan(0.05);
  });
  it('MC stdDev[M_N] within 15% of CF', () => {
    const cf = analyzeStickyMultiplierFsTrail(baseCfg);
    const mc = simulateStickyMultiplierFsTrail(baseCfg, 30_000, 0x5678);
    const rel =
      Math.abs(mc.stdDevFinalMultiplier - cf.stdDevFinalMultiplier) / cf.stdDevFinalMultiplier;
    expect(rel).toBeLessThan(0.15);
  });
  it('MC E[S_FS] within 10% of CF (quadratic-in-N trail-sum, compound distribution)', () => {
    // E[S_FS] = Σ_t Y_t · M_{t-1} is doubly-stochastic — Y_t random per spin,
    // M_t building incrementally with iid noise. With short FS (N=12) and
    // 20K runs, expected rel err is ~3-10% depending on variance scaling.
    const cf = analyzeStickyMultiplierFsTrail(baseCfg);
    const mc = simulateStickyMultiplierFsTrail(baseCfg, 20_000, 0x9abc);
    const rel =
      Math.abs(mc.meanTrailSumPayoutPerFs - cf.expectedTrailSumPayoutPerFs) /
      cf.expectedTrailSumPayoutPerFs;
    expect(rel).toBeLessThan(0.10);
  });
});

describe('analyzeStickyMultiplierFsTrail — determinism', () => {
  it('two identical calls produce identical results', () => {
    const r1 = analyzeStickyMultiplierFsTrail(baseCfg);
    const r2 = analyzeStickyMultiplierFsTrail(baseCfg);
    expect(r1.expectedFinalMultiplier).toBe(r2.expectedFinalMultiplier);
    expect(r1.expectedTrailSumPayoutPerFs).toBe(r2.expectedTrailSumPayoutPerFs);
  });
  it('same seed → same MC result', () => {
    const m1 = simulateStickyMultiplierFsTrail(baseCfg, 500, 0xdeadbeef);
    const m2 = simulateStickyMultiplierFsTrail(baseCfg, 500, 0xdeadbeef);
    expect(m1.meanFinalMultiplier).toBeCloseTo(m2.meanFinalMultiplier, 12);
  });
});

describe('analyzeStickyMultiplierFsTrail — industry iconic configs', () => {
  it('BTG Bonanza Megaways FS (N=12 M_0=1 q=0.4 Δ=1) — E[M_N]=5.8', () => {
    const r = analyzeStickyMultiplierFsTrail({
      numFreeSpins: 12,
      startMultiplier: 1,
      probIncrementPerSpin: 0.4,
      expectedIncrementValue: 1,
      varianceIncrementValue: 0,
      baseFsWinMean: 2,
      baseFsWinVar: 4,
    });
    expect(r.expectedFinalMultiplier).toBeCloseTo(5.8, 6);
  });
  it('Pragmatic Sweet Bonanza FS (N=10 M_0=1 q=0.1 Δ_mean=15) — E[M_N]=16', () => {
    const r = analyzeStickyMultiplierFsTrail({
      numFreeSpins: 10,
      startMultiplier: 1,
      probIncrementPerSpin: 0.1,
      expectedIncrementValue: 15,
      varianceIncrementValue: 200,
      baseFsWinMean: 1.5,
      baseFsWinVar: 5,
    });
    expect(r.expectedFinalMultiplier).toBeCloseTo(16, 6);
  });
  it('BTG White Rabbit FS (N=20 M_0=1 q=0.15 Δ=1) — long FS bonanza', () => {
    const r = analyzeStickyMultiplierFsTrail({
      numFreeSpins: 20,
      startMultiplier: 1,
      probIncrementPerSpin: 0.15,
      expectedIncrementValue: 1,
      varianceIncrementValue: 0,
      baseFsWinMean: 1,
      baseFsWinVar: 2,
    });
    expect(r.expectedFinalMultiplier).toBeCloseTo(4, 6); // 1 + 20·0.15
  });
  it('Hacksaw Wanted Dead bounty xMult chain (N=15 M_0=1 q=0.3 Δ_mean=5) — high-vol uplift', () => {
    const r = analyzeStickyMultiplierFsTrail({
      numFreeSpins: 15,
      startMultiplier: 1,
      probIncrementPerSpin: 0.3,
      expectedIncrementValue: 5,
      varianceIncrementValue: 25,
      baseFsWinMean: 1,
      baseFsWinVar: 3,
    });
    expect(r.expectedFinalMultiplier).toBeCloseTo(1 + 15 * 0.3 * 5, 6); // = 23.5
    expect(r.commercialUpliftRatio).toBeGreaterThan(5);
  });
});
