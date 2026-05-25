// Base game evaluation — port of `base_game.rs`.
// Wild expansion + Volcano scatter + Pattern Win + Free Spins trigger.

import type { Ir, PaytableEntry } from "./ir.js";
import { Grid } from "./reels.js";

export class CompiledPaytable {
  lines: Map<string, number>; // key = `${symbol}|${count}`
  volcano: Map<number, number>;
  patternWinPays: number;

  constructor(
    lines: Map<string, number>,
    volcano: Map<number, number>,
    patternWinPays: number,
  ) {
    this.lines = lines;
    this.volcano = volcano;
    this.patternWinPays = patternWinPays;
  }

  static fromIrBase(ir: Ir): CompiledPaytable {
    const lines = new Map<string, number>();
    const volcano = new Map<number, number>();
    let patternWin = 0;
    for (const e of ir.paytable) {
      if (e.combo.length === 0) continue;
      const first = e.combo[0]!;
      if (first.startsWith("Any ") && first.endsWith(" Volcano")) {
        const count = Number(first.slice("Any ".length, -" Volcano".length));
        volcano.set(count, e.pays);
        continue;
      }
      if (first === "Pattern Win") {
        patternWin = e.pays;
        continue;
      }
      const sym = first;
      const count = e.combo.filter((c) => c === sym).length;
      lines.set(`${sym}|${count}`, e.pays);
    }
    return new CompiledPaytable(lines, volcano, patternWin);
  }

  static fromIrFs(ir: Ir): CompiledPaytable {
    const lines = new Map<string, number>();
    const volcano = new Map<number, number>();
    for (const e of ir.fs_paytable) {
      if (e.combo.length === 0) continue;
      const first = e.combo[0]!;
      if (first === "Big Volcano") {
        volcano.set(1, e.pays);
        continue;
      }
      const sym = first;
      const count = e.combo.filter((c) => c === sym).length;
      lines.set(`${sym}|${count}`, e.pays);
    }
    return new CompiledPaytable(lines, volcano, 0);
  }
}

export interface SpinWin {
  lineCoins: number;
  volcanoTotalBetX: number;
  patternTotalBetX: number;
  freeSpinsTriggered: boolean;
  volcanoCount: number;
  fireballCount: number;
  isPatternWin: boolean;
  isHit: boolean;
  isWin: boolean;
}

export function payoutTotalBetX(w: SpinWin): number {
  if (w.isPatternWin) return w.patternTotalBetX + w.volcanoTotalBetX;
  return w.lineCoins / 20.0 + w.volcanoTotalBetX;
}

function countOnGrid(grid: Grid, sym: string): number {
  let c = 0;
  for (let r = 0; r < 5; r++)
    for (let row = 0; row < 3; row++) if (grid.cells[r]![row] === sym) c++;
  return c;
}

function anyOnReel(grid: Grid, reel: number, sym: string): boolean {
  for (let row = 0; row < 3; row++) if (grid.cells[reel]![row] === sym) return true;
  return false;
}

function expandWilds(base: Grid): Grid {
  const g = new Grid();
  for (let r = 0; r < 5; r++) {
    g.stops[r] = base.stops[r]!;
    for (let row = 0; row < 3; row++) g.cells[r]![row] = base.cells[r]![row]!;
  }
  for (let reel = 1; reel < 5; reel++) {
    if (anyOnReel(base, reel, "Wild")) {
      for (let row = 0; row < 3; row++) g.cells[reel]![row] = "Wild";
    }
  }
  return g;
}

function scorePaylines(grid: Grid, ir: Ir, pt: CompiledPaytable): number {
  let totalCoins = 0;
  for (const pl of ir.paylines) {
    const cells: string[] = [];
    for (let r = 0; r < 5; r++) {
      const row = pl.rows[r];
      if (row === null || row === undefined) {
        // shouldn't happen for valid PAR-001 paylines
        cells.push("");
      } else {
        cells.push(grid.cells[r]![row]!);
      }
    }
    let symbol: string | null = null;
    for (const c of cells) {
      if (c !== "Wild" && c !== "Fireball" && c !== "Volcano") {
        symbol = c;
        break;
      }
    }
    if (symbol === null) {
      // All-Wild line
      let count = 0;
      for (const c of cells) if (c === "Wild") count++;
      else break;
      const p = pt.lines.get(`Wild|${count}`);
      if (p) totalCoins += p;
      continue;
    }
    const wildSubs = symbol !== "Fireball" && symbol !== "Volcano";
    let count = 0;
    for (const c of cells) {
      if (c === symbol || (wildSubs && c === "Wild")) count++;
      else break;
    }
    let leadingWilds = 0;
    for (const c of cells) {
      if (c === "Wild") leadingWilds++;
      else break;
    }
    const ownPay = count >= 3 ? (pt.lines.get(`${symbol}|${count}`) ?? 0) : 0;
    const wildPay = leadingWilds >= 3 ? (pt.lines.get(`Wild|${leadingWilds}`) ?? 0) : 0;
    totalCoins += Math.max(ownPay, wildPay);
  }
  return totalCoins;
}

function scoreVolcano(grid: Grid, pt: CompiledPaytable): [number, number] {
  const n = countOnGrid(grid, "Volcano");
  const pays = pt.volcano.get(n) ?? 0;
  return [n, pays];
}

function isPatternWin(base: Grid): boolean {
  for (let row = 0; row < 3; row++) if (base.cells[0]![row] !== "Red7") return false;
  for (let reel = 1; reel < 5; reel++) {
    if (!anyOnReel(base, reel, "Wild")) return false;
  }
  return true;
}

export function evaluateBaseSpin(
  baseGrid: Grid,
  ir: Ir,
  pt: CompiledPaytable,
): SpinWin {
  const pattern = isPatternWin(baseGrid);
  const w: SpinWin = {
    lineCoins: 0,
    volcanoTotalBetX: 0,
    patternTotalBetX: 0,
    freeSpinsTriggered: false,
    volcanoCount: 0,
    fireballCount: 0,
    isPatternWin: pattern,
    isHit: false,
    isWin: false,
  };
  if (pattern) w.patternTotalBetX = pt.patternWinPays;
  const rawLines = scorePaylines(baseGrid, ir, pt);
  const expanded = expandWilds(baseGrid);
  const expLines = scorePaylines(expanded, ir, pt);
  const lines = Math.max(rawLines, expLines);
  if (!pattern) w.lineCoins = lines;
  const [vCount, vPay] = scoreVolcano(baseGrid, pt);
  w.volcanoCount = vCount;
  w.volcanoTotalBetX = vPay;
  w.freeSpinsTriggered = vCount >= 3;
  w.fireballCount = countOnGrid(baseGrid, "Fireball");
  const payout = payoutTotalBetX(w);
  w.isHit = payout > 0;
  w.isWin = payout > 1;
  return w;
}
