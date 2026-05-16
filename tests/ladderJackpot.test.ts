/**
 * W152 Wave 49 — N-tier H&W ladder jackpot tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveLadderJackpot,
  simulateLadderJackpot,
  expectedCashPerSymbol,
  tierPayoutForFilled,
  type LadderJackpotConfig,
} from '../src/jackpot/ladderJackpot.js';

// ── Test helpers ───────────────────────────────────────────────────────────

const baseTiers = [
  { id: 'MINI', threshold: 12, payoutX: 25 },
  { id: 'MINOR', threshold: 15, payoutX: 100 },
  { id: 'MAJOR', threshold: 18, payoutX: 500 },
  { id: 'GRAND', threshold: 20, payoutX: 2000 },
];

const baseCfg = (overrides: Partial<LadderJackpotConfig> = {}): LadderJackpotConfig => ({
  gridSize: 20,
  initialRespins: 3,
  pLand: 0.15,
  initialFilled: 6,
  cashValueDistribution: [
    { valueX: 1, weight: 6 },
    { valueX: 2, weight: 4 },
    { valueX: 5, weight: 2 },
    { valueX: 10, weight: 1 },
  ],
  tiers: baseTiers,
  resetOnLanding: true,
  ...overrides,
});

function approxEqual(a: number, b: number, eps: number): void {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

describe('expectedCashPerSymbol', () => {
  it('uniform distribution', () => {
    expect(expectedCashPerSymbol([{ valueX: 5, weight: 1 }])).toBe(5);
  });
  it('weighted distribution', () => {
    const dist = [
      { valueX: 1, weight: 6 },
      { valueX: 2, weight: 4 },
      { valueX: 5, weight: 2 },
      { valueX: 10, weight: 1 },
    ];
    // 6+8+10+10 = 34 / 13 = 2.6153...
    expect(expectedCashPerSymbol(dist)).toBeCloseTo(34 / 13, 10);
  });
});

describe('tierPayoutForFilled', () => {
  it('returns NONE below first threshold', () => {
    expect(tierPayoutForFilled(11, baseTiers)).toEqual({ id: 'NONE', payoutX: 0 });
  });
  it('returns highest tier ≤ filled', () => {
    expect(tierPayoutForFilled(12, baseTiers).id).toBe('MINI');
    expect(tierPayoutForFilled(14, baseTiers).id).toBe('MINI');
    expect(tierPayoutForFilled(15, baseTiers).id).toBe('MINOR');
    expect(tierPayoutForFilled(17, baseTiers).id).toBe('MINOR');
    expect(tierPayoutForFilled(18, baseTiers).id).toBe('MAJOR');
    expect(tierPayoutForFilled(19, baseTiers).id).toBe('MAJOR');
    expect(tierPayoutForFilled(20, baseTiers).id).toBe('GRAND');
  });
});

// ── Validation ─────────────────────────────────────────────────────────────

describe('validate', () => {
  it('rejects non-positive gridSize', () => {
    expect(() => solveLadderJackpot(baseCfg({ gridSize: 0 }))).toThrow();
    expect(() => solveLadderJackpot(baseCfg({ gridSize: -1 }))).toThrow();
  });
  it('rejects non-positive initialRespins', () => {
    expect(() => solveLadderJackpot(baseCfg({ initialRespins: 0 }))).toThrow();
  });
  it('rejects pLand outside (0,1)', () => {
    expect(() => solveLadderJackpot(baseCfg({ pLand: 0 }))).toThrow();
    expect(() => solveLadderJackpot(baseCfg({ pLand: 1 }))).toThrow();
    expect(() => solveLadderJackpot(baseCfg({ pLand: -0.1 }))).toThrow();
  });
  it('rejects initialFilled = gridSize', () => {
    expect(() => solveLadderJackpot(baseCfg({ initialFilled: 20 }))).toThrow();
  });
  it('rejects empty cashValueDistribution', () => {
    expect(() => solveLadderJackpot(baseCfg({ cashValueDistribution: [] }))).toThrow();
  });
  it('rejects negative valueX', () => {
    expect(() =>
      solveLadderJackpot(baseCfg({ cashValueDistribution: [{ valueX: -1, weight: 1 }] })),
    ).toThrow();
  });
  it('rejects non-ascending tier thresholds', () => {
    expect(() =>
      solveLadderJackpot(
        baseCfg({
          tiers: [
            { id: 'A', threshold: 10, payoutX: 100 },
            { id: 'B', threshold: 5, payoutX: 200 },
          ],
        }),
      ),
    ).toThrow();
  });
  it('rejects duplicate tier ids', () => {
    expect(() =>
      solveLadderJackpot(
        baseCfg({
          tiers: [
            { id: 'X', threshold: 10, payoutX: 50 },
            { id: 'X', threshold: 15, payoutX: 100 },
          ],
        }),
      ),
    ).toThrow();
  });
  it('rejects reserved tier id "NONE"', () => {
    expect(() =>
      solveLadderJackpot(baseCfg({ tiers: [{ id: 'NONE', threshold: 12, payoutX: 25 }] })),
    ).toThrow();
  });
  it('rejects tier.threshold > gridSize', () => {
    expect(() =>
      solveLadderJackpot(baseCfg({ tiers: [{ id: 'X', threshold: 25, payoutX: 100 }] })),
    ).toThrow();
  });
});

// ── Closed-form correctness ─────────────────────────────────────────────────

describe('solveLadderJackpot — structural properties', () => {
  it('tier + NONE probabilities sum to 1', () => {
    const r = solveLadderJackpot(baseCfg());
    const sum = r.tierProbabilities.reduce((a, t) => a + t.probability, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
  it('filled termination PMF sums to 1', () => {
    const r = solveLadderJackpot(baseCfg());
    const sum = r.filledTerminationPmf.reduce((a, e) => a + e.probability, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
  it('expectedTotalX = expectedCashValueX + expectedTierPayoutX', () => {
    const r = solveLadderJackpot(baseCfg());
    expect(r.expectedTotalX).toBeCloseTo(r.expectedCashValueX + r.expectedTierPayoutX, 10);
  });
  it('expectedFilled is between initialFilled and gridSize', () => {
    const cfg = baseCfg();
    const r = solveLadderJackpot(cfg);
    expect(r.expectedFilled).toBeGreaterThanOrEqual(cfg.initialFilled);
    expect(r.expectedFilled).toBeLessThanOrEqual(cfg.gridSize);
  });
});

describe('solveLadderJackpot — monotonicity', () => {
  it('higher threshold → smaller probability', () => {
    const r = solveLadderJackpot(baseCfg());
    const byId: Record<string, number> = {};
    for (const t of r.tierProbabilities) byId[t.id] = t.probability;
    // P(reach MINI ≥ 12) ≥ P(reach MINOR ≥ 15) ≥ P(MAJOR ≥ 18) ≥ P(GRAND = 20)
    const pAtLeastMini = byId.MINI + byId.MINOR + byId.MAJOR + byId.GRAND;
    const pAtLeastMinor = byId.MINOR + byId.MAJOR + byId.GRAND;
    const pAtLeastMajor = byId.MAJOR + byId.GRAND;
    const pAtLeastGrand = byId.GRAND;
    expect(pAtLeastMini).toBeGreaterThanOrEqual(pAtLeastMinor);
    expect(pAtLeastMinor).toBeGreaterThanOrEqual(pAtLeastMajor);
    expect(pAtLeastMajor).toBeGreaterThanOrEqual(pAtLeastGrand);
  });
  it('higher pLand → larger expectedFilled', () => {
    const a = solveLadderJackpot(baseCfg({ pLand: 0.1 }));
    const b = solveLadderJackpot(baseCfg({ pLand: 0.25 }));
    expect(b.expectedFilled).toBeGreaterThan(a.expectedFilled);
  });
  it('more initialRespins → larger expectedFilled', () => {
    const a = solveLadderJackpot(baseCfg({ initialRespins: 2 }));
    const b = solveLadderJackpot(baseCfg({ initialRespins: 5 }));
    expect(b.expectedFilled).toBeGreaterThan(a.expectedFilled);
  });
  it('cash distribution scaled 2× → expectedCashValueX scaled 2×', () => {
    const r1 = solveLadderJackpot(baseCfg());
    const r2 = solveLadderJackpot(
      baseCfg({
        cashValueDistribution: [
          { valueX: 2, weight: 6 },
          { valueX: 4, weight: 4 },
          { valueX: 10, weight: 2 },
          { valueX: 20, weight: 1 },
        ],
      }),
    );
    expect(r2.expectedCashValueX).toBeCloseTo(r1.expectedCashValueX * 2, 8);
  });
  it('resetOnLanding=true ⇒ larger expectedFilled than =false (same other params)', () => {
    const reset = solveLadderJackpot(baseCfg({ resetOnLanding: true }));
    const noReset = solveLadderJackpot(baseCfg({ resetOnLanding: false }));
    expect(reset.expectedFilled).toBeGreaterThan(noReset.expectedFilled);
  });
});

// ── MC cross-validation ─────────────────────────────────────────────────────

describe('solveLadderJackpot — MC cross-validation', () => {
  it('matches MC at 100K spins within ±5% relative on EV (reset)', () => {
    const cfg = baseCfg();
    const cf = solveLadderJackpot(cfg);
    const mc = simulateLadderJackpot(cfg, 100_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedTotalX - mc.expectedTotalX) / Math.max(1e-9, cf.expectedTotalX);
    expect(rel).toBeLessThan(0.05);
    approxEqual(cf.expectedFilled, mc.expectedFilled, 0.05);
  });

  it('matches MC at 100K spins within ±5% relative on EV (no reset)', () => {
    const cfg = baseCfg({ resetOnLanding: false, initialRespins: 5 });
    const cf = solveLadderJackpot(cfg);
    const mc = simulateLadderJackpot(cfg, 100_000, 0xdecafbad);
    const rel = Math.abs(cf.expectedTotalX - mc.expectedTotalX) / Math.max(1e-9, cf.expectedTotalX);
    expect(rel).toBeLessThan(0.05);
    approxEqual(cf.expectedFilled, mc.expectedFilled, 0.05);
  });

  it('tier probabilities match MC within ±0.02 abs (reset)', () => {
    const cfg = baseCfg();
    const cf = solveLadderJackpot(cfg);
    const mc = simulateLadderJackpot(cfg, 100_000, 0xbeefbabe);
    for (const tier of cf.tierProbabilities) {
      approxEqual(tier.probability, mc.tierProbabilities[tier.id] ?? 0, 0.02);
    }
  });
});

// ── Edge cases ─────────────────────────────────────────────────────────────

describe('solveLadderJackpot — edge cases', () => {
  it('single-tier full-grid GRAND only', () => {
    const cfg = baseCfg({
      tiers: [{ id: 'GRAND', threshold: 20, payoutX: 2000 }],
    });
    const r = solveLadderJackpot(cfg);
    const grandProb = r.tierProbabilities.find((t) => t.id === 'GRAND')!.probability;
    const noneProb = r.tierProbabilities.find((t) => t.id === 'NONE')!.probability;
    expect(grandProb + noneProb).toBeCloseTo(1, 10);
    expect(r.expectedTierPayoutX).toBeCloseTo(grandProb * 2000, 10);
  });

  it('handles minimal config: 1 respin, 1 tier', () => {
    const cfg: LadderJackpotConfig = {
      gridSize: 5,
      initialRespins: 1,
      pLand: 0.5,
      initialFilled: 1,
      cashValueDistribution: [{ valueX: 1, weight: 1 }],
      tiers: [{ id: 'TIER', threshold: 5, payoutX: 100 }],
      resetOnLanding: false,
    };
    const r = solveLadderJackpot(cfg);
    expect(r.expectedFilled).toBeGreaterThan(1);
    expect(r.expectedFilled).toBeLessThan(5);
    expect(r.expectedRespins).toBeCloseTo(1, 10);
  });

  it('initialCashValueX is preserved when no landings happen (boundary)', () => {
    const cfg: LadderJackpotConfig = {
      gridSize: 10,
      initialRespins: 1,
      pLand: 0.0001,
      initialFilled: 5,
      cashValueDistribution: [{ valueX: 1, weight: 1 }],
      tiers: [{ id: 'X', threshold: 10, payoutX: 100 }],
      resetOnLanding: true,
      initialCashValueX: 7,
    };
    const r = solveLadderJackpot(cfg);
    // With pLand ≈ 0, expected cash ≈ initial 7 (almost no new landings)
    expect(r.expectedCashValueX).toBeGreaterThan(6.9);
    expect(r.expectedCashValueX).toBeLessThan(8.0);
  });

  it('large grid (35 cells) terminates and returns valid PMF', () => {
    const cfg: LadderJackpotConfig = {
      gridSize: 35,
      initialRespins: 3,
      pLand: 0.1,
      initialFilled: 7,
      cashValueDistribution: [{ valueX: 1, weight: 1 }],
      tiers: [
        { id: 'A', threshold: 20, payoutX: 50 },
        { id: 'B', threshold: 28, payoutX: 200 },
        { id: 'C', threshold: 35, payoutX: 1000 },
      ],
      resetOnLanding: true,
    };
    const r = solveLadderJackpot(cfg);
    const sumPMF = r.filledTerminationPmf.reduce((a, e) => a + e.probability, 0);
    expect(sumPMF).toBeCloseTo(1, 8);
  });
});

// ── Determinism ─────────────────────────────────────────────────────────────

describe('solveLadderJackpot — determinism', () => {
  it('identical inputs ⇒ bit-exact identical outputs', () => {
    const a = solveLadderJackpot(baseCfg());
    const b = solveLadderJackpot(baseCfg());
    expect(a.expectedTotalX).toBe(b.expectedTotalX);
    expect(a.expectedCashValueX).toBe(b.expectedCashValueX);
    expect(a.expectedTierPayoutX).toBe(b.expectedTierPayoutX);
    expect(a.expectedFilled).toBe(b.expectedFilled);
  });
});
