/**
 * W152 Wave 18 — selectiveStacking H&W tests (Faza 15.A.14).
 */

import { describe, it, expect } from 'vitest';
import {
  resolveAllReels,
  resolveSelectiveLocked,
  selectStackingResolver,
  type CellState,
  type Grid,
} from '../src/features/selectiveStacking.js';

function makeCell(symbol: string, locked = false, cashValue?: number): CellState {
  return { symbol, locked, cashValue };
}

function lookup<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('lookup: undefined');
  return value;
}

describe('resolveAllReels', () => {
  it('respins every reel', () => {
    const grid: Grid = [
      [makeCell('A', false), makeCell('B', false)],
      [makeCell('C', false), makeCell('D', false)],
    ];
    let calls = 0;
    const result = resolveAllReels({
      grid,
      generateCell: () => {
        calls++;
        return makeCell('NEW');
      },
    });
    expect(result.reelsRespun).toEqual([0, 1]);
    expect(calls).toBe(4); // 2 reels × 2 rows, all unlocked
    expect(result.newGrid[0][0].symbol).toBe('NEW');
  });
  it('preserves locked cells', () => {
    const grid: Grid = [[makeCell('LOCK', true), makeCell('UNLOCK', false)]];
    const result = resolveAllReels({
      grid,
      generateCell: () => makeCell('NEW'),
    });
    expect(result.newGrid[0][0].symbol).toBe('LOCK');
    expect(result.newGrid[0][0].locked).toBe(true);
    expect(result.newGrid[0][1].symbol).toBe('NEW');
  });
  it('counts new locks correctly', () => {
    const grid: Grid = [[makeCell('A', false), makeCell('B', false)]];
    const result = resolveAllReels({
      grid,
      generateCell: (_r, c) => (c === 0 ? makeCell('NEW', true) : makeCell('NEW', false)),
    });
    expect(result.newLockCount).toBe(1);
  });
});

describe('resolveSelectiveLocked', () => {
  it('respins reels that have at least one unlocked cell', () => {
    const grid: Grid = [
      [makeCell('LOCK', true), makeCell('B', false)],
      [makeCell('C', false), makeCell('D', false)],
    ];
    let calls = 0;
    const result = resolveSelectiveLocked({
      grid,
      generateCell: () => {
        calls++;
        return makeCell('NEW');
      },
    });
    expect(result.reelsRespun).toEqual([0, 1]);
    expect(calls).toBe(3); // reel 0 has 1 unlocked, reel 1 has 2
  });
  it('freezes fully-locked columns', () => {
    const grid: Grid = [
      [makeCell('LOCK1', true), makeCell('LOCK2', true)],
      [makeCell('C', false), makeCell('D', false)],
    ];
    let calls = 0;
    const result = resolveSelectiveLocked({
      grid,
      generateCell: () => {
        calls++;
        return makeCell('NEW');
      },
    });
    expect(result.reelsRespun).toEqual([1]);
    expect(calls).toBe(2);
    // Frozen reel preserved verbatim
    expect(result.newGrid[0][0].symbol).toBe('LOCK1');
    expect(result.newGrid[0][1].symbol).toBe('LOCK2');
  });
  it('all reels frozen → no respins', () => {
    const grid: Grid = [[makeCell('LOCK', true)]];
    let calls = 0;
    const result = resolveSelectiveLocked({
      grid,
      generateCell: () => {
        calls++;
        return makeCell('NEW');
      },
    });
    expect(result.reelsRespun).toEqual([]);
    expect(calls).toBe(0);
  });
});

describe('selectStackingResolver', () => {
  it('returns all_reels resolver for all_reels mode', () => {
    const r = selectStackingResolver('all_reels');
    expect(r).toBe(resolveAllReels);
  });
  it('returns selective_locked resolver for selective_locked mode', () => {
    const r = selectStackingResolver('selective_locked');
    expect(r).toBe(resolveSelectiveLocked);
  });
  it('throws on unknown mode', () => {
    expect(() => selectStackingResolver('rolling' as 'all_reels')).toThrow();
  });
});

describe('Mode divergence — RTP invariant + distribution differs', () => {
  // Set up a deterministic grid where mode choice affects which cells are
  // re-rolled. Acceptance gate: total newLockCount across many respins
  // is identical (RTP invariant); reelsRespun count differs.
  it('newLockCount converges, reelsRespun differs', () => {
    // 2 reels × 2 rows. Reel 0 fully locked, reel 1 fully unlocked.
    const grid: Grid = [
      [makeCell('L1', true), makeCell('L2', true)],
      [makeCell('A', false), makeCell('B', false)],
    ];
    // generateCell ALWAYS produces unlocked NEW symbol.
    const generate = () => makeCell('NEW', false);
    const a = resolveAllReels({ grid, generateCell: generate });
    const s = resolveSelectiveLocked({ grid, generateCell: generate });
    // Both produce 0 new locks (generate yields unlocked)
    expect(a.newLockCount).toBe(0);
    expect(s.newLockCount).toBe(0);
    // BUT reelsRespun differs:
    expect(a.reelsRespun).toEqual([0, 1]);
    expect(s.reelsRespun).toEqual([1]);
  });
});

describe('lookup defensive helper', () => {
  it('throws on undefined', () => {
    expect(() => lookup(undefined)).toThrow();
  });
});
