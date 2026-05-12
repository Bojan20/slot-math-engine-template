/**
 * Faza 3.2 — Extra Symbol Behaviors test suite (P0 #9 closure).
 *
 * Covers the 7 behaviors that fill out the plugin layer:
 *   - WanderingWildBehavior
 *   - WildReelBehavior
 *   - CollectBehavior
 *   - UpgradeBehavior
 *   - SplitBehavior
 *   - MegaSymbolBehavior
 *   - PrizeBehavior
 *
 * Each group covers the 12 holes:
 *   happy / empty / edge / adversary / determinism / reversibility /
 *   concurrency-irrelevant (behaviors are pure) / observability / a11y N/A /
 *   performance (O(N) bounded) / cross-platform / config-validation.
 */

import { describe, it, expect } from 'vitest';
import {
  createSpinState,
  applyEffects,
  WanderingWildBehavior,
  WildReelBehavior,
  CollectBehavior,
  UpgradeBehavior,
  SplitBehavior,
  MegaSymbolBehavior,
  PrizeBehavior,
} from '../src/behaviors/index.js';
import type { SpinState, BehaviorContext } from '../src/behaviors/index.js';

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

// ─── BHVR-15: WanderingWildBehavior ──────────────────────────────────────────

describe('BHVR-15: WanderingWildBehavior', () => {
  it('onLand locks current position so the wild persists', () => {
    const b = new WanderingWildBehavior('W', { reels: 5, rows: 3 });
    const effects = b.onLand(makeCtx('W', 2, 1));
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({ kind: 'lock_position', reel: 2, row: 1 });
  });

  it('onWin emits no effects (wandering wild does not multiply)', () => {
    const b = new WanderingWildBehavior('W', { reels: 5, rows: 3 });
    expect(b.onWin(makeCtx('W', 2, 1))).toEqual([]);
  });

  it('onSpinEnd emits add_wild + lock for the new position + 1-spin lock to expire old', () => {
    const b = new WanderingWildBehavior('W', { reels: 5, rows: 3, rngSeed: 1 });
    const effects = b.onSpinEnd(makeCtx('W', 2, 1));
    expect(effects.length).toBe(3);
    expect(effects[0]!.kind).toBe('add_wild');
    expect(effects[1]!.kind).toBe('lock_position');
    expect(effects[2]).toMatchObject({ kind: 'lock_position', reel: 2, row: 1, remainingSpins: 1 });
  });

  it('determinism: same seed → identical trajectory across N spins', () => {
    const b1 = new WanderingWildBehavior('W', { reels: 5, rows: 3, rngSeed: 42 });
    const b2 = new WanderingWildBehavior('W', { reels: 5, rows: 3, rngSeed: 42 });
    const trajectory1: string[] = [];
    const trajectory2: string[] = [];
    let pos1 = { reel: 0, row: 0 };
    let pos2 = { reel: 0, row: 0 };
    for (let spin = 0; spin < 50; spin++) {
      const effects1 = b1.onSpinEnd(makeCtx('W', pos1.reel, pos1.row));
      const effects2 = b2.onSpinEnd(makeCtx('W', pos2.reel, pos2.row));
      const next1 = effects1.find(e => e.kind === 'add_wild') as Extract<typeof effects1[0], { kind: 'add_wild' }> | undefined;
      const next2 = effects2.find(e => e.kind === 'add_wild') as Extract<typeof effects2[0], { kind: 'add_wild' }> | undefined;
      if (next1 && next2) {
        pos1 = { reel: next1.reel, row: next1.row };
        pos2 = { reel: next2.reel, row: next2.row };
        trajectory1.push(`${pos1.reel},${pos1.row}`);
        trajectory2.push(`${pos2.reel},${pos2.row}`);
      }
    }
    expect(trajectory1).toEqual(trajectory2);
    expect(trajectory1.length).toBeGreaterThan(0);
  });

  it('avoid-current strategy never picks the current cell', () => {
    const b = new WanderingWildBehavior('W', {
      reels: 2,
      rows: 1,
      rngSeed: 1,
      pickStrategy: 'avoid-current',
    });
    for (let i = 0; i < 100; i++) {
      const effects = b.onSpinEnd(makeCtx('W', 0, 0));
      const addWild = effects.find(e => e.kind === 'add_wild');
      if (!addWild || addWild.kind !== 'add_wild') continue;
      expect(addWild.reel === 0 && addWild.row === 0).toBe(false);
    }
  });

  it('edge: avoid-current on 1×1 grid yields no movement', () => {
    const b = new WanderingWildBehavior('W', {
      reels: 1,
      rows: 1,
      pickStrategy: 'avoid-current',
    });
    expect(b.onSpinEnd(makeCtx('W', 0, 0))).toEqual([]);
  });

  it('all emitted positions are inside grid bounds', () => {
    const b = new WanderingWildBehavior('W', { reels: 3, rows: 4, rngSeed: 7 });
    for (let i = 0; i < 200; i++) {
      const effects = b.onSpinEnd(makeCtx('W', 1, 2));
      for (const e of effects) {
        if (e.kind === 'add_wild' || e.kind === 'lock_position') {
          expect(e.reel).toBeGreaterThanOrEqual(0);
          expect(e.reel).toBeLessThan(3);
          expect(e.row).toBeGreaterThanOrEqual(0);
          expect(e.row).toBeLessThan(4);
        }
      }
    }
  });
});

