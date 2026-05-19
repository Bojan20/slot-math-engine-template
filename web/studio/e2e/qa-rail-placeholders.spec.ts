// QA: Rail-side metric cards must show em-dashes on cold start (NOT
// fake percentages like 78%/14%/6%/2% or ±0.42pp), and flip to real
// numbers only after an IR with rtp_breakdown is imported.

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP_IR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-rail-placeholders');
mkdirSync(SHOT_DIR, { recursive: true });

test('Rail cards: cold start has em-dashes, post-import has real numbers', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (_) {}
    try { indexedDB.deleteDatabase('studio-automc'); } catch (_) {}
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT_DIR}/01-blank.png`, fullPage: true });

  // ── Cold start: variance decomposition + sensitivity preview show "—" ──
  const cold = await page.evaluate(() => {
    const vdValues = Array.from(document.querySelectorAll('#vdecomp-legend li b')).map((el) => (el.textContent || '').trim());
    const sensValues = Array.from(document.querySelectorAll('#sens-preview li b')).map((el) => (el.textContent || '').trim());
    const vdSegs = document.querySelectorAll('#vdecomp-bar .vd-seg').length;
    return { vdValues, sensValues, vdSegs };
  });
  console.log(`  cold: vdecomp legend = ${cold.vdValues.join(' / ')}`);
  console.log(`  cold: sens preview   = ${cold.sensValues.join(' / ')}`);
  console.log(`  cold: vd bar segs    = ${cold.vdSegs}`);

  // Every legend value should be "—" (no fake "78%" etc.)
  for (const v of cold.vdValues) expect(v, `vdecomp value`).toBe('—');
  for (const v of cold.sensValues) expect(v, `sens value`).toBe('—');
  expect(cold.vdSegs, 'vd bar segments').toBe(0);
  console.log('✓ Cold start: variance + sensitivity rails are dash-only');

  // ── Post-import: variance fills from validatedMetrics.rtp_breakdown ──
  if (!existsSync(DESKTOP_IR)) {
    console.log('  (no Desktop IR fixture, skipping post-import check)');
    return;
  }
  await page.locator('#ws-newgame-btn').click({ force: true });
  await page.waitForSelector('#new-game-modal:not([hidden])', { timeout: 5_000 });
  await page.locator('label:has(input[value="gdd-math"])').click();
  await page.locator('#ng-cancel').click({ timeout: 2_000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('#gdd-file-input').setInputFiles(DESKTOP_IR);
  await page.waitForTimeout(2_500);
  await page.evaluate(() => {
    document.querySelectorAll('.modal-base, .modal-backdrop').forEach((el) => {
      (el as HTMLElement).setAttribute('hidden', '');
    });
  });
  await page.locator('#btn-compute').click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT_DIR}/02-after-import.png`, fullPage: true });

  const after = await page.evaluate(() => {
    const vdValues = Array.from(document.querySelectorAll('#vdecomp-legend li b')).map((el) => (el.textContent || '').trim());
    const vdSegs = document.querySelectorAll('#vdecomp-bar .vd-seg').length;
    return { vdValues, vdSegs };
  });
  console.log(`  after: vdecomp legend = ${after.vdValues.join(' / ')}`);
  console.log(`  after: vd bar segs    = ${after.vdSegs}`);

  // After Wrath import + Compute, the bar should have ≥3 segments and
  // at least one legend value should be a percentage (not "—").
  expect(after.vdSegs, 'bar has segments after import').toBeGreaterThanOrEqual(3);
  const realValues = after.vdValues.filter((v) => /\d+\.\d+%/.test(v));
  expect(realValues.length, 'legend has real percent values').toBeGreaterThan(0);
  console.log('✓ Post-import: variance decomp populated from rtp_breakdown');
});
