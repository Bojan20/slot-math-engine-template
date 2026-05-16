/**
 * W152 Wave 54 — Megacluster Stack-Reveal Ways tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveMegaclusterStackWays,
  simulateMegaclusterStackWays,
  meanStack,
  meanStackSquared,
  type MegaclusterConfig,
} from '../src/features/megaclusterStackWays.js';

const baseCfg = (overrides: Partial<MegaclusterConfig> = {}): MegaclusterConfig => ({
  numReels: 6,
  stackSizePmf: [
    { stackSize: 1, weight: 60 },
    { stackSize: 2, weight: 25 },
    { stackSize: 3, weight: 10 },
    { stackSize: 4, weight: 4 },
    { stackSize: 6, weight: 1 },
  ],
  pTargetPerReel: 0.30,
  paytableByMatches: [0, 0, 0, 1, 5, 25, 100], // k=0..6
  ...overrides,
});

// ── Helpers ───────────────────────────────────────────────────────────────

describe('meanStack / meanStackSquared', () => {
  it('E[S] correct', () => {
    const d = [
      { stackSize: 1, weight: 60 },
      { stackSize: 2, weight: 25 },
      { stackSize: 3, weight: 10 },
      { stackSize: 4, weight: 4 },
      { stackSize: 6, weight: 1 },
    ];
    // (60×1 + 25×2 + 10×3 + 4×4 + 1×6) / 100 = (60+50+30+16+6)/100 = 162/100 = 1.62
    expect(meanStack(d)).toBeCloseTo(1.62, 10);
  });
  it('E[S²] correct', () => {
    const d = [
      { stackSize: 1, weight: 60 },
      { stackSize: 2, weight: 25 },
      { stackSize: 3, weight: 10 },
      { stackSize: 4, weight: 4 },
      { stackSize: 6, weight: 1 },
    ];
    // (60×1 + 25×4 + 10×9 + 4×16 + 1×36) / 100 = (60+100+90+64+36)/100 = 350/100 = 3.5
    expect(meanStackSquared(d)).toBeCloseTo(3.5, 10);
  });
});

// ── Validation ─────────────────────────────────────────────────────────────

describe('validate', () => {
  it('rejects numReels < 2', () => {
    expect(() => solveMegaclusterStackWays(baseCfg({ numReels: 1, paytableByMatches: [0, 0] }))).toThrow();
  });
  it('rejects empty stackSizePmf', () => {
    expect(() => solveMegaclusterStackWays(baseCfg({ stackSizePmf: [] }))).toThrow();
  });
  it('rejects non-integer stackSize', () => {
    expect(() =>
      solveMegaclusterStackWays(baseCfg({ stackSizePmf: [{ stackSize: 1.5, weight: 1 }] })),
    ).toThrow();
  });
  it('rejects stackSize < 1', () => {
    expect(() =>
      solveMegaclusterStackWays(baseCfg({ stackSizePmf: [{ stackSize: 0, weight: 1 }] })),
    ).toThrow();
  });
  it('rejects pTargetPerReel outside [0,1]', () => {
    expect(() => solveMegaclusterStackWays(baseCfg({ pTargetPerReel: -0.1 }))).toThrow();
    expect(() => solveMegaclusterStackWays(baseCfg({ pTargetPerReel: 1.5 }))).toThrow();
  });
  it('rejects paytable wrong length', () => {
    expect(() => solveMegaclusterStackWays(baseCfg({ paytableByMatches: [0, 0, 1] }))).toThrow();
  });
  it('rejects negative paytable entry', () => {
    expect(() =>
      solveMegaclusterStackWays(baseCfg({ paytableByMatches: [0, 0, 0, -1, 5, 25, 100] })),
    ).toThrow();
  });
  it('rejects negative maxWaysCap', () => {
    expect(() => solveMegaclusterStackWays(baseCfg({ maxWaysCap: -100 }))).toThrow();
  });
  it('rejects negative bonus', () => {
    expect(() => solveMegaclusterStackWays(baseCfg({ bonusOnFullMatchX: -50 }))).toThrow();
  });
});

// ── Structural correctness ─────────────────────────────────────────────────

describe('solveMegaclusterStackWays — structural', () => {
  it('matchCountPmf sums to 1', () => {
    const r = solveMegaclusterStackWays(baseCfg());
    const sum = r.matchCountPmf.reduce((a, x) => a + x, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
  it('matchCountPmf is binomial: P(K=0) = (1−p)^N', () => {
    const r = solveMegaclusterStackWays(baseCfg());
    expect(r.matchCountPmf[0]).toBeCloseTo(Math.pow(0.7, 6), 10);
  });
  it('matchCountPmf is binomial: P(K=N) = p^N', () => {
    const r = solveMegaclusterStackWays(baseCfg());
    expect(r.matchCountPmf[6]).toBeCloseTo(Math.pow(0.3, 6), 10);
  });
  it('E[ways | K=k] = E[S]^k (no cap)', () => {
    const r = solveMegaclusterStackWays(baseCfg());
    const eS = r.expectedStackSize;
    for (let k = 0; k <= 6; k++) {
      expect(r.expectedWaysByK[k]).toBeCloseTo(Math.pow(eS, k), 6);
    }
  });
  it('E[Y] = Σ P(K=k) × paytable(k) × E[S]^k', () => {
    const r = solveMegaclusterStackWays(baseCfg());
    const paytable = baseCfg().paytableByMatches;
    let expected = 0;
    for (let k = 0; k <= 6; k++) {
      expected += r.matchCountPmf[k] * paytable[k] * r.expectedWaysByK[k];
    }
    expect(r.expectedPayoutPerSpin).toBeCloseTo(expected, 6);
  });
  it('Var[Y] ≥ 0', () => {
    const r = solveMegaclusterStackWays(baseCfg());
    expect(r.variancePayoutPerSpin).toBeGreaterThanOrEqual(0);
  });
  it('σ[Y] = sqrt(Var[Y])', () => {
    const r = solveMegaclusterStackWays(baseCfg());
    expect(r.stdDevPayoutPerSpin).toBeCloseTo(Math.sqrt(r.variancePayoutPerSpin), 10);
  });
  it('hitRate ≤ probAnyPayout (hitRate considers paytable + bonus)', () => {
    const r = solveMegaclusterStackWays(baseCfg());
    expect(r.hitRate).toBeLessThanOrEqual(r.probAnyPayout + 1e-12);
  });
});

// ── Monotonicity ─────────────────────────────────────────────────────────

describe('solveMegaclusterStackWays — monotonicity', () => {
  it('higher p ⇒ higher E[Y]', () => {
    const a = solveMegaclusterStackWays(baseCfg({ pTargetPerReel: 0.15 }));
    const b = solveMegaclusterStackWays(baseCfg({ pTargetPerReel: 0.45 }));
    expect(b.expectedPayoutPerSpin).toBeGreaterThan(a.expectedPayoutPerSpin);
  });
  it('larger stack PMF ⇒ higher E[Y]', () => {
    const a = solveMegaclusterStackWays(baseCfg({
      stackSizePmf: [{ stackSize: 1, weight: 1 }],
    }));
    const b = solveMegaclusterStackWays(baseCfg({
      stackSizePmf: [{ stackSize: 4, weight: 1 }],
    }));
    expect(b.expectedPayoutPerSpin).toBeGreaterThan(a.expectedPayoutPerSpin);
  });
  it('paytable scaled 2× ⇒ E[Y] scaled 2×', () => {
    const cfg = baseCfg();
    const r1 = solveMegaclusterStackWays(cfg);
    const r2 = solveMegaclusterStackWays(baseCfg({
      paytableByMatches: cfg.paytableByMatches.map((x) => x * 2),
    }));
    expect(r2.expectedPayoutPerSpin).toBeCloseTo(r1.expectedPayoutPerSpin * 2, 8);
  });
  it('more reels ⇒ higher E[Y] (with proportional paytable)', () => {
    const small = solveMegaclusterStackWays(baseCfg({
      numReels: 4,
      paytableByMatches: [0, 0, 0, 1, 5],
    }));
    const big = solveMegaclusterStackWays(baseCfg({
      numReels: 8,
      paytableByMatches: [0, 0, 0, 1, 5, 25, 100, 500, 2500],
    }));
    expect(big.expectedPayoutPerSpin).toBeGreaterThan(small.expectedPayoutPerSpin);
  });
});

// ── Cap behavior ───────────────────────────────────────────────────────────

describe('solveMegaclusterStackWays — cap', () => {
  it('cap reduces E[ways] when binding', () => {
    const noCapR = solveMegaclusterStackWays(baseCfg());
    const capR = solveMegaclusterStackWays(baseCfg({ maxWaysCap: 8 }));
    // For k=6 matches: max possible ways = 6^6 = 46656 → capped at 8
    expect(capR.expectedWaysByK[6]).toBeLessThanOrEqual(noCapR.expectedWaysByK[6]);
    expect(capR.expectedPayoutPerSpin).toBeLessThanOrEqual(noCapR.expectedPayoutPerSpin + 1e-9);
  });
  it('huge cap is equivalent to no cap', () => {
    const noCapR = solveMegaclusterStackWays(baseCfg());
    const capR = solveMegaclusterStackWays(baseCfg({ maxWaysCap: 1e12 }));
    expect(capR.expectedPayoutPerSpin).toBeCloseTo(noCapR.expectedPayoutPerSpin, 6);
  });
});

// ── Bonus on full match ──────────────────────────────────────────────────

describe('solveMegaclusterStackWays — fullMatch bonus', () => {
  it('bonus adds P(K=N) × bonus to E[Y]', () => {
    const cfg = baseCfg();
    const r1 = solveMegaclusterStackWays(cfg);
    const r2 = solveMegaclusterStackWays(baseCfg({ bonusOnFullMatchX: 10000 }));
    const pFullMatch = Math.pow(0.3, 6);
    expect(r2.expectedPayoutPerSpin).toBeCloseTo(r1.expectedPayoutPerSpin + pFullMatch * 10000, 8);
  });
});

// ── MC cross-validation ─────────────────────────────────────────────────────

describe('solveMegaclusterStackWays — MC cross-validation', () => {
  it('E[Y] matches MC at 200K spins (rel ≤ 8%, high σ/μ ratio)', () => {
    // High variance regime: σ/μ ≈ 18 → 200K MC SE ≈ 4% relative.
    // Bump tolerance accordingly; tail dominates variance.
    const cfg = baseCfg();
    const cf = solveMegaclusterStackWays(cfg);
    const mc = simulateMegaclusterStackWays(cfg, 200_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedPayoutPerSpin - mc.observedMeanPayout) / Math.max(cf.expectedPayoutPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.08);
  });
  it('hitRate matches MC', () => {
    const cfg = baseCfg();
    const cf = solveMegaclusterStackWays(cfg);
    const mc = simulateMegaclusterStackWays(cfg, 100_000, 0xbeefbabe);
    expect(Math.abs(cf.hitRate - mc.observedHitRate)).toBeLessThan(0.01);
  });
  it('cap=10 matches MC (rel ≤ 5%)', () => {
    const cfg = baseCfg({ maxWaysCap: 10 });
    const cf = solveMegaclusterStackWays(cfg);
    const mc = simulateMegaclusterStackWays(cfg, 100_000, 0xdecafbad);
    const rel = Math.abs(cf.expectedPayoutPerSpin - mc.observedMeanPayout) / cf.expectedPayoutPerSpin;
    expect(rel).toBeLessThan(0.05);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────

describe('solveMegaclusterStackWays — edges', () => {
  it('p=0 ⇒ E[Y] = 0', () => {
    const r = solveMegaclusterStackWays(baseCfg({ pTargetPerReel: 0 }));
    expect(r.expectedPayoutPerSpin).toBe(0);
    expect(r.matchCountPmf[0]).toBeCloseTo(1, 10);
  });
  it('p=1, all-zero paytable ⇒ E[Y] = bonus (full match always)', () => {
    const cfg = baseCfg({
      pTargetPerReel: 1,
      paytableByMatches: [0, 0, 0, 0, 0, 0, 0],
      bonusOnFullMatchX: 50,
    });
    const r = solveMegaclusterStackWays(cfg);
    expect(r.expectedPayoutPerSpin).toBeCloseTo(50, 8);
  });
  it('stack pmf with single value collapses to deterministic', () => {
    const r = solveMegaclusterStackWays(baseCfg({
      stackSizePmf: [{ stackSize: 3, weight: 1 }],
    }));
    expect(r.expectedStackSize).toBe(3);
    expect(r.expectedStackSizeSquared).toBe(9);
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe('solveMegaclusterStackWays — determinism', () => {
  it('identical inputs ⇒ bit-exact outputs', () => {
    const a = solveMegaclusterStackWays(baseCfg());
    const b = solveMegaclusterStackWays(baseCfg());
    expect(a.expectedPayoutPerSpin).toBe(b.expectedPayoutPerSpin);
    expect(a.variancePayoutPerSpin).toBe(b.variancePayoutPerSpin);
  });
  it('MC same seed ⇒ identical', () => {
    const a = simulateMegaclusterStackWays(baseCfg(), 1000, 42);
    const b = simulateMegaclusterStackWays(baseCfg(), 1000, 42);
    expect(a.observedMeanPayout).toBe(b.observedMeanPayout);
  });
});