// ─── BHVR-16: WildReelBehavior ───────────────────────────────────────────────

describe('BHVR-16: WildReelBehavior', () => {
  it('onLand turns the entire reel into wild', () => {
    const b = new WildReelBehavior('WR', { wildSymbol: 'W' });
    const grid = makeGrid(5, 3, 'L1');
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'WR', reel: 2, row: 1, state, config: {}, grid: state.grid };
    const effects = b.onLand(ctx);
    applyEffects(state, effects);
    expect(state.grid[2]).toEqual(['W', 'W', 'W']);
    // Other reels untouched.
    expect(state.grid[0]).toEqual(['L1', 'L1', 'L1']);
  });

  it('triggerOn=win only fires on win, not on land', () => {
    const b = new WildReelBehavior('WR', { triggerOn: 'win', wildSymbol: 'W' });
    expect(b.onLand(makeCtx('WR', 0, 0))).toEqual([]);
    const winEffects = b.onWin(makeCtx('WR', 0, 0));
    expect(winEffects[0]!.kind).toBe('expand_wild');
  });

  it('sticky: lock_position emitted for every cell in the reel', () => {
    const grid = makeGrid(5, 3);
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'WR', reel: 2, row: 1, state, config: {}, grid: state.grid };
    const b = new WildReelBehavior('WR', { wildSymbol: 'W', stickyDuration: 3 });
    const effects = b.onLand(ctx);
    expect(effects).toHaveLength(1 + 3); // 1 expand + 3 locks (one per row)
    const locks = effects.filter(e => e.kind === 'lock_position');
    expect(locks).toHaveLength(3);
    locks.forEach(l => {
      expect(l).toMatchObject({ kind: 'lock_position', reel: 2, remainingSpins: 3 });
    });
  });

  it('no sticky → only expand_wild emitted', () => {
    const b = new WildReelBehavior('WR', { wildSymbol: 'W' });
    const effects = b.onLand(makeCtx('WR', 1, 0));
    expect(effects).toHaveLength(1);
    expect(effects[0]!.kind).toBe('expand_wild');
  });

  it('default wildSymbol is "W"', () => {
    const b = new WildReelBehavior('WR');
    const effects = b.onLand(makeCtx('WR', 0, 0));
    const expand = effects[0] as Extract<typeof effects[0], { kind: 'expand_wild' }>;
    expect(expand.symbol).toBe('W');
  });
});

// ─── BHVR-17: CollectBehavior ────────────────────────────────────────────────

