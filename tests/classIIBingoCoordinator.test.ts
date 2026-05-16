/**
 * W152 Wave 59 — Class-II Bingo Coordinator tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveClassIIBingo,
  simulateClassIIBingo,
  probSubsetInDraws,
  expectedBallsToFirstHit,
  type ClassIIBingoConfig,
} from '../src/features/classIIBingoCoordinator.js';

// Standard 5×5 with FREE center — 24 numbered cells
function makeStandardCard(): number[] {
  // B: 1-15, I: 16-30, N: 31-45 (FREE at center), G: 46-60, O: 61-75
  return [
    3, 7, 12, 14, 5,        // B column
    16, 19, 22, 25, 28,     // I column
    31, 35, 42, 45,         // N column (only 4 cells, FREE center)
    46, 49, 53, 55, 58,     // G column
    61, 65, 67, 71, 73,     // O column
  ];
}

const standardCard = makeStandardCard();

// 5 rows × 5 patterns + 5 cols + 2 diagonals = 12 standard patterns
function makeStandardPatterns(card: number[]) {
  const patterns = [];
  // 5 rows: rows are positions (0,1,2,3,4), (5,6,7,8,9), etc.
  for (let row = 0; row < 5; row++) {
    const indices = [];
    // For our 24-cell card (no center), map rows:
    // Row 0: cells 0-4 (B0, I0, N0, G0, O0) → indices 0, 5, 10, 14, 19
    // Card layout: B I N G O
    //   row 0: 0  5 10 14 19
    //   row 1: 1  6 11 15 20
    //   row 2: 2  7 — 16 21    (center FREE)
    //   row 3: 3  8 12 17 22
    //   row 4: 4  9 13 18 23
    const cells = [0 + row, 5 + row, row < 2 ? 10 + row : (row > 2 ? 9 + row : -1), 14 + row, 19 + row];
    for (const c of cells) if (c >= 0) indices.push(card[c]);
    patterns.push({ id: `ROW_${row}`, requiredNumbers: indices, payoutX: 10 });
  }
  // 5 cols: B, I, N, G, O columns
  // B: 0-4, I: 5-9, N: 10-13 (only 4 cells in N), G: 14-18, O: 19-23
  patterns.push({ id: 'COL_B', requiredNumbers: [card[0], card[1], card[2], card[3], card[4]], payoutX: 10 });
  patterns.push({ id: 'COL_I', requiredNumbers: [card[5], card[6], card[7], card[8], card[9]], payoutX: 10 });
  patterns.push({ id: 'COL_N', requiredNumbers: [card[10], card[11], card[12], card[13]], payoutX: 10 });
  patterns.push({ id: 'COL_G', requiredNumbers: [card[14], card[15], card[16], card[17], card[18]], payoutX: 10 });
  patterns.push({ id: 'COL_O', requiredNumbers: [card[19], card[20], card[21], card[22], card[23]], payoutX: 10 });
  // Two diagonals (with FREE center on both)
  patterns.push({ id: 'DIAG_TL_BR', requiredNumbers: [card[0], card[6], card[17], card[23]], payoutX: 20 });
  patterns.push({ id: 'DIAG_TR_BL', requiredNumbers: [card[19], card[15], card[8], card[4]], payoutX: 20 });
  return patterns;
}

const baseCfg = (overrides: Partial<ClassIIBingoConfig> = {}): ClassIIBingoConfig => ({
  ballPoolSize: 75,
  cardNumbers: standardCard,
  patterns: makeStandardPatterns(standardCard).slice(0, 5), // 5 rows only by default
  totalBallsDrawn: 50,
  prizeMode: 'all_matches',
  ...overrides,
});

// ── Helpers ───────────────────────────────────────────────────────────────

describe('probSubsetInDraws', () => {
  it('s=0 returns 1', () => {
    expect(probSubsetInDraws(75, 0, 30)).toBe(1);
  });
  it('s > N returns 0', () => {
    expect(probSubsetInDraws(75, 80, 30)).toBe(0);
  });
  it('k < s returns 0', () => {
    expect(probSubsetInDraws(75, 5, 4)).toBe(0);
  });
  it('s=1: probability = k/N', () => {
    expect(probSubsetInDraws(75, 1, 30)).toBeCloseTo(30 / 75, 8);
  });
  it('s=5, k=5: C(70,0)/C(75,5) = 1/17259390', () => {
    expect(probSubsetInDraws(75, 5, 5)).toBeCloseTo(1 / 17259390, 12);
  });
  it('full draw k=N: probability = 1', () => {
    expect(probSubsetInDraws(75, 5, 75)).toBeCloseTo(1, 8);
  });
});

describe('expectedBallsToFirstHit', () => {
  it('s=1: E[T] = (N+1)/2', () => {
    expect(expectedBallsToFirstHit(75, 1)).toBeCloseTo(38, 8);
  });
  it('s=5: E[T] = (75+1)/6', () => {
    expect(expectedBallsToFirstHit(75, 5)).toBeCloseTo(76 / 6, 8);
  });
});

// ── Validation ─────────────────────────────────────────────────────────────

describe('validation', () => {
  it('rejects empty cardNumbers', () => {
    expect(() => solveClassIIBingo(baseCfg({ cardNumbers: [] }))).toThrow();
  });
  it('rejects cardNumber > ballPoolSize', () => {
    expect(() => solveClassIIBingo(baseCfg({ cardNumbers: [100] }))).toThrow();
  });
  it('rejects duplicate cardNumber', () => {
    expect(() => solveClassIIBingo(baseCfg({ cardNumbers: [1, 1, 2] }))).toThrow();
  });
  it('rejects pattern referencing number not on card', () => {
    expect(() =>
      solveClassIIBingo(baseCfg({
        patterns: [{ id: 'X', requiredNumbers: [99], payoutX: 10 }],
      })),
    ).toThrow();
  });
  it('rejects empty patterns', () => {
    expect(() => solveClassIIBingo(baseCfg({ patterns: [] }))).toThrow();
  });
  it('rejects duplicate pattern id', () => {
    const p = makeStandardPatterns(standardCard).slice(0, 2);
    p[1].id = p[0].id;
    expect(() => solveClassIIBingo(baseCfg({ patterns: p }))).toThrow();
  });
  it('rejects totalBallsDrawn > ballPoolSize', () => {
    expect(() => solveClassIIBingo(baseCfg({ totalBallsDrawn: 100 }))).toThrow();
  });
  it('rejects invalid prizeMode', () => {
    expect(() => solveClassIIBingo(baseCfg({ prizeMode: 'bogus' as 'first_match' }))).toThrow();
  });
});

// ── Closed-form correctness ────────────────────────────────────────────────

describe('solveClassIIBingo — structural', () => {
  it('patternResults length matches patterns', () => {
    const r = solveClassIIBingo(baseCfg());
    expect(r.patternResults.length).toBe(5);
  });
  it('every pattern hit probability ∈ [0,1]', () => {
    const r = solveClassIIBingo(baseCfg());
    for (const p of r.patternResults) {
      expect(p.hitProbability).toBeGreaterThanOrEqual(0);
      expect(p.hitProbability).toBeLessThanOrEqual(1);
    }
  });
  it('probAnyMatch ≥ max individual hit probability', () => {
    const r = solveClassIIBingo(baseCfg());
    const maxIndiv = Math.max(...r.patternResults.map((p) => p.hitProbability));
    expect(r.probAnyMatch).toBeGreaterThanOrEqual(maxIndiv - 1e-10);
  });
  it('probAnyMatch ≤ Σ individual', () => {
    const r = solveClassIIBingo(baseCfg());
    const sumIndiv = r.patternResults.reduce((a, p) => a + p.hitProbability, 0);
    expect(r.probAnyMatch).toBeLessThanOrEqual(sumIndiv + 1e-10);
  });
});

describe('solveClassIIBingo — monotonicity', () => {
  it('more balls drawn ⇒ higher hit probabilities', () => {
    const r30 = solveClassIIBingo(baseCfg({ totalBallsDrawn: 30 }));
    const r60 = solveClassIIBingo(baseCfg({ totalBallsDrawn: 60 }));
    for (let i = 0; i < r30.patternResults.length; i++) {
      expect(r60.patternResults[i].hitProbability).toBeGreaterThan(
        r30.patternResults[i].hitProbability,
      );
    }
  });
  it('k = N ⇒ all patterns hit (probability = 1)', () => {
    const r = solveClassIIBingo(baseCfg({ totalBallsDrawn: 75 }));
    for (const p of r.patternResults) expect(p.hitProbability).toBeCloseTo(1, 8);
    expect(r.probAnyMatch).toBeCloseTo(1, 8);
  });
  it('higher payout per pattern ⇒ higher E[payout]', () => {
    const lowPay = solveClassIIBingo(baseCfg({
      patterns: makeStandardPatterns(standardCard).slice(0, 5).map((p) => ({ ...p, payoutX: 10 })),
    }));
    const highPay = solveClassIIBingo(baseCfg({
      patterns: makeStandardPatterns(standardCard).slice(0, 5).map((p) => ({ ...p, payoutX: 100 })),
    }));
    expect(highPay.expectedPayoutPerGame).toBeGreaterThan(lowPay.expectedPayoutPerGame);
  });
});

describe('solveClassIIBingo — prize modes', () => {
  it('all_matches ≥ first_match expected payout', () => {
    const all = solveClassIIBingo(baseCfg({ prizeMode: 'all_matches' }));
    const first = solveClassIIBingo(baseCfg({ prizeMode: 'first_match' }));
    expect(all.expectedPayoutPerGame).toBeGreaterThanOrEqual(first.expectedPayoutPerGame - 1e-10);
  });
  it('highest_match returns valid EV', () => {
    const r = solveClassIIBingo(baseCfg({ prizeMode: 'highest_match' }));
    expect(r.expectedPayoutPerGame).toBeGreaterThan(0);
  });
});

// ── MC cross-validation ─────────────────────────────────────────────────────

describe('solveClassIIBingo — MC cross-validation', () => {
  it('hit rate matches MC at 50K games (rel ≤ 5%)', () => {
    const cfg = baseCfg();
    const cf = solveClassIIBingo(cfg);
    const mc = simulateClassIIBingo(cfg, 50_000, 0xc0ffee);
    const rel = Math.abs(cf.hitRate - mc.observedHitRate) / Math.max(cf.hitRate, 1e-9);
    expect(rel).toBeLessThan(0.05);
  });
  it('per-pattern hit probability matches MC', () => {
    const cfg = baseCfg();
    const cf = solveClassIIBingo(cfg);
    const mc = simulateClassIIBingo(cfg, 50_000, 0xbeefbabe);
    for (const p of cf.patternResults) {
      const mcHit = mc.observedPatternHits[p.id];
      const abs = Math.abs(p.hitProbability - mcHit);
      expect(abs).toBeLessThan(0.01);
    }
  });
  it('all_matches E[payout] matches MC', () => {
    const cfg = baseCfg({ prizeMode: 'all_matches' });
    const cf = solveClassIIBingo(cfg);
    const mc = simulateClassIIBingo(cfg, 50_000, 0xdecafbad);
    const rel = Math.abs(cf.expectedPayoutPerGame - mc.observedMeanPayout) / cf.expectedPayoutPerGame;
    expect(rel).toBeLessThan(0.05);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────

describe('edges', () => {
  it('single-cell pattern: hit prob = k/N', () => {
    const cfg = baseCfg({
      patterns: [{ id: 'SINGLE', requiredNumbers: [standardCard[0]], payoutX: 1 }],
      totalBallsDrawn: 30,
    });
    const r = solveClassIIBingo(cfg);
    expect(r.patternResults[0].hitProbability).toBeCloseTo(30 / 75, 8);
  });
  it('few balls drawn ⇒ rare hits', () => {
    const r = solveClassIIBingo(baseCfg({ totalBallsDrawn: 5 }));
    for (const p of r.patternResults) {
      // 5 balls for 4-5 cell patterns → very rare
      expect(p.hitProbability).toBeLessThan(0.0001);
    }
  });
  it('many patterns (12 standard 75-ball): all hit rate < 1', () => {
    const cfg = baseCfg({
      patterns: makeStandardPatterns(standardCard),
      totalBallsDrawn: 40,
    });
    const r = solveClassIIBingo(cfg);
    expect(r.probAnyMatch).toBeGreaterThan(0);
    expect(r.probAnyMatch).toBeLessThan(1);
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('identical inputs ⇒ bit-exact outputs', () => {
    const a = solveClassIIBingo(baseCfg());
    const b = solveClassIIBingo(baseCfg());
    expect(a.expectedPayoutPerGame).toBe(b.expectedPayoutPerGame);
    expect(a.hitRate).toBe(b.hitRate);
  });
  it('MC same seed ⇒ identical', () => {
    const a = simulateClassIIBingo(baseCfg(), 1000, 42);
    const b = simulateClassIIBingo(baseCfg(), 1000, 42);
    expect(a.observedMeanPayout).toBe(b.observedMeanPayout);
    expect(a.observedHitRate).toBe(b.observedHitRate);
  });
});
