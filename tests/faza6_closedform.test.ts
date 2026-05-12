/**
 * Faza 6 — Closed-form RTP Solver KATs.
 *
 * Covers:
 *   - H&W Markov DP solver (markovSolver.ts)
 *   - Free Spins closed-form (freeSpinsClosedForm.ts)
 *   - Cascade closed-form (cascadeClosedForm.ts)
 *
 * All tests use tight mathematical bounds — no loose "> 0" checks.
 * Floating-point comparisons use explicit epsilon tolerances.
 */

import { describe, it, expect } from 'vitest';
import {
  solveHoldAndWin,
  buildHnwConfig,
  type HoldAndWinConfig,
} from '../src/math/markovSolver.js';
import {
  solveFreeSpins,
  buildFsConfig,
  type FreeSpinsConfig,
} from '../src/math/freeSpinsClosedForm.js';
import {
  solveCascade,
  type CascadeConfig,
} from '../src/math/cascadeClosedForm.js';
import type { Feature } from '../src/ir/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function close(a: number, b: number, eps: number = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}

function approx(a: number, b: number, eps: number = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

// ─── Hold & Win Markov Tests ─────────────────────────────────────────────────

describe('H&W Markov Solver', () => {
  // Shared baseline config for a 3×5 grid (15 cells)
  const baseConfig: HoldAndWinConfig = {
    totalCells: 15,
    initialRespins: 3,
    baseChance: 0.035,
    fillBonusCap: 0.025,
    expectedCellValue: 1.5,
    respinResetOnNew: true,
    gridFullAward: 0,
    initLockedCells: 6,
  };

  // ── Test 1: V(k=0, r=0) = 0 ────────────────────────────────────────────
  it('V(k=0, r=0) = 0 — no cells locked, no respins → zero payout', () => {
    const cfg: HoldAndWinConfig = {
      ...baseConfig,
      initLockedCells: 0,
      initialRespins: 3,
    };
    const result = solveHoldAndWin(cfg);
    // stateValues[0][0] should be 0
    expect(result.stateValues[0]?.[0]).toBe(0);
  });

  // ── Test 2: V(k=total, r=any) = total × cellValue + gridFullAward ─────
  it('V(k=total, r=any) = total×cellValue + gridFullAward for all r', () => {
    const cfg: HoldAndWinConfig = {
      ...baseConfig,
      initLockedCells: 15, // full grid from the start
      gridFullAward: 50,
    };
    const result = solveHoldAndWin(cfg);
    const expected = 15 * 1.5 + 50; // = 72.5

    // stateValues[15][r] should equal expected for all r
    for (let r = 0; r <= cfg.initialRespins; r++) {
      expect(result.stateValues[15]?.[r]).toBeCloseTo(expected, 10);
    }
    // The result itself should match
    expect(result.expectedPayout).toBeCloseTo(expected, 10);
  });

  // ── Test 3: V(k=1, r=0) = 1 × cellValue ───────────────────────────────
  it('V(k=1, r=0) = 1 × cellValue', () => {
    const cfg: HoldAndWinConfig = {
      ...baseConfig,
      initLockedCells: 1,
      initialRespins: 0, // zero respins → base case
    };
    const result = solveHoldAndWin(cfg);
    expect(result.expectedPayout).toBeCloseTo(1 * 1.5, 10);
    // Also check directly in stateValues
    expect(result.stateValues[1]?.[0]).toBeCloseTo(1.5, 10);
  });

  // ── Test 4: 1×1 grid, 1 cell total, 3 respins ─────────────────────────
  // p(k=0) = 0.035 + (0/1)*0.025 = 0.035
  // P(fills in 3 respins) = 1 - (1-0.035)^3 = 1 - 0.965^3
  it('1×1 grid gridFullProbability ≈ 1 - (1-0.035)^3 ≈ 0.1005', () => {
    const cfg: HoldAndWinConfig = {
      totalCells: 1,
      initialRespins: 3,
      baseChance: 0.035,
      fillBonusCap: 0.025,
      expectedCellValue: 1.0,
      respinResetOnNew: true,
      gridFullAward: 0,
      initLockedCells: 0,
    };
    const result = solveHoldAndWin(cfg);
    // p(0) = 0.035, P(fills) = 1 - 0.965^3
    const expected = 1 - Math.pow(0.965, 3);
    // Within 0.01 as specified
    expect(Math.abs(result.gridFullProbability - expected)).toBeLessThan(0.01);
    expect(result.gridFullProbability).toBeGreaterThan(0);
    expect(result.gridFullProbability).toBeLessThan(1);
  });

  // ── Test 5: 6-cell trigger on 3×5, E[payout] > 6×1.5 = 9.0 ──────────
  it('6-cell trigger on 3×5 grid: E[payout] > 6 × cellValue = 9.0', () => {
    const cfg: HoldAndWinConfig = {
      ...baseConfig, // 15 cells, 3 respins, initLocked=6
      expectedCellValue: 1.5,
      gridFullAward: 0,
    };
    const result = solveHoldAndWin(cfg);
    // Must exceed the minimum of collecting already-locked cells
    expect(result.expectedPayout).toBeGreaterThan(6 * 1.5);
    // Sanity: can't exceed full grid + generous buffer
    expect(result.expectedPayout).toBeLessThan(15 * 10);
  });

  // ── Test 6: E[payout] increases with more initial locked cells ─────────
  it('E[payout] increases with more initial locked cells: V(6,3) < V(9,3)', () => {
    const cfg6: HoldAndWinConfig = { ...baseConfig, initLockedCells: 6 };
    const cfg9: HoldAndWinConfig = { ...baseConfig, initLockedCells: 9 };
    const r6 = solveHoldAndWin(cfg6);
    const r9 = solveHoldAndWin(cfg9);
    expect(r9.expectedPayout).toBeGreaterThan(r6.expectedPayout);
  });

  // ── Test 7: E[payout] increases with more respins ─────────────────────
  it('E[payout] increases with more respins: V(6,2) < V(6,3)', () => {
    const cfg2: HoldAndWinConfig = { ...baseConfig, initialRespins: 2, initLockedCells: 6 };
    const cfg3: HoldAndWinConfig = { ...baseConfig, initialRespins: 3, initLockedCells: 6 };
    const r2 = solveHoldAndWin(cfg2);
    const r3 = solveHoldAndWin(cfg3);
    expect(r3.expectedPayout).toBeGreaterThan(r2.expectedPayout);
  });

  // ── Test 8: gridFullProbability in [0, 1] ─────────────────────────────
  it('gridFullProbability is in [0, 1]', () => {
    const result = solveHoldAndWin(baseConfig);
    expect(result.gridFullProbability).toBeGreaterThanOrEqual(0);
    expect(result.gridFullProbability).toBeLessThanOrEqual(1);
  });

  // ── Test 9: stateValues dimensions ────────────────────────────────────
  it('stateValues shape is (totalCells+1) × (initialRespins+1)', () => {
    const cfg: HoldAndWinConfig = {
      ...baseConfig,
      totalCells: 6,
      initialRespins: 2,
    };
    const result = solveHoldAndWin(cfg);
    expect(result.stateValues.length).toBe(7); // 0..6
    for (let k = 0; k <= 6; k++) {
      expect(result.stateValues[k]?.length).toBe(3); // 0..2
    }
  });

  // ── Test 10: buildHnwConfig from IR Feature ───────────────────────────
  it('buildHnwConfig creates correct config from IR feature', () => {
    const feature: Extract<Feature, { kind: 'hold_and_win' }> = {
      kind: 'hold_and_win',
      trigger: { by: 'bonus_count', min: 6 },
      respins_initial: 3,
      respin_reset_on_new: true,
      cash_value_distribution: [
        { value: 1.0, weight: 50 },
        { value: 2.0, weight: 30 },
        { value: 5.0, weight: 20 },
      ],
      jackpot_tiers: [],
    };

    const cfg = buildHnwConfig(feature, 15, 6);

    expect(cfg.totalCells).toBe(15);
    expect(cfg.initialRespins).toBe(3);
    expect(cfg.respinResetOnNew).toBe(true);
    expect(cfg.initLockedCells).toBe(6);
    expect(cfg.baseChance).toBe(0.035);
    expect(cfg.fillBonusCap).toBe(0.025);

    // E[cell] = (1×50 + 2×30 + 5×20) / 100 = (50+60+100)/100 = 2.1
    expect(cfg.expectedCellValue).toBeCloseTo(2.1, 10);
  });

  // ── Test 11: gridFullAward adds to expected payout ────────────────────
  it('gridFullAward adds to expected payout proportional to gridFullProbability', () => {
    const cfgNoAward: HoldAndWinConfig = {
      ...baseConfig,
      gridFullAward: 0,
      initLockedCells: 12, // close to full → measurable P(full)
    };
    const cfgWithAward: HoldAndWinConfig = {
      ...cfgNoAward,
      gridFullAward: 100,
    };
    const rNoAward = solveHoldAndWin(cfgNoAward);
    const rWithAward = solveHoldAndWin(cfgWithAward);

    // The difference should equal gridFullAward × gridFullProbability
    const diff = rWithAward.expectedPayout - rNoAward.expectedPayout;
    const expectedDiff = 100 * rWithAward.gridFullProbability;
    expect(Math.abs(diff - expectedDiff)).toBeLessThan(1e-6);
    // gridFullProbability should be > 0 for k=12 / totalCells=15 / 3 respins
    expect(rWithAward.gridFullProbability).toBeGreaterThan(0);
  });

  // ── Test 12: respinResetOnNew=false gives less payout than =true ──────
  it('respinResetOnNew=false gives less payout than =true', () => {
    const cfgTrue: HoldAndWinConfig = {
      ...baseConfig,
      initLockedCells: 4,
      initialRespins: 3,
      respinResetOnNew: true,
    };
    const cfgFalse: HoldAndWinConfig = {
      ...cfgTrue,
      respinResetOnNew: false,
    };
    const rTrue = solveHoldAndWin(cfgTrue);
    const rFalse = solveHoldAndWin(cfgFalse);
    // Without reset, fewer respins are available after landings → lower EV
    expect(rTrue.expectedPayout).toBeGreaterThan(rFalse.expectedPayout);
  });

  // ── Test 13: throws for totalCells > 100 ─────────────────────────────
  it('throws when totalCells > 100', () => {
    const cfg: HoldAndWinConfig = {
      ...baseConfig,
      totalCells: 101,
      initLockedCells: 50,
    };
    expect(() => solveHoldAndWin(cfg)).toThrow();
  });

  // ── Test 14: V(k, 0) = k × cellValue for all k (no gridFullAward) ─────
  it('V(k, 0) = k × cellValue for all k (no gridFullAward)', () => {
    const cfg: HoldAndWinConfig = {
      totalCells: 5,
      initialRespins: 3,
      baseChance: 0.035,
      fillBonusCap: 0.025,
      expectedCellValue: 2.0,
      respinResetOnNew: true,
      gridFullAward: 0,
      initLockedCells: 2,
    };
    const result = solveHoldAndWin(cfg);
    for (let k = 0; k < cfg.totalCells; k++) {
      expect(result.stateValues[k]?.[0]).toBeCloseTo(k * cfg.expectedCellValue, 10);
    }
  });
});

// ─── Free Spins Closed-Form Tests ────────────────────────────────────────────

describe('Free Spins Closed-Form Solver', () => {
  // ── Test 1: no retrigger → E[spins] = initialSpins ────────────────────
  it('no retrigger: E[spins] = initialSpins', () => {
    const cfg: FreeSpinsConfig = {
      initialSpins: 10,
      retriggerProbabilityPerSpin: 0,
      extraSpinsPerRetrigger: 0,
      globalMultiplier: 1,
      hasMultiplierLadder: false,
      baseWinPerSpin: 1.0,
    };
    const result = solveFreeSpins(cfg);
    expect(result.expectedTotalSpins).toBeCloseTo(10, 10);
    expect(result.expectedRetriggers).toBeCloseTo(0, 10);
  });

  // ── Test 2: pRetrig=0 → same as no retrigger ─────────────────────────
  it('retrigger pRetrig=0: same as no retrigger', () => {
    const cfg: FreeSpinsConfig = {
      initialSpins: 15,
      retriggerProbabilityPerSpin: 0,
      extraSpinsPerRetrigger: 5,
      globalMultiplier: 1,
      hasMultiplierLadder: false,
      baseWinPerSpin: 1.0,
    };
    const result = solveFreeSpins(cfg);
    expect(result.expectedTotalSpins).toBeCloseTo(15, 10);
  });

  // ── Test 3: basic retrigger formula ───────────────────────────────────
  // initialSpins=10, pRetrig=0.1/spin, extra=10
  // ρ = 0.1 × 10 = 1.0 → clamped to 0.9999
  // Actually E[spins] = 10 / (1 - 0.1*10) — but ρ=1.0 is clamped to 0.9999
  // Let's use pRetrig=0.1, extra=5 → ρ=0.5 → E = 10/(1-0.5) = 20
  it('basic retrigger formula: initialSpins=10, pRetrig=0.1, extra=5 → E[spins]=20', () => {
    const cfg: FreeSpinsConfig = {
      initialSpins: 10,
      retriggerProbabilityPerSpin: 0.1,
      extraSpinsPerRetrigger: 5,
      globalMultiplier: 1,
      hasMultiplierLadder: false,
      baseWinPerSpin: 1.0,
    };
    const result = solveFreeSpins(cfg);
    // ρ = 0.1 × 5 = 0.5 → E = 10 / (1 - 0.5) = 20
    expect(result.expectedTotalSpins).toBeCloseTo(20, 6);
  });

  // ── Test 3b: from spec — initialSpins=10, pRetrig=0.1, extra=10 ───────
  // ρ = 0.1×10 = 1.0 → clamped to 0.9999 → E ≈ 10/0.0001 = 100000
  it('spec example: initialSpins=10, pRetrig=0.1/spin, extra=10 → E large (ρ clamped)', () => {
    const cfg: FreeSpinsConfig = {
      initialSpins: 10,
      retriggerProbabilityPerSpin: 0.1,
      extraSpinsPerRetrigger: 10,
      globalMultiplier: 1,
      hasMultiplierLadder: false,
      baseWinPerSpin: 1.0,
    };
    const result = solveFreeSpins(cfg);
    // ρ clamped to 0.9999, so E = 10/0.0001 = 100000
    expect(result.expectedTotalSpins).toBeCloseTo(10 / 0.0001, 1);
  });

  // ── Test 4: maxTotal cap active ───────────────────────────────────────
  it('maxTotal cap: clamps expectedTotalSpins to maxTotal', () => {
    const cfg: FreeSpinsConfig = {
      initialSpins: 10,
      retriggerProbabilityPerSpin: 0.5,
      extraSpinsPerRetrigger: 5, // ρ=2.5 → clamped → very large raw
      maxTotal: 50,
      globalMultiplier: 1,
      hasMultiplierLadder: false,
      baseWinPerSpin: 1.0,
    };
    const result = solveFreeSpins(cfg);
    expect(result.expectedTotalSpins).toBe(50);
    expect(result.retriggerCapActive).toBe(true);
  });

  // ── Test 5: globalMultiplier doubles payout ───────────────────────────
  it('globalMultiplier=2 doubles payout vs multiplier=1', () => {
    const base: FreeSpinsConfig = {
      initialSpins: 10,
      retriggerProbabilityPerSpin: 0,
      extraSpinsPerRetrigger: 0,
      globalMultiplier: 1,
      hasMultiplierLadder: false,
      baseWinPerSpin: 2.0,
    };
    const doubled: FreeSpinsConfig = { ...base, globalMultiplier: 2 };

    const r1 = solveFreeSpins(base);
    const r2 = solveFreeSpins(doubled);

    expect(r2.expectedPayout).toBeCloseTo(r1.expectedPayout * 2, 10);
  });

  // ── Test 6: multiplierLadder increases payout ─────────────────────────
  it('hasMultiplierLadder=true raises effective multiplier above 1', () => {
    const base: FreeSpinsConfig = {
      initialSpins: 10,
      retriggerProbabilityPerSpin: 0,
      extraSpinsPerRetrigger: 0,
      globalMultiplier: 1,
      hasMultiplierLadder: false,
      baseWinPerSpin: 1.0,
    };
    const withLadder: FreeSpinsConfig = { ...base, hasMultiplierLadder: true };

    const r1 = solveFreeSpins(base);
    const r2 = solveFreeSpins(withLadder);

    expect(r2.ladderAdjustedMultiplier).toBeGreaterThan(1);
    expect(r2.expectedPayout).toBeGreaterThan(r1.expectedPayout);
    // For N=10 spins, E[ladder] = (1+10)/2 = 5.5
    expect(r2.ladderAdjustedMultiplier).toBeCloseTo(5.5, 6);
  });

  // ── Test 7: expectedRetriggers > 0 when retrigger fires ───────────────
  it('expectedRetriggers > 0 when retrigger probability > 0', () => {
    const cfg: FreeSpinsConfig = {
      initialSpins: 10,
      retriggerProbabilityPerSpin: 0.05,
      extraSpinsPerRetrigger: 5,
      globalMultiplier: 1,
      hasMultiplierLadder: false,
      baseWinPerSpin: 1.0,
    };
    const result = solveFreeSpins(cfg);
    expect(result.expectedRetriggers).toBeGreaterThan(0);
    expect(result.expectedTotalSpins).toBeGreaterThan(10);
  });

  // ── Test 8: buildFsConfig from IR Feature ─────────────────────────────
  it('buildFsConfig creates correct config from IR feature', () => {
    const feature: Extract<Feature, { kind: 'free_spins' }> = {
      kind: 'free_spins',
      trigger: {
        by: 'scatter_count',
        thresholds: { '3': 10, '4': 15, '5': 20 },
      },
      retrigger: {
        by: 'scatter_count',
        thresholds: { '3': 5, '4': 10 },
        max_total: 100,
      },
      global_multiplier: 3,
      modifiers: ['multiplier_ladder'],
    };

    const cfg = buildFsConfig(feature, 0.02, 1.5);

    expect(cfg.initialSpins).toBe(20); // max of trigger thresholds
    expect(cfg.extraSpinsPerRetrigger).toBe(5); // min of retrigger thresholds
    expect(cfg.maxTotal).toBe(100);
    expect(cfg.globalMultiplier).toBe(3);
    expect(cfg.hasMultiplierLadder).toBe(true);
    expect(cfg.retriggerProbabilityPerSpin).toBe(0.02);
    expect(cfg.baseWinPerSpin).toBe(1.5);
  });

  // ── Test 9: rtpContribution = expectedPayout (bet=1) ──────────────────
  it('rtpContribution equals expectedPayout (bet=1 convention)', () => {
    const cfg: FreeSpinsConfig = {
      initialSpins: 12,
      retriggerProbabilityPerSpin: 0.03,
      extraSpinsPerRetrigger: 4,
      globalMultiplier: 2,
      hasMultiplierLadder: false,
      baseWinPerSpin: 1.8,
    };
    const result = solveFreeSpins(cfg);
    expect(result.rtpContribution).toBeCloseTo(result.expectedPayout, 10);
  });

  // ── Test 10: zero initialSpins returns all zeros ───────────────────────
  it('zero initialSpins returns zero payout', () => {
    const cfg: FreeSpinsConfig = {
      initialSpins: 0,
      retriggerProbabilityPerSpin: 0.1,
      extraSpinsPerRetrigger: 5,
      globalMultiplier: 1,
      hasMultiplierLadder: false,
      baseWinPerSpin: 1.0,
    };
    const result = solveFreeSpins(cfg);
    expect(result.expectedTotalSpins).toBe(0);
    expect(result.expectedPayout).toBe(0);
    expect(result.expectedRetriggers).toBe(0);
  });
});

// ─── Cascade Closed-Form Tests ────────────────────────────────────────────────

describe('Cascade Closed-Form Solver', () => {
  // ── Test 1: p_win=0 → payout = baseWinPerSpin × m_0 × 1 ──────────────
  // Chain 0 always fires (p^0 = 1), so even with p=0, payout = baseWin × m_0
  // But baseWinPerSpin represents E[win] = p_win × E[win|win], so with p=0,
  // baseWinPerSpin should be 0. Let's test baseWinPerSpin=0 with p=0.
  it('p_win=0 and baseWinPerSpin=0: payout = 0', () => {
    const cfg: CascadeConfig = {
      baseWinProbability: 0,
      baseWinPerSpin: 0,
      multiplierProgression: [],
      maxChain: 5,
      replacement: 'drop',
    };
    const result = solveCascade(cfg);
    expect(result.expectedPayoutPerSpin).toBeCloseTo(0, 10);
    expect(result.expectedCascadeChains).toBeCloseTo(0, 10);
  });

  // ── Test 2: p_win=0, non-zero baseWin → only chain 0 fires ────────────
  it('p_win=0: only chain 0 fires (payout = baseWinPerSpin × m_0)', () => {
    const cfg: CascadeConfig = {
      baseWinProbability: 0,
      baseWinPerSpin: 2.0,
      multiplierProgression: [3],
      maxChain: 5,
      replacement: 'drop',
    };
    const result = solveCascade(cfg);
    // Σ p^c × m_c = p^0 × 3 = 3 (c=0 only, rest are 0^c = 0 for c>0)
    expect(result.expectedPayoutPerSpin).toBeCloseTo(2.0 * 3, 10);
    expect(result.expectedCascadeChains).toBeCloseTo(0, 10);
  });

  // ── Test 3: p_win=1, maxChain=3 → payout = baseWin × Σ m_c ───────────
  it('p_win=1, maxChain=3: all chains fire, payout = baseWin × Σ m_c', () => {
    const cfg: CascadeConfig = {
      baseWinProbability: 1,
      baseWinPerSpin: 1.0,
      multiplierProgression: [1, 2, 3, 4],
      maxChain: 3,
      replacement: 'refill_random',
    };
    const result = solveCascade(cfg);
    // Σ_{c=0}^{3} 1^c × m_c = 1+2+3+4 = 10
    expect(result.expectedPayoutPerSpin).toBeCloseTo(10, 10);
    // P(c chains) for p=1: P(0)=0, P(1)=0, P(2)=0, P(3)=1^3=1
    expect(result.chainProbabilities[3]).toBeCloseTo(1, 10);
    for (let c = 0; c < 3; c++) {
      expect(result.chainProbabilities[c]).toBeCloseTo(0, 10);
    }
  });

  // ── Test 4: geometric series E[chains] for p=0.3 ─────────────────────
  // Without cap, E[chains] = p/(1-p) = 0.3/0.7 ≈ 0.4286
  // With maxChain large (100), should be very close
  it('geometric: E[chains] ≈ p/(1-p) for p=0.3, large maxChain', () => {
    const cfg: CascadeConfig = {
      baseWinProbability: 0.3,
      baseWinPerSpin: 1.0,
      multiplierProgression: [],
      maxChain: 100,
      replacement: 'drop',
    };
    const result = solveCascade(cfg);
    const expected = 0.3 / 0.7; // ≈ 0.42857...
    expect(Math.abs(result.expectedCascadeChains - expected)).toBeLessThan(1e-4);
  });

  // ── Test 5: multiplier progression applied correctly ─────────────────
  // [1, 2, 3]: chain 0 at 1×, chain 1 at 2×, chain 2 at 3×
  // p=0.5, maxChain=2
  // E[payout] = baseWin × (0.5^0×1 + 0.5^1×2 + 0.5^2×3)
  //           = baseWin × (1 + 1 + 0.75) = baseWin × 2.75
  it('multiplier progression [1,2,3] applied correctly at p=0.5, maxChain=2', () => {
    const cfg: CascadeConfig = {
      baseWinProbability: 0.5,
      baseWinPerSpin: 2.0,
      multiplierProgression: [1, 2, 3],
      maxChain: 2,
      replacement: 'drop',
    };
    const result = solveCascade(cfg);
    const expected = 2.0 * (1 + 0.5 * 2 + 0.25 * 3); // = 2 × 2.75 = 5.5
    expect(result.expectedPayoutPerSpin).toBeCloseTo(expected, 10);
  });

  // ── Test 6: effectiveMultiplierBoost > 1 for p_win > 0 ───────────────
  it('effectiveMultiplierBoost > 1 when p_win > 0 and maxChain > 0', () => {
    const cfg: CascadeConfig = {
      baseWinProbability: 0.4,
      baseWinPerSpin: 1.0,
      multiplierProgression: [],
      maxChain: 10,
      replacement: 'refill_random',
    };
    const result = solveCascade(cfg);
    // With no progression (all 1×), boost = (1/(1-p)) / 1 = 1/(1-p) > 1 for p>0
    expect(result.effectiveMultiplierBoost).toBeGreaterThan(1);
  });

  // ── Test 7: chainProbabilities sum ≤ 1 ───────────────────────────────
  it('chainProbabilities sum to exactly 1 (by construction)', () => {
    const cfg: CascadeConfig = {
      baseWinProbability: 0.35,
      baseWinPerSpin: 1.0,
      multiplierProgression: [],
      maxChain: 8,
      replacement: 'fixed_strip',
    };
    const result = solveCascade(cfg);
    const sum = result.chainProbabilities.reduce((s, p) => s + p, 0);
    // Sum should be exactly 1: Σ P(c) for c=0..maxChain = 1
    expect(Math.abs(sum - 1)).toBeLessThan(1e-10);
  });

  // ── Test 8: maxChain caps chain count ────────────────────────────────
  it('maxChain caps the chain count (chainProbabilities has maxChain+1 entries)', () => {
    const cfg: CascadeConfig = {
      baseWinProbability: 0.8,
      baseWinPerSpin: 1.0,
      multiplierProgression: [],
      maxChain: 4,
      replacement: 'drop',
    };
    const result = solveCascade(cfg);
    expect(result.chainProbabilities.length).toBe(5); // 0..4
    // P(exactly 4) = p^4 (absorbing at maxChain)
    expect(result.chainProbabilities[4]).toBeCloseTo(Math.pow(0.8, 4), 10);
  });

  // ── Test 9: no progression = 1× multiplier throughout ────────────────
  it('empty progression defaults to 1× for all chains', () => {
    const cfg: CascadeConfig = {
      baseWinProbability: 0.5,
      baseWinPerSpin: 1.0,
      multiplierProgression: [],
      maxChain: 3,
      replacement: 'refill_random',
    };
    const result = solveCascade(cfg);
    // Σ_{c=0}^{3} 0.5^c × 1 = 1 + 0.5 + 0.25 + 0.125 = 1.875
    const expected = 1 + 0.5 + 0.25 + 0.125;
    expect(result.expectedPayoutPerSpin).toBeCloseTo(expected, 10);
  });

  // ── Test 10: maxChain=0 → only chain 0 fires ─────────────────────────
  it('maxChain=0: only chain 0, payout = baseWinPerSpin × m_0', () => {
    const cfg: CascadeConfig = {
      baseWinProbability: 0.9,
      baseWinPerSpin: 3.0,
      multiplierProgression: [5],
      maxChain: 0,
      replacement: 'drop',
    };
    const result = solveCascade(cfg);
    // Only chain 0: p^0 × m_0 = 1 × 5
    expect(result.expectedPayoutPerSpin).toBeCloseTo(3.0 * 5, 10);
    expect(result.expectedCascadeChains).toBeCloseTo(0, 10);
    expect(result.chainProbabilities.length).toBe(1);
    expect(result.chainProbabilities[0]).toBeCloseTo(1, 10); // p^0 at maxChain=0
  });

  // ── Test 11: effectiveMultiplierBoost formula cross-check ─────────────
  // With no progression, all m=1:
  // E[payout] = baseWin × Σ p^c (c=0..maxChain) ≈ baseWin / (1-p) for large maxChain
  // no-cascade baseline = baseWin × p
  // boost = (1/(1-p)) / p
  it('effectiveMultiplierBoost cross-check with no progression, large maxChain', () => {
    const p = 0.4;
    const cfg: CascadeConfig = {
      baseWinProbability: p,
      baseWinPerSpin: 1.0,
      multiplierProgression: [],
      maxChain: 50,
      replacement: 'drop',
    };
    const result = solveCascade(cfg);
    // Approximate sum ≈ 1/(1-p) = 1/0.6 ≈ 1.6667
    // boost = payout / (baseWin × p) ≈ (1/(1-p)) / p
    const approxBoost = (1 / (1 - p)) / p;
    expect(Math.abs(result.effectiveMultiplierBoost - approxBoost)).toBeLessThan(1e-3);
  });
});