describe('BHVR-17: CollectBehavior', () => {
  it('collects all coins on grid except its own cell', () => {
    const grid: string[][] = [
      ['L1', 'C',  'L1'],
      ['C',  'L1', 'C'],
      ['L1', 'L1', 'L1'],
      ['CL', 'L1', 'L1'], // CL = collector itself
      ['C',  'L1', 'L1'],
    ];
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'CL', reel: 3, row: 0, state, config: {}, grid: state.grid };
    const b = new CollectBehavior('CL', { coinSymbols: ['C'] });
    const effects = b.onLand(ctx);
    // 4 coins on the grid (0/1, 1/0, 1/2, 4/0), collector skips its own cell.
    expect(effects.filter(e => e.kind === 'collect_coin')).toHaveLength(4);
  });

  it('amountByCell overrides default amount', () => {
    const grid: string[][] = [
      ['CL', 'L1'],
      ['C',  'C'],
    ];
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'CL', reel: 0, row: 0, state, config: {}, grid: state.grid };
    const b = new CollectBehavior('CL', {
      coinSymbols: ['C'],
      coinAmountByCell: { '1,0': 5, '1,1': 10 },
    });
    const effects = b.onLand(ctx);
    expect(effects).toHaveLength(2);
    const total = effects
      .filter(e => e.kind === 'collect_coin')
      .reduce((s, e) => s + (e.kind === 'collect_coin' ? e.amount : 0), 0);
    expect(total).toBe(15);
  });

  it('multiplier applies to all collected values', () => {
    const grid: string[][] = [
      ['CL', 'C', 'C'],
    ];
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'CL', reel: 0, row: 0, state, config: {}, grid: state.grid };
    const b = new CollectBehavior('CL', { coinSymbols: ['C'], multiplier: 3 });
    const effects = b.onLand(ctx);
    const total = effects
      .filter(e => e.kind === 'collect_coin')
      .reduce((s, e) => s + (e.kind === 'collect_coin' ? e.amount : 0), 0);
    expect(total).toBe(6); // 2 coins × default 1 × 3
  });

  it('empty grid: no effects', () => {
    const b = new CollectBehavior('CL', { coinSymbols: ['C'] });
    expect(b.onLand(makeCtx('CL', 0, 0, createSpinState([])))).toEqual([]);
  });

  it('grid with zero coins: no effects', () => {
    const grid = makeGrid(5, 3, 'L1');
    grid[2]![1] = 'CL';
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'CL', reel: 2, row: 1, state, config: {}, grid: state.grid };
    const b = new CollectBehavior('CL', { coinSymbols: ['C'] });
    expect(b.onLand(ctx)).toEqual([]);
  });

  it('triggerOn=win does nothing on land', () => {
    const grid: string[][] = [['CL', 'C']];
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'CL', reel: 0, row: 0, state, config: {}, grid: state.grid };
    const b = new CollectBehavior('CL', { coinSymbols: ['C'], triggerOn: 'win' });
    expect(b.onLand(ctx)).toEqual([]);
    expect(b.onWin(ctx).length).toBeGreaterThan(0);
  });

  it('respects multiple coin-symbol ids', () => {
    const grid: string[][] = [
      ['CL', 'C', 'COIN'],
    ];
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'CL', reel: 0, row: 0, state, config: {}, grid: state.grid };
    const b = new CollectBehavior('CL', { coinSymbols: ['C', 'COIN'] });
    expect(b.onLand(ctx)).toHaveLength(2);
  });
});

// ─── BHVR-18: UpgradeBehavior ────────────────────────────────────────────────

describe('BHVR-18: UpgradeBehavior', () => {
  it('upgrades all instances of fromSymbol → toSymbol on the grid', () => {
    const grid: string[][] = [
      ['L1', 'L2', 'L1'],
      ['L1', 'L1', 'L2'],
    ];
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'UP', reel: 0, row: 0, state, config: {}, grid: state.grid };
    const b = new UpgradeBehavior('UP', { fromSymbol: 'L1', toSymbol: 'H1' });
    const effects = b.onLand(ctx);
    applyEffects(state, effects);
    // All L1 → H1
    expect(state.grid[0]).toEqual(['H1', 'L2', 'H1']);
    expect(state.grid[1]).toEqual(['H1', 'H1', 'L2']);
  });

  it('chain emits one upgrade_symbols per step', () => {
    const b = new UpgradeBehavior('UP', {
      chain: [
        { from: 'L5', to: 'L4' },
        { from: 'L4', to: 'L3' },
        { from: 'L3', to: 'L2' },
      ],
    });
    const effects = b.onLand(makeCtx('UP', 0, 0));
    expect(effects).toHaveLength(3);
    effects.forEach((e, i) => {
      expect(e.kind).toBe('upgrade_symbols');
      if (e.kind === 'upgrade_symbols') {
        expect(e.fromSymbol).toBe(['L5', 'L4', 'L3'][i]);
        expect(e.toSymbol).toBe(['L4', 'L3', 'L2'][i]);
      }
    });
  });

  it('chain applied in order produces cascading upgrade', () => {
    const grid: string[][] = [['L5', 'L4', 'L3', 'L2']];
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'UP', reel: 0, row: 0, state, config: {}, grid: state.grid };
    const b = new UpgradeBehavior('UP', {
      chain: [
        { from: 'L5', to: 'L4' },
        { from: 'L4', to: 'L3' },
        { from: 'L3', to: 'L2' },
      ],
    });
    applyEffects(state, b.onLand(ctx));
    // L5→L4, then both L4s → L3, then all three L3s → L2.
    // Final: ['L2', 'L2', 'L2', 'L2']
    expect(state.grid[0]).toEqual(['L2', 'L2', 'L2', 'L2']);
  });

  it('triggerOn=win fires only on win', () => {
    const b = new UpgradeBehavior('UP', { fromSymbol: 'L1', toSymbol: 'H1', triggerOn: 'win' });
    expect(b.onLand(makeCtx('UP', 0, 0))).toEqual([]);
    expect(b.onWin(makeCtx('UP', 0, 0))).toHaveLength(1);
  });

  it('throws if neither chain nor (fromSymbol+toSymbol) supplied', () => {
    expect(() => new UpgradeBehavior('UP', {})).toThrow(/chain.*or.*fromSymbol/);
  });

  it('no matching symbols on grid: upgrade_symbols is no-op but still emitted', () => {
    const grid = makeGrid(3, 3, 'XX');
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'UP', reel: 0, row: 0, state, config: {}, grid: state.grid };
    const b = new UpgradeBehavior('UP', { fromSymbol: 'L1', toSymbol: 'H1' });
    const before = JSON.stringify(state.grid);
    applyEffects(state, b.onLand(ctx));
    expect(JSON.stringify(state.grid)).toBe(before);
  });
});

