// CE COPY TEST — TS sim CLI mirror of `ce_sim.rs`.
// Usage: node dist/bin/sim.js --ir <path> --spins <N> [--bet-mult M] [--seed S]

import { loadIr } from "../ir.js";
import { Engine } from "../sim.js";

function parseArgs(argv: string[]): {
  ir: string; spins: number; betMult: number; seed: bigint;
} {
  const out = { ir: "", spins: 1_000_000, betMult: 1, seed: 0xCEC0_C0FEn };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--ir" && next) { out.ir = next; i++; }
    else if (a === "--spins" && next) { out.spins = Number(next); i++; }
    else if (a === "--bet-mult" && next) { out.betMult = Number(next); i++; }
    else if (a === "--seed" && next) { out.seed = BigInt(next); i++; }
  }
  if (!out.ir) {
    console.error("Usage: sim --ir <path> --spins <N> [--bet-mult M] [--seed S]");
    process.exit(1);
  }
  return out;
}

const args = parseArgs(process.argv);
const ir = loadIr(args.ir);
const eng = new Engine(ir);
const t0 = Date.now();
const s = eng.run(args.spins, args.betMult, args.seed);
const elapsed = (Date.now() - t0) / 1000;
const n = s.spins;
console.log(`== CE COPY TEST sim (TypeScript) ==`);
console.log(`SWID:           ${ir.meta.swid}`);
console.log(`Bet multiplier: ${args.betMult}`);
console.log(`Spins:          ${s.spins}`);
console.log(`Elapsed:        ${elapsed.toFixed(2)}s`);
console.log(`Spins/sec:      ${Math.round(s.spins / elapsed)}`);
console.log();
console.log(`=== RTP breakdown ===`);
console.log(`  Base game RTP            : ${(s.baseGameX / n).toFixed(6)}   (Excel ${ir.meta.rtp_breakdown.base_game.toFixed(6)})`);
console.log(`  CE from base RTP         : ${(s.ceFromBaseX / n).toFixed(6)}   (Excel ${ir.meta.rtp_breakdown.cash_eruption_from_base.toFixed(6)})`);
const fsTotalTarget = ir.meta.rtp_breakdown.free_spins + ir.meta.rtp_breakdown.cash_eruption_from_fs;
console.log(`  Free Spins RTP           : ${((s.fsLinesX + s.fsBvX + s.ceFromFsX) / n).toFixed(6)}   (Excel ${fsTotalTarget.toFixed(6)})`);
console.log(`    └─ FS line wins        : ${(s.fsLinesX / n).toFixed(6)}`);
console.log(`    └─ FS Big Volcano      : ${(s.fsBvX / n).toFixed(6)}`);
console.log(`    └─ CE from FS          : ${(s.ceFromFsX / n).toFixed(6)}   (Excel ${ir.meta.rtp_breakdown.cash_eruption_from_fs.toFixed(6)})`);
console.log(`  Total RTP                : ${(s.totalPayoutX / n).toFixed(6)}   (Excel ${ir.meta.rtp_total.toFixed(6)})`);
console.log();
console.log(`=== Hit/Win freq ===`);
console.log(`  Hit freq                 : ${(s.hits / n).toFixed(6)}   (Excel ${ir.meta.hit_frequency_all_line.toFixed(6)})`);
console.log(`  Win freq                 : ${(s.wins / n).toFixed(6)}   (Excel ${ir.meta.win_frequency_all_line.toFixed(6)})`);
console.log();
console.log(`=== Triggers ===`);
console.log(`  Free Spins   1 in ${s.fsTriggers ? (n / s.fsTriggers).toFixed(2) : "∞"}`);
console.log(`  CE base      1 in ${s.ceFromBaseTriggers ? (n / s.ceFromBaseTriggers).toFixed(2) : "∞"}`);
console.log(`  CE FS        1 in ${s.ceFromFsTriggers ? (n / s.ceFromFsTriggers).toFixed(2) : "∞"}`);
console.log(`  GRAND hits   ${s.grandHits}`);
console.log(`  Max spin     ${s.maxSingleX.toFixed(2)}×`);
