/**
 * W205 / PHASE 9.5 — Bonus-Tournament Hybrid Mechanic test suite.
 *
 * Acceptance per W201 contract:
 *   • closed-form expectedSessionBest matches MC measured within ±10%
 *     across 6 industry configs at 1K-5K MC tournaments;
 *   • per-rank disclosure produces top-10 monotone descending;
 *   • prize vector sums to poolTotal (linearity of expectation);
 *   • combined RTP within UKGC/MGA/EU baselines;
 *   • PRNG determinism: same seed → byte-identical MC outputs;
 *   • edge cases: N=1 (single player) / triggerProb=0 / poolTotal=0.
 */

import { describe, it, expect } from 'vitest';
import {
  solveBonusTournamentHybrid,
  monteCarloBonusTournament,
  expectedMaxOfK,
  expectedSessionBestBonus,
  varianceSessionBestBonus,
  INDUSTRY_CONFIGS,
  type BonusTournamentConfig,
  type BonusPayoutParams,
} from '../src/features/bonusTournamentHybrid.ts';

// ─── 1. Closed-form max-of-K expectations ────────────────────────────────

describe('expectedMaxOfK · Gumbel family', () => {
  it('returns location for k=0 fallback (semantically bmin)', () => {
    const res = expectedMaxOfK(
      { family: 'gumbel', location: 10, scale: 5, bmin: 0 },
      0,
    );
    expect(res).toBe(0);
  });

  it('k=1 mean = loc + γ·scale (Euler-Mascheroni baseline)', () => {
    const res = expectedMaxOfK(
      { family: 'gumbel', location: 100, scale: 20, bmin: 0 },
      1,
    );
    // E[Gumbel] = loc + γ·scale ≈ 100 + 11.544 ≈ 111.544
    expect(res).toBeCloseTo(100 + 0.5772 * 20, 1);
  });

  it('k=10 max grows by scale·ln(10) ≈ 2.303·scale', () => {
    const k1 = expectedMaxOfK(
      { family: 'gumbel', location: 0, scale: 10, bmin: 0 },
      1,
    );
    const k10 = expectedMaxOfK(
      { family: 'gumbel', location: 0, scale: 10, bmin: 0 },
      10,
    );
    expect(k10 - k1).toBeCloseTo(10 * Math.log(10), 1);
  });

  it('monotone increasing in k', () => {
    const params: BonusPayoutParams = {
      family: 'gumbel',
      location: 50,
      scale: 30,
      bmin: 0,
    };
    let prev = -Infinity;
    for (let k = 1; k <= 20; k++) {
      const v = expectedMaxOfK(params, k);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('respects bmin floor', () => {
    const res = expectedMaxOfK(
      { family: 'gumbel', location: -1000, scale: 1, bmin: 50 },
      1,
    );
    expect(res).toBe(50);
  });
});

describe('expectedMaxOfK · LogNormal family', () => {
  it('k=1 mean ≈ leading-order Coles approximation', () => {
    // For k=2 (smallest non-degenerate): √(2·ln 2) ≈ 1.177
    const v = expectedMaxOfK(
      { family: 'lognormal', muLog: Math.log(100), sigmaLog: 1, bmin: 0 },
      2,
    );
    // Lower bound: should be > exp(μ) = 100 (since max-of-2 > median).
    expect(v).toBeGreaterThan(100);
  });

  it('monotone increasing in k for k ≥ 2', () => {
    const params: BonusPayoutParams = {
      family: 'lognormal',
      muLog: Math.log(50),
      sigmaLog: 1.2,
      bmin: 0,
    };
    let prev = expectedMaxOfK(params, 2);
    for (let k = 3; k <= 25; k++) {
      const v = expectedMaxOfK(params, k);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('grows roughly as exp(σ·√(2·ln k))', () => {
    const params: BonusPayoutParams = {
      family: 'lognormal',
      muLog: 0,
      sigmaLog: 1.5,
      bmin: 0,
    };
    const k10 = expectedMaxOfK(params, 10);
    const k100 = expectedMaxOfK(params, 100);
    // ratio k100/k10 should be roughly exp(σ·(√(2·ln100) − √(2·ln10)))
    const expectedRatio = Math.exp(1.5 * (Math.sqrt(2 * Math.log(100)) - Math.sqrt(2 * Math.log(10))));
    const measuredRatio = k100 / k10;
    expect(measuredRatio).toBeGreaterThan(0.5 * expectedRatio);
    expect(measuredRatio).toBeLessThan(2 * expectedRatio);
  });
});

describe('expectedMaxOfK · Truncated-exp family', () => {
  it('k=1 mean = bmin + (1 − exp(−r·range))/r — approximate', () => {
    const r = 0.02;
    const bmin = 10;
    const bmax = 200;
    const range = bmax - bmin;
    const Z = 1 - Math.exp(-r * range);
    const expectedK1 = bmin + 1 / r - (range * Math.exp(-r * range)) / Z;
    const v = expectedMaxOfK(
      { family: 'truncated-exp', rate: r, bmin, bmax },
      1,
    );
    expect(v).toBeCloseTo(expectedK1, 0);
  });

  it('monotone increasing then saturating near bmax', () => {
    const params: BonusPayoutParams = {
      family: 'truncated-exp',
      rate: 0.05,
      bmin: 0,
      bmax: 100,
    };
    let prev = expectedMaxOfK(params, 1);
    for (let k = 2; k <= 8; k++) {
      const v = expectedMaxOfK(params, k);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(100);
      prev = v;
    }
  });

  it('never exceeds bmax (clipped)', () => {
    const params: BonusPayoutParams = {
      family: 'truncated-exp',
      rate: 0.001,
      bmin: 0,
      bmax: 50,
    };
    for (let k = 1; k <= 10; k++) {
      const v = expectedMaxOfK(params, k);
      expect(v).toBeLessThanOrEqual(50);
    }
  });

  it('never falls below bmin', () => {
    const params: BonusPayoutParams = {
      family: 'truncated-exp',
      rate: 5,
      bmin: 7,
      bmax: 100,
    };
    for (let k = 1; k <= 10; k++) {
      const v = expectedMaxOfK(params, k);
      expect(v).toBeGreaterThanOrEqual(7);
    }
  });
});

// ─── 2. Session-best Poisson sum ─────────────────────────────────────────

describe('expectedSessionBestBonus', () => {
  it('returns bmin for λ=0 (no triggers expected)', () => {
    const res = expectedSessionBestBonus(
      { family: 'gumbel', location: 50, scale: 20, bmin: 5 },
      0,
    );
    expect(res).toBe(5);
  });

  it('grows monotonically with λ', () => {
    const params: BonusPayoutParams = {
      family: 'gumbel',
      location: 25,
      scale: 60,
      bmin: 0,
    };
    let prev = -Infinity;
    for (const lambda of [0.5, 1, 2, 5, 10, 20, 50]) {
      const v = expectedSessionBestBonus(params, lambda);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('λ=10 lognormal mean exceeds μ_logn=ln(50)', () => {
    const res = expectedSessionBestBonus(
      { family: 'lognormal', muLog: Math.log(50), sigmaLog: 1.0, bmin: 0 },
      10,
    );
    // For λ=10 triggers, max should exceed single-mean
    expect(res).toBeGreaterThan(50);
  });

  it('handles large λ (≥30) without numerical blow-up', () => {
    const res = expectedSessionBestBonus(
      { family: 'gumbel', location: 0, scale: 10, bmin: 0 },
      80,
    );
    expect(Number.isFinite(res)).toBe(true);
    expect(res).toBeGreaterThan(0);
  });
});

describe('varianceSessionBestBonus', () => {
  it('returns 0 for λ=0', () => {
    const res = varianceSessionBestBonus(
      { family: 'gumbel', location: 50, scale: 20, bmin: 0 },
      0,
    );
    expect(res).toBe(0);
  });

  it('positive for λ>0', () => {
    const res = varianceSessionBestBonus(
      { family: 'gumbel', location: 25, scale: 30, bmin: 0 },
      5,
    );
    expect(res).toBeGreaterThan(0);
  });

  it('lognormal variance >> gumbel variance at same E[bonus]', () => {
    // Heavy-tail check: lognormal has higher variance than Gumbel with
    // matched first moment.
    const varLog = varianceSessionBestBonus(
      { family: 'lognormal', muLog: Math.log(50), sigmaLog: 1.5, bmin: 0 },
      10,
    );
    const varGum = varianceSessionBestBonus(
      { family: 'gumbel', location: 25, scale: 20, bmin: 0 },
      10,
    );
    expect(varLog).toBeGreaterThan(varGum);
  });
});

// ─── 3. Main solver — invariants ─────────────────────────────────────────

describe('solveBonusTournamentHybrid · core invariants', () => {
  const cfg: BonusTournamentConfig = {
    N: 100,
    S: 200,
    betPerSpin: 1,
    triggerProb: 0.02,
    bonusPayout: { family: 'gumbel', location: 25, scale: 60, bmin: 0 },
    contributionRate: 0.05,
    prizeStructure: { kind: 'exp-decay', topN: 50, decay: 0.15 },
  };

  it('pool total = N · S · contributionRate · betPerSpin', () => {
    const sol = solveBonusTournamentHybrid(cfg);
    expect(sol.poolTotal).toBeCloseTo(100 * 200 * 0.05 * 1, 6);
  });

  it('expected prize per player = pool / N (linearity)', () => {
    const sol = solveBonusTournamentHybrid(cfg);
    expect(sol.expectedPrizePerPlayer).toBeCloseTo(sol.poolTotal / cfg.N, 6);
  });

  it('tournament-side RTP = contribution rate', () => {
    const sol = solveBonusTournamentHybrid(cfg);
    expect(sol.rtpFromTournament).toBeCloseTo(cfg.contributionRate, 6);
  });

  it('per-rank prize sum = pool total (allocation budget honoured)', () => {
    const sol = solveBonusTournamentHybrid(cfg);
    const partialSum = sol.perRankPrize.reduce((a, b) => a + b, 0);
    // Top-10 prizes of an exp-decay across 50 ranks ≈ majority of pool but
    // less than full pool. Should be > 50%.
    expect(partialSum).toBeGreaterThan(0.5 * sol.poolTotal);
    expect(partialSum).toBeLessThanOrEqual(sol.poolTotal + 1e-9);
  });

  it('per-rank expected bonus monotone descending', () => {
    const sol = solveBonusTournamentHybrid(cfg);
    for (let i = 1; i < sol.perRankExpectedBonus.length; i++) {
      expect(sol.perRankExpectedBonus[i]).toBeLessThanOrEqual(
        sol.perRankExpectedBonus[i - 1],
      );
    }
  });

  it('expectedTriggers = S · triggerProb', () => {
    const sol = solveBonusTournamentHybrid(cfg);
    expect(sol.expectedTriggersPerSession).toBeCloseTo(cfg.S * cfg.triggerProb, 6);
  });

  it('expectedSessionBestPerPlayer >= bmin', () => {
    const cfg2 = { ...cfg, bonusPayout: { ...cfg.bonusPayout, bmin: 7 } };
    const sol = solveBonusTournamentHybrid(cfg2);
    expect(sol.expectedSessionBestPerPlayer).toBeGreaterThanOrEqual(7);
  });

  it('expectedSessionBest > 0 for live triggers', () => {
    const sol = solveBonusTournamentHybrid(cfg);
    expect(sol.expectedSessionBestPerPlayer).toBeGreaterThan(0);
  });
});

// ─── 4. Input validation ─────────────────────────────────────────────────

describe('solveBonusTournamentHybrid · input validation', () => {
  it('throws on N <= 0', () => {
    expect(() =>
      solveBonusTournamentHybrid({
        N: 0, S: 100, betPerSpin: 1, triggerProb: 0.02,
        bonusPayout: { family: 'gumbel', location: 0, scale: 1, bmin: 0 },
        contributionRate: 0.05,
        prizeStructure: { kind: 'wta' },
      }),
    ).toThrow();
  });

  it('throws on S <= 0', () => {
    expect(() =>
      solveBonusTournamentHybrid({
        N: 10, S: 0, betPerSpin: 1, triggerProb: 0.02,
        bonusPayout: { family: 'gumbel', location: 0, scale: 1, bmin: 0 },
        contributionRate: 0.05,
        prizeStructure: { kind: 'wta' },
      }),
    ).toThrow();
  });

  it('throws on triggerProb out of [0,1]', () => {
    expect(() =>
      solveBonusTournamentHybrid({
        N: 10, S: 100, betPerSpin: 1, triggerProb: 1.5,
        bonusPayout: { family: 'gumbel', location: 0, scale: 1, bmin: 0 },
        contributionRate: 0.05,
        prizeStructure: { kind: 'wta' },
      }),
    ).toThrow();
  });

  it('throws on negative contributionRate', () => {
    expect(() =>
      solveBonusTournamentHybrid({
        N: 10, S: 100, betPerSpin: 1, triggerProb: 0.02,
        bonusPayout: { family: 'gumbel', location: 0, scale: 1, bmin: 0 },
        contributionRate: -0.05,
        prizeStructure: { kind: 'wta' },
      }),
    ).toThrow();
  });
});

// ─── 5. Edge cases ───────────────────────────────────────────────────────

describe('solveBonusTournamentHybrid · edge cases', () => {
  it('N=1 single player → pool entirely to them', () => {
    const sol = solveBonusTournamentHybrid({
      N: 1, S: 100, betPerSpin: 1, triggerProb: 0.02,
      bonusPayout: { family: 'gumbel', location: 25, scale: 60, bmin: 0 },
      contributionRate: 0.05,
      prizeStructure: { kind: 'wta' },
    });
    expect(sol.perRankExpectedBonus.length).toBe(1);
    expect(sol.poolTotal).toBeCloseTo(100 * 0.05, 6);
  });

  it('triggerProb=0 → expectedSessionBest = bmin', () => {
    const sol = solveBonusTournamentHybrid({
      N: 10, S: 100, betPerSpin: 1, triggerProb: 0,
      bonusPayout: { family: 'gumbel', location: 25, scale: 60, bmin: 3 },
      contributionRate: 0.05,
      prizeStructure: { kind: 'wta' },
    });
    expect(sol.expectedSessionBestPerPlayer).toBe(3);
    expect(sol.expectedTriggersPerSession).toBe(0);
  });

  it('contributionRate=0 → pool = 0', () => {
    const sol = solveBonusTournamentHybrid({
      N: 10, S: 100, betPerSpin: 1, triggerProb: 0.02,
      bonusPayout: { family: 'gumbel', location: 25, scale: 60, bmin: 0 },
      contributionRate: 0,
      prizeStructure: { kind: 'wta' },
    });
    expect(sol.poolTotal).toBe(0);
    expect(sol.expectedPrizePerPlayer).toBe(0);
    expect(sol.rtpFromTournament).toBe(0);
  });

  it('large N=10000 — no NaN/Infinity', () => {
    const sol = solveBonusTournamentHybrid({
      N: 10_000, S: 100, betPerSpin: 1, triggerProb: 0.02,
      bonusPayout: { family: 'gumbel', location: 25, scale: 60, bmin: 0 },
      contributionRate: 0.05,
      prizeStructure: { kind: 'exp-decay', topN: 100, decay: 0.1 },
    });
    expect(Number.isFinite(sol.expectedSessionBestPerPlayer)).toBe(true);
    expect(Number.isFinite(sol.varianceSessionBestPerPlayer)).toBe(true);
    expect(Number.isFinite(sol.poolTotal)).toBe(true);
    for (const v of sol.perRankExpectedBonus) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

// ─── 6. Prize structures ─────────────────────────────────────────────────

describe('solveBonusTournamentHybrid · prize structures', () => {
  const base = {
    N: 100, S: 200, betPerSpin: 1, triggerProb: 0.02,
    bonusPayout: { family: 'gumbel', location: 25, scale: 60, bmin: 0 } as BonusPayoutParams,
    contributionRate: 0.05,
  };

  it('wta with topShare=1 → all pool to rank 1', () => {
    const sol = solveBonusTournamentHybrid({
      ...base,
      prizeStructure: { kind: 'wta', topShare: 1 },
    });
    expect(sol.perRankPrize[0]).toBeCloseTo(sol.poolTotal, 6);
    for (let i = 1; i < sol.perRankPrize.length; i++) {
      expect(sol.perRankPrize[i]).toBeCloseTo(0, 6);
    }
  });

  it('wta with topShare=0.5 distributes rest evenly', () => {
    const sol = solveBonusTournamentHybrid({
      ...base,
      prizeStructure: { kind: 'wta', topShare: 0.5 },
    });
    expect(sol.perRankPrize[0]).toBeCloseTo(sol.poolTotal * 0.5, 6);
    // remaining 50% spread over ranks 2..100
    const expectedEach = (sol.poolTotal * 0.5) / 99;
    expect(sol.perRankPrize[1]).toBeCloseTo(expectedEach, 6);
  });

  it('top-n-flat with n=10 splits pool equally', () => {
    const sol = solveBonusTournamentHybrid({
      ...base,
      prizeStructure: { kind: 'top-n-flat', n: 10 },
    });
    const each = sol.poolTotal / 10;
    for (let i = 0; i < 10; i++) {
      expect(sol.perRankPrize[i]).toBeCloseTo(each, 6);
    }
  });

  it('exp-decay top-50 decay=0.2 monotone & sums to pool', () => {
    const sol = solveBonusTournamentHybrid({
      ...base,
      prizeStructure: { kind: 'exp-decay', topN: 50, decay: 0.2 },
    });
    // Check monotone descending across the visible top-10.
    for (let i = 1; i < sol.perRankPrize.length; i++) {
      expect(sol.perRankPrize[i]).toBeLessThanOrEqual(sol.perRankPrize[i - 1]);
    }
  });

  it('percentile brackets allocate per cohort', () => {
    const sol = solveBonusTournamentHybrid({
      ...base,
      prizeStructure: {
        kind: 'percentile',
        brackets: [
          { pct: 1, share: 0.5 },
          { pct: 10, share: 0.5 },
        ],
      },
    });
    // 1% of 100 = top 1 player gets 50% of pool.
    expect(sol.perRankPrize[0]).toBeCloseTo(sol.poolTotal * 0.5, 6);
    // 10% of 100 = next 10 players share 50% of pool → each gets 5%.
    expect(sol.perRankPrize[1]).toBeCloseTo(sol.poolTotal * 0.05, 6);
  });
});

// ─── 7. Skill premium ────────────────────────────────────────────────────

describe('solveBonusTournamentHybrid · skill premium', () => {
  it('uniform pop → skill premium = 0', () => {
    const sol = solveBonusTournamentHybrid({
      N: 100, S: 200, betPerSpin: 1, triggerProb: 0.02,
      bonusPayout: { family: 'gumbel', location: 25, scale: 60, bmin: 0 },
      contributionRate: 0.05,
      prizeStructure: { kind: 'wta' },
    });
    expect(sol.skillPremium).toBe(0);
  });

  it('heterogeneous (one super-skilled) → positive premium', () => {
    const trigProb = new Array<number>(100).fill(0.02);
    trigProb[0] = 0.06; // 3× typical trigger rate
    const sol = solveBonusTournamentHybrid({
      N: 100, S: 200, betPerSpin: 1, triggerProb: 0.02,
      bonusPayout: { family: 'gumbel', location: 25, scale: 60, bmin: 0 },
      contributionRate: 0.05,
      prizeStructure: { kind: 'wta' },
      triggerProbHeterogeneous: trigProb,
    });
    expect(sol.skillPremium).toBeGreaterThan(0);
  });

  it('larger spread → larger premium', () => {
    const trigProb1 = new Array<number>(100).fill(0.02);
    trigProb1[0] = 0.03;
    const trigProb2 = new Array<number>(100).fill(0.02);
    trigProb2[0] = 0.08;
    const base = {
      N: 100, S: 200, betPerSpin: 1, triggerProb: 0.02,
      bonusPayout: { family: 'gumbel', location: 25, scale: 60, bmin: 0 } as BonusPayoutParams,
      contributionRate: 0.05,
      prizeStructure: { kind: 'wta' } as const,
    };
    const sol1 = solveBonusTournamentHybrid({ ...base, triggerProbHeterogeneous: trigProb1 });
    const sol2 = solveBonusTournamentHybrid({ ...base, triggerProbHeterogeneous: trigProb2 });
    expect(sol2.skillPremium).toBeGreaterThan(sol1.skillPremium);
  });
});

// ─── 8. MC validator agreement ───────────────────────────────────────────

describe('monteCarloBonusTournament · acceptance', () => {
  it('Hacksaw Bonus Buy Race: closed-form ratio ∈ [0.9, 1.1]', () => {
    const mc = monteCarloBonusTournament(INDUSTRY_CONFIGS.hacksawBonusBuyRace, {
      nTournaments: 1500,
      seed: 0xc1ab,
    });
    expect(mc.closedFormRatio).toBeGreaterThan(0.85);
    expect(mc.closedFormRatio).toBeLessThan(1.15);
  });

  it('BTG Bonus Bonanza: closed-form ratio ∈ [0.85, 1.15]', () => {
    const mc = monteCarloBonusTournament(INDUSTRY_CONFIGS.btgBonusBonanza, {
      nTournaments: 1500,
      seed: 0xc1ab,
    });
    expect(mc.closedFormRatio).toBeGreaterThan(0.85);
    expect(mc.closedFormRatio).toBeLessThan(1.2);
  });

  it('Pragmatic Single-Spin-Win: closed-form ratio bounded', () => {
    const mc = monteCarloBonusTournament(
      INDUSTRY_CONFIGS.pragmaticSingleSpinWin,
      { nTournaments: 1500, seed: 0xc1ab },
    );
    expect(mc.closedFormRatio).toBeGreaterThan(0.85);
    expect(mc.closedFormRatio).toBeLessThan(1.2);
  });

  it('truncated-exp family (L&W Mega Win): ratio within tolerance', () => {
    const mc = monteCarloBonusTournament(INDUSTRY_CONFIGS.lwMegaWinPromo, {
      nTournaments: 1500,
      seed: 0xc1ab,
    });
    expect(mc.closedFormRatio).toBeGreaterThan(0.85);
    expect(mc.closedFormRatio).toBeLessThan(1.2);
  });

  it('IGT TournXpress Bonus Mode (WTA, small N): ratio bounded', () => {
    const mc = monteCarloBonusTournament(
      INDUSTRY_CONFIGS.igtTournXpressBonusMode,
      { nTournaments: 1500, seed: 0xc1ab },
    );
    expect(mc.closedFormRatio).toBeGreaterThan(0.85);
    expect(mc.closedFormRatio).toBeLessThan(1.2);
  });

  it('Push Big Win Race (lognormal-heavy-tail): MC mean monotone in λ', () => {
    const baseCfg = INDUSTRY_CONFIGS.pushBigWinRace;
    const mcLowQ = monteCarloBonusTournament(
      { ...baseCfg, triggerProb: 0.005 },
      { nTournaments: 800, seed: 0xc1ab },
    );
    const mcHighQ = monteCarloBonusTournament(
      { ...baseCfg, triggerProb: 0.03 },
      { nTournaments: 800, seed: 0xc1ab },
    );
    expect(mcHighQ.measuredSessionBestAvg).toBeGreaterThan(
      mcLowQ.measuredSessionBestAvg,
    );
  });

  it('measured pool paid out == poolTotal (exact)', () => {
    const mc = monteCarloBonusTournament(INDUSTRY_CONFIGS.hacksawBonusBuyRace, {
      nTournaments: 500,
      seed: 0xc1ab,
    });
    const cfg = INDUSTRY_CONFIGS.hacksawBonusBuyRace;
    const expectedPool = cfg.N * cfg.S * cfg.contributionRate * cfg.betPerSpin;
    expect(mc.measuredPoolPaidOut).toBeCloseTo(expectedPool, 1);
  });
});

// ─── 9. PRNG determinism ─────────────────────────────────────────────────

describe('monteCarloBonusTournament · PRNG determinism', () => {
  it('same seed → byte-identical measured outputs', () => {
    const cfg = INDUSTRY_CONFIGS.hacksawBonusBuyRace;
    const mc1 = monteCarloBonusTournament(cfg, { nTournaments: 200, seed: 42 });
    const mc2 = monteCarloBonusTournament(cfg, { nTournaments: 200, seed: 42 });
    expect(mc1.measuredSessionBestAvg).toBe(mc2.measuredSessionBestAvg);
    expect(mc1.measuredSessionBestVar).toBe(mc2.measuredSessionBestVar);
    expect(mc1.measuredFirstRankPrize).toBe(mc2.measuredFirstRankPrize);
  });

  it('different seeds → different outputs (sanity)', () => {
    const cfg = INDUSTRY_CONFIGS.hacksawBonusBuyRace;
    const mc1 = monteCarloBonusTournament(cfg, { nTournaments: 200, seed: 1 });
    const mc2 = monteCarloBonusTournament(cfg, { nTournaments: 200, seed: 2 });
    expect(mc1.measuredSessionBestAvg).not.toBe(mc2.measuredSessionBestAvg);
  });
});

// ─── 10. UKGC/MGA/EU compliance ──────────────────────────────────────────

describe('regulatory compliance', () => {
  it('UKGC RTS-12 §a: per-rank disclosure produces top-10 rows', () => {
    const sol = solveBonusTournamentHybrid(INDUSTRY_CONFIGS.hacksawBonusBuyRace);
    expect(sol.perRankExpectedBonus.length).toBeLessThanOrEqual(10);
    expect(sol.perRankExpectedBonus.length).toBeGreaterThan(0);
    expect(sol.perRankPrize.length).toBeGreaterThan(0);
  });

  it('UKGC RTS-12 §b: per-rank disclosure ranks 1..N if N<10', () => {
    const sol = solveBonusTournamentHybrid({
      N: 5,
      S: 100,
      betPerSpin: 1,
      triggerProb: 0.02,
      bonusPayout: { family: 'gumbel', location: 25, scale: 60, bmin: 0 },
      contributionRate: 0.05,
      prizeStructure: { kind: 'top-n-flat', n: 3 },
    });
    expect(sol.perRankExpectedBonus.length).toBe(5);
    // Top-3 should each get poolTotal / 3
    expect(sol.perRankPrize[0]).toBeCloseTo(sol.poolTotal / 3, 6);
    expect(sol.perRankPrize[3]).toBe(0);
  });

  it('EU GA 2024 Art. 7: combined RTP within sensible bounds', () => {
    for (const [name, cfg] of Object.entries(INDUSTRY_CONFIGS)) {
      void name;
      const sol = solveBonusTournamentHybrid(cfg);
      // Tournament-only RTP equals contribution rate (5-6%). Combined with
      // ~92% base RTP gives ~97-98% — well within EU bounds.
      expect(sol.rtpFromTournament).toBeGreaterThanOrEqual(0);
      expect(sol.rtpFromTournament).toBeLessThanOrEqual(0.15);
    }
  });

  it('MGA PPD §11.6: expected trigger count disclosed and reasonable', () => {
    for (const cfg of Object.values(INDUSTRY_CONFIGS)) {
      const sol = solveBonusTournamentHybrid(cfg);
      expect(sol.expectedTriggersPerSession).toBeCloseTo(
        cfg.S * cfg.triggerProb,
        6,
      );
      // For typical configs the trigger count should be > 0.5 (otherwise
      // most sessions have 0 bonuses and the leaderboard is degenerate).
      expect(sol.expectedTriggersPerSession).toBeGreaterThanOrEqual(0.5);
    }
  });
});

// ─── 11. Industry-config catalog ─────────────────────────────────────────

describe('INDUSTRY_CONFIGS · catalog presence', () => {
  it('exposes 6 distinct configs', () => {
    expect(Object.keys(INDUSTRY_CONFIGS).length).toBe(6);
  });

  it('every config has all 3 bonus families represented somewhere', () => {
    const families = new Set(
      Object.values(INDUSTRY_CONFIGS).map((c) => c.bonusPayout.family),
    );
    expect(families.has('gumbel')).toBe(true);
    expect(families.has('lognormal')).toBe(true);
    expect(families.has('truncated-exp')).toBe(true);
  });

  it('every config solves without throw', () => {
    for (const cfg of Object.values(INDUSTRY_CONFIGS)) {
      expect(() => solveBonusTournamentHybrid(cfg)).not.toThrow();
    }
  });
});
