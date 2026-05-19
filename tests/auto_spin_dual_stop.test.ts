/**
 * W220 — Auto-Spin Dual-Stop (Loss/Win Limit + Spin Count Cap) Analyzer tests.
 *
 * 32 specs covering:
 *   - validation (8)
 *   - barrier probability correctness (5)
 *   - drift regime detection (3)
 *   - spin-limit truncation behaviour (4)
 *   - expected spins / final net (3)
 *   - risk score + 1-in-N regulator form (3)
 *   - monotonicity invariants (3)
 *   - MC cross-validation (2)
 *   - determinism (1)
 *   - industry use-case (1) — UK responsible-gambling 200x bankroll session
 */

import { describe, it, expect } from 'vitest';
import {
  solveAutoSpinDualStop,
  simulateAutoSpinDualStop,
} from '../src/features/autoSpinDualStop.js';

const baseCfg = {
  bet: 1,
  rtp: 0.96,
  volatilityIndex: 5,
  lossLimit: 50,
  winLimit: 50,
  maxAutoSpins: 1000,
};

describe('autoSpinDualStop — validation', () => {
  it('rejects bet ≤ 0', () => {
    expect(() => solveAutoSpinDualStop({ ...baseCfg, bet: 0 })).toThrow();
    expect(() => solveAutoSpinDualStop({ ...baseCfg, bet: -1 })).toThrow();
  });
  it('rejects rtp out of (0.5, 1.2)', () => {
    expect(() => solveAutoSpinDualStop({ ...baseCfg, rtp: 0.4 })).toThrow();
    expect(() => solveAutoSpinDualStop({ ...baseCfg, rtp: 1.3 })).toThrow();
  });
  it('rejects volatilityIndex ≤ 0', () => {
    expect(() =>
      solveAutoSpinDualStop({ ...baseCfg, volatilityIndex: 0 }),
    ).toThrow();
    expect(() =>
      solveAutoSpinDualStop({ ...baseCfg, volatilityIndex: -2 }),
    ).toThrow();
  });
  it('rejects lossLimit ≤ 0', () => {
    expect(() => solveAutoSpinDualStop({ ...baseCfg, lossLimit: 0 })).toThrow();
  });
  it('rejects winLimit ≤ 0', () => {
    expect(() => solveAutoSpinDualStop({ ...baseCfg, winLimit: 0 })).toThrow();
  });
  it('rejects maxAutoSpins < 1', () => {
    expect(() =>
      solveAutoSpinDualStop({ ...baseCfg, maxAutoSpins: 0 }),
    ).toThrow();
  });
  it('rejects non-finite bet', () => {
    expect(() => solveAutoSpinDualStop({ ...baseCfg, bet: NaN })).toThrow();
    expect(() =>
      solveAutoSpinDualStop({ ...baseCfg, bet: Infinity }),
    ).toThrow();
  });
  it('rejects fractional maxAutoSpins', () => {
    expect(() =>
      solveAutoSpinDualStop({ ...baseCfg, maxAutoSpins: 100.5 }),
    ).toThrow();
  });
});

describe('autoSpinDualStop — barrier probabilities', () => {
  it('zero-drift: P_win = a/(a+b) for symmetric limits', () => {
    const r = solveAutoSpinDualStop({ ...baseCfg, rtp: 1.0, lossLimit: 50, winLimit: 50 });
    expect(r.probWinUnconditional).toBeCloseTo(0.5, 6);
    expect(r.probLossUnconditional).toBeCloseTo(0.5, 6);
  });
  it('zero-drift: P_win = a/(a+b) for asymmetric limits 30/70', () => {
    const r = solveAutoSpinDualStop({ ...baseCfg, rtp: 1.0, lossLimit: 30, winLimit: 70 });
    expect(r.probWinUnconditional).toBeCloseTo(0.3, 6);
  });
  it('negative drift: P_loss > P_win', () => {
    const r = solveAutoSpinDualStop(baseCfg); // rtp 0.96 → negative drift
    expect(r.probLossUnconditional).toBeGreaterThan(r.probWinUnconditional);
  });
  it('positive drift: P_win > P_loss', () => {
    const r = solveAutoSpinDualStop({ ...baseCfg, rtp: 1.05 });
    expect(r.probWinUnconditional).toBeGreaterThan(r.probLossUnconditional);
  });
  it('barrier probs sum to 1 unconditionally', () => {
    const r = solveAutoSpinDualStop(baseCfg);
    expect(r.probWinUnconditional + r.probLossUnconditional).toBeCloseTo(1, 9);
  });
});

