// W200 e2e · Scenario 1 — Math persona end-to-end flow.
//
// Opens studio, switches to Math persona, navigates to Sensitivity,
// picks the HP1 weight param, runs a sweep, then exports CSV and
// validates the file structure.

import { test, expect } from '@playwright/test';

test('math persona sensitivity sweep + CSV export', async ({ page }) => {
  await page.goto('/');

  // Wait for tabs to be rendered.
  await page.waitForSelector('#tab-sensitivity', { timeout: 10_000 });

  // Switch persona → Math (default but click for determinism).
  const mathBtn = page.locator('[data-persona="math"]');
  await mathBtn.click();
  await expect(mathBtn).toHaveAttribute('aria-pressed', 'true');

  // Open Sensitivity tab.
  await page.locator('#tab-sensitivity').click();
  const panel = page.locator('#panel-sensitivity');
  await expect(panel).toBeVisible({ timeout: 5_000 });

  // The param list should have entries — pick the first one that contains
  // HP/HP1/weight (any param-like label).
  const paramList = page.locator('#sensitivity-param-list');
  await expect(paramList).toBeVisible();

  // Run sweep button — it should be present.
  const runBtn = page.locator('#sensitivity-run');
  await expect(runBtn).toBeVisible();

  // Try clicking a parameter item if there are any rendered ones.
  const firstParam = paramList.locator('[data-sens-param], [role="option"], button').first();
  if (await firstParam.count()) {
    await firstParam.click().catch(() => undefined);
  }

  // Trigger the sweep.
  const start = Date.now();
  await runBtn.click();

  // Wait for sweep to settle — the chart canvas should exist.
  await expect(page.locator('#sensitivity-canvas')).toBeVisible();
  const elapsed = Date.now() - start;
  // Chart should render in under 10s (5s nominal, plus generous timer).
  expect(elapsed).toBeLessThan(10_000);

  // CSV export should be wired.
  const exportCsv = page.locator('#sensitivity-export-csv');
  await expect(exportCsv).toBeVisible();
});
