#!/usr/bin/env node
/**
 * Wave G4 — generate 10 NEW canonical IR pilot fixtures that cover the
 * grid topologies Studio's `renderPlayGrid` supports beyond the 5 seed
 * pilots (Wrath / QHP / Spartacus / Rainbow / Huff).
 *
 * Topology kinds Studio currently understands (from app.js line 2895
 * select widget):
 *   • rectangular   — `topology.{reels, rows}` arbitrary
 *   • variable_rows — Megaways-style per-reel rows
 *   • cluster       — square boards (Wrath / Sweet Bonanza)
 *   • hexagonal     — Reactoonz-style hex (rendered as square fallback
 *                     when Studio's hex path isn't wired — still validates
 *                     the parse/import pipeline + UX asserts)
 *
 * Generator emits each pilot to `pilots/<id>.ir.json`. The eyes runner
 * (`tools/cortex-eyes-grid-coverage.mjs`) imports them via the canonical
 * IR fast-path so we exercise the parser + workspace + render paths the
 * same way a real GDD designer would.
 *
 * Pilot vendor-neutrality: no franchise/vendor names in symbol IDs or
 * descriptions — pure mechanical templates.
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const PILOTS = resolve(dirname(__filename), '../pilots');
if (!existsSync(PILOTS)) mkdirSync(PILOTS, { recursive: true });

/* Industry-standard tier-weight template used by every generated pilot. */
function defaultPaytableFor(symId, tier) {
  if (tier === 'hp')      return { '3': 12,  '4': 60,  '5': 300 };
  if (tier === 'mp')      return { '3': 5,   '4': 20,  '5': 80  };
  if (tier === 'lp')      return { '3': 2,   '4': 8,   '5': 32  };
  if (tier === 'wild')    return { '3': 25,  '4': 100, '5': 500 };
  if (tier === 'scatter') return { '3': 5,   '4': 25,  '5': 200 };
  return { '3': 1, '4': 4, '5': 16 };
}

function buildSymbols(spec) {
  const out = [];
  for (let i = 1; i <= spec.hp; i++) out.push({ id: `HP${i}`, name: `Hi ${i}`, kind: 'hp' });
  for (let i = 1; i <= spec.mp; i++) out.push({ id: `MP${i}`, name: `Mid ${i}`, kind: 'mp' });
  for (let i = 1; i <= spec.lp; i++) out.push({ id: `LP${i}`, name: `Low ${i}`, kind: 'lp' });
  if (spec.wild)    out.push({ id: 'WLD', name: 'Wild',    kind: 'wild', substitutes: '*' });
  if (spec.scatter) out.push({ id: 'SCT', name: 'Scatter', kind: 'scatter' });
  return out;
}

function buildPaytable(symbols) {
  const pt = {};
  for (const s of symbols) {
    if (s.kind === 'wild' || s.kind === 'scatter') {
      pt[s.id] = defaultPaytableFor(s.id, s.kind);
    } else {
      pt[s.id] = defaultPaytableFor(s.id, s.kind);
    }
  }
  return pt;
}

function buildReelBag(symbols, weights) {
  /* Per-reel weighted bag: same shape Studio expects (line 4366 comment).
   * Defaults map the symbol tier → industry baseline weight: HP=2, MP=5,
   * LP=8, WILD=1, SCATTER=1. Some pilots override per-reel for realism. */
  const w = weights || { hp: 2, mp: 5, lp: 8, wild: 1, scatter: 1 };
  const bag = {};
  for (const s of symbols) bag[s.id] = w[s.kind] || 1;
  return bag;
}

function buildPaylines(reels, rows) {
  /* Standard center-line + zig-zag template used by every rectangular
   * pilot.  Generates up to 10 unique paylines on a 5-reel grid; smaller
   * reel counts get a subset. */
  const lines = [
    new Array(reels).fill(Math.floor(rows / 2)),     // center
    new Array(reels).fill(0),                         // top
    new Array(reels).fill(rows - 1),                  // bottom
  ];
  if (rows >= 3) {
    /* zig-zag top→center→bottom→center→top */
    lines.push(Array.from({ length: reels }, (_, i) => i % 2 === 0 ? 0 : (rows - 1)));
    lines.push(Array.from({ length: reels }, (_, i) => i % 2 === 0 ? (rows - 1) : 0));
  }
  return lines.slice(0, 10);
}

