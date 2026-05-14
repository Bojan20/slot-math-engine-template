/**
 * W152 Faza 2.4 — Pattern evaluator TS↔Rust parity.
 *
 * Loads the same fixture as the Rust integration test
 * (`tests/fixtures/pattern-evaluator.json`) and runs the TS pattern
 * evaluator against identical grids. Expected payouts are hard-coded
 * here AND in `rust-sim/tests/pattern_evaluator.rs`; any drift fails
 * both suites.
 *
 * Payment scaling: pay_multiplier × 1000 mc/credit × total_bet_mc / 1000
 * = 1000 × pay_multiplier mc when total_bet_mc = 1000 (=1 credit). So
 * row_top = 10 credits, col_left = 5 credits, diagonal = 25 credits.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { irToGameConfig } from '../src/ir/adapter.js';
import type { SlotGameIR } from '../src/ir/types.js';
import {
  evaluatePattern,
  type PatternEvalInput,
} from '../src/evaluators/patternEvaluator.js';

function loadFixture(): SlotGameIR {
  const raw = readFileSync(
    join(__dirname, 'fixtures', 'pattern-evaluator.json'),
    'utf-8',
  );
  return JSON.parse(raw) as SlotGameIR;
}

function makeGrid(rows: number, reels: number, fill: string): string[][] {
  // grid[reel][row].
  const out: string[][] = [];
  for (let reel = 0; reel < reels; reel++) {
    const strip: string[] = [];
    for (let row = 0; row < rows; row++) {
      strip.push(fill);
    }
    out.push(strip);
  }
  return out;
}

function makeContext(ir: SlotGameIR) {
  const wildSymbols = new Set<string>();
  const specialSymbols = new Set<string>();
  for (const s of ir.symbols) {
    if (s.kind === 'wild' || s.kind === 'chain_wild' || s.kind === 'expanding') {
      wildSymbols.add(s.id);
    }
    if (s.kind === 'scatter' || s.kind === 'bonus') {
      specialSymbols.add(s.id);
    }
  }
  return { wildSymbols, specialSymbols };
}

describe('W152 Faza 2.4 — Pattern evaluator TS↔Rust parity', () => {
  it('adapter populates TSGameConfig.pattern with 3 rules', () => {
    const ir = loadFixture();
    const cfg = irToGameConfig(ir);
    expect(cfg.pattern).toBeDefined();
    expect(cfg.pattern?.rules).toHaveLength(3);
    expect(cfg.pattern?.rules[0]).toEqual({
      id: 'row_top',
      positions: [
        [0, 0],
        [0, 1],
        [0, 2],
      ],
      payMultiplier: 10,
    });
    expect(cfg.pattern?.rules[1]).toEqual({
      id: 'col_left',
      positions: [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      payMultiplier: 5,
    });
    expect(cfg.pattern?.rules[2]).toEqual({
      id: 'diagonal',
      positions: [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
      payMultiplier: 25,
    });
  });

  it('pays all 3 rules when grid is uniform HP1 (40 credits)', () => {
    const ir = loadFixture();
    const cfg = irToGameConfig(ir);
    const { wildSymbols, specialSymbols } = makeContext(ir);
    const grid = makeGrid(cfg.numRows, cfg.numReels, 'HP1');
    const result = evaluatePattern({
      grid,
      rules: cfg.pattern!.rules,
      totalBetMc: 1000,
      wildSymbols,
      specialSymbols,
    });
    // 10 + 5 + 25 = 40 credits = 40_000 mc.
    expect(result.totalWinMc).toBe(40_000);
    expect(result.wins).toHaveLength(3);
  });

  it('pays only col_left + diagonal when row_top is broken by HP1 middle', () => {
    const ir = loadFixture();
    const cfg = irToGameConfig(ir);
    const { wildSymbols, specialSymbols } = makeContext(ir);
    const grid = makeGrid(cfg.numRows, cfg.numReels, 'LP1');
    // (reel=1, row=0) → HP1 breaks row_top (LP1, HP1, LP1).
    grid[1][0] = 'HP1';
    const result = evaluatePattern({
      grid,
      rules: cfg.pattern!.rules,
      totalBetMc: 1000,
      wildSymbols,
      specialSymbols,
    });
    // col_left = (reel=0): LP1, LP1, LP1 → pays 5.
    // diagonal = (0,0), (1,1), (2,2): LP1, LP1, LP1 → pays 25.
    // row_top mixed → no pay.
    expect(result.totalWinMc).toBe(30_000);
    expect(result.wins.map((w) => w.ruleId).sort()).toEqual([
      'col_left',
      'diagonal',
    ]);
    expect(result.wins.every((w) => w.symbolId === 'LP1')).toBe(true);
  });

  it('wild substitutes for non-special symbol in pattern', () => {
    const ir = loadFixture();
    const cfg = irToGameConfig(ir);
    const { wildSymbols, specialSymbols } = makeContext(ir);
    const grid = makeGrid(cfg.numRows, cfg.numReels, 'LP1');
    // row_top: HP1, WILD, HP1 → wild substitutes → row_top pays HP1.
    grid[0][0] = 'HP1';
    grid[1][0] = 'S_WILD';
    grid[2][0] = 'HP1';
    const result = evaluatePattern({
      grid,
      rules: cfg.pattern!.rules,
      totalBetMc: 1000,
      wildSymbols,
      specialSymbols,
    });
    const hp1Wins = result.wins.filter((w) => w.symbolId === 'HP1');
    expect(hp1Wins).toHaveLength(1);
    expect(hp1Wins[0].ruleId).toBe('row_top');
    expect(hp1Wins[0].payoutMc).toBe(10_000);
  });

  it('scatter in pattern position voids the rule', () => {
    const ir = loadFixture();
    const cfg = irToGameConfig(ir);
    const { wildSymbols, specialSymbols } = makeContext(ir);
    const grid = makeGrid(cfg.numRows, cfg.numReels, 'LP1');
    grid[0][0] = 'HP1';
    grid[1][0] = 'S_SCAT'; // scatter in row_top middle.
    grid[2][0] = 'HP1';
    const result = evaluatePattern({
      grid,
      rules: cfg.pattern!.rules,
      totalBetMc: 1000,
      wildSymbols,
      specialSymbols,
    });
    const hp1Wins = result.wins.filter((w) => w.symbolId === 'HP1');
    expect(hp1Wins).toHaveLength(0);
  });

  it('out-of-bounds reel voids the rule', () => {
    // Mirrors Rust `pattern_out_of_bounds_reel_voids_rule` — kills the
    // `|| → &&` mutant on the bounds check.
    const ir = loadFixture();
    const cfg = irToGameConfig(ir);
    const { wildSymbols, specialSymbols } = makeContext(ir);
    const grid = makeGrid(cfg.numRows, cfg.numReels, 'HP1');
    const result = evaluatePattern({
      grid,
      rules: [
        {
          id: 'oob_reel',
          positions: [
            [0, 0],
            [0, 99],
          ],
          payMultiplier: 100,
        },
      ],
      totalBetMc: 1000,
      wildSymbols,
      specialSymbols,
    });
    expect(result.totalWinMc).toBe(0);
  });

  it('out-of-bounds row voids the rule', () => {
    const ir = loadFixture();
    const cfg = irToGameConfig(ir);
    const { wildSymbols, specialSymbols } = makeContext(ir);
    const grid = makeGrid(cfg.numRows, cfg.numReels, 'HP1');
    const result = evaluatePattern({
      grid,
      rules: [
        {
          id: 'oob_row',
          positions: [
            [0, 0],
            [99, 0],
          ],
          payMultiplier: 100,
        },
      ],
      totalBetMc: 1000,
      wildSymbols,
      specialSymbols,
    });
    expect(result.totalWinMc).toBe(0);
  });

  it('empty pattern list (Some(empty)) is preserved through serialise', () => {
    // Manually craft a TS config with empty rules and check JSON
    // round-trip — mirrors the Rust `empty_pattern_list_round_trips_as_some`.
    const empty: import('../src/ir/adapter.js').TSPatternConfig = { rules: [] };
    const json = JSON.stringify(empty);
    expect(JSON.parse(json)).toEqual(empty);
  });

  it('produces byte-stable JSON for identical input (parity-safe)', () => {
    const ir = loadFixture();
    const a = JSON.stringify(irToGameConfig(ir).pattern);
    const b = JSON.stringify(irToGameConfig(ir).pattern);
    expect(a).toBe(b);
  });
});
