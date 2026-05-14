/**
 * W152 P0-7 — Hold & Win Markov solver tests.
 *
 * Three layers of coverage:
 *
 *   1. **Algebraic** — degenerate cases with closed-form analytic
 *      answers (p=0, p=1, full-grid-on-trigger, …).
 *   2. **Monotonicity** — higher `pHitPerEmpty` ⇒ higher expected
 *      occupancy + payout; more `respinsInitial` ⇒ same.
 *   3. **Monte-Carlo cross-validation** — direct simulation of the
 *      same Markov chain at a small grid converges to the analytic
 *      expectation within ±1.5% at 50 000 trials (well below MC noise
 *      for the conservatism margin).
 */

import { describe, it, expect } from 'vitest';
import {
  solveHoldAndWinRtp,
  __hawMarkovInternals,
  type HoldAndWinMarkovConfig,
} from '../src/solver/holdAndWinMarkov.js';

const { binom, landingPmf, meanOrbValue } = __hawMarkovInternals;

// ─── Sample config ───────────────────────────────────────────────────────────

function baseConfig(): HoldAndWinMarkovConfig {
  return {
    totalCells: 15, // 5 × 3
    respinsInitial: 3,
    respinResetOn: 'new_orb',
    initialOrbsOnTrigger: 6,
    pHitPerEmpty: 0.04,
    orbValues: [
      { value: 1, weight: 40 },
      { value: 2, weight: 25 },
      { value: 5, weight: 20 },
      { value: 10, weight: 10 },
      { value: 25, weight: 5 },
    ],
    fullGridBonus: 100,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulateOnce(cfg: HoldAndWinMarkovConfig, rng: () => number): {
  finalOcc: number;
  fullGrid: boolean;
  respinsConsumed: number;
} {
  let occ = cfg.initialOrbsOnTrigger;
  let rl = Math.max(1, Math.floor(cfg.respinsInitial));
  let consumed = 0;
  const R0 = rl;

  while (rl > 0 && occ < cfg.totalCells) {
    const empty = cfg.totalCells - occ;
    let landed = 0;
    for (let i = 0; i < empty; i++) {
      if (rng() < cfg.pHitPerEmpty) landed += 1;
    }
    occ += landed;
    consumed += 1;
    if (landed > 0 && cfg.respinResetOn === 'new_orb') {
      rl = R0;
    } else {
      rl -= 1;
    }
  }
  return { finalOcc: occ, fullGrid: occ >= cfg.totalCells, respinsConsumed: consumed };
}

function meanOrbX(cfg: HoldAndWinMarkovConfig): number {
  const total = cfg.orbValues.reduce((a, b) => a + b.weight, 0);
  return cfg.orbValues.reduce((a, b) => a + (b.weight / total) * b.value, 0);
}

function runMC(cfg: HoldAndWinMarkovConfig, trials: number, seed: number) {
  const rng = mulberry32(seed);
  let sumOcc = 0;
  let sumFull = 0;
  let sumPayout = 0;
  const orbMean = meanOrbX(cfg);
  for (let i = 0; i < trials; i++) {
    const r = simulateOnce(cfg, rng);
    sumOcc += r.finalOcc;
    if (r.fullGrid) sumFull += 1;
    sumPayout += orbMean * r.finalOcc + (r.fullGrid ? cfg.fullGridBonus : 0);
  }
  return {
    mcOcc: sumOcc / trials,
    mcPFull: sumFull / trials,
    mcEvPayout: sumPayout / trials,
  };
}

// ─── 1. Helpers ──────────────────────────────────────────────────────────────

describe('W152 P0-7 — solver helpers', () => {
  it('binom: C(5, 2) = 10, C(0, 0) = 1, C(5, 6) = 0', () => {
    expect(binom(5, 2)).toBe(10);
    expect(binom(0, 0)).toBe(1);
    expect(binom(5, 6)).toBe(0);
  });

  it('landingPmf with p=0 → all mass on k=0', () => {
    expect(landingPmf(5, 0)).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it('landingPmf with p=1 → all mass on k=emptyCount', () => {
    expect(landingPmf(3, 1)).toEqual([0, 0, 0, 1]);
  });

  it('landingPmf sums to ~1 (with reasonable p)', () => {
    const pmf = landingPmf(10, 0.3);
    const sum = pmf.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('meanOrbValue: weighted average', () => {
    const m = meanOrbValue([
      { value: 1, weight: 1 },
      { value: 3, weight: 1 },
    ]);
    expect(m).toBe(2);
  });

  it('meanOrbValue: returns 0 on empty / zero-weight pool', () => {
    expect(meanOrbValue([])).toBe(0);
    expect(meanOrbValue([{ value: 5, weight: 0 }])).toBe(0);
  });
});

// ─── 2. Algebraic degenerate cases ───────────────────────────────────────────

describe('W152 P0-7 — algebraic edge cases', () => {
  it('p=0: occupancy stays at initial, no full grid', () => {
    const cfg = { ...baseConfig(), pHitPerEmpty: 0 };
    const r = solveHoldAndWinRtp(cfg);
    expect(r.pFullGrid).toBe(0);
    expect(r.expectedFinalOccupancy).toBeCloseTo(cfg.initialOrbsOnTrigger, 9);
    expect(r.expectedPayoutX).toBeCloseTo(
      meanOrbX(cfg) * cfg.initialOrbsOnTrigger,
      9,
    );
  });

  it('p=1: grid fills immediately on first respin → pFull = 1', () => {
    const cfg = { ...baseConfig(), pHitPerEmpty: 1 };
    const r = solveHoldAndWinRtp(cfg);
    expect(r.pFullGrid).toBeCloseTo(1, 9);
    expect(r.expectedFinalOccupancy).toBeCloseTo(cfg.totalCells, 9);
  });

  it('initialOrbsOnTrigger = totalCells: feature ends immediately, no work', () => {
    const cfg = { ...baseConfig(), initialOrbsOnTrigger: 15 };
    const r = solveHoldAndWinRtp(cfg);
    expect(r.pFullGrid).toBe(1);
    expect(r.expectedFinalOccupancy).toBe(15);
    expect(r.expectedPayoutX).toBeCloseTo(meanOrbX(cfg) * 15 + cfg.fullGridBonus, 9);
  });

  it('fullGridBonus = 0 yields no contribution from full-grid event', () => {
    const cfg = { ...baseConfig(), fullGridBonus: 0 };
    const r = solveHoldAndWinRtp(cfg);
    // Payout = orbMean * E[occupied] regardless of pFull
    expect(r.expectedPayoutX).toBeCloseTo(
      meanOrbX(cfg) * r.expectedFinalOccupancy,
      9,
    );
  });
});

// ─── 3. Monotonicity ─────────────────────────────────────────────────────────

describe('W152 P0-7 — monotonicity', () => {
  it('higher pHitPerEmpty ⇒ higher expected occupancy', () => {
    const a = solveHoldAndWinRtp({ ...baseConfig(), pHitPerEmpty: 0.02 });
    const b = solveHoldAndWinRtp({ ...baseConfig(), pHitPerEmpty: 0.10 });
    expect(b.expectedFinalOccupancy).toBeGreaterThan(a.expectedFinalOccupancy);
    expect(b.expectedPayoutX).toBeGreaterThan(a.expectedPayoutX);
    expect(b.pFullGrid).toBeGreaterThanOrEqual(a.pFullGrid);
  });

  it('more initial respins ⇒ higher pFullGrid (reset-on-orb mode)', () => {
    const a = solveHoldAndWinRtp({ ...baseConfig(), respinsInitial: 2 });
    const b = solveHoldAndWinRtp({ ...baseConfig(), respinsInitial: 5 });
    expect(b.pFullGrid).toBeGreaterThanOrEqual(a.pFullGrid);
  });

  it('more initial orbs ⇒ higher expected payout', () => {
    const a = solveHoldAndWinRtp({ ...baseConfig(), initialOrbsOnTrigger: 4 });
    const b = solveHoldAndWinRtp({ ...baseConfig(), initialOrbsOnTrigger: 10 });
    expect(b.expectedPayoutX).toBeGreaterThan(a.expectedPayoutX);
  });

  it("respinResetOn='never' is strictly stochastically dominated by 'new_orb'", () => {
    const never = solveHoldAndWinRtp({
      ...baseConfig(),
      respinResetOn: 'never',
    });
    const reset = solveHoldAndWinRtp({
      ...baseConfig(),
      respinResetOn: 'new_orb',
    });
    expect(reset.expectedPayoutX).toBeGreaterThan(never.expectedPayoutX);
    expect(reset.pFullGrid).toBeGreaterThanOrEqual(never.pFullGrid);
  });
});

// ─── 4. Monte-Carlo cross-validation ─────────────────────────────────────────

describe('W152 P0-7 — Monte-Carlo cross-validation', () => {
  it('analytic E[payout] matches 50k-trial MC within 1.5%', () => {
    const cfg = baseConfig();
    const analytic = solveHoldAndWinRtp(cfg);
    const mc = runMC(cfg, 50_000, 0xdeadbeef);

    // Occupancy
    const occErr = Math.abs(mc.mcOcc - analytic.expectedFinalOccupancy);
    const occRel = occErr / Math.max(1, analytic.expectedFinalOccupancy);
    expect(occRel).toBeLessThan(0.015);

    // P[full grid]
    const fullErr = Math.abs(mc.mcPFull - analytic.pFullGrid);
    expect(fullErr).toBeLessThan(0.005); // absolute, < 0.5pp

    // E[payout]
    const payErr = Math.abs(mc.mcEvPayout - analytic.expectedPayoutX);
    const payRel = payErr / Math.max(1, analytic.expectedPayoutX);
    expect(payRel).toBeLessThan(0.015);
  });

  it("MC cross-validation also holds for respinResetOn='never'", () => {
    const cfg = { ...baseConfig(), respinResetOn: 'never' as const };
    const analytic = solveHoldAndWinRtp(cfg);
    const mc = runMC(cfg, 50_000, 0xcafe1234);

    const occRel =
      Math.abs(mc.mcOcc - analytic.expectedFinalOccupancy) /
      Math.max(1, analytic.expectedFinalOccupancy);
    expect(occRel).toBeLessThan(0.015);

    const payRel =
      Math.abs(mc.mcEvPayout - analytic.expectedPayoutX) /
      Math.max(1, analytic.expectedPayoutX);
    expect(payRel).toBeLessThan(0.015);
  });
});

// ─── 5. Defensive / negative inputs ──────────────────────────────────────────

describe('W152 P0-7 — defensive validation', () => {
  it('throws on negative totalCells', () => {
    expect(() => solveHoldAndWinRtp({ ...baseConfig(), totalCells: -1 })).toThrow();
  });
  it('throws on NaN pHitPerEmpty', () => {
    expect(() => solveHoldAndWinRtp({ ...baseConfig(), pHitPerEmpty: NaN })).toThrow();
  });
  it('throws when initialOrbsOnTrigger > totalCells', () => {
    expect(() =>
      solveHoldAndWinRtp({ ...baseConfig(), initialOrbsOnTrigger: 999 }),
    ).toThrow();
  });
  it('respinsInitial = 0 treated as 1 attempt (no division by zero, no crash)', () => {
    const r = solveHoldAndWinRtp({ ...baseConfig(), respinsInitial: 0 });
    expect(Number.isFinite(r.expectedPayoutX)).toBe(true);
  });
});

// ─── 6. Determinism ──────────────────────────────────────────────────────────

describe('W152 P0-7 — determinism', () => {
  it('two solver calls produce identical output', () => {
    const a = solveHoldAndWinRtp(baseConfig());
    const b = solveHoldAndWinRtp(baseConfig());
    expect(a).toEqual(b);
  });

  it('immune to orbValues array order (same multiset → same EV)', () => {
    const cfg = baseConfig();
    const a = solveHoldAndWinRtp(cfg);
    const reordered = {
      ...cfg,
      orbValues: [...cfg.orbValues].reverse(),
    };
    const b = solveHoldAndWinRtp(reordered);
    expect(a.expectedPayoutX).toBeCloseTo(b.expectedPayoutX, 9);
  });
});
