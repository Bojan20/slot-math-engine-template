// Reel sampler + weighted set picker — port of `reels.rs`.
//
// All sampling here uses `Prng.genRangeI64(total)` so the visible reel
// stop and Grid are bit-identical to the Rust engine when both fed the
// same IR + seed (parity-gate prerequisite).

import type { Ir, ReelSet, ReelStop } from "./ir.js";
import { Prng } from "./rng.js";

export class Strip {
  symbols: string[];
  cum: number[];
  total: number;

  constructor(entries: ReelStop[]) {
    this.symbols = entries.map((e) => e.symbol);
    this.cum = [];
    let running = 0;
    for (const e of entries) {
      running += e.weight;
      this.cum.push(running);
    }
    this.total = running;
  }

  sampleStop(rng: Prng): number {
    const r = Number(rng.genRangeI64(this.total));
    // partition_point: first index where cum > r.
    return partitionPoint(this.cum, (c) => c <= r);
  }

  visible(stop: number): [string, string, string] {
    const n = this.symbols.length;
    const top = stop === 0 ? n - 1 : stop - 1;
    const bot = stop + 1 >= n ? 0 : stop + 1;
    return [
      this.symbols[top]!,
      this.symbols[stop]!,
      this.symbols[bot]!,
    ];
  }
}

export class WeightedTable<T> {
  items: T[];
  cum: number[];
  total: number;
  constructor(pairs: Array<[T, number]>) {
    this.items = pairs.map((p) => p[0]);
    this.cum = [];
    let running = 0;
    for (const [, w] of pairs) {
      running += w;
      this.cum.push(running);
    }
    this.total = running;
  }
  sampleWithIndex(rng: Prng): [T, number] {
    const r = Number(rng.genRangeI64(this.total));
    const idx = partitionPoint(this.cum, (c) => c <= r);
    return [this.items[idx]!, idx];
  }
}

export class CompiledReelSet {
  set: number;
  strips: [Strip, Strip, Strip, Strip, Strip];
  constructor(rs: ReelSet) {
    const arr = rs.reels.map((r) => new Strip(r));
    if (arr.length !== 5) throw new Error("reel-set must have 5 reels");
    this.set = rs.set;
    this.strips = arr as [Strip, Strip, Strip, Strip, Strip];
  }
}

export class ReelSetPicker {
  sets: CompiledReelSet[];
  picker: WeightedTable<number>;
  constructor(sets: CompiledReelSet[], picker: WeightedTable<number>) {
    this.sets = sets;
    this.picker = picker;
  }
  static fromBg(ir: Ir): ReelSetPicker {
    return ReelSetPicker.fromIr(ir.bg_reel_sets, ir.bg_reel_set_weights.weights);
  }
  static fromFg(ir: Ir): ReelSetPicker {
    return ReelSetPicker.fromIr(ir.fg_reel_sets, ir.fg_reel_set_weights.weights);
  }
  private static fromIr(
    sets: ReelSet[],
    weights: Array<{ set: number; weight: number }>,
  ): ReelSetPicker {
    const byIdx = new Map<number, ReelSet>(sets.map((s) => [s.set, s]));
    const compiled: CompiledReelSet[] = [];
    const pairs: Array<[number, number]> = [];
    weights.forEach((w, i) => {
      const rs = byIdx.get(w.set);
      if (!rs) throw new Error(`reel set ${w.set} missing`);
      compiled.push(new CompiledReelSet(rs));
      pairs.push([i, w.weight]);
    });
    return new ReelSetPicker(compiled, new WeightedTable(pairs));
  }
  pick(rng: Prng): CompiledReelSet {
    const [idx] = this.picker.sampleWithIndex(rng);
    return this.sets[idx]!;
  }
}

export class Grid {
  cells: [
    [string, string, string],
    [string, string, string],
    [string, string, string],
    [string, string, string],
    [string, string, string],
  ];
  stops: [number, number, number, number, number];

  constructor() {
    this.cells = [
      ["", "", ""],
      ["", "", ""],
      ["", "", ""],
      ["", "", ""],
      ["", "", ""],
    ];
    this.stops = [0, 0, 0, 0, 0];
  }

  static spin(rs: CompiledReelSet, rng: Prng): Grid {
    const g = new Grid();
    for (let r = 0; r < 5; r++) {
      const stop = rs.strips[r]!.sampleStop(rng);
      g.stops[r] = stop;
      const view = rs.strips[r]!.visible(stop);
      for (let row = 0; row < 3; row++) g.cells[r]![row] = view[row]!;
    }
    return g;
  }

  static spinFsLinked(rs: CompiledReelSet, rng: Prng): Grid {
    const g = new Grid();
    // Reel 1
    const s0 = rs.strips[0]!.sampleStop(rng);
    g.stops[0] = s0;
    rs.strips[0]!.visible(s0).forEach((sym, row) => (g.cells[0]![row] = sym));
    // Linked 2/3/4 — one stop drawn from reel-3 strip
    const sLink = rs.strips[2]!.sampleStop(rng);
    const view = rs.strips[2]!.visible(sLink);
    for (let r = 1; r <= 3; r++) {
      g.stops[r] = sLink;
      for (let row = 0; row < 3; row++) g.cells[r]![row] = view[row]!;
    }
    // Reel 5
    const s4 = rs.strips[4]!.sampleStop(rng);
    g.stops[4] = s4;
    rs.strips[4]!.visible(s4).forEach((sym, row) => (g.cells[4]![row] = sym));
    return g;
  }

  cell(reel: number, row: number): string {
    return this.cells[reel]![row]!;
  }
}

function partitionPoint(cum: number[], pred: (c: number) => boolean): number {
  // Returns first index i for which pred(cum[i]) is false (binary search,
  // matches Rust slice::partition_point semantics).
  let lo = 0;
  let hi = cum.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (pred(cum[mid]!)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
