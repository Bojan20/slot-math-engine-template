/**
 * Evaluation Tests
 *
 * Tests for grid evaluation, scatter detection, and win calculations.
 */

import { describe, it, expect } from 'vitest';
import { RNG } from '../src/engine/rng.js';
import { spin, Grid } from '../src/engine/spin.js';
import { evaluate } from '../src/engine/evaluate.js';
import { SymbolId } from '../src/model/symbols.js';

describe('Grid Evaluation', () => {
  it('should detect 3 scatters and trigger FS', () => {
    // Create a grid with exactly 3 scatters (grid is [row][reel])
    const grid: Grid = [
      [SymbolId.SCATTER_TEMPLE, SymbolId.LP_COIN, SymbolId.SCATTER_TEMPLE, SymbolId.LP_RING, SymbolId.LP_HELMET],
      [SymbolId.LP_LYRE, SymbolId.LP_COIN, SymbolId.LP_LYRE, SymbolId.LP_RING, SymbolId.LP_HELMET],
      [SymbolId.LP_LYRE, SymbolId.SCATTER_TEMPLE, SymbolId.LP_LYRE, SymbolId.LP_RING, SymbolId.LP_HELMET]
    ];

    const rng = new RNG(12345);
    const result = evaluate(grid, rng, 1);

    expect(result.scatterResult).not.toBeNull();
    expect(result.scatterResult!.count).toBe(3);
    expect(result.triggeredFS).toBe(true);
    expect(result.freeSpinsAwarded).toBe(8);
  });

  it('should detect 4 scatters correctly', () => {
    const grid: Grid = [
      [SymbolId.SCATTER_TEMPLE, SymbolId.SCATTER_TEMPLE, SymbolId.LP_LYRE, SymbolId.LP_RING, SymbolId.LP_HELMET],
      [SymbolId.LP_LYRE, SymbolId.LP_COIN, SymbolId.SCATTER_TEMPLE, SymbolId.LP_RING, SymbolId.LP_HELMET],
      [SymbolId.LP_LYRE, SymbolId.LP_COIN, SymbolId.LP_LYRE, SymbolId.SCATTER_TEMPLE, SymbolId.LP_HELMET]
    ];

    const rng = new RNG(12345);
    const result = evaluate(grid, rng, 1);

    expect(result.scatterResult!.count).toBe(4);
    expect(result.triggeredFS).toBe(true);
    expect(result.freeSpinsAwarded).toBe(12);
  });

  it('should detect 5 scatters correctly', () => {
    const grid: Grid = [
      [SymbolId.SCATTER_TEMPLE, SymbolId.SCATTER_TEMPLE, SymbolId.LP_LYRE, SymbolId.SCATTER_TEMPLE, SymbolId.LP_HELMET],
      [SymbolId.LP_LYRE, SymbolId.LP_COIN, SymbolId.SCATTER_TEMPLE, SymbolId.LP_RING, SymbolId.LP_HELMET],
      [SymbolId.LP_LYRE, SymbolId.LP_COIN, SymbolId.LP_LYRE, SymbolId.LP_RING, SymbolId.SCATTER_TEMPLE]
    ];

    const rng = new RNG(12345);
    const result = evaluate(grid, rng, 1);

    expect(result.scatterResult!.count).toBe(5);
    expect(result.triggeredFS).toBe(true);
    expect(result.freeSpinsAwarded).toBe(15);
  });

  it('should not trigger FS with 2 scatters', () => {
    const grid: Grid = [
      [SymbolId.SCATTER_TEMPLE, SymbolId.LP_COIN, SymbolId.LP_LYRE, SymbolId.LP_RING, SymbolId.LP_HELMET],
      [SymbolId.LP_LYRE, SymbolId.LP_COIN, SymbolId.LP_LYRE, SymbolId.LP_RING, SymbolId.LP_HELMET],
      [SymbolId.LP_LYRE, SymbolId.SCATTER_TEMPLE, SymbolId.LP_LYRE, SymbolId.LP_RING, SymbolId.LP_HELMET]
    ];

    const rng = new RNG(12345);
    const result = evaluate(grid, rng, 1);

    expect(result.scatterResult).toBeNull();
    expect(result.triggeredFS).toBe(false);
    expect(result.freeSpinsAwarded).toBe(0);
  });

  it('should evaluate 3-of-a-kind LP win on payline', () => {
    // Create grid with 3 Lyre on payline 0 (middle row)
    const grid: Grid = [
      [SymbolId.LP_COIN, SymbolId.LP_COIN, SymbolId.LP_COIN, SymbolId.LP_RING, SymbolId.LP_HELMET],
      [SymbolId.LP_LYRE, SymbolId.LP_LYRE, SymbolId.LP_LYRE, SymbolId.LP_RING, SymbolId.LP_HELMET],
      [SymbolId.LP_SCROLL, SymbolId.LP_SCROLL, SymbolId.LP_SCROLL, SymbolId.LP_RING, SymbolId.LP_HELMET]
    ];

    const rng = new RNG(12345);
    const result = evaluate(grid, rng, 1);

    // Should have at least one line win
    expect(result.lineWins.length).toBeGreaterThan(0);
    expect(result.lineWinTotal).toBeGreaterThan(0);
  });

  it('should evaluate 5-of-a-kind HP win (top HP symbol)', () => {
    // Create grid with 5 top HP symbols on payline 0 (middle row)
    // Other rows have no matching patterns (all different symbols)
    const grid: Grid = [
      [SymbolId.LP_COIN, SymbolId.LP_LYRE, SymbolId.LP_HELMET, SymbolId.LP_SCROLL, SymbolId.LP_RING],
      [SymbolId.HP_ZEUS, SymbolId.HP_ZEUS, SymbolId.HP_ZEUS, SymbolId.HP_ZEUS, SymbolId.HP_ZEUS],
      [SymbolId.LP_LYRE, SymbolId.LP_COIN, SymbolId.LP_SCROLL, SymbolId.LP_RING, SymbolId.LP_HELMET]
    ];

    const rng = new RNG(12345);
    const result = evaluate(grid, rng, 1);

    // Should have top HP 5-of-a-kind win (63x per paytable)
    expect(result.lineWinTotal).toBe(63);
    expect(result.lineWins.some(w => w.symbol === SymbolId.HP_ZEUS && w.count === 5)).toBe(true);
  });

  it('should substitute wild for line win', () => {
    // Create grid with Wild substituting in HP symbol line
    const grid: Grid = [
      [SymbolId.LP_COIN, SymbolId.LP_COIN, SymbolId.LP_COIN, SymbolId.LP_RING, SymbolId.LP_HELMET],
      [SymbolId.HP_ZEUS, SymbolId.WILD_SHIELD, SymbolId.HP_ZEUS, SymbolId.WILD_SHIELD, SymbolId.HP_ZEUS],
      [SymbolId.LP_SCROLL, SymbolId.LP_SCROLL, SymbolId.LP_SCROLL, SymbolId.LP_RING, SymbolId.LP_HELMET]
    ];

    const rng = new RNG(12345);
    const result = evaluate(grid, rng, 1);

    // Should count as 5 top HP (25x)
    expect(result.lineWins.some(w => w.symbol === SymbolId.HP_ZEUS && w.count === 5)).toBe(true);
  });

  it('should count all-wild line as wilds paying as top symbol', () => {
    // All wilds on payline 0 (middle row)
    const grid: Grid = [
      [SymbolId.HP_ZEUS, SymbolId.HP_HADES, SymbolId.HP_POSEIDON, SymbolId.LP_LYRE, SymbolId.LP_COIN],
      [SymbolId.WILD_SHIELD, SymbolId.WILD_SHIELD, SymbolId.WILD_SHIELD, SymbolId.WILD_SHIELD, SymbolId.WILD_SHIELD],
      [SymbolId.LP_SCROLL, SymbolId.LP_RING, SymbolId.LP_HELMET, SymbolId.HP_ZEUS, SymbolId.HP_HADES]
    ];

    const rng = new RNG(12345);
    const result = evaluate(grid, rng, 1);

    // Wild pays as top symbol - may have additional wins from wild substitution on other paylines
    expect(result.lineWinTotal).toBeGreaterThanOrEqual(25);
    // Verify we have a 5-of-a-kind wild line
    expect(result.lineWins.some(w => w.count === 5)).toBe(true);
  });

  it('should detect special symbols (Lightning Orbs) for H&W trigger', () => {
    // 6 Lightning Orbs should trigger H&W
    const grid: Grid = [
      [SymbolId.LIGHTNING_ORB, SymbolId.LIGHTNING_ORB, SymbolId.LP_COIN, SymbolId.LP_RING, SymbolId.LP_HELMET],
      [SymbolId.LIGHTNING_ORB, SymbolId.LIGHTNING_ORB, SymbolId.LP_LYRE, SymbolId.LP_RING, SymbolId.LP_HELMET],
      [SymbolId.LIGHTNING_ORB, SymbolId.LIGHTNING_ORB, SymbolId.LP_LYRE, SymbolId.LP_RING, SymbolId.LP_HELMET]
    ];

    const rng = new RNG(12345);
    const result = evaluate(grid, rng, 1);

    expect(result.specialSymbolResult).not.toBeNull();
    expect(result.specialSymbolResult!.count).toBe(6);
    expect(result.triggeredHnW).toBe(true);
  });

  it('should handle grid with no wins', () => {
    // Grid carefully constructed so no payline has 3+ matching symbols
    // Each position in first 3 reels has different symbol to prevent any 3-of-a-kind
    const grid: Grid = [
      [SymbolId.HP_ZEUS, SymbolId.HP_HADES, SymbolId.HP_POSEIDON, SymbolId.LP_LYRE, SymbolId.LP_COIN],
      [SymbolId.LP_LYRE, SymbolId.LP_COIN, SymbolId.LP_HELMET, SymbolId.HP_ZEUS, SymbolId.HP_HADES],
      [SymbolId.LP_SCROLL, SymbolId.LP_RING, SymbolId.HP_ZEUS, SymbolId.LP_HELMET, SymbolId.LP_RING]
    ];

    const rng = new RNG(12345);
    const result = evaluate(grid, rng, 1);

    expect(result.lineWinTotal).toBe(0);
    expect(result.scatterWin).toBe(0);
    expect(result.totalWin).toBe(0);
  });

  it('should apply FS global multiplier', () => {
    // Top HP line with FS global multiplier
    // Other rows have no matching patterns
    const grid: Grid = [
      [SymbolId.LP_COIN, SymbolId.LP_LYRE, SymbolId.LP_HELMET, SymbolId.LP_SCROLL, SymbolId.LP_RING],
      [SymbolId.HP_ZEUS, SymbolId.HP_ZEUS, SymbolId.HP_ZEUS, SymbolId.HP_ZEUS, SymbolId.HP_ZEUS],
      [SymbolId.LP_LYRE, SymbolId.LP_COIN, SymbolId.LP_SCROLL, SymbolId.LP_RING, SymbolId.LP_HELMET]
    ];

    const rng = new RNG(12345);
    const result = evaluate(grid, rng, 3); // 3x FS global multiplier

    // Base win is 63x, with 3x multiplier = 189x
    expect(result.totalWin).toBe(189);
  });
});

describe('Spin Generation', () => {
  it('should generate valid 5x3 grid', () => {
    const rng = new RNG(12345);
    const result = spin(rng, false);

    expect(result.grid.length).toBe(3); // 3 rows
    expect(result.grid[0].length).toBe(5); // 5 reels
    expect(result.stopPositions.length).toBe(5);
  });

  it('should be deterministic with same seed', () => {
    const rng1 = new RNG(12345);
    const rng2 = new RNG(12345);

    const result1 = spin(rng1, false);
    const result2 = spin(rng2, false);

    expect(result1.grid).toEqual(result2.grid);
    expect(result1.stopPositions).toEqual(result2.stopPositions);
  });
});
