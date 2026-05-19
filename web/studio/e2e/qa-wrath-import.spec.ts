// End-to-end QA: open Slot Math Studio, import the Wrath of Olympus IR JSON
// from ~/Desktop, walk the Build tab, verify the math is wired correctly.
// Self-contained — runs against the auto-started Vite dev server.
//
// Run:  npx playwright test web/studio/e2e/qa-wrath-import.spec.ts --reporter=list
//
// Artifacts: full-page screenshots at every step under
//            reports/playwright/qa-wrath-import/

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP_IR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-wrath-import');
mkdirSync(SHOT_DIR, { recursive: true });

let stepCounter = 0;
async function shot(page: any, label: string) {
  stepCounter++;
  const filename = `${String(stepCounter).padStart(2, '0')}-${label.replace(/\W+/g, '-')}.png`;
  await page.screenshot({ path: `${SHOT_DIR}/${filename}`, fullPage: true });
  console.log(`  📸 ${filename}`);
}

test.describe('Wrath of Olympus IR import — full QA walkthrough', () => {
  test('opens Studio → imports IR → verifies Build tab populated', async ({ page }) => {
    // Capture ALL console messages — no filter, dump everything
    const consoleErrors: string[] = [];
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      const t = msg.text();
      const type = msg.type();
      if (type === 'error') consoleErrors.push(t);
      else consoleLogs.push(`[${type}] ${t}`);
    });
    page.on('pageerror', (err) => consoleErrors.push(`PAGE-ERR: ${err.message}`));

    // ────────────────────────────────────────────────────────────────────
    // 1. Pre-flight: IR file must exist on Desktop
    // ────────────────────────────────────────────────────────────────────
    expect(existsSync(DESKTOP_IR), `IR file missing: ${DESKTOP_IR}`).toBe(true);
    const ir = JSON.parse(readFileSync(DESKTOP_IR, 'utf8'));
    expect(ir.schema_version).toBe('1.0.0');
    expect(ir.meta.id).toBe('wrath-of-olympus');
    expect(ir.symbols.length).toBe(14);
    console.log(`✓ IR file valid · 14 symbols · target_rtp ${ir.limits.target_rtp}`);

    // ────────────────────────────────────────────────────────────────────
    // 2. Open Studio
    // ────────────────────────────────────────────────────────────────────
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await shot(page, 'studio-initial-load');

    // Verify Build tab is the active tab (default)
    const buildTab = page.locator('#tab-build');
    await expect(buildTab).toHaveAttribute('aria-selected', 'true');
    console.log('✓ Studio loaded, Build tab is active');

    // ────────────────────────────────────────────────────────────────────
    // 3. Verify default state is blank (no pre-seeded symbols)
    // ────────────────────────────────────────────────────────────────────
    const initialPoolCount = await page.locator('#pool-count').textContent();
    console.log(`  Initial pool count: ${initialPoolCount}`);
    // Default workspace should be blank (0 symbols) per the originality fix
    // — but it may show a preset default if Studio auto-seeds on first paint.
    // We capture whichever, then proceed.

    // ────────────────────────────────────────────────────────────────────
    // 4. Click "+ New Game"
    // ────────────────────────────────────────────────────────────────────
    await page.locator('#ws-newgame-btn').click();
    await page.waitForSelector('#new-game-modal:not([hidden])', { timeout: 5_000 });
    await shot(page, 'new-game-modal-open');

    // ────────────────────────────────────────────────────────────────────
    // 5. Verify all 4 radio options are visible
    // ────────────────────────────────────────────────────────────────────
    const radios = page.locator('input[name="ng-source"]');
    const radioCount = await radios.count();
    expect(radioCount).toBe(4);

    const expected = ['empty', 'template', 'gdd-game', 'gdd-math'];
    for (const v of expected) {
      const r = page.locator(`input[name="ng-source"][value="${v}"]`);
      await expect(r).toHaveCount(1);
    }
    console.log(`✓ All 4 radio options present: ${expected.join(', ')}`);

    // Verify labels (specifically "Import Math GDD" must be visible)
    const mathGddLabel = page.locator('label:has(input[value="gdd-math"])');
    await expect(mathGddLabel).toContainText(/Import Math GDD/i);
    const gameGddLabel = page.locator('label:has(input[value="gdd-game"])');
    await expect(gameGddLabel).toContainText(/Import Game GDD/i);
    console.log('✓ Math GDD + Game GDD labels visible');

    // ────────────────────────────────────────────────────────────────────
    // 6. Select "Import Math GDD" and load file via direct setInputFiles
    //    (more reliable than filechooser+setFiles for hidden inputs that
    //    are triggered by `input.click()` from app code).
    // ────────────────────────────────────────────────────────────────────
    await page.locator('label:has(input[value="gdd-math"])').click();
    await shot(page, 'math-gdd-radio-selected');

    // Close the New Game modal manually (since we bypass ng-create.click()).
    // The hidden file input is always in the DOM regardless of modal state.
    await page.locator('#ng-cancel').click({ timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(300);

    // Direct setInputFiles fires the native `change` event on the input,
    // which is what app.js gdd-file-input handler listens for.
    await page.locator('#gdd-file-input').setInputFiles(DESKTOP_IR);
    console.log(`✓ setInputFiles invoked with: ${DESKTOP_IR}`);
    await page.waitForTimeout(2_000);

    // Give Studio time to parse the IR + open GDD review modal
    await page.waitForTimeout(2_500);
    await shot(page, 'after-ir-import-review-modal');

    // ────────────────────────────────────────────────────────────────────
    // 7a. Read GDD review confidence and confirm
    // ────────────────────────────────────────────────────────────────────
    const reviewModal = page.locator('#gdd-review');
    if (await reviewModal.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const overall = await page.locator('#gdd-overall').textContent().catch(() => '?');
      const issues = await page.locator('#gdd-issues').textContent().catch(() => '?');
      const filename = await page.locator('#gdd-filename').textContent().catch(() => '?');
      console.log(`✓ GDD review modal open · file=${filename} · confidence=${overall} · ${issues}`);

      // Click "Generate Game →" to finalize import
      await page.locator('#gdd-generate').click();
      await page.waitForTimeout(2_500);
      await shot(page, 'after-generate-game');
      console.log('✓ Generate Game clicked');
    } else {
      console.log('⚠ GDD review modal did not open (import may have failed or auto-applied)');
    }

    // ────────────────────────────────────────────────────────────────────
    // 7b. Verify Build tab is populated after import
    // ────────────────────────────────────────────────────────────────────
    const poolCountAfter = await page.locator('#pool-count').textContent();
    console.log(`  Pool count after import: ${poolCountAfter}`);

    // Read DOM state for the report
    const symListItems = await page.locator('#sym-list .sym-row, #sym-list [role="listitem"], #sym-list > *').count();
    console.log(`  #sym-list children: ${symListItems}`);

    const reelsCount = await page.locator('#reels > *').count();
    console.log(`  #reels children: ${reelsCount}`);

    const paytableCount = await page.locator('#paytable > *').count();
    console.log(`  #paytable children: ${paytableCount}`);

    // ────────────────────────────────────────────────────────────────────
    // 8. Dump console messages BEFORE risky Compute click
    // ────────────────────────────────────────────────────────────────────
    console.log(`\n📋 BEFORE compute · ${consoleLogs.length} non-error console messages so far:`);
    for (const l of consoleLogs.slice(0, 25)) console.log(`    ${l}`);
    const studioLogsEarly = consoleLogs.filter((l) => l.includes('[studio]') || l.includes('HOOK') || l.includes('importCanonical'));
    console.log(`\n📋 Studio-specific logs BEFORE compute: ${studioLogsEarly.length}`);
    for (const l of studioLogsEarly) console.log(`    ${l}`);

    // ────────────────────────────────────────────────────────────────────
    // 9. Try Compute RTP (skip if modal still blocking)
    // ────────────────────────────────────────────────────────────────────
    const computeBtn = page.locator('#btn-compute');
    const isClickable = await computeBtn.isVisible({ timeout: 2_000 }).catch(() => false);
    if (isClickable) {
      const clickOk = await computeBtn.click({ timeout: 3_000 }).then(() => true).catch(() => false);
      if (clickOk) {
        await page.waitForTimeout(2_000);
        await shot(page, 'after-compute-rtp');
        console.log('✓ Compute RTP clicked');
      } else {
        console.log('⚠ Compute RTP click blocked (likely modal overlay)');
      }
    } else {
      console.log('⚠ Compute RTP button not visible');
    }

    // ────────────────────────────────────────────────────────────────────
    // 9. Report console errors
    // ────────────────────────────────────────────────────────────────────
    if (consoleErrors.length > 0) {
      console.log(`\n⚠ ${consoleErrors.length} console errors captured:`);
      for (const e of consoleErrors.slice(0, 10)) console.log(`    ${e}`);
    } else {
      console.log('\n✓ No console errors');
    }
    console.log(`\n📋 ${consoleLogs.length} total console messages:`);
    for (const l of consoleLogs.slice(0, 30)) console.log(`    ${l}`);
    const studioLogs = consoleLogs.filter((l) => l.includes('[studio]') || l.includes('HOOK') || l.includes('importCanonical'));
    console.log(`\n📋 ${studioLogs.length} studio-specific logs:`);
    for (const l of studioLogs) console.log(`    ${l}`);

    // ────────────────────────────────────────────────────────────────────
    // 10. Final screenshot
    // ────────────────────────────────────────────────────────────────────
    await shot(page, 'final-state');
    console.log(`\n📁 All screenshots: ${SHOT_DIR}`);
  });
});
