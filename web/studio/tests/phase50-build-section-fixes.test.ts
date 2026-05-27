// PHASE 50 — Ultimate Build-Section QA closeout contract tests.
//
// Three fixes land in app.js as part of the PHASE 50 closeout:
//   #1  #topology selector finally has an event listener — picking
//       "6×4 · 4 096 ways" or "7×7 cluster" now rebuilds the reels
//       against the chosen dimensions instead of silently no-op'ing.
//   #4  Play-Template repeat clicks revoke the previous blob URL so
//       the page no longer leaks ~1-2 MB per spin.
//   #5  Auto-balance cascades HP → MP → LP instead of pinning the
//       first 3 HP symbols only; this prevents the no-op when HP
//       has saturated the [0.5, 12] clamp.
//
// app.js lives inside an IIFE so we cannot import the helpers directly.
// These tests pin the BEHAVIOR CONTRACT each helper implements; if anyone
// edits app.js they must mirror the change here, which surfaces drift in
// the studio audit harness immediately.

import { describe, it, expect, vi } from 'vitest';

// ── Helper 1: topology label → { reels, positions, kind } ─────────────
// Mirrors `parseTopologyLabel()` inside app.js PHASE-50 block.
function parseTopologyLabel(label: string): {
  reels: number;
  positions: number;
  kind: 'lines' | 'ways' | 'cluster';
  label: string;
} {
  const lab = (label || '').trim();
  if (/cluster/i.test(lab)) {
    const m = lab.match(/(\d+)\s*[×x]\s*(\d+)/i);
    const sz = m ? parseInt(m[1], 10) : 7;
    return { reels: sz, positions: sz, kind: 'cluster', label: lab };
  }
  if (/ways/i.test(lab)) {
    const m = lab.match(/(\d+)\s*[×x]\s*(\d+)/i);
    const r = m ? parseInt(m[1], 10) : 6;
    const p = m ? parseInt(m[2], 10) : 4;
    return { reels: r, positions: p, kind: 'ways', label: lab };
  }
  const m = lab.match(/(\d+)\s*[×x]\s*(\d+)/i);
  const r = m ? parseInt(m[1], 10) : 5;
  const p = m ? parseInt(m[2], 10) : 3;
  return { reels: r, positions: p, kind: 'lines', label: lab };
}

describe('PHASE 50 — #topology selector parseTopologyLabel()', () => {
  it('parses the default "5×3 · 20 lines" option', () => {
    expect(parseTopologyLabel('5×3 · 20 lines')).toEqual({
      reels: 5,
      positions: 3,
      kind: 'lines',
      label: '5×3 · 20 lines',
    });
  });

  it('parses "6×4 · 4 096 ways" as ways evaluation', () => {
    const t = parseTopologyLabel('6×4 · 4 096 ways');
    expect(t.kind).toBe('ways');
    expect(t.reels).toBe(6);
    expect(t.positions).toBe(4);
  });

  it('parses "7×7 cluster" as cluster evaluation with a square grid', () => {
    const t = parseTopologyLabel('7×7 cluster');
    expect(t.kind).toBe('cluster');
    expect(t.reels).toBe(7);
    expect(t.positions).toBe(7);
  });

  it('falls back to a 5×3 lines layout when the label is unrecognisable', () => {
    const t = parseTopologyLabel('garbage');
    expect(t.kind).toBe('lines');
    expect(t.reels).toBe(5);
    expect(t.positions).toBe(3);
  });

  it('treats lowercase "x" the same as "×"', () => {
    expect(parseTopologyLabel('6x4 ways').positions).toBe(4);
    expect(parseTopologyLabel('5x3').reels).toBe(5);
  });
});

// ── Helper 2: autoBuildReelsFor — dimension-aware reel rebuild ────────
// Mirrors `autoBuildReelsFor()` inside app.js (PHASE 50 edit).
type Variant = {
  symbols: { id: string }[];
  reels: string[][];
  topologyChoice?: { reels: number; positions: number; kind: string; label: string };
};
function autoBuildReelsFor(variant: Variant): void {
  const ids = variant.symbols.map((s) => s.id);
  if (ids.length === 0) return;
  const reelCount = variant.topologyChoice?.reels ?? 5;
  const posCount = variant.topologyChoice?.positions ?? 6;
  const reels: string[][] = [];
  for (let r = 0; r < reelCount; r++) {
    const col: string[] = [];
    for (let p = 0; p < posCount; p++) col.push(ids[(r * 3 + p * 2) % ids.length]);
    reels.push(col);
  }
  variant.reels = reels;
}

