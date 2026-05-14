/**
 * Faza 10.3 — full TS↔Rust per-spin byte-match parity gate.
 *
 * Extends the Wave 8 `evaluator_parity.test.ts` (self-determinism +
 * schema + aggregate RTP) with the gold standard: every cell of every
 * grid across N spins must be IDENTICAL between the Rust generator
 * and a TS mirror that runs Mulberry32 + the same weighted-sampling
 * inner loop.
 *
 * Acceptance (this spec):
 *   * Run `evaluator_parity --seed S --spins N --config parity.json`.
 *   * For every emitted SpinRecord, rebuild the grid in TS via
 *     `generateMirrorGrid()` driven by the same Mulberry32 seed.
 *   * Compare `record.grid_symbols` to the TS reproduction.
 *   * Acceptance: 100% byte-match across **N=1000** spins (small N for
 *     CI runtime; the gate scales to 10M spinova locally — see the
 *     `BYTEMATCH_SPINS` env var).
 *
 * Why this matters (Faza 10.3 line item):
 *   GLI-19 §3.3 requires "identical RTP from identical seeds on every
 *   supported platform". The Wave 8 oracle proved Rust↔Rust
 *   self-determinism + aggregate RTP within fixture bands; that's
 *   necessary but not sufficient. This spec proves the **per-spin**
 *   reproducibility lab auditors actually request.
 *
 * Skip behaviour: auto-skips if `target/release/evaluator_parity`
 * doesn't exist. Build with:
 *
 *     cargo build --release --bin evaluator_parity
 *
 * Or via `make parity-bin` once the wave-8 target lands.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildMirrorWeightTables,
  generateMirrorGrid,
  type MirrorIRConfig,
} from '../src/parity/mirrorGridGenerator.js';
import { Mulberry32 } from '../src/rng/backends/Mulberry32.js';

const REPO_ROOT = join(__dirname, '..');
const BIN_PATH = join(REPO_ROOT, 'target', 'release', 'evaluator_parity');
const FIXTURE = join(REPO_ROOT, 'tests', 'fixtures', 'parity.json');

interface SpinRecord {
  spin: number;
  base_win: number;
  scatter_count: number;
  bonus_count: number;
  fs_triggered: boolean;
  hnw_triggered: boolean;
  fs_awarded: number;
  multiplier: number;
  final_win: number;
  grid_symbols: string[];
}

const BIN_OK = existsSync(BIN_PATH);
const SPINS = Number(process.env['BYTEMATCH_SPINS'] ?? 1000);
const SEED = Number(process.env['BYTEMATCH_SEED'] ?? 42);

function loadIR(): MirrorIRConfig {
  const raw = readFileSync(FIXTURE, 'utf8');
  const ir = JSON.parse(raw);
  return ir as MirrorIRConfig;
}

function runRust(spins: number, seed: number): SpinRecord[] {
  const proc = spawnSync(
    BIN_PATH,
    [
      '--config',
      FIXTURE,
      '--seed',
      String(seed),
      '--spins',
      String(spins),
    ],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
  );
  if (proc.status !== 0) {
    throw new Error(`evaluator_parity exit ${proc.status}: ${proc.stderr}`);
  }
  const lines = proc.stdout.trim().split('\n');
  return lines.map((l) => JSON.parse(l) as SpinRecord);
}

describe.skipIf(!BIN_OK)('Faza 10.3 — per-spin byte-match parity', () => {
  it('TS Mulberry32 mirror produces grids identical to Rust SlotRng', () => {
    const records = runRust(SPINS, SEED);
    expect(records.length).toBe(SPINS);

    const ir = loadIR();
    const weights = buildMirrorWeightTables(ir);
    const rng = new Mulberry32(SEED);

    let firstMismatch: { spin: number; ts: string[]; rust: string[] } | null = null;
    for (const rec of records) {
      const grid = generateMirrorGrid(ir, weights, rng);
      if (grid.length !== rec.grid_symbols.length) {
        firstMismatch = { spin: rec.spin, ts: grid, rust: rec.grid_symbols };
        break;
      }
      let mismatch = false;
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] !== rec.grid_symbols[i]) {
          mismatch = true;
          break;
        }
      }
      if (mismatch) {
        firstMismatch = { spin: rec.spin, ts: grid, rust: rec.grid_symbols };
        break;
      }
    }
    if (firstMismatch) {
      throw new Error(
        `byte-match FAIL at spin ${firstMismatch.spin}:\n` +
          `  ts:   ${firstMismatch.ts.join(',')}\n` +
          `  rust: ${firstMismatch.rust.join(',')}`
      );
    }
  });

  it('byte-match holds for a second independent seed', () => {
    const records = runRust(200, 31415);
    const ir = loadIR();
    const weights = buildMirrorWeightTables(ir);
    const rng = new Mulberry32(31415);
    for (const rec of records) {
      const grid = generateMirrorGrid(ir, weights, rng);
      expect(grid).toEqual(rec.grid_symbols);
    }
  });

  it('grid shape always equals reels × rows', () => {
    const records = runRust(50, 7);
    const ir = loadIR();
    const expectedLen = ir.topology.reels * ir.topology.rows;
    for (const rec of records) {
      expect(rec.grid_symbols.length).toBe(expectedLen);
    }
  });
});

describe('Faza 10.3 — TS mirror generator (unit)', () => {
  it('buildMirrorWeightTables sorts symbol ids lexicographically (matches Rust BTreeMap)', () => {
    const ir: MirrorIRConfig = {
      topology: { reels: 1, rows: 3 },
      symbols: [{ id: 'B' }, { id: 'A' }, { id: 'C' }],
      // JSON-source order is C, A, B but Rust BTreeMap re-orders to A, B, C.
      reels: { base: [{ C: 3, A: 1, B: 2 }] },
    };
    const tables = buildMirrorWeightTables(ir);
    // Sorted lex: A → idx 1, B → idx 0, C → idx 2.
    expect(tables[0].pairs).toEqual([
      [1, 1], // A
      [0, 2], // B
      [2, 3], // C
    ]);
    expect(tables[0].total).toBe(6);
  });

  it('buildMirrorWeightTables skips unknown symbol ids (matches Rust)', () => {
    const ir: MirrorIRConfig = {
      topology: { reels: 1, rows: 3 },
      symbols: [{ id: 'A' }, { id: 'B' }],
      reels: { base: [{ A: 1, B: 2, GHOST: 999 }] },
    };
    const tables = buildMirrorWeightTables(ir);
    expect(tables[0].pairs).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(tables[0].total).toBe(3);
  });

  it('buildMirrorWeightTables truncates non-integer weights like Rust u32', () => {
    const ir: MirrorIRConfig = {
      topology: { reels: 1, rows: 1 },
      symbols: [{ id: 'A' }],
      reels: { base: [{ A: 3.7 }] },
    };
    const tables = buildMirrorWeightTables(ir);
    expect(tables[0].pairs[0][1]).toBe(3);
  });

  it('generateMirrorGrid returns the sentinel id when total weight is 0', () => {
    const ir: MirrorIRConfig = {
      topology: { reels: 1, rows: 2 },
      symbols: [{ id: 'SENTINEL' }],
      reels: { base: [{}] },
    };
    const tables = buildMirrorWeightTables(ir);
    const rng = new Mulberry32(1);
    const grid = generateMirrorGrid(ir, tables, rng);
    expect(grid).toEqual(['SENTINEL', 'SENTINEL']);
  });

  it('generateMirrorGrid output length equals reels × rows', () => {
    const ir: MirrorIRConfig = {
      topology: { reels: 4, rows: 3 },
      symbols: [{ id: 'A' }, { id: 'B' }],
      reels: {
        base: [{ A: 1, B: 1 }, { A: 1, B: 1 }, { A: 1, B: 1 }, { A: 1, B: 1 }],
      },
    };
    const tables = buildMirrorWeightTables(ir);
    const rng = new Mulberry32(42);
    const grid = generateMirrorGrid(ir, tables, rng);
    expect(grid.length).toBe(12);
  });

  it('same seed produces identical grids (self-determinism)', () => {
    const ir = loadIR();
    const w = buildMirrorWeightTables(ir);
    const a = generateMirrorGrid(ir, w, new Mulberry32(99));
    const b = generateMirrorGrid(ir, w, new Mulberry32(99));
    expect(a).toEqual(b);
  });

  it('different seed produces different grids', () => {
    const ir = loadIR();
    const w = buildMirrorWeightTables(ir);
    const a = generateMirrorGrid(ir, w, new Mulberry32(1));
    const b = generateMirrorGrid(ir, w, new Mulberry32(2));
    expect(a).not.toEqual(b);
  });
});
