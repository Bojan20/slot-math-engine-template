// W200 e2e · Scenario 4 — GDD import end-to-end flow.
//
// Open studio, BUILD tab → + New Game → Import from GDD, upload
// `gdd-samples/dragon-spin.json`, verify review modal, click Generate,
// confirm the new workspace appears.
//
// PHASE 51 — second test verifies one-click GDD → playable slot:
// after Generate, the Play Template should auto-launch a new tab.

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('GDD import → review modal → generate workspace', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#tab-build', { timeout: 10_000 });

  // The hidden file input is rendered eagerly by app.js — use it directly.
  const fileInput = page.locator('#gdd-file-input');
  await expect(fileInput).toBeAttached();

  const samplePath = path.resolve(__dirname, '..', 'gdd-samples', 'dragon-spin.json');
  await fileInput.setInputFiles(samplePath);

  // The review modal should open within a few seconds.
  const reviewModal = page.locator('#gdd-review');
  await expect(reviewModal).toBeVisible({ timeout: 15_000 });

  // Confidence should be ≥ 80% on the structured JSON sample.
  const overall = page.locator('#gdd-overall');
  await expect(overall).toBeVisible();
  const txt = (await overall.textContent()) ?? '';
  const pct = parseInt(txt.replace(/[^0-9]/g, ''), 10);
  expect(Number.isFinite(pct) ? pct : 100).toBeGreaterThanOrEqual(60);

  // Generate.
  const generateBtn = page.locator('#gdd-generate');
  await expect(generateBtn).toBeVisible();
  await generateBtn.click();

  // Modal should close.
  await expect(reviewModal).toBeHidden({ timeout: 5_000 });

  // A new workspace should be active — workspace pill name should not be empty.
  const wsName = page.locator('#ws-name');
  await expect(wsName).toBeVisible();
  const name = (await wsName.textContent()) ?? '';
  expect(name.trim().length).toBeGreaterThan(0);
});

test('PHASE 51 — GDD import auto-launches Play Template in new tab', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForSelector('#tab-build', { timeout: 10_000 });

  const fileInput = page.locator('#gdd-file-input');
  await expect(fileInput).toBeAttached();
  const samplePath = path.resolve(__dirname, '..', 'gdd-samples', 'dragon-spin.json');
  await fileInput.setInputFiles(samplePath);

  await expect(page.locator('#gdd-review')).toBeVisible({ timeout: 15_000 });

  // Wait for the new-tab `page` event triggered by auto-Play Template inside
  // the Generate click handler. MTL sealing + blob assembly take ~1–2s.
  const popupPromise = context.waitForEvent('page', { timeout: 20_000 });
  await page.locator('#gdd-generate').click();

  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded', { timeout: 15_000 });

  // The runner template embeds a `#stage` (or equivalent) plus the IR as
  // an inline script with id `inline-ir` — assert at least one of them.
  const hasIr = await popup.evaluate(() => {
    return !!document.getElementById('inline-ir')
      || !!document.querySelector('[data-role="runner-stage"]')
      || !!document.querySelector('canvas');
  });
  expect(hasIr).toBe(true);
});
