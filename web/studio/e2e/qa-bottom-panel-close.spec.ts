// Repro: Bottom panel (Activity / MC progress / CI gates) X close + tabs.
// User reports X does not close and tabs always stay on Activity.

import { test, expect } from '@playwright/test';

test('Bottom panel — X closes drawer, tabs switch correctly', async ({ page }) => {
  test.setTimeout(30_000);

  const consoleLines: string[] = [];
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

  await page.goto('/');
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Open the bottom panel via the header toggle (or ⌘J fallback).
  const headerToggle = page.locator('#btn-toggle-panel');
  if (await headerToggle.count() > 0) {
    await headerToggle.click({ force: true });
  } else {
    await page.keyboard.press('Meta+J');
  }
  await page.waitForTimeout(200);

  const panel = page.locator('#bottom-panel');
  await expect(panel).toBeVisible();
  console.log('✓ Panel opened');

  // Tab switching diagnostic
  const tabMc = page.locator('.bp-tab[data-bp="mc"]');
  const tabCi = page.locator('.bp-tab[data-bp="ci"]');
  const tabActivity = page.locator('.bp-tab[data-bp="activity"]');

  await tabMc.click({ force: true });
  await page.waitForTimeout(150);
  const mcPaneVisible = await page.locator('#bp-pane-mc').isVisible();
  console.log(`After click MC tab → MC pane visible: ${mcPaneVisible}`);
  const tabMcActive = await tabMc.evaluate((el) => el.classList.contains('is-active'));
  console.log(`MC tab is-active: ${tabMcActive}`);

  await tabCi.click({ force: true });
  await page.waitForTimeout(150);
  const ciPaneVisible = await page.locator('#bp-pane-ci').isVisible();
  console.log(`After click CI tab → CI pane visible: ${ciPaneVisible}`);

  await tabActivity.click({ force: true });
  await page.waitForTimeout(150);

  // X close diagnostic
  const closeBtn = page.locator('#bp-close');
  await expect(closeBtn).toBeVisible();
  const closeBox = await closeBtn.boundingBox();
  console.log(`X button bbox: ${JSON.stringify(closeBox)}`);

  // Check if anything is overlapping the close button at its center
  if (closeBox) {
    const cx = closeBox.x + closeBox.width / 2;
    const cy = closeBox.y + closeBox.height / 2;
    const topMostId = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x as number, y as number);
      return el ? `${el.tagName}#${el.id}.${el.className}` : 'null';
    }, [cx, cy]);
    console.log(`Element at X center (${cx},${cy}): ${topMostId}`);
  }

  // No force — same way user clicks. If something covers the X, this errors with intercept.
  let interceptError: string | null = null;
  try {
    await closeBtn.click({ timeout: 3_000 });
  } catch (err: any) {
    interceptError = err?.message || String(err);
  }
  if (interceptError) console.log(`Real-click error: ${interceptError.slice(0, 300)}`);
  await page.waitForTimeout(300);

  const panelHiddenAfterClose = await panel.evaluate((el) => el.hasAttribute('hidden'));
  console.log(`Panel hidden after X click: ${panelHiddenAfterClose}`);

  console.log('\n--- Console logs ---');
  consoleLines.slice(-25).forEach((l) => console.log(l));

  expect(mcPaneVisible, 'MC pane should be visible after MC tab click').toBe(true);
  expect(panelHiddenAfterClose, 'Panel should be hidden after X click').toBe(true);
});