describe('autoSpinDualStop — drift regime detection', () => {
  it('detects zero drift at RTP=1.0', () => {
    const r = solveAutoSpinDualStop({ ...baseCfg, rtp: 1.0 });
    expect(r.driftRegime).toBe('zero');
    expect(r.meanNetPerSpin).toBeCloseTo(0, 9);
  });
  it('detects negative drift at RTP<1', () => {
    const r = solveAutoSpinDualStop({ ...baseCfg, rtp: 0.96 });
    expect(r.driftRegime).toBe('negative');
    expect(r.meanNetPerSpin).toBeLessThan(0);
  });
  it('detects positive drift at RTP>1', () => {
    const r = solveAutoSpinDualStop({ ...baseCfg, rtp: 1.02 });
    expect(r.driftRegime).toBe('positive');
    expect(r.meanNetPerSpin).toBeGreaterThan(0);
  });
});

describe('autoSpinDualStop — spin-limit truncation', () => {
  it('large N_max relative to E[T_unbounded]: P_spin_limit ≈ 0', () => {
    const r = solveAutoSpinDualStop({ ...baseCfg, maxAutoSpins: 100000 });
    expect(r.probSpinLimitFired).toBeLessThan(0.05);
  });
  it('small N_max: P_spin_limit substantial', () => {
    const r = solveAutoSpinDualStop({ ...baseCfg, maxAutoSpins: 10 });
    expect(r.probSpinLimitFired).toBeGreaterThan(0.1);
  });
  it('three exit probabilities sum to 1', () => {
    const r = solveAutoSpinDualStop({ ...baseCfg, maxAutoSpins: 50 });
    const total = r.probLossStopFired + r.probWinStopFired + r.probSpinLimitFired;
    expect(total).toBeCloseTo(1, 9);
  });
  it('expectedSpinsToStop is bounded by maxAutoSpins', () => {
    const r = solveAutoSpinDualStop({ ...baseCfg, maxAutoSpins: 25 });
    expect(r.expectedSpinsToStop).toBeLessThanOrEqual(25);
  });
});

describe('autoSpinDualStop — moments', () => {
  it('expectedSpinsUnbounded > 0', () => {
    const r = solveAutoSpinDualStop(baseCfg);
    expect(r.expectedSpinsUnbounded).toBeGreaterThan(0);
  });
  it('zero-drift: E[T_unbounded] = a·b / σ²', () => {
    const cfg = { ...baseCfg, rtp: 1.0, lossLimit: 50, winLimit: 50, volatilityIndex: 5 };
    const r = solveAutoSpinDualStop(cfg);
    const expected = (50 * 50) / (1 * 1 * 5); // = 500
    expect(r.expectedSpinsUnbounded).toBeCloseTo(expected, 6);
  });
  it('negative-drift: expectedFinalNetWin < 0 (house edge dominates)', () => {
    const r = solveAutoSpinDualStop({ ...baseCfg, maxAutoSpins: 100000 });
    expect(r.expectedFinalNetWin).toBeLessThan(0);
  });
});

describe('autoSpinDualStop — risk score + regulator forms', () => {
  it('1-in-N loss-stop is finite for negative drift', () => {
    const r = solveAutoSpinDualStop(baseCfg);
    expect(Number.isFinite(r.oneInNSessionsLossStop)).toBe(true);
    expect(r.oneInNSessionsLossStop).toBeGreaterThanOrEqual(1);
  });
  it('sessionRiskScore is in [0, 1]', () => {
    const r = solveAutoSpinDualStop(baseCfg);
    expect(r.sessionRiskScore).toBeGreaterThanOrEqual(0);
    expect(r.sessionRiskScore).toBeLessThanOrEqual(1);
  });
  it('lower RTP (worse for player) → higher risk score (ceteris paribus)', () => {
    const a = solveAutoSpinDualStop({ ...baseCfg, rtp: 0.98 });
    const b = solveAutoSpinDualStop({ ...baseCfg, rtp: 0.85 });
    expect(b.sessionRiskScore).toBeGreaterThan(a.sessionRiskScore);
  });
});

