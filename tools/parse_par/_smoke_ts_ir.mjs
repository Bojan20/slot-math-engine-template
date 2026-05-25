/**
 * W5.3 — TS engine smoke runner for codegen verification.
 *
 * Loads `<path>.ir.json`, validates via Zod, runs N spins through
 * `irSimulator.run()`, prints `RTP=… hits=… runtime_ms=…`. Used as a
 * post-codegen sanity gate (does the IR actually spin without panic).
 *
 * Usage:
 *   npx tsx tools/parse_par/_smoke_ts_ir.mjs <ir.json> [spins=10000] [seed=42]
 */
import { readFileSync } from 'node:fs';
import { SlotGameIRZ } from '../../src/ir/schema.ts';
import { runIRSimulation } from '../../src/engine/irSimulator.ts';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: tsx _smoke_ts_ir.mjs <path> [spins=10000] [seed=42]');
    process.exit(2);
  }
  const spins = parseInt(process.argv[3] || '10000', 10);
  const seed = parseInt(process.argv[4] || '42', 10);
  const ir = JSON.parse(readFileSync(arg, 'utf-8'));
  const parsed = SlotGameIRZ.safeParse(ir);
  if (!parsed.success) {
    console.error(`❌ ${arg} failed Zod validation`);
    for (const i of parsed.error.issues.slice(0, 5)) {
      console.error(`  · ${i.path.join('.')}: ${i.message}`);
    }
    process.exit(1);
  }

  const t0 = performance.now();
  let result;
  try {
    result = await runIRSimulation(parsed.data, { spins, seed, verbose: false });
  } catch (e) {
    console.error(`❌ runIRSimulation() threw: ${e instanceof Error ? e.message : e}`);
    if (e instanceof Error && e.stack) console.error(e.stack);
    process.exit(2);
  }
  const dt = performance.now() - t0;
  console.log(
    `✅ smoke OK  spins=${spins}  seed=${seed}  ` +
    `RTP=${result.rtp.toFixed(4)}  hitRate=${result.hitRate.toFixed(4)}  ` +
    `maxWin=${result.maxWinX.toFixed(0)}x  runtime_ms=${dt.toFixed(0)}`
  );
  process.exit(0);
}

main();