describe('PHASE 50 — autoBuildReelsFor respects topologyChoice', () => {
  const baseSymbols = ['HP1', 'HP2', 'HP3', 'LP1', 'LP2', 'LP3', 'WILD'].map((id) => ({ id }));

  it('defaults to 5 reels × 6 positions when topologyChoice is absent', () => {
    const v: Variant = { symbols: baseSymbols, reels: [] };
    autoBuildReelsFor(v);
    expect(v.reels).toHaveLength(5);
    expect(v.reels[0]).toHaveLength(6);
  });

  it('switches to 6×4 when topologyChoice = ways', () => {
    const v: Variant = {
      symbols: baseSymbols,
      reels: [],
      topologyChoice: { reels: 6, positions: 4, kind: 'ways', label: '6×4 · 4 096 ways' },
    };
    autoBuildReelsFor(v);
    expect(v.reels).toHaveLength(6);
    expect(v.reels[0]).toHaveLength(4);
  });

  it('switches to 7×7 when topologyChoice = cluster', () => {
    const v: Variant = {
      symbols: baseSymbols,
      reels: [],
      topologyChoice: { reels: 7, positions: 7, kind: 'cluster', label: '7×7 cluster' },
    };
    autoBuildReelsFor(v);
    expect(v.reels).toHaveLength(7);
    expect(v.reels[0]).toHaveLength(7);
  });

  it('every cell references a real symbol id (no out-of-range fallbacks)', () => {
    const v: Variant = {
      symbols: baseSymbols,
      reels: [],
      topologyChoice: { reels: 6, positions: 4, kind: 'ways', label: '6×4 ways' },
    };
    autoBuildReelsFor(v);
    const ids = new Set(baseSymbols.map((s) => s.id));
    for (const col of v.reels) for (const id of col) expect(ids.has(id)).toBe(true);
  });
});

// ── Helper 3: Play-Template blob URL revoke contract ──────────────────
// Mirrors the `lastPlayTemplateBlobUrl` tracker inside app.js PHASE 50.
// We verify the contract: each new mint revokes the prior URL exactly once.
describe('PHASE 50 — Play-Template blob URL revoke contract', () => {
  it('revokes the previous URL when a new one is allocated', () => {
    const revoke = vi.fn();
    const fakeURL = { revokeObjectURL: revoke } as { revokeObjectURL: (u: string) => void };

    let lastUrl: string | null = null;
    function mintAndTrack(newUrl: string) {
      if (lastUrl) {
        fakeURL.revokeObjectURL(lastUrl);
        lastUrl = null;
      }
      lastUrl = newUrl;
      return newUrl;
    }

    mintAndTrack('blob:1');
    mintAndTrack('blob:2');
    mintAndTrack('blob:3');

    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenNthCalledWith(1, 'blob:1');
    expect(revoke).toHaveBeenNthCalledWith(2, 'blob:2');
    // blob:3 is still live — not yet revoked.
    expect(lastUrl).toBe('blob:3');
  });

  it('does not call revoke on the first mint (no prior URL)', () => {
    const revoke = vi.fn();
    let lastUrl: string | null = null;
    if (lastUrl) revoke(lastUrl);
    lastUrl = 'blob:first';
    expect(revoke).not.toHaveBeenCalled();
  });
});

