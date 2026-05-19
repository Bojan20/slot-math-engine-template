// QA: Left/right/bottom panel toggles must collapse zones, persist state
// across reloads, and respond to keyboard shortcuts (⌘[, ⌘], ⌘\).
//
// Run:  npx playwright test web/studio/e2e/qa-layout-toggles.spec.ts --reporter=list

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-layout-toggles');
mkdirSync(SHOT_DIR, { recursive: true });

let stepCounter = 0;
async function shot(page: any, label: string) {
  stepCounter++;
  const fname = `${String(stepCounter).padStart(2, '0')}-${label.replace(/\W+/g, '-')}.png`;
  await page.screenshot({ path: `${SHOT_DIR}/${fname}`, fullPage: true });
  console.log(`  📸 ${fname}`);
}

test.describe('Layout toggles — left / right / bottom panels', () => {
  test('button + keyboard toggles collapse and restore each zone', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`PAGE-ERR: ${err.message}`));

    // Clear any persisted layout state from prior runs (one-time, before
    // we start exercising the toggles).  Doing this via addInitScript would
    // also clear on subsequent reloads which is the opposite of what we
    // want for the persistence check.
    await page.goto('/');
    await page.evaluate(() => {
      try { localStorage.removeItem('studio.layout.collapsed.v1'); } catch (_) {}
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await shot(page, 'initial');

    // ── Verify the three toggle buttons exist and are active by default ──
    const btnLeft   = page.locator('#btn-toggle-left');
    const btnRight  = page.locator('#btn-toggle-right');
    const btnStatus = page.locator('#btn-toggle-status');
    await expect(btnLeft).toHaveCount(1);
    await expect(btnRight).toHaveCount(1);
    await expect(btnStatus).toHaveCount(1);
    await expect(btnLeft).toHaveAttribute('aria-pressed', 'true');
    await expect(btnRight).toHaveAttribute('aria-pressed', 'true');
    await expect(btnStatus).toHaveAttribute('aria-pressed', 'true');
    console.log('✓ All 3 layout toggle buttons present + active');

    // ── Initial layout: shell should NOT have collapse classes ──
    const shell = page.locator('.shell');
    await expect(shell).not.toHaveClass(/is-left-collapsed/);
    await expect(shell).not.toHaveClass(/is-right-collapsed/);
    await expect(shell).not.toHaveClass(/is-bottom-collapsed/);

    // Sidebar + rail + status all visible (non-zero width / displayed)
    const sidebar = page.locator('.sidebar').first();
    const rail = page.locator('.rail').first();
    const status = page.locator('.row-status').first();
    const sidebarBox0 = await sidebar.boundingBox();
    const railBox0 = await rail.boundingBox();
    const statusBox0 = await status.boundingBox();
    expect(sidebarBox0?.width ?? 0, 'sidebar visible initially').toBeGreaterThan(50);
    expect(railBox0?.width ?? 0,    'rail visible initially').toBeGreaterThan(50);
    expect(statusBox0?.height ?? 0, 'status visible initially').toBeGreaterThan(10);
    console.log(`✓ Initial widths: sidebar=${sidebarBox0?.width} rail=${railBox0?.width} status-h=${statusBox0?.height}`);

    // ── Toggle LEFT off ──
    await btnLeft.click();
    await page.waitForTimeout(300);
    await expect(shell).toHaveClass(/is-left-collapsed/);
    await expect(btnLeft).toHaveAttribute('aria-pressed', 'false');
    const sidebarVisible1 = await sidebar.isVisible();
    expect(sidebarVisible1, 'sidebar hidden').toBe(false);
    console.log(`✓ Left collapsed · sidebar visible=${sidebarVisible1}`);
    await shot(page, 'left-collapsed');

    // ── Toggle RIGHT off ──
    await btnRight.click();
    await page.waitForTimeout(300);
    await expect(shell).toHaveClass(/is-right-collapsed/);
    await expect(btnRight).toHaveAttribute('aria-pressed', 'false');
    const railVisible1 = await rail.isVisible();
    expect(railVisible1, 'rail hidden').toBe(false);
    console.log(`✓ Right collapsed · rail visible=${railVisible1}`);
    await shot(page, 'left-right-collapsed');

    // ── Toggle STATUS off ──
    await btnStatus.click();
    await page.waitForTimeout(300);
    await expect(shell).toHaveClass(/is-bottom-collapsed/);
    await expect(btnStatus).toHaveAttribute('aria-pressed', 'false');
    const statusVisible = await status.isVisible();
    expect(statusVisible, 'status hidden').toBe(false);
    console.log(`✓ Status collapsed · visible=${statusVisible}`);
    await shot(page, 'all-collapsed');

    // ── Restore all via button clicks ──
    await btnLeft.click();
    await btnRight.click();
    await btnStatus.click();
    await page.waitForTimeout(300);
    await expect(shell).not.toHaveClass(/is-left-collapsed/);
    await expect(shell).not.toHaveClass(/is-right-collapsed/);
    await expect(shell).not.toHaveClass(/is-bottom-collapsed/);
    const sidebarBox2 = await sidebar.boundingBox();
    const railBox2 = await rail.boundingBox();
    expect(sidebarBox2?.width ?? 0, 'sidebar restored').toBeGreaterThan(50);
    expect(railBox2?.width ?? 0,    'rail restored').toBeGreaterThan(50);
    console.log('✓ All zones restored via buttons');
    await shot(page, 'all-restored');

    // ── Keyboard shortcut: ⌘[ collapses left ──
    await page.keyboard.press('Meta+[');
    await page.waitForTimeout(200);
    await expect(shell).toHaveClass(/is-left-collapsed/);
    await page.keyboard.press('Meta+[');
    await page.waitForTimeout(200);
    await expect(shell).not.toHaveClass(/is-left-collapsed/);
    console.log('✓ ⌘[ toggles left zone');

    // ── Keyboard shortcut: ⌘] collapses right ──
    await page.keyboard.press('Meta+]');
    await page.waitForTimeout(200);
    await expect(shell).toHaveClass(/is-right-collapsed/);
    await page.keyboard.press('Meta+]');
    await page.waitForTimeout(200);
    await expect(shell).not.toHaveClass(/is-right-collapsed/);
    console.log('✓ ⌘] toggles right zone');

    // ── Keyboard shortcut: ⌘\ collapses status ──
    await page.keyboard.press('Meta+\\');
    await page.waitForTimeout(200);
    await expect(shell).toHaveClass(/is-bottom-collapsed/);
    await page.keyboard.press('Meta+\\');
    await page.waitForTimeout(200);
    await expect(shell).not.toHaveClass(/is-bottom-collapsed/);
    console.log('✓ ⌘\\ toggles status zone');

    // ── Persistence: collapse left, reload, verify still collapsed ──
    await btnLeft.click();
    await page.waitForTimeout(200);
    await expect(shell).toHaveClass(/is-left-collapsed/);
    const stored = await page.evaluate(() => localStorage.getItem('studio.layout.collapsed.v1'));
    expect(stored, 'localStorage persisted').toBeTruthy();
    console.log(`✓ localStorage value: ${stored}`);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.shell')).toHaveClass(/is-left-collapsed/);
    await expect(page.locator('#btn-toggle-left')).toHaveAttribute('aria-pressed', 'false');
    console.log('✓ Left collapse persisted across reload');
    await shot(page, 'after-reload');

    // Cleanup — restore left so subsequent test runs start clean
    await page.locator('#btn-toggle-left').click();

    if (errors.length) {
      console.log(`\n⚠ ${errors.length} page errors:`);
      for (const e of errors) console.log('    ' + e);
    }
    expect(errors, 'no JS page errors').toHaveLength(0);

    console.log(`\n📁 Screenshots → ${SHOT_DIR}`);
  });
});
