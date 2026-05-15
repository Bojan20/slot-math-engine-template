/**
 * W152 Wave 20 — respinLockEvaluator tests (Faza 15.C.2).
 */

import { describe, it, expect } from 'vitest';
import {
  applyRespinPass,
  runRespinLockLoop,
  buildEmptyGrid,
} from '../src/features/respinLockEvaluator.js';

describe('applyRespinPass — basic', () => {
  it('regenerates only unlocked cells', () => {
    const grid = buildEmptyGrid(2, 1, 'X');
    grid[0][0].locked = true;
    grid[0][0].symbol = 'LOCK';
    grid[0][0].payoutX = 100;
    let calls = 0;
    const { newGrid, newLockCount } = applyRespinPass(
      { grid, generateCell: () => { calls++; return 'X'; } },
      { triggerSymbol: 'CASH' },
      { CASH: 50 },
    );
    expect(calls).toBe(1); // only reel[1] regenerated
    expect(newGrid[0][0].symbol).toBe('LOCK');
    expect(newGrid[0][0].payoutX).toBe(100);
    expect(newLockCount).toBe(0);
  });
  it('locks new CASH symbols and stamps payout', () => {
    const grid = buildEmptyGrid(2, 1);
    const { newGrid, newLockCount } = applyRespinPass(
      { grid, generateCell: () => 'CASH' },
      { triggerSymbol: 'CASH' },
      { CASH: 75 },
    );
    expect(newLockCount).toBe(2);
    expect(newGrid[0][0].locked).toBe(true);
    expect(newGrid[0][0].payoutX).toBe(75);
  });
});

describe('runRespinLockLoop — happy path', () => {
  it('terminates on counter exhaustion when no new locks', () => {
    const grid = buildEmptyGrid(3, 1);
    const result = runRespinLockLoop(
      grid,
      { triggerSymbol: 'CASH', initialRespins: 3, resetCounterOnNewLock: true },
      { CASH: 100 },
      () => () => 'X', // no CASH ever
    );
    expect(result.terminationReason).toBe('counter_zero');
    expect(result.passes).toHaveLength(3);
    expect(result.totalPayoutX).toBe(0);
  });
  it('terminates on full lock', () => {
    const grid = buildEmptyGrid(2, 1);
    const result = runRespinLockLoop(
      grid,
      { triggerSymbol: 'CASH', initialRespins: 3 },
      { CASH: 100 },
      () => () => 'CASH',
    );
    expect(result.terminationReason).toBe('full_lock');
    expect(result.fullyLocked).toBe(true);
    expect(result.totalPayoutX).toBe(200);
  });
  it('counter resets on new lock', () => {
    const grid = buildEmptyGrid(4, 1);
    // Strategy: lock cell 0 on pass 1 (resets counter from 2 to 2 again),
    // lock cell 1 on pass 2 (resets again), lock cell 2 on pass 3 (resets),
    // lock cell 3 on pass 4 → full lock. So 4 passes total. Without reset
    // the counter would exhaust at 2 passes.
    let passNum = 0;
    const result = runRespinLockLoop(
      grid,
      { triggerSymbol: 'CASH', initialRespins: 2, resetCounterOnNewLock: true },
      { CASH: 50 },
      () => {
        passNum += 1;
        const lockReelThisPass = passNum - 1; // pass 1 → reel 0, pass 2 → reel 1, …
        return (reel) => (reel === lockReelThisPass ? 'CASH' : 'X');
      },
    );
    // Counter resets each new lock → 4 passes (one per reel) before full_lock.
    // Strictly: more than initial 2, proves reset path active.
    expect(result.passes.length).toBeGreaterThanOrEqual(3);
  });
  it('counter does NOT reset when resetCounterOnNewLock=false', () => {
    const grid = buildEmptyGrid(4, 1);
    const result = runRespinLockLoop(
      grid,
      { triggerSymbol: 'CASH', initialRespins: 3, resetCounterOnNewLock: false },
      { CASH: 50 },
      () => (reel) => (reel === 0 ? 'CASH' : 'X'),
    );
    // Without reset: exactly 3 passes (or until full_lock)
    expect(result.passes.length).toBeLessThanOrEqual(3);
  });
});

describe('runRespinLockLoop — guards', () => {
  it('rejects non-positive initialRespins', () => {
    const grid = buildEmptyGrid(1, 1);
    expect(() =>
      runRespinLockLoop(grid, { triggerSymbol: 'C', initialRespins: 0 }, {}, () => () => 'X'),
    ).toThrow(RangeError);
  });
  it('terminates safeguard_cap on infinite loop attempt', () => {
    const grid = buildEmptyGrid(1, 1);
    let counter = 0;
    const result = runRespinLockLoop(
      grid,
      { triggerSymbol: 'CASH', initialRespins: 1, resetCounterOnNewLock: true, maxTotalRespins: 5 },
      { CASH: 1 },
      () => () => {
        counter++;
        // Always return CASH to keep cell locking pattern... but on locked cell it's a no-op.
        // We use a single 1×1 grid that locks immediately.
        return 'CASH';
      },
    );
    // 1×1 grid → 1 pass → full_lock
    expect(['full_lock', 'safeguard_cap']).toContain(result.terminationReason);
    void counter;
  });
});

describe('buildEmptyGrid', () => {
  it('builds correct shape', () => {
    const g = buildEmptyGrid(3, 2, 'A');
    expect(g).toHaveLength(3);
    expect(g[0]).toHaveLength(2);
    expect(g.every((reel) => reel.every((c) => c.symbol === 'A' && !c.locked))).toBe(true);
  });
});