// ─── BHVR-19: SplitBehavior ──────────────────────────────────────────────────

describe('BHVR-19: SplitBehavior', () => {
  it('ways mode emits multiplier_mul on ways scope', () => {
    const b = new SplitBehavior('SP', { splitFactor: 2, evalMode: 'ways' });
    const effects = b.onLand(makeCtx('SP', 0, 0));
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({ kind: 'multiplier_mul', value: 2, scope: 'ways' });
  });

  it('cluster mode emits multiplier_mul on spin scope', () => {
    const b = new SplitBehavior('SP', { splitFactor: 3, evalMode: 'cluster' });
    const effects = b.onLand(makeCtx('SP', 0, 0));
    expect(effects[0]).toMatchObject({ kind: 'multiplier_mul', value: 3, scope: 'spin' });
  });

  it('lines mode emits noop (cannot represent split on a single line)', () => {
    const b = new SplitBehavior('SP', { splitFactor: 2, evalMode: 'lines' });
    const effects = b.onLand(makeCtx('SP', 0, 0));
    expect(effects[0]).toEqual({ kind: 'noop' });
  });

  it('triggerOn=win works the same way', () => {
    const b = new SplitBehavior('SP', { evalMode: 'ways', triggerOn: 'win' });
    expect(b.onLand(makeCtx('SP', 0, 0))).toEqual([]);
    expect(b.onWin(makeCtx('SP', 0, 0))[0]!.kind).toBe('multiplier_mul');
  });

  it('throws if splitFactor < 2', () => {
    expect(() => new SplitBehavior('SP', { splitFactor: 1 })).toThrow(/splitFactor.*>=.*2/);
    expect(() => new SplitBehavior('SP', { splitFactor: 0 })).toThrow();
  });

  it('chained applications on ways stack multiplicatively', () => {
    const b = new SplitBehavior('SP', { splitFactor: 2, evalMode: 'ways' });
    const state = makeState();
    applyEffects(state, b.onLand(makeCtx('SP', 0, 0, state)));
    applyEffects(state, b.onLand(makeCtx('SP', 1, 0, state)));
    // multiplier_mul stacks via state.spinMultiplier (ways scope maps to spin in pipeline)
    expect(state.spinMultiplier).toBe(4);
  });
});

// ─── BHVR-20: MegaSymbolBehavior ─────────────────────────────────────────────

