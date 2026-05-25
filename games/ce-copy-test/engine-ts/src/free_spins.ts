// Free Spins bonus — port of `free_spins.rs`.

import type { CompiledPaytable } from "./base_game.js";
import { runCashEruption, type CompiledCeAll } from "./cash_eruption.js";
import type { Ir } from "./ir.js";
import { Grid, type ReelSetPicker } from "./reels.js";
import { Prng } from "./rng.js";

function linkedBlockLanded(grid: Grid, sym: string): number {
  return grid.cells[2]![1] === sym ? 1 : 0;
}

function normalizeBig(sym: string): string {
  return sym.startsWith("Big ") ? sym.slice("Big ".length) : sym;
}

function anyWildOnReel5(grid: Grid): boolean {
  for (let row = 0; row < 3; row++) if (grid.cells[4]![row] === "Wild") return true;
  return false;
}

function expandWildReel5(grid: Grid): Grid {
  const g = new Grid();
  for (let r = 0; r < 5; r++) {
    g.stops[r] = grid.stops[r]!;
    for (let row = 0; row < 3; row++) g.cells[r]![row] = grid.cells[r]![row]!;
  }
  for (let row = 0; row < 3; row++) g.cells[4]![row] = "Wild";
  return g;
}

function scoreFsLines(grid: Grid, ir: Ir, fsPt: CompiledPaytable): number {
  let totalCoins = 0;
  for (const pl of ir.paylines) {
    const cells: string[] = [];
    for (let r = 0; r < 5; r++) {
      const row = pl.rows[r];
      if (row === null || row === undefined) {
        cells.push("");
      } else {
        cells.push(grid.cells[r]![row]!);
      }
    }
    let symbol: string | null = null;
    for (const c of cells) {
      const n = normalizeBig(c);
      if (n !== "Wild" && n !== "Fireball" && n !== "Volcano") {
        symbol = n;
        break;
      }
    }
    if (symbol === null) continue;
    let count = 0;
    for (const c of cells) {
      const n = normalizeBig(c);
      if (n === symbol || n === "Wild") count++;
      else break;
    }
    if (count >= 4) {
      const p = fsPt.lines.get(`${symbol}|${count}`);
      if (p) totalCoins += p;
    }
  }
  return totalCoins;
}

export interface FsResult {
  payoutCoins: number;
  lineWinsCoins: number;
  bigVolcanoCoins: number;
  ceFromFsCoins: number;
  spinsPlayed: number;
  bigVolcanoCount: number;
  cashEruptionEventCount: number;
  grandHit: boolean;
}

export function runFreeSpins(
  ir: Ir,
  fgPicker: ReelSetPicker,
  fsPt: CompiledPaytable,
  ceAll: CompiledCeAll,
  betMultiplier: number,
  rng: Prng,
): FsResult {
  const res: FsResult = {
    payoutCoins: 0,
    lineWinsCoins: 0,
    bigVolcanoCoins: 0,
    ceFromFsCoins: 0,
    spinsPlayed: 0,
    bigVolcanoCount: 0,
    cashEruptionEventCount: 0,
    grandHit: false,
  };
  let remaining = 6;
  let played = 0;
  while (remaining > 0 && played < 15) {
    const rs = fgPicker.pick(rng);
    const grid = Grid.spinFsLinked(rs, rng);
    played++;
    remaining--;
    const bv = linkedBlockLanded(grid, "Big Volcano");
    if (bv > 0) {
      const p = fsPt.volcano.get(1);
      if (p !== undefined) {
        const totalBetCoins = 20 * betMultiplier;
        const bvPay = p * totalBetCoins * bv;
        res.payoutCoins += bvPay;
        res.bigVolcanoCoins += bvPay;
      }
      const extra = Math.min(3, Math.max(0, 15 - (played + remaining)));
      remaining += extra;
      res.bigVolcanoCount += bv;
    }
    const rawLines = scoreFsLines(grid, ir, fsPt);
    let lineUnits = rawLines;
    if (anyWildOnReel5(grid)) {
      const expanded = expandWildReel5(grid);
      const expLines = scoreFsLines(expanded, ir, fsPt);
      lineUnits = Math.max(rawLines, expLines);
    }
    const totalCoins = lineUnits * betMultiplier;
    res.payoutCoins += totalCoins;
    res.lineWinsCoins += totalCoins;
    // Pattern-CE trigger: one Big Fireball block = 9 cells of fireballs.
    const bfb = linkedBlockLanded(grid, "Big Fireball");
    if (bfb > 0) {
      const ce = ceAll.byBm.get(betMultiplier);
      if (ce) {
        // 1 BFB block → 1 initial sample from Big dist; 9-cell grid coverage.
        const r = runCashEruption(ce, bfb, bfb * 9, true, "freeSpins", rng);
        res.payoutCoins += r.payoutCoins;
        res.ceFromFsCoins += r.payoutCoins;
        res.cashEruptionEventCount += 1;
        if (r.grandHit) res.grandHit = true;
      }
    }
  }
  res.spinsPlayed = played;
  return res;
}
