/**
 * IR-native Monte Carlo Simulator (Faza 2).
 *
 * Runs a configurable number of spins against a `SlotGameIR`, draws each
 * spin's grid from the IR's reel definition (weighted-per-cell or strips),
 * dispatches the win evaluation through `evaluateIR`, and accumulates RTP
 * / hit-rate / feature-trigger frequencies.
 *
 * The simulator is intentionally agnostic of the legacy `GameConfig`
 * pipeline — the entire spin loop reads from the IR directly so the same
 * code path drives lines, ways, cluster, pay-anywhere, pattern, and
 * Megaways games.
 */

import type { ReelSet, SlotGameIR } from '../ir/types.js';
import { mulberry32 } from './rng.js';
import { evaluateIR, type IRWinResult } from './irEvaluator.js';

// ─── Public API ────────────────────────────────────────────────────────────

export interface IRSimConfig {
  spins: number;
  /** Optional seed — defaults to the IR's `rng.default_seed`. */
  seed?: number;
  /** Print per-1k-spin progress / final breakdown to stderr. */
  verbose?: boolean;
}

export interface IRSimResult {
  spins: number;
  rtp: number;
  hitRate: number;
  /** Feature kind → 1-in-N average frequency. `Infinity` if never triggered. */
  featureTriggerFreqs: Record<string, number>;
  /** Largest single-spin total payout (multiplier × bet === multiplier here). */
  maxWinX: number;
  /** Cumulative win contribution per RTP source. `base` is always present. */
  rtpBreakdown: { base: number } & Record<string, number>;
}

// ─── Grid generators ───────────────────────────────────────────────────────

interface WeightedCell {
  ids: string[];
  weights: number[];
  total: number;
}

/**
 * Pre-build per-reel weighted draw tables for an IR with `mode: 'weighted'`.
 * Keys are sorted alphabetically to match the Rust side, which stores
 * weights in a `BTreeMap<String, f64>` (sorted-order iteration). Identical
 * iteration order is the precondition for RNG-level parity with the Rust
 * simulator: the same Mulberry32 sequence must pick the same symbol on
 * both sides.
 */
function buildWeightedDrawTables(
  reels: Extract<ReelSet, { mode: 'weighted' }>,
): WeightedCell[] {
  return reels.base.map((map) => {
    const ids = Object.keys(map).slice().sort();
    const weights = ids.map((id) => map[id] ?? 0);
    const total = weights.reduce((s, w) => s + w, 0);
    return { ids, weights, total };
  });
}

/** Generate one grid for a weighted reel-set IR. */
function generateWeightedGrid(
  rng: () => number,
  tables: WeightedCell[],
  numRows: number,
  rowCounts?: number[],
): string[][] {
  // grid[row][col]. Variable row counts: shorter columns fill from the top
  // with a sentinel '' so consumers can ignore them. The legacy evaluators
  // honour empty strings.
  const grid: string[][] = [];
  const numCols = tables.length;
  for (let r = 0; r < numRows; r++) {
    grid.push(new Array<string>(numCols).fill(''));
  }
  for (let c = 0; c < numCols; c++) {
    const table = tables[c];
    if (!table || table.total === 0) continue;
    const rowsForReel = rowCounts ? rowCounts[c] ?? numRows : numRows;
    for (let r = 0; r < rowsForReel; r++) {
      let roll = rng() * table.total;
      let chosen = table.ids[0] ?? '';
      for (let i = 0; i < table.ids.length; i++) {
        roll -= table.weights[i] ?? 0;
        if (roll <= 0) {
          chosen = table.ids[i] ?? '';
          break;
        }
      }
      const row = grid[r];
      if (row) row[c] = chosen;
    }
  }
  return grid;
}

/** Generate one grid for a strips reel-set IR. */
function generateStripsGrid(
  rng: () => number,
  reels: Extract<ReelSet, { mode: 'strips' }>,
  numRows: number,
  rowCounts?: number[],
): string[][] {
  const grid: string[][] = [];
  const numCols = reels.base.length;
  for (let r = 0; r < numRows; r++) {
    grid.push(new Array<string>(numCols).fill(''));
  }
  for (let c = 0; c < numCols; c++) {
    const strip = reels.base[c];
    if (!strip || strip.length === 0) continue;
    const rowsForReel = rowCounts ? rowCounts[c] ?? numRows : numRows;
    // Pick a random stop within the strip; window wraps the strip length.
    const stop = Math.floor(rng() * strip.length);
    for (let r = 0; r < rowsForReel; r++) {
      const sym = strip[(stop + r) % strip.length];
      const row = grid[r];
      if (row && sym !== undefined) row[c] = sym;
    }
  }
  return grid;
}

