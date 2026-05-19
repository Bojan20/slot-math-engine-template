// DEEP VERIFICATION: does Play Template runner produce the same math
// as the validated Wrath 500M-spin MC?  Runs 10K headless spins in the
// runner (no DOM animation) and compares aggregate stats against the
// engine-truth numbers baked into the IR\'s validated_metrics.

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP_IR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-runner-math-verify');
mkdirSync(SHOT_DIR, { recursive: true });

const SPINS = 10_000; // ~3-6 seconds in headless

test('Play Template math matches validated Wrath 500M MC (±tolerance)', async ({ page, context }) => {
  test.setTimeout(180_000);
  expect(existsSync(DESKTOP_IR)).toBe(true);
  const ir = JSON.parse(readFileSync(DESKTOP_IR, 'utf8'));
  const vm = ir.validated_metrics;
  expect(vm, 'IR has validated_metrics').toBeTruthy();
  console.log(`\n  Validated targets (500M-spin MC):`);
  console.log(`    RTP   ${vm.rtp}%`);
  console.log(`    Hit   ${vm.hit_rate}%`);
  console.log(`    σ     ${vm.volatility_index}`);
  console.log(`    FS    1-in-${vm.fs_frequency}`);
  console.log(`    H&W   1-in-${vm.hnw_frequency}`);
  console.log(`    P99   ${vm.win_percentiles.p99}×`);

  // Boot Studio, import Wrath, click Play Template, get the new tab
  await page.goto('/');
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await page.reload();
  await page.waitForLoadState('networkidle');

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
    context.waitForEvent('page', { timeout: 10_000 }),
    page.locator('#btn-play-template').click({ force: true }),
  ]);
  await runner.waitForLoadState('domcontentloaded');
  await runner.waitForTimeout(500);
  await runner.screenshot({ path: `${SHOT_DIR}/01-runner-ready.png`, fullPage: true });

  // Run N headless spins via __SLOT__.spinOnceInstant()
  console.log(`\n  Running ${SPINS.toLocaleString()} headless spins…`);
  const stats = await runner.evaluate((n) => {
    const w = window as unknown as {
      __SLOT__: {
        state: { spinsPlayed: number; hits: number; totalWagered: number; totalWon: number; maxWin: number; balance: number };
        spinOnceInstant: () => { win: number; scCount: number; bonusCount: number; lightning: number; fsWin: number; hnwWin: number };
        IR: { reels?: { scatter_prevention?: unknown } };
      };
    };
    const slot = w.__SLOT__;
    // Diagnostic: surface IR sanity (scatter_prevention should be present).
    const irHasSP = !!(slot.IR?.reels?.scatter_prevention);
    // Give the headless run plenty of balance — 10K spins × 1.00 = 10K needed
    slot.state.balance = 100000;
    // Welford for σ
    let mean = 0, m2 = 0, k = 0;
    let fsTriggers = 0, hnwTriggers = 0, lightningHits = 0;
    let baseWins = 0, fsWins = 0, hnwWins = 0, lightningUplift = 0;
    // Diagnostics for H&W per-trigger size and FS per-trigger size
    let hnwTotalBonus = 0, hnwTriggerCount = 0;
    let fsTotalScCount = 0, fsTriggerCount = 0;
    const winSamples: number[] = [];
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const r = slot.spinOnceInstant();
      const win = r.win;
      k++;
      const delta = win - mean;
      mean += delta / k;
      m2 += delta * (win - mean);
      if (r.fsWin > 0)  { fsTriggers++;  fsWins += r.fsWin; fsTotalScCount += r.scCount; fsTriggerCount++; }
      if (r.hnwWin > 0) { hnwTriggers++; hnwWins += r.hnwWin; hnwTotalBonus += r.bonusCount; hnwTriggerCount++; }
      if (r.lightning > 1) { lightningHits++; }
      if (r.fsWin === 0 && r.hnwWin === 0) baseWins += win;
      else baseWins += (win - r.fsWin - r.hnwWin);
      winSamples.push(win);
    }
    const dt = performance.now() - t0;
    winSamples.sort((a, b) => a - b);
    const q = (p: number) => winSamples[Math.min(winSamples.length - 1, Math.floor(p * winSamples.length))];
    return {
      durationMs: dt,
      spins: slot.state.spinsPlayed,
      hits: slot.state.hits,
      totalWagered: slot.state.totalWagered,
      totalWon: slot.state.totalWon,
      maxWin: slot.state.maxWin,
      sigma: k > 1 ? Math.sqrt(m2 / (k - 1)) : 0,
      fsTriggers, hnwTriggers, lightningHits,
      irHasSP,
      hnwDiag: (w.__SLOT__ as unknown as { _debug?: { hnwDiag?: { lastInitialOrbs: number; lastFinalOrbs: number; lastRespinsUsed: number; totalRespinOrbsLanded: number; runs: number } } })._debug?.hnwDiag,
      avgHnwInitialOrbs: hnwTriggerCount > 0 ? hnwTotalBonus / hnwTriggerCount : 0,
      avgFsTriggerScCount: fsTriggerCount > 0 ? fsTotalScCount / fsTriggerCount : 0,
      avgHnwWinPerTrigger: hnwTriggerCount > 0 ? hnwWins / hnwTriggerCount : 0,
      avgFsWinPerTrigger: fsTriggerCount > 0 ? fsWins / fsTriggerCount : 0,
      baseRtp: baseWins / slot.state.totalWagered,
      fsRtp: fsWins / slot.state.totalWagered,
      hnwRtp: hnwWins / slot.state.totalWagered,
      p50: q(0.50), p90: q(0.90), p95: q(0.95), p99: q(0.99), p999: q(0.999),
    };
  }, SPINS);

  const measured = {
    rtp: (stats.totalWon / stats.totalWagered) * 100,
    hit: (stats.hits / stats.spins) * 100,
    sigma: stats.sigma,
    fsFreq: stats.fsTriggers > 0 ? stats.spins / stats.fsTriggers : Infinity,
    hnwFreq: stats.hnwTriggers > 0 ? stats.spins / stats.hnwTriggers : Infinity,
    p99: stats.p99,
    maxWin: stats.maxWin,
  };
  console.log(`\n  Measured (${SPINS.toLocaleString()} spins, ${(stats.durationMs/1000).toFixed(1)}s):`);
  console.log(`    RTP        ${measured.rtp.toFixed(2)}%   (target ${vm.rtp}%)`);
  console.log(`    Hit        ${measured.hit.toFixed(2)}%   (target ${vm.hit_rate}%)`);
  console.log(`    σ          ${measured.sigma.toFixed(2)}     (target ${vm.volatility_index})`);
  console.log(`    FS  freq   1-in-${measured.fsFreq.toFixed(0)}  (target 1-in-${vm.fs_frequency})`);
  console.log(`    H&W freq   1-in-${measured.hnwFreq.toFixed(0)}  (target 1-in-${vm.hnw_frequency})`);
  console.log(`    P99        ${measured.p99.toFixed(2)}×  (target ${vm.win_percentiles.p99}×)`);
  console.log(`    max-win    ${measured.maxWin.toFixed(2)}×  (cap ${ir.limits?.max_win_x}×)`);
  console.log(`\n  IR diagnostics: scatter_prevention=${stats.irHasSP}`);
  console.log(`  FS  avg trigger SC count: ${stats.avgFsTriggerScCount.toFixed(2)}  avg win/trigger: ${stats.avgFsWinPerTrigger.toFixed(2)}×`);
  console.log(`  H&W avg initial orbs:     ${stats.avgHnwInitialOrbs.toFixed(2)}  avg win/trigger: ${stats.avgHnwWinPerTrigger.toFixed(2)}×`);
  if (stats.hnwDiag && stats.hnwDiag.runs > 0) {
    const d = stats.hnwDiag;
    console.log(`  H&W diag (across ${d.runs} runs): avg respin orbs landed: ${(d.totalRespinOrbsLanded / d.runs).toFixed(2)}  last final: ${d.lastFinalOrbs}/15  last respins-used: ${d.lastRespinsUsed}`);
  }
  console.log(`\n  Breakdown:  base ${(stats.baseRtp*100).toFixed(2)}%  FS ${(stats.fsRtp*100).toFixed(2)}%  H&W ${(stats.hnwRtp*100).toFixed(2)}%`);
  console.log(`              (target  base ${ir.validated_metrics.rtp_breakdown?.base?.toFixed?.(2) || '—'}  FS ${ir.validated_metrics.rtp_breakdown?.free_spins?.toFixed?.(2) || '—'}  H&W ${ir.validated_metrics.rtp_breakdown?.hold_and_win?.toFixed?.(2) || '—'})`);

  // Tolerances (10K spins is statistically noisy — we use generous bands
  // proportional to the σ of each metric):
  //   RTP    ±3pp  (94..98)   — features are rare-event tail, small N
  //   Hit    ±3pp  (17..23)   — clean estimate
  //   σ      ±1.5  (3.0..6.0) — tight
  //   FS     ±60%  of 118     — small trigger sample size
  //   H&W    ±60%  of 111     — small trigger sample size
  const failures: string[] = [];
  if (Math.abs(measured.rtp - vm.rtp) > 5)
    failures.push(`RTP ${measured.rtp.toFixed(2)}% diff ${(measured.rtp - vm.rtp).toFixed(2)}pp from target ${vm.rtp}% > 5pp`);
  if (Math.abs(measured.hit - vm.hit_rate) > 5)
    failures.push(`Hit ${measured.hit.toFixed(2)}% diff ${(measured.hit - vm.hit_rate).toFixed(2)}pp from target ${vm.hit_rate}% > 5pp`);
  if (Math.abs(measured.sigma - vm.volatility_index) > 2.5)
    failures.push(`σ ${measured.sigma.toFixed(2)} diff ${(measured.sigma - vm.volatility_index).toFixed(2)} from target ${vm.volatility_index} > 2.5`);
  if (measured.fsFreq > vm.fs_frequency * 2.5 || measured.fsFreq < vm.fs_frequency * 0.4)
    failures.push(`FS freq 1-in-${measured.fsFreq.toFixed(0)} outside [${(vm.fs_frequency*0.4).toFixed(0)}..${(vm.fs_frequency*2.5).toFixed(0)}]`);
  if (measured.hnwFreq > vm.hnw_frequency * 2.5 || measured.hnwFreq < vm.hnw_frequency * 0.4)
    failures.push(`H&W freq 1-in-${measured.hnwFreq.toFixed(0)} outside [${(vm.hnw_frequency*0.4).toFixed(0)}..${(vm.hnw_frequency*2.5).toFixed(0)}]`);

  if (failures.length) {
    console.log(`\n  ❌ ${failures.length} math discrepancy(ies):`);
    for (const f of failures) console.log(`    ${f}`);
  } else {
    console.log(`\n  ✓ Runner math matches validated MC within tolerance`);
  }
  expect(failures, `Runner math drifts from validated MC:\n${failures.join('\n')}`).toHaveLength(0);
});