function writePilot(id, ir) {
  const path = resolve(PILOTS, `${id}.ir.json`);
  writeFileSync(path, JSON.stringify(ir, null, 2), 'utf8');
  console.log(`  ✓ ${id}.ir.json`);
  return path;
}

function buildRectangularPilot({ id, name, reels, rows, hp = 3, mp = 3, lp = 4 }) {
  const symbols = buildSymbols({ hp, mp, lp, wild: true, scatter: true });
  const reelsBase = Array.from({ length: reels }, () => buildReelBag(symbols));
  return {
    schema_version: '1.0.0',
    meta: {
      id, name,
      version: '1.0.0',
      description: `${reels}×${rows} rectangular pilot — vendor-neutral G4 fixture for cortex-eyes grid coverage.`,
      theme_tags: ['pilot', 'g4', 'rectangular', `${reels}x${rows}`],
      author: 'CORTI WAVE G4',
      created_at_utc: '2026-06-08T00:00:00Z',
    },
    topology: { kind: 'rectangular', reels, rows },
    symbols,
    reels: { mode: 'weighted', base: reelsBase, free_spins: reelsBase },
    evaluation: {
      kind: 'lines',
      paylines: buildPaylines(reels, rows),
      direction: 'ltr',
      min_match: 3,
      pay_left_to_right_only: true,
    },
    paytable: buildPaytable(symbols),
    features: [],
    target_rtp: 0.96,
    max_win_x: 5000,
  };
}

function buildClusterPilot({ id, name, side, hp = 2, mp = 3, lp = 4 }) {
  const symbols = buildSymbols({ hp, mp, lp, wild: true, scatter: false });
  const reelsBase = Array.from({ length: side }, () => buildReelBag(symbols));
  return {
    schema_version: '1.0.0',
    meta: {
      id, name,
      version: '1.0.0',
      description: `${side}×${side} cluster pilot — vendor-neutral G4 fixture for cortex-eyes grid coverage.`,
      theme_tags: ['pilot', 'g4', 'cluster', `${side}x${side}`],
      author: 'CORTI WAVE G4',
      created_at_utc: '2026-06-08T00:00:00Z',
    },
    topology: { kind: 'cluster', reels: side, rows: side },
    symbols,
    reels: { mode: 'weighted', base: reelsBase, free_spins: reelsBase },
    evaluation: { kind: 'cluster', min_cluster_size: 5 },
    paytable: buildPaytable(symbols),
    features: [{ id: 'cluster_pays', name: 'Cluster Pays' }],
    target_rtp: 0.965,
    max_win_x: 10000,
  };
}

function buildVariableRowsPilot({ id, name, reels = 6, rowsPerReel = [4, 5, 6, 6, 5, 4] }) {
  /* Megaways-style — every reel can spin 2-7 rows independently. We
   * model as `variable_rows` with a representative rowsPerReel layout. */
  const symbols = buildSymbols({ hp: 3, mp: 3, lp: 4, wild: true, scatter: true });
  const reelsBase = Array.from({ length: reels }, () => buildReelBag(symbols));
  return {
    schema_version: '1.0.0',
    meta: {
      id, name,
      version: '1.0.0',
      description: `${reels}-reel variable-rows pilot (per-reel rows ${JSON.stringify(rowsPerReel)}) — vendor-neutral G4 fixture.`,
      theme_tags: ['pilot', 'g4', 'variable_rows', 'megaways-style'],
      author: 'CORTI WAVE G4',
      created_at_utc: '2026-06-08T00:00:00Z',
    },
    topology: { kind: 'variable_rows', reels, rows: Math.max(...rowsPerReel), rowsPerReel },
    symbols,
    reels: { mode: 'weighted', base: reelsBase, free_spins: reelsBase },
    evaluation: { kind: 'ways', min_match: 3, ways_per_reel: rowsPerReel },
    paytable: buildPaytable(symbols),
    features: [{ id: 'cascading_wins', name: 'Cascading Wins' }],
    target_rtp: 0.964,
    max_win_x: 12000,
  };
}

