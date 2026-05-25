// Pattern-CE hold-and-win feature — port of `cash_eruption.rs`.

import type { CashEruptionPage, FireballValue, Ir, PotEntry } from "./ir.js";
import { Prng } from "./rng.js";

export type Pool = "low" | "med" | "high";

export class SetPoolPicker {
  lowCum: bigint;
  medCum: bigint;
  highCum: bigint;
  total: bigint;
  constructor(low: number, med: number, high: number, total: number) {
    this.lowCum = BigInt(low);
    this.medCum = BigInt(low + med);
    this.highCum = BigInt(low + med + high);
    this.total = BigInt(total || low + med + high);
  }
  pick(rng: Prng): Pool {
    const u32 = BigInt(rng.genU32());
    const r = this.total > 0n ? u32 % this.total : 0n;
    if (r < this.lowCum) return "low";
    if (r < this.medCum) return "med";
    return "high";
  }
}

type FbValue = { kind: "coin"; value: number } | { kind: "mini" } | { kind: "minor" } | { kind: "major" };

export class CumTable<T> {
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
  sample(rng: Prng): T {
    const r = Number(rng.genRangeI64(this.total));
    let lo = 0;
    let hi = this.cum.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.cum[mid]! <= r) lo = mid + 1;
      else hi = mid;
    }
    return this.items[lo]!;
  }
}

export class PoolDistribution {
  low: CumTable<FbValue>;
  med: CumTable<FbValue>;
  high: CumTable<FbValue>;
  miniValue = 0;
  minorValue = 0;
  majorValue = 0;

  constructor(values: FireballValue[], pots: Record<string, PotEntry> | undefined) {
    const lowPairs: Array<[FbValue, number]> = [];
    const medPairs: Array<[FbValue, number]> = [];
    const highPairs: Array<[FbValue, number]> = [];
    for (const v of values) {
      if (v.low && v.low > 0) lowPairs.push([{ kind: "coin", value: v.coin_value }, v.low]);
      if (v.med && v.med > 0) medPairs.push([{ kind: "coin", value: v.coin_value }, v.med]);
      if (v.high && v.high > 0) highPairs.push([{ kind: "coin", value: v.coin_value }, v.high]);
    }
    for (const [tier, pot] of Object.entries(pots ?? {})) {
      let kind: FbValue["kind"] | null = null;
      if (tier === "MINI") { kind = "mini"; this.miniValue = pot.value; }
      else if (tier === "MINOR") { kind = "minor"; this.minorValue = pot.value; }
      else if (tier === "MAJOR") { kind = "major"; this.majorValue = pot.value; }
      if (!kind) continue;
      const fb: FbValue = { kind } as FbValue;
      if (pot.low && pot.low > 0) lowPairs.push([fb, pot.low]);
      if (pot.med && pot.med > 0) medPairs.push([fb, pot.med]);
      if (pot.high && pot.high > 0) highPairs.push([fb, pot.high]);
    }
    this.low = new CumTable(lowPairs);
    this.med = new CumTable(medPairs);
    this.high = new CumTable(highPairs);
  }

  sample(rng: Prng, pool: Pool): number {
    const t = pool === "low" ? this.low : pool === "med" ? this.med : this.high;
    const v = t.sample(rng);
    if (v.kind === "coin") return v.value;
    if (v.kind === "mini") return this.miniValue;
    if (v.kind === "minor") return this.minorValue;
    return this.majorValue;
  }
}

export class CompiledCe {
  betMultiplier: number;
  setPool: SetPoolPicker;
  smallDist: PoolDistribution;
  bigDist: PoolDistribution;
  respin: Map<string, CumTable<number>>; // key = `${landed}|${remaining}`
  grandProbBase: number;
  grandProbFs: number;
  topAward: number;

  constructor(page: CashEruptionPage) {
    const fsw = page.fireballs_set_weights;
    const low = fsw.low ?? 0;
    const med = fsw.med ?? 0;
    const high = fsw.high ?? 0;
    const total = fsw.total ?? (low + med + high);
    this.setPool = new SetPoolPicker(low, med, high, total);
    this.smallDist = new PoolDistribution(page.small_fireball_values, page.mini_minor_major.small);
    this.bigDist = new PoolDistribution(page.big_fireball_values, page.mini_minor_major.big);
    this.respin = new Map();
    for (const [landedS, byRem] of Object.entries(page.respin_tables)) {
      const landed = Number(landedS);
      for (const [remS, slot] of Object.entries(byRem)) {
        const rem = Number(remS);
        const pairs: Array<[number, number]> = [];
        for (const [k, v] of Object.entries(slot)) {
          if (k === "total") continue;
          const nAdd = Number(k);
          if (v > 0) pairs.push([nAdd, v]);
        }
        pairs.sort((a, b) => a[0] - b[0]);
        this.respin.set(`${landed}|${rem}`, new CumTable(pairs));
      }
    }
    this.betMultiplier = page.bet_multiplier;
    this.grandProbBase = page.grand_prob_base ?? 0;
    this.grandProbFs = page.grand_prob_fs ?? 0;
    this.topAward = page.top_award ?? 0;
  }
}

export class CompiledCeAll {
  byBm: Map<number, CompiledCe>;
  constructor(ir: Ir) {
    this.byBm = new Map();
    for (const p of ir.cash_eruption_feature_pages) {
      this.byBm.set(p.bet_multiplier, new CompiledCe(p));
    }
  }
}

export type CeContext = "base" | "freeSpins";

export interface CeResult {
  payoutCoins: number;
  grandHit: boolean;
  finalFireballs: number;
}

export function runCashEruption(
  ce: CompiledCe,
  initialSamples: number,
  initialLanded: number,
  initialUseBig: boolean,
  ctx: CeContext,
  rng: Prng,
): CeResult {
  const res: CeResult = { payoutCoins: 0, grandHit: false, finalFireballs: initialLanded };
  const grandProb = ctx === "base" ? ce.grandProbBase : ce.grandProbFs;
  if (grandProb > 0 && rng.genF64() < grandProb) {
    res.grandHit = true;
    res.payoutCoins = ce.topAward;
    return res;
  }
  const pool = ce.setPool.pick(rng);
  const initialDist = initialUseBig ? ce.bigDist : ce.smallDist;
  const addsDist = ce.smallDist; // per Excel C3961, respin adds always use Small
  let payout = 0;
  for (let i = 0; i < initialSamples; i++) {
    payout += initialDist.sample(rng, pool);
  }
  let landed = initialLanded;
  let remaining = 3;
  while (remaining > 0) {
    const landedKey = Math.min(landed, 14);
    let table = ce.respin.get(`${landedKey}|${remaining}`);
    if (!table) {
      let k = landedKey;
      while (k >= 6) {
        const t = ce.respin.get(`${k}|${remaining}`);
        if (t) { table = t; break; }
        k--;
      }
    }
    if (!table) break;
    const nAdd = table.sample(rng);
    if (nAdd === 0) {
      remaining--;
      continue;
    }
    for (let i = 0; i < nAdd; i++) {
      payout += addsDist.sample(rng, pool);
    }
    landed = Math.min(landed + nAdd, 15);
    remaining = 3;
    if (landed >= 15) break;
  }
  res.payoutCoins = payout;
  res.finalFireballs = landed;
  return res;
}