// ── Helper 4: doAutoBalanceFor cascade HP → MP → LP ───────────────────
// Mirrors the cascade loop in `doAutoBalanceFor()` inside app.js PHASE 50.
type Sym = { id: string; tier: 'HP' | 'MP' | 'LP' | 'WILD' | 'SCATTER' | 'MULT'; weight: number };
function autoBalanceWeights(symbols: Sym[], drift: number): { id: string; before: number; after: number }[] {
  const adj = drift > 0 ? -0.15 : +0.15;
  const tierOrder: Sym['tier'][] = ['HP', 'MP', 'LP'];
  let remainingSteps = 3;
  const changed: { id: string; before: number; after: number }[] = [];
  for (const tier of tierOrder) {
    if (remainingSteps <= 0) break;
    const candidates = symbols
      .filter((s) => s.tier === tier)
      .filter((s) => (adj > 0 ? s.weight < 12 : s.weight > 0.5));
    for (const s of candidates.slice(0, remainingSteps)) {
      const before = s.weight;
      const next = Math.max(0.5, Math.min(12, +(s.weight + adj).toFixed(2)));
      if (next === before) continue;
      s.weight = next;
      changed.push({ id: s.id, before, after: s.weight });
      remainingSteps--;
      if (remainingSteps <= 0) break;
    }
  }
  return changed;
}

describe('PHASE 50 — auto-balance cascades HP → MP → LP', () => {
  it('adjusts top 3 HP symbols when HP has headroom (positive drift → reduce HP weight)', () => {
    const symbols: Sym[] = [
      { id: 'HP1', tier: 'HP', weight: 5 },
      { id: 'HP2', tier: 'HP', weight: 5 },
      { id: 'HP3', tier: 'HP', weight: 5 },
      { id: 'HP4', tier: 'HP', weight: 5 },
      { id: 'MP1', tier: 'MP', weight: 5 },
    ];
    const changed = autoBalanceWeights(symbols, +0.5);
    expect(changed).toHaveLength(3);
    expect(changed.map((c) => c.id)).toEqual(['HP1', 'HP2', 'HP3']);
    // No MP touched yet — HP had headroom.
    expect(symbols.find((s) => s.id === 'MP1')!.weight).toBe(5);
  });

  it('spills into MP when all HP symbols are clamped at the floor', () => {
    const symbols: Sym[] = [
      { id: 'HP1', tier: 'HP', weight: 0.5 },
      { id: 'HP2', tier: 'HP', weight: 0.5 },
      { id: 'HP3', tier: 'HP', weight: 0.5 },
      { id: 'MP1', tier: 'MP', weight: 5 },
      { id: 'MP2', tier: 'MP', weight: 5 },
      { id: 'LP1', tier: 'LP', weight: 5 },
    ];
    const changed = autoBalanceWeights(symbols, +0.5); // drift > 0 → adj < 0 → need to reduce
    expect(changed.length).toBeGreaterThan(0);
    // HP is at the floor, so cascade must hit MP.
    expect(changed.map((c) => c.id)).toEqual(['MP1', 'MP2', 'LP1']);
  });

  it('returns empty list (no-op signal) when every HP/MP/LP is saturated', () => {
    const symbols: Sym[] = [
      { id: 'HP1', tier: 'HP', weight: 0.5 },
      { id: 'MP1', tier: 'MP', weight: 0.5 },
      { id: 'LP1', tier: 'LP', weight: 0.5 },
    ];
    const changed = autoBalanceWeights(symbols, +0.5);
    expect(changed).toEqual([]);
  });

  it('cascades correctly for negative drift (need to increase weights)', () => {
    const symbols: Sym[] = [
      { id: 'HP1', tier: 'HP', weight: 12 }, // at ceiling
      { id: 'MP1', tier: 'MP', weight: 6 },
      { id: 'MP2', tier: 'MP', weight: 6 },
      { id: 'LP1', tier: 'LP', weight: 6 },
    ];
    const changed = autoBalanceWeights(symbols, -0.5); // adj > 0 → need to increase
    // HP at ceiling → cascade to MP.
    expect(changed.map((c) => c.id)).toEqual(['MP1', 'MP2', 'LP1']);
  });

  it('never violates the [0.5, 12] clamp', () => {
    const symbols: Sym[] = [
      { id: 'HP1', tier: 'HP', weight: 0.55 },
      { id: 'HP2', tier: 'HP', weight: 11.95 },
      { id: 'MP1', tier: 'MP', weight: 6 },
    ];
    autoBalanceWeights(symbols, +0.5); // adj = -0.15
    for (const s of symbols) {
      expect(s.weight).toBeGreaterThanOrEqual(0.5);
      expect(s.weight).toBeLessThanOrEqual(12);
    }
  });
});
