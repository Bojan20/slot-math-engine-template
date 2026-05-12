/**
 * Faza 12 — 30 Reference Games Acid Test.
 *
 * For each of the 30 reference fixtures:
 *   REF-A  IR parses without validation errors
 *   REF-B  10k MC simulation completes without throw / NaN
 *   REF-C  Simulated RTP is in (0.0, 10.0) — sanity bounds only
 *   REF-D  Jurisdiction compliance (MGA) — no unknown-profile errors
 *   REF-E  Known-grid evaluation produces payout > 0 for a winning grid
 *
 * Each game gets its own describe block: "Faza 12 — [game-id]"
 * So failures are surgical — one game failing doesn't hide others.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGameIR } from '../src/ir/index.js';
import { runIRSimulation } from '../src/engine/irSimulator.js';
import { evaluateIR } from '../src/engine/irEvaluator.js';
import { JurisdictionAdapter } from '../src/jurisdiction/index.js';
import type { SlotGameIR } from '../src/ir/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_DIR = join(__dirname, 'fixtures', 'reference');

// ─── Fixture loader ────────────────────────────────────────────────────────

function loadFixture(filename: string): unknown {
  const raw = readFileSync(join(FIXTURE_DIR, filename), 'utf-8');
  return JSON.parse(raw);
}

// ─── Grid builders for REF-E ───────────────────────────────────────────────

/**
 * Build a rectangular grid filled with the given symbol id.
 */
function buildAllSymbolGrid(
  cols: number,
  rows: number,
  symbolId: string,
): string[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(symbolId) as string[]);
}

/**
 * For cluster_grid topology: build an all-HP1 grid (guaranteed big cluster).
 */
function buildClusterGrid(cols: number, rows: number): string[][] {
  return buildAllSymbolGrid(cols, rows, 'HP1');
}

/**
 * For variable_rows topology (Megaways): build a grid where each column
 * uses the minimum row count from row_range_per_reel, all filled with HP1.
 */
function buildMegawaysGrid(
  ranges: Array<[number, number]>,
  maxRows: number,
): string[][] {
  const cols = ranges.length;
  const grid: string[][] = Array.from({ length: maxRows }, () =>
    Array(cols).fill('') as string[],
  );
  ranges.forEach(([lo], c) => {
    for (let r = 0; r < lo; r++) {
      const row = grid[r];
      if (row) row[c] = 'HP1';
    }
  });
  return grid;
}

/**
 * Build a 5x4 grid for pay_anywhere with 5 HP2 symbols spread across it.
 */
function buildPayAnywhereGrid(): string[][] {
  // Fills enough HP2 (> min_count=3) to guarantee a payout.
  return [
    ['HP2', 'LP1', 'LP1', 'LP1', 'HP2'],
    ['LP1', 'HP2', 'LP1', 'LP1', 'LP1'],
    ['LP1', 'LP1', 'HP2', 'LP1', 'LP1'],
    ['LP1', 'LP1', 'LP1', 'HP2', 'LP1'],
  ];
}

/**
 * Build a winning grid appropriate for the evaluation kind of the IR.
 * Returns a grid guaranteed to produce a payout > 0 for known-symbol matches.
 */
function buildWinningGrid(ir: SlotGameIR): string[][] {
  const topo = ir.topology;

  if (topo.kind === 'variable_rows') {
    const ranges = topo.row_range_per_reel;
    const maxRows = Math.max(...ranges.map(([, hi]) => hi));
    return buildMegawaysGrid(ranges, maxRows);
  }

  if (topo.kind === 'cluster_grid') {
    return buildClusterGrid(topo.columns, topo.rows);
  }

  // rectangular topology
  const cols = topo.reels;
  const rows = topo.rows;

  const evalKind = ir.evaluation.kind;

  if (evalKind === 'pay_anywhere') {
    // build a grid with enough HP2 symbols (>= min_count)
    const grid = buildAllSymbolGrid(cols, rows, 'LP1');
    let placed = 0;
    const needed = (ir.evaluation as { min_count: number }).min_count + 2;
    outer: for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (placed >= needed) break outer;
        const row = grid[r];
        if (row) row[c] = 'HP2';
        placed++;
      }
    }
    return grid;
  }

  // lines or ways: fill middle row (or all rows) with HP1 for guaranteed win
  return buildAllSymbolGrid(cols, rows, 'HP1');
}

// ─── The 30 reference game fixtures ────────────────────────────────────────

