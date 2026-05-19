// QA: Bottom panel (Activity / MC progress / CI gates drawer) — must be
// toggle-able from THREE places (header button, in-panel X, ⌘J shortcut)
// and its open/closed state must survive a page reload.
//
// Run:  npx playwright test web/studio/e2e/qa-bottom-panel-toggle.spec.ts --reporter=list

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-bottom-panel-toggle');
mkdirSync(SHOT_DIR, { recursive: true });

let stepCounter = 0;
async function shot(page: any, label: string) {
  stepCounter++;
  const fname = `${String(stepCounter).padStart(2, '0')}-${label.replace(/\W+/g, '-')}.png`;
  await page.screenshot({ path: `${SHOT_DIR}/${fname}`, fullPage: true });
  console.log(`  📸 ${fname}`);
}

test('Bottom panel toggle: header button + X + ⌘J + persistence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`PAGE-ERR: ${e.message}`));

  // Clean persisted state from previous runs
  await page.goto('/');
  await page.evaluate(() => { try { localStorage.removeItem('studio.bottomPanel.open.v1'); } catch (_) {} });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await shot(page, 'initial');

  const headerBtn = page.locator('#btn-toggle-panel');
  const panel = page.locator('#bottom-panel');
  const closeX = page.locator('#bp-close');

  // ── 1. Initial state: panel closed, header button NOT active ──
  await expect(headerBtn).toHaveCount(1);
  await expect(panel).toHaveAttribute('hidden', '');
  await expect(headerBtn).toHaveAttribute('aria-pressed', 'false');
  console.log('✓ Initial: panel hidden, header button inactive');

  // ── 2. Click header button → panel opens, button active ──
  await headerBtn.click();
  await expect(panel).not.toHaveAttribute('hidden', '');
  await expect(headerBtn).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'opened-via-header');
  console.log('✓ Header click → panel opens');

  // Verify the 3 internal tabs are present
  const tabs = await page.locator('.bp-tab').count();
  expect(tabs).toBe(3); // Activity / MC progress / CI gates
  console.log(`✓ Panel has ${tabs} internal tabs`);

  // ── 3. Click X close button inside panel → panel closes ──
  await closeX.click();
  await expect(panel).toHaveAttribute('hidden', '');
  await expect(headerBtn).toHaveAttribute('aria-pressed', 'false');
  await shot(page, 'closed-via-x');
  console.log('✓ X click → panel closes, header button syncs to inactive');

  // ── 4. ⌘J shortcut opens, then closes ──
  await page.keyboard.press('Meta+j');
  await expect(panel).not.toHaveAttribute('hidden', '');
  await expect(headerBtn).toHaveAttribute('aria-pressed', 'true');
  console.log('✓ ⌘J open → panel opens, button syncs');

  await page.keyboard.press('Meta+j');
  await expect(panel).toHaveAttribute('hidden', '');
  console.log('✓ ⌘J close → panel closes');

  // ── 5. Persistence across reload ──
  await headerBtn.click(); // open
  await expect(panel).not.toHaveAttribute('hidden', '');
  const stored = await page.evaluate(() => localStorage.getItem('studio.bottomPanel.open.v1'));
  expect(stored).toBe('1');
  console.log(`✓ localStorage value: ${stored}`);

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#bottom-panel')).not.toHaveAttribute('hidden', '');
  await expect(page.locator('#btn-toggle-panel')).toHaveAttribute('aria-pressed', 'true');
  console.log('✓ Open state persisted across reload');
  await shot(page, 'after-reload-open');

  // Cleanup — close it before leaving
  await page.locator('#btn-toggle-panel').click();
  await expect(page.locator('#bottom-panel')).toHaveAttribute('hidden', '');
  const storedAfterClose = await page.evaluate(() => localStorage.getItem('studio.bottomPanel.open.v1'));
  expect(storedAfterClose).toBe('0');
  console.log('✓ Closed state persisted (value: 0)');

  // ── 6. Confirm no JS errors ──
  expect(errors, 'no page errors').toHaveLength(0);
  console.log(`\n📁 Screenshots → ${SHOT_DIR}`);
});