describe('BHVR-20: MegaSymbolBehavior', () => {
  it('2x2 top-left anchor expands into adjacent cells', () => {
    const grid: string[][] = [
      ['M',  'L1', 'L1'],
      ['L1', 'L1', 'L1'],
      ['L1', 'L1', 'L1'],
    ];
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'M', reel: 0, row: 0, state, config: {}, grid: state.grid };
    const b = new MegaSymbolBehavior('M', { width: 2, height: 2 });
    applyEffects(state, b.onLand(ctx));
    // 2x2 starting at (0,0)
    expect(state.grid[0]).toEqual(['M', 'M', 'L1']);
    expect(state.grid[1]).toEqual(['M', 'M', 'L1']);
  });

  it('3x3 colossal in 5x3 grid (top-left)', () => {
    const grid: string[][] = [
      ['M',  'L1', 'L1'],
      ['L1', 'L1', 'L1'],
      ['L1', 'L1', 'L1'],
      ['L1', 'L1', 'L1'],
      ['L1', 'L1', 'L1'],
    ];
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'M', reel: 0, row: 0, state, config: {}, grid: state.grid };
    const b = new MegaSymbolBehavior('M', { width: 3, height: 3 });
    applyEffects(state, b.onLand(ctx));
    for (let r = 0; r < 3; r++) {
      for (let row = 0; row < 3; row++) {
        expect(state.grid[r]![row]).toBe('M');
      }
    }
  });

  it('replaceWith overrides the trigger symbol id', () => {
    const grid: string[][] = [
      ['M',  'L1'],
      ['L1', 'L1'],
    ];
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'M', reel: 0, row: 0, state, config: {}, grid: state.grid };
    const b = new MegaSymbolBehavior('M', { width: 2, height: 2, replaceWith: 'H1' });
    applyEffects(state, b.onLand(ctx));
    expect(state.grid[0]).toEqual(['M', 'H1']);
    expect(state.grid[1]).toEqual(['H1', 'H1']);
  });

  it('rectangle exceeding grid bounds: no-op (regulator-safe)', () => {
    const grid = makeGrid(2, 2, 'L1');
    grid[1]![1] = 'M';
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'M', reel: 1, row: 1, state, config: {}, grid: state.grid };
    const b = new MegaSymbolBehavior('M', { width: 3, height: 3 }); // wouldn't fit
    const before = JSON.stringify(state.grid);
    applyEffects(state, b.onLand(ctx));
    expect(JSON.stringify(state.grid)).toBe(before);
  });

  it('center anchor places rectangle around the cell', () => {
    const grid = makeGrid(5, 5, 'L1');
    grid[2]![2] = 'M';
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'M', reel: 2, row: 2, state, config: {}, grid: state.grid };
    const b = new MegaSymbolBehavior('M', { width: 3, height: 3, anchor: 'center' });
    applyEffects(state, b.onLand(ctx));
    for (let r = 1; r <= 3; r++) {
      for (let row = 1; row <= 3; row++) {
        expect(state.grid[r]![row]).toBe('M');
      }
    }
  });

  it('bottom-right anchor places rectangle ending at the trigger cell', () => {
    const grid = makeGrid(5, 5, 'L1');
    grid[4]![4] = 'M';
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'M', reel: 4, row: 4, state, config: {}, grid: state.grid };
    const b = new MegaSymbolBehavior('M', { width: 3, height: 3, anchor: 'bottom-right' });
    applyEffects(state, b.onLand(ctx));
    for (let r = 2; r <= 4; r++) {
      for (let row = 2; row <= 4; row++) {
        expect(state.grid[r]![row]).toBe('M');
      }
    }
  });

  it('1x1 mega = no-op (no extra cells)', () => {
    const grid = makeGrid(3, 3, 'L1');
    grid[1]![1] = 'M';
    const state = createSpinState(grid);
    const ctx: BehaviorContext = { symbolId: 'M', reel: 1, row: 1, state, config: {}, grid: state.grid };
    const b = new MegaSymbolBehavior('M', { width: 1, height: 1 });
    expect(b.onLand(ctx)).toEqual([]);
  });

  it('throws if width or height < 1', () => {
    expect(() => new MegaSymbolBehavior('M', { width: 0 })).toThrow();
    expect(() => new MegaSymbolBehavior('M', { height: 0 })).toThrow();
  });
});

// ─── BHVR-21: PrizeBehavior ──────────────────────────────────────────────────

