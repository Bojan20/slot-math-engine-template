// Monte-Carlo driver — mirror of `sim.rs` (single-threaded, since TS lacks
// rayon-grade parallelism without workers; sufficient for parity-gate runs).

import { CompiledPaytable, evaluateBaseSpin, payoutTotalBetX } from "./base_game.js";
import { CompiledCeAll, runCashEruption } from "./cash_eruption.js";
import { runFreeSpins } from "./free_spins.js";
import type { Ir } from "./ir.js";
import { Grid, ReelSetPicker } from "./reels.js";
import { Prng } from "./rng.js";

export interface SimStats {
  spins: number;
  totalPayoutX: number;
  baseGameX: number;
  ceFromBaseX: number;
  fsLinesX: number;
  fsBvX: number;
  ceFromFsX: number;
  hits: number;
  wins: number;
  fsTriggers: number;
  ceFromBaseTriggers: number;
  ceFromFsTriggers: number;
  grandHits: number;
  maxSingleX: number;
  winsGe10x: number;
  winsGe20x: number;
  winsGe50x: number;
  winsGe100x: number;
  winsGe200x: number;
  winsGe500x: number;
  winsGe1000x: number;
  ceBasePayoutSumX: number;
  ceFsPayoutSumX: number;
  fsBonusPayoutSumX: number;
}

export function emptyStats(): SimStats {
  return {
    spins: 0,
    totalPayoutX: 0,
    baseGameX: 0,
    ceFromBaseX: 0,
    fsLinesX: 0,
    fsBvX: 0,
    ceFromFsX: 0,
    hits: 0,
    wins: 0,
    fsTriggers: 0,
    ceFromBaseTriggers: 0,
    ceFromFsTriggers: 0,
    grandHits: 0,
    maxSingleX: 0,
    winsGe10x: 0, winsGe20x: 0, winsGe50x: 0, winsGe100x: 0,
    winsGe200x: 0, winsGe500x: 0, winsGe1000x: 0,
    ceBasePayoutSumX: 0, ceFsPayoutSumX: 0, fsBonusPayoutSumX: 0,
  };
}

export class Engine {
  ir: Ir;
  bgPicker: ReelSetPicker;
  fgPicker: ReelSetPicker;
  basePt: CompiledPaytable;
  fsPt: CompiledPaytable;
  ceAll: CompiledCeAll;

  constructor(ir: Ir) {
    this.ir = ir;
    this.bgPicker = ReelSetPicker.fromBg(ir);
    this.fgPicker = ReelSetPicker.fromFg(ir);
    this.basePt = CompiledPaytable.fromIrBase(ir);
    this.fsPt = CompiledPaytable.fromIrFs(ir);
    this.ceAll = new CompiledCeAll(ir);
  }

  run(nSpins: number, betMultiplier: number, seed: bigint): SimStats {
    const rng = Prng.fromSeed(seed);
    const s = emptyStats();
    const ce = this.ceAll.byBm.get(betMultiplier);
    const totalBetCoins = 20 * betMultiplier;
    for (let i = 0; i < nSpins; i++) {
      const rs = this.bgPicker.pick(rng);
      const grid = Grid.spin(rs, rng);
      const bw = evaluateBaseSpin(grid, this.ir, this.basePt);
      let spinX = payoutTotalBetX(bw);
      s.baseGameX += spinX;
      if (bw.fireballCount >= 6) {
        s.ceFromBaseTriggers++;
        if (ce) {
          const r = runCashEruption(ce, bw.fireballCount, bw.fireballCount, false, "base", rng);
          const x = r.payoutCoins / totalBetCoins;
          s.ceFromBaseX += x;
          s.ceBasePayoutSumX += x;
          spinX += x;
          if (r.grandHit) s.grandHits++;
        }
      }
      if (bw.freeSpinsTriggered) {
        s.fsTriggers++;
        const fs = runFreeSpins(this.ir, this.fgPicker, this.fsPt, this.ceAll, betMultiplier, rng);
        const innerFsX = fs.payoutCoins / totalBetCoins;
        s.fsLinesX += fs.lineWinsCoins / totalBetCoins;
        s.fsBvX += fs.bigVolcanoCoins / totalBetCoins;
        s.ceFromFsX += fs.ceFromFsCoins / totalBetCoins;
        s.ceFsPayoutSumX += fs.ceFromFsCoins / totalBetCoins;
        s.fsBonusPayoutSumX += innerFsX;
        s.ceFromFsTriggers += fs.cashEruptionEventCount;
        if (fs.grandHit) s.grandHits++;
        spinX += innerFsX;
      }
      if (spinX > s.maxSingleX) s.maxSingleX = spinX;
      s.totalPayoutX += spinX;
      if (spinX > 0) s.hits++;
      if (spinX > 1) s.wins++;
      if (spinX >= 10) s.winsGe10x++;
      if (spinX >= 20) s.winsGe20x++;
      if (spinX >= 50) s.winsGe50x++;
      if (spinX >= 100) s.winsGe100x++;
      if (spinX >= 200) s.winsGe200x++;
      if (spinX >= 500) s.winsGe500x++;
      if (spinX >= 1000) s.winsGe1000x++;
      s.spins++;
    }
    return s;
  }
}
