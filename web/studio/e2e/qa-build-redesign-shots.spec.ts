// QA visual: Build tab redesign — capture screenshots at 4 widths after
// importing the Wrath of Olympus IR.  Lives in e2e/ so playwright config
// picks it up.  Reads HOME-based IR file like qa-symbol-pool.spec.ts.
//
// Run:  npx playwright test web/studio/e2e/qa-build-redesign-shots.spec.ts --reporter=list
//
// Env: PHASE=before|after to namespace the outputs.

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHASE = (process.env.PHASE || 'before').replace(/\W+/g, '');
const SHOT_DIR = resolve(__dirname, `../../../reports/playwright/qa-build-redesign/${PHASE}`);
mkdirSync(SHOT_DIR, { recursive: true });

const DESKTOP_IR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;

const WIDTHS = [916, 1136, 1440, 1660];

test.describe(`Build redesign · capture · ${PHASE}`, () => {
  for (const w of WIDTHS) {
    test(`shot @ ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(200);

      // Bypass the desktop-only guard if it appears (it pops at <1024 wide).
      const dismiss = page.locator('#w200-mobile-guard-dismiss');
      if (await dismiss.isVisible().catch(() => false)) {
        await dismiss.click({ force: true }).catch(() => {});
        await page.waitForTimeout(200);
      }
      // Also force-hide the guard if its dismiss missed (DOM still has the
      // overlay).  This is purely for screenshot capture, not production.
      await page.evaluate(() => {
        const g = document.getElementById('w200-mobile-guard');
        if (g) g.style.display = 'none';
      });

      // Import Wrath of Olympus IR if available
      if (existsSync(DESKTOP_IR)) {
        try {
          await page.locator('#ws-newgame-btn').click({ timeout: 2000 });
          await page.waitForSelector('#new-game-modal:not([hidden])', { timeout: 4000 });
          await page.locator('label:has(input[value="gdd-math"])').click();
          await page.locator('#ng-cancel').click({ timeout: 1500 }).catch(() => {});
          await page.waitForTimeout(300);
          await page.locator('#gdd-file-input').setInputFiles(DESKTOP_IR);
          await page.waitForTimeout(2200);
          const reviewVisible = await page.locator('#gdd-review').isVisible({ timeout: 800 }).catch(() => false);
          if (reviewVisible) {
            await page.locator('#gdd-generate').click().catch(() => {});
            await page.waitForTimeout(1200);
          }
        } catch (_) { /* fall back to default state */ }
      }
      await page.waitForTimeout(400);

      const out = `${SHOT_DIR}/build-${w}px.png`;
      await page.screenshot({ path: out, fullPage: true });
      console.log(`  📸 ${out}`);

      // Verify no horizontal scrollbar on main column
      const overflow = await page.evaluate(() => {
        const main = document.querySelector('main#main') as HTMLElement | null;
        if (!main) return { scrollW: 0, clientW: 0 };
        return { scrollW: main.scrollWidth, clientW: main.clientWidth };
      });
      console.log(`  main scrollW=${overflow.scrollW} clientW=${overflow.clientW}`);
      expect(overflow.scrollW, `no horizontal overflow @${w}px`).toBeLessThanOrEqual(overflow.clientW + 1);
    });
  }
});