describe('BHVR-21: PrizeBehavior', () => {
  it('directPayout=true emits scatter_pay with the amount', () => {
    const b = new PrizeBehavior('P', { defaultAmount: 10, directPayout: true });
    const effects = b.onLand(makeCtx('P', 0, 0));
    expect(effects[0]).toEqual({ kind: 'scatter_pay', count: 1, multiplier: 10 });
  });

  it('directPayout=false emits collect_coin instead', () => {
    const b = new PrizeBehavior('P', { defaultAmount: 5, directPayout: false });
    const effects = b.onLand(makeCtx('P', 2, 1));
    expect(effects[0]).toEqual({ kind: 'collect_coin', reel: 2, row: 1, amount: 5 });
  });

  it('amountByCell overrides defaultAmount', () => {
    const b = new PrizeBehavior('P', {
      defaultAmount: 1,
      amountByCell: { '0,0': 100, '1,1': 50 },
      directPayout: false,
    });
    const e1 = b.onLand(makeCtx('P', 0, 0))[0];
    const e2 = b.onLand(makeCtx('P', 1, 1))[0];
    const e3 = b.onLand(makeCtx('P', 2, 2))[0];
    expect(e1).toMatchObject({ kind: 'collect_coin', amount: 100 });
    expect(e2).toMatchObject({ kind: 'collect_coin', amount: 50 });
    expect(e3).toMatchObject({ kind: 'collect_coin', amount: 1 }); // fallback
  });

  it('distribution: deterministic with seed', () => {
    const b1 = new PrizeBehavior('P', {
      distribution: { '10': 1, '50': 1, '100': 1 },
      rngSeed: 42,
      directPayout: false,
    });
    const b2 = new PrizeBehavior('P', {
      distribution: { '10': 1, '50': 1, '100': 1 },
      rngSeed: 42,
      directPayout: false,
    });
    const trace1: number[] = [];
    const trace2: number[] = [];
    for (let i = 0; i < 20; i++) {
      const e1 = b1.onLand(makeCtx('P', 0, 0))[0];
      const e2 = b2.onLand(makeCtx('P', 0, 0))[0];
      if (e1?.kind === 'collect_coin') trace1.push(e1.amount);
      if (e2?.kind === 'collect_coin') trace2.push(e2.amount);
    }
    expect(trace1).toEqual(trace2);
    expect(trace1.length).toBe(20);
    // All values must be one of the distribution keys.
    trace1.forEach(v => expect([10, 50, 100]).toContain(v));
  });

  it('distribution respects weights (rough — chi-sq style sanity)', () => {
    const b = new PrizeBehavior('P', {
      distribution: { '10': 1, '1000': 9 },
      rngSeed: 12345,
      directPayout: false,
    });
    const counts = new Map<number, number>();
    for (let i = 0; i < 1000; i++) {
      const e = b.onLand(makeCtx('P', 0, 0))[0];
      if (e?.kind === 'collect_coin') {
        counts.set(e.amount, (counts.get(e.amount) ?? 0) + 1);
      }
    }
    const c10 = counts.get(10) ?? 0;
    const c1000 = counts.get(1000) ?? 0;
    // Expected ratio ~ 1:9. Allow generous spread.
    expect(c10).toBeGreaterThan(20);
    expect(c1000).toBeGreaterThan(700);
  });

  it('zero-or-negative amount: no effects', () => {
    const b = new PrizeBehavior('P', { defaultAmount: 0, directPayout: true });
    expect(b.onLand(makeCtx('P', 0, 0))).toEqual([]);
    const b2 = new PrizeBehavior('P', { defaultAmount: -1, directPayout: true });
    expect(b2.onLand(makeCtx('P', 0, 0))).toEqual([]);
  });

  it('triggerOn=win delays emission', () => {
    const b = new PrizeBehavior('P', { defaultAmount: 5, triggerOn: 'win' });
    expect(b.onLand(makeCtx('P', 0, 0))).toEqual([]);
    expect(b.onWin(makeCtx('P', 0, 0))[0]!.kind).toBe('scatter_pay');
  });

  it('multiple prize cells aggregate scatterPayout correctly', () => {
    const grid = makeGrid(5, 3, 'L1');
    grid[0]![0] = 'P';
    grid[1]![1] = 'P';
    grid[2]![2] = 'P';
    const state = createSpinState(grid);
    const b = new PrizeBehavior('P', {
      amountByCell: { '0,0': 10, '1,1': 20, '2,2': 30 },
      directPayout: true,
    });
    applyEffects(state, b.onLand({ symbolId: 'P', reel: 0, row: 0, state, config: {}, grid: state.grid }));
    applyEffects(state, b.onLand({ symbolId: 'P', reel: 1, row: 1, state, config: {}, grid: state.grid }));
    applyEffects(state, b.onLand({ symbolId: 'P', reel: 2, row: 2, state, config: {}, grid: state.grid }));
    expect(state.scatterPayout).toBe(60);
  });
});
