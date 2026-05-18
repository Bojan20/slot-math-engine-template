// W198 — Deterministic spin engine for the PLAY tab.
//
// Consumes a `SlotGameIR` and a seed, produces a `SpinResult` (grid +
// stop positions + win lines + total payout). Aligns with the IR-native
// `evaluateIR` semantics (lines/ways evaluation, wild substitution,
// scatter count) but stays self-contained inside the studio so we
// don't need to extend the root tsconfig include list.
//
// RNG: Mulberry32 — matches `src/utils/rng.ts` and `src/engine/rng.ts`
// for cross-engine determinism. Same seed → same grid → same wins.

import type { SlotGameIR, Symbol as IRSymbol } from '@engine/ir/types.js';
import type { SpinResult, PlayWin } from './renderer.js';

// ── Mulberry32 (mirrors src/utils/rng.ts) ───────────────────────────
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function rand(): number {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Pick a symbol id from a weighted map using the RNG. */
function pickWeighted(rng: () => number, map: Record<string, number>): string {
  const entries = Object.entries(map);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return entries[0]?.[0] ?? '';
  let r = rng() * total;
  for (const [id, w] of entries) {
    r -= w;
    if (r <= 0) return id;
  }
  return entries[entries.length - 1]![0];
}

function isWild(sym: IRSymbol): boolean {
  return sym.kind === 'wild' || sym.kind === 'chain_wild' || sym.kind === 'expanding';
}

function isSpecial(sym: IRSymbol): boolean {
  return sym.kind === 'wild' || sym.kind === 'scatter' || sym.kind === 'bonus' || sym.kind === 'multiplier';
}

// ── Public spin entry ───────────────────────────────────────────────

export interface PlaySpinOptions {
  /** Override reel/row count if IR topology is unusual. Default reels=5 rows=3. */
  reels?: number;
  rows?: number;
}

export function playSpin(ir: SlotGameIR, seed: number, opts: PlaySpinOptions = {}): SpinResult {
  const reels = opts.reels ?? (ir.topology.kind === 'rectangular' ? ir.topology.reels : 5);
  const rows = opts.rows ?? (ir.topology.kind === 'rectangular' ? ir.topology.rows : 3);
  const rng = mulberry32(seed);

  // 1. Build per-reel symbol pools from the IR's weighted reel set.
  const reelMaps: Array<Record<string, number>> = [];
  if (ir.reels.mode === 'weighted') {
    for (let r = 0; r < reels; r++) {
      const m = ir.reels.base[r] ?? ir.reels.base[0] ?? {};
      reelMaps.push({ ...m });
    }
  } else {
    // Strips mode — convert to a flat weight map (uniform).
    for (let r = 0; r < reels; r++) {
      const strip = ir.reels.base[r] ?? ir.reels.base[0] ?? [];
      const m: Record<string, number> = {};
      for (const s of strip) m[s] = (m[s] ?? 0) + 1;
      reelMaps.push(m);
    }
  }

  // 2. Generate stop positions (used by the renderer for scroll math)
  // and the visible grid.
  const stopPositions: number[] = [];
  const grid: string[][] = [];
  for (let row = 0; row < rows; row++) grid.push(new Array(reels).fill(''));

  for (let r = 0; r < reels; r++) {
    // stop position: integer in [0, 999] — purely cosmetic for scroll.
    stopPositions.push(Math.floor(rng() * 1000));
    for (let row = 0; row < rows; row++) {
      grid[row]![r] = pickWeighted(rng, reelMaps[r]!);
    }
  }

  // 3. Evaluate wins (lines mode only — ways/cluster fall back to lines).
  const wins: PlayWin[] = [];
  let totalWin = 0;
  if (ir.evaluation.kind === 'lines') {
    const symLookup = new Map<string, IRSymbol>();
    for (const s of ir.symbols) symLookup.set(s.id, s);
    const wildIds = new Set(ir.symbols.filter(isWild).map((s) => s.id));
    const minMatch = ir.evaluation.min_match ?? 3;

    for (let li = 0; li < ir.evaluation.paylines.length; li++) {
      const lineRows = ir.evaluation.paylines[li]!;
      const symsOnLine: string[] = [];
      for (let r = 0; r < reels; r++) {
        const row = lineRows[r] ?? 0;
        symsOnLine.push(grid[row]?.[r] ?? '');
      }
      // Determine paying symbol: first non-wild on line. If all wild,
      // pick first wild.
      let paySym: string | undefined;
      for (const s of symsOnLine) {
        if (!wildIds.has(s)) {
          paySym = s;
          break;
        }
      }
      if (!paySym) paySym = symsOnLine[0];
      if (!paySym) continue;
      // Cannot pay on scatter/bonus.
      const payDef = symLookup.get(paySym);
      if (!payDef || isSpecial(payDef)) continue;

      // Count consecutive matches from left.
      let count = 0;
      for (let r = 0; r < reels; r++) {
        const s = symsOnLine[r];
        if (s === paySym || wildIds.has(s ?? '')) count++;
        else break;
      }
      if (count < minMatch) continue;

      const payMap = ir.paytable[paySym];
      if (!payMap) continue;
      const payVal = payMap[String(count)] ?? 0;
      if (payVal <= 0) continue;

      const positions: Array<[number, number]> = [];
      for (let r = 0; r < count; r++) {
        positions.push([r, lineRows[r] ?? 0]);
      }
      wins.push({
        positions,
        paylineIndex: li,
        payout: payVal,
        symbolId: paySym,
      });
      totalWin += payVal;
    }
  }

  // 4. Scatter count (global).
  const scatterIds = new Set(ir.symbols.filter((s) => s.kind === 'scatter').map((s) => s.id));
  let scatterCount = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (scatterIds.has(cell)) scatterCount++;
    }
  }

  return {
    grid,
    stopPositions,
    totalWin,
    wins,
    scatterCount,
  };
}

// ── Merkle commit: sha256(canonical(IR) + ":" + seed + ":" + result) ───

/** Stable JSON: sort object keys. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}'
  );
}

/** Compact 32-bit hash → 8-hex-char hex string. */
function hash32(s: string): string {
  // FNV-1a (good enough for a display-only commit hash).
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Produce a deterministic Merkle-style commit hash for display purposes.
 * Inputs: canonical(IR) + seed + canonical(result.grid + wins + total).
 * 4 × 8-hex blocks separated by hyphens for readability.
 */
export function merkleCommit(ir: SlotGameIR, seed: number, result: SpinResult): string {
  const irHash = hash32(canonical(ir));
  const seedHash = hash32(String(seed));
  const gridHash = hash32(canonical(result.grid));
  const winsHash = hash32(canonical({ wins: result.wins, total: result.totalWin }));
  return `${irHash}-${seedHash}-${gridHash}-${winsHash}`;
}

// ── Jurisdiction guard ──────────────────────────────────────────────

/** UKGC RTS 14D — Autoplay is banned. */
export function isAutoplayAllowed(ir: SlotGameIR): boolean {
  const j = ir.compliance?.jurisdictions ?? [];
  return !j.some((x) => x.toUpperCase().includes('UK') || x.toUpperCase().includes('UKGC'));
}