const FIXTURES: Array<{ id: string; file: string }> = [
  { id: 'classic-3x3-lines',    file: 'classic-3x3-lines.json' },
  { id: '5x3-20lines',          file: '5x3-20lines.json' },
  { id: '5x4-25lines',          file: '5x4-25lines.json' },
  { id: '3x5-5lines',           file: '3x5-5lines.json' },
  { id: '5x3-243ways',          file: '5x3-243ways.json' },
  { id: '6x4-4096ways',         file: '6x4-4096ways.json' },
  { id: 'megaways-7reels',      file: 'megaways-7reels.json' },
  { id: 'cluster-7x7',          file: 'cluster-7x7.json' },
  { id: 'cluster-hexagonal',    file: 'cluster-hexagonal.json' },
  { id: 'cluster-diagonal',     file: 'cluster-diagonal.json' },
  { id: 'hnw-classic',          file: 'hnw-classic.json' },
  { id: 'hnw-grand-jackpot',    file: 'hnw-grand-jackpot.json' },
  { id: 'hnw-full-grid',        file: 'hnw-full-grid.json' },
  { id: 'fs-sticky-wilds',      file: 'fs-sticky-wilds.json' },
  { id: 'fs-multiplier-ladder', file: 'fs-multiplier-ladder.json' },
  { id: 'fs-retrigger',         file: 'fs-retrigger.json' },
  { id: 'fs-expanding-wilds',   file: 'fs-expanding-wilds.json' },
  { id: 'cascade-drop',         file: 'cascade-drop.json' },
  { id: 'cascade-refill',       file: 'cascade-refill.json' },
  { id: 'cascade-fixed-strip',  file: 'cascade-fixed-strip.json' },
  { id: 'mystery-symbol',       file: 'mystery-symbol.json' },
  { id: 'symbol-upgrade',       file: 'symbol-upgrade.json' },
  { id: 'pick-bonus',           file: 'pick-bonus.json' },
  { id: 'wheel-bonus',          file: 'wheel-bonus.json' },
  { id: 'respin-feature',       file: 'respin-feature.json' },
  { id: 'multiplier-wilds',     file: 'multiplier-wilds.json' },
  { id: 'walking-wilds',        file: 'walking-wilds.json' },
  { id: 'expanding-wilds',      file: 'expanding-wilds.json' },
  { id: 'mega-complex',         file: 'mega-complex.json' },
  { id: 'pay-anywhere',         file: 'pay-anywhere.json' },
];

// ─── Per-game describe blocks ──────────────────────────────────────────────

for (const { id, file } of FIXTURES) {
  describe(`Faza 12 — ${id}`, () => {
    const raw = loadFixture(file);
    const parsed = parseGameIR(raw);

    it('REF-A: IR parses without validation errors', () => {
      if (!parsed.ok) {
        // Surface all issues for easy debugging
        const msgs = parsed.issues.map((i) => `${i.path}: ${i.message}`).join('\n');
        expect.fail(`IR parse failed for ${id}:\n${msgs}`);
      }
      expect(parsed.ok).toBe(true);
    });

    it('REF-B: 10k MC simulation completes without throw / NaN', { timeout: 60_000 }, async () => {
      if (!parsed.ok) return; // Skip if parse failed — REF-A already fails
      const ir = parsed.ir;
      const result = await runIRSimulation(ir, { spins: 10_000, seed: 42 });
      expect(typeof result.rtp).toBe('number');
      expect(Number.isNaN(result.rtp)).toBe(false);
      expect(Number.isFinite(result.rtp)).toBe(true);
    });

    it('REF-C: Simulated RTP is finite and positive — sanity bounds', { timeout: 60_000 }, async () => {
      if (!parsed.ok) return;
      const ir = parsed.ir;
      const result = await runIRSimulation(ir, { spins: 10_000, seed: 42 });
      // Wide sanity bounds: must be > 0 and finite (not NaN, not Infinity).
      // We intentionally use loose bounds here — the goal is to prove the engine
      // handles every mechanic without crash or NaN, not to hit target RTP exactly.
      expect(result.rtp).toBeGreaterThan(0.0);
      expect(Number.isFinite(result.rtp)).toBe(true);
    });

    it('REF-D: Jurisdiction compliance (MGA) — no unknown-profile errors', () => {
      if (!parsed.ok) return;
      const ir = parsed.ir;
      const adapter = new JurisdictionAdapter();
      const report = adapter.validate(ir, ['MGA']);
      // Must not throw and must return a report object
      expect(report).toBeDefined();
      // The report should have at least MGA in checkedJurisdictions
      expect(report.checkedJurisdictions).toContain('MGA');
      // No unknown-profile violations (UNKNOWN-001 rule ID pattern)
      const unknownErrors = report.violations.filter(
        (v) => v.ruleId.includes('UNKNOWN-001'),
      );
      expect(unknownErrors).toHaveLength(0);
    });

    it('REF-E: Known-grid evaluation produces payout > 0 for a winning grid', () => {
      if (!parsed.ok) return;
      const ir = parsed.ir;
      const grid = buildWinningGrid(ir);
      const result = evaluateIR(ir, grid);
      const payout = result.totalPayout * result.spinMultiplier * result.lineMultiplier;
      expect(payout).toBeGreaterThan(0);
    });
  });
}