// ─── Topology helpers ──────────────────────────────────────────────────────

function topologyDims(ir: SlotGameIR): {
  numCols: number;
  numRows: number;
  variableRows?: Array<[number, number]>;
} {
  const t = ir.topology;
  switch (t.kind) {
    case 'rectangular':
      return { numCols: t.reels, numRows: t.rows };
    case 'variable_rows': {
      const maxRows = Math.max(...t.row_range_per_reel.map(([, hi]) => hi));
      return { numCols: t.reels, numRows: maxRows, variableRows: t.row_range_per_reel };
    }
    case 'cluster_grid':
      return { numCols: t.columns, numRows: t.rows };
  }
}

/** Draw per-reel row counts for variable_rows (Megaways-style). */
function drawRowCounts(
  rng: () => number,
  ranges: Array<[number, number]>,
): number[] {
  return ranges.map(([lo, hi]) => {
    const span = hi - lo + 1;
    return lo + Math.floor(rng() * span);
  });
}

// ─── Main entry point ──────────────────────────────────────────────────────

/**
 * Run the simulation. Returns aggregated metrics — does NOT keep per-spin
 * grids in memory (so 1M spins is fine). All randomness comes from a single
 * Mulberry32 stream seeded from `config.seed` (falls back to the IR's
 * `rng.default_seed`).
 */
export async function runIRSimulation(
  ir: SlotGameIR,
  config: IRSimConfig,
): Promise<IRSimResult> {
  const seed = config.seed ?? ir.rng.default_seed;
  const rng = mulberry32(seed);
  const { numCols, numRows, variableRows } = topologyDims(ir);

  // Pre-build draw tables for weighted mode (cheap to do once).
  let weightedTables: WeightedCell[] | null = null;
  if (ir.reels.mode === 'weighted') {
    weightedTables = buildWeightedDrawTables(ir.reels);
  }

  let totalWagered = 0;
  let totalWon = 0;
  let totalHits = 0;
  let maxWinX = 0;
  const featureCounts: Record<string, number> = {};
  const featureRtp: Record<string, number> = {};

  for (let i = 0; i < config.spins; i++) {
    totalWagered += 1; // one unit per spin — RTP is win/wager

    const rowCounts = variableRows ? drawRowCounts(rng, variableRows) : undefined;

    let grid: string[][];
    if (weightedTables) {
      grid = generateWeightedGrid(rng, weightedTables, numRows, rowCounts);
    } else if (ir.reels.mode === 'strips') {
      grid = generateStripsGrid(rng, ir.reels, numRows, rowCounts);
    } else {
      throw new Error('Unsupported reel set mode');
    }

    const result: IRWinResult = evaluateIR(ir, grid);
    totalWon += result.totalPayout;
    if (result.totalPayout > 0) totalHits++;
    if (result.totalPayout > maxWinX) maxWinX = result.totalPayout;

    // Capture per-feature trigger counts and (rough) RTP contribution.
    // Faza 2 does NOT simulate the feature itself — we record trigger
    // frequency only; sub-feature RTP attribution is a Faza 3 deliverable.
    for (const featKind of result.triggeredFeatures) {
      featureCounts[featKind] = (featureCounts[featKind] ?? 0) + 1;
    }

    if (config.verbose && (i + 1) % 100000 === 0) {
      const rtpSoFar = totalWon / totalWagered;
      process.stderr.write(
        `[irSim] ${i + 1} spins · RTP=${(rtpSoFar * 100).toFixed(3)}%\n`,
      );
    }
  }

  const featureTriggerFreqs: Record<string, number> = {};
  for (const [kind, cnt] of Object.entries(featureCounts)) {
    featureTriggerFreqs[kind] = cnt > 0 ? config.spins / cnt : Infinity;
  }

  const rtp = totalWagered > 0 ? totalWon / totalWagered : 0;
  const hitRate = config.spins > 0 ? totalHits / config.spins : 0;

  const rtpBreakdown: { base: number } & Record<string, number> = { base: rtp };
  for (const [kind, contribution] of Object.entries(featureRtp)) {
    rtpBreakdown[kind] = contribution;
  }

  return {
    spins: config.spins,
    rtp,
    hitRate,
    featureTriggerFreqs,
    maxWinX,
    rtpBreakdown,
  };
}