describe('autoSpinDualStop — monotonicity invariants', () => {
  it('higher RTP → higher P_win_unconditional', () => {
    const a = solveAutoSpinDualStop({ ...baseCfg, rtp: 0.90 });
    const b = solveAutoSpinDualStop({ ...baseCfg, rtp: 1.05 });
    expect(b.probWinUnconditional).toBeGreaterThan(a.probWinUnconditional);
  });
  it('larger N_max → smaller P_spin_limit', () => {
    const a = solveAutoSpinDualStop({ ...baseCfg, maxAutoSpins: 50 });
    const b = solveAutoSpinDualStop({ ...baseCfg, maxAutoSpins: 5000 });
    expect(b.probSpinLimitFired).toBeLessThanOrEqual(a.probSpinLimitFired);
  });
  it('higher volatility → faster absorption (smaller E[T_unbounded])', () => {
    const a = solveAutoSpinDualStop({ ...baseCfg, volatilityIndex: 1 });
    const b = solveAutoSpinDualStop({ ...baseCfg, volatilityIndex: 20 });
    expect(b.expectedSpinsUnbounded).toBeLessThan(a.expectedSpinsUnbounded);
  });
});

describe('autoSpinDualStop — MC cross-validation', () => {
  it('zero-drift symmetric: MC P_win ≈ CF P_win within 5pp at N=3000 episodes', () => {
    const cfg = {
      ...baseCfg,
      rtp: 1.0,
      volatilityIndex: 5,
      lossLimit: 30,
      winLimit: 30,
      maxAutoSpins: 5000,
    };
    const cf = solveAutoSpinDualStop(cfg);
    const mc = simulateAutoSpinDualStop(cfg, 12345, 3000);
    expect(Math.abs(mc.observedProbWinStop - cf.probWinStopFired)).toBeLessThan(0.05);
    expect(Math.abs(mc.observedProbLossStop - cf.probLossStopFired)).toBeLessThan(0.05);
  });
  it('negative drift: MC P_loss > P_win consistently', () => {
    const mc = simulateAutoSpinDualStop(baseCfg, 67890, 2000);
    expect(mc.observedProbLossStop).toBeGreaterThan(mc.observedProbWinStop);
  });
});

describe('autoSpinDualStop — determinism', () => {
  it('same seed → identical MC results', () => {
    const a = simulateAutoSpinDualStop(baseCfg, 42, 1000);
    const b = simulateAutoSpinDualStop(baseCfg, 42, 1000);
    expect(a.observedProbLossStop).toBe(b.observedProbLossStop);
    expect(a.observedExpectedSpinsToStop).toBe(b.observedExpectedSpinsToStop);
  });
});

describe('autoSpinDualStop — industry use-case', () => {
  it('UK responsible-gambling 200x BR session — small-bet/high-resolution regime ±5pp CF/MC parity', () => {
    // Use small bet (0.1) so per-spin σ = √(0.01·5) ≈ 0.224 is small relative
    // to barrier distances 5/10 — Bachelier continuous-time CF approaches MC
    // discrete random walk within ±5pp.
    const cfg = {
      bet: 0.1,
      rtp: 0.96,
      volatilityIndex: 5,
      lossLimit: 5,
      winLimit: 10,
      maxAutoSpins: 5000,
    };
    const cf = solveAutoSpinDualStop(cfg);
    expect(cf.driftRegime).toBe('negative');
    // Negative drift + closer loss barrier (a=5 < b=10): P_loss dominant
    expect(cf.probLossStopFired).toBeGreaterThan(0.5);
    expect(cf.oneInNSessionsLossStop).toBeLessThan(2);
    // Three probabilities sum to 1
    const total = cf.probLossStopFired + cf.probWinStopFired + cf.probSpinLimitFired;
    expect(total).toBeCloseTo(1, 9);
    // MC cross-check at N=2000 episodes: P_loss within 5pp (small-bet regime)
    const mc = simulateAutoSpinDualStop(cfg, 98765, 2000);
    expect(Math.abs(mc.observedProbLossStop - cf.probLossStopFired)).toBeLessThan(0.05);
  });
  it('UK realistic-bet regime — bigger per-spin overshoot allowed ±15pp CF/MC delta', () => {
    // Real operator scenario: £1 bet, £50 loss limit, £100 win limit, 500 auto-spins.
    // Discrete-overshoot vs continuous-Bachelier introduces up to ~10pp gap.
    const cfg = {
      bet: 1,
      rtp: 0.96,
      volatilityIndex: 5,
      lossLimit: 50,
      winLimit: 100,
      maxAutoSpins: 500,
    };
    const cf = solveAutoSpinDualStop(cfg);
    expect(cf.driftRegime).toBe('negative');
    expect(cf.probLossStopFired).toBeGreaterThan(0.3);
    expect(cf.oneInNSessionsLossStop).toBeLessThan(5);
    const mc = simulateAutoSpinDualStop(cfg, 98765, 2000);
    // Looser tolerance — documented Bachelier-discrete gap at this scale
    expect(Math.abs(mc.observedProbLossStop - cf.probLossStopFired)).toBeLessThan(0.15);
  });
});
