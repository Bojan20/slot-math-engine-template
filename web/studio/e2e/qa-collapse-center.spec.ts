// QA: Center panel (active tab content) must REMAIN visible no matter
// which side panels are collapsed.  Bug: previously, `display: none` on
// .sidebar caused grid auto-placement to shift `.row-main > main` one
// column left into the 0-width sidebar slot, making the center disappear.
//
// Run:  npx playwright test web/studio/e2e/qa-collapse-center.spec.ts --reporter=list

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-collapse-center');
mkdirSync(SHOT_DIR, { recursive: true });

async function readLayout(page: any) {
  return page.evaluate(() => {
    const sidebar = document.querySelector('.row-main > .sidebar') as HTMLElement | null;
    const main    = document.querySelector('.row-main > main') as HTMLElement | null;
    const rail    = document.querySelector('.row-main > .rail') as HTMLElement | null;
    const box = (el: HTMLElement | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height),
        col: cs.gridColumn,
        visibility: cs.visibility,
        display: cs.display,
      };
    };
    return { sidebar: box(sidebar), main: box(main), rail: box(rail) };
  });
}

test.describe('Collapse: center panel never disappears', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { try { localStorage.removeItem('studio.layout.collapsed.v1'); } catch (_) {} });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(200);
  });

  test('all 4 collapse combinations keep main panel wide + visible', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`PAGE-ERR: ${e.message}`));

    // ── Baseline: nothing collapsed ──
    let layout = await readLayout(page);
    console.log(`  baseline    sidebar=${layout.sidebar?.w}px main=${layout.main?.w}px rail=${layout.rail?.w}px`);
    expect(layout.sidebar?.w ?? 0, 'sidebar visible').toBeGreaterThan(150);
    expect(layout.main?.w ?? 0,    'main visible').toBeGreaterThan(400);
    expect(layout.rail?.w ?? 0,    'rail visible').toBeGreaterThan(200);
    await page.screenshot({ path: `${SHOT_DIR}/01-baseline.png`, fullPage: true });

    // ── Collapse LEFT only ──
    await page.locator('#btn-toggle-left').click();
    await page.waitForTimeout(300);
    layout = await readLayout(page);
    console.log(`  left-off    sidebar=${layout.sidebar?.w}px main=${layout.main?.w}px rail=${layout.rail?.w}px`);
    expect(layout.main?.w ?? 0, 'main still wide after left collapse').toBeGreaterThan(600);
    expect(layout.rail?.w ?? 0, 'rail still visible after left collapse').toBeGreaterThan(200);
    await page.screenshot({ path: `${SHOT_DIR}/02-left-off.png`, fullPage: true });
    console.log('✓ Left off → main + rail visible');

    // ── Collapse RIGHT too (left + right off) ──
    await page.locator('#btn-toggle-right').click();
    await page.waitForTimeout(300);
    layout = await readLayout(page);
    console.log(`  left+right  sidebar=${layout.sidebar?.w}px main=${layout.main?.w}px rail=${layout.rail?.w}px`);
    expect(layout.main?.w ?? 0, 'main full width with both sides hidden').toBeGreaterThan(900);
    await page.screenshot({ path: `${SHOT_DIR}/03-left-and-right-off.png`, fullPage: true });
    console.log('✓ Left + right off → main occupies full width');

    // ── Re-open LEFT (only right off) ──
    await page.locator('#btn-toggle-left').click();
    await page.waitForTimeout(300);
    layout = await readLayout(page);
    console.log(`  right-off   sidebar=${layout.sidebar?.w}px main=${layout.main?.w}px rail=${layout.rail?.w}px`);
    expect(layout.sidebar?.w ?? 0, 'sidebar back').toBeGreaterThan(150);
    expect(layout.main?.w ?? 0,    'main still visible after right collapse').toBeGreaterThan(600);
    await page.screenshot({ path: `${SHOT_DIR}/04-right-off.png`, fullPage: true });
    console.log('✓ Right off → sidebar + main visible');

    // ── Re-open RIGHT (back to baseline) ──
    await page.locator('#btn-toggle-right').click();
    await page.waitForTimeout(300);
    layout = await readLayout(page);
    console.log(`  restored    sidebar=${layout.sidebar?.w}px main=${layout.main?.w}px rail=${layout.rail?.w}px`);
    expect(layout.sidebar?.w ?? 0).toBeGreaterThan(150);
    expect(layout.main?.w ?? 0).toBeGreaterThan(400);
    expect(layout.rail?.w ?? 0).toBeGreaterThan(200);
    console.log('✓ Restored: all three columns visible again');

    expect(errors, 'no JS errors during toggling').toHaveLength(0);
  });

  test('keyboard shortcuts (⌘[, ⌘]) preserve center panel', async ({ page }) => {
    await page.keyboard.press('Meta+[');
    await page.waitForTimeout(250);
    let layout = await readLayout(page);
    expect(layout.main?.w ?? 0).toBeGreaterThan(600);
    console.log(`✓ ⌘[ main=${layout.main?.w}px`);

    await page.keyboard.press('Meta+]');
    await page.waitForTimeout(250);
    layout = await readLayout(page);
    expect(layout.main?.w ?? 0).toBeGreaterThan(900);
    console.log(`✓ ⌘[ ⌘] (both off) main=${layout.main?.w}px`);

    await page.keyboard.press('Meta+[');
    await page.keyboard.press('Meta+]');
    await page.waitForTimeout(250);
    layout = await readLayout(page);
    expect(layout.sidebar?.w ?? 0).toBeGreaterThan(150);
    expect(layout.rail?.w ?? 0).toBeGreaterThan(200);
    console.log('✓ Restored via keyboard');
  });
});
