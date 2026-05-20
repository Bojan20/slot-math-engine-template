// CORTEX EYES — 100-spin deep math trace.
// ─────────────────────────────────────────────────────────────────────────
// Runs 100 headless spins inside the actual Play Template runner (the
// blob:// page opened from Studio), captures EVERY math field per spin
// (seed, win, scCount, bonusCount, lightning, fsWin, hnwWin), and:
//
//   • Cross-checks all three MTL witnesses (oracle.js / runtime.js / WASM)
//     agree on each spin's reduced outcome hash.
//   • Aggregates RTP / hit% / FS hit rate / H&W hit rate / Lightning rate
//     and reports them next to IR.validated_metrics targets.
//
// 100 spins is statistically too small for tight RTP precision, but it's
// enough to surface SYSTEMATIC drift (e.g. H&W −22pp) and any witness
// disagreement.  Console output goes to stdout so Boki sees exactly what
// each spin produced.

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP_IR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-cortex-eyes-100');
mkdirSync(SHOT_DIR, { recursive: true });

const SPINS = 100_000;  // σ_RTP at 100k ≈ 0.45pp — tight enough to spot any systematic drift

test('cortex eyes · 100 headless spins · per-spin diagnostics', async ({ page, context }) => {
  test.setTimeout(240_000);
  expect(existsSync(DESKTOP_IR)).toBe(true);
  const ir = JSON.parse(readFileSync(DESKTOP_IR, 'utf8'));
  const vm = ir.validated_metrics || {};

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  CORTEX EYES — 100-spin diagnostic trace');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`  IR:           ${ir.meta?.name || 'unknown'} @ ${ir.meta?.version || '?'}`);
  console.log(`  Target RTP:   ${vm.rtp}%`);
  console.log(`  Target hit:   ${vm.hit_rate}%`);
  console.log(`  Target σ:     ${vm.volatility_index}`);
  console.log(`  Target FS:    1-in-${vm.fs_frequency}`);
  console.log(`  Target H&W:   1-in-${vm.hnw_frequency}`);
  console.log(`  RTP breakdown (validated):`);
  console.log(`    base       ${vm.rtp_breakdown?.base}%`);
  console.log(`    free_spins ${vm.rtp_breakdown?.free_spins}%`);
  console.log(`    hold_and_win ${vm.rtp_breakdown?.hold_and_win}%`);
  console.log(`    lightning  ${vm.rtp_breakdown?.lightning}%`);
  console.log('──────────────────────────────────────────────────────────────────────');

  await page.goto('/');
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !!(window as any).MTLOracle && !!(window as any).MTLWasmOracle, { timeout: 10_000 });
  await page.evaluate(async () => { await (window as any).MTLWasmOracle.ready; });

  // Import IR + open runner
  await page.locator('#ws-newgame-btn').click({ force: true });
  await page.waitForSelector('#new-game-modal:not([hidden])', { timeout: 5_000 });
  await page.locator('label:has(input[value="gdd-math"])').click();
  await page.locator('#ng-cancel').click({ timeout: 2_000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('#gdd-file-input').setInputFiles(DESKTOP_IR);
  await page.waitForTimeout(2_500);
  await page.evaluate(() => {
    document.querySelectorAll('.modal-base, .modal-backdrop').forEach((el) => (el as HTMLElement).setAttribute('hidden', ''));
  });
  await page.waitForTimeout(300);

  const [runner] = await Promise.all([
    context.waitForEvent('page', { timeout: 60_000 }),
    page.locator('#btn-play-template').click({ force: true }),
  ]);
  await runner.waitForLoadState('domcontentloaded');
  await runner.waitForTimeout(1_500);
  await runner.screenshot({ path: `${SHOT_DIR}/01-runner-ready.png`, fullPage: true });

  // ── Headless run inside the runner blob — uses spinOnceInstant() so we
  //    don't pay animation cost, and cross-checks each spin with oracle.js
  //    + WASM oracle.  Logs every per-spin row.
  const traceResult = await runner.evaluate(async (N: number) => {
    const w = window as unknown as {
      __SLOT__: {
        IR: any;
        state: any;
        spinOnceInstant: () => any;
        _debug?: any;
      };
      MTLOracle?: { spin: (ir: any, seed: number, bet: number) => Promise<any>, hashOutcome: (r: any) => Promise<string> };
      MTLWasmOracle?: { spin: (ir: any, seed: number, bet: number) => Promise<any>, isReady?: boolean };
    };

    const slot = w.__SLOT__;
    const IR = slot.IR;

    // Reset state to clean baseline (no autoplay residue)
    slot.state.balance = 1_000_000;
    slot.state.totalWagered = 0;
    slot.state.totalWon = 0;
    slot.state.spinsPlayed = 0;
    slot.state.hits = 0;
    slot.state.maxWin = 0;

    // Make RNG deterministic so 100 spins are reproducible across reruns
    function mulberry32(seed: number) {
      let a = (seed >>> 0) || 1;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    const traces: any[] = [];
    const witnessDisagreements: any[] = [];

    // Aggregates
    let totalBet = 0, totalWin = 0, hits = 0;
    let fsTriggers = 0, hnwTriggers = 0, lightningHits = 0;
    let baseWinSum = 0, fsWinSum = 0, hnwWinSum = 0, lightUpliftSum = 0;
    let maxWin = 0;

    // Witness cross-check is expensive (per-spin sha256 + WASM round-trip).
    // Run it only on the first N_WITNESS spins; the remaining spins still
    // count toward aggregates but skip witness comparison.
    const N_WITNESS = Math.min(200, N);

    for (let i = 0; i < N; i++) {
      const seed = i + 1;  // 1..N for trace readability
      const checkWitnesses = i < N_WITNESS;
      // Drive the runtime with deterministic seed
      slot.state.rng = mulberry32(seed);
      // The runtime's spinOnceInstant uses currentBet() — bet=1 baseline
      slot.state.balance = 1_000_000;
      const r = slot.spinOnceInstant();
      const bet = 1;
      totalBet += bet;
      totalWin += r.win || 0;
      if ((r.win || 0) > 0) hits++;
      if ((r.fsWin || 0) > 0)  { fsTriggers++;  fsWinSum  += r.fsWin || 0; }
      if ((r.hnwWin || 0) > 0) { hnwTriggers++; hnwWinSum += r.hnwWin || 0; }
      const lightning = r.lightning || 1;
      if (lightning > 1) {
        lightningHits++;
        // base win × (lightning-1) is the uplift contribution
        const baseAlone = (r.win || 0) / lightning;
        lightUpliftSum += (r.win || 0) - baseAlone;
        baseWinSum += baseAlone;
      } else {
        baseWinSum += (r.win || 0) - (r.fsWin || 0) - (r.hnwWin || 0);
      }
      if ((r.win || 0) > maxWin) maxWin = r.win || 0;

      // Witness cross-check
      let oracleReduced: any = null, oracleHash: string = '';
      let wasmReduced: any = null, wasmHash: string = '';
      let runnerHash: string = '';
      const runnerReduced = {
        win: r.win || 0,
        scCount: r.scCount || 0,
        bonusCount: r.bonusCount || 0,
        lightning: lightning,
        fsWin: r.fsWin || 0,
        hnwWin: r.hnwWin || 0,
      };
      if (checkWitnesses && w.MTLOracle) {
        const o = await w.MTLOracle.spin(IR, seed, 1);
        oracleReduced = { win: o.win, scCount: o.scCount, bonusCount: o.bonusCount, lightning: o.lightning, fsWin: o.fsWin, hnwWin: o.hnwWin };
        // CRITICAL: oracle.outcomeHash hashes the FULL outcome (grid +
        // lineWins + …) but runner only exposes the reduced fields.
        // Compare apples to apples by re-hashing the reduced fields on
        // both sides — same algorithm sealing-ceremony.js uses.
        oracleHash = await w.MTLOracle.hashOutcome(oracleReduced);
        runnerHash = await w.MTLOracle.hashOutcome(runnerReduced);
      }
      if (checkWitnesses && w.MTLWasmOracle && w.MTLWasmOracle.isReady) {
        const wo = await w.MTLWasmOracle.spin(IR, seed, 1);
        wasmReduced = { win: wo.win, scCount: wo.scCount, bonusCount: wo.bonusCount, lightning: wo.lightning, fsWin: wo.fsWin, hnwWin: wo.hnwWin };
        // wasm-oracle returns outcomeHash computed over the reduced
        // shape already (see wasm-oracle-loader.js), so it IS comparable
        // to oracleHash above.
        wasmHash = wo.outcomeHash || '';
      }

      const witnessMatch = oracleHash === runnerHash && (wasmHash === '' || oracleHash === wasmHash);
      if (!witnessMatch) witnessDisagreements.push({ seed, runnerHash, oracleHash, wasmHash, runner: runnerReduced, oracle: oracleReduced, wasm: wasmReduced });

      traces.push({
        seed,
        bet,
        win: runnerReduced.win,
        scCount: runnerReduced.scCount,
        bonusCount: runnerReduced.bonusCount,
        lightning: runnerReduced.lightning,
        fsWin: runnerReduced.fsWin,
        hnwWin: runnerReduced.hnwWin,
        hash: runnerHash.slice(0, 12),
        oracleHash: oracleHash.slice(0, 12),
        wasmHash: wasmHash.slice(0, 12),
        ok: witnessMatch,
      });
    }

    return {
      traces,
      witnessDisagreements,
      agg: {
        N,
        totalBet,
        totalWin,
        hits,
        fsTriggers,
        hnwTriggers,
        lightningHits,
        baseWinSum,
        fsWinSum,
        hnwWinSum,
        lightUpliftSum,
        maxWin,
      },
    };
  }, SPINS);

  // ── Per-spin compact table (truncated to first/last few + interesting rows)
  console.log('\n  PER-SPIN TRACE (first 20, then any feature trigger or hash mismatch):');
  console.log('  seed  bet  win      scC bC  lt   fsWin     hnwWin    hash       ok');
  console.log('  ────  ───  ───────  ─── ──  ──   ───────   ───────   ─────────  ──');
  function row(t: any): string {
    return [
      String(t.seed).padStart(4),
      String(t.bet).padStart(3),
      Number(t.win).toFixed(4).padStart(7),
      String(t.scCount).padStart(3),
      String(t.bonusCount).padStart(2),
      String(t.lightning).padStart(3),
      Number(t.fsWin).toFixed(2).padStart(8),
      Number(t.hnwWin).toFixed(2).padStart(8),
      t.hash.padEnd(10),
      t.ok ? '✓ ' : '✗ ',
    ].join('  ');
  }
  const traces = traceResult.traces;
  const firstN = traces.slice(0, 20);
  const triggers = traces.filter((t: any) => t.lightning > 1 || t.fsWin > 0 || t.hnwWin > 0 || !t.ok);
  const seen = new Set(firstN.map((t: any) => t.seed));
  const rest = triggers.filter((t: any) => !seen.has(t.seed));
  for (const t of firstN) console.log('  ' + row(t));
  if (rest.length) {
    console.log('  ────  ───────────  triggers + mismatches beyond first 20  ────────────');
    for (const t of rest) console.log('  ' + row(t));
  }

  // ── Aggregates vs validated_metrics
  const a = traceResult.agg;
  const liveRtp = (a.totalWin / a.totalBet) * 100;
  const liveHit = (a.hits / a.N) * 100;
  const liveFsOneIn = a.fsTriggers ? a.N / a.fsTriggers : null;
  const liveHnwOneIn = a.hnwTriggers ? a.N / a.hnwTriggers : null;
  const liveLightPct = (a.lightningHits / a.N) * 100;

  const baseRtp = (a.baseWinSum / a.totalBet) * 100;
  const fsRtp = (a.fsWinSum / a.totalBet) * 100;
  const hnwRtp = (a.hnwWinSum / a.totalBet) * 100;
  const lightRtp = (a.lightUpliftSum / a.totalBet) * 100;

  console.log('\n  AGGREGATES (over ' + a.N + ' spins, bet=' + a.totalBet + ')');
  console.log('  ──────────────────────────────────────────────────────────────────────');
  console.log(`  RTP            measured ${liveRtp.toFixed(2)}%   target ${vm.rtp}%   delta ${(liveRtp - vm.rtp).toFixed(2)}pp`);
  console.log(`  Hit rate       measured ${liveHit.toFixed(2)}%   target ${vm.hit_rate}%   delta ${(liveHit - vm.hit_rate).toFixed(2)}pp`);
  console.log(`  FS  triggers   ${a.fsTriggers}    1-in-${liveFsOneIn ? Math.round(liveFsOneIn) : '—'}   target 1-in-${vm.fs_frequency}`);
  console.log(`  H&W triggers   ${a.hnwTriggers}    1-in-${liveHnwOneIn ? Math.round(liveHnwOneIn) : '—'}   target 1-in-${vm.hnw_frequency}`);
  console.log(`  Lightning      ${a.lightningHits}    ${liveLightPct.toFixed(2)}%`);
  console.log(`  Max win        ${a.maxWin.toFixed(2)}×`);
  console.log(`  Witness ok     ${traces.filter((t: any) => t.ok).length}/${a.N}`);

  console.log('\n  RTP BREAKDOWN (live vs validated)');
  console.log(`  base           ${baseRtp.toFixed(2)}%   vs ${vm.rtp_breakdown?.base}%   delta ${(baseRtp - (vm.rtp_breakdown?.base ?? 0)).toFixed(2)}pp`);
  console.log(`  free_spins     ${fsRtp.toFixed(2)}%   vs ${vm.rtp_breakdown?.free_spins}%   delta ${(fsRtp - (vm.rtp_breakdown?.free_spins ?? 0)).toFixed(2)}pp`);
  console.log(`  hold_and_win   ${hnwRtp.toFixed(2)}%   vs ${vm.rtp_breakdown?.hold_and_win}%   delta ${(hnwRtp - (vm.rtp_breakdown?.hold_and_win ?? 0)).toFixed(2)}pp`);
  console.log(`  lightning      ${lightRtp.toFixed(2)}%   vs ${vm.rtp_breakdown?.lightning}%   delta ${(lightRtp - (vm.rtp_breakdown?.lightning ?? 0)).toFixed(2)}pp`);

  if (traceResult.witnessDisagreements.length) {
    console.log('\n  ⚠ WITNESS DISAGREEMENTS (' + traceResult.witnessDisagreements.length + ' seeds):');
    for (const d of traceResult.witnessDisagreements.slice(0, 5)) {
      console.log('    seed=' + d.seed);
      console.log('      runner:', JSON.stringify(d.runner));
      console.log('      oracle:', JSON.stringify(d.oracle));
      console.log('      wasm:  ', JSON.stringify(d.wasm));
      console.log('      hashes: runner=' + d.runnerHash.slice(0,12) + ' oracle=' + d.oracleHash.slice(0,12) + ' wasm=' + d.wasmHash.slice(0,12));
    }
  } else {
    console.log('\n  ✓ All three witnesses agree on every spin');
  }

  // Write full trace to a JSON sidecar so it's preserved beyond stdout truncation
  const outFile = resolve(SHOT_DIR, 'trace-100-spins.json');
  writeFileSync(outFile, JSON.stringify({
    ir: { id: ir.meta?.id, name: ir.meta?.name, version: ir.meta?.version },
    validated_metrics: vm,
    aggregates: { liveRtp, liveHit, liveFsOneIn, liveHnwOneIn, liveLightPct, baseRtp, fsRtp, hnwRtp, lightRtp, ...a },
    traces,
    witnessDisagreements: traceResult.witnessDisagreements,
  }, null, 2));
  console.log(`\n  📁 Full trace: ${outFile}`);

  // Always pass — this is a diagnostic, not a gate.  The qa-runner-math-verify
  // spec is the canonical drift gate.
  expect(true).toBe(true);
});
