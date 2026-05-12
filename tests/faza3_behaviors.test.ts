/**
 * Faza 3 — Symbol Behavior Plugin Layer: Test Suite (TypeScript)
 *
 * ## Coverage
 *
 * | Group | Description                                          | Tests |
 * |-------|------------------------------------------------------|-------|
 * | BHVR-01 | Effect pipeline — applyEffect / applyEffects       |  18   |
 * | BHVR-02 | WildBehavior                                        |   4   |
 * | BHVR-03 | ExpandingWildBehavior                               |   6   |
 * | BHVR-04 | StickyWildBehavior                                  |   7   |
 * | BHVR-05 | WalkingWildBehavior                                 |   8   |
 * | BHVR-06 | MultiplierWildBehavior                              |   7   |
 * | BHVR-07 | ScatterBehavior                                     |   8   |
 * | BHVR-08 | MysteryBehavior                                     |   7   |
 * | BHVR-09 | CoinBehavior                                        |   7   |
 * | BHVR-10 | MultiplierSymbolBehavior                            |   6   |
 * | BHVR-11 | TransformBehavior                                   |   8   |
 * | BHVR-12 | JackpotBehavior                                     |   7   |
 * | BHVR-13 | BehaviorRegistry                                    |   7   |
 * | BHVR-14 | BehaviorPipeline integration                        |   6   |
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createSpinState,
  applyEffect,
  applyEffects,
  tickLockedPositions,
  restoreLockedPositions,
  BehaviorPipeline,
  BehaviorRegistry,
  WildBehavior,
  ExpandingWildBehavior,
  StickyWildBehavior,
  WalkingWildBehavior,
  MultiplierWildBehavior,
  ScatterBehavior,
  MysteryBehavior,
  CoinBehavior,
  MultiplierSymbolBehavior,
  TransformBehavior,
  JackpotBehavior,
} from '../src/behaviors/index.js';
import type { Effect, SpinState, BehaviorContext } from '../src/behaviors/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGrid(reels: number, rows: number, fill = 'L1'): string[][] {
  return Array.from({ length: reels }, () => Array(rows).fill(fill));
}

function makeState(grid?: string[][]): SpinState {
  return createSpinState(grid ?? makeGrid(5, 3));
}

function makeCtx(
  symbolId: string,
  reel: number,
  row: number,
  state?: SpinState
): BehaviorContext {
  const s = state ?? makeState();
  return { symbolId, reel, row, state: s, config: {}, grid: s.grid };
}

// ─── BHVR-01: Effect pipeline ─────────────────────────────────────────────────

describe('BHVR-01: Effect pipeline', () => {
  it('noop has no effect', () => {
    const s = makeState();
    applyEffect(s, { kind: 'noop' });
    expect(s.spinMultiplier).toBe(1);
    expect(s.lineMultiplier).toBe(1);
  });

  it('multiplier_add(2, spin) → spinMultiplier = 2', () => {
    const s = makeState();
    applyEffect(s, { kind: 'multiplier_add', value: 2, scope: 'spin' });
    expect(s.spinMultiplier).toBe(2);
  });

  it('multiplier_add(2, spin) × 2 → spinMultiplier = 3 (additive)', () => {
    const s = makeState();
    applyEffect(s, { kind: 'multiplier_add', value: 2, scope: 'spin' });
    applyEffect(s, { kind: 'multiplier_add', value: 2, scope: 'spin' });
    expect(s.spinMultiplier).toBe(3);
  });

  it('multiplier_mul(2, spin) × 2 → spinMultiplier = 4 (multiplicative)', () => {
    const s = makeState();
    applyEffect(s, { kind: 'multiplier_mul', value: 2, scope: 'spin' });
    applyEffect(s, { kind: 'multiplier_mul', value: 2, scope: 'spin' });
    expect(s.spinMultiplier).toBe(4);
  });

  it('multiplier_add(2, line) → lineMultiplier = 2', () => {
    const s = makeState();
    applyEffect(s, { kind: 'multiplier_add', value: 2, scope: 'line' });
    expect(s.lineMultiplier).toBe(2);
    expect(s.spinMultiplier).toBe(1);
  });

  it('multiplier_mul(3, session) → sessionMultiplier = 3', () => {
    const s = makeState();
    applyEffect(s, { kind: 'multiplier_mul', value: 3, scope: 'session' });
    expect(s.sessionMultiplier).toBe(3);
  });

  it('transform_symbol replaces correct cell', () => {
    const grid = makeGrid(5, 3, 'L1');
    const s = createSpinState(grid);
    applyEffect(s, { kind: 'transform_symbol', reel: 2, row: 1, toSymbol: 'H1' });
    expect(s.grid[2]![1]).toBe('H1');
    expect(s.grid[2]![0]).toBe('L1');
  });

  it('expand_wild fills entire reel', () => {
    const s = makeState();
    applyEffect(s, { kind: 'expand_wild', reel: 1, symbol: 'W' });
    expect(s.grid[1]).toEqual(['W', 'W', 'W']);
    expect(s.grid[0]![0]).toBe('L1'); // neighbor unaffected
  });

  it('lock_position adds to lockedPositions', () => {
    const s = makeState();
    applyEffect(s, { kind: 'lock_position', reel: 0, row: 0, remainingSpins: 3 });
    expect(s.lockedPositions).toHaveLength(1);
    expect(s.lockedPositions[0]!.remainingSpins).toBe(3);
  });

  it('lock_position upsert keeps max remaining', () => {
    const s = makeState();
    applyEffect(s, { kind: 'lock_position', reel: 0, row: 0, remainingSpins: 3 });
    applyEffect(s, { kind: 'lock_position', reel: 0, row: 0, remainingSpins: 5 });
    applyEffect(s, { kind: 'lock_position', reel: 0, row: 0, remainingSpins: 2 });
    expect(s.lockedPositions).toHaveLength(1);
    expect(s.lockedPositions[0]!.remainingSpins).toBe(5);
  });

  it('add_wild places symbol at grid cell', () => {
    const s = makeState();
    applyEffect(s, { kind: 'add_wild', reel: 3, row: 2, symbol: 'EW' });
    expect(s.grid[3]![2]).toBe('EW');
  });

  it('collect_coin appends to collectedCoins', () => {
    const s = makeState();
    applyEffect(s, { kind: 'collect_coin', reel: 1, row: 0, amount: 42 });
    expect(s.collectedCoins).toHaveLength(1);
    expect(s.collectedCoins[0]!.amount).toBe(42);
  });

  it('trigger_feature adds to triggeredFeatures set', () => {
    const s = makeState();
    applyEffect(s, { kind: 'trigger_feature', featureId: 'free_spins' });
    applyEffect(s, { kind: 'trigger_feature', featureId: 'free_spins' }); // deduped
    expect(s.triggeredFeatures.size).toBe(1);
    expect(s.triggeredFeatures.has('free_spins')).toBe(true);
  });

  it('award_jackpot sets jackpotAwarded once', () => {
    const s = makeState();
    applyEffect(s, { kind: 'award_jackpot', tier: 'grand', amount: 1000 });
    applyEffect(s, { kind: 'award_jackpot', tier: 'minor', amount: 100 }); // ignored
    expect(s.jackpotAwarded?.tier).toBe('grand');
    expect(s.jackpotAwarded?.amount).toBe(1000);
  });

  it('upgrade_symbols replaces all matching cells', () => {
    const grid = [['L1', 'L1', 'H1'], ['L1', 'L1', 'L1'], ['H1', 'H1', 'H1'],
      ['L1', 'L1', 'L1'], ['L1', 'H1', 'L1']];
    const s = createSpinState(grid);
    applyEffect(s, { kind: 'upgrade_symbols', fromSymbol: 'L1', toSymbol: 'H1' });
    // All L1 → H1
    for (const col of s.grid) {
      for (const cell of col) {
        expect(cell).toBe('H1');
      }
    }
  });

  it('scatter_pay accumulates multiplier into scatterPayout', () => {
    const s = makeState();
    applyEffect(s, { kind: 'scatter_pay', count: 3, multiplier: 5 });
    applyEffect(s, { kind: 'scatter_pay', count: 4, multiplier: 10 });
    expect(s.scatterPayout).toBe(15);
  });

  it('respin increments respinsAwarded', () => {
    const s = makeState();
    applyEffect(s, { kind: 'respin', count: 3 });
    applyEffect(s, { kind: 'respin', count: 1 });
    expect(s.respinsAwarded).toBe(4);
  });

  it('applyEffects applies batch in order', () => {
    const s = makeState();
    const effects: Effect[] = [
      { kind: 'multiplier_mul', value: 2, scope: 'spin' },
      { kind: 'multiplier_mul', value: 3, scope: 'spin' },
      { kind: 'multiplier_mul', value: 5, scope: 'spin' },
    ];
    applyEffects(s, effects);
    expect(s.spinMultiplier).toBe(30);
  });
});

// ─── BHVR-01b: tickLockedPositions + restoreLockedPositions ──────────────────

describe('BHVR-01b: locked position helpers', () => {
  it('tickLockedPositions decrements remainingSpins', () => {
    const s = makeState();
    applyEffect(s, { kind: 'lock_position', reel: 0, row: 0, remainingSpins: 2 });
    tickLockedPositions(s);
    expect(s.lockedPositions[0]!.remainingSpins).toBe(1);
  });

  it('tickLockedPositions removes positions reaching 0', () => {
    const s = makeState();
    applyEffect(s, { kind: 'lock_position', reel: 0, row: 0, remainingSpins: 1 });
    const released = tickLockedPositions(s);
    expect(s.lockedPositions).toHaveLength(0);
    expect(released).toHaveLength(1);
  });

  it('restoreLockedPositions overwrites grid cells with locked symbol', () => {
    const grid = makeGrid(5, 3, 'L1');
    const s = createSpinState(grid);
    s.grid[2]![1] = 'W';
    applyEffect(s, { kind: 'lock_position', reel: 2, row: 1, remainingSpins: 3 });
    // Simulate next spin: new symbol drawn
    s.grid[2]![1] = 'H1';
    restoreLockedPositions(s);
    expect(s.grid[2]![1]).toBe('W'); // restored
  });
});

// ─── BHVR-02: WildBehavior ────────────────────────────────────────────────────

describe('BHVR-02: WildBehavior', () => {
  it('onLand returns empty effects', () => {
    const b = new WildBehavior('W');
    expect(b.onLand(makeCtx('W', 2, 1))).toEqual([]);
  });

  it('onWin returns empty effects', () => {
    const b = new WildBehavior('W');
    expect(b.onWin(makeCtx('W', 2, 1))).toEqual([]);
  });

  it('id matches constructor arg', () => {
    const b = new WildBehavior('WLD');
    expect(b.id).toBe('WLD');
  });

  it('kind is WildBehavior', () => {
    expect(new WildBehavior('W').kind).toBe('WildBehavior');
  });
});

// ─── BHVR-03: ExpandingWildBehavior ──────────────────────────────────────────

describe('BHVR-03: ExpandingWildBehavior', () => {
  it('onLand emits expand_wild at correct reel', () => {
    const b = new ExpandingWildBehavior('EW');
    const effects = b.onLand(makeCtx('EW', 3, 1));
    expect(effects).toEqual([{ kind: 'expand_wild', reel: 3, symbol: 'EW' }]);
  });

  it('onWin returns [] when onWinOnly=false', () => {
    const b = new ExpandingWildBehavior('EW');
    expect(b.onWin(makeCtx('EW', 3, 1))).toEqual([]);
  });

  it('onLand returns [] when onWinOnly=true', () => {
    const b = new ExpandingWildBehavior('EW', { onWinOnly: true });
    expect(b.onLand(makeCtx('EW', 3, 1))).toEqual([]);
  });

  it('onWin emits expand_wild when onWinOnly=true', () => {
    const b = new ExpandingWildBehavior('EW', { onWinOnly: true });
    const effects = b.onWin(makeCtx('EW', 2, 0));
    expect(effects).toEqual([{ kind: 'expand_wild', reel: 2, symbol: 'EW' }]);
  });

  it('applying expand_wild fills the entire reel', () => {
    const s = makeState();
    const b = new ExpandingWildBehavior('EW');
    const effects = b.onLand(makeCtx('EW', 1, 2, s));
    applyEffects(s, effects);
    expect(s.grid[1]).toEqual(['EW', 'EW', 'EW']);
  });

  it('kind is ExpandingWildBehavior', () => {
    expect(new ExpandingWildBehavior('EW').kind).toBe('ExpandingWildBehavior');
  });
});

// ─── BHVR-04: StickyWildBehavior ─────────────────────────────────────────────

describe('BHVR-04: StickyWildBehavior', () => {
  it('onLand emits lock_position with default duration 3', () => {
    const b = new StickyWildBehavior('SW');
    const effects = b.onLand(makeCtx('SW', 2, 1));
    expect(effects).toEqual([{ kind: 'lock_position', reel: 2, row: 1, remainingSpins: 3 }]);
  });

  it('onLand emits lock_position with custom duration', () => {
    const b = new StickyWildBehavior('SW', { duration: 5 });
    const effects = b.onLand(makeCtx('SW', 0, 0));
    expect(effects[0]!.kind === 'lock_position' && effects[0].remainingSpins).toBe(5);
  });

  it('onWin returns [] when upgradeOnWin=false', () => {
    const b = new StickyWildBehavior('SW');
    expect(b.onWin(makeCtx('SW', 0, 0))).toEqual([]);
  });

  it('onWin extends lock when upgradeOnWin=true and position locked', () => {
    const s = makeState();
    applyEffect(s, { kind: 'lock_position', reel: 0, row: 0, remainingSpins: 2 });
    const b = new StickyWildBehavior('SW', { upgradeOnWin: true });
    const ctx = makeCtx('SW', 0, 0, s);
    const effects = b.onWin(ctx);
    expect(effects).toHaveLength(1);
    expect(effects[0]!.kind === 'lock_position' && effects[0].remainingSpins).toBe(3);
  });

  it('onWin returns [] when position not locked (upgradeOnWin=true)', () => {
    const b = new StickyWildBehavior('SW', { upgradeOnWin: true });
    expect(b.onWin(makeCtx('SW', 0, 0))).toEqual([]);
  });

  it('sticky wild persists across spins via tickLockedPositions', () => {
    const s = makeState();
    const b = new StickyWildBehavior('SW', { duration: 2 });
    applyEffects(s, b.onLand(makeCtx('SW', 1, 1, s)));
    expect(s.lockedPositions[0]!.remainingSpins).toBe(2);
    tickLockedPositions(s);
    expect(s.lockedPositions[0]!.remainingSpins).toBe(1);
    tickLockedPositions(s);
    expect(s.lockedPositions).toHaveLength(0);
  });

  it('kind is StickyWildBehavior', () => {
    expect(new StickyWildBehavior('SW').kind).toBe('StickyWildBehavior');
  });
});

// ─── BHVR-05: WalkingWildBehavior ─────────────────────────────────────────────

describe('BHVR-05: WalkingWildBehavior', () => {
  it('onLand emits lock_position with sentinel (9999)', () => {
    const b = new WalkingWildBehavior('WW', { reels: 5, rows: 3 });
    const effects = b.onLand(makeCtx('WW', 2, 1));
    const lock = effects.find(e => e.kind === 'lock_position');
    expect(lock).toBeTruthy();
    expect(lock!.kind === 'lock_position' && lock.remainingSpins).toBe(9999);
  });

  it('onSpinEnd emits add_wild at next position (left direction)', () => {
    const b = new WalkingWildBehavior('WW', { direction: 'left', reels: 5, rows: 3 });
    const s = makeState();
    const effects = b.onSpinEnd(makeCtx('WW', 3, 1, s));
    const addWild = effects.find(e => e.kind === 'add_wild');
    expect(addWild).toBeTruthy();
    expect(addWild!.kind === 'add_wild' && addWild.reel).toBe(2);
    expect(addWild!.kind === 'add_wild' && addWild.row).toBe(1);
  });

  it('onSpinEnd emits add_wild at correct position (right direction)', () => {
    const b = new WalkingWildBehavior('WW', { direction: 'right', reels: 5, rows: 3 });
    const s = makeState();
    const effects = b.onSpinEnd(makeCtx('WW', 2, 1, s));
    const aw = effects.find(e => e.kind === 'add_wild');
    expect(aw!.kind === 'add_wild' && aw.reel).toBe(3);
  });

  it('onSpinEnd disappears at edge when disappearsOnEdge=true', () => {
    const b = new WalkingWildBehavior('WW', { direction: 'left', reels: 5, rows: 3, disappearsOnEdge: true });
    const s = makeState();
    // Wild at reel 0 — would walk off left
    const effects = b.onSpinEnd(makeCtx('WW', 0, 1, s));
    expect(effects.find(e => e.kind === 'add_wild')).toBeUndefined();
  });

  it('onSpinEnd bounces at edge when disappearsOnEdge=false', () => {
    const b = new WalkingWildBehavior('WW', { direction: 'left', reels: 5, rows: 3, disappearsOnEdge: false });
    const s = makeState();
    const effects = b.onSpinEnd(makeCtx('WW', 0, 1, s));
    const aw = effects.find(e => e.kind === 'add_wild');
    expect(aw).toBeTruthy();
    expect(aw!.kind === 'add_wild' && aw.reel).toBe(1); // bounced right
  });

  it('onWin returns []', () => {
    const b = new WalkingWildBehavior('WW', { reels: 5, rows: 3 });
    expect(b.onWin(makeCtx('WW', 2, 1))).toEqual([]);
  });

  it('upward direction works correctly', () => {
    const b = new WalkingWildBehavior('WW', { direction: 'up', reels: 5, rows: 3 });
    const s = makeState();
    const effects = b.onSpinEnd(makeCtx('WW', 2, 2, s));
    const aw = effects.find(e => e.kind === 'add_wild');
    expect(aw!.kind === 'add_wild' && aw.row).toBe(1);
  });

  it('kind is WalkingWildBehavior', () => {
    expect(new WalkingWildBehavior('WW').kind).toBe('WalkingWildBehavior');
  });
});

// ─── BHVR-06: MultiplierWildBehavior ─────────────────────────────────────────

describe('BHVR-06: MultiplierWildBehavior', () => {
  it('onLand returns []', () => {
    const b = new MultiplierWildBehavior('MW');
    expect(b.onLand(makeCtx('MW', 0, 0))).toEqual([]);
  });

  it('onWin emits multiplier_mul(2, line) by default', () => {
    const b = new MultiplierWildBehavior('MW');
    const effects = b.onWin(makeCtx('MW', 0, 0));
    expect(effects).toEqual([{ kind: 'multiplier_mul', value: 2, scope: 'line' }]);
  });

  it('onWin with value=3 emits multiplier_mul(3)', () => {
    const b = new MultiplierWildBehavior('MW', { value: 3 });
    const effects = b.onWin(makeCtx('MW', 0, 0));
    expect(effects[0]!.kind === 'multiplier_mul' && effects[0].value).toBe(3);
  });

  it('mode=add emits multiplier_add', () => {
    const b = new MultiplierWildBehavior('MW', { mode: 'add', value: 2 });
    const effects = b.onWin(makeCtx('MW', 0, 0));
    expect(effects[0]!.kind).toBe('multiplier_add');
  });

  it('scope=spin applies to spin accumulator', () => {
    const s = makeState();
    const b = new MultiplierWildBehavior('MW', { scope: 'spin' });
    applyEffects(s, b.onWin(makeCtx('MW', 0, 0, s)));
    expect(s.spinMultiplier).toBe(2);
  });

  it('two ×2 mul wilds on same line → ×4 total', () => {
    const s = makeState();
    const b = new MultiplierWildBehavior('MW', { value: 2, scope: 'spin' });
    applyEffects(s, b.onWin(makeCtx('MW', 0, 0, s)));
    applyEffects(s, b.onWin(makeCtx('MW', 1, 0, s)));
    expect(s.spinMultiplier).toBe(4);
  });

  it('kind is MultiplierWildBehavior', () => {
    expect(new MultiplierWildBehavior('MW').kind).toBe('MultiplierWildBehavior');
  });
});

// ─── BHVR-07: ScatterBehavior ─────────────────────────────────────────────────

describe('BHVR-07: ScatterBehavior', () => {
  it('onLand returns [] when below threshold', () => {
    const b = new ScatterBehavior('SC', { triggerCount: 3 });
    const s = makeState(); // all L1, no scatters
    expect(b.onLand(makeCtx('SC', 0, 0, s))).toEqual([]);
  });

  it('onLand emits trigger_feature when threshold met', () => {
    const grid = makeGrid(5, 3, 'L1');
    grid[0]![0] = 'SC'; grid[1]![0] = 'SC'; grid[2]![0] = 'SC';
    const s = createSpinState(grid);
    const b = new ScatterBehavior('SC', { triggerCount: 3, featureId: 'free_spins' });
    const effects = b.onLand(makeCtx('SC', 0, 0, s));
    expect(effects.some(e => e.kind === 'trigger_feature')).toBe(true);
  });

  it('emits scatter_pay when count matches pay table', () => {
    const grid = makeGrid(5, 3, 'L1');
    grid[0]![0] = 'SC'; grid[1]![0] = 'SC'; grid[2]![0] = 'SC';
    const s = createSpinState(grid);
    const b = new ScatterBehavior('SC', {
      triggerCount: 3,
      scatterPays: { '3': 2, '4': 10 }
    });
    const effects = b.onLand(makeCtx('SC', 0, 0, s));
    const pay = effects.find(e => e.kind === 'scatter_pay');
    expect(pay).toBeTruthy();
    expect(pay!.kind === 'scatter_pay' && pay.multiplier).toBe(2);
  });

  it('onWin returns []', () => {
    const b = new ScatterBehavior('SC');
    expect(b.onWin(makeCtx('SC', 0, 0))).toEqual([]);
  });

  it('exactly 3 scatters trigger; 2 do not', () => {
    for (const count of [2, 3, 4, 5] as const) {
      const grid = makeGrid(5, 3, 'L1');
      for (let i = 0; i < count; i++) {
        grid[i]![0] = 'SC';
      }
      const s = createSpinState(grid);
      const b = new ScatterBehavior('SC', { triggerCount: 3 });
      const effects = b.onLand(makeCtx('SC', 0, 0, s));
      const triggered = effects.some(e => e.kind === 'trigger_feature');
      expect(triggered).toBe(count >= 3);
    }
  });

  it('trigger_feature only once even with multiple scatter lands', () => {
    // Simulates all 3 scatters calling onLand — dedup via Set in pipeline
    const grid = makeGrid(5, 3, 'L1');
    grid[0]![0] = 'SC'; grid[1]![0] = 'SC'; grid[2]![0] = 'SC';
    const s = createSpinState(grid);
    const b = new ScatterBehavior('SC', { triggerCount: 3 });
    for (let i = 0; i < 3; i++) {
      applyEffects(s, b.onLand(makeCtx('SC', i, 0, s)));
    }
    // triggeredFeatures is a Set — only 1 entry
    expect(s.triggeredFeatures.size).toBe(1);
  });

  it('custom featureId is used', () => {
    const grid = makeGrid(5, 3, 'SC');
    const s = createSpinState(grid);
    const b = new ScatterBehavior('SC', { triggerCount: 3, featureId: 'bonus_round' });
    const effects = b.onLand(makeCtx('SC', 0, 0, s));
    const ft = effects.find(e => e.kind === 'trigger_feature');
    expect(ft!.kind === 'trigger_feature' && ft.featureId).toBe('bonus_round');
  });

  it('kind is ScatterBehavior', () => {
    expect(new ScatterBehavior('SC').kind).toBe('ScatterBehavior');
  });
});

// ─── BHVR-08: MysteryBehavior ─────────────────────────────────────────────────

describe('BHVR-08: MysteryBehavior', () => {
  it('onLand returns [] when no mystery symbols on grid', () => {
    const s = makeState(); // all L1
    const b = new MysteryBehavior('MY', { revealDistribution: { H1: 1 } });
    expect(b.onLand(makeCtx('MY', 0, 0, s))).toEqual([]);
  });

  it('onLand emits transform_symbol for each mystery position', () => {
    const grid = makeGrid(5, 3, 'L1');
    grid[0]![0] = 'MY'; grid[2]![1] = 'MY';
    const s = createSpinState(grid);
    const b = new MysteryBehavior('MY', { revealDistribution: { H1: 1 } });
    const effects = b.onLand(makeCtx('MY', 0, 0, s));
    expect(effects.filter(e => e.kind === 'transform_symbol')).toHaveLength(2);
  });

  it('all transforms use same toSymbol (group reveal)', () => {
    const grid = makeGrid(5, 3, 'MY');
    const s = createSpinState(grid);
    const b = new MysteryBehavior('MY', { revealDistribution: { H1: 1 } });
    const effects = b.onLand(makeCtx('MY', 0, 0, s));
    const symbols = new Set(
      effects
        .filter((e): e is Extract<Effect, {kind: 'transform_symbol'}> => e.kind === 'transform_symbol')
        .map(e => e.toSymbol)
    );
    expect(symbols.size).toBe(1);
  });

  it('drawForT(0) returns first symbol', () => {
    const b = new MysteryBehavior('MY', { revealDistribution: { A: 10, B: 10 } });
    expect(b.drawForT(0)).toBe('A');
  });

  it('drawForT(0.99) returns last symbol', () => {
    const b = new MysteryBehavior('MY', { revealDistribution: { A: 1, B: 1 } });
    expect(b.drawForT(0.99)).toBe('B');
  });

  it('onWin returns []', () => {
    const b = new MysteryBehavior('MY', { revealDistribution: { H1: 1 } });
    expect(b.onWin(makeCtx('MY', 0, 0))).toEqual([]);
  });

  it('kind is MysteryBehavior', () => {
    expect(new MysteryBehavior('MY').kind).toBe('MysteryBehavior');
  });
});

// ─── BHVR-09: CoinBehavior ────────────────────────────────────────────────────

describe('BHVR-09: CoinBehavior', () => {
  it('onLand emits collect_coin with default amount', () => {
    const s = makeState();
    s.grid[0]![0] = 'COIN';
    const b = new CoinBehavior('COIN', { defaultAmount: 5 });
    const effects = b.onLand(makeCtx('COIN', 0, 0, s));
    const cc = effects.find(e => e.kind === 'collect_coin');
    expect(cc!.kind === 'collect_coin' && cc.amount).toBe(5);
  });

  it('parses amount from COIN:42 symbol id', () => {
    const grid = makeGrid(5, 3, 'L1');
    grid[0]![0] = 'COIN:42';
    const s = createSpinState(grid);
    const b = new CoinBehavior('COIN', { defaultAmount: 1 });
    const effects = b.onLand(makeCtx('COIN:42', 0, 0, s));
    const cc = effects.find(e => e.kind === 'collect_coin');
    expect(cc!.kind === 'collect_coin' && cc.amount).toBe(42);
  });

  it('triggers feature when coin count reaches triggerCount', () => {
    const grid = makeGrid(5, 3, 'COIN');
    const s = createSpinState(grid);
    const b = new CoinBehavior('COIN', { triggerCount: 3 });
    const effects = b.onLand(makeCtx('COIN', 0, 0, s));
    expect(effects.some(e => e.kind === 'trigger_feature')).toBe(true);
  });

  it('does not trigger below threshold', () => {
    const grid = makeGrid(5, 3, 'L1');
    grid[0]![0] = 'COIN'; grid[1]![0] = 'COIN'; // 2 coins
    const s = createSpinState(grid);
    const b = new CoinBehavior('COIN', { triggerCount: 6 });
    const effects = b.onLand(makeCtx('COIN', 0, 0, s));
    expect(effects.some(e => e.kind === 'trigger_feature')).toBe(false);
  });

  it('emits respin during active HnW session', () => {
    const s = makeState();
    s.grid[0]![0] = 'COIN';
    s.triggeredFeatures.add('hold_and_win');
    const b = new CoinBehavior('COIN', { respinsReset: 3 });
    const effects = b.onLand(makeCtx('COIN', 0, 0, s));
    const respin = effects.find(e => e.kind === 'respin');
    expect(respin!.kind === 'respin' && respin.count).toBe(3);
  });

  it('onWin returns []', () => {
    const b = new CoinBehavior('COIN');
    expect(b.onWin(makeCtx('COIN', 0, 0))).toEqual([]);
  });

  it('kind is CoinBehavior', () => {
    expect(new CoinBehavior('COIN').kind).toBe('CoinBehavior');
  });
});

// ─── BHVR-10: MultiplierSymbolBehavior ───────────────────────────────────────

describe('BHVR-10: MultiplierSymbolBehavior', () => {
  it('triggerOn=win: onWin emits effect, onLand does not', () => {
    const b = new MultiplierSymbolBehavior('MX', { triggerOn: 'win', value: 3 });
    expect(b.onLand(makeCtx('MX', 0, 0))).toEqual([]);
    expect(b.onWin(makeCtx('MX', 0, 0))).toEqual([{ kind: 'multiplier_mul', value: 3, scope: 'spin' }]);
  });

  it('triggerOn=land: onLand emits, onWin does not', () => {
    const b = new MultiplierSymbolBehavior('MX', { triggerOn: 'land', value: 2 });
    expect(b.onLand(makeCtx('MX', 0, 0))).toHaveLength(1);
    expect(b.onWin(makeCtx('MX', 0, 0))).toHaveLength(0);
  });

  it('triggerOn=both: both hooks emit', () => {
    const b = new MultiplierSymbolBehavior('MX', { triggerOn: 'both', value: 2 });
    expect(b.onLand(makeCtx('MX', 0, 0))).toHaveLength(1);
    expect(b.onWin(makeCtx('MX', 0, 0))).toHaveLength(1);
  });

  it('mode=add emits multiplier_add', () => {
    const b = new MultiplierSymbolBehavior('MX', { mode: 'add', value: 2, triggerOn: 'win' });
    expect(b.onWin(makeCtx('MX', 0, 0))[0]!.kind).toBe('multiplier_add');
  });

  it('scope=session applies session multiplier', () => {
    const s = makeState();
    const b = new MultiplierSymbolBehavior('MX', { scope: 'session', value: 4, triggerOn: 'win' });
    applyEffects(s, b.onWin(makeCtx('MX', 0, 0, s)));
    expect(s.sessionMultiplier).toBe(4);
  });

  it('kind is MultiplierSymbolBehavior', () => {
    expect(new MultiplierSymbolBehavior('MX').kind).toBe('MultiplierSymbolBehavior');
  });
});

// ─── BHVR-11: TransformBehavior ──────────────────────────────────────────────

describe('BHVR-11: TransformBehavior', () => {
  it('self trigger transforms own position', () => {
    const grid = makeGrid(5, 3, 'L1');
    grid[2]![1] = 'TR';
    const s = createSpinState(grid);
    const b = new TransformBehavior('TR', { rules: [{ trigger: 'self', from: 'TR', to: 'H1' }] });
    const effects = b.onLand(makeCtx('TR', 2, 1, s));
    expect(effects).toEqual([{ kind: 'transform_symbol', reel: 2, row: 1, toSymbol: 'H1' }]);
  });

  it('adjacent trigger transforms neighbors matching from', () => {
    const grid = makeGrid(5, 3, 'L1');
    grid[2]![1] = 'TR';
    grid[1]![1] = 'L1'; // left neighbor
    grid[3]![1] = 'L1'; // right neighbor
    const s = createSpinState(grid);
    const b = new TransformBehavior('TR', { rules: [{ trigger: 'adjacent', from: 'L1', to: 'H1' }] });
    const effects = b.onLand(makeCtx('TR', 2, 1, s));
    expect(effects.filter(e => e.kind === 'transform_symbol')).toHaveLength(4); // 4 orthogonal
  });

  it('all trigger transforms all matching cells', () => {
    const grid = makeGrid(5, 3, 'L1');
    const s = createSpinState(grid);
    const b = new TransformBehavior('TR', { rules: [{ trigger: 'all', from: 'L1', to: 'H1' }] });
    const effects = b.onLand(makeCtx('TR', 0, 0, s));
    expect(effects.filter(e => e.kind === 'transform_symbol')).toHaveLength(15); // 5×3
  });

  it('multiple rules applied in order', () => {
    const grid = makeGrid(5, 3, 'L1');
    const s = createSpinState(grid);
    const b = new TransformBehavior('TR', {
      rules: [
        { trigger: 'self', from: 'L1', to: 'H1' },
        { trigger: 'self', from: 'H1', to: 'W' }, // won't match — grid not yet updated
      ]
    });
    const effects = b.onLand(makeCtx('TR', 0, 0, s));
    // First rule matches (L1), second doesn't (grid still has L1 in ctx)
    expect(effects).toHaveLength(1);
  });

  it('upgradeAll=true emits upgrade_symbols', () => {
    const s = makeState();
    const b = new TransformBehavior('TR', {
      upgradeAll: true,
      rules: [{ trigger: 'all', from: 'L1', to: 'H1' }]
    });
    const effects = b.onLand(makeCtx('TR', 0, 0, s));
    expect(effects[0]!.kind).toBe('upgrade_symbols');
  });

  it('onWin returns []', () => {
    const b = new TransformBehavior('TR', { rules: [] });
    expect(b.onWin(makeCtx('TR', 0, 0))).toEqual([]);
  });

  it('no rules → empty effects', () => {
    const s = makeState();
    const b = new TransformBehavior('TR', { rules: [] });
    expect(b.onLand(makeCtx('TR', 0, 0, s))).toEqual([]);
  });

  it('kind is TransformBehavior', () => {
    expect(new TransformBehavior('TR').kind).toBe('TransformBehavior');
  });
});

// ─── BHVR-12: JackpotBehavior ─────────────────────────────────────────────────

describe('BHVR-12: JackpotBehavior', () => {
  it('onWin emits award_jackpot by default', () => {
    const b = new JackpotBehavior('JP', { tier: 'grand', amount: 1000 });
    const effects = b.onWin(makeCtx('JP', 0, 0));
    expect(effects).toEqual([{ kind: 'award_jackpot', tier: 'grand', amount: 1000 }]);
  });

  it('onLand returns [] by default (triggerOn=win)', () => {
    const b = new JackpotBehavior('JP', { tier: 'grand', amount: 1000 });
    expect(b.onLand(makeCtx('JP', 0, 0))).toEqual([]);
  });

  it('triggerOn=land: onLand emits, onWin does not', () => {
    const b = new JackpotBehavior('JP', { tier: 'mini', amount: 10, triggerOn: 'land' });
    expect(b.onLand(makeCtx('JP', 0, 0))).toHaveLength(1);
    expect(b.onWin(makeCtx('JP', 0, 0))).toHaveLength(0);
  });

  it('minCount=3 only triggers when 3+ instances on grid', () => {
    const grid = makeGrid(5, 3, 'L1');
    grid[0]![0] = 'JP'; grid[1]![0] = 'JP'; // 2 — below threshold
    const s2 = createSpinState(grid);
    const b = new JackpotBehavior('JP', { tier: 'grand', minCount: 3 });
    expect(b.onWin(makeCtx('JP', 0, 0, s2))).toEqual([]);

    grid[2]![0] = 'JP'; // 3 — at threshold
    const s3 = createSpinState(grid);
    expect(b.onWin(makeCtx('JP', 0, 0, s3))).toHaveLength(1);
  });

  it('only first jackpot award is kept per spin', () => {
    const s = makeState();
    const b = new JackpotBehavior('JP', { tier: 'grand', amount: 1000 });
    applyEffects(s, b.onWin(makeCtx('JP', 0, 0, s)));
    const b2 = new JackpotBehavior('JP2', { tier: 'minor', amount: 100 });
    applyEffects(s, b2.onWin(makeCtx('JP2', 1, 0, s)));
    expect(s.jackpotAwarded?.tier).toBe('grand'); // first wins
  });

  it('default tier is grand', () => {
    const b = new JackpotBehavior('JP');
    const effects = b.onWin(makeCtx('JP', 0, 0));
    expect(effects[0]!.kind === 'award_jackpot' && effects[0].tier).toBe('grand');
  });

  it('amount=0 is valid (progressive placeholder)', () => {
    const b = new JackpotBehavior('JP', { amount: 0 });
    const effects = b.onWin(makeCtx('JP', 0, 0));
    expect(effects[0]!.kind === 'award_jackpot' && effects[0].amount).toBe(0);
  });

  it('kind is JackpotBehavior', () => {
    expect(new JackpotBehavior('JP').kind).toBe('JackpotBehavior');
  });
});

// ─── BHVR-13: BehaviorRegistry ───────────────────────────────────────────────

describe('BHVR-13: BehaviorRegistry', () => {
  it('registers and retrieves a behavior', () => {
    const reg = BehaviorRegistry.builder()
      .register('W', new WildBehavior('W'))
      .build();
    expect(reg.has('W')).toBe(true);
    expect(reg.get('W')).toBeDefined();
  });

  it('has() returns false for unregistered id', () => {
    const reg = BehaviorRegistry.builder().build();
    expect(reg.has('SC')).toBe(false);
  });

  it('duplicate registration throws', () => {
    expect(() => {
      BehaviorRegistry.builder()
        .register('W', new WildBehavior('W'))
        .register('W', new WildBehavior('W'))
        .build();
    }).toThrow(/duplicate/i);
  });

  it('override() replaces without throwing', () => {
    const reg = BehaviorRegistry.builder()
      .register('W', new WildBehavior('W'))
      .override('W', new ExpandingWildBehavior('W'))
      .build();
    expect(reg.get('W')?.kind).toBe('ExpandingWildBehavior');
  });

  it('size reflects registered count', () => {
    const reg = BehaviorRegistry.builder()
      .register('W',  new WildBehavior('W'))
      .register('SC', new ScatterBehavior('SC'))
      .build();
    expect(reg.size).toBe(2);
  });

  it('toMap() returns all entries', () => {
    const reg = BehaviorRegistry.builder()
      .register('W', new WildBehavior('W'))
      .register('EW', new ExpandingWildBehavior('EW'))
      .build();
    const m = reg.toMap();
    expect(m.size).toBe(2);
    expect(m.has('EW')).toBe(true);
  });

  it('unregister removes a behavior', () => {
    const reg = BehaviorRegistry.builder()
      .register('W', new WildBehavior('W'))
      .unregister('W')
      .build();
    expect(reg.has('W')).toBe(false);
  });
});

// ─── BHVR-14: BehaviorPipeline integration ───────────────────────────────────

describe('BHVR-14: BehaviorPipeline integration', () => {
  it('runOnLand calls onLand for each visible behavior symbol', () => {
    const grid = makeGrid(5, 3, 'L1');
    grid[0]![0] = 'SC'; grid[1]![0] = 'SC'; grid[2]![0] = 'SC';
    const s = createSpinState(grid);
    const reg = BehaviorRegistry.builder()
      .register('SC', new ScatterBehavior('SC', { triggerCount: 3 }))
      .build();
    const pipeline = new BehaviorPipeline(reg.toMap(), s);
    pipeline.runOnLand();
    // 3 scatters on grid; trigger_feature should be in state
    expect(s.triggeredFeatures.has('free_spins')).toBe(true);
  });

  it('runOnWin applies multiplier effects from winning positions', () => {
    const s = makeState();
    const reg = BehaviorRegistry.builder()
      .register('MW', new MultiplierWildBehavior('MW', { value: 3, scope: 'spin' }))
      .build();
    const pipeline = new BehaviorPipeline(reg.toMap(), s);
    pipeline.runOnWin([{ symbolId: 'MW', reel: 0, row: 0 }, { symbolId: 'MW', reel: 1, row: 0 }]);
    expect(s.spinMultiplier).toBe(9); // 3×3
  });

  it('runOnSpinEnd advances walking wild position', () => {
    const grid = makeGrid(5, 3, 'L1');
    grid[3]![1] = 'WW';
    const s = createSpinState(grid);
    const reg = BehaviorRegistry.builder()
      .register('WW', new WalkingWildBehavior('WW', { direction: 'left', reels: 5, rows: 3 }))
      .build();
    const pipeline = new BehaviorPipeline(reg.toMap(), s);
    pipeline.runOnSpinEnd();
    // Should have placed wild at reel 2 (left of 3)
    expect(s.grid[2]![1]).toBe('WW');
  });

  it('runOnCascadeRemove calls onCascadeRemove', () => {
    const s = makeState();
    const mockBehavior = {
      id: 'CASC',
      kind: 'MockBehavior',
      onLand: () => [],
      onWin: () => [],
      onCascadeRemove: () => [{ kind: 'respin' as const, count: 1 }],
    };
    const reg = BehaviorRegistry.builder()
      .register('CASC', mockBehavior)
      .build();
    const pipeline = new BehaviorPipeline(reg.toMap(), s);
    pipeline.runOnCascadeRemove([{ symbolId: 'CASC', reel: 0, row: 0 }]);
    expect(s.respinsAwarded).toBe(1);
  });

  it('expanding wild fills reel after runOnLand', () => {
    const grid = makeGrid(5, 3, 'L1');
    grid[2]![1] = 'EW';
    const s = createSpinState(grid);
    const reg = BehaviorRegistry.builder()
      .register('EW', new ExpandingWildBehavior('EW'))
      .build();
    const pipeline = new BehaviorPipeline(reg.toMap(), s);
    pipeline.runOnLand();
    expect(s.grid[2]).toEqual(['EW', 'EW', 'EW']);
  });

  it('sticky wild locks position after runOnLand', () => {
    const grid = makeGrid(5, 3, 'L1');
    grid[1]![2] = 'SW';
    const s = createSpinState(grid);
    const reg = BehaviorRegistry.builder()
      .register('SW', new StickyWildBehavior('SW', { duration: 3 }))
      .build();
    const pipeline = new BehaviorPipeline(reg.toMap(), s);
    pipeline.runOnLand();
    expect(s.lockedPositions).toHaveLength(1);
    expect(s.lockedPositions[0]!.reel).toBe(1);
    expect(s.lockedPositions[0]!.row).toBe(2);
  });
});
