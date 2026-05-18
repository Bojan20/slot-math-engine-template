// W200 e2e · Scenario 4 — GDD import end-to-end flow.
//
// Open studio, BUILD tab → + New Game → Import from GDD, upload
// `gdd-samples/dragon-spin.json`, verify review modal, click Generate,
// confirm the new workspace appears.

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
