#!/usr/bin/env node
/**
 * Wave G5 — Industry pattern matrix (synthetic IR factory).
 *
 * Generates N synthetic canonical-IR fixtures via Cartesian product of:
 *
 *   topology kind  × topology size  × symbol pool depth  × eval pattern
 *   ───────────────────────────────────────────────────────────────────
 *   rectangular        4 sizes        2 depth presets       lines/ways
 *   cluster            3 sizes        2 depth presets       cluster
 *   variable_rows      2 layouts      1 depth preset        ways
 *   hexagonal          1 ring         1 depth preset        cluster
 *
 *   →  (4×2×2) + (3×2×1) + (2×1×1) + (1×1×1) = 16 + 6 + 2 + 1 = 25
 *
 * Each fixture is well-formed canonical SlotGameIR — Studio's
 * importCanonicalIR fast-path consumes it without going through the
 * GDD narrative parser. Eyes runner can include them all (slower run)
 * or sample N via `--synth=N` flag.
 *
 * Output: tools/_synth-irs/synth-NNN.ir.json
 * Manifest: tools/_synth-irs/_manifest.json (id, kind, size, eval)
 *
 * Vendor-neutral: zero franchise / vendor names in any field.
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = resolve(dirname(__filename), '_synth-irs');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const REC_SIZES   = [[5, 3], [5, 4], [6, 4], [7, 5]];
const CLUS_SIZES  = [5, 6, 8];
const MEGA_LAYOUTS = [
  { reels: 6, rowsPerReel: [3, 4, 5, 5, 4, 3] },
  { reels: 6, rowsPerReel: [7, 7, 7, 7, 7, 7] },
];
const POOL_DEPTHS = [
  { id: 'shallow', hp: 2, mp: 2, lp: 3 },
  { id: 'deep',    hp: 4, mp: 4, lp: 5 },
];

function _basePay(tier) {
  if (tier === 'hp')      return { '3': 12,  '4': 60,  '5': 300 };
  if (tier === 'mp')      return { '3': 5,   '4': 20,  '5': 80  };
  if (tier === 'lp')      return { '3': 2,   '4': 8,   '5': 32  };
  if (tier === 'wild')    return { '3': 25,  '4': 100, '5': 500 };
  if (tier === 'scatter') return { '3': 5,   '4': 25,  '5': 200 };
  return { '3': 1, '4': 4, '5': 16 };
}
function _symbols(d) {
  const out = [];
  for (let i = 1; i <= d.hp; i++) out.push({ id: `HP${i}`, name: `Hi ${i}`, kind: 'hp' });
  for (let i = 1; i <= d.mp; i++) out.push({ id: `MP${i}`, name: `Mid ${i}`, kind: 'mp' });
  for (let i = 1; i <= d.lp; i++) out.push({ id: `LP${i}`, name: `Low ${i}`, kind: 'lp' });
  out.push({ id: 'WLD', name: 'Wild', kind: 'wild', substitutes: '*' });
  out.push({ id: 'SCT', name: 'Scatter', kind: 'scatter' });
  return out;
}
function _paytable(symbols) {
  const pt = {};
  for (const s of symbols) pt[s.id] = _basePay(s.kind);
  return pt;
}
function _bag(symbols) {
  const w = { hp: 2, mp: 5, lp: 8, wild: 1, scatter: 1 };
  const b = {};
  for (const s of symbols) b[s.id] = w[s.kind] || 1;
  return b;
}
function _paylines(reels, rows) {
  const out = [
    new Array(reels).fill(Math.floor(rows / 2)),
    new Array(reels).fill(0),
    new Array(reels).fill(rows - 1),
  ];
  return out.slice(0, 10);
}

function buildRectangular(reels, rows, depth, evalKind) {
  const symbols = _symbols(depth);
  const base = Array.from({ length: reels }, () => _bag(symbols));
  return {
    schema_version: '1.0.0',
    meta: {
      id: `synth-rect-${reels}x${rows}-${depth.id}-${evalKind}`,
      name: `Synth Rect ${reels}×${rows} ${depth.id} ${evalKind}`,
      version: '1.0.0',
      description: `Wave G5 synthetic — rectangular ${reels}×${rows} · ${depth.id} pool · ${evalKind} eval. Vendor-neutral.`,
      theme_tags: ['g5', 'synth', 'rectangular', `${reels}x${rows}`, depth.id, evalKind],
      author: 'CORTI WAVE G5',
      created_at_utc: '2026-06-08T00:00:00Z',
    },
    topology: { kind: 'rectangular', reels, rows },
    symbols,
    reels: { mode: 'weighted', base, free_spins: base },
    evaluation: evalKind === 'ways'
      ? { kind: 'ways', min_match: 3, ways_per_reel: Array(reels).fill(rows) }
      : { kind: 'lines', paylines: _paylines(reels, rows), direction: 'ltr', min_match: 3, pay_left_to_right_only: true },
    paytable: _paytable(symbols),
    features: [],
    limits: { target_rtp: 0.96, max_win_x: 5000 },
  };
}

function buildCluster(side, depth) {
  const symbols = _symbols(depth);
  const base = Array.from({ length: side }, () => _bag(symbols));
  return {
    schema_version: '1.0.0',
    meta: {
      id: `synth-cluster-${side}x${side}-${depth.id}`,
      name: `Synth Cluster ${side}×${side} ${depth.id}`,
      version: '1.0.0',
      description: `Wave G5 synthetic — cluster ${side}×${side} · ${depth.id} pool · cluster eval. Vendor-neutral.`,
      theme_tags: ['g5', 'synth', 'cluster', `${side}x${side}`, depth.id, 'cluster-eval'],
      author: 'CORTI WAVE G5',
      created_at_utc: '2026-06-08T00:00:00Z',
    },
    topology: { kind: 'cluster', reels: side, rows: side },
    symbols,
    reels: { mode: 'weighted', base, free_spins: base },
    evaluation: { kind: 'cluster', min_cluster_size: 5 },
    paytable: _paytable(symbols),
    features: [{ id: 'cluster_pays', name: 'Cluster Pays' }],
    limits: { target_rtp: 0.965, max_win_x: 10000 },
  };
}

function buildVariableRows(layout) {
  const symbols = _symbols(POOL_DEPTHS[0]);
  const base = Array.from({ length: layout.reels }, () => _bag(symbols));
  const layoutStr = layout.rowsPerReel.join('-');
  return {
    schema_version: '1.0.0',
    meta: {
      id: `synth-mega-${layout.reels}r-${layoutStr}`,
      name: `Synth Megaways ${layout.reels}r [${layoutStr}]`,
      version: '1.0.0',
      description: `Wave G5 synthetic — variable_rows ${layout.reels}-reel · ${layoutStr} · ways eval. Vendor-neutral.`,
      theme_tags: ['g5', 'synth', 'variable_rows', 'megaways-style', `${layout.reels}r`],
      author: 'CORTI WAVE G5',
      created_at_utc: '2026-06-08T00:00:00Z',
    },
    topology: { kind: 'variable_rows', reels: layout.reels, rows: Math.max(...layout.rowsPerReel), rowsPerReel: layout.rowsPerReel },
    symbols,
    reels: { mode: 'weighted', base, free_spins: base },
    evaluation: { kind: 'ways', min_match: 3, ways_per_reel: layout.rowsPerReel },
    paytable: _paytable(symbols),
    features: [{ id: 'cascading_wins', name: 'Cascading Wins' }],
    limits: { target_rtp: 0.964, max_win_x: 12000 },
  };
}

function buildHexagonal(ring) {
  const symbols = _symbols(POOL_DEPTHS[0]);
  const side = 1 + 2 * ring;
  const base = Array.from({ length: side }, () => _bag(symbols));
  return {
    schema_version: '1.0.0',
    meta: {
      id: `synth-hex-ring${ring}`,
      name: `Synth Hex Ring ${ring}`,
      version: '1.0.0',
      description: `Wave G5 synthetic — hexagonal ring=${ring} · cluster eval. Vendor-neutral.`,
      theme_tags: ['g5', 'synth', 'hexagonal', `ring${ring}`],
      author: 'CORTI WAVE G5',
      created_at_utc: '2026-06-08T00:00:00Z',
    },
    topology: { kind: 'hexagonal', reels: side, rows: side, ring },
    symbols,
    reels: { mode: 'weighted', base, free_spins: base },
    evaluation: { kind: 'cluster', min_cluster_size: 4 },
    paytable: _paytable(symbols),
    features: [{ id: 'cluster_pays', name: 'Hex Cluster Pays' }],
    limits: { target_rtp: 0.963, max_win_x: 8000 },
  };
}

console.log('Wave G5 — generating synthetic IR matrix:');

const all = [];
for (const [reels, rows] of REC_SIZES) {
  for (const depth of POOL_DEPTHS) {
    for (const evalKind of ['lines', 'ways']) {
      all.push(buildRectangular(reels, rows, depth, evalKind));
    }
  }
}
for (const side of CLUS_SIZES) {
  for (const depth of POOL_DEPTHS) {
    all.push(buildCluster(side, depth));
  }
}
for (const layout of MEGA_LAYOUTS) {
  all.push(buildVariableRows(layout));
}
all.push(buildHexagonal(3));

const manifest = [];
for (const ir of all) {
  const fname = `${ir.meta.id}.ir.json`;
  writeFileSync(resolve(OUT_DIR, fname), JSON.stringify(ir, null, 2), 'utf8');
  manifest.push({
    id: ir.meta.id,
    name: ir.meta.name,
    file: fname,
    topology: ir.topology.kind,
    eval: ir.evaluation.kind,
    reels: ir.topology.reels,
    rows: ir.topology.rows,
  });
  console.log(`  ✓ ${fname}`);
}
writeFileSync(
  resolve(OUT_DIR, '_manifest.json'),
  JSON.stringify({ count: all.length, generated_at_utc: new Date().toISOString(), fixtures: manifest }, null, 2),
  'utf8',
);
console.log(`\nWave G5 — generated ${all.length} synthetic IR fixtures → ${OUT_DIR}`);
console.log(`Manifest: _manifest.json (read by cortex-eyes-grid-coverage --synth)`);