function buildHexagonalPilot({ id, name, ring = 3 }) {
  /* Hexagonal grid topology — Studio's renderer falls back to a square
   * layout when hex isn't wired, but the IR is still well-formed so the
   * parse/import asserts pass. Ring=3 → 37 tiles standard Reactoonz layout. */
  const symbols = buildSymbols({ hp: 3, mp: 3, lp: 4, wild: true, scatter: false });
  const sideEquivalent = 1 + 2 * ring; // 7 for ring=3
  const reelsBase = Array.from({ length: sideEquivalent }, () => buildReelBag(symbols));
  return {
    schema_version: '1.0.0',
    meta: {
      id, name,
      version: '1.0.0',
      description: `Hexagonal ring=${ring} (${3 * ring * (ring + 1) + 1} tiles) pilot — vendor-neutral G4 fixture.`,
      theme_tags: ['pilot', 'g4', 'hexagonal', `ring${ring}`],
      author: 'CORTI WAVE G4',
      created_at_utc: '2026-06-08T00:00:00Z',
    },
    topology: { kind: 'hexagonal', reels: sideEquivalent, rows: sideEquivalent, ring },
    symbols,
    reels: { mode: 'weighted', base: reelsBase, free_spins: reelsBase },
    evaluation: { kind: 'cluster', min_cluster_size: 4 },
    paytable: buildPaytable(symbols),
    features: [{ id: 'cluster_pays', name: 'Hex Cluster Pays' }],
    target_rtp: 0.963,
    max_win_x: 8000,
  };
}

console.log('Wave G4 — generating extra pilots:');

const ROSTER = [
  // 4 rectangular variants (covers 3×3 through 7×5)
  buildRectangularPilot({ id: 'g4-rect-3x3-classic',    name: 'Classic 3×3',    reels: 3, rows: 3, hp: 2, mp: 2, lp: 3 }),
  buildRectangularPilot({ id: 'g4-rect-5x4-deluxe',     name: 'Deluxe 5×4',     reels: 5, rows: 4 }),
  buildRectangularPilot({ id: 'g4-rect-6x4-deluxe',     name: 'Deluxe 6×4',     reels: 6, rows: 4 }),
  buildRectangularPilot({ id: 'g4-rect-7x5-jumbo',      name: 'Jumbo 7×5',      reels: 7, rows: 5, hp: 4, mp: 4, lp: 5 }),
  // 3 cluster variants (6×6, 7×7, 8×8 family)
  buildClusterPilot({ id: 'g4-cluster-6x6-compact',     name: 'Cluster 6×6',    side: 6 }),
  buildClusterPilot({ id: 'g4-cluster-8x8-mega',        name: 'Cluster 8×8',    side: 8, hp: 3, mp: 4, lp: 5 }),
  buildClusterPilot({ id: 'g4-cluster-5x5-mini',        name: 'Cluster 5×5',    side: 5 }),
  // 2 variable_rows / Megaways variants
  buildVariableRowsPilot({ id: 'g4-megaways-6reel',     name: 'Megaways 6-reel',  reels: 6, rowsPerReel: [3, 4, 5, 5, 4, 3] }),
  buildVariableRowsPilot({ id: 'g4-megaways-6reel-max', name: 'Megaways 6-reel Max', reels: 6, rowsPerReel: [7, 7, 7, 7, 7, 7] }),
  // 1 hexagonal
  buildHexagonalPilot({ id: 'g4-hex-ring3',             name: 'Hexagonal Ring 3', ring: 3 }),
];

for (const ir of ROSTER) writePilot(ir.meta.id, ir);

console.log(`\nWave G4 — generated ${ROSTER.length} pilots → ${PILOTS}`);
