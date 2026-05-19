// QA: Sensitivity tab `Run MC` button — should kick off the same auto-MC
// orchestrator and populate Hit / σ / P99 on the active variant.
//
// Run:  npx playwright test web/studio/e2e/qa-sensitivity-runmc.spec.ts --reporter=list

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-sensitivity-runmc');
mkdirSync(SHOT_DIR, { recursive: true });

test('Sensitivity tab `Run MC` triggers auto-MC orchestrator', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`PAGE-ERR: ${e.message}`));

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Clear MC cache
  await page.evaluate(async () => {
    const w = window as unknown as { __studio__?: { clearAutoMcCache?: () => Promise<void> } };
    if (w.__studio__?.clearAutoMcCache) await w.__studio__.clearAutoMcCache();
  });

  // Seed a minimal variant by clicking a preset (so the symbol pool is populated)
  await page.locator('.preset[data-preset="standard"]').click();
  await page.waitForTimeout(500);

  // Switch to Sensitivity tab
  await page.locator('#tab-sensitivity').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/01-sensitivity-tab.png`, fullPage: true });

  // Run MC button should be present
  const runMcBtn = page.locator('#sensitivity-run-mc');
  await expect(runMcBtn).toHaveCount(1);
  await expect(runMcBtn).toBeVisible();
  console.log('✓ Run MC button visible in Sensitivity toolbar');

  // Click it — auto-MC strip should appear
  await runMcBtn.click();
  const strip = page.locator('#row-automc');
  await expect(strip).not.toHaveAttribute('hidden', '', { timeout: 5_000 });
  console.log('✓ Auto-MC strip appeared after click');
  await page.screenshot({ path: `${SHOT_DIR}/02-running.png`, fullPage: true });

  // Wait for completion
  await expect(strip).toHaveAttribute('hidden', '', { timeout: 90_000 });
  console.log('✓ Auto-MC finished');
  await page.screenshot({ path: `${SHOT_DIR}/03-complete.png`, fullPage: true });

  // Verify variant got validated_metrics
  const vmSource = await page.evaluate(() => {
    const hook = (window as { __studio_ui_hook__?: { getActiveVariant(): { validatedMetrics?: { source: string } } } })
      .__studio_ui_hook__;
    return hook?.getActiveVariant()?.validatedMetrics?.source ?? null;
  });
  expect(vmSource, 'validatedMetrics.source should mention auto-MC').toMatch(/auto-MC/);
  console.log(`✓ Variant validatedMetrics.source: ${vmSource}`);

  expect(errors).toHaveLength(0);
});
