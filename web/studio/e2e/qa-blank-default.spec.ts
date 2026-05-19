// QA: When Studio opens with no project loaded, every L1 metric and every
// visible field MUST read empty/dash — no placeholder numbers, no demo
// symbol names, no fake RTP/Hit/σ/P99/paytable.  Only when the user imports
// or builds something should real values appear.
//
// Run:  npx playwright test web/studio/e2e/qa-blank-default.spec.ts --reporter=list

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-blank-default');
mkdirSync(SHOT_DIR, { recursive: true });

test('Blank app: no placeholder values anywhere on first paint', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`PAGE-ERR: ${e.message}`));

  // Clean any persisted workspace state so we get a true cold start
  await page.goto('/');
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (_) {}
    try { indexedDB.deleteDatabase('studio-automc'); } catch (_) {}
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOT_DIR}/01-blank-cold-start.png`, fullPage: true });

  // ── Dump every value the user could possibly see ──
  const snapshot = await page.evaluate(() => {
    const txt = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return (el.textContent || '').trim();
    };
    return {
      l1: {
        rtp:   txt('#l1-rtp'),
        hit:   txt('#l1-hit'),
        sigma: txt('#l1-sigma'),
        p99:   txt('#l1-p99'),
      },
      // m-* mirrored metrics (used by some panels)
      mirror: {
        rtp:   txt('#m-mu'),
        sigma: txt('#m-sigma'),
        p99:   txt('#m-p99'),
      },
      symbolPoolCount: document.querySelectorAll('#sym-list .sym-row').length,
      paytableCells:   document.querySelectorAll('#paytable .pt-cell').length,
      reelCount:       document.querySelectorAll('#reels .reel').length,
      poolCount:       txt('#pool-count'),
      // Win feel + producer headlines
      winfeelPill:     txt('#winfeel-pill'),
      // Workspace pill
      wsName:          txt('#ws-name'),
      // Sidebar workspace items (first 3)
      sidebarItems: Array.from(document.querySelectorAll('.side-item[data-ws]')).slice(0, 5).map((el) => ({
        ws: (el as HTMLElement).dataset.ws,
        text: (el.textContent || '').trim().replace(/\s+/g, ' '),
      })),
    };
  });
  console.log('\n  Blank-app DOM snapshot:');
  console.log(JSON.stringify(snapshot, null, 2));

  // ── Assertions: NOTHING should be a real-looking placeholder ──
  const failures: string[] = [];

  // L1 metrics: should be 0 / 0.00 / 0.0× / "—" / blank — never the demo
  // numbers 96.4214 / 27.83 / 6.42 / 245.5×
  const looksLikeFakeRtp = /9[0-9]\.\d{2}/.test(snapshot.l1.rtp || '');
  const looksLikeFakeHit = /2[0-9]\.\d{2}|3[0-9]\.\d{2}/.test(snapshot.l1.hit || '');
  const looksLikeFakeSigma = /^[3-9]\.\d{2}$/.test(snapshot.l1.sigma || '');
  const looksLikeFakeP99 = /1\d{2}\.\d|24[0-9]\.\d|500\.0×/.test(snapshot.l1.p99 || '');

  if (looksLikeFakeRtp)   failures.push(`L1 rtp shows demo number: "${snapshot.l1.rtp}"`);
  if (looksLikeFakeHit)   failures.push(`L1 hit shows demo number: "${snapshot.l1.hit}"`);
  if (looksLikeFakeSigma) failures.push(`L1 sigma shows demo number: "${snapshot.l1.sigma}"`);
  if (looksLikeFakeP99)   failures.push(`L1 p99 shows demo number: "${snapshot.l1.p99}"`);

  // Symbol pool / paytable / reels: should all be 0 on cold start
  if (snapshot.symbolPoolCount > 0) failures.push(`Symbol pool has ${snapshot.symbolPoolCount} rows (expected 0)`);
  if (snapshot.paytableCells > 4)   failures.push(`Paytable has ${snapshot.paytableCells} cells (expected ≤ 4 header cells only)`);
  // Reels CAN render empty placeholders, but the pool count text must be 0 or "—"
  if (snapshot.poolCount && /[1-9]/.test(snapshot.poolCount)) {
    failures.push(`pool-count shows non-zero: "${snapshot.poolCount}"`);
  }

  // Sidebar should NOT have 3 demo workspaces (Untitled / Untitled 2 / Untitled 3)
  const demoSidebar = snapshot.sidebarItems.filter((it) => /Untitled 2|Untitled 3/.test(it.text));
  if (demoSidebar.length > 0) {
    failures.push(`Sidebar has demo workspaces: ${demoSidebar.map((d) => d.text).join(' · ')}`);
  }

  if (failures.length) {
    console.log('\n❌ Blank-app placeholders STILL VISIBLE:');
    for (const f of failures) console.log('    ' + f);
  } else {
    console.log('\n✓ All fields blank — no placeholder leakage');
  }
  await page.screenshot({ path: `${SHOT_DIR}/02-final.png`, fullPage: true });
  expect(failures, `Blank app has ${failures.length} placeholder leak(s)`).toHaveLength(0);
  expect(errors, 'no JS errors on cold start').toHaveLength(0);

  // ── Part 2: import IR → blank state flips to real numbers ──
  const desktopIR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;
  await page.locator('#ws-newgame-btn').click();
  await page.waitForSelector('#new-game-modal:not([hidden])', { timeout: 5_000 });
  await page.locator('label:has(input[value="gdd-math"])').click();
  await page.locator('#ng-cancel').click({ timeout: 2_000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('#gdd-file-input').setInputFiles(desktopIR);
  await page.waitForTimeout(2_500);
  const reviewVisible = await page.locator('#gdd-review').isVisible({ timeout: 1_000 }).catch(() => false);
  if (reviewVisible) {
    await page.locator('#gdd-generate').click().catch(() => {});
    await page.waitForTimeout(1_500);
  }
  // Click Compute so refreshL1 picks up the rtp_allocation values
  await page.locator('#btn-compute').click({ force: true }).catch(() => {});
  await page.waitForTimeout(700);

  const afterImport = await page.evaluate(() => {
    const txt = (sel: string) => (document.querySelector(sel)?.textContent || '').trim();
    return {
      rtp: txt('#l1-rtp'),
      hit: txt('#l1-hit'),
      sigma: txt('#l1-sigma'),
      p99: txt('#l1-p99'),
    };
  });
  console.log('\n  After IR import + Compute:');
  console.log(`    RTP   ${afterImport.rtp}`);
  console.log(`    Hit   ${afterImport.hit}`);
  console.log(`    σ     ${afterImport.sigma}`);
  console.log(`    P99   ${afterImport.p99}`);

  // After import, none of these should be em-dashes — real numbers must appear
  expect(afterImport.rtp).not.toMatch(/^—/);
  expect(afterImport.hit).not.toMatch(/^—/);
  expect(afterImport.sigma).not.toMatch(/^—/);
  expect(afterImport.p99).not.toMatch(/^—/);
  console.log('✓ Import flips placeholders → real metrics');
  await page.screenshot({ path: `${SHOT_DIR}/03-after-import.png`, fullPage: true });
});
