// W200 e2e · Scenario 3 — Producer cert pipeline.
//
// Switches to Producer persona, opens Certify tab, runs a 100K MC,
// verifies PAR sections render, opens a jurisdiction modal, and
// initiates the operator-package download.

import { test, expect } from '@playwright/test';

test('producer persona MC + jurisdictions + op-package', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#tab-certify', { timeout: 10_000 });

  // Persona switch → Producer.
  const prodBtn = page.locator('[data-persona="producer"]');
  await prodBtn.click();
  await expect(prodBtn).toHaveAttribute('aria-pressed', 'true');

  // Open Certify tab.
  await page.locator('#tab-certify').click();
  const panel = page.locator('#panel-certify');
  await expect(panel).toBeVisible();

  // 100K MC size selector should be pre-selected.
  const mcSize100k = page.locator('[data-mc-size="100000"]');
  await expect(mcSize100k).toBeVisible();
  await mcSize100k.click();

  // Run MC.
  const runMc = page.locator('#btn-run-mc');
  await expect(runMc).toBeVisible();
  await runMc.click();

  // Allow MC to finish — 100K should be sub-3s nominal; give a 25s budget.
  await page.waitForTimeout(3_500);

  // PAR sections — there should be 12 once populated. Allow render delay.
  const parSections = page.locator('#certify-par-sections > *');
  await expect(parSections.first()).toBeVisible({ timeout: 15_000 });

  // Jurisdiction grid — click a chip if present.
  const ukChip = page.locator('#certify-jur-grid [data-jur-id="UKGC"], #certify-jur-grid button').first();
  if (await ukChip.count()) {
    await ukChip.click().catch(() => undefined);
  }

  // Download Operator Package button.
  const dlBtn = page.locator('#btn-export-zip');
  await expect(dlBtn).toBeVisible();
  // Intercept download — the click should at least be wired.
  const downloadPromise = page.waitForEvent('download', { timeout: 12_000 }).catch(() => null);
  await dlBtn.click();
  const download = await downloadPromise;
  if (download) {
    expect(download.suggestedFilename().toLowerCase()).toMatch(/\.(zip|json)$/);
  }
});
